// ============================================================
// ONNX 本地嵌入提供者单元测试
// ============================================================
import { OnnxEmbeddingProvider } from "./OnnxEmbeddingProvider";

describe("OnnxEmbeddingProvider", () => {
  let provider: OnnxEmbeddingProvider;

  beforeAll(async () => {
    provider = new OnnxEmbeddingProvider();
    await provider.initialize();
  });

  test("初始化后可用", () => {
    expect(provider.isAvailable()).toBe(true);
  });

  test("name 正确", () => {
    expect(provider.name).toBe("ONNX-Local");
  });

  test("dimension 为 384（MiniLM-L6 标准）", () => {
    expect(provider.dimension).toBe(384);
  });

  test("单文本嵌入返回正确维度", async () => {
    const vec = await provider.embed("深度学习是机器学习的一个子集");
    expect(vec).toHaveLength(384);
    // 所有值应为有限数字
    expect(vec.every((v) => Number.isFinite(v))).toBe(true);
  });

  test("不同文本产生不同向量", async () => {
    const v1 = await provider.embed("人工智能");
    const v2 = await provider.embed("天气预报");
    // 至少某些维度不同
    const diff = v1.some((v, i) => Math.abs(v - v2[i]) > 0.001);
    expect(diff).toBe(true);
  });

  test("相同文本产生相同向量（确定性）", async () => {
    const v1 = await provider.embed("测试文本");
    const v2 = await provider.embed("测试文本");
    expect(v1).toEqual(v2);
  });

  test("向量已 L2 归一化", async () => {
    const vec = await provider.embed("归一化测试文本内容");
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });

  test("embedBatch 批量嵌入", async () => {
    const texts = ["第一段文本", "第二段文本", "第三段文本"];
    const vecs = await provider.embedBatch(texts);
    expect(vecs).toHaveLength(3);
    expect(vecs[0]).toHaveLength(384);
    expect(vecs[1]).toHaveLength(384);
    expect(vecs[2]).toHaveLength(384);
  });

  test("空字符串不出错", async () => {
    const vec = await provider.embed("");
    expect(vec).toHaveLength(384);
    expect(vec.every((v) => Number.isFinite(v))).toBe(true);
  });

  test("中文文本嵌入有效", async () => {
    const vec = await provider.embed("人工智能正在改变世界");
    // 中文应有非零特征
    const hasNonZero = vec.some((v) => Math.abs(v) > 0.01);
    expect(hasNonZero).toBe(true);
  });

  test("英文文本嵌入有效", async () => {
    const vec = await provider.embed("Artificial intelligence is transforming the world");
    const hasNonZero = vec.some((v) => Math.abs(v) > 0.01);
    expect(hasNonZero).toBe(true);
  });

  test("语义相近文本余弦相似度更高", async () => {
    const v1 = await provider.embed("机器学习算法优化");
    const v2 = await provider.embed("深度学习模型训练");
    const v3 = await provider.embed("今天天气很好适合出游");

    const sim12 = cosineSim(v1, v2);
    const sim13 = cosineSim(v1, v3);

    // 相近主题应该更相似
    expect(sim12).toBeGreaterThan(sim13);
  });
});

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
