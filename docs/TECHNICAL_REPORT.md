# 技术报告 — AI 助手 (Obsidian Plugin v2.0)

> **项目定位**：面向香港高校 AI/CS 硕士申请的展示项目  
> **GitHub**：[Qi-hub-dot/obsidian-ai-assistant](https://github.com/Qi-hub-dot/obsidian-ai-assistant)  
> **插件 ID**：`obsidian-deepseek-organizer`（已上架 Obsidian 社区插件市场）

---

## 一、项目背景

Obsidian 是知识管理领域最流行的本地优先笔记工具，拥有超过 100 万用户和 2000+ 社区插件。现有 AI 插件多依赖 OpenAI API，存在网络不可达、隐私顾虑和中文支持不足的问题。本项目构建了一个**国产大模型优先**的 AI 知识助手，填补了 DeepSeek/通义千问/智谱 GLM 在 Obsidian 生态中的空白。

## 二、解决的问题

| 问题 | 现有方案局限 | 本插件方案 |
|------|-------------|-----------|
| AI 无法操作笔记 | 手动复制粘贴 | **Agentic Loop**：AI 自主搜索、创建、修改 Vault 笔记 |
| 国产模型集成困难 | 仅支持 OpenAI | **统一适配器**：DeepSeek/Qwen/GLM/Ollama 一键切换 |
| 笔记冗余混乱 | 无组织 | **Zettelkasten + PARA 方法论注入 System Prompt** |
| 知识可视化缺失 | 无 | AI 生成 **Obsidian Canvas 思维导图**，含容错格式修复 |
| 中文检索不准确 | 英文分词器 | 自研 **CJK n-gram 分词器** + TF-IDF + 向量混合检索 |
| 隐私泄露风险 | 明文传输 | 客户端 **PII 脱敏**（手机号/身份证/邮箱/IP） |

## 三、技术架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────┐
│                  Obsidian App                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 编辑器    │  │ 文件列表  │  │ AI 侧边栏    │  │
│  │          │  │          │  │ (React 18)   │  │
│  └──────────┘  └──────────┘  └──────┬───────┘  │
│                                     │           │
│  ┌──────────────────────────────────┼───────┐   │
│  │           插件核心                │       │   │
│  │  ┌──────────┐ ┌────────┐ ┌──────┴─────┐│   │
│  │  │ LLM 路由 │ │ 工具系统│ │ RAG 检索   ││   │
│  │  │ 4 模型   │ │ 9 工具 │ │TF-IDF+向量 ││   │
│  │  └──────────┘ └────────┘ └────────────┘│   │
│  └────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │ HTTP (SSE)
┌──────────────────────┴──────────────────────────┐
│  DeepSeek  │  通义千问  │  智谱 GLM  │  Ollama  │
└─────────────────────────────────────────────────┘
```

### 3.2 核心技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| UI 框架 | React 18 (内嵌) | Obsidian 不限制 UI 框架，React 组件化便于流式更新 |
| 构建工具 | esbuild | TypeScript → CJS bundle，冷构建 ~100ms |
| 工具调用协议 | 自定义 `<tool_call>` XML | 国产模型 Function Calling 支持不稳定，正则解析更可控 |
| 知识图谱格式 | Obsidian Canvas JSON 1.0 | 内置格式，无需额外渲染引擎 |
| 分词器 | CJK n-gram (N=2) | 中文无空格分隔，n-gram 是最小依赖方案 |
| 向量存储 | FlatVectorStore | 规模 < 5000 篇笔记时暴力搜索足够快，无数据库依赖 |

### 3.3 Agentic Loop（自主代理循环）

这是本插件最核心的创新——AI 不是简单的问答机器，而是能**自主操作 Obsidian Vault** 的代理：

```
用户提问
  → 构建上下文 (System Prompt + 当前笔记 + RAG 检索结果)
  → 发送到 AI 模型
  → ┌─ 循环 (最多 20 轮) ───────────────────┐
    │ AI 输出文本                              │
    │ 检测是否包含知识图谱 JSON → 自动保存       │
    │ 解析 <tool_call> XML 块                  │
    │ ├─ 有工具调用 → 执行 → 注入结果 → 继续    │
    │ └─ 无工具调用 → 展示结果 → 结束           │
    └──────────────────────────────────────────┘
```

**工具列表**：`listNotes`（浏览全部笔记）、`searchVault`（全文搜索）、`readNote`（读取）、`createNote`（创建）、`modifyNote`（修改）、`appendNote`（追加）、`getFileTree`（目录）、`getTags`（标签）、`saveCanvas`（知识图谱）

### 3.4 Canvas 知识图谱容错系统

这是项目中最能体现工程鲁棒性的设计——AI 模型输出的知识图谱 JSON 格式极不可控：

| AI 常见错误 | 容错处理 |
|------------|---------|
| `type: "core"/"branch"/"leaf"` 而非标准 `"text"` | 统一归一化为 `"text"` |
| 边 (edge) 混入 `nodes` 数组 | 通过 `fromNode` 属性分离到 `edges` |
| 边引用使用被重编号前的旧 ID | 建立 label→ID 映射表自动转换 |
| 节点缺失坐标信息 | 自动网格布局 (3 列，x 间隔 300px，y 间隔 120px) |
| 重复边 | `fromNode→toNode` 键去重 |

**提取策略**：采用多候选括号计数算法——从 `"nodes"` 关键词向前回溯，收集所有 `{` 候选起点，逐个提取平衡 JSON 并验证 `nodes` 数组，返回第一个合法结果。

### 3.5 RAG 混合检索

- **TF-IDF 索引**：自研 CJK n-gram 分词器（二元组 + 三元组混合），构建 Vault 全量倒排索引
- **向量检索**（可选）：通过通义千问/智谱 GLM Embedding API 生成 1024/1536 维向量，FlatVectorStore 余弦相似度匹配
- **加权融合**：`score = 0.3 × TF-IDF_norm + 0.7 × Embedding_norm`
- **增量更新**：监听 Vault 文件事件（create/modify/delete），实时更新索引

## 四、工程实践

| 维度 | 实现 |
|------|------|
| 测试 | Jest 30 + ts-jest，119 个单元测试，覆盖工具系统/解析器/脱敏/知识图谱规范化 |
| 构建 | esbuild 监听模式 + production minify，构建产物 ~1.1MB |
| 版本管理 | Git + 语义化版本 (v2.0.0) + CHANGELOG |
| 开源规范 | AGENTS.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md / SECURITY.md / Issue & PR 模板 |
| 类型安全 | TypeScript strict mode，零 `any` 滥用 |
| 错误处理 | 自定义 `DeepSeekError` 层次，统一用户提示 |

## 五、技术栈总览

| 类别 | 技术 |
|------|------|
| Runtime | Obsidian Plugin API v1.5+ |
| Language | TypeScript 5.3 (strict) |
| UI | React 18 + JSX |
| Build | esbuild (CJS) |
| Test | Jest 30 + ts-jest |
| AI Protocol | OpenAI-compatible REST + SSE streaming |
| Search | 自研 CJK n-gram + TF-IDF |
| Vector | Cosine similarity + FlatVectorStore |
| Storage | Obsidian Vault (Markdown + Canvas JSON) |

## 六、反思与展望

### 已达成
- ✅ 4 个国产大模型无缝切换
- ✅ 9 个 Vault 操作工具，AI 自主调用
- ✅ 知识图谱生成 + 多层容错
- ✅ CJK 混合搜索引擎
- ✅ 119 个单元测试，零回归

### 待改进
- 本地 ONNX Embedding（消除 API 依赖）
- 多轮对话记忆压缩（长上下文优化）
- 移动端适配

### 申请意向
本项目展示了我在 **TypeScript 工程化**、**NLP 分词与检索**、**LLM 应用架构** 和 **人机交互设计** 方面的综合能力，希望能为贵校 AI 方向的研究生学习打好工程基础。
