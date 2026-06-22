import { ItemView, WorkspaceLeaf, MarkdownView, Notice, TFile } from "obsidian";
import type DeepSeekPlugin from "../main";
import { ChatView } from "./ui/chat-view";
import { DeepSeekError } from "./types";
import { getParserForFile } from "./parsers/index";
import { Sanitizer } from "./sanitizer";
export const VIEW_TYPE_DEEPSEEK_CHAT = "deepseek-chat-sidebar";

const MATH = "数学公式：行内用 $x$，独立成行用 $$x$$。禁止使用 \\(x\\) 或 \\[x\\]。";
const SYNTAX = "Obsidian 语法：链接 [[笔记名]]，Callout > [!summary]/[!note]/[!example]/[!tip]/[!warning]/[!info]/[!question]。";

const TEMPLATE = `## 笔记生成规则
当用户明确要求「生成笔记/创建笔记/保存为笔记/整理成笔记」时：
- 以 # 开头作为笔记标题（描述性标题，不要用 "AI Response" 之类泛称）
- 添加 frontmatter（---包裹），包含 title、date、tags
- 正文用 ##、### 层级组织，适当使用表格、Callout、列表
- 结尾添加 2-4 个 [[双向链接]]
- 内容要做到结构清晰、可直接作为独立笔记使用

当用户只是普通对话/提问/咨询时：
- 不要自动创建笔记
- 不要输出 frontmatter
- 用 ## 作为大标题、### 作为子标题组织回答
- 自然对话风格，不要套用死板模板`;

const NOTE_METHODOLOGY = `你是一个嵌入 Obsidian 的知识管理助手。请始终用中文回答（除非用户用其他语言提问）。

## 意图理解（关键能力）
在与用户对话时，你需要先准确理解用户真正想要什么，再作答：
- **显性需求**：用户明确提出的问题 → 直接回答
- **隐性需求**：用户没说但可能需要的 → 简要补充（如"你可能还想知道…"）
- **模糊表达**：用户说得不清晰时 → 先用自己的话复述理解，确认后再展开
- **多意图**：一句话包含多个问题 → 逐一拆解，用 ## 分隔，确保每个都覆盖
- **追问/连续对话**：结合上下文理解，而非孤立看待当前消息
- **知识库操作**：用户提到「笔记/文件/整理/vault」等 → 激活对应的整理 Skill

## 回答格式规范
- 段落连续书写，不要每句话都换行
- 用 ## 划分主题、### 划分子主题（不要在对话回答中使用 #）
- 适当使用 **加粗** 突出重点，\`代码\` 标注技术术语
- 自然地使用 Markdown：表格、代码块、Callout (> [!note])、有序/无序列表
- Callout 类型：[!summary] 摘要、[!note] 笔记、[!example] 示例、[!tip] 提示、[!warning] 警告、[!info] 信息、[!question] 问题
- 段落之间空一行，保持视觉清爽
- 回答结尾适当时添加 2-3 个 [[相关笔记链接]]

## 行为准则
- 根据用户具体问题灵活调整回答结构，不要千篇一律
- 直接回答问题核心，先给结论再展开解释
- 用户要求「整理/梳理/归纳」时，用结构化方式呈现（表格/列表/层级标题）
- 用户要求「生成笔记」时，按笔记生成规则输出完整笔记`;

// ============================================================
// 笔记与文件整理 Skills
// ============================================================

const SKILL_VAULT_ORGANIZE = `
## 🗂 Vault 整理 Skill（已激活）
你正在帮用户整理 Obsidian Vault 的文件结构。

### 整理规则
1. **分析当前结构**：先了解用户 vault 的目录层次和命名习惯
2. **分类建议**：按主题/学科/项目等维度建议目录分类（如：学习笔记/、工作项目/、个人/、归档/）
3. **命名规范**：建议统一的文件命名规则（如：领域_主题_日期.md）
4. **移动计划**：列出建议移动的文件及其目标位置，用表格呈现：
   | 当前路径 | 建议移动到 | 原因 |
   |----------|-----------|------|
5. **MOC 索引**：为每个重要目录建议创建一个 Map of Content（索引笔记）

### 输出格式
- 先给出整体结构建议（用 tree 格式展示推荐目录树）
- 再逐项说明具体操作
- 最后询问用户确认后再执行`;

const SKILL_NOTE_MERGE = `
## 🔗 笔记合并 Skill（已激活）
你正在帮用户合并相关或重复的笔记。

### 合并规则
1. **识别候选**：找出内容重叠度高或主题紧密相关的笔记
2. **冲突处理**：合并时去重、保留最完整版本、整合分散信息
3. **结构调整**：合并后的笔记应有清晰的 ## 层级结构
4. **保留链接**：合并后的笔记保留所有有效的 [[双向链接]]

### 输出格式
- 列出建议合并的笔记组
- 展示合并后的笔记结构大纲
- 标注哪些原笔记可以归档或删除`;

const SKILL_NOTE_INDEX = `
## 📑 MOC 索引 Skill（已激活）
你正在帮用户创建 Map of Content（内容地图）索引笔记。

### 索引规则
1. **确定范围**：明确索引覆盖的目录或主题范围
2. **逻辑分组**：按主题/时间/难度等维度分组
3. **条目格式**：每条包含 [[笔记链接]] + 一句话摘要
4. **可维护性**：索引结构应便于后续增删

### 输出格式
\`\`\`
# 索引标题
## 分类一
- [[笔记A]] — 一句话描述
- [[笔记B]] — 一句话描述
## 分类二
- [[笔记C]] — 一句话描述
\`\`\``;

const SKILL_BATCH_PROCESS = `
## ⚙️ 批量处理 Skill（已激活）
你正在帮用户批量处理多个笔记。

### 处理规则
1. **明确操作**：确认用户要对哪些笔记做什么操作（重命名/加标签/移动/格式化）
2. **预览模式**：先列出所有变更预览，用表格呈现：
   | 笔记 | 操作 | 变更前 | 变更后 |
   |------|------|--------|--------|
3. **批量执行**：逐项执行并汇报结果
4. **回滚方案**：对不可逆操作提供回滚建议`;

