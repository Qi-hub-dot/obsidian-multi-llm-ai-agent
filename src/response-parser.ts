// ============================================================
// AI 响应结构化解析
// ============================================================
import type { SplitNote, TagSuggestion, LinkSuggestion } from "./types";

/**
 * 从 AI 响应中提取 JSON 数组。
 * 支持 Markdown 代码块包裹和裸 JSON。
 */
function extractJsonArray(raw: string): string {
  const trimmed = raw.trim();
  
  // 尝试提取 ```json ... ``` 代码块
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    return codeBlock[1].trim();
  }

  // 尝试找到开头的 [ 和末尾的 ]（JSON 数组）
  if (trimmed.startsWith("[")) {
    const end = trimmed.lastIndexOf("]");
    if (end > 0) return trimmed.slice(0, end + 1);
  }

  // 尝试找到开头的 { 和末尾的 }（单对象 JSON）
  if (trimmed.startsWith("{")) {
    const end = trimmed.lastIndexOf("}");
    if (end > 0) return trimmed.slice(0, end + 1);
  }

  return trimmed;
}

/**
 * 解析拆分结果。
 * 输入：AI 返回的 JSON 字符串
 * 输出：SplitNote 数组
 * 降级：解析失败时返回单条笔记（整个响应作为内容）
 */
export function parseSplitResult(rawResponse: string): SplitNote[] {
  try {
    const jsonStr = extractJsonArray(rawResponse);
    const parsed = JSON.parse(jsonStr);

    // 处理单个对象的情况
    const arr = Array.isArray(parsed) ? parsed : [parsed];

    return arr.map(
      (item: Record<string, unknown>, index: number): SplitNote => ({
        title:
          typeof item.title === "string" && item.title.trim()
            ? item.title.trim()
            : `笔记 ${index + 1}`,
        content:
          typeof item.content === "string" ? item.content.trim() : "",
        tags: Array.isArray(item.tags)
          ? item.tags
              .filter((t: unknown): t is string => typeof t === "string")
              .map((t: string) => t.trim())
          : [],
      }),
    );
  } catch {
    // 降级：整个响应作为单条笔记
    return [
      {
        title: "导入笔记",
        content: rawResponse.trim(),
        tags: [],
      },
    ];
  }
}

/**
 * 解析标签建议。
 */
export function parseTagSuggestions(
  rawResponse: string,
): TagSuggestion[] {
  try {
    const jsonStr = extractJsonArray(rawResponse);
    const parsed = JSON.parse(jsonStr);
    const arr = Array.isArray(parsed) ? parsed : [parsed];

    return arr.map(
      (item: Record<string, unknown>): TagSuggestion => ({
        tag:
          typeof item.tag === "string" ? item.tag.trim() : "",
        confidence:
          typeof item.confidence === "number"
            ? Math.min(1, Math.max(0, item.confidence))
            : 0.5,
        reason: typeof item.reason === "string" ? item.reason : "",
      }),
    );
  } catch {
    // 降级：按行解析为标签
    return rawResponse
      .split("\n")
      .map((line) => line.replace(/^[#\-\s\d.]+/, "").trim())
      .filter(Boolean)
      .map((tag) => ({
        tag,
        confidence: 0.5,
        reason: "",
      }));
  }
}

/**
 * 解析双向链接建议。
 */
export function parseLinkSuggestions(
  rawResponse: string,
): LinkSuggestion[] {
  try {
    const jsonStr = extractJsonArray(rawResponse);
    const parsed = JSON.parse(jsonStr);
    const arr = Array.isArray(parsed) ? parsed : [parsed];

    return arr.map(
      (item: Record<string, unknown>): LinkSuggestion => ({
        targetNote:
          typeof item.targetNote === "string"
            ? item.targetNote.trim()
            : "",
        snippet:
          typeof item.snippet === "string"
            ? item.snippet.trim()
            : "",
        reason:
          typeof item.reason === "string"
            ? item.reason.trim()
            : "",
      }),
    );
  } catch {
    // 降级：提取 [[...]] 格式
    const links: LinkSuggestion[] = [];
    const regex = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(rawResponse)) !== null) {
      links.push({
        targetNote: match[1],
        snippet: "",
        reason: "",
      });
    }
    return links;
  }
}
