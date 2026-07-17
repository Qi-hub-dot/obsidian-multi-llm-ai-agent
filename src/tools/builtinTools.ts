// ============================================================
// Built-in tools — vault read/write, search, time, file tree
// ============================================================
import { ToolRegistry, getToolRegistry, type ToolDef } from "./ToolRegistry";
import type DeepSeekPlugin from "../../main";
import { TFile, Notice } from "obsidian";
import { getSearchIndex } from "../search/vaultSearch";

// ---- Canvas 格式规范化（兼容 AI 各种错误输出）----
export function normalizeCanvasJSON(raw: any): { nodes: any[]; edges: any[] } {
  const rawNodes = raw.nodes || [];
  const rawEdges = raw.edges || [];

  // 1. 从 nodes 中分离出边（AI 可能把边塞进 nodes）
  const realNodes: any[] = [];
  const edgeFromNodes: any[] = [];
  for (const n of rawNodes) {
    if (n.fromNode || n.type === "edge") {
      edgeFromNodes.push(n);
    } else {
      realNodes.push(n);
    }
  }

  // 2. 规范化节点：统一 type:"text"，重编号
  const nodes = realNodes.map((n: any, i: number) => ({
    id: String(i + 1),
    type: "text",
    x: n.x || (i % 3) * 300,
    y: n.y || Math.floor(i / 3) * 120,
    width: n.width || 250,
    height: n.height || 60,
    text: n.text || n.label || String(n.id || ""),
    color: n.color || "4",
  }));

  // 3. 构建节点标签→ID 映射，解析边引用
  const labelToId = new Map<string, string>();
  for (const n of nodes) {
    labelToId.set(n.id, n.id);
    if (n.text) labelToId.set(n.text, n.id);
  }
  for (const n of rawNodes) {
    const oldId = String(n.id);
    if (n.text && !labelToId.has(oldId)) labelToId.set(oldId, oldId);
  }

  // 4. 收集所有边并规范化
  const allEdges = [...edgeFromNodes, ...rawEdges];
  const edges: any[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < allEdges.length; i++) {
    const e = allEdges[i];
    const from = labelToId.get(String(e.fromNode)) || labelToId.get(e.fromNode) || String(e.fromNode);
    const to = labelToId.get(String(e.toNode)) || labelToId.get(e.toNode) || String(e.toNode);
    const key = `${from}->${to}`;
    if (!from || !to || seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: "e" + (i + 1),
      fromNode: from,
      toNode: to,
      fromSide: e.fromSide || "right",
      toSide: e.toSide || "left",
    });
  }

  return { nodes, edges };
}

// ---- 递归收集 .md 文件 ----
function collectMdFiles(folder: any, prefix: string): string[] {
  const results: string[] = [];
  for (const child of (folder.children || [])) {
    if (child instanceof TFile && child.extension === "md") {
      results.push(prefix + child.name);
    } else if (!(child instanceof TFile)) {
      results.push(...collectMdFiles(child, prefix + child.name + "/"));
    }
  }
  return results;
}

