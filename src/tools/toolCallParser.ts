// ============================================================
// Tool Call Parser & Executor
// 解析 AI 响应中的 <tool_call> 块，执行工具，注入结果
// ============================================================
import { getToolRegistry } from "./ToolRegistry";
import type DeepSeekPlugin from "../../main";

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  /** Raw matched text in the response */
  rawMatch: string;
}

export interface ToolCallResult {
  call: ParsedToolCall;
  output: string;
  error?: string;
  elapsedMs: number;
}

/**
 * Parse <tool_call> blocks from AI response text.
 * Format: <tool_call>{"name":"searchVault","args":{"query":"xxx"}}</tool_call>
 * Fallback: 模型可能输出 createNote\n{...} 等畸形格式
 */
export function parseToolCalls(text: string): ParsedToolCall[] {
  const results: ParsedToolCall[] = [];
  const seenNames = new Set<string>();

  // 标准格式
  const stdRegex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = stdRegex.exec(text)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      if (json.name && typeof json.name === "string") {
        results.push({ name: json.name, args: json.args || {}, rawMatch: match[0] });
        seenNames.add(json.name);
      }
    } catch { /* skip */ }
  }

  // 回退格式：createNote\n{...} 或 createNote {...}（GLM-4 常见错误）
  if (results.length === 0) {
    const toolNames = ["createNote","modifyNote","appendNote","searchVault","readNote","listNotes","getFileTree","getTags","saveCanvas"];
    const fallbackRegex = new RegExp(
      `\\b(${toolNames.join("|")})\\s*\\n?\\s*(\\{[\\s\\S]*?\\})\\s*$`,
      "gm"
    );
    while ((match = fallbackRegex.exec(text)) !== null) {
      const toolName = match[1];
      if (seenNames.has(toolName)) continue;
      try {
        const json = JSON.parse(match[2]);
        results.push({ name: toolName, args: json, rawMatch: match[0] });
        seenNames.add(toolName);
      } catch { /* skip */ }
    }
  }

  return results;
}

/**
 * Execute a parsed tool call and return the result.
 */
export async function executeToolCall(
  call: ParsedToolCall,
  plugin: DeepSeekPlugin,
): Promise<ToolCallResult> {
  const start = Date.now();
  const registry = getToolRegistry();

  try {
    const output = await registry.execute(call.name, call.args, plugin);
    return { call, output, elapsedMs: Date.now() - start };
  } catch (err) {
    return {
      call,
      output: "",
      error: err instanceof Error ? err.message : "执行失败",
      elapsedMs: Date.now() - start,
    };
  }
}

/**
 * Generate the tools section for the system prompt.
 * 融合了 Zettelkasten、PARA、MOC、Fabric Patterns 等开源方法论的精髓。
 */
