<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.7-blue" alt="version">
  <img src="https://img.shields.io/badge/tests-131%20passed-green" alt="tests">
  <img src="https://img.shields.io/badge/license-MIT-brightgreen" alt="license">
  <img src="https://img.shields.io/badge/platform-Obsidian%201.5%2B-purple" alt="platform">
  <img src="https://img.shields.io/badge/benchmark-85%2F86%20passed-orange" alt="benchmark">
  <img src="https://img.shields.io/badge/Zenodo-10.5281%2Fzenodo.21442160-blue" alt="DOI">
</p>

# Multi-LLM AI Assistant — Obsidian Plugin

> **An AI-augmented knowledge management system built from first principles.**
> Designed end-to-end by a single author: multi-provider LLM routing, agentic tool-calling, CJK-optimized semantic search, and autonomous knowledge graph generation — all grounded in systematic benchmark evaluation.

<p align="center">
  <a href="https://qi-hub-dot.github.io/obsidian-multi-llm-ai-agent/">Demo</a> ·
  <a href="https://github.com/Qi-hub-dot/obsidian-multi-llm-ai-agent/releases">Releases</a> ·
  <a href="#-benchmark-results">Benchmarks</a> ·
  <a href="https://doi.org/10.5281/zenodo.21442160">Paper (DOI)</a>
</p>

---

## Why This Project Exists

Existing Obsidian AI plugins rely on OpenAI's API and assume English-language content. For Chinese-speaking knowledge workers, this creates three hard barriers: **network inaccessibility**, **privacy risks from uploading notes to foreign servers**, and **broken full-text search** — standard word-boundary tokenizers fail on CJK text that has no whitespace.

This plugin was designed from scratch to solve all three problems simultaneously. It provides a **unified adapter** across four LLM families (DeepSeek, Qwen, GLM-4, Ollama), a **custom CJK n-gram tokenizer** that outperforms baseline approaches by 3.3×, and an **autonomous agent loop** that lets the AI orchestrate vault operations rather than merely chat.

Every architectural decision was made independently — from the `<tool_call>` XML protocol (chosen over OpenAI Function Calling for cross-provider reliability) to the five-layer Canvas JSON error recovery strategy (designed after observing real-world LLM output failures). This is not a wrapper around an existing API; it is a system designed to solve an observed problem space.

---

## Key Design Decisions

| Decision | Why It Matters |
|---|---|
| Custom `<tool_call>` XML protocol over Function Calling | GLM-4 Function Calling is production-unstable; regex parsing is provider-agnostic and debuggable |
| CJK n-gram tokenizer with 3× title boost | Eliminates jieba dependency; achieves 83.3% P@5 vs. 25.5% for whitespace-based search |
| Five-layer Canvas JSON recovery | Real LLM outputs contain 5 distinct error classes; each requires a different recovery strategy |
| Client-side PII sanitization before API transmission | Privacy-by-design: phone, ID, email, and IP patterns stripped locally |
| Three-tier search degradation (API → ONNX → TF-IDF) | Graceful fallback when embedding services are unavailable or offline |
| LRU memory eviction at 80% threshold with hysteresis | Prevents unbounded context growth without thrashing |
| Zettelkasten + PARA + MOC encoded in system prompt | AI organizes notes according to established knowledge management methodology |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface (React)                   │
│              Chat · Canvas Preview · Quick Ask              │
├─────────────────────────────────────────────────────────────┤
│                   Agentic Loop (≤20 rounds)                 │
│   ┌─────────┐   ┌──────────┐   ┌────────┐   ┌──────────┐  │
│   │  Parse  │──▶│ Execute  │──▶│Inject  │──▶│ Generate │  │
│   │Tool Call│   │  Tool    │   │Result  │   │ Response │  │
│   └─────────┘   └──────────┘   └────────┘   └──────────┘  │
│        │              │                                    │
│        ▼              ▼                                    │
│  ┌──────────┐   ┌──────────────────────────┐              │
│  │  Regex + │   │     Tool Registry (9)     │              │
│  │GLM4 Fbck│   │ searchVault · readNote    │              │
│  └──────────┘   │ createNote · saveCanvas   │              │
│                 └──────────────────────────┘              │
├─────────────────────────────────────────────────────────────┤
│              Unified LLM Router (Adapter Pattern)          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│   │ DeepSeek │  │  Qwen    │  │  GLM-4   │  │  Ollama  │  │
│   │V4 Flash  │  │ qwen-max │  │glm-4-flash│  │ qwen2.5  │  │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
├─────────────────────────────────────────────────────────────┤
│         Semantic Search (3-Tier Degradation)               │
│   API Embedding → ONNX Local (384d) → TF-IDF (CJK n-gram) │
├─────────────────────────────────────────────────────────────┤
│         Privacy Layer (Client-Side Only)                   │
│   PII Sanitizer · LRU Memory Cache · ONNX (Offline)       │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Benchmark Results

