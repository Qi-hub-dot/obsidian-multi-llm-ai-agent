// ============================================================
// Prompt 模板 —— 各场景的 system/user 消息构造
// ============================================================
import type { ChatMessage, SplitGranularity, SummaryStyle, PolishMode } from "./types";

/** 拆分粒度对应的引导词 */
const SPLIT_INSTRUCTIONS: Record<SplitGranularity, string> = {
  coarse: "请在较高层级拆分，每篇笔记覆盖一个广泛主题。",
  medium: "请在中等粒度拆分，每篇笔记覆盖一个独立概念或子主题。",
  fine: "请精细拆分，每篇笔记聚焦一个具体的知识点或观点。",
};

/**
 * 构建用于文档拆分的消息列表。
 */
export function buildSplitPrompt(
  fileName: string,
  content: string,
  granularity: SplitGranularity = "medium",
): ChatMessage[] {
  const instruction = SPLIT_INSTRUCTIONS[granularity];
  return [
    {
      role: "system",
      content: `你是一个知识管理专家，擅长将长文档按主题/概念拆分为独立的原子笔记。

${instruction}

拆分规则：
- 每篇笔记应围绕一个清晰的主题或概念
- 标题应简洁、准确概括核心内容
- content 字段使用 Markdown 格式
- 标签字段提供 2-5 个相关标签
- 拆分的笔记之间应尽量避免内容重叠

请严格按以下 JSON 数组格式输出，不要包含任何其他文字：
\`\`\`json
[
  {
    "title": "笔记标题",
    "content": "Markdown 格式的笔记正文",
    "tags": ["标签1", "标签2", "标签3"]
  }
]
\`\`\``,
    },
    {
      role: "user",
      content: `请将以下文档「${fileName}」按主题/概念拆分为独立的原子笔记。

文档内容：
\`\`\`
${content.slice(0, 50000)}`,
    },
  ];
}

/**
 * 构建聊天上下文 prompt（当前笔记内容 + 用户消息）。
 */
export function buildChatContext(
  noteContent: string | null,
  userMessage: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (noteContent) {
    messages.push({
      role: "system",
      content: `You are a knowledge management assistant inside Obsidian. The user has this note open:\n\n--- Current Note ---\n${noteContent.slice(0, 4000)}\n---\n\nHelp the user understand, organize, or improve this content. Be concise and adaptive — don't follow a fixed template. Respond naturally to what the user actually asks.`,
    });
  } else {
    messages.push({
      role: "system",
      content: "You are a knowledge management assistant inside Obsidian. Help the user manage notes, organize knowledge, and answer questions. Be concise and adaptive — respond naturally to what the user actually asks.",
    });
  }

  messages.push({ role: "user", content: userMessage });
  return messages;
}

/**
 * 构建摘要生成 prompt。
 */
export function buildSummarizePrompt(
  noteContent: string,
  style: SummaryStyle,
): ChatMessage[] {
  const styleInstructions: Record<SummaryStyle, string> = {
    concise: "生成一个简洁的摘要（3-5 句话），抓住核心观点。直接、有洞察力。",
    detailed: "生成详细摘要，涵盖主要观点、关键论据和结论。用自己的话组织，不要复制粘贴原文。结构自然。",
    outline: "用 Markdown 层级标题和列表生成大纲。关注逻辑结构，不要逐字抄录。",
  };

  return [
    {
      role: "system",
      content: `你是一个专业的笔记摘要生成器。${styleInstructions[style]}

输出格式：纯 Markdown，不要 JSON 包裹。不要用不同表述重复同一个观点。
用 ## 作一级分区、### 作二级分区，段落之间空一行。`,
    },
    {
      role: "user",
      content: `请为以下笔记生成摘要：\n\n${noteContent.slice(0, 30000)}`,
    },
  ];
}

/**
 * 构建标签建议 prompt。
 */
export function buildTagSuggestionPrompt(
  noteContent: string,
  existingTags: string[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一个知识分类专家。分析给定的笔记内容，推荐合适的标签。

要求：
- 建议 5-10 个标签
- 标签应具体、有意义，避免过于宽泛（如不要用 "未分类"）
- 标签之间应有区分度
- 已有的标签不要重复建议

已有标签：${existingTags.length > 0 ? existingTags.join("、") : "（无）"}

请严格按以下 JSON 数组格式输出：
\`\`\`json
[
  { "tag": "标签名", "confidence": 0.95, "reason": "推荐理由（一句话）" }
]
\`\`\``,
    },
    {
      role: "user",
      content: `请为以下笔记推荐标签：\n\n${noteContent.slice(0, 20000)}`,
    },
  ];
}

/**
 * 构建双向链接建议 prompt。
 */
export function buildLinkSuggestionPrompt(
  currentNote: string,
  vaultNoteTitles: string[],
): ChatMessage[] {
  const titleList = vaultNoteTitles.slice(0, 200).join("\n- ");

  return [
    {
      role: "system",
      content: `你是一个知识连接专家。分析当前笔记，从 vault 中已有的笔记标题列表中找出最相关的笔记建议建立 [[双向链接]]。

要求：
- 只建议与当前笔记存在真实语义关联的笔记
- 为每个建议提供关联理由和关键关联片段
- 建议数量控制在 3-8 个
- 不要建议当前笔记链接到自身

Vault 中已有的笔记标题：
- ${titleList}

请严格按以下 JSON 数组格式输出：
\`\`\`json
[
  { "targetNote": "已有笔记的标题", "snippet": "关联的关键内容片段", "reason": "建议链接的理由（一句话）" }
]
\`\`\``,
    },
    {
      role: "user",
      content: `请为以下笔记推荐双向链接：\n\n${currentNote.slice(0, 15000)}`,
    },
  ];
}

