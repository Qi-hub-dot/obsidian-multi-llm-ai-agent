// ============================================================
// HybridSearcher — TF-IDF + Embedding weighted fusion
// ============================================================
import type { EmbeddingProvider } from "./embedding/types";
import type { VectorStore } from "./embedding/types";
import type { VaultSearchIndex } from "../search/vaultSearch";

export interface HybridResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
  /** Breakdown of scores */
  breakdown: {
    tfidf: number;
    semantic: number;
    fused: number;
  };
}

export interface HybridConfig {
  /** Weight of TF-IDF in fusion (0-1). Default 0.3. */
  tfidfWeight: number;
  /** Minimum score to include in results */
  minScore: number;
  /** Number of results to return */
  topK: number;
}

const DEFAULT_CONFIG: HybridConfig = {
  tfidfWeight: 0.3,
  minScore: 0.01,
  topK: 5,
};

export class HybridSearcher {
  private tfidfIndex: VaultSearchIndex;
  private embeddingProvider: EmbeddingProvider;
  private vectorStore: VectorStore;
  private config: HybridConfig;

  constructor(
    tfidfIndex: VaultSearchIndex,
    embeddingProvider: EmbeddingProvider,
    vectorStore: VectorStore,
    config?: Partial<HybridConfig>,
  ) {
    this.tfidfIndex = tfidfIndex;
    this.embeddingProvider = embeddingProvider;
    this.vectorStore = vectorStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Perform hybrid search */
  async search(query: string): Promise<HybridResult[]> {
    // 1. TF-IDF search (fast, local)
    const tfidfResults = this.tfidfIndex.search(query, 20);

    // 2. Embedding search (slower, needs API / model)
    let semanticResults: Array<{ id: string; score: number }> = [];
    try {
      if (this.embeddingProvider.isAvailable() && this.vectorStore.size > 0) {
        const queryVec = await this.embeddingProvider.embed(query);
        const vecResults = await this.vectorStore.search(queryVec, 20);
        semanticResults = vecResults.map((r) => ({ id: r.id, score: r.score }));
      }
    } catch (e) {
      console.warn("[Hybrid] Embedding search failed, using TF-IDF only:", e);
    }

    // 3. Normalize scores to [0, 1]
    const tfidfNorm = normalizeScores(
      tfidfResults.map((r) => ({ id: r.path, score: r.score })),
    );
    const semNorm = normalizeScores(semanticResults);

    // 4. Weighted fusion
    const w = this.config.tfidfWeight;
    const fused = new Map<string, { tfidf: number; semantic: number; fused: number }>();

    for (const r of tfidfNorm) {
      fused.set(r.id, { tfidf: r.score, semantic: 0, fused: w * r.score });
    }
    for (const r of semNorm) {
      const existing = fused.get(r.id);
      if (existing) {
        existing.semantic = r.score;
        existing.fused = existing.fused + (1 - w) * r.score;
      } else {
        fused.set(r.id, { tfidf: 0, semantic: r.score, fused: (1 - w) * r.score });
      }
    }

    // 5. Sort and filter
    const sorted = Array.from(fused.entries())
      .filter(([, s]) => s.fused >= this.config.minScore)
      .sort((a, b) => b[1].fused - a[1].fused)
      .slice(0, this.config.topK);

    // 6. Build results with snippets from TF-IDF index
    const tfidfMap = new Map(tfidfResults.map((r) => [r.path, r]));
    return sorted.map(([id, scores]) => {
      const tf = tfidfMap.get(id);
      return {
        path: id,
        title: tf?.title || id.split("/").pop()?.replace(/\.md$/, "") || id,
        snippet: tf?.snippet || "",
        score: Math.round(scores.fused * 10000) / 10000,
        breakdown: {
          tfidf: Math.round(scores.tfidf * 10000) / 10000,
          semantic: Math.round(scores.semantic * 10000) / 10000,
          fused: Math.round(scores.fused * 10000) / 10000,
        },
      };
    });
  }

  /** Update config at runtime */
  updateConfig(config: Partial<HybridConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/** Normalize scores to [0, 1] range using min-max */
function normalizeScores<T extends { id: string; score: number }>(
  items: T[],
): T[] {
  if (items.length === 0) return [];
  const scores = items.map((i) => i.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return items.map((i) => ({ ...i, score: 1 }));
  return items.map((i) => ({
    ...i,
    score: (i.score - min) / (max - min),
  }));
}
