// ============================================================
// RAGManager — orchestrates embedding, vector store, hybrid search
// ============================================================
import type { App, TFile } from "obsidian";
import type DeepSeekPlugin from "../../main";
import { getApiEmbeddingProvider, ApiEmbeddingProvider } from "./embedding/ApiEmbeddingProvider";
import { getOnnxEmbeddingProvider, OnnxEmbeddingProvider } from "./embedding/OnnxEmbeddingProvider";
import { getFlatVectorStore, FlatVectorStore } from "./vectorstore/FlatVectorStore";
import { HybridSearcher, type HybridResult } from "./HybridSearcher";
import type { VaultSearchIndex } from "../search/vaultSearch";
import type { LLMProvider } from "../LLMProviders/chatModelManager";
import type { EmbeddingProvider } from "./embedding/types";

export type RagMode = "tfidf" | "semantic" | "hybrid";

export class RAGManager {
  private plugin: DeepSeekPlugin;
  private embeddingProvider!: EmbeddingProvider;
  private apiEmbedding: ApiEmbeddingProvider;
  private onnxEmbedding: OnnxEmbeddingProvider;
  private vectorStore: FlatVectorStore;
  private hybridSearcher: HybridSearcher | null = null;
  private initialized = false;
  private mode: RagMode = "hybrid";

  constructor(plugin: DeepSeekPlugin) {
    this.plugin = plugin;
    this.apiEmbedding = getApiEmbeddingProvider();
    this.onnxEmbedding = getOnnxEmbeddingProvider();
    this.vectorStore = getFlatVectorStore();
    this.vectorStore.bindVault(plugin.app);
  }

  /** Initialize: load vectors, configure embedding provider, build searcher */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load persisted vectors
    await this.vectorStore.load();

    // Configure embedding from available providers (API → ONNX → TF-IDF)
    await this.configureEmbedding();

    // Build hybrid searcher
    this.hybridSearcher = new HybridSearcher(
      this.plugin.searchIndex,
      this.embeddingProvider,
      this.vectorStore,
      {
        tfidfWeight: 0.3,
        topK: 5,
      },
    );

    this.initialized = true;
    console.log(
      `[RAG] Initialized (mode=${this.mode}, vectors=${this.vectorStore.size}, embedding=${this.embeddingProvider.isAvailable() ? "available" : "unavailable"})`,
    );

    // Auto-rebuild if embedding is available but index is empty
    if (this.embeddingProvider.isAvailable() && this.vectorStore.size === 0 && this.plugin.searchIndex.count > 0) {
      console.log("[RAG] Empty vector index — starting background rebuild...");
      this.rebuildIndex().catch((e) => console.warn("[RAG] Auto-rebuild failed:", e));
    }
  }

  /** Configure embedding provider with fallback chain: API → ONNX Local → TF-IDF */
  private async configureEmbedding(): Promise<void> {
    const providers = this.plugin.modelManager.getProviders();

    // Priority 1: API embedding (Qwen > GLM)
    for (const p of providers) {
      if (p === "qwen" || p === "glm") {
        const config = (this.plugin.modelManager as any).providers?.get(p);
        if (config && config.apiKey) {
          this.apiEmbedding.configure(config);
          this.embeddingProvider = this.apiEmbedding;
          console.log(`[RAG] Using ${p} API for embeddings (model: ${config.model})`);
          return;
        }
      }
    }

    // Priority 2: ONNX local embedding (fully offline)
    try {
      await this.onnxEmbedding.initialize();
      if (this.onnxEmbedding.isAvailable()) {
        this.embeddingProvider = this.onnxEmbedding;
        console.log("[RAG] Using ONNX local embedding (offline)");
        return;
      }
    } catch (e) {
      console.warn("[RAG] ONNX local embedding unavailable:", e);
    }

    // Priority 3: Pure TF-IDF (no embedding)
    this.mode = "tfidf";
    console.log("[RAG] No embedding provider available — using TF-IDF only");
  }

  /** Search vault with current mode */
  async search(query: string, topK = 5): Promise<HybridResult[]> {
    if (!this.initialized) await this.initialize();

    if (this.mode === "tfidf" || !this.hybridSearcher) {
      // Pure TF-IDF fallback
      const results = this.plugin.searchIndex.search(query, topK);
      return results.map((r) => ({
        path: r.path,
        title: r.title,
        snippet: r.snippet,
        score: r.score,
        breakdown: { tfidf: r.score, semantic: 0, fused: r.score },
      }));
    }

    // Hybrid search
    return this.hybridSearcher.search(query);
  }

  /** Index a single note (called on file create/modify) */
  async indexNote(file: TFile): Promise<void> {
    if (!this.embeddingProvider.isAvailable()) return;
    if (file.extension !== "md") return;

    try {
      const content = await this.plugin.app.vault.read(file);
      if (content.length < 50) return; // Skip very short notes

      const text = file.basename + " " + content.slice(0, 2000);
      const vector = await this.embeddingProvider.embed(text);

      await this.vectorStore.upsert({
        id: file.path,
        vector,
        metadata: { title: file.basename, path: file.path, indexedAt: Date.now() },
      });
    } catch (e) {
      // Silently skip — will retry on next index
    }
  }

  /** Remove a note from the index */
  async unindexNote(path: string): Promise<void> {
    await this.vectorStore.remove(path);
  }

  /** Rebuild the entire vector index */
  async rebuildIndex(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (!this.embeddingProvider.isAvailable()) {
      console.warn("[RAG] Cannot rebuild: no embedding provider");
      return;
    }

    const files = this.plugin.app.vault.getMarkdownFiles();
    await this.vectorStore.clear();

    let done = 0;
    const batchSize = 10;
    const batches: TFile[][] = [];
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const texts: string[] = [];
      const metas: Array<{ path: string; title: string }> = [];

      for (const file of batch) {
        try {
          const content = await this.plugin.app.vault.read(file);
          if (content.length < 50) continue;
          texts.push(file.basename + " " + content.slice(0, 2000));
          metas.push({ path: file.path, title: file.basename });
        } catch { /* skip */ }
      }

      if (texts.length === 0) continue;

      try {
        const vectors = await this.embeddingProvider.embedBatch(texts);
        for (let i = 0; i < vectors.length; i++) {
          await this.vectorStore.upsert({
            id: metas[i].path,
            vector: vectors[i],
            metadata: { title: metas[i].title, path: metas[i].path, indexedAt: Date.now() },
          });
        }
      } catch (e) {
        console.warn(`[RAG] Batch embedding failed (${batch.length} notes):`, e);
      }

      done += batch.length;
      onProgress?.(done, files.length);
    }

    await this.vectorStore.save();
    console.log(`[RAG] Index rebuilt: ${this.vectorStore.size} notes`);
  }

  /** Save vectors to disk */
  async persist(): Promise<void> {
    await this.vectorStore.save();
  }

  /** Current RAG mode */
  getMode(): RagMode {
    return this.mode;
  }

  /** Set RAG mode */
  setMode(mode: RagMode): void {
    this.mode = mode;
  }

  get isAvailable(): boolean {
    return this.initialized;
  }

  get vectorCount(): number {
    return this.vectorStore.size;
  }
}
