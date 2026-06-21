# DeepSeek AI 助手 — Obsidian 插件

将 DeepSeek V4 大模型深度嵌入 Obsidian，实现AI 对话、Vault 全文检索、智能笔记生成、知识图谱绘制，让 AI 真正「读懂」你的知识库。

## ✨ 功能

### 💬 AI 对话
| 功能 | 描述 |
|------|------|
| 流式对话 | 实时打字效果，Markdown 完整渲染（表格/公式/代码/引用/Callout） |
| Vault 感知 | 每条消息自动全文搜索笔记，AI 知晓你的知识库内容 |
| 显式读笔记 | 说「读一下 XX 笔记」即可注入笔记全文到上下文 |
| 多轮对话 | 上下文连续，追问不丢失 |
| 缓存优化 | 系统提示词 Prompt Caching，降低 token 消耗 |

### 🆕 会话管理
| 功能 | 描述 |
|------|------|
| 新建会话 | ➕ 一键开始新对话 |
| 历史恢复 | 自动保存最近 5 个对话，点击即恢复 |
| 持久化 | 切换笔记不丢失对话，只有「新建会话」才清空 |

### 📝 笔记生成
| 功能 | 描述 |
|------|------|
| 智能触发 | 说「生成笔记 / 创建笔记」即自动保存为 .md 到 Knowledge/ 目录 |
| 规范格式 | 自动添加 frontmatter（title/date/tags）+ [[wikilink]] |
| 框架摘要 | 对话框仅显示标题结构+要点，完整内容在笔记中查看 |
| 普通对话 | 不自动建笔记，只展示完整回答 |

### 🧠 知识图谱
| 功能 | 描述 |
|------|------|
| Canvas 生成 | 对笔记内容生成 MECE 思维导图，自动节点布局 |
| 进度条 | 生成过程显示动画进度条 |
| 一键应用 | 对话框内点击按钮即可生成 |

### 📥 知识库工具
| 功能 | 描述 |
|------|------|
| 文件导入拆分 | .md / .txt / .pdf / .docx → AI 按主题拆分为原子笔记 |
| 摘要生成 | 选中笔记，一键生成简洁/详细/大纲摘要 |
| 智能标签 | AI 推荐 5-10 个 frontmatter 标签 |
| 双向链接 | 发现笔记间隐含关联，建议 `[[wikilink]]` |
| 内容润色 | 语句优化 / 精简 / 扩展 / 修正语法 |
| 隐私脱敏 | 本地过滤手机号/身份证/邮箱/IP，规则可独立开关 |

## 🚀 安装

### 手动安装

```bash
cd /path/to/your/vault/.obsidian/plugins
mkdir obsidian-deepseek-organizer
cd obsidian-deepseek-organizer
# 复制构建产物
cp main.js styles.css manifest.json .
```

重启 Obsidian → 设置 → 社区插件 → 启用「DeepSeek AI 助手」

### 开发构建

```bash
git clone https://github.com/Qi-hub-dot/obsidian-deepseek-organizer.git
cd obsidian-deepseek
npm install
npm run dev          # 监听模式
npm run build        # 生产构建
```

## ⚙️ 配置

设置 → DeepSeek 知识库整理：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API Base URL | DeepSeek API 端点 | `https://api.deepseek.com` |
| API Key | DeepSeek API 密钥 | — |
| 模型 | deepseek-chat / deepseek-reasoner | `deepseek-chat` |
| 脱敏开关 | PII 本地过滤 | ✅ 开启 |
| 目标目录 | 笔记保存位置 | `Knowledge` |

支持环境变量 `DEEPSEEK_API_KEY`（优先级高于设置面板）。

## 🏗 技术架构

```
TypeScript + esbuild
├── main.ts          插件入口
├── src/
│   ├── api.ts       DeepSeekClient (fetch + SSE 流式)
│   ├── sidebar.ts   侧边栏视图 + Vault 搜索 + 会话管理
│   ├── pipeline.ts  导入/摘要/标签/润色流水线
│   ├── sanitizer.ts PII 脱敏引擎
│   ├── prompts.ts   Prompt 模板
│   ├── memory.ts    对话记忆
│   ├── parsers/     文件解析器 (md/txt/pdf/docx)
│   └── ui/          chat-view、预览、Canvas
├── styles.css       纯 CSS（无框架依赖）
└── main.js          esbuild 打包产物
```

## 📄 许可证

MIT
