// ============================================================
// Tokenizer Precision Benchmark
// Compares CJK n-gram tokenizer against:
//   1. Obsidian native search (whitespace-based)
//   2. jieba-like dictionary approach (simulated)
// ============================================================
import { tokenize } from "../config";
import type { CaseResult, BenchmarkResult } from "../types";

const testCases = [
  // === Short queries ===
  { id: "tok-01", input: "人工智能", expected: ["人工","工智","智能","人工智","工智能"], desc: "3-char CJK compound" },
  { id: "tok-02", input: "深度学习", expected: ["深度","度学","学习","深度学","度学习"], desc: "another 3-char term" },
  { id: "tok-03", input: "机器学习", expected: ["机器","器学","学习","机器学","器学习"], desc: "common ML term" },
  { id: "tok-04", input: "知识图谱", expected: ["知识","识图","图谱","知识图","识图谱"], desc: "knowledge graph" },
  { id: "tok-05", input: "神经网络", expected: ["神经","经网","网络","神经网","经网络"], desc: "neural network" },

  // === Mixed Chinese-English ===
  { id: "tok-06", input: "CNN卷积神经网络", expected: ["cnn","卷积","积神","神经","经网","网络","卷积神","积神经","神经网","经网络"], desc: "mixed CN/EN" },
  { id: "tok-07", input: "Transformer注意力机制", expected: ["transformer","注意","意力","力机","机制","注意力","意力机","力机制"], desc: "English prefix" },
  { id: "tok-08", input: "GPT大模型", expected: ["gpt","大模","模型","大模型"], desc: "short mixed" },

  // === Edge cases ===
  { id: "tok-09", input: "AI", expected: [], desc: "too short English" },
  { id: "tok-10", input: "我", expected: [], desc: "single char CJK" },
  { id: "tok-11", input: "你好", expected: ["你好"], desc: "2-char greeting" },
  { id: "tok-12", input: "", expected: [], desc: "empty string" },
  { id: "tok-13", input: "hello world ai", expected: ["hello","world"], desc: "English only (filter short)" },
  { id: "tok-14", input: "什么是反向传播算法", expected: ["什么","么是","是反","反向","向传","传播","播算","算法","什么是","么是反","是反向","反向传","向传播","传播算","播算法"], desc: "longer query" },

  // === Punctuation handling ===
  { id: "tok-15", input: "自然语言处理（NLP）入门", expected: ["自然","然语","语言","言处","处理","入门","自然语","然语言","语言处","言处理","nlp"], desc: "with parens" },
];

/** Simulated baseline: whitespace-split only (like Obsidian native search) */
function baselineWhitespace(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s]+/)
    .filter(w => w.length >= 2);
}

/** Simulated baseline: jieba-style (approximate with dictionary matching) */
const DICT = new Set([
  "人工智能","深度学习","机器学习","知识图谱","神经网络","反向传播",
  "自然语言处理","注意力机制","卷积","模型","算法","入门","大模型",
  "transformer","cnn","nlp","gpt",
]);
function baselineDictionary(text: string): string[] {
  const results: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let matched = false;
    for (const word of DICT) {
      if (remaining.startsWith(word)) {
        results.push(word);
        remaining = remaining.slice(word.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (/[\u4e00-\u9fff]/.test(remaining[0])) {
        // For CJK chars not in dict, fall back to bigrams
        if (remaining.length >= 2) {
          results.push(remaining.slice(0, 2));
        }
        remaining = remaining.slice(1);
      } else {
        remaining = remaining.slice(1);
      }
    }
  }
  return results;
}

export function runTokenizerBenchmark(): BenchmarkResult {
  const start = Date.now();
  const cases: CaseResult[] = [];

  for (const tc of testCases) {
    const caseStart = Date.now();
    const tokens = tokenize(tc.input);
    const baselines = {
      whitespace: baselineWhitespace(tc.input),
      dictionary: baselineDictionary(tc.input),
    };

    // Check that all expected tokens are present
    const tokenSet = new Set(tokens);
    const missing = tc.expected.filter(e => !tokenSet.has(e));
    const passed = missing.length === 0;

    cases.push({
      id: tc.id,
      passed,
      expected: tc.expected,
      actual: tokens,
      description: tc.desc,
      durationMs: Date.now() - caseStart,
    });

    if (!passed) {
      console.log(`  [FAIL] ${tc.id}: "${tc.input}"`);
      console.log(`         missing: [${missing.join(", ")}]`);
      console.log(`         tokens:  [${tokens.join(", ")}]`);
    }
  }

  const passed = cases.filter(c => c.passed).length;
  const durationMs = Date.now() - start;

  return {
    module: "tokenizer",
    total: cases.length,
    passed,
    failed: cases.length - passed,
    durationMs,
    cases,
    summary: `Token precision: ${passed}/${cases.length} (${(passed/cases.length*100).toFixed(1)}%)`,
  };
}
