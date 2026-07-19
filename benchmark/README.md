# Benchmark Suite

评测框架，用于测试 Obsidian AI Assistant 插件的核心模块鲁棒性。

## 运行

```bash
# 全量运行
npx tsx benchmark/runner.ts

# 单个模块
npx tsx benchmark/runner.ts --module=tokenizer
npx tsx benchmark/runner.ts --module=canvas-robustness
npx tsx benchmark/runner.ts --module=tool-call-parse
npx tsx benchmark/runner.ts --module=search-precision

# JSON 输出（用于论文数据提取）
npx tsx benchmark/runner.ts --json --module=search-precision

# 完整运行（含搜索精度）
npx tsx benchmark/runner.ts --full
```

## 模块说明

| 模块 | 文件 | 测试数 | 对比基线 |
|---|---|---|---|
| Tokenizer Precision | `modules/tokenizer.ts` | 15 | whitespace / dictionary |
| Canvas Robustness | `modules/canvas-robustness.ts` | 10 | 无（纯鲁棒性测试） |
| Tool Call Parser | `modules/tool-call-parse.ts` | 12 | 无（纯鲁棒性测试） |
| Search Precision | `modules/search-precision.ts` | 49 | substring / dictionary |

## 测试数据

- `test-cases/search-queries.ts`：50 条中文检索 query + 30 篇模拟笔记 + ground truth

## 论文数据

运行全量 benchmark 后，将 `search-precision` 模块输出的 P@5 和 R@5 填入 `paper/paper.tex` 的 Table 2。
