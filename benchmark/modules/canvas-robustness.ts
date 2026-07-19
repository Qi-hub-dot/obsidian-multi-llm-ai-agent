// ============================================================
// Canvas JSON Robustness Benchmark
// Tests the normalizeCanvasJSON function against common LLM output errors
// ============================================================
import { normalizeCanvasJSON } from "../config";
import type { CanvasTestCase, CaseResult, BenchmarkResult } from "../types";

const testCases: CanvasTestCase[] = [
  {
    id: "cv-01",
    description: "标准格式：正常的 nodes + edges",
    input: {
      nodes: [
        { id: "1", type: "text", x: 0, y: 0, width: 250, height: 60, text: "核心概念", color: "4" },
        { id: "2", type: "text", x: 300, y: 0, width: 250, height: 60, text: "子概念A", color: "5" },
      ],
      edges: [
        { id: "e1", fromNode: "1", toNode: "2", fromSide: "right", toSide: "left" },
      ],
    },
    expectedNodes: 2,
    expectedEdges: 1,
    expectedFirstNodeText: "核心概念",
  },
  {
    id: "cv-02",
    description: "边混入 nodes 数组（AI 常见错误）",
    input: {
      nodes: [
        { id: "1", type: "text", text: "概念A", color: "4" },
        { id: "2", type: "text", text: "概念B", color: "5" },
        { fromNode: "1", toNode: "2" },          // 边混入 nodes
        { id: "3", type: "text", text: "概念C", color: "5" },
      ],
      edges: [],
    },
    expectedNodes: 3,
    expectedEdges: 1,
    expectedFirstNodeText: "概念A",
  },
  {
    id: "cv-03",
    description: "type 为非标准值（core/branch/leaf）",
    input: {
      nodes: [
        { id: "1", type: "core", text: "中心", color: "4" },
        { id: "2", type: "branch", text: "分支1", color: "5" },
        { id: "3", type: "leaf", text: "叶子", color: "2" },
      ],
      edges: [],
    },
    expectedNodes: 3,
    expectedEdges: 0,
    expectedFirstNodeText: "中心",
  },
  {
    id: "cv-04",
    description: "缺失 x/y 坐标 → 自动网格布局",
    input: {
      nodes: [
        { id: "1", type: "text", text: "A" },
        { id: "2", type: "text", text: "B" },
        { id: "3", type: "text", text: "C" },
        { id: "4", type: "text", text: "D" },
      ],
      edges: [],
    },
    expectedNodes: 4,
    expectedEdges: 0,
  },
  {
    id: "cv-05",
    description: "边引用使用 label（文本）而非 id",
    input: {
      nodes: [
        { id: "1", type: "text", x: 0, y: 0, width: 250, height: 60, text: "神经网络", color: "4" },
        { id: "2", type: "text", x: 300, y: 0, width: 250, height: 60, text: "CNN", color: "5" },
      ],
      edges: [
        { id: "e1", fromNode: "神经网络", toNode: "CNN" },  // 用文本而非 id
      ],
    },
    expectedNodes: 2,
    expectedEdges: 1,
  },
  {
    id: "cv-06",
    description: "缺失 color → 默认值 4",
    input: {
      nodes: [
        { id: "1", type: "text", text: "概念", x: 0, y: 0 },
      ],
      edges: [],
    },
    expectedNodes: 1,
    expectedEdges: 0,
  },
  {
    id: "cv-07",
    description: "缺失 width/height → 默认值",
    input: {
      nodes: [
        { id: "1", type: "text", text: "概念", x: 0, y: 0 },
      ],
      edges: [],
    },
    expectedNodes: 1,
    expectedEdges: 0,
  },
  {
    id: "cv-08",
    description: "重复边去重",
    input: {
      nodes: [
        { id: "1", type: "text", text: "A" },
        { id: "2", type: "text", text: "B" },
      ],
      edges: [
        { id: "e1", fromNode: "1", toNode: "2" },
        { id: "e2", fromNode: "1", toNode: "2" },  // 重复
        { id: "e3", fromNode: "2", toNode: "1" },
      ],
    },
    expectedNodes: 2,
    expectedEdges: 2,     // 去重后 2 条（1→2 和 2→1）
  },
  {
    id: "cv-09",
    description: "空输入 → 空输出",
    input: { nodes: [], edges: [] },
    expectedNodes: 0,
    expectedEdges: 0,
  },
  {
    id: "cv-10",
    description: "复杂场景：混合所有错误类型",
    input: {
      nodes: [
        { id: "1", type: "core", text: "AI基础" },
        { id: "2", type: "text", text: "深度学习", color: "5", x: 300, y: 120 },
        { fromNode: "1", toNode: "2" },             // 边混入
        { id: "3", type: "branch", text: "CNN" },
        { id: "4", type: "text", text: "RNN" },
        { fromNode: "深度学习", toNode: "CNN" },     // label 引用 + 混入
      ],
      edges: [
        { id: "ex", fromNode: "1", toNode: "2" },   // 与上面混入的边重复
        { fromNode: "3", toNode: "4" },
        { fromNode: "3", toNode: "4" },             // 重复
      ],
    },
    expectedNodes: 4,
    expectedEdges: 3,    // 3 条唯一边
  },
];

export function runCanvasBenchmark(): BenchmarkResult {
  const start = Date.now();
  const cases: CaseResult[] = [];

  for (const tc of testCases) {
    const caseStart = Date.now();
    const result = normalizeCanvasJSON(tc.input);

    const nodeOk = result.nodes.length === tc.expectedNodes;
    const edgeOk = result.edges.length === tc.expectedEdges;
    const textOk = !tc.expectedFirstNodeText || (result.nodes[0]?.text === tc.expectedFirstNodeText);
    const typeOk = result.nodes.every((n: any) => n.type === "text");
    const allIdStr = result.nodes.every((n: any) => typeof n.id === "string");
    const autoLayoutOk = result.nodes.every((n: any) => typeof n.x === "number" && typeof n.y === "number");

    const passed = nodeOk && edgeOk && textOk && typeOk && allIdStr && autoLayoutOk;

    cases.push({
      id: tc.id,
      passed,
      expected: `nodes:${tc.expectedNodes} edges:${tc.expectedEdges} text:${tc.expectedFirstNodeText || "-"}`,
      actual: `nodes:${result.nodes.length} edges:${result.edges.length} text:${result.nodes[0]?.text || "-"} type:${result.nodes[0]?.type || "-"}`,
      description: tc.description,
      durationMs: Date.now() - caseStart,
    });

    if (!passed) {
      console.log(`  [FAIL] ${tc.id}: ${tc.description}`);
      console.log(`         expected: nodes=${tc.expectedNodes} edges=${tc.expectedEdges}`);
      console.log(`         actual:   nodes=${result.nodes.length} edges=${result.edges.length}`);
      if (!nodeOk) console.log(`         → nodes count mismatch`);
      if (!edgeOk) console.log(`         → edges count mismatch`);
      if (!textOk) console.log(`         → first text mismatch`);
      if (!typeOk) console.log(`         → some nodes have non-"text" type`);
    }
  }

  const passed = cases.filter(c => c.passed).length;
  const durationMs = Date.now() - start;

  return {
    module: "canvas-robustness",
    total: cases.length,
    passed,
    failed: cases.length - passed,
    durationMs,
    cases,
    summary: `Canvas robustness: ${passed}/${cases.length} (${(passed/cases.length*100).toFixed(1)}%)`,
  };
}