export function registerBuiltinTools(plugin: DeepSeekPlugin): void {
  const registry = getToolRegistry();

  // ========================================
  // 1. listNotes — 浏览全部笔记
  // ========================================
  registry.register({
    name: "listNotes",
    description: "列出 vault 中所有笔记（可按文件夹筛选）。当你需要了解用户有哪些笔记、找特定主题笔记、或用户问「有哪些笔记/我的笔记/看看有什么」时使用。",
    parameters: {
      folder: { type: "string", description: "文件夹路径，为空则列出所有笔记。如 '编程' 或 '学习/数学'" },
      maxResults: { type: "number", description: "最大返回数量，默认 50" },
    },
    execute: async (params) => {
      const folderPath = (params.folder as string) || "";
      const max = (params.maxResults as number) || 50;
      let folder: any;
      if (folderPath) {
        folder = plugin.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) return `未找到文件夹「${folderPath}」。请用空参数获取根目录文件列表。`;
      } else {
        folder = plugin.app.vault.getRoot();
      }
      const files = collectMdFiles(folder, folderPath ? folderPath + "/" : "");
      if (files.length === 0) return folderPath ? `「${folderPath}」下没有笔记。` : "Vault 中暂无笔记。";
      const shown = files.slice(0, max);
      let out = folderPath ? `「${folderPath}」` : "Vault 根目录";
      out += `共 ${files.length} 篇笔记`;
      if (files.length > max) out += `（显示前 ${max} 篇）`;
      out += "：\n" + shown.map((f, i) => `${i + 1}. 📄 ${f.replace(/\.md$/, "")}`).join("\n");
      return out;
    },
  });

  // ========================================
  // 2. readNote — 阅读笔记
  // ========================================
  registry.register({
    name: "readNote",
    description: "读取指定笔记的完整内容。当你需要了解某篇笔记的具体内容、用户要求查看/阅读某篇笔记时使用。先用 listNotes 或 searchVault 找到笔记路径。",
    parameters: {
      path: { type: "string", description: "笔记路径，如 '编程/Python.md' 或 '日记/2025-01-01.md'" },
    },
    execute: async (params) => {
      const path = params.path as string;
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return `❌ 未找到笔记「${path}」。请用 searchVault 搜索确认路径，或直接创建新笔记。`;
      const content = await plugin.app.vault.read(file);
      return `📄 **${file.basename}**\n路径: ${file.path}\n\n${content.slice(0, 8000)}${content.length > 8000 ? "\n\n…（内容过长已截断）" : ""}`;
    },
  });

  // ========================================
  // 3. searchVault — 全文搜索
  // ========================================
  registry.register({
    name: "searchVault",
    description: "在 vault 中全文搜索笔记。当用户问「有没有关于X的笔记/搜索X/找X相关内容」时使用。结果包含相关度评分，🟢高相关可直接引用，🟡低相关仅供参考。",
    parameters: {
      query: { type: "string", description: "搜索关键词，提取用户问题的核心概念" },
      topK: { type: "number", description: "返回结果数，默认 5，最多 10" },
    },
    execute: async (params) => {
      const query = params.query as string;
      const topK = (params.topK as number) || 5;
      const index = getSearchIndex();
      const results = index.search(query, Math.min(topK, 10));
      if (results.length === 0) return "未找到匹配笔记。可以：① 尝试不同关键词 ② 直接创建新笔记。";
      const high = results.filter(r => r.score >= 0.5);
      const low = results.filter(r => r.score < 0.5);
      let output = `搜索「${query}」：${results.length} 条结果（${high.length} 🟢高相关 / ${low.length} 🟡低相关）\n`;
      output += results.map((r) => {
        const tag = r.score >= 0.5 ? "🟢" : "🟡";
        return `- ${tag} [[${r.title}]] — ${r.snippet.slice(0, 120)}`;
      }).join("\n");
      if (high.length === 0) output += "\n⚠️ 无高相关结果，建议直接创建新笔记或换关键词。";
      return output;
    },
  });

  // ========================================
  // 4. createNote — 创建笔记
  // ========================================
  registry.register({
    name: "createNote",
    description: "创建一篇新笔记。当用户要求「创建笔记/新建/整理成笔记/做笔记/写一篇关于X的笔记」时使用。路径按主题分类，内容为完整 Markdown。",
    parameters: {
      path: { type: "string", description: "笔记路径，如 '编程/设计模式/观察者模式.md'。按主题分文件夹，文件名有意义。" },
      content: { type: "string", description: "笔记完整 Markdown 内容，包含标题、标签、正文、链接。用 \\n 表示换行。" },
    },
    execute: async (params) => {
      const path = params.path as string;
      const content = params.content as string;
      if (plugin.app.vault.getAbstractFileByPath(path)) {
        return `⚠️ 笔记「${path}」已存在。如需修改请用 modifyNote，如需追加请用 appendNote。`;
      }
      const parts = path.split("/");
      if (parts.length > 1) {
        let current = "";
        for (let i = 0; i < parts.length - 1; i++) {
          current += (current ? "/" : "") + parts[i];
          if (!plugin.app.vault.getAbstractFileByPath(current)) {
            await plugin.app.vault.createFolder(current);
          }
        }
      }
      await plugin.app.vault.create(path, content);
      new Notice(`✅ 笔记已创建: ${path}`);
      return `✅ 笔记已创建：${path}\n内容长度：${content.length} 字符`;
    },
  });

  // ========================================
  // 5. modifyNote — 替换笔记内容
  // ========================================
  registry.register({
    name: "modifyNote",
    description: "替换笔记的全部内容（覆盖写入）。当用户要求「修改/更新/重写/覆盖」某篇笔记时使用。如果只需追加内容，用 appendNote。",
    parameters: {
      path: { type: "string", description: "笔记路径，如 '编程/Python.md'" },
      content: { type: "string", description: "笔记新内容（完整 Markdown，会覆盖原文件）" },
    },
    execute: async (params) => {
      const path = params.path as string;
      const content = params.content as string;
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return `❌ 未找到笔记「${path}」。请用 listNotes 或 searchVault 确认路径。`;
      await plugin.app.vault.modify(file, content);
      new Notice(`✅ 笔记已更新: ${path}`);
      return `✅ 笔记已更新：${path}\n新内容长度：${content.length} 字符`;
    },
  });

  // ========================================
  // 6. appendNote — 追加内容
  // ========================================
  registry.register({
    name: "appendNote",
    description: "在笔记末尾追加内容（不覆盖原有内容）。当用户要求「补充/添加/追加」内容到某篇笔记时使用。如需完全替换，用 modifyNote。",
    parameters: {
      path: { type: "string", description: "笔记路径" },
      content: { type: "string", description: "要追加的 Markdown 内容" },
    },
    execute: async (params) => {
      const path = params.path as string;
      const content = params.content as string;
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return `❌ 未找到笔记「${path}」。`;
      const existing = await plugin.app.vault.read(file);
      await plugin.app.vault.modify(file, existing + "\n\n" + content);
      new Notice(`✅ 已追加到: ${path}`);
      return `✅ 已追加到：${path}（新增 ${content.length} 字符）`;
    },
  });

  // ========================================
  // 7. getFileTree — 目录结构
  // ========================================
  registry.register({
    name: "getFileTree",
    description: "查看 vault 的文件夹结构。当需要了解笔记组织方式、查看某文件夹下有哪些内容时使用。",
    parameters: {
      path: { type: "string", description: "文件夹路径，为空则显示根目录" },
    },
    execute: async (params) => {
      const path = (params.path as string) || "";
      const folder = path
        ? plugin.app.vault.getAbstractFileByPath(path)
        : plugin.app.vault.getRoot();
      if (!folder) return `未找到文件夹「${path}」。`;
      const children = (folder as any).children || [];
      if (!children || children.length === 0) return "空文件夹。";
      return children
        .slice(0, 50)
        .map((c: any) => {
          const isDir = !(c instanceof TFile);
          return `${isDir ? "📁" : "📄"} ${c.name}${isDir ? "/" : ""}`;
        })
        .join("\n");
    },
  });

  // ========================================
  // 8. getTags — 标签列表
  // ========================================
  registry.register({
    name: "getTags",
    description: "列出 vault 中使用的所有标签及其出现次数。当用户问「有哪些标签/标签列表」或需要参考现有标签体系时使用。",
    parameters: {},
    execute: async () => {
      const tags = (plugin.app.metadataCache as any).getTags?.() || {};
      const entries = Object.entries(tags) as Array<[string, number]>;
      if (entries.length === 0) return "暂无标签。";
      return entries
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([tag, count]) => `#${tag} (${count}次)`)
        .join("\n");
    },
  });

  // ========================================
  // 9. saveCanvas — 知识图谱/脑图
  // ========================================
  registry.register({
    name: "saveCanvas",
    description: "将知识图谱/思维导图保存为 Obsidian Canvas 文件（.canvas）。当用户要求「生成知识图谱/画脑图/思维导图/概念图/关系图」时，先输出节点和边的 JSON，再调用此工具保存。",
    parameters: {
      canvasJSON: { type: "string", description: "Canvas JSON 字符串，包含 nodes 数组和 edges 数组。nodes 每项：id(type为text),x,y,width,height,text,color。edges 每项：id,fromNode,toNode,fromSide,toSide。颜色：4=蓝(核心) 5=绿(分支) 2=橙(结论)" },
    },
    execute: async (params) => {
      const jsonStr = params.canvasJSON as string;
      let raw: any;
      try { raw = JSON.parse(jsonStr); }
      catch { return "❌ JSON 格式错误。请确保 canvasJSON 是有效的 JSON 字符串，双引号用 \\\" 转义。"; }
      if (!raw.nodes || !Array.isArray(raw.nodes)) return "❌ 缺少 nodes 数组。格式：{\"nodes\":[{...}],\"edges\":[{...}]}";

      const { nodes, edges } = normalizeCanvasJSON(raw);

      // 使用插件记录的当前笔记路径（比 getActiveFile 更可靠）
      const notePath = plugin.currentNotePath || "";
      const folder = notePath ? notePath.replace(/\/[^/]+\.md$/, "") : "";
      const baseName = notePath ? notePath.replace(/.*\//, "").replace(/\.md$/, "") : "知识图谱";
      const cName = baseName + "_图谱";
      const canvasPath = (folder ? folder + "/" : "") + cName.replace(/[/\\?%*:|"<>]/g, "_") + ".canvas";

      const canvasData = { nodes, edges };
      await plugin.app.vault.create(canvasPath, JSON.stringify(canvasData, null, 2));
      new Notice(`✅ 知识图谱已生成：${canvasPath}`, 8000);
      return `✅ 知识图谱已保存：${canvasPath}\n节点 ${nodes.length} 个，连线 ${edges.length} 条。`;
    },
  });
}
