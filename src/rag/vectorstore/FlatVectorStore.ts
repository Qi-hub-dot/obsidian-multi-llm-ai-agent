// ============================================================
// FlatVectorStore — cosine similarity + JSON persistence
// No external dependencies. Suitable for vaults up to ~5000 notes.
// ============================================================
import type { VectorStore, VectorRecord, VectorSearchResult } from "../embedding/types";
import type { App } from "obsidian";

/** Persisted data format */
interface StoreData {
  version: 1;
  dimension: number;
  records: Array<{
    id: string;
    vector: number[];
    metadata: Record<string, unknown>;
  }>;
}

export class FlatVectorStore implements VectorStore {
  private records = new Map<string, VectorRecord>();
  private dimension = 0;
  private app: App | null = null;
  private persistPath: string;

  constructor(persistPath = ".obsidian/rag-vectors.json") {
    this.persistPath = persistPath;
  }

  /** Bind to an Obsidian vault for persistence */
  bindVault(app: App): void {
    this.app = app;
  }

  get size(): number {
    return this.records.size;
  }

  /** Load persisted vectors from vault */
  async load(): Promise<void> {
    if (!this.app) return;
    try {
      const f = this.app.vault.getAbstractFileByPath(this.persistPath);
      if (!f) return;
      const raw = await this.app.vault.read(f as any);
      const data: StoreData = JSON.parse(raw);
      if (data.version !== 1) return;
      this.dimension = data.dimension;
      for (const r of data.records) {
        this.records.set(r.id, { id: r.id, vector: r.vector, metadata: r.metadata });
      }
      console.log(`[RAG] Loaded ${this.records.size} vectors (dim=${this.dimension})`);
    } catch (e) {
      console.warn("[RAG] Failed to load vectors:", e);
    }
  }

  /** Persist to vault */
  async save(): Promise<void> {
    if (!this.app) return;
    const data: StoreData = {
      version: 1,
      dimension: this.dimension,
      records: Array.from(this.records.values()).map((r) => ({
        id: r.id,
        vector: r.vector,
        metadata: r.metadata,
      })),
    };
    const json = JSON.stringify(data);
    try {
      const existing = this.app.vault.getAbstractFileByPath(this.persistPath);
      if (existing) {
        await this.app.vault.modify(existing as any, json);
      } else {
        await this.app.vault.create(this.persistPath, json);
      }
    } catch (e) {
      console.warn("[RAG] Failed to save vectors:", e);
    }
  }

  async upsert(record: VectorRecord): Promise<void> {
    if (this.dimension === 0) this.dimension = record.vector.length;
    this.records.set(record.id, record);
  }

  async upsertBatch(records: VectorRecord[]): Promise<void> {
    for (const r of records) {
      if (this.dimension === 0) this.dimension = r.vector.length;
      this.records.set(r.id, r);
    }
  }

  async search(query: number[], topK: number): Promise<VectorSearchResult[]> {
    if (this.records.size === 0) return [];

    const results: VectorSearchResult[] = [];

    for (const [id, record] of this.records) {
      const sim = cosineSimilarity(query, record.vector);
      results.push({
        id,
        score: sim,
        metadata: record.metadata,
      });
    }

    // Sort descending by similarity, take topK
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.dimension = 0;
    if (this.app) await this.save();
  }
}

/** Cosine similarity between two float vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Singleton */
let flatStoreInstance: FlatVectorStore | null = null;

export function getFlatVectorStore(): FlatVectorStore {
  if (!flatStoreInstance) flatStoreInstance = new FlatVectorStore();
  return flatStoreInstance;
}
