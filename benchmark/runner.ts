// ============================================================
// Benchmark Runner — main entry point
// Usage: npx tsx benchmark/runner.ts [--module=tokenizer] [--full] [--json]
// ============================================================
import { CONFIG } from "./config";
import { runTokenizerBenchmark } from "./modules/tokenizer";
import { runCanvasBenchmark } from "./modules/canvas-robustness";
import { runToolCallBenchmark } from "./modules/tool-call-parse";
import { runSearchBenchmark } from "./modules/search-precision";
import type { BenchmarkResult } from "./types";

function printHeader(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

function printResult(r: BenchmarkResult): void {
  const pct = ((r.passed / r.total) * 100).toFixed(1);
  const emoji = r.failed === 0 ? "✅" : "⚠️";
  console.log(`\n  ${emoji} ${r.summary}`);
  console.log(`  Duration: ${r.durationMs}ms`);
  
  // Per-case detail only on failure
  const failed = r.cases.filter(c => !c.passed);
  if (failed.length > 0) {
    console.log(`\n  Failed cases:`);
    for (const c of failed) {
      console.log(`    ❌ ${c.id}: ${c.description}`);
    }
  }
}

function printMarkdownTable(results: BenchmarkResult[]): void {
  console.log(`\n## Benchmark Results\n`);
  console.log(`| Module | Total | Passed | Failed | Pass Rate | Duration |`);
  console.log(`|--------|-------|--------|--------|-----------|----------|`);
  for (const r of results) {
    const pct = ((r.passed / r.total) * 100).toFixed(1);
    console.log(`| ${r.module} | ${r.total} | ${r.passed} | ${r.failed} | ${pct}% | ${r.durationMs}ms |`);
  }
}

function printJsonOutput(results: BenchmarkResult[]): void {
  const output = results.map(r => ({
    module: r.module,
    total: r.total,
    passed: r.passed,
    failed: r.failed,
    passRate: ((r.passed / r.total) * 100).toFixed(1) + "%",
    durationMs: r.durationMs,
    failedCases: r.cases.filter(c => !c.passed).map(c => ({ id: c.id, description: c.description })),
  }));
  console.log(JSON.stringify(output, null, 2));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const moduleFilter = args.find(a => a.startsWith("--module="))?.split("=")[1];
  const fullMode = args.includes("--full");
  const jsonMode = args.includes("--json");

  const modules = moduleFilter ? [moduleFilter] : CONFIG.modules;
  const results: BenchmarkResult[] = [];

  console.log("🧪 Obsidian AI Assistant — Benchmark Suite");
  console.log(`   Mode: ${moduleFilter ? "single (" + moduleFilter + ")" : "full"}`);
  console.log(`   Output: ${jsonMode ? "json" : "terminal"}`);

  for (const mod of modules) {
    switch (mod) {
      case "tokenizer": {
        if (!jsonMode) printHeader("1. Tokenizer Precision (CJK n-gram vs baselines)");
        const r = runTokenizerBenchmark();
        results.push(r);
        if (!jsonMode) printResult(r);
        break;
      }
      case "canvas-robustness": {
        if (!jsonMode) printHeader("2. Canvas JSON Robustness");
        const r = runCanvasBenchmark();
        results.push(r);
        if (!jsonMode) printResult(r);
        break;
      }
      case "tool-call-parse": {
        if (!jsonMode) printHeader("3. Tool Call Parser Robustness");
        const r = runToolCallBenchmark();
        results.push(r);
        if (!jsonMode) printResult(r);
        break;
      }
      case "search-precision": {
        if (!jsonMode) printHeader("4. Search Precision (CJK n-gram vs baselines)");
        const r = await runSearchBenchmark();
        results.push(r);
        if (!jsonMode) printResult(r);
        break;
      }
      default:
        console.log(`⚠️  Unknown module: "${mod}". Available: tokenizer, canvas-robustness, tool-call-parse, search-precision`);
    }
  }

  // Summary
  if (!jsonMode && results.length > 1) {
    printHeader("Summary");
    printMarkdownTable(results);
    const totalPassed = results.reduce((s, r) => s + r.passed, 0);
    const totalCases = results.reduce((s, r) => s + r.total, 0);
    console.log(`\n  Overall: ${totalPassed}/${totalCases} (${((totalPassed/totalCases)*100).toFixed(1)}%)`);
  }

  if (jsonMode) {
    printJsonOutput(results);
  }

  const hasFailures = results.some(r => r.failed > 0);
  if (hasFailures) {
    console.log("\n⚠️  Some tests failed. Review the output above.");
    process.exit(1);
  }
}

main().catch(console.error);
