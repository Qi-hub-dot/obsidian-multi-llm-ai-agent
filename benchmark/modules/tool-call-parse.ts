// ============================================================
// Tool Call Parser Robustness Benchmark
// Tests parseToolCalls against various LLM output formats
// ============================================================
import { parseToolCalls } from "../config";
import type { ToolCallTestCase, CaseResult, BenchmarkResult } from "../types";

const testCases: ToolCallTestCase[] = [
  // === Standard format ===
  {
    id: "tc-01",
    description: "标准 <tool_call> 格式",
    input: `<tool_call>{"name":"searchVault","args":{"query":"深度学习"}}</tool_call>`,
    expectedCalls: 1,
    expectedNames: ["searchVault"],
  },
  {
    id: "tc-02",
    description: "多个工具调用",
    input: `搜索到了以下结果。现在创建笔记。

<tool_call>{"name":"searchVault","args":{"query":"机器学习"}}</tool_call>

<tool_call>{"name":"createNote","args":{"path":"学习/ML.md","content":"# 机器学习\\n\\n..."}}</tool_call>`,
    expectedCalls: 2,
    expectedNames: ["searchVault", "createNote"],
  },
  {
    id: "tc-03",
    description: "工具调用带空白字符",
    input: `<tool_call>
{"name":"readNote","args":{"path":"笔记/概念.md"}}
</tool_call>`,
    expectedCalls: 1,
    expectedNames: ["readNote"],
  },

  // === GLM-4 fallback formats ===
  {
    id: "tc-04",
    description: "GLM-4 畸形格式：createNote\\n{...}",
    input: `我来创建这篇笔记。

createNote
{"path":"编程/Python.md","content":"# Python笔记"}`,
    expectedCalls: 1,
    expectedNames: ["createNote"],
  },
  {
    id: "tc-05",
    description: "GLM-4 畸形格式：searchVault { }",
    input: `让我搜索一下。

searchVault {"query":"知识图谱"}

根据搜索结果...`,
    expectedCalls: 1,
    expectedNames: ["searchVault"],
  },

  // === Edge cases ===
  {
    id: "tc-06",
    description: "无工具调用的普通回复",
    input: "你好！有什么可以帮助你的吗？",
    expectedCalls: 0,
    expectedNames: [],
  },
  {
    id: "tc-07",
    description: "JSON 中双引号转义",
    input: `<tool_call>{"name":"createNote","args":{"path":"test.md","content":"He said \\"hello\\" to me."}}</tool_call>`,
    expectedCalls: 1,
    expectedNames: ["createNote"],
  },
  {
    id: "tc-08",
    description: "嵌套 JSON（content 中含 JSON 片段）",
    input: `<tool_call>{"name":"createNote","args":{"path":"test.md","content":"# 配置\\n\\n\`\`\`json\\n{\\"key\\":\\"value\\"}\\n\`\`\`"}}</tool_call>`,
    expectedCalls: 1,
    expectedNames: ["createNote"],
  },
  {
    id: "tc-09",
    description: "工具调用后跟普通文字",
    input: `根据你的需求，我找到了以下内容。

<tool_call>{"name":"searchVault","args":{"query":"NLP基础"}}</tool_call>

以上是搜索结果，需要我进一步处理吗？`,
    expectedCalls: 1,
    expectedNames: ["searchVault"],
  },
  {
    id: "tc-10",
    description: "重复工具名去重（同个工具名多次调用，只取第一个标准匹配的）",
    input: `<tool_call>{"name":"searchVault","args":{"query":"AI"}}</tool_call>
<tool_call>{"name":"searchVault","args":{"query":"ML"}}</tool_call>`,
    expectedCalls: 2,
    expectedNames: ["searchVault", "searchVault"],
  },
  {
    id: "tc-11",
    description: "损坏的 JSON",
    input: `<tool_call>{"name":"searchVault","args":{"query":"test"}</tool_call>`,
    expectedCalls: 0,
    expectedNames: [],
  },
  {
    id: "tc-12",
    description: "saveCanvas 工具调用",
    input: `<tool_call>{"name":"saveCanvas","args":{"canvasJSON":"{\\"nodes\\":[{\\"id\\":\\"1\\",\\"type\\":\\"text\\",\\"text\\":\\"核心\\"}]}"}}</tool_call>`,
    expectedCalls: 1,
    expectedNames: ["saveCanvas"],
  },
];

export function runToolCallBenchmark(): BenchmarkResult {
  const start = Date.now();
  const cases: CaseResult[] = [];

  for (const tc of testCases) {
    const caseStart = Date.now();
    const calls = parseToolCalls(tc.input);

    const countOk = calls.length === tc.expectedCalls;
    const namesOk = tc.expectedNames.every((name, i) => calls[i]?.name === name);

    // For tc-10, we allow either order since two calls to same tool
    let passed: boolean;
    if (tc.id === "tc-10") {
      passed = calls.length === 2 && calls.every(c => c.name === "searchVault");
    } else {
      passed = countOk && namesOk;
    }

    cases.push({
      id: tc.id,
      passed,
      expected: `calls:${tc.expectedCalls} names:[${tc.expectedNames.join(",")}]`,
      actual: `calls:${calls.length} names:[${calls.map(c => c.name).join(",")}]`,
      description: tc.description,
      durationMs: Date.now() - caseStart,
    });

    if (!passed) {
      console.log(`  [FAIL] ${tc.id}: ${tc.description}`);
      console.log(`         expected: ${tc.expectedCalls} calls [${tc.expectedNames.join(", ")}]`);
      console.log(`         actual:   ${calls.length} calls [${calls.map(c => c.name).join(", ")}]`);
    }
  }

  const passed = cases.filter(c => c.passed).length;
  const durationMs = Date.now() - start;

  return {
    module: "tool-call-parse",
    total: cases.length,
    passed,
    failed: cases.length - passed,
    durationMs,
    cases,
    summary: `Tool call parse: ${passed}/${cases.length} (${(passed/cases.length*100).toFixed(1)}%)`,
  };
}
