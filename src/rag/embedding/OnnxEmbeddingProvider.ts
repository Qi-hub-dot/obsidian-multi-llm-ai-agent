// ============================================================
// ONNX Local Embedding Provider
// 纯 JS 回退：使用 n-gram 哈希 + 随机投影模拟语义嵌入
// 架构预留 ONNX Runtime Web 接入点（取消注释即可切换）
// ============================================================
import type { EmbeddingProvider, EmbeddingVector } from "./types";

/**
 * ONNX 本地嵌入提供者。
 * 
 * 当前实现：使用局部敏感哈希 (LSH) + n-gram 特征实现轻量级文本向量化。
 * 无需任何外部依赖，不调用 API，完全本地运行。
 * 
 * 升级路径（择一）：
 *   1. npm install onnxruntime-web → 加载 MiniLM-L6 ONNX 模型
 *   2. npm install @xenova/transformers → 使用 Transformers.js pipeline
 */
export class OnnxEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ONNX-Local";
  readonly dimension = 384; // MiniLM-L6 标准维度

  private projectionMatrix: number[][] | null = null;
  private _available = false;
  private initialized_ = false;

  /** 词汇表（高频 bigram → 索引） */
  private vocab = new Map<string, number>();
  private vocabSize = 0;
  private readonly maxVocab = 8192;

  isAvailable(): boolean {
    return this._available;
  }

  async initialize(): Promise<void> {
    if (this.initialized_) return;

    try {
      // 尝试加载 ONNX Runtime（如果可用）
      // const ort = await import("onnxruntime-web");
      // ... 加载模型 ...
      // this._available = true;
    } catch {
      // ONNX 不可用，使用纯 JS 回退
    }

    // 纯 JS 回退：初始化随机投影矩阵
    this.initProjection();
    this._available = true;
    this.initialized_ = true;

    console.log(
      `[ONNX] Local embedding ready: ${this.dimension}d LSH projection (vocab=${this.maxVocab})`
    );
  }

  async embed(text: string): Promise<EmbeddingVector> {
    if (!this.initialized_) await this.initialize();
    return this.lshEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    if (!this.initialized_) await this.initialize();
    return texts.map((t) => this.lshEmbed(t));
  }

  // ---- 内部实现 ----

  /** 初始化随机投影矩阵（高斯分布） */
  private initProjection(): void {
    this.projectionMatrix = [];
    // 使用确定性种子（基于固定哈希），确保同一文本总是得到相同向量
    for (let i = 0; i < this.maxVocab; i++) {
      const row: number[] = [];
      for (let j = 0; j < this.dimension; j++) {
        // Box-Muller 变换生成标准正态分布
        const u1 = this.seededRandom(i * this.dimension + j * 2);
        const u2 = this.seededRandom(i * this.dimension + j * 2 + 1);
        // 避免 log(0)
        const r = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001)));
        const theta = 2 * Math.PI * u2;
        row.push(r * Math.cos(theta));
      }
      this.projectionMatrix.push(row);
    }
  }

  /** LSH 嵌入：n-gram → 稀疏向量 → 随机投影 → 稠密向量 */
  private lshEmbed(text: string): number[] {
    // Step 1: 提取 n-gram 特征
    const features = this.extractFeatures(text.toLowerCase());

    // Step 2: 构建稀疏特征向量
    const sparseVec = new Array(this.maxVocab).fill(0);
    for (const [ngram, count] of features) {
      const idx = this.getVocabIndex(ngram);
      if (idx < this.maxVocab) {
        sparseVec[idx] += count;
      }
    }

    // Step 3: TF-IDF 风格归一化
    const totalTerms = features.size || 1;
    for (let i = 0; i < this.maxVocab; i++) {
      if (sparseVec[i] > 0) {
        sparseVec[i] = sparseVec[i] / totalTerms;
      }
    }

    // Step 4: 随机投影（Johnson-Lindenstrauss 引理保证距离保持）
    if (!this.projectionMatrix) this.initProjection();
    const pm = this.projectionMatrix!;
    const dense: number[] = new Array(this.dimension).fill(0);

    for (let i = 0; i < this.maxVocab; i++) {
      if (sparseVec[i] === 0) continue;
      const row = pm[i];
      for (let j = 0; j < this.dimension; j++) {
        dense[j] += sparseVec[i] * row[j];
      }
    }

    // Step 5: L2 归一化
    const norm = Math.sqrt(dense.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        dense[i] /= norm;
      }
    }

    return dense;
  }

  /** 提取 n-gram 特征（bigram + trigram） */
  private extractFeatures(text: string): Map<string, number> {
    const feats = new Map<string, number>();

    // CJK 字符 n-gram
    const cjkSegs = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) || [];
    for (const seg of cjkSegs) {
      for (let i = 0; i < seg.length - 1; i++) {
        const bg = seg.slice(i, i + 2);
        feats.set("c:" + bg, (feats.get("c:" + bg) || 0) + 1);
      }
      for (let i = 0; i < seg.length - 2; i++) {
        const tg = seg.slice(i, i + 3);
        feats.set("c:" + tg, (feats.get("c:" + tg) || 0) + 0.5); // trigram 权重低
      }
    }

    // 英文/数字 token（按空格和标点分割）
    const enSegs = text.match(/[a-z0-9]+/g) || [];
    for (const tok of enSegs) {
      if (tok.length >= 2) {
        feats.set("e:" + tok, (feats.get("e:" + tok) || 0) + 1);
      }
      // 子词 bigram
      if (tok.length >= 3) {
        for (let i = 0; i < tok.length - 2; i++) {
          const sub = tok.slice(i, i + 3);
          feats.set("e:" + sub, (feats.get("e:" + sub) || 0) + 0.3);
        }
      }
    }

    return feats;
  }

  /** 获取或分配词汇表索引 */
  private getVocabIndex(ngram: string): number {
    if (this.vocab.has(ngram)) return this.vocab.get(ngram)!;
    if (this.vocabSize >= this.maxVocab) {
      // 词汇表满 → 哈希映射
      return this.hashStr(ngram) % this.maxVocab;
    }
    this.vocab.set(ngram, this.vocabSize);
    return this.vocabSize++;
  }

  /** 确定性伪随机数（xorshift） */
  private seededRandom(seed: number): number {
    let x = seed + 0x6d2b79f5;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  /** 简单字符串哈希 */
  private hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
}

/** 单例 */
let onnxInstance: OnnxEmbeddingProvider | null = null;

export function getOnnxEmbeddingProvider(): OnnxEmbeddingProvider {
  if (!onnxInstance) {
    onnxInstance = new OnnxEmbeddingProvider();
  }
  return onnxInstance;
}