const SKILL_QUERY_UNDERSTAND = `
## 🧠 用户意图理解 Skill（始终激活）

### 你在与真实用户对话，不是执行机械任务。请做到：

#### 1. 意图分类
接到用户消息后，先内部分类：
- **操作类**：用户想对笔记/文件/vault 执行操作（如"帮我整理"、"把XX移动到YY"、"合并这些笔记"）
  → 激活对应 Skill，给出具体步骤，需用户确认后执行
- **查询类**：用户想了解某个知识、概念或 vault 中的信息（如"什么是XX"、"有哪些笔记关于YY"）
  → 直接回答 + 关联 vault 中已有笔记
- **生成类**：用户想创建新内容（笔记/索引/MOC/知识图谱）
  → 按生成规则输出，给出预览让用户确认
- **闲聊类**：日常问候、感谢等
  → 简短友好回应，不强行输出结构化内容

#### 2. 模糊表达处理
- "帮我看看这个" → 追问：看什么方面？内容/结构/关联？
- "整理一下" → 追问：整理什么？当前笔记/vault目录/某个主题？
- "这样对吗" → 结合上下文判断"这样"指代什么
- "还有吗" → 基于上一轮话题扩展，给出相关补充

#### 3. 隐含意图挖掘
- 用户问"XX适合放在哪个目录" → 隐含需要 vault 结构建议
- 用户说"笔记太多了找起来麻烦" → 隐含需要索引/MOC/标签优化
- 用户说"这两篇好像差不多" → 隐含需要查重/合并
- 用户问"怎么学习XX" → 除了回答方法论，还可关联 vault 中相关学习笔记

#### 4. 对话连续性
- 消息 B 接在消息 A 之后 → B 很可能是对 A 的追问或延续
- 代词（它/这个/那个/这里）→ 指代上一轮讨论的主题
- 用户纠正你的回答 → 接受纠正，不要辩解，调整后重新作答

#### 5. 歧义消解
- "笔记"可能指：当前打开的笔记 / vault 中某篇笔记 / 要新建的笔记
- "标签"可能指：frontmatter tags / 内容中的 #tag / Obsidian 标签面板
- "链接"可能指：[[wikilink]] / markdown link / 外部URL
  → 根据上下文判断，不确定时简要说明你的理解再作答`;

const SKILL_KG_DRAW = `
## 🎨 知识图谱绘制 Skill（已激活）
你正在帮用户将知识内容转化为 Obsidian Canvas 知识图谱。

### 绘图原则
1. **提取核心**：从用户内容中识别中心主题、关键概念、支撑细节
2. **MECE 分组**：概念之间相互独立、完全穷尽，不重叠不遗漏
3. **层级展开**：根节点（中心主题）→ 一级节点（核心概念）→ 二级节点（具体细节），最多 3 层
4. **交叉关联**：找出不同分支间的隐含联系，添加跨分支连线并标注关系
5. **视觉编码**：
   - 根节点蓝色(color "4")：完整陈述句，不只是主题名
   - 概念节点绿色(color "2")：具体标签 + 2-4 条要点
   - 洞察节点黄色(color "5")：隐含的深层见解
   - 关联节点紫色(color "6")：跨分支关联

### 输出步骤
1. 先分析内容，列出提取到的核心概念（让用户确认方向）
2. 再展示图谱结构大纲（树形缩进预览）
3. 确认后指导用户生成 Canvas（说「生成知识图谱」即可触发自动生成）

### 规模控制
- 6-16 个节点，最多 3 层深度
- 每个节点 ≤ 400 字符
- 2-4 条跨分支连线`;

const SKILL_KG_ORGANIZE = `
## 🔧 知识图谱整理 Skill（已激活）
你正在帮用户优化和整理已有的知识图谱。

### 整理维度
1. **结构审查**：
   - 层级是否合理？有没有过深或过浅？
   - 概念分组是否 MECE？有没有重叠或遗漏？
   - 根节点是否准确表达了核心主题？

2. **内容优化**：
   - 节点文字是否精简有力？有没有冗余表述？
   - 要点是否具体？有没有空洞的泛泛之谈？
   - 不同节点间是否有内容重复？

3. **关联增强**：
   - 缺少哪些跨分支关联？补充 2-4 条
   - 现有连线标注是否准确？关系词是否清晰？
   - 有没有孤立节点需要连接或删除？

4. **视觉建议**：
   - 颜色编码是否合理？
   - 节点数量是否适中（6-16 个）？
   - 层级深度是否 ≤ 3 层？

### 输出格式
- 先列出发现的问题（按优先级排序）
- 再逐项给出具体修改建议
- 对每条建议标注：结构优化 / 内容优化 / 关联增强 / 视觉调整`;

const SKILL_KG_CONVERT = `
## 📄 笔记转图谱 Skill（已激活）
你正在帮用户将一篇或多篇笔记转化为知识图谱。

### 转化流程
1. **深度阅读**：理解笔记的核心论点和逻辑结构
2. **知识提取**：
   - 中心论点 → 根节点
   - 分论点/关键概念 → 一级节点
   - 例证/数据/细节 → 二级节点
   - 隐含洞察 → 洞察节点
3. **关系梳理**：
   - 层级关系（属于/包含/展开）
   - 因果关系（导致/影响）
   - 对比关系（区别于/类似于）
   - 时序关系（先于/后于）
4. **图谱输出**：生成结构化的节点和连线描述

### 输出格式
先给图谱结构预览：
\`\`\`
根：中心主题
├── 概念A
│   ├── 细节a1
│   └── 细节a2
├── 概念B ←→ 概念A（对比关系）
│   └── 细节b1
└── 💡洞察：隐含结论
\`\`\`
然后引导用户说「生成知识图谱」自动创建 Canvas`;

const SKILL_CANVAS_FORMAT = `
## 📐 Canvas 格式编辑 Skill（已激活）
你正在帮用户直接编辑 Obsidian Canvas 文件的 JSON 结构。

### Canvas JSON 格式说明
Canvas 文件（.canvas）是一个 JSON 对象：
\`\`\`json
{
  "nodes": [
    { "id": "唯一id", "type": "text|file|link|group",
      "text": "节点内容(Markdown)", "file": "笔记路径",
      "x": 0, "y": 0, "width": 300, "height": 200,
      "color": "0~6" }
  ],
  "edges": [
    { "id": "唯一id", "fromNode": "源节点id", "toNode": "目标节点id",
      "fromSide": "bottom|top|left|right",
      "toSide": "bottom|top|left|right",
      "label": "连线标注" }
  ]
}
\`\`\`

### 节点颜色表
| color | 颜色 | 用途 |
|-------|------|------|
| "0" | 默认灰 | 通用 |
| "1" | 红色 | 重要/警告 |
| "2" | 橙色 | 概念/分类 |
| "3" | 黄色 | 洞察/亮点 |
| "4" | 绿色 | 成功/确认 |
| "5" | 青色 | 信息/提示 |
| "6" | 紫色 | 关联/交叉 |

### 操作能力
- 根据用户需求生成/修改 Canvas JSON
- 添加/删除/重排节点
- 调整连线方向和标注
- 设置节点尺寸和位置
- 批量修改节点颜色和样式`;

const SKILL_CANVAS_BATCH = `
## 📦 Canvas 批量生成 Skill（已激活）
你正在帮用户批量生成多个 Canvas 知识图谱。

### 批量策略
1. **来源识别**：
   - 整个目录 → 为每篇笔记生成一个 Canvas
   - 指定主题 → 为相关笔记生成 Canvas
   - 时间范围 → 为某时间段的笔记生成 Canvas
2. **命名规则**：Canvas 文件命名 {笔记名}_graph.canvas
3. **质量控制**：
   - 跳过内容过短（< 200 字）的笔记
   - 跳过已有 Canvas 的笔记（避免重复）
4. **进度汇报**：逐项汇报生成进度

### 输出格式
\`\`\`
📊 批量生成计划：
| # | 源笔记 | Canvas 文件名 | 状态 |
|---|--------|--------------|------|
| 1 | 笔记A.md | 笔记A_graph.canvas | 待生成 |
| 2 | 笔记B.md | 跳过（内容过短） | - |
| 3 | 笔记C.md | 笔记C_graph.canvas | 待生成 |

确认后逐一生成：（用户需手动对每篇笔记说「生成知识图谱」）
\`\`\``;

