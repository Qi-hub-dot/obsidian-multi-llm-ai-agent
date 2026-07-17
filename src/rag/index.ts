// ============================================================
// RAG module — barrel export
// ============================================================
export { RAGManager, type RagMode } from "./RAGManager";
export { ApiEmbeddingProvider, getApiEmbeddingProvider } from "./embedding/ApiEmbeddingProvider";
export type { ApiEmbeddingConfig } from "./embedding/ApiEmbeddingProvider";
export { OnnxEmbeddingProvider, getOnnxEmbeddingProvider } from "./embedding/OnnxEmbeddingProvider";
export { FlatVectorStore, getFlatVectorStore } from "./vectorstore/FlatVectorStore";
export { HybridSearcher, type HybridResult, type HybridConfig } from "./HybridSearcher";
export type { EmbeddingProvider, EmbeddingVector, VectorStore, VectorRecord, VectorSearchResult } from "./embedding/types";