/**
 * 构建内容润色 prompt。
 */
export function buildPolishPrompt(
  selectedText: string,
  mode: PolishMode,
): ChatMessage[] {
  const modeInstructions: Record<PolishMode, string> = {
    improve: "请润色以下文本，使其更流畅、专业、有表达力。保持原意不变。",
    shorten: "请精简以下文本，保留核心信息，删减冗余表述。",
    expand: "请扩展以下文本，增加细节和深度，使内容更充实。",
    "fix-grammar": "请修正以下文本中的语法和拼写错误，不做风格改动。",
  };

  return [
    {
      role: "system",
      content: `你是一个专业的文本编辑。${modeInstructions[mode]}

请直接输出润色后的纯文本，不要加解释、不要 JSON 包裹、不要标注修改之处。`,
    },
    {
      role: "user",
      content: `请${mode === "improve" ? "润色" : mode === "shorten" ? "精简" : mode === "expand" ? "扩展" : "修正语法错误"}以下文本：\n\n${selectedText}`,
    },
  ];
}

/**
 * 构建去重检测 prompt。
 */
export function buildDedupPrompt(
  noteA: string,
  noteB: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一个笔记查重专家。对比两篇笔记，判断它们是否存在重复或高度相似的内容。

请输出 JSON：
\`\`\`json
{
  "similarity": 0.85,
  "overlapping_themes": ["主题1", "主题2"],
  "recommendation": "merge" | "review" | "keep_separate",
  "merged_content": "如果建议合并，提供合并后的 Markdown 内容"
}
\`\`\``,
    },
    {
      role: "user",
      content: `请对比以下两篇笔记的重合度：

笔记 A：
\`\`\`
${noteA.slice(0, 10000)}
\`\`\`

笔记 B：
\`\`\`
${noteB.slice(0, 10000)}
\`\`\``,
    },
  ];
}

// ============================================================
// 笔记与文件整理 Skill Prompts
// ============================================================

/**
 * 构建 Vault 整理 prompt：分析并建议文件结构重组。
 */
export function buildVaultOrganizePrompt(
  vaultStructure: string,
  userRequest: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一个 Obsidian Vault 整理专家。帮用户分析并重组知识库的文件结构。

整理原则：
1. 先分析当前目录结构的问题（命名不一致、分类混乱、层级过深等）
2. 建议合理的目录分类方案（按主题/学科/项目等维度）
3. 给出具体文件移动计划，用表格展示
4. 建议命名规范
5. 为重要目录建议创建 MOC 索引笔记

输出格式：
- 先用 tree 展示建议的目录结构
- 再用表格列出文件移动计划
- 最后用自然语言说明整理思路`,
    },
    {
      role: "user",
      content: `当前 Vault 结构：\n${vaultStructure}\n\n用户需求：${userRequest}`,
    },
  ];
}

/**
 * 构建笔记合并 prompt：将多篇相关笔记合并为一篇。
 */
export function buildNoteMergePrompt(
  notes: Array<{ title: string; content: string }>,
): ChatMessage[] {
  const notesText = notes
    .map((n, i) => `### 笔记${i + 1}：${n.title}\n\`\`\`\n${n.content.slice(0, 5000)}\n\`\`\``)
    .join("\n\n");

  return [
    {
      role: "system",
      content: `你是一个笔记合并专家。将多篇相关笔记合并为一篇结构清晰的笔记。

合并规则：
1. 去重：相同内容只保留一份，选择最完整或最清晰的版本
2. 整合：将分散在各笔记中的相关信息归到同一主题下
3. 结构：用 # 标题 → ## 大主题 → ### 子主题的层级组织
4. 保留：所有有效的 [[双向链接]] 和 frontmatter tags
5. 标注：在合并笔记末尾注明原始笔记来源

输出格式：完整的 Markdown 笔记，包含 frontmatter`,
    },
    {
      role: "user",
      content: `请合并以下笔记：\n\n${notesText}`,
    },
  ];
}

/**
 * 构建 MOC 索引 prompt：为指定范围创建内容地图。
 */
export function buildIndexPrompt(
  scope: string,
  noteList: Array<{ title: string; path: string; excerpt: string }>,
): ChatMessage[] {
  const entries = noteList
    .map(n => `- [[${n.path}|${n.title}]] — ${n.excerpt.slice(0, 100)}`)
    .join("\n");

  return [
    {
      role: "system",
      content: `你是一个知识索引专家。为指定的笔记范围创建 Map of Content。

索引规则：
1. 按逻辑维度分组（主题、难度、时间等），不要简单按字母排列
2. 每个条目格式：[[笔记链接]] — 一句话摘要
3. 分组之间用 ## 标题区隔
4. 索引顶部用 > [!info] 注明覆盖范围和更新日期
5. 分组内条目数尽量均衡，单个分组不超过 15 条

输出格式：
\`\`\`
# 索引标题
> [!info] 覆盖范围：xxx | 更新：日期
## 分类一
- [[笔记A]] — 摘要
## 分类二
- [[笔记B]] — 摘要
\`\`\``,
    },
    {
      role: "user",
      content: `请为以下范围创建 MOC 索引：\n范围：${scope}\n\n候选笔记：\n${entries}`,
    },
  ];
}
