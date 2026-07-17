# 贡献指南

欢迎为 AI 助手 (Obsidian AI Assistant) 贡献代码！

## 环境准备

```bash
git clone https://github.com/Qi-hub-dot/obsidian-ai-assistant.git
cd obsidian-ai-assistant
npm install
```

需要 Node.js >= 20。

## 开发

```bash
npm run dev     # 监听模式，修改代码后自动构建
npm run build   # 生产构建（含类型检查）
npm test        # 运行测试
```

构建产物 `main.js` 会自动生成在项目根目录。将此文件连同 `styles.css` 和 `manifest.json` 复制到测试 vault 的 `.obsidian/plugins/obsidian-deepseek-organizer/` 即可在 Obsidian 中调试。

## 项目结构

```
├── main.ts                          # 插件入口
├── src/
│   ├── api.ts                       # DeepSeek API 客户端 (OpenAI 兼容)
│   ├── types.ts                     # 共享类型定义
│   ├── settings.ts                  # 设置面板
│   ├── constants.ts                 # 常量
│   ├── sidebar.ts                   # 侧边栏视图 (React 容器)
│   ├── pipeline.ts                  # 数据处理流水线
│   ├── memory.ts                    # 记忆管理器
│   ├── sanitizer.ts                 # PII 脱敏引擎
│   ├── prompts.ts                   # Prompt 模板
│   ├── response-parser.ts           # AI 响应结构化解析
│   ├── commands.ts                  # 命令面板注册
│   ├── web-search.ts                # 联网搜索 (DuckDuckGo + Wikipedia)
│   ├── LLMProviders/                # 多模型路由
│   │   └── chatModelManager.ts      # Provider 管理器
│   ├── tools/                       # 工具调用系统
│   │   ├── ToolRegistry.ts          # 工具注册表
│   │   ├── builtinTools.ts          # 内置工具 (7 个)
│   │   └── toolCallParser.ts        # 工具调用解析与执行
│   ├── search/                      # Vault 语义检索
│   │   └── vaultSearch.ts           # TF-IDF 全文索引
│   ├── parsers/                     # 文件解析器
│   │   ├── index.ts                 # 解析器路由
│   │   ├── markdown.ts              # MD 解析
│   │   ├── text.ts                  # TXT 解析
│   │   ├── pdf.ts                   # PDF 解析 (pdfjs-dist)
│   │   └── docx.ts                  # DOCX 解析 (mammoth)
│   ├── ui/                          # React UI 组件
│   │   ├── Chat.tsx                 # 主聊天组件 (工具调用循环)
│   │   ├── ChatInput.tsx            # 输入框
│   │   ├── ChatMessage.tsx          # 消息气泡
│   │   ├── ChatHistory.tsx          # 对话历史
│   │   ├── preview-modal.ts         # 拆分预览
│   │   ├── canvas-preview-modal.ts  # Canvas 预览
│   │   └── suggestion-list.ts       # 建议列表
│   ├── core/                        # 核心功能
│   │   └── chatPersistence.ts       # 对话持久化
│   ├── editor/                      # 编辑器集成
│   │   └── quickAsk.ts              # 快捷操作 (润色/解释/翻译)
│   ├── mentions/                    # @mention 系统
│   │   └── mentionProvider.ts       # 提及自动补全
│   └── utils/                       # 工具函数
│       └── createRoot.ts            # React 根节点创建
└── styles.css                       # 样式
```

## 代码规范

- 使用 TypeScript 严格模式（`strictNullChecks`）
- 文件名：模块用小写 + 连字符（如 `response-parser.ts`），React 组件用 PascalCase（如 `Chat.tsx`）
- 所有公开接口需要 JSDoc 注释
- 模块注释格式：`// ==== 模块名 — 一句话描述 ====`
- 优先使用 `async/await` 而非 Promise 链

## 提交规范

本项目使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[optional body]
```

类型 (type)：
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建/工具链相关

示例：
```
feat(rag): add ONNX embedding provider for semantic search
fix(pipeline): route summarize to active provider instead of hardcoded DeepSeek
docs: add ARCHITECTURE.md with system design diagrams
```

## PR 流程

1. Fork 仓库并创建 feature 分支
2. 编写代码 + 测试
3. 确保 `npm run build` 和 `npm test` 通过
4. 提交 PR，使用提供的 PR 模板
5. 等待 review，根据反馈修改

## 发布流程

1. 更新 `manifest.json`、`package.json`、`versions.json` 中的版本号
2. 更新 `CHANGELOG.md`
3. 打 tag：`git tag v2.x.x`
4. push tag：`git push origin v2.x.x`
5. GitHub Actions 自动构建并创建 Release
4. GitHub Actions 自动构建并创建 Release
