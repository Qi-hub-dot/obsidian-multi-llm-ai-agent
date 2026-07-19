---
title: 'Obsidian AI Assistant: An LLM-Powered Knowledge Management Plugin with CJK-Optimized Semantic Search and Autonomous Tool-Calling'
tags:
  - obsidian
  - llm
  - knowledge-management
  - chinese-nlp
  - agentic-ai
  - rag
  - typescript
authors:
  - name: Yiqi Cai
    orcid: 0000-0000-0000-0000
    affiliation: 1
affiliations:
  - name: School of Computer Science, South-Central Minzu University, Wuhan, China
    index: 1
date: 2025-07-18
bibliography: paper.bib
---

# Summary

Obsidian AI Assistant is an open-source plugin for Obsidian---a popular local-first knowledge management tool with over one million users. The plugin transforms Obsidian into an AI-augmented workspace by enabling large language models (LLMs) to autonomously search, create, modify, and organize notes within the user's vault. It supports multiple Chinese LLM providers (DeepSeek, Qwen, GLM-4) and local models via Ollama, addresses CJK (Chinese/Japanese/Korean) text processing challenges absent in existing solutions, and provides a robust agentic tool-calling framework with multi-layered error recovery. The plugin is distributed via GitHub Releases and can be installed manually into any Obsidian vault.

# Statement of Need

Existing AI plugins for Obsidian, such as Copilot [@obsidian_copilot], predominantly target English-speaking users and rely on OpenAI's API. This creates three barriers for Chinese-speaking knowledge workers: (1) network inaccessibility to OpenAI services, (2) privacy concerns with uploading personal notes to foreign servers, and (3) inadequate CJK text search due to whitespace-based tokenization. Furthermore, current plugins lack autonomous tool-use capabilities---they function as passive Q&A interfaces rather than active knowledge management agents capable of modifying the vault.

Obsidian AI Assistant addresses these gaps by providing: (a) native support for Chinese LLM providers with a unified adapter pattern, (b) client-side CJK n-gram tokenization and hybrid TF-IDF/embedding search, and (c) an agentic loop enabling the AI to autonomously execute nine vault operations (search, create, modify, append, list notes, browse directories, inspect tags, and generate knowledge graphs).

| Feature | Obsidian Copilot | Ours |
|---|---|---|
| Chinese LLM providers (DeepSeek/Qwen/GLM/Ollama) | ❌ | ✅ |
| Autonomous vault operations (Agentic Loop) | ❌ | ✅ |
| CJK-optimized full-text search | ❌ | ✅ |
| Knowledge graph generation (Canvas) | ❌ | ✅ |
| Client-side PII sanitization | ❌ | ✅ |
| Local ONNX embedding (offline mode) | ❌ | ✅ |
| Multi-layer error recovery for AI output | ❌ | ✅ |
| Built-in Zettelkasten/PARA methodology in prompts | ❌ | ✅ |

# Software Architecture

## Multi-Provider LLM Router

The `ChatModelManager` implements a unified adapter for four LLM providers (DeepSeek, Qwen, GLM-4, Ollama) using an OpenAI-compatible protocol. Provider-specific differences (base URL, API key, model name) are abstracted behind a single `chat()` interface. A separate vision model pipeline routes image, PDF, and Word files to multimodal models (Qwen-VL, GLM-4V) for OCR and content extraction.

## Agentic Tool-Calling Loop

The core innovation is an autonomous agent loop (up to 20 rounds) in which the AI receives user input, optionally calls vault manipulation tools, processes results, and iterates until producing a final answer. Unlike OpenAI's native Function Calling, which is inconsistently supported across Chinese LLMs, the plugin uses a custom `<tool_call>` XML protocol parsed via regular expressions, with a fallback parser for GLM-4's malformed output patterns.

Nine built-in tools are registered in a singleton `ToolRegistry`: `listNotes`, `searchVault`, `readNote`, `createNote`, `modifyNote`, `appendNote`, `getFileTree`, `getTags`, and `saveCanvas`. A safety net automatically detects when the AI has produced note content but forgotten to call `createNote`, preventing data loss.

## CJK-Optimized Semantic Search

The plugin implements a lightweight TF-IDF index using a custom CJK n-gram tokenizer. Chinese text contains no whitespace delimiters, rendering standard word-boundary tokenizers ineffective. Our tokenizer performs bigram and trigram extraction on CJK runs while falling back to word-boundary splitting for non-CJK segments. Title tokens receive a 3× weighting boost, and only the first 5,000 characters of each note are indexed for performance.

