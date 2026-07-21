# Architecture Document — Multi-LLM AI Assistant (Obsidian Plugin v2.0)

> **Designed & Architected by Yiqi Cai** — A graduate portfolio project demonstrating system design, independent problem-solving, and research methodology in AI-augmented knowledge management.

---

## 一、系统概览

本插件是 Obsidian（基于 Electron 的本地知识库）的**侧边栏 AI 助手**。用户可在编辑笔记的同时与 AI 对话，AI 能直接操作 Vault（搜索、创建、修改笔记）并生成知识图谱。

```mermaid
graph TB
    subgraph Obsidian["Obsidian App"]
        MD["Markdown 编辑器"]
        FL["文件浏览器"]
        SB["AI 助手侧边栏<br/>(React 18)"]
    end

    subgraph Plugin["插件核心"]
        direction TB
        MAIN["Plugin Entry<br/>main.ts"]
        LLM["LLM Providers<br/>ChatModelManager"]
        TOOLS["Tool System<br/>ToolRegistry + 9 tools"]
        RAG["RAG Engine<br/>TF-IDF + Embedding"]
        PPL["Pipeline<br/>笔记拆分/摘要/标签"]
    end

    subgraph External["外部服务"]
        DS["DeepSeek API"]
        QW["通义千问 API"]
        GLM["智谱 GLM API"]
        OL["Ollama 本地"]
    end

    SB -->|React 渲染| MAIN
    MAIN --> LLM
    MAIN --> TOOLS
    MAIN --> RAG
    LLM --> DS & QW & GLM & OL
    TOOLS -->|read/create/modify| FL
    RAG -->|语义检索| FL
    PPL --> LLM
```

---

## 二、模块结构

```
obsidian-ai-assistant/
├── main.ts              # 插件入口，生命周期管理
├── src/
│   ├── api.ts           # OpenAI 兼容 HTTP 客户端 (SSE 流式)
│   ├── types.ts         # 类型定义 (ChatMessage, DeepSeekError...)
│   ├── constants.ts     # 视图类型、命令 ID
│   ├── settings.ts      # 设置面板 + 配置模型
│   ├── sidebar.ts       # Obsidian ItemView (React 挂载点)
│   ├── commands.ts      # 命令注册 (快捷操作)
│   ├── pipeline.ts      # 笔记处理流水线
│   ├── memory.ts        # LRU 记忆缓存
│   ├── sanitizer.ts     # PII 脱敏引擎
│   ├── web-search.ts    # 联网搜索
│   │
│   ├── LLMProviders/
│   │   └── chatModelManager.ts  # 多模型路由器
│   │
│   ├── tools/
│   │   ├── ToolRegistry.ts      # 工具注册表 (单例)
│   │   ├── toolCallParser.ts    # <tool_call> 解析 + 提示生成
│   │   └── builtinTools.ts      # 9 个内置工具 + normalizeCanvasJSON
│   │
│   ├── ui/
│   │   ├── Chat.tsx             # 聊天主组件 (工具调用循环)
│   │   ├── ChatInput.tsx        # 输入框 + 附件
│   │   ├── ChatMessage.tsx      # 消息气泡
│   │   ├── ChatHistory.tsx      # 历史对话列表
│   │   ├── chat-view.ts         # Obsidian ItemView 注册
│   │   ├── canvas-preview-modal.ts
│   │   ├── preview-modal.ts
│   │   └── suggestion-list.ts
│   │
│   ├── search/
│   │   └── vaultSearch.ts       # TF-IDF + CJK n-gram
│   │
│   ├── rag/
│   │   ├── embedding/types.ts
│   │   ├── embedding/ApiEmbeddingProvider.ts
│   │   ├── vectorstore/FlatVectorStore.ts
│   │   ├── HybridSearcher.ts    # TF-IDF + Embedding 混合检索
│   │   ├── RAGManager.ts        # RAG 编排器
│   │   └── index.ts
│   │
│   ├── parsers/
│   │   ├── index.ts             # 解析器路由
│   │   ├── markdown.ts
│   │   ├── pdf.ts
│   │   ├── docx.ts
│   │   └── text.ts
│   │
│   ├── mentions/
│   │   └── mentionProvider.ts
│   │
│   ├── editor/
│   │   └── quickAsk.ts
│   │
│   ├── commands/
│   │   └── customCommandManager.ts
│   │
│   └── core/
│       └── chatPersistence.ts   # 对话持久化
│
├── styles.css           # 全局样式
├── manifest.json        # Obsidian 插件清单
└── esbuild.config.mjs   # 构建配置
```

---

## 三、核心架构模式

### 3.1 工具调用循环 (Agentic Loop)

插件不是简单的"请求-响应"，而是实现了一个**自主代理循环**：

```mermaid
sequenceDiagram
    participant U as 用户
    participant C as Chat.tsx
    participant LLM as AI 模型
    participant TR as ToolRegistry
    participant V as Obsidian Vault

    U->>C: 输入问题
    C->>C: 构建 System Prompt<br/>(工具定义 + 当前笔记 + RAG 上下文)
    C->>LLM: HTTP POST (SSE 流式)

    loop 工具调用循环 (max 20 轮)
        LLM-->>C: 流式返回文本
        C->>C: Canvas JSON 自动检测
        C->>C: 解析 <tool_call> 块
        alt 有工具调用
            C->>TR: 执行工具
            TR->>V: 读/写/搜索
            V-->>TR: 结果
            TR-->>C: 工具输出
            C->>LLM: 注入结果，继续
        else 无工具调用
            C->>U: 展示最终回答
        end
    end
```

