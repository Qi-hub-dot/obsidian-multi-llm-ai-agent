// ============================================================
// ToolRegistry 单元测试
// ============================================================
import { ToolRegistry, getToolRegistry } from "./ToolRegistry";
import type { ToolDef } from "./ToolRegistry";

// 每个测试用例用独立实例，避免单例污染
function freshRegistry(): ToolRegistry {
  return new ToolRegistry();
}

describe("ToolRegistry", () => {
  const mockTool: ToolDef = {
    name: "testTool",
    description: "A test tool",
    parameters: {
      param1: { type: "string", description: "First param" },
      param2: { type: "number", description: "Second param" },
    },
    execute: async (params) => `executed with ${JSON.stringify(params)}`,
  };

  // ---- 注册与查询 ----
  describe("register / get / getAll", () => {
    test("注册后可通过名称获取", () => {
      const reg = freshRegistry();
      reg.register(mockTool);
      expect(reg.get("testTool")).toBe(mockTool);
    });

    test("查询未注册的工具返回 undefined", () => {
      const reg = freshRegistry();
      expect(reg.get("nonexistent")).toBeUndefined();
    });

    test("getAll 返回所有已注册工具", () => {
      const reg = freshRegistry();
      reg.register(mockTool);
      reg.register({ ...mockTool, name: "tool2" });
      expect(reg.getAll()).toHaveLength(2);
    });

    test("同名注册会覆盖旧工具", () => {
      const reg = freshRegistry();
      const v1: ToolDef = { ...mockTool, description: "v1" };
      const v2: ToolDef = { ...mockTool, description: "v2" };
      reg.register(v1);
      reg.register(v2);
      expect(reg.get("testTool")?.description).toBe("v2");
    });
  });

  // ---- toOpenAITools ----
  describe("toOpenAITools", () => {
    test("输出 OpenAI function calling 格式", () => {
      const reg = freshRegistry();
      reg.register(mockTool);
      const tools = reg.toOpenAITools();
      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({
        type: "function",
        function: {
          name: "testTool",
          description: "A test tool",
        },
      });
    });

    test("parameters 包含 required 列表", () => {
      const reg = freshRegistry();
      reg.register(mockTool);
      const tools = reg.toOpenAITools();
      const func = tools[0].function as any;
      expect(func.parameters.required).toEqual(["param1", "param2"]);
      expect(func.parameters.properties.param1.type).toBe("string");
    });

    test("无参数工具 required 为空数组", () => {
      const reg = freshRegistry();
      reg.register({
        name: "noParams",
        description: "No params",
        parameters: {},
        execute: async () => "ok",
      });
      const tools = reg.toOpenAITools();
      const func = tools[0].function as any;
      expect(func.parameters.required).toEqual([]);
    });

    test("空注册表返回空数组", () => {
      const reg = freshRegistry();
      expect(reg.toOpenAITools()).toEqual([]);
    });
  });

  // ---- execute ----
  describe("execute", () => {
    test("执行已注册工具返回结果", async () => {
      const reg = freshRegistry();
      reg.register(mockTool);
      const result = await reg.execute("testTool", { param1: "hello" }, null as any);
      expect(result).toContain("hello");
    });

    test("执行未注册工具返回错误信息", async () => {
      const reg = freshRegistry();
      const result = await reg.execute("ghost", {}, null as any);
      expect(result).toContain("unknown tool");
    });

    test("工具抛出异常时返回错误信息", async () => {
      const reg = freshRegistry();
      reg.register({
        name: "crash",
        description: "",
        parameters: {},
        execute: async () => { throw new Error("BOOM"); },
      });
      const result = await reg.execute("crash", {}, null as any);
      expect(result).toContain("BOOM");
    });
  });

  // ---- 单例 ----
  describe("getToolRegistry 单例", () => {
    test("多次调用返回同一实例", () => {
      const a = getToolRegistry();
      const b = getToolRegistry();
      expect(a).toBe(b);
    });
  });
});