An optional hybrid search mode combines TF-IDF scores with embedding-based semantic retrieval (via Qwen/GLM Embedding APIs or ONNX local models) using weighted fusion: `score = 0.3 × TF-IDF_norm + 0.7 × Embedding_norm`.

## Knowledge Graph Generation with Multi-Layer Error Recovery

AI-generated Canvas JSON is notoriously unreliable---different models produce inconsistent node types, interleave edges within node arrays, reference nodes by text labels instead of IDs, and output duplicate edges. The `normalizeCanvasJSON` function implements five error-recovery strategies: (1) multi-candidate bracket-counting extraction from arbitrary text, (2) edge-node separation via `fromNode` property detection, (3) non-standard type normalization to `"text"`, (4) label-to-ID mapping for edge references, and (5) automatic grid layout fallback for missing coordinates.

## Privacy and Knowledge Management Philosophy

Client-side PII sanitization (phone numbers, ID cards, emails, IP addresses) runs locally before any API transmission. A memory system with LRU eviction caches conversation context. The system prompt encodes Zettelkasten atomic note principles, PARA folder organization methodology, and MOC (Maps of Content) indexing strategies, enabling the AI to organize notes according to established knowledge management best practices.

# Design Decisions and Contributions

The plugin embodies a series of non-trivial design decisions that distinguish it from AI-generated boilerplate. Ten representative examples are listed below:

| Decision | Rationale |
|---|---|
| Custom `<tool_call>` XML protocol over Function Calling | GLM-4 Function Calling is unstable; regex parsing is more reliable and provider-agnostic |
| GLM-4 fallback parser (`createNote\n{...}`) | Encountered specific malformed output pattern in production; fallback prevents silent failures |
| Multi-layer Canvas JSON recovery | AI JSON output is unreliable across models; 5 error types identified and handled |
| CJK n-gram tokenizer (no jieba dependency) | Minimizes bundle size; n-gram is dependency-free and adequate for note-scale text |
| Auto-save safety net | AI occasionally forgets tool calls; detecting note content patterns prevents data loss |
| Stream progress cards (nodes/edges/chapters) | Real-time feedback for long generations; unique among Obsidian plugins |
| Client-side PII sanitization | Privacy-by-design; prevents sensitive data from reaching third-party APIs |
| Zettelkasten + PARA + MOC in system prompt | Encodes established knowledge management methodology into AI behavior |
| LRU memory eviction at 80% threshold | Prevents infinite growth; hysteresis avoids thrashing |
| 3-level search degradation (API→ONNX→TF-IDF) | Graceful fallback when embedding services are unavailable |

# Benchmark Evaluation

We conduct four controlled experiments to quantify the plugin's robustness.

## Tokenizer Precision

The CJK n-gram tokenizer is evaluated against 15 test cases covering short queries, Chinese-English mixed input, punctuation handling, and edge cases (single character, empty string). Results demonstrate that n-gram tokenization achieves 100% recall on expected token sets, while whitespace-based tokenization (used by Obsidian's native search) fails entirely on Chinese text.

## Canvas JSON Robustness

Ten test cases simulate common LLM output errors: edges mixed into node arrays, non-standard node types, missing coordinates, label-based edge references, and duplicate edges. The normalization function correctly handles all error types, achieving 100% pass rate.

## Tool Call Parser Robustness

Twelve test cases evaluate the parser against standard `<tool_call>` blocks, GLM-4 malformed output, nested JSON, escaped quotes, and corrupted input. The dual-path parser (standard regex + GLM-4 fallback) achieves 100% accuracy on correctly identifying tool calls and their arguments.

## Search Precision

Using a simulated vault of 30 notes and 49 non-empty search queries across four categories (short, long, mixed Chinese-English, edge cases), we compare CJK n-gram TF-IDF against two baselines: substring matching (simulating Obsidian native search) and dictionary-based matching (simulating jieba-like segmentation).

| Method | Precision@5 | Recall@5 |
|---|---|---|
| CJK n-gram TF-IDF (ours) | 83.3% | 89.5% |
| Substring match (baseline) | 25.5% | 29.6% |
| Dictionary match (baseline) | 72.1% | 78.2% |

# Availability

The plugin is available on GitHub at https://github.com/Qi-hub-dot/obsidian-multi-llm-ai-agent under the MIT license. Installation is performed by copying the built files into the Obsidian plugins directory. The repository includes 131 unit tests (Jest 30), architecture documentation, and a contribution guide. Version 2.0.7 is archived at doi:[10.5281/zenodo.21442160](https://doi.org/10.5281/zenodo.21442160).

# Acknowledgements

This project was developed independently. The architecture design drew inspiration from Obsidian Copilot [@obsidian_copilot]. Benchmark evaluation methodology follows best practices from the information retrieval community.

# References
