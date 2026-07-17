# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2025-07-17

### Added
- Multi-provider support: DeepSeek, 通义千问 (Qwen), 智谱 GLM-4, Ollama local models
- AI Tool Calling system with 7 built-in tools (readNote, searchVault, createNote, appendNote, getFileTree, getTags, getCurrentTime)
- ReAct agent loop with up to 20 rounds and auto-termination after 2 consecutive no-tool rounds
- Multimodal file analysis: image recognition, PDF rendering, Word extraction
- Vault semantic search (TF-IDF) with Chinese/English tokenization
- Knowledge graph (Canvas) auto-generation from AI responses
- Conversation memory system with n-gram indexing and LRU eviction
- PII sanitization (phone, ID card, email, IP address)
- Web search integration (DuckDuckGo + Wikipedia)
- @mention autocomplete for notes, tags, and folders
- React-based sidebar UI with streaming output and reasoning panel
- File import and AI-powered atomic note splitting
- Summary generation, tag suggestion, and link suggestion commands
- Chat persistence (save/load conversations as Markdown)
- Custom System Prompt support
- Custom commands via Markdown templates

### Changed
- Complete rewrite from vanilla DOM to React 18
- Refactored API client to support OpenAI-compatible streaming
- Unified provider architecture with ChatModelManager

## [1.2.0] — 2025-06-01

### Added
- Initial public release
- DeepSeek API integration (chat + streaming)
- Basic note splitting and summarization
- Sidebar chat view
- Simple PII sanitization

[2.0.0]: https://github.com/Qi-hub-dot/obsidian-ai-assistant/releases/tag/v2.0.0
[1.2.0]: https://github.com/Qi-hub-dot/obsidian-ai-assistant/releases/tag/v1.2.0