Systematic evaluation against baselines (85/86 cases passed, 98.8%):

| Module | Cases | Passed | Pass Rate |
|---|---|---|---|
| Tokenizer Precision (CJK n-gram vs. whitespace) | 15 | 15 | 100% |
| Canvas JSON Robustness (adversarial inputs) | 10 | 10 | 100% |
| Tool Call Parser (standard + GLM-4 malformed) | 12 | 12 | 100% |
| Search Precision (49 queries, 30 notes) | 49 | 48 | 98.0% |

**Search Precision@5 and Recall@5:**

| Method | P@5 | R@5 |
|---|---|---|
| **CJK n-gram TF-IDF (ours)** | **83.3%** | **89.5%** |
| Substring match (Obsidian native) | 25.5% | 29.6% |
| Dictionary match (jieba-like) | 72.1% | 78.2% |

> Run: `npx tsx benchmark/runner.ts`

---

## 📸 Screenshots

| Knowledge Graph + AI Chat | Model Configuration |
|:---:|:---:|
| ![Canvas](screenshots/canvas.png) | ![Settings](screenshots/settings-deepseek.png) |

| Ollama Local Model | Privacy Controls |
|:---:|:---:|
| ![Ollama](screenshots/settings-ollama.png) | ![Privacy](screenshots/settings-privacy.png) |

---

## 🚀 Quick Start

1. Install from Obsidian Community Plugins (search "Multi-LLM Assistant"), or download the [latest release](https://github.com/Qi-hub-dot/obsidian-multi-llm-ai-agent/releases)
2. Configure one LLM provider (DeepSeek / Qwen / GLM-4 / Ollama)
3. Open the AI sidebar and start chatting
4. Try: "Create a note about X", "Search my vault for Y", "Draw a mind map about Z"

---

## 📁 Repository Structure

```
├── src/
│   ├── LLMProviders/    # Multi-provider adapter (DeepSeek/Qwen/GLM/Ollama)
│   ├── tools/           # Agentic tool registry + built-in tools
│   ├── rag/             # TF-IDF index, ONNX embeddings, hybrid search
│   ├── parsers/         # Multimodal file parsers (PDF/Word/Markdown)
│   ├── ui/              # React chat interface (TSX)
│   └── prompts.ts       # System prompt with Zettelkasten/PARA/MOC
├── benchmark/           # Systematic benchmark suite (4 modules, 86 cases)
├── paper/
│   └── paper.tex        # JOSS-format academic paper
├── docs/
│   ├── ARCHITECTURE.md  # Detailed architecture documentation
│   └── TECHNICAL_REPORT.md
├── main.ts              # Plugin entry point
└── manifest.json        # Obsidian plugin manifest
```

---

## 📄 Paper & Publication

A formal academic paper describing the system design, benchmark methodology, and results is available in `paper/paper.tex` (JOSS format). The software is archived at Zenodo:

> Cai, Y. (2026). *Multi-LLM AI Assistant: Obsidian Plugin v2.0.7* [Software]. Zenodo. [https://doi.org/10.5281/zenodo.21442160](https://doi.org/10.5281/zenodo.21442160)

---

## 🛠 Development

```bash
git clone https://github.com/Qi-hub-dot/obsidian-multi-llm-ai-agent.git
cd obsidian-multi-llm-ai-agent
npm install
npm run dev      # Watch mode
npm run build    # Production build → main.js
npx tsx benchmark/runner.ts  # Run benchmarks
```

---

## 📝 License

MIT © Yiqi Cai

---

## 🙏 Acknowledgements

The architecture design drew inspiration from [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) (Logan Yang, AGPL-3.0). All code is independently written; this project is not a fork.

---

## 👤 About the Author

I'm Yiqi Cai, a computer science student at South-Central Minzu University. I designed and built this project on my own to explore how AI can work with knowledge management tools in practice — specifically for Chinese-language workflows that existing plugins overlooked. If you're curious about the design choices or want to chat about the project, feel free to reach out.
