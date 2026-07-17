// ============================================================
// builtinTools 单元测试 — normalizeCanvasJSON
// ============================================================
import { normalizeCanvasJSON } from "./builtinTools";

describe("normalizeCanvasJSON", () => {
  // ---- 正常输入 ----
  test("标准 Canvas JSON 不变形", () => {
    const input = {
      nodes: [
        { id: "1", type: "text", x: 0, y: 0, width: 250, height: 60, text: "核心", color: "4" },
        { id: "2", type: "text", x: 300, y: 0, width: 250, height: 60, text: "分支", color: "5" },
      ],
      edges: [
        { id: "e1", fromNode: "1", toNode: "2", fromSide: "right", toSide: "left" },
      ],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].type).toBe("text");
    expect(result.nodes[0].text).toBe("核心");
    expect(result.edges).toHaveLength(1);
  });

  // ---- AI 常见错误：edge 类型混在 nodes 里 ----
  test("nodes 中的 type:edge 被分离到 edges", () => {
    const input = {
      nodes: [
        { id: "1", type: "text", x: 0, y: 0, width: 250, height: 60, text: "核心", color: "4" },
        { id: "2", type: "edge", fromNode: "1", toNode: "3", fromSide: "right", toSide: "left" },
        { id: "3", type: "text", x: 300, y: 0, width: 250, height: 60, text: "分支", color: "5" },
      ],
      edges: [],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.nodes).toHaveLength(2); // 只有 text 类型保留
    expect(result.edges).toHaveLength(1); // edge 被移入 edges
    expect(result.edges[0].fromNode).toBe("1");
  });

  // ---- AI 常见错误：fromNode 属性出现在 nodes 里（broken edge）----
  test("含 fromNode 属性的节点被视为边", () => {
    const input = {
      nodes: [
        { id: "1", type: "text", text: "核心" },
        { fromNode: "1", toNode: "2" }, // 没有 type，但有 fromNode
        { id: "2", type: "text", text: "分支" },
      ],
      edges: [],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  // ---- AI 用 core/branch/leaf 代替 text ----
  test("非标准 type 统一转为 text", () => {
    const input = {
      nodes: [
        { id: "1", type: "core", x: 0, y: 0, text: "核心", color: "4" },
        { id: "2", type: "branch", x: 300, y: 0, text: "分支", color: "5" },
        { id: "3", type: "leaf", x: 600, y: 0, text: "叶子", color: "2" },
      ],
      edges: [],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0].type).toBe("text");
    expect(result.nodes[1].type).toBe("text");
    expect(result.nodes[2].type).toBe("text");
  });

  // ---- 节点重编号 ----
  test("节点 ID 被重新编号为 1,2,3...", () => {
    const input = {
      nodes: [
        { id: "abc", type: "text", text: "A" },
        { id: "xyz-123", type: "text", text: "B" },
      ],
      edges: [],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.nodes[0].id).toBe("1");
    expect(result.nodes[1].id).toBe("2");
  });

  // ---- 边引用跟随重编号（通过 text 标签匹配）----
  test("边通过节点 text 标签匹配到新 ID", () => {
    const input = {
      nodes: [
        { id: "old-a", type: "text", text: "核心" },
        { id: "old-b", type: "text", text: "分支" },
      ],
      edges: [
        // 用 text 标签引用（非 ID），能被 labelToId 映射
        { id: "e1", fromNode: "核心", toNode: "分支" },
      ],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.nodes[0].id).toBe("1");
    expect(result.nodes[1].id).toBe("2");
    // 通过 text 标签可以正确映射到新 ID
    expect(result.edges[0].fromNode).toBe("1");
    expect(result.edges[0].toNode).toBe("2");
  });

  // ---- 通过 text 标签匹配节点 ----
  test("边通过节点 text 匹配 ID", () => {
    const input = {
      nodes: [
        { id: "a", type: "text", text: "核心概念" },
        { id: "b", type: "text", text: "子概念" },
      ],
      edges: [
        { id: "e1", fromNode: "核心概念", toNode: "子概念" },
      ],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].fromNode).toBe("1");
    expect(result.edges[0].toNode).toBe("2");
  });

  // ---- 空 edges ----
  test("无 edges 时返回空数组", () => {
    const input = {
      nodes: [{ id: "1", type: "text", text: "单节点" }],
      edges: [],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.edges).toEqual([]);
  });

  // ---- 缺失 edges 字段 ----
  test("缺少 edges 字段不崩溃", () => {
    const input = {
      nodes: [{ id: "1", type: "text", text: "单节点" }],
    };
    expect(() => normalizeCanvasJSON(input)).not.toThrow();
    const result = normalizeCanvasJSON(input);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toEqual([]);
  });

  // ---- 空 nodes ----
  test("空 nodes 返回空结果", () => {
    const input = { nodes: [], edges: [] };
    const result = normalizeCanvasJSON(input);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  // ---- 重复边去重 ----
  test("重复边被去重", () => {
    const input = {
      nodes: [
        { id: "1", type: "text", text: "A" },
        { id: "2", type: "text", text: "B" },
      ],
      edges: [
        { id: "e1", fromNode: "1", toNode: "2" },
        { id: "e2", fromNode: "1", toNode: "2" }, // 重复
      ],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.edges).toHaveLength(1);
  });

  // ---- 缺失节点属性用默认值填充 ----
  test("缺失 x/y/width/height 使用默认值", () => {
    const input = {
      nodes: [
        { id: "1", type: "text", text: "无坐标" },
      ],
      edges: [],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.nodes[0].x).toBe(0);
    expect(result.nodes[0].y).toBe(0);
    expect(result.nodes[0].width).toBe(250);
    expect(result.nodes[0].height).toBe(60);
  });

  // ---- 缺失 color 使用默认值 ----
  test("缺失 color 默认为 '4'", () => {
    const input = {
      nodes: [{ id: "1", type: "text", text: "无色" }],
      edges: [],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.nodes[0].color).toBe("4");
  });

  // ---- 密集布局：多节点自动分行 ----
  test("10+ 节点自动网格布局", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({
      id: String(i + 1), type: "text", text: `概念${i + 1}`,
    }));
    const result = normalizeCanvasJSON({ nodes, edges: [] });
    expect(result.nodes).toHaveLength(12);
    // 前3个在一行（x间隔300）
    expect(result.nodes[0].x).toBe(0);
    expect(result.nodes[1].x).toBe(300);
    expect(result.nodes[2].x).toBe(600);
    // 第4个在第二行
    expect(result.nodes[3].y).toBeGreaterThan(0);
  });

  // ---- 节点 label 作为 text 回退 ----
  test("无 text 时使用 label 属性", () => {
    const input = {
      nodes: [{ id: "1", type: "text", label: "标签文本" }],
      edges: [],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.nodes[0].text).toBe("标签文本");
  });

  // ---- 边缺失 fromSide/toSide 默认值 ----
  test("边缺失方向属性使用默认 right/left", () => {
    const input = {
      nodes: [
        { id: "1", type: "text", text: "A" },
        { id: "2", type: "text", text: "B" },
      ],
      edges: [{ id: "e1", fromNode: "1", toNode: "2" }],
    };
    const result = normalizeCanvasJSON(input);
    expect(result.edges[0].fromSide).toBe("right");
    expect(result.edges[0].toSide).toBe("left");
  });
});