const SKILL_CANVAS_STYLE = `
## 🎨 Canvas 样式定制 Skill（已激活）
你正在帮用户美化和定制 Canvas 知识图谱的视觉样式。

### 定制维度
1. **配色方案**：
   - 学术风：蓝(4)+青(5)+紫(6)，冷色调，专业严肃
   - 创意风：黄(3)+橙(2)+绿(4)，暖色调，活泼生动
   - 商务风：蓝(4)+灰(0)+红(1)，简洁干练
   - 自定义：用户指定每个层级的颜色
2. **布局调整**：
   - 树状布局：根在上，子节点向下展开（默认）
   - 放射布局：根在中心，概念环绕
   - 时间线布局：节点按时间从左到右排列
   - 对比布局：两组概念左右对称排列
3. **节点样式**：
   - 宽度范围：200-600px（根据内容长度自适应）
   - 字体层级：根节点加粗、子节点常规
   - 节点形状：通过 group 节点实现圆角/边框效果

### 输出格式
- 先展示当前样式问题
- 再给出定制方案（配色 + 布局 + 尺寸）
- 提供修改后的 Canvas JSON 片段`;

const SKILL_CANVAS_MERGE = `
## 🔀 Canvas 合并拆分 Skill（已激活）
你正在帮用户合并多个 Canvas 或拆分一个复杂 Canvas。

### 合并规则
1. **去重**：相同/相似的节点只保留一个
2. **整合**：
   - 多个 Canvas 的根节点 → 新建一个总根
   - 相同概念合并为一个节点，连线汇总
3. **连线保留**：原 Canvas 内部连线 + 新增跨 Canvas 关联
4. **颜色协调**：不同来源的节点用不同颜色区分（如 Canvas A=蓝，Canvas B=绿）

### 拆分规则
1. **分支独立**：将过大 Canvas（>16 节点）按一级分支拆为多个
2. **主题聚合**：相关分支保留在同一 Canvas
3. **索引创建**：拆分后创建一个总索引 Canvas，链接各子 Canvas

### 输出格式
- 合并：先展示合并后结构预览，再输出 Canvas JSON
- 拆分：先展示拆分方案（哪个分支→哪个文件），再逐文件输出`;


const CANVAS_FULL = `You are a knowledge-graph builder. First ANALYZE the content, then OUTPUT a canvasjson mindmap.

PHASE 1 — EXTRACT WISDOM (Fabric pattern)
Before creating nodes, mentally extract:
1. CENTRAL IDEA: The single most important takeaway (becomes root node)
2. KEY CONCEPTS: 4-8 major themes/categories, MECE-organized (Level 1 nodes)
3. SUPPORTING DETAILS: 1-3 specifics per concept (node bullet points)
4. CROSS-CONNECTIONS: Concepts that relate across categories (cross-edges, color "6")
5. EMERGENT INSIGHT: Something implied but unsaid (add as a "lightbulb" node, color "5")

PHASE 2 — BUILD CANVAS JSON
Output ONLY a \`\`\`canvasjson block. Format:
{
  "nodes": [
    {"id":"n1","type":"text","text":"# Central Idea\\nOne-sentence essence + 1-2 key takeaways","color":"4"},
    {"id":"n2","type":"text","text":"## Concept Name\\n- Specific point 1\\n- Specific point 2\\n- Related: n3","color":"2"}
  ],
  "edges": [
    {"id":"e1","fromNode":"n1","toNode":"n2"},
    {"id":"e2","fromNode":"n2","toNode":"n3","label":"contrasts with"}
  ]
}

Node rules:
- Root (n1): Complete statement, not just a topic name. Color "4" (blue). 2-3 sentences.
- Level 1 concepts: Substantive labels. Color "2" (green). 2-4 bullet points.
- Insight nodes: Color "5" (yellow). For emergent insights.
- Cross-ref nodes: Color "6" (purple). Connected with labeled cross-edges.
- Each node max 400 chars. Bullet points must be specific, not generic.
- NO duplicate content across nodes — each concept appears exactly once.

Edge rules:
- Every non-root node connects to exactly one parent (tree structure).
- Add 2-4 cross-edges between related concepts at the same level with labels.
- Edge labels: "depends on", "contrasts with", "example of", "leads to", "part of".

Scale: 6-16 nodes total. Max 3 levels deep (root, concept, detail).
Do NOT include x, y, width, height — layout is handled automatically.`;

function treeLayout(
  nodes: Array<Record<string, unknown>>,
  edges: Array<Record<string, unknown>>,
): void {
  if (!nodes || nodes.length === 0) return;
  const childrenMap = new Map<string, string[]>();
  for (const n of nodes) childrenMap.set(n.id as string, []);
  for (const e of edges) {
    const from = e.fromNode as string;
    const to = e.toNode as string;
    if (childrenMap.has(from)) childrenMap.get(from)!.push(to);
  }
  const hasParent = new Set<string>();
  for (const e of edges) hasParent.add(e.toNode as string);
  const roots = nodes.filter(n => !hasParent.has(n.id as string));
  const root = roots.length > 0 ? roots[0] : nodes[0];
  const levels: Array<Array<Record<string, unknown>>> = [[root]];
  const visited = new Set<string>([root.id as string]);
  let queue = [root];
  while (queue.length > 0) {
    const next: Array<Record<string, unknown>> = [];
    for (const parent of queue) {
      for (const kidId of childrenMap.get(parent.id as string) || []) {
        if (visited.has(kidId)) continue;
        visited.add(kidId);
        const kid = nodes.find(n => n.id === kidId);
        if (kid) next.push(kid);
      }
    }
    if (next.length > 0) levels.push(next);
    queue = next;
  }
  for (const n of nodes) {
    if (!visited.has(n.id as string)) {
      if (levels.length === 0) levels.push([n]);
      else levels[levels.length - 1].push(n);
    }
  }
  for (const n of nodes) {
    const text = (typeof n.text === "string" ? n.text : "") as string;
    const lines = text.split("\n");
    const maxLine = Math.max(...lines.map(l => l.length), 20);
    n.width = Math.min(Math.max(maxLine * 8 + 40, 260), 520);
    n.height = Math.min(lines.length * 22 + 60, 400);
  }
  const GAP_X = 60; const GAP_Y = 80;
  let y = 0;
  for (const level of levels) {
    const totalW = level.reduce((s, n) => s + ((n.width as number) || 300), 0)
      + (level.length - 1) * GAP_X;
    let x = Math.max(20, Math.round((900 - totalW) / 2));
    for (const n of level) {
      n.x = x; n.y = y;
      x += ((n.width as number) || 300) + GAP_X;
    }
    y += Math.max(...level.map(n => (n.height as number) || 200)) + GAP_Y;
  }
}

