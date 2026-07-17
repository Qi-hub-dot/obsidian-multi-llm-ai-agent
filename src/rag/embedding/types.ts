// ============================================================
// RAG Embedding — abstract interfaces
// ============================================================

/** Embedding vector (float32 array) */
export type EmbeddingVector = number[];

/** A single record in the vector store */
export interface VectorRecord {
  /** Unique identifier (e.g., note path) */
  id: string;
  /** The embedding vector */
  vector: EmbeddingVector;
  /** Arbitrary metadata */
  metadata: Record<string, unknown>;
}

/** Search result from vector store */
export interface VectorSearchResult {
  id: string;
  score: number; // cosine similarity or distance
  metadata: Record<string, unknown>;
}

/**
 * Embedding provider: converts text → vector.
 * Implementations: ONNX (local), API (remote), etc.
 */
export interface EmbeddingProvider {
  /** Provider name for logging */
  readonly name: string;

  /** Embed a single text */
  embed(text: string): Promise<EmbeddingVector>;

  /** Embed multiple texts (batch) */
  embedBatch(texts: string[]): Promise<EmbeddingVector[]>;

  /** Dimensionality of output vectors */
  readonly dimension: number;

  /** Whether the provider is available (model loaded / API configured) */
  isAvailable(): boolean;

  /** Initialize / warm up the provider */
  initialize(): Promise<void>;
}

/**
 * Vector store: storage + nearest-neighbor search.
 * Implementation: HNSW (hnswlib-node), flat, etc.
 */
export interface VectorStore {
  /** Add or update a record */
  upsert(record: VectorRecord): Promise<void>;

  /** Batch upsert */
  upsertBatch(records: VectorRecord[]): Promise<void>;

  /** Search topK nearest neighbors */
  search(query: EmbeddingVector, topK: number): Promise<VectorSearchResult[]>;

  /** Remove a record by id */
  remove(id: string): Promise<void>;

  /** Total number of records */
  readonly size: number;

  /** Clear all records */
  clear(): Promise<void>;
}
