// ============================================================
// API Embedding Provider — OpenAI-compatible / DashScope / GLM
// ============================================================
import type { EmbeddingProvider, EmbeddingVector } from "./types";
import type { ProviderConfig, LLMProvider } from "../../LLMProviders/chatModelManager";

export interface ApiEmbeddingConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Calls OpenAI-compatible /v1/embeddings endpoint.
 * Supports: Qwen (DashScope), GLM (ZhipuAI), and any OpenAI-compatible service.
 */
export class ApiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "API-Embedding";
  readonly dimension = 1536; // Default ada-002 dimension; override per provider

  private config: ApiEmbeddingConfig | null = null;
  private _available = false;
  private dims = new Map<string, number>([
    ["text-embedding-v3", 1024],
    ["text-embedding-ada-002", 1536],
    ["embedding-2", 1536],
    ["text-embedding-3-small", 1536],
    ["text-embedding-3-large", 3072],
  ]);

  /** Configure from a registered provider config */
  configure(config: ProviderConfig): void {
    this.config = {
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: this.getEmbeddingModel(config.provider, config.model),
    };
    this._available = !!config.apiKey;
    // Override dimension based on model
    const d = this.dims.get(this.config.model);
    if (d) (this as any).dimension = d;
  }

  isAvailable(): boolean {
    return this._available;
  }

  async initialize(): Promise<void> {
    if (!this.config) throw new Error("ApiEmbeddingProvider not configured");
    // Test connectivity with a simple embedding call
    try {
      await this.embed("test");
    } catch {
      // Non-fatal: will retry on actual use
    }
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    if (!this.config) throw new Error("ApiEmbeddingProvider not configured");
    if (texts.length === 0) return [];

    const { apiKey, baseUrl, model } = this.config;
    const cleanBase = baseUrl.replace(/\/+$/, "");

    const body = JSON.stringify({
      model,
      input: texts,
      encoding_format: "float",
    });

    const response = await fetch(`${cleanBase}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Embedding API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const json = await response.json();
    // OpenAI-compatible response format: { data: [{ embedding: number[] }] }
    const data: Array<{ embedding: number[] }> = json.data;
    if (!data || !Array.isArray(data)) {
      throw new Error("Unexpected embedding response format");
    }

    return data.map((item) => item.embedding);
  }

  /** Pick the best embedding model for each provider */
  private getEmbeddingModel(provider: string, chatModel: string): string {
    switch (provider) {
      case "qwen":
        // DashScope embedding models
        return "text-embedding-v3"; // 1024 dims
      case "glm":
        // ZhipuAI embedding
        return "embedding-2"; // 1536 dims
      default:
        // OpenAI-compatible fallback
        return "text-embedding-ada-002";
    }
  }
}

/** Singleton */
let apiEmbeddingInstance: ApiEmbeddingProvider | null = null;

export function getApiEmbeddingProvider(): ApiEmbeddingProvider {
  if (!apiEmbeddingInstance) apiEmbeddingInstance = new ApiEmbeddingProvider();
  return apiEmbeddingInstance;
}