### 3.2 多模型适配器

```mermaid
graph LR
    C["Chat.tsx 调用"] --> CM["ChatModelManager"]
    CM -->|"provider=deepseek"| DS["DeepSeek API<br/>/v1/chat/completions"]
    CM -->|"provider=qwen"| QW["通义千问 API<br/>/compatible-mode/v1"]
    CM -->|"provider=glm"| GL["智谱 GLM API<br/>/api/paas/v4"]
    CM -->|"provider=ollama"| OL["Ollama 本地<br/>http://localhost:11434"]
```

所有模型均使用 **OpenAI 兼容格式**，差异仅在于 `baseUrl`、`apiKey` 和 `model` 名称。`ChatModelManager` 提供统一接口 `chat(messages, provider, options)`。

### 3.3 工具系统

工具通过 `ToolRegistry` (单例) 注册，每个工具定义为 `{ name, description, parameters, execute }`：

| 工具 | 类型 | 功能 |
|------|------|------|
| `listNotes` | 读 | 递归列出全部 .md 笔记 |
| `readNote` | 读 | 读取指定笔记全文 |
| `searchVault` | 读 | TF-IDF 全文搜索 |
| `createNote` | 写 | 创建笔记 (自动创建父目录) |
| `modifyNote` | 写 | 覆盖写入笔记 |
| `appendNote` | 写 | 追加到笔记末尾 |
| `getFileTree` | 读 | 浏览目录结构 |
| `getTags` | 读 | 列出全部标签 |
| `saveCanvas` | 写 | 保存知识图谱为 .canvas |

AI 通过 `<tool_call>` XML 标签格式调用工具。`toolCallParser.ts` 负责：
- **解析**：正则匹配 `<tool_call>` → JSON.parse → 执行
- **提示生成**：`buildToolsPrompt()` 动态生成包含工具列表、决策表、笔记方法论（Zettelkasten/PARA/MOC）和知识图谱指南的 System Prompt

### 3.4 知识图谱 (Canvas) 生成

一个出彩的设计点——AI 输出的原始 JSON 往往格式不规范（错误的 type、边混入节点数组等），插件通过多层容错处理：

```
AI 输出 (任意格式: 代码块/裸JSON/工具调用)
  → extractCanvasJSON() 多候选括号计数提取
  → JSON.parse 验证
  → normalizeCanvasJSON() 格式规范化
     ├─ 边从 nodes 中分离
     ├─ 非标准 type → "text"
     ├─ 节点 ID 重编号
     ├─ 通过 text 标签映射边引用
     └─ 缺失属性默认值填充
  → vault.create(.canvas)
  → 自动打开画布
  → 聊天区替换原始 JSON 为可点击链接
```

### 3.5 RAG 语义检索

```
用户提问
  → TF-IDF 快速召回 (CJK n-gram 分词)
  → [可选] Embedding 向量检索 (通义千问/GLM API)
  → 加权融合排序 (默认 0.3 TF-IDF + 0.7 Embedding)
  → Top-5 结果注入 System Prompt
  → AI 基于检索结果回答
```

---

## 四、数据流

```mermaid
flowchart LR
    subgraph Input
        Q["用户提问"]
        N["当前笔记内容"]
        A["附件 (图片/PDF/Word)"]
    end

    subgraph Context["上下文构建 (buildApi)"]
        SP["System Prompt<br/>(含工具定义)"]
        RAG["RAG 检索结果<br/>(Top-5 相关笔记)"]
        MEM["记忆缓存"]
    end

    subgraph AI["AI 推理"]
        LLM["多模型路由"]
    end

    subgraph Tool["工具执行"]
        TR["ToolRegistry.execute()"]
    end

    subgraph Output
        REP["文本回答"]
        CANVAS["知识图谱 .canvas"]
        NOTE["新/修改的笔记"]
    end

    Q & N & A --> Context
    Context --> AI
    AI -->|"<tool_call>"| Tool
    Tool -->|结果| AI
    AI --> REP & CANVAS & NOTE
```

---

## 五、技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Obsidian Plugin API v1.5+, Electron |
| UI | React 18 + JSX (esbuild 编译) |
| 语言 | TypeScript 5.3+ (strict mode) |
| 构建 | esbuild (CJS bundle, ~1.1MB) |
| 测试 | Jest 30 + ts-jest (119 用例) |
| AI 协议 | OpenAI-compatible REST + SSE |
| 存储 | Obsidian Vault API (Markdown + Canvas JSON) |
| 搜索 | 自研 TF-IDF + CJK n-gram 分词器 |
| 向量 | FlatVectorStore + 余弦相似度 (可选) |

---

## 六、设计原则

1. **宽容输入，规范输出**：AI 输出格式不可控（不同模型行为各异），插件端做最大限度的格式修复
2. **先搜索再创建**：创建笔记前搜索 Vault 避免重复，找到的笔记自动 `[[链接]]`
3. **单例模式**：ToolRegistry 全局唯一，避免注册表碎片化
4. **渐进增强**：RAG 在无 Embedding API 时自动降级为纯 TF-IDF
5. **用户语言跟随**：AI 回复语言与用户输入保持一致