export function buildToolsPrompt(): string {
  const registry = getToolRegistry();
  const tools = registry.getAll();
  if (tools.length === 0) return "";

  const toolDescs = tools
    .map((t) => {
      const params = Object.entries(t.parameters)
        .map(([k, v]: [string, any]) => `    "${k}": ${v.type} — ${v.description || ""}`)
        .join("\n");
      return `- **${t.name}**: ${t.description}\n  参数:\n${params}`;
    })
    .join("\n\n");

  return `
# 🛠️ 可用工具

你可以调用以下工具来完成知识管理任务。调用格式：
\`\`\`
<tool_call>{"name":"工具名","args":{"参数1":"值1"}}</tool_call>
\`\`\`

${toolDescs}

---

# 🧭 工具选择决策树

按用户意图选择，**按优先级从上到下匹配**：

| 用户意图 | 触发词 | 首选工具 | 备选 |
|---|---|---|---|
| 浏览全部笔记 | 「有哪些笔记/我的笔记/看看有什么」 | **listNotes** | getFileTree |
| 找特定笔记 | 「有没有关于X的/搜索X/找X」 | **searchVault** | listNotes |
| 看某篇内容 | 「打开X/看看X笔记/读X」 | **readNote** | — |
| 创建笔记 | 「创建/新建/做笔记/整理成笔记/写一篇」 | **createNote** | — |
| 改笔记内容 | 「修改/更新/重写/改一下X」 | **modifyNote** | — |
| 追加到笔记 | 「补充/添加/追加/记一笔」 | **appendNote** | — |
| 看标签体系 | 「有哪些标签/标签列表」 | **getTags** | — |
| 画脑图 | 「知识图谱/思维导图/脑图/概念图/关系图」 | **saveCanvas** | — |
| 日常闲聊 | 问候/感谢/简单问答 | **不用工具** | — |

---

# 📝 笔记整理方法论

## 一、原子化原则（借鉴 Zettelkasten）
- **一笔记一概念**：每篇笔记只讲一个核心概念
- **稠密链接**：用 [[链接]] 串联相关笔记，形成知识网络
- **用自己的话写**：不要复制粘贴原文，要消化后重述
- **概念导向**：标题是「核心概念」而非「某书第3章笔记」

## 二、文件夹组织（借鉴 PARA）
- **项目（Projects）**：有明确截止日期的任务 → \`项目/XX项目/\`
- **领域（Areas）**：持续关注的主题 → \`学习/编程/\` \`工作/设计/\`
- **资源（Resources）**：参考资料 → \`参考/论文/\` \`书摘/\`
- **归档（Archives）**：已完成/不再活跃 → \`归档/\`
- 用户未指定路径时，根据内容主题自动归类

## 三、索引笔记（借鉴 MOC - Maps of Content）
- 当某个主题下笔记超过 3 篇，主动建议创建索引笔记
- 索引笔记格式：主题概述 + 相关笔记列表（[[链接]]）

## 四、笔记内容结构
创建笔记时，按以下结构组织（Markdown 格式）：
\`\`\`markdown
---
tags: [标签1, 标签2]
created: 日期
---

# 核心概念（1句话概括）

## 要点
- 关键观点1
- 关键观点2

## 细节
具体展开...

## 相关笔记
- [[笔记A]] — 为什么相关
- [[笔记B]] — 为什么相关
\`\`\`

---

# 🧠 知识图谱生成指南

## 何时生成脑图
- 用户明确要求「画脑图/知识图谱/思维导图」
- 一篇笔记概念较多（5+），用户可能想可视化
- 用户说「帮我理清思路/梳理关系」

## 图谱设计原则（借鉴思维导图方法论）
1. **中心向外辐射**：1个核心节点 → 3-5个一级分支 → 每个分支 1-3 个叶子
2. **颜色编码**：4=蓝色(核心概念) / 5=绿色(分支/子概念) / 2=橙色(结论/行动)
3. **节点命名**：简短（≤8字），是概念而非句子
4. **连线逻辑**：edges 表达 "属于/导致/关联/对比" 等关系
5. **空间布局**：x 间隔 300px，y 间隔 120px，避免重叠

## Canvas JSON 生成与保存
**两步走**：
1. 先在回复文字中输出 JSON（让用户看到结构）
2. 再调用 saveCanvas 保存为 .canvas 文件

**JSON 模板**：
\`\`\`json
{
  "nodes": [
    {"id":"1","type":"text","x":0,"y":0,"width":250,"height":60,"text":"核心主题","color":"4"},
    {"id":"2","type":"text","x":300,"y":0,"width":250,"height":60,"text":"子概念A","color":"5"},
    {"id":"3","type":"text","x":300,"y":120,"width":250,"height":60,"text":"子概念B","color":"5"}
  ],
  "edges": [
    {"id":"e1","fromNode":"1","toNode":"2","fromSide":"right","toSide":"left"},
    {"id":"e2","fromNode":"1","toNode":"3","fromSide":"right","toSide":"left"}
  ]
}
\`\`\`
- type 固定为 "text"
- id 从 "1" 开始递增，edges 的 id 用 "e1" "e2" 格式
- fromSide/toSide: "top" / "right" / "bottom" / "left"

---

# 📋 创建笔记的正确姿势

❌ **错误**：在聊天里贴完整笔记内容（浪费时间、可能截断、用户看不到文件）
✅ **正确**：一句话说明，然后直接调用 createNote
\`\`\`
我来创建这篇笔记。

<tool_call>{"name":"createNote","args":{"path":"深度学习/LambdaNetworks详解.md","content":"---\\ntags: ...\\n---\\n\\n# 标题\\n\\n内容...\\n"}}</tool_call>
\`\`\`

---

# ⚠️ 核心规则（违反率最高的放前面）

1. **笔记需求用 createNote**：用户说「创建笔记/整理成笔记/生成笔记/写一篇笔记/做成笔记/保存为笔记」→ 必须调用 createNote 保存为文件。**禁止在聊天框里输出笔记全文预览**——只需一句话说明（如"我来创建这篇笔记"），然后直接调用工具。普通问答不需要。
2. **先搜再建**：用户要创建笔记 → 先 searchVault 搜一次检查重复 → 再 createNote
3. **一次搜索，立即行动**：不要反复搜同一个关键词，搜完马上建
4. **不要空手回答**：「有没有X笔记」→ 必须查工具，不能凭记忆说没有
5. **笔记引用用 [[]]**：提到笔记名时用 \`[[笔记名]]\` 格式
6. **工具结果如实引用**：工具说没有就是没有，不要虚构内容
7. **闲聊不用工具**：「你好/谢谢/怎么样」直接回答
8. **工具调用放末尾**：先分析，最后放 \`<tool_call>\`
9. **content 里双引号转义**：\`"\` → \`\\"\`，换行 → \`\\n\`
10. **路径有意义**：禁止「AI生成的笔记」「新建笔记」等泛称
11. **用户语言跟随**：用户用中文就中文回复，用英文就英文回复
`;
}