export class DeepSeekSidebarView extends ItemView {
  plugin: DeepSeekPlugin;
  chatView!: ChatView;
  private cp = "";
  private afc: string | null = null;
  private afn: string | null = null;
  private lfm: string | null = null;
  private st: ReturnType<typeof setTimeout> | null = null;
  private mm: "chat" | "reasoner" = "chat";
  private cachedSp = "";
  private cachedSpNote: string | null = null;
  private apiMsgs: Array<{ role: string; content: string }> = [];
  private abortController: AbortController | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DeepSeekPlugin) { super(leaf); this.plugin = plugin; }
  getViewType(): string { return VIEW_TYPE_DEEPSEEK_CHAT; }
  getDisplayText(): string { return "DeepSeek Assistant"; }
  getIcon(): string { return "message-square"; }

  async onOpen(): Promise<void> {
    const c = this.containerEl.children[1] as HTMLElement; c.empty();
    this.chatView = new ChatView(c, this.plugin);
    this.chatView.callbacks.onSend = async (m) => { await this.hcs(m); };
    this.chatView.callbacks.onAttachFile = async (f) => { await this.haf(f); };
    this.chatView.callbacks.onOpenNote = async (p) => { await this._openNote(p); };
    this.chatView.callbacks.onRetry = async () => { await this.hr(); };
    this.chatView.callbacks.onCreateCanvas = async (c2) => { await this.hcc(c2); };
    this.chatView.callbacks.onSetModel = async (md: "chat"|"reasoner") => { await this.hsm(md); };
    this.chatView.callbacks.onNewConversation = () => { this._startNewConversation(); };
    this.chatView.callbacks.onSwitchConversation = (id: string) => { this._loadConversation(id); };
    this.registerEvent(this.plugin.app.workspace.on("active-leaf-change", () => { this.oanc(); }));
    this.sum(); this.oanc();
    this._updateHistoryUI();
  }

  async onClose(): Promise<void> { this.pc(); this.containerEl.children[1]?.empty(); }
  getcpt(): string { return this.cp; }
  sum(): void { this.mm = this.plugin.settings.model === "deepseek-reasoner" ? "reasoner" : "chat"; this.chatView.setModelMode?.(this.mm); }
  sum2(m: string): void { this.chatView.setModelMode?.(m as "chat"|"reasoner"); }

  private async hsm(md: "chat"|"reasoner"): Promise<void> {
    this.mm = md;
    this.plugin.settings.model = md === "reasoner" ? "deepseek-reasoner" : "deepseek-chat";
    await this.plugin.saveSettings();
    const k = this.plugin.getEffectiveApiKey();
    this.plugin.apiClient.updateConfig(this.plugin.settings.baseUrl, k, this.plugin.settings.model, this.plugin.settings.reasoningEffort);
    this.sum2(this.mm);
    new Notice(md === "reasoner" ? "Switched: V4 Pro" : "Switched: V4 Flash");
  }

  // ---- Persistence ----
  private pc(): void {
    if (!this.cp) return;
    const ms = this.chatView.getMessages();
    if (ms.length === 0) {
      delete this.plugin.settings.conversations[this.cp];
    } else {
      const toSave = [...ms.slice(-30)];
      if (this.cachedSp && !toSave.some(m => m.role === "system")) {
        toSave.unshift({ role: "system", content: this.cachedSp });
      }
      this.plugin.settings.conversations[this.cp] = toSave;
      this._extractMemory(ms);
    }
    if (this.st) clearTimeout(this.st);
    this.st = setTimeout(async () => { await this.plugin.saveSettings(); }, 500);
  }

  private _extractMemory(msgs: Array<{ role: string; content: string }>): void {
    if (!this.plugin.settings.memoryEnabled || !this.plugin.memory) return;
    const userMsgs = msgs.filter(m => m.role === "user" && m.content.trim());
    const assistantMsgs = msgs.filter(m => m.role === "assistant" && m.content.trim());
    if (userMsgs.length < 2) return;
    this.plugin.memory.extractFromConversation(
      this.cp,
      userMsgs.map(m => m.content),
      assistantMsgs.map(m => m.content),
    ).catch(e => console.error("[Memory] extract fail:", e));
  }

  private lc(np: string): void {
    const sv = this.plugin.settings.conversations[np];
    if (sv) {
      for (const m of sv) { if (m.role === "user") this.chatView.addMessage(m); else if (m.role === "assistant") this.chatView.addAssistantMessage(m.content); }
      const sysMsg = sv.find(m => m.role === "system");
      if (sysMsg) { this.cachedSp = sysMsg.content; this.cachedSpNote = np; }
      this.apiMsgs = sv.map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    }
  }

  private _updateCtx(label: string): void {
    const hitRate = this.cacheTotal > 0 ? Math.round((this.cacheHits / this.cacheTotal) * 100) : 0;
    const cacheTag = this.apiMsgs.length >= 3 ? ` cache ${hitRate}%` : "";
    this.chatView.updateContextLabel(label + cacheTag);
  }

  private oanc(): void {
    const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const np = v?.file?.path || "";
    if (np !== this.cp) {
      this.pc(); this.cp = np; this.caf(); this.cacheHits = 0; this.cacheTotal = 0;
      // 不清理对话框！仅更新上下文标签。只有「新建会话」按钮才清空对话。
      if (v?.file) this._updateCtx(v.file.basename + " (" + v.file.path + ")");
      else this._updateCtx("No note");
    }
  }

  private gnc(): string | null {
    const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!v) return null; const s = v.editor.getSelection(); return s.trim() || v.editor.getValue();
  }

  private gvt(): string[] { return this.plugin.app.vault.getMarkdownFiles().map(f => f.basename).filter(n => n.length > 0); }
  private bvc(): string {
    const t = this.gvt(); if (t.length === 0) return "";
    const mx = Math.min(t.length, 20), sh = t.slice(0, mx);
    return "Vault(" + t.length + "): " + sh.map(n => "[[" + n + "]]").join(", ");
  }

  // ---- Files ----
  private async haf(file: File): Promise<void> {
    try {
      const p = await getParserForFile(file.name); if (!p) throw new Error("Unsupported: " + file.name);
      const b = await file.arrayBuffer(); const c = await p.parse(b);
      if (!c.trim()) throw new Error("Empty file");
      this.afc = c; this.afn = file.name;
      this.apiMsgs = [];
      new Notice("Loaded: " + file.name + " (" + c.length + " chars)");
      this.chatView.updateContextLabel(file.name + " (attached)");
    } catch (e) { this.chatView.clearAttachment(); throw e; }
  }
  private caf(): void { this.afc = null; this.afn = null; this.apiMsgs = []; }

  // ---- Apply to Note ----
  private async han(content: string): Promise<void> {
    const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const s = v?.editor.getSelection()?.trim();
    try {
      if (s && v) { v.editor.replaceSelection(content); new Notice("Replaced selection"); }
      else if (this.cp && v) { v.editor.setValue(content); const f = this.plugin.app.vault.getAbstractFileByPath(this.cp); if (f instanceof TFile) await this.plugin.app.vault.modify(f, content); new Notice("Updated note"); }
      else await this.cnn(content);
    } catch (e) { throw new Error(e instanceof Error ? e.message : "Write failed"); }
  }

  // 打开已保存的笔记
  private async _openNote(notePath: string): Promise<void> {
    const f = this.plugin.app.vault.getAbstractFileByPath(notePath);
    if (f instanceof TFile) await this.plugin.app.workspace.getLeaf("split").openFile(f);
    else new Notice("笔记未找到: " + notePath);
  }

  // ---- 会话管理 ----
  private _updateHistoryUI(): void {
    const saved = this.plugin.settings.savedConversations || [];
    this.chatView.showHistoryList(saved.map(c => ({ id: c.id, title: c.title })));
  }

  private _startNewConversation(): void {
    // 先保存当前对话（如果有内容）
    const msgs = this.chatView.getMessages();
    if (msgs.length > 0) {
      const saved = this.plugin.settings.savedConversations || [];
      const firstUser = msgs.find(m => m.role === "user");
      const title = firstUser?.content?.slice(0, 40) || "对话 " + new Date().toLocaleString();
      saved.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title,
        messages: [...msgs],
        timestamp: Date.now(),
      });
      // 只保留最近 5 个
      if (saved.length > 5) saved.splice(0, saved.length - 5);
      this.plugin.settings.savedConversations = saved;
      this.plugin.saveSettings();
    }
    // 清空并开始新对话
    this.apiMsgs = []; this.cachedSp = ""; this.cachedSpNote = null;
    this.chatView.clear();
    this._updateHistoryUI();
    new Notice("新会话已开始");
  }

  private _loadConversation(id: string): void {
    const saved = this.plugin.settings.savedConversations || [];
    const conv = saved.find(c => c.id === id);
    if (!conv) { new Notice("对话未找到"); return; }
    // 保存当前对话
    const curMsgs = this.chatView.getMessages();
    if (curMsgs.length > 0) {
      const firstUser = curMsgs.find(m => m.role === "user");
      saved.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: firstUser?.content?.slice(0, 40) || "对话 " + new Date().toLocaleString(),
        messages: [...curMsgs],
        timestamp: Date.now(),
      });
      if (saved.length > 5) saved.splice(0, saved.length - 5);
    }
    // 从列表中移除要加载的对话
    const idx = saved.findIndex(c => c.id === id);
    if (idx !== -1) saved.splice(idx, 1);
    this.plugin.settings.savedConversations = saved;
    this.plugin.saveSettings();
    // 加载对话
    this.chatView.clear();
    this.apiMsgs = [];
    for (const m of conv.messages) {
      if (m.role === "user") this.chatView.addMessage(m);
      else if (m.role === "assistant") this.chatView.addAssistantMessage(m.content);
    }
    this._updateHistoryUI();
    new Notice("已恢复: " + conv.title.slice(0, 30));
  }

  // 自动保存 AI 回复为新笔记，返回完整路径
  private async _autoSaveNote(content: string): Promise<string> {
    const fd = this.plugin.settings.defaultTargetFolder || "Knowledge";
    if (!this.plugin.app.vault.getAbstractFileByPath(fd)) await this.plugin.app.vault.createFolder(fd);
    const { title: pt, tags, body } = this.efm(content);
    const bn = pt || "AI Response";
    const sn = bn.replace(/[\\/:*?"<>|#^\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
    let fn = sn + ".md"; let c2 = 1;
    while (this.plugin.app.vault.getAbstractFileByPath(fd + "/" + fn)) { fn = sn + " (" + c2 + ").md"; c2++; }
    const hf = /^---\n[\s\S]*?\n---/.test(body.trimStart());
    const fc = hf ? body.trimStart() : ["---", "title: " + sn, "date: " + new Date().toISOString().slice(0, 10), "created: " + new Date().toISOString(), tags.length > 0 ? "tags: [" + tags.join(", ") + "]" : "", "---", "", body.trim()].filter(l => l !== "").join("\n");
    const fullPath = fd + "/" + fn;
    await this.plugin.app.vault.create(fullPath, fc);
    return fullPath;
  }
  private etf(content: string): string[] {
    const t: string[] = [];
    const h = content.match(/#[\w\u4e00-\u9fa5-]+/g); if (h) for (const x of h) { const c = x.replace(/^#/, "").trim(); if (c && c.length < 30 && !/^\d+$/.test(c)) t.push(c); }
    const w = content.match(/\[\[([^\]]+)\]\]/g); if (w) for (const x of w) { const n = x.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim(); if (n && !t.includes(n)) t.push(n); }
    return [...new Set(t)].slice(0, 15);
  }
  private efm(content: string): { title: string; tags: string[]; body: string } {
    let body = content, title = ""; const tags: string[] = [];
    const fm = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) { body = content.slice(fm[0].length); const tm = fm[1].match(/^title:\s*(.+)$/m); if (tm) title = tm[1].trim().replace(/^["']|["']$/g, ""); const tgs = fm[1].match(/^tags:\s*\[(.+)\]$/m); if (tgs) for (const t of tgs[1].split(",")) { const c = t.trim().replace(/^["']|["']$/g, ""); if (c) tags.push(c); } }
    if (!title) { const h = body.match(/^#\s+(.+)$/m); if (h) title = h[1].trim(); }
    if (!title) title = body.trim().split("\n")[0].replace(/^#+\s*/, "").trim().slice(0, 60);
    for (const t of this.etf(content)) { if (!tags.includes(t)) tags.push(t); }
    return { title, tags, body };
  }
  private async cnn(content: string): Promise<void> {
    const fd = this.plugin.settings.defaultTargetFolder || "Knowledge";
    if (!this.plugin.app.vault.getAbstractFileByPath(fd)) await this.plugin.app.vault.createFolder(fd);
    const { title: pt, tags, body } = this.efm(content); const bn = pt || "AI Note";
    const sn = bn.replace(/[\\/:*?"<>|#^\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
    let fn = sn + ".md"; let c2 = 1;
    while (this.plugin.app.vault.getAbstractFileByPath(fd + "/" + fn)) { fn = sn + " (" + c2 + ").md"; c2++; }
    const hf = /^---\n[\s\S]*?\n---/.test(body.trimStart());
    const fc = hf ? body.trimStart() : ["---", "title: " + sn, "date: " + new Date().toISOString().slice(0, 10), "created: " + new Date().toISOString(), tags.length > 0 ? "tags: [" + tags.join(", ") + "]" : "", "---", "", body.trim()].filter(l => l !== "").join("\n");
    await this.plugin.app.vault.create(fd + "/" + fn, fc);
    const nf = this.plugin.app.vault.getAbstractFileByPath(fd + "/" + fn);
    if (nf instanceof TFile) await this.plugin.app.workspace.getLeaf("split").openFile(nf);
  }

  // ---- Canvas ----
  private pcj(content: string): string | null {
    const cb = content.match(/```(?:canvasjson|canvas)\s*([\s\S]*?)```/); if (cb) return cb[1].trim();
    const jm = content.match(/\{[\s\S]*"nodes"[\s\S]*"edges"[\s\S]*\}/); if (jm) return jm[0]; return null;
  }

  private async ccf(js: string): Promise<void> {
    const fd = this.plugin.settings.defaultTargetFolder || "Knowledge";
    if (!this.plugin.app.vault.getAbstractFileByPath(fd)) await this.plugin.app.vault.createFolder(fd);
    let o: Record<string, unknown>; try { o = JSON.parse(js); } catch { throw new Error("Invalid Canvas JSON"); }
    if (!o.nodes || !Array.isArray(o.nodes)) throw new Error("Missing nodes");
    if (!o.edges) o.edges = [];
    (o.edges as Array<Record<string, unknown>>).forEach((e, i) => { if (!e.id) e.id = "e" + (i + 1); });
    treeLayout(o.nodes as Array<Record<string, unknown>>, o.edges as Array<Record<string, unknown>>);
    const rn = (o.nodes as Array<Record<string, unknown>>)[0];
    const rt = typeof rn?.text === "string" ? rn.text : "";
    const bn = (rt.split("\n")[0] || "Knowledge Map").replace(/^#+\s*/, "").replace(/[\\/:*?"<>|#^\[\]]/g, "").trim().slice(0, 80) || "Knowledge Map";
    let fn = bn + ".canvas"; let c2 = 1;
    while (this.plugin.app.vault.getAbstractFileByPath(fd + "/" + fn)) { fn = bn + " (" + c2 + ").canvas"; c2++; }
    await this.plugin.app.vault.create(fd + "/" + fn, JSON.stringify(o, null, 2));
    new Notice("Canvas: " + fd + "/" + fn + " (" + (o.nodes as Array<unknown>).length + " nodes, " + (o.edges as Array<unknown>).length + " edges)");
    const nf = this.plugin.app.vault.getAbstractFileByPath(fd + "/" + fn);
    if (nf instanceof TFile) await this.plugin.app.workspace.getLeaf("split").openFile(nf);
  }

  private async hcc(content: string): Promise<void> {
    const j = this.pcj(content);
    if (j) { await this.ccf(j); return; }
    this.chatView.showProgress("正在生成知识图谱...");
    try {
      const generated = await this._generateCanvasJson(content);
      if (generated) { await this.ccf(generated); return; }
    } catch (e) { console.error("[DeepSeek] Canvas fail:", e); }
    finally { this.chatView.hideProgress(); }
    new Notice("AI 生成失败，使用降级方案", 6000);
    // 降级：提取关键句分多个节点，而非整段文字塞一个节点
    const lines = content.split("\n").filter((l: string) => l.trim().length > 10);
    const nodes: Array<Record<string, unknown>> = [];
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
      nodes.push({ id: "n" + (i + 1), type: "text", text: lines[i].trim().slice(0, 200), color: i === 0 ? "4" : i <= 5 ? "2" : "0" });
    }
    const edges: Array<Record<string, unknown>> = [];
    for (let i = 1; i < nodes.length; i++) { edges.push({ id: "e" + i, fromNode: "n1", toNode: "n" + (i + 1) }); }
    await this.ccf(JSON.stringify({ nodes, edges }));
  }

  private async _generateCanvasJson(content: string): Promise<string | null> {
    const ek = this.plugin.getEffectiveApiKey();
    if (!ek || !ek.trim()) return null;
    const msgs = [
      { role: "system", content: CANVAS_FULL },
      { role: "user", content: "Convert this content into a canvasjson knowledge graph. First extract wisdom (central idea, key concepts, cross-connections), then build the JSON. Output ONLY the ```canvasjson block:\n\n" + content.slice(0, 8000) },
    ];
    const resp = await this.plugin.apiClient.chat(msgs as import("./types").ChatMessage[], { stream: false, maxTokens: 4096, topP: 0.5 }) as string;
    return this.pcj(resp);
  }

  // ---- Retry ----
  private async hr(): Promise<void> {
    if (!this.lfm) { new Notice("Nothing to retry"); return; }
    this.apiMsgs = [];
    const m = this.lfm; this.lfm = null; await this.hcs(m);
  }

  stopGeneration(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.chatView.cancelStreaming();
      new Notice("Stopped");
    }
  }

  // ---- Chat Core ----
  private cacheHits = 0;
  private cacheTotal = 0;

  // 在 vault 中全文搜索，返回匹配的笔记摘要
  private async _searchVault(query: string, maxResults = 5): Promise<Array<{ path: string; title: string; excerpt: string }>> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    if (files.length === 0) return [];
    const qw = query.toLowerCase().split(/[\s，,。！？、；：""''（）\[\]【】《》]+/).filter(w => w.length >= 2);
    if (qw.length === 0) return [];
    // 先按文件名/路径评分，取 top 50 候选（避免遍历数千文件）
    const candidates: Array<{ file: typeof files[0]; fnScore: number }> = [];
    for (const f of files) {
      let s = 0;
      const fn = f.basename.toLowerCase();
      const fp = f.path.toLowerCase();
      for (const w of qw) {
        if (fn.includes(w)) s += 10;
        if (fp.includes(w)) s += 5;
      }
      if (s > 0) candidates.push({ file: f, fnScore: s });
    }
    candidates.sort((a, b) => b.fnScore - a.fnScore);
    const results: Array<{ path: string; title: string; excerpt: string; score: number }> = [];
    for (const { file: f, fnScore } of candidates.slice(0, 50)) {
      try {
        const content = await this.plugin.app.vault.read(f);
        let score = fnScore;
        const lower = content.toLowerCase();
        for (const w of qw) {
          let idx = -1;
          while ((idx = lower.indexOf(w, idx + 1)) !== -1) score++;
        }
        let excerpt = "";
        const firstMatch = qw.find(w => lower.includes(w));
        if (firstMatch) {
          const pos = lower.indexOf(firstMatch);
          const start = Math.max(0, pos - 60);
          excerpt = content.slice(start, start + 200).replace(/\n/g, " ").trim();
        }
        if (score > 5) results.push({ path: f.path, title: f.basename, excerpt: excerpt || content.slice(0, 200), score });
      } catch { /* skip */ }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults).map(r => ({ path: r.path, title: r.title, excerpt: r.excerpt }));
  }

  // 根据路径或标题查找并读取笔记全文
  private async _readVaultNote(nameOrPath: string): Promise<{ path: string; content: string } | null> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    const q = nameOrPath.trim().toLowerCase();
    let f = files.find(x => x.path.toLowerCase() === q);
    if (!f) f = files.find(x => x.basename.toLowerCase() === q || x.basename.toLowerCase() === q + ".md");
    if (!f) f = files.find(x => x.basename.toLowerCase().includes(q) || x.path.toLowerCase().includes(q));
    if (!f) return null;
    try {
      const content = await this.plugin.app.vault.read(f);
      return { path: f.path, content };
    } catch { return null; }
  }

  // 检测用户是否显式要求读某笔记
  private _detectReadNoteRequest(msg: string): string | null {
    const patterns = [
      /(?:读一下|读取|读|看看|查看|打开)\s*[「『""]?(.+?)[」』""]?\s*(?:笔记|文件)?\s*$/,
      /(?:read|open|show)\s+(?:the\s+)?(?:note\s+|file\s+)?["']?(.+?)["']?\s*$/i,
      /(?:帮我读|帮我查|帮我找)\s*(?:一下|一哈)?\s*[「『""]?(.+?)[」』""]?/,
    ];
    for (const p of patterns) {
      const m = msg.match(p);
      if (m && m[1] && m[1].trim().length >= 1) return m[1].trim();
    }
    return null;
  }

  // 检测用户是否明确要求生成笔记（不含知识图谱）
  private _shouldAutoSaveNote(msg: string): boolean {
    const patterns = [
      /生成笔记|创建笔记|写(?:一)?篇笔记|保存(?:为)?笔记|做笔记|记笔记|整理成笔记|输出(?:为)?笔记|总结成笔记/,
      /(?:make|create|write|save|generate)\s+(?:a\s+)?note/i,
      /summarize\s+(?:as|into)\s+(?:a\s+)?note/i,
    ];
    return patterns.some(p => p.test(msg));
  }

  // 检测用户是否要求生成知识图谱/Canvas（需自动创建 .canvas 文件）
  private _shouldAutoCreateCanvas(msg: string): boolean {
    const patterns = [
      /生成知识图谱|画知识图谱|创建(?:白板|canvas)|知识网络|知识地图|创建思维导图|做(?:一个|一张)?(?:知识图谱|思维导图|概念图)/,
      /knowledge\s*(?:graph|map)/i,
      /canvasjson/i,
      /(?:把|将).*(?:转化|转换|变成).*(?:知识图谱|白板|canvas|思维导图)/,
    ];
    return patterns.some(p => p.test(msg));
  }

  // 检测用户意图，匹配对应的整理 Skill
  private _detectSkill(msg: string): string {
    const rules: Array<{ pattern: RegExp; skill: string }> = [
      // —— Canvas 格式与编辑 ——
      { pattern: /(?:canvas|白板).*(?:格式|json|编辑|修改|调整|结构|节点|连线)|(?:编辑|修改|查看).*(?:canvas|白板).*(?:格式|json|代码)/i, skill: SKILL_CANVAS_FORMAT },
      { pattern: /(?:合并|拆分).*(?:多个)?(?:canvas|白板|知识图谱)/i, skill: SKILL_CANVAS_MERGE },
      { pattern: /(?:批量|整个目录|所有笔记).*(?:生成|创建).*(?:canvas|白板|知识图谱|图谱)/, skill: SKILL_CANVAS_BATCH },
      { pattern: /(?:美化|定制|换.*样式|配色|布局|调整.*颜色|修改.*样式).*(?:canvas|白板|知识图谱|图谱)/, skill: SKILL_CANVAS_STYLE },
      // —— 知识图谱 ——
      { pattern: /(?:整理|优化|完善|改进)(?:一下)?(?:知识图谱|白板|canvas|思维导图|概念图)/, skill: SKILL_KG_ORGANIZE },
      { pattern: /(?:把|将)(?:这篇|这个|当前)?(?:笔记|内容|文档)(?:转化|转换|变成|生成)(?:为|成)?(?:知识图谱|白板|canvas|思维导图)/, skill: SKILL_KG_CONVERT },
      { pattern: /(?:画|创建|生成|做|制作)(?:一个|一张)?(?:知识图谱|白板|canvas|思维导图|概念图|知识网络|知识地图)/, skill: SKILL_KG_DRAW },
      // —— Vault 整理 ——
      { pattern: /整理(?:一下)?(?:vault|文件夹|目录|文件结构|知识库)|重新组织|文件分类|目录规划|归类整理/, skill: SKILL_VAULT_ORGANIZE },
      // —— 笔记合并 ——
      { pattern: /合并(?:笔记|重复)|去重|查重|重复笔记/, skill: SKILL_NOTE_MERGE },
      // —— 索引/MOC ——
      { pattern: /(?:创建|生成|做)(?:一个)?(?:索引|MOC|目录|内容地图|导航)|map\s*of\s*content/i, skill: SKILL_NOTE_INDEX },
      // —— 批量处理 ——
      { pattern: /批量(?:处理|重命名|加标签|移动|格式化|整理)/, skill: SKILL_BATCH_PROCESS },
    ];
    for (const { pattern, skill } of rules) {
      if (pattern.test(msg)) return skill;
    }
    return "";
  }

  // 构建增强的 vault 上下文：文件夹结构 + 全文搜索结果
  private async _buildVaultContext(userQuery: string): Promise<string> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    if (files.length === 0) return "";
    const folders = new Set<string>();
    for (const f of files) {
      const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "/";
      folders.add(dir);
    }
    const folderList = [...folders].sort().slice(0, 15);
    let ctx = "\n[Vault: " + files.length + " 篇笔记, " + folderList.length + " 个目录]\n";
    ctx += "目录: " + folderList.map(d => d === "/" ? "根目录" : d).join(" | ") + "\n";
    const results = await this._searchVault(userQuery, 5);
    if (results.length > 0) {
      ctx += "\n🔍 匹配的笔记:\n";
      for (const r of results) {
        ctx += `- [[${r.path}|${r.title}]]: "${r.excerpt.slice(0, 150)}"\n`;
      }
    }
    return ctx;
  }

  private async hcs(um: string): Promise<void> {
    const ek = this.plugin.getEffectiveApiKey();
    if (!ek) { this.lfm = um; this.chatView.cancelStreaming(); this.chatView.showError("API Key not configured."); return; }
    this.lfm = null;
    this.plugin.apiClient.updateConfig(this.plugin.settings.baseUrl, ek, this.plugin.settings.model, this.plugin.settings.reasoningEffort);

    // 基础系统提示词（缓存，不随每条消息变化）
    const needNewBaseSp = this.cp !== this.cachedSpNote || !this.cachedSp || this.apiMsgs.length === 0;
    if (needNewBaseSp) {
      const nc = this.gnc();
      // 检测用户是否要求读特定笔记
      const readTarget = this._detectReadNoteRequest(um);
      let readContent = "";
      if (readTarget) {
        const note = await this._readVaultNote(readTarget);
        if (note) {
          readContent = "\n📖 用户要求读取笔记: " + note.path + "\n---\n" + note.content.slice(0, 8000) + "\n---\n";
          new Notice("已读取: " + note.path);
        }
      }
      // 构建增强的 vault 上下文（文件夹 + 全文搜索）
      const vaultCtx = await this._buildVaultContext(um);
      let sp = NOTE_METHODOLOGY + "\n" + MATH + "\n" + SYNTAX + "\n" + TEMPLATE + "\n" + SKILL_QUERY_UNDERSTAND + "\n";
      // 注入匹配的整理 Skill
      const activeSkill = this._detectSkill(um);
      if (activeSkill) sp += activeSkill + "\n";
      if (nc && this.afc) sp += "User reference (excerpt):\n--- NOTE ---\n" + nc.slice(0, 1500) + "\n---\nAttached: " + this.afn + ":\n--- FILE ---\n" + this.afc.slice(0, 3000) + "\n---\n";
      else if (this.afc) sp += "Attached file (" + this.afn + "):\n---\n" + this.afc.slice(0, 4000) + "\n---\n";
      else if (nc) sp += "Reference note (excerpt):\n---\n" + nc.slice(0, 2000) + "\n---\n";
      if (this.plugin.settings.memoryEnabled && this.plugin.memory) {
        const memories = this.plugin.memory.retrieve(um + "\n" + (nc || ""));
        if (memories.length > 0) sp += "\n[Memory]\n" + memories.map(m => "- " + m.title + ": " + m.content.slice(0, 300)).join("\n") + "\n[/Memory]\n";
      }
      if (this.plugin.settings.sanitizerEnabled) sp = Sanitizer.sanitizeWithRules(sp, this.plugin.settings.sanitizerRules).sanitized;
      this.cachedSp = sp; this.cachedSpNote = this.cp;
      this.apiMsgs = [];
    }

    // 🔍 每条消息都重建 vault 上下文（不缓存）
    const vaultCtx = await this._buildVaultContext(um);
    const _rt = this._detectReadNoteRequest(um);
    let _rc = "";
    if (_rt) {
      const note = await this._readVaultNote(_rt);
      if (note) {
        _rc = "📖 用户要求读: " + note.path + "\n---\n" + note.content.slice(0, 8000) + "\n---";
        new Notice("已读取: " + note.path);
      }
    }

    this.cacheTotal++;
    const isCacheHit = !needNewBaseSp && this.apiMsgs.length >= 3;
    if (isCacheHit) this.cacheHits++;

    const ms = [...this.apiMsgs];
    if (ms.length === 0) ms.push({ role: "system", content: this.cachedSp });
    // 注入 vault 上下文到用户消息前缀
    let aug = um;
    if (vaultCtx) aug = vaultCtx + "\n---\n用户问题: " + um;
    if (_rc) aug = _rc + "\n\n" + aug;
    ms.push({ role: "user", content: aug });

    this.abortController = new AbortController();
    this.chatView.setStopCallback(() => this.stopGeneration());

    try {
      const r = await this.plugin.apiClient.chat(
        ms as import("./types").ChatMessage[],
        { stream: true, maxTokens: 4096, signal: this.abortController.signal },
      );
      const stm = r as AsyncGenerator<string, void, undefined>;
      for await (const d of stm) this.chatView.appendToAssistant(d);
      this.chatView.finalizeStreaming();
      // 自动保存逻辑：知识图谱优先于笔记
      const lastMsg = this.chatView.getMessages().filter(m => m.role === "assistant").pop();
      const fullContent = lastMsg?.content || "";
      if (fullContent.trim() && this._shouldAutoCreateCanvas(um)) {
        // 知识图谱 → 自动创建 .canvas（用笔记原文/附件，非 AI 回复文本）
        this.chatView.finalizeWithActions();
        const sourceContent = this.afc || this.gnc() || fullContent;
        await this.hcc(sourceContent);
      } else if (fullContent.trim() && this._shouldAutoSaveNote(um)) {
        // 笔记 → 自动保存为 .md 文件
        const notePath = await this._autoSaveNote(fullContent);
        await this.chatView.finalizeWithNote(notePath);
        new Notice("📝 笔记已生成: " + notePath, 5000);
      } else {
        this.chatView.finalizeWithActions();
      }
      this.apiMsgs = [...ms];
      if (lastMsg) this.apiMsgs.push({ role: "assistant", content: lastMsg.content.slice(0, 2000) });
      if (this.apiMsgs.length > 11) this.apiMsgs = this.apiMsgs.slice(-10);
      if (this.apiMsgs.length > 0 && this.apiMsgs[0].role !== "system") {
        this.apiMsgs.unshift({ role: "system", content: this.cachedSp });
      }
      if (this.cp) {
        const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const label = v?.file ? v.file.basename + " (" + v.file.path + ")" : this.cp;
        this._updateCtx(label);
      }
      this.pc();
    } catch (e) {
      this.chatView.finalizeStreaming();
      if (e instanceof DeepSeekError && e.statusCode === 0 && e.message.includes("超时")) { /* user abort */ }
      else {
        const em = e instanceof DeepSeekError ? e.toUserMessage() : e instanceof Error ? e.message : "Request failed";
        this.chatView.showError(em); this.lfm = um;
      }
    } finally {
      this.abortController = null;
      this.chatView.setStopCallback(null);
    }
  }

  su(content: string): void { this.chatView.addMessage({ role: "user", content }); }
  sa(content: string): void { this.chatView.addAssistantMessage(content); }
  showUserMessage(content: string): void { this.su(content); }
  showAssistantMessage(content: string): void { this.sa(content); }

  async createCanvasFromContent(content: string): Promise<void> {
    this.su("Create knowledge network (Canvas)");
    new Notice("Generating...", 2000);
    try {
      const generated = await this._generateCanvasJson(content);
      if (generated) { await this.ccf(generated); this.sa("Canvas created"); return; }
    } catch (e) { console.error("[DeepSeek] Canvas fail:", e); }
    this.sa("Failed to generate canvas.");
  }

  // ---- Copilot ----
  private _getSelection(): { text: string; editor: import("obsidian").Editor } | null {
    const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!v) return null;
    const sel = v.editor.getSelection().trim();
    if (!sel) return null;
    return { text: sel, editor: v.editor };
  }

  async inlinePolish(): Promise<void> {
    const sel = this._getSelection();
    if (!sel) { new Notice("Select text first"); return; }
    new Notice("Polishing...");
    try {
      const msgs = [
        { role: "system", content: "Polish the text: improve flow, fix grammar, keep meaning. Output ONLY the polished text." },
        { role: "user", content: sel.text.slice(0, 3000) },
      ];
      const resp = await this.plugin.apiClient.chat(msgs as import("./types").ChatMessage[], { stream: false, maxTokens: 2048 }) as string;
      if (resp.trim()) { sel.editor.replaceSelection(resp.trim()); new Notice("Polished"); }
    } catch (e) { new Notice("Polish fail: " + (e instanceof Error ? e.message : "Error")); }
  }

  async inlineExplain(): Promise<void> {
    const sel = this._getSelection();
    if (!sel) { new Notice("Select text first"); return; }
    new Notice("Explaining...");
    try {
      const msgs = [
        { role: "system", content: "Explain the selected text clearly with examples. Output in Markdown. Start with '> 原文：' quote, then your explanation." },
        { role: "user", content: sel.text.slice(0, 3000) },
      ];
      const resp = await this.plugin.apiClient.chat(msgs as import("./types").ChatMessage[], { stream: false, maxTokens: 2048 }) as string;
      if (resp.trim()) { sel.editor.replaceSelection(resp.trim()); new Notice("Explained"); }
    } catch (e) { new Notice("Explain fail: " + (e instanceof Error ? e.message : "Error")); }
  }
}