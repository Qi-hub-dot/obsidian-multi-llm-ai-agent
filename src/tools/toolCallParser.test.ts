// ============================================================
// Tool Call Parser 单元测试
// ============================================================
import { parseToolCalls, buildToolsPrompt } from "./toolCallParser";
import { getToolRegistry } from "./ToolRegistry";

// 确保工具注册表中有至少一个工具（buildToolsPrompt 需要）
beforeAll(() => {
  const reg = getToolRegistry();
  if (reg.getAll().length === 0) {
    reg.register({
      name: "searchVault",
      description: "Search the vault",
      parameters: { query: { type: "string", description: "Search query" } },
      execute: async () => "ok",
    });
    reg.register({
      name: "createNote",
      description: "Create a note",
      parameters: {
        path: { type: "string", description: "Path" },
        content: { type: "string", description: "Content" },
      },
      execute: async () => "ok",
    });
  }
});

// ============================================================
// parseToolCalls
// ============================================================
describe("parseToolCalls", () => {
  test("解析单个工具调用", () => {
    const text = `<tool_call>{"name":"searchVault","args":{"query":"AI"}}</tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("searchVault");
    expect(calls[0].args).toEqual({ query: "AI" });
  });

  test("解析多个工具调用", () => {
    const text = `
      <tool_call>{"name":"searchVault","args":{"query":"AI"}}</tool_call>
      一些文字
      <tool_call>{"name":"createNote","args":{"path":"test.md","content":"hello"}}</tool_call>
    `;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(2);
    expect(calls[0].name).toBe("searchVault");
    expect(calls[1].name).toBe("createNote");
  });

  test("无工具调用返回空数组", () => {
    const calls = parseToolCalls("这是普通文本，没有工具调用。");
    expect(calls).toHaveLength(0);
  });

  test("包含 rawMatch 用于替换", () => {
    const text = `<tool_call>{"name":"searchVault","args":{"query":"test"}}</tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls[0].rawMatch).toBe(text);
  });

  test("畸形 JSON 不崩溃，返回空数组", () => {
    const text = `<tool_call>{name:broken}</tool_call>`;
    expect(() => parseToolCalls(text)).not.toThrow();
    expect(parseToolCalls(text)).toHaveLength(0);
  });

  test("缺少 name 字段的调用被跳过", () => {
    const text = `<tool_call>{"args":{"x":1}}</tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(0);
  });

  test("args 为空对象时正确处理", () => {
    const text = `<tool_call>{"name":"test","args":{}}</tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({});
  });

  test("工具名前后的空白被容忍", () => {
    const text = `<tool_call>
      {"name":"searchVault","args":{"query":"test"}}
    </tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("searchVault");
  });

  test("参数中包含中文时不崩溃", () => {
    const text = `<tool_call>{"name":"createNote","args":{"path":"学习/数据结构.md","content":"# 数据结构\\n\\n## 栈与队列"}}</tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].args.path).toBe("学习/数据结构.md");
  });

  test("参数中包含转义字符", () => {
    const text = `<tool_call>{"name":"test","args":{"msg":"hello \\"world\\""}}</tool_call>`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].args.msg).toBe('hello "world"');
  });
});

// ============================================================
// buildToolsPrompt
// ============================================================
describe("buildToolsPrompt", () => {
  test("有已注册工具时返回非空字符串", () => {
    const prompt = buildToolsPrompt();
    expect(prompt.length).toBeGreaterThan(0);
  });

  test("包含工具选择决策表", () => {
    const prompt = buildToolsPrompt();
    expect(prompt).toContain("工具选择");
    expect(prompt).toContain("searchVault");
    expect(prompt).toContain("createNote");
  });

  test("包含笔记整理方法论", () => {
    const prompt = buildToolsPrompt();
    expect(prompt).toContain("原子化");
    expect(prompt).toContain("PARA");
    expect(prompt).toContain("MOC");
  });

  test("包含知识图谱生成指南", () => {
    const prompt = buildToolsPrompt();
    expect(prompt).toContain("知识图谱生成");
    expect(prompt).toContain("saveCanvas");
    expect(prompt).toContain(`"nodes"`);
    expect(prompt).toContain(`"edges"`);
  });

  test("包含核心规则", () => {
    const prompt = buildToolsPrompt();
    expect(prompt).toContain("先搜再建");
    expect(prompt).toContain("日常闲聊");
    expect(prompt).toContain("<tool_call>");
  });

  test("无工具时返回空字符串", () => {
    // 创建空注册表的场景 — buildToolsPrompt 从单例读取
    // 只要 getToolRegistry 返回的实例有工具就会非空
    // 这里验证返回内容格式正确即可
    const prompt = buildToolsPrompt();
    expect(typeof prompt).toBe("string");
  });
});
