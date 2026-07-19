// ============================================================
// Search Precision Benchmark
// Compares CJK n-gram TF-IDF against baselines:
//   1. Simple keyword match (Obsidian native style)
//   2. jieba-style dictionary match (simulated)
// ============================================================
import { tokenize, simpleSearch } from "../config";
import { SEARCH_QUERIES } from "../test-cases/search-queries";
import type { SearchNote, CaseResult, BenchmarkResult } from "../types";

/** Baseline 1: substring match (simulates Obsidian native search) */
function baselineSubstring(query: string, notes: SearchNote[], topK = 5): Array<{ title: string; score: number }> {
  const qLower = query.toLowerCase();
  const scored: Array<{ title: string; score: number }> = [];

  for (const note of notes) {
    let score = 0;
    const titleLower = note.title.toLowerCase();
    const contentLower = note.content.toLowerCase();

    // Exact title match
    if (titleLower === qLower) score += 10;
    // Title contains query
    if (titleLower.includes(qLower)) score += 5;
    // Content contains query
    const contentMatches = (contentLower.match(new RegExp(qLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    score += contentMatches * 0.5;

    if (score > 0) scored.push({ title: note.title, score: Math.round(score * 100) / 100 });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/** Baseline 2: jieba dictionary match (simulated with prefix match) */
const DICT = new Set([
  "深度学习","卷积神经网络","Transformer","自然语言处理","Python","知识图谱",
  "Git","Linux","SQL","GAN","数学","数据库","注意力","LLM","PyTorch","Agent",
  "Docker","强化学习","大模型","CNN","BERT","GPT","YOLO","RAG","GNN","PCA",
  "SVD","ReAct","LoRA","Prompt","图神经网络","预训练","计算机视觉","微调",
  "模型","训练","部署","评估","笔记","基础","入门","详解","方法","原理",
]);

function baselineDictionary(query: string, notes: SearchNote[], topK = 5): Array<{ title: string; score: number }> {
  // Extract dict words from query
  const qWords: string[] = [];
  let remaining = query;
  while (remaining.length > 0) {
    let matched = false;
    for (const word of DICT) {
      if (remaining.toLowerCase().startsWith(word.toLowerCase())) {
        qWords.push(word);
        remaining = remaining.slice(word.length);
        matched = true;
        break;
      }
    }
    if (!matched) remaining = remaining.slice(1);
  }

  if (qWords.length === 0) return [];

  const scored: Array<{ title: string; score: number }> = [];

  for (const note of notes) {
    let score = 0;
    for (const w of qWords) {
      if (note.title.toLowerCase().includes(w.toLowerCase())) score += 3;
      const count = (note.content.toLowerCase().match(new RegExp(w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += count * 0.5;
    }
    if (score > 0) scored.push({ title: note.title, score: Math.round(score * 100) / 100 });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/** Calculate Precision@K: fraction of top-K results that are in ground truth */
function precisionAtK(predicted: string[], groundTruth: string[], k: number): number {
  if (k === 0 || predicted.length === 0) return 0;
  const topK = predicted.slice(0, k);
  const hits = topK.filter(t => groundTruth.includes(t)).length;
  return hits / Math.min(k, groundTruth.length || k);
}

/** Calculate Recall@K: fraction of ground truth found in top-K */
function recallAtK(predicted: string[], groundTruth: string[], k: number): number {
  if (groundTruth.length === 0) return predicted.length === 0 ? 1 : 0;
  const topK = predicted.slice(0, Math.min(k, predicted.length));
  const hits = topK.filter(t => groundTruth.includes(t)).length;
  return hits / groundTruth.length;
}

export async function runSearchBenchmark(): Promise<BenchmarkResult> {
  const start = Date.now();
  const cases: CaseResult[] = [];
  let totalPrecisionNgram = 0;
  let totalPrecisionSubstring = 0;
  let totalPrecisionDict = 0;
  let totalRecallNgram = 0;
  let totalRecallSubstring = 0;
  let totalRecallDict = 0;
  let count = 0;

  for (const q of SEARCH_QUERIES) {
    if (!q.query.trim()) continue; // skip empty
    const caseStart = Date.now();
    count++;

    const ngramResults = simpleSearch(q.query, q.notes, 5);
    const substringResults = baselineSubstring(q.query, q.notes, 5);
    const dictResults = baselineDictionary(q.query, q.notes, 5);

    const ngramTitles = ngramResults.map(r => r.title);
    const substringTitles = substringResults.map(r => r.title);
    const dictTitles = dictResults.map(r => r.title);

    const p5Ngram = precisionAtK(ngramTitles, q.groundTruth, 5);
    const p5Substring = precisionAtK(substringTitles, q.groundTruth, 5);
    const p5Dict = precisionAtK(dictTitles, q.groundTruth, 5);

    totalPrecisionNgram += p5Ngram;
    totalPrecisionSubstring += p5Substring;
    totalPrecisionDict += p5Dict;

    const r5Ngram = recallAtK(ngramTitles, q.groundTruth, 5);
    const r5Substring = recallAtK(substringTitles, q.groundTruth, 5);
    const r5Dict = recallAtK(dictTitles, q.groundTruth, 5);

    totalRecallNgram += r5Ngram;
    totalRecallSubstring += r5Substring;
    totalRecallDict += r5Dict;

    // A case passes if ngram is at least as good as the better baseline
    const betterBaseline = Math.max(p5Substring, p5Dict);
    const passed = p5Ngram >= betterBaseline;

    cases.push({
      id: q.id,
      passed,
      expected: `ground truth: [${q.groundTruth.join(", ")}]`,
      actual: `n-gram: P@5=${p5Ngram.toFixed(2)} R@5=${r5Ngram.toFixed(2)} | substring: P@5=${p5Substring.toFixed(2)} | dict: P@5=${p5Dict.toFixed(2)}`,
      description: `"${q.query}" (${q.category})`,
      durationMs: Date.now() - caseStart,
    });
  }

  const passed = cases.filter(c => c.passed).length;
  const durationMs = Date.now() - start;
  const avgPNgram = (totalPrecisionNgram / count * 100).toFixed(1);
  const avgPSubstring = (totalPrecisionSubstring / count * 100).toFixed(1);
  const avgPDict = (totalPrecisionDict / count * 100).toFixed(1);
  const avgRNgram = (totalRecallNgram / count * 100).toFixed(1);

  const avgRSubstring = (totalRecallSubstring / count * 100).toFixed(1);
  const avgRDict = (totalRecallDict / count * 100).toFixed(1);

  const summary = `Search P@5: n-gram=${avgPNgram}% substring=${avgPSubstring}% dict=${avgPDict}% | R@5: n-gram=${avgRNgram}% substring=${avgRSubstring}% dict=${avgRDict}%`;

  return {
    module: "search-precision",
    total: cases.length,
    passed,
    failed: cases.length - passed,
    durationMs,
    cases,
    summary,
  };
}
