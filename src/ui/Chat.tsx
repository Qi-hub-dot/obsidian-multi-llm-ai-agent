// ============================================================
// Chat.tsx — 工具调用循环集成
// ============================================================
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Notice } from "obsidian";
import type DeepSeekPlugin from "../../main";
import type { ChatMessage } from "../types";
import { DeepSeekError } from "../types";
import { ChatInput } from "./ChatInput";
import { ChatMessageView } from "./ChatMessage";
import { ChatHistory } from "./ChatHistory";
import { getParserForFile } from "../parsers/index";
import { parseToolCalls, executeToolCall, buildToolsPrompt } from "../tools/toolCallParser";
import { normalizeCanvasJSON } from "../tools/builtinTools";
import type { ToolCallResult } from "../tools/toolCallParser";

/* 快捷提示 */
const SUGGESTED = [
  { icon: "📝", text: "生成摘要", prompt: "请为当前笔记生成摘要" },
  { icon: "🏷️", text: "推荐标签", prompt: "请为当前笔记推荐标签" },
  { icon: "🔗", text: "推荐链接", prompt: "请为当前笔记推荐双向链接" },
  { icon: "🧠", text: "知识图谱", prompt: "请根据当前笔记生成知识图谱" },
  { icon: "✍️", text: "润色笔记", prompt: "请润色当前笔记" },
  { icon: "📋", text: "原子笔记", prompt: "请将当前笔记拆分为原子笔记" },
];

const P_INFO: Record<string, { icon: string; label: string }> = {
  deepseek: { icon: "🔴", label: "DeepSeek" },
  qwen: { icon: "🟠", label: "通义千问" },
  glm: { icon: "🔵", label: "GLM" },
  ollama: { icon: "🦙", label: "Ollama" },
};

interface ChatCallbacks {
  onSaveNote: (content: string) => Promise<string | null>;
  onCreateCanvas: (content: string) => Promise<void>;
  onNewChat: () => void;
}

interface ChatProps {
  plugin: DeepSeekPlugin;
  initialMessages: ChatMessage[];
  notePath: string;
  noteName: string | null;
  onMessagesChange: (msgs: ChatMessage[]) => void;
  onNewConversation: () => void;
  modelMode: "chat" | "reasoner";
  onModelModeChange: (mode: "chat" | "reasoner") => Promise<void>;
  activeProvider: string;
  availableProviders: Array<{ id: string; label: string }>;
  onProviderChange: (provider: string) => Promise<void>;
  chatHistoryItems: Array<{ id: string; title: string; date: string }>;
  callbacks: ChatCallbacks;
}

const MAX_TOOL_ROUNDS = 20; // 硬上限，防止死循环

export const Chat: React.FC<ChatProps> = ({
  plugin, initialMessages, notePath, noteName,
  onMessagesChange, onNewConversation,
  modelMode, onModelModeChange,
  activeProvider, availableProviders, onProviderChange,
  chatHistoryItems, callbacks,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [reasoningText, setReasoningText] = useState("");
  const [reasoningDone, setReasoningDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [showProviders, setShowProviders] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [toolResults, setToolResults] = useState<ToolCallResult[]>([]);
  const [canvasProgress, setCanvasProgress] = useState<{ nodeCount: number; edgeCount: number; phase: string } | null>(null);
  const [noteProgress, setNoteProgress] = useState<{ sectionCount: number; charCount: number; phase: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef("");

  useEffect(() => { onMessagesChange(messages); }, [messages]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, streamingText, toolResults]);

  // ---- 核心发送 + 工具调用循环 ----
  const runWithTools = useCallback(async (chatMsgs: ChatMessage[]) => {
    setToolResults([]);
    // 设置当前笔记路径，供工具（如 saveCanvas）确定文件保存位置
    plugin.currentNotePath = notePath;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const ctrl = new AbortController(); abortRef.current = ctrl;
      setStreaming(true); setStreamingText(""); setReasoningText(""); setReasoningDone(false);
      setCanvasProgress(null); setNoteProgress(null);
      let reasoning = "";

      const apiMsgs = await buildApi(plugin, chatMsgs, attachedFile, notePath);
      let full = "";
      try {
        const res = await plugin.modelManager.chat(apiMsgs, activeProvider as any, {
          stream: true, signal: ctrl.signal,
          onReasoning: (chunk: string) => { reasoning += chunk; setReasoningText(reasoning); },
        });
        for await (const d of res as AsyncGenerator<string>) {
          full += d;
          streamRef.current = full;
          setStreamingText(full);
          // Canvas 进度检测
          if (full.includes('"nodes"') || full.includes('canvasJSON')) {
            const nodeMatches = full.match(/"text"\s*:\s*"/g);
            const edgeMatches = full.match(/"fromNode"\s*:/g);
            const nc = nodeMatches ? nodeMatches.length : 0;
            const ec = edgeMatches ? edgeMatches.length : 0;
            let phase = "分析概念...";
            if (nc >= 3) phase = "构建节点关系...";
            if (nc >= 8) phase = "生成连线...";
            if (ec >= 5 && nc >= 10) phase = "即将完成...";
            setCanvasProgress({ nodeCount: nc, edgeCount: ec, phase });
          }
          // 笔记进度检测：检测到 frontmatter + 标题 → 正在生成笔记
          if ((full.indexOf("---") === 0 || full.includes("\n---\n")) && full.includes("# ")) {
            const sections = full.match(/^## /gm);
            const sc = sections ? sections.length : 0;
            let phase = "构思大纲...";
            if (sc >= 2) phase = "撰写章节...";
            if (sc >= 5) phase = "补充细节...";
            if (full.length > 2000 && sc >= 5) phase = "即将完成...";
            setNoteProgress({ sectionCount: sc, charCount: full.length, phase });
          }
        }
      } catch (e: any) {
        // 流中断但有部分内容 → 不报错，继续走自动保存/工具解析
        if (streamRef.current.trim()) {
          full = streamRef.current;
        } else {
          setError(e instanceof DeepSeekError ? e.toUserMessage() : e instanceof Error ? e.message : "发送失败");
          setStreaming(false); return;
        }
      }
      setStreaming(false); setStreamingText(""); setCanvasProgress(null); setNoteProgress(null);

      if (!full.trim()) break;

      // ---- Canvas 自动检测 + 保存 ----
      const canvasJSON = extractCanvasJSON(full);
      if (canvasJSON) {
        // Step 1: 解析 JSON
        let raw: any;
        try { raw = JSON.parse(canvasJSON); }
        catch { new Notice("⚠️ 图谱 JSON 格式错误，请重试", 5000); raw = null; }
        
        if (raw?.nodes && Array.isArray(raw.nodes) && raw.nodes.length > 0) {
          try {
            const { nodes, edges } = normalizeCanvasJSON(raw);
            let folder = "";
            const lastSlash = notePath.lastIndexOf("/");
            if (lastSlash >= 0) folder = notePath.substring(0, lastSlash);
            const baseName = (noteName || notePath?.replace(/.*\//, "")?.replace(/\.md$/, "") || "知识图谱");
            const cName = baseName + "_图谱";
            const canvasPath = (folder ? folder + "/" : "") + cName.replace(/[/\\?%*:|"<>]/g, "_") + ".canvas";

            // Step 2: 保存文件（已存在则覆盖）
            const existing = plugin.app.vault.getAbstractFileByPath(canvasPath);
            if (existing) {
              await plugin.app.vault.modify(existing as any, JSON.stringify({ nodes, edges }, null, 2));
            } else {
              await plugin.app.vault.create(canvasPath, JSON.stringify({ nodes, edges }, null, 2));
            }
            // 保存成功后：通知 + 自动打开 + 聊天区可点击链接
            new Notice(`✅ 知识图谱已生成！文件在：${canvasPath}`, 15000);

            // 自动打开画布
            try {
              await plugin.app.workspace.openLinkText(canvasPath, "", false);
            } catch {
              // openLinkText 失败时尝试用 getLeaf 打开
              try {
                const file = plugin.app.vault.getAbstractFileByPath(canvasPath);
                if (file) {
                  const leaf = plugin.app.workspace.getLeaf(false);
                  await leaf.openFile(file as any);
                }
              } catch { /* 静默 */ }
            }

            // Step 3: 替换聊天记录中的 JSON（用可点击的 Obsidian 链接）
            const linkLabel = canvasPath.replace(/\.canvas$/, "");
            const msg = `✅ 知识图谱 → [[${linkLabel}|点击打开]]（${nodes.length} 节点 ${edges.length} 连线）`;
            const idx = full.indexOf(canvasJSON);
            if (idx >= 0) {
              let rs = idx, re = idx + canvasJSON.length;
              const before = full.substring(Math.max(0, idx - 25), idx);
              const after = full.substring(re, re + 15);
              const fo = before.match(/```(?:json|canvas(?:json)?)?\s*$/);
              const fc = after.match(/^\s*```/);
              if (fo) rs = idx - fo[0].length;
              if (fc) re += fc[0].length;
              full = full.substring(0, rs) + msg + full.substring(re);
            } else {
              full = msg;
            }
          } catch (e: any) {
            console.warn("[Canvas] save failed:", e?.message || e);
            new Notice("⚠️ 图谱保存失败：" + (e?.message || "未知错误"), 5000);
          }
        }
      } else if (full.includes('"nodes"')) {
        console.warn("[Canvas] nodes detected but extraction failed, text length:", full.length);
      }

      // Parse tool calls
      const calls = parseToolCalls(full);
      if (calls.length === 0) {
        // 安全网：AI 忘记调用 createNote，但输出明显是笔记内容 → 自动保存
        if (isAutoSaveNote(full)) {
          const noteContent = extractNoteContent(full);
          const title = extractNoteTitle(full) || "未命名笔记";
          const folder = getCurrentFolder(notePath);
          const safePath = folder + title.replace(/[/\\?%*:|"<>]/g, "_") + ".md";
          try {
            await executeToolCall(
              { name: "createNote", args: { path: safePath, content: noteContent }, rawMatch: "" },
              plugin,
            );
            new Notice(`✅ 笔记已自动创建: ${safePath}`, 8000);
            chatMsgs = [...chatMsgs, { role: "assistant" as const, content: `✅ 笔记已创建：[[${safePath.replace(/\.md$/, "")}]]`, id: "a" + Date.now() }];
            setMessages(chatMsgs);
            // 自动打开生成的笔记
            try {
              const file = plugin.app.vault.getAbstractFileByPath(safePath);
              if (file) {
                const leaf = plugin.app.workspace.getLeaf(false);
                await leaf.openFile(file as any);
              }
            } catch { /* 静默 */ }
          } catch (e: any) {
            chatMsgs = [...chatMsgs, { role: "assistant" as const, content: full, id: "a" + Date.now() }];
            setMessages(chatMsgs);
          }
          return;
        }

        // 无工具调用 → 任务完成，直接退出，不要循环
        chatMsgs = [...chatMsgs, { role: "assistant" as const, content: full, id: "a" + Date.now() }];
        setMessages(chatMsgs);
        return;
      }

      // Strip tool calls from visible content
      let cleanContent = full;
      for (const c of calls) cleanContent = cleanContent.replace(c.rawMatch, "");

      // createNote / modifyNote：不展示预览内容，只保留工具执行结果
      if (calls.some(c => c.name === "createNote" || c.name === "modifyNote")) {
        cleanContent = "";
      } else {
        cleanContent = cleanContent.trim();
      }

      if (cleanContent) {
        chatMsgs = [...chatMsgs, { role: "assistant" as const, content: cleanContent, id: "a" + Date.now() }];
        setMessages(chatMsgs);
      }

      // Execute all tools in this round
      const results: ToolCallResult[] = [];
      const toolOutputs: string[] = [];
      for (const call of calls) {
        const r = await executeToolCall(call, plugin);
        results.push(r);
        if (r.error) {
          toolOutputs.push(`[${call.name}] 错误: ${r.error}`);
        } else {
          toolOutputs.push(`[${call.name}] 结果:\n${r.output.slice(0, 2000)}`);
        }
      }
      setToolResults((prev) => [...prev, ...results]);

      // Inject results for next round
      chatMsgs = [...chatMsgs, {
        role: "system" as const,
        content: "工具调用结果：\n" + toolOutputs.join("\n\n"),
      }];
    }

    // 硬上限触发 → 不做特殊处理，直接保留当前对话
  }, [plugin, attachedFile, notePath, activeProvider]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming || analyzing) return;
    const um: ChatMessage = { role: "user", content: text, id: "u" + Date.now() };
    const all = [...messages, um];
    setMessages(all); setError(null);
    await runWithTools(all);
  }, [messages, streaming, runWithTools]);

  // 统一附件处理 — 根据文件类型智能路由
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAttach = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() || "";

    // 文本文件 → 直接解析，注入上下文给主模型
    if (["md", "txt"].includes(ext)) {
      try {
        const p = await getParserForFile(f.name);
        if (p) {
          setAttachedFile({ name: f.name, content: await p.parse(await f.arrayBuffer()) });
          new Notice(`已加载：${f.name}`);
        }
      } catch (e: any) { setError(e.message); }
      return;
    }

    // 需要视觉能力的文件 → 路由到多模态接口
    const needsVision = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "pdf"].includes(ext);
    const isWord = ["docx", "doc"].includes(ext);

    if (needsVision) {
      if (!plugin.modelManager.hasVision()) {
        // 没有视觉配置 → PDF 回退到文字提取
        if (ext === "pdf") {
          try {
            const p = await getParserForFile(f.name);
            if (p) {
              setAttachedFile({ name: f.name, content: await p.parse(await f.arrayBuffer()) });
              new Notice(`已加载：${f.name}（文字提取）`);
            }
          } catch { setError("PDF 解析失败，请配置视觉模型以支持扫描件识别。"); }
          return;
        }
        setError("图片识别需要配置视觉模型。请在设置 → 多模态中配置通义千问 VL 或 GLM-4V。");
        return;
      }
      // 有视觉配置 → 调用多模态识别
      setPendingFile(f);
      setAnalyzing(true);
      try {
        const result = await plugin.modelManager.analyzeFile(f);
        setMessages((p) => [...p, {
          role: "system" as const,
          content: `[文件识别: ${f.name}]\n${result.text}`,
        }]);
        new Notice(`已识别：${f.name}`);
      } catch (e: any) { setError("识别失败：" + e.message); }
      finally { setAnalyzing(false); setPendingFile(null); }
      return;
    }

    // Word → 文字提取
    if (isWord) {
      try {
        const p = await getParserForFile(f.name);
        if (p) {
          setAttachedFile({ name: f.name, content: await p.parse(await f.arrayBuffer()) });
          new Notice(`已加载：${f.name}`);
        }
      } catch { setError("Word 解析失败。"); }
      return;
    }

    setError(`不支持的文件类型: .${ext}`);
  }, [plugin]);

  const pi = P_INFO[activeProvider] || P_INFO.deepseek;
  const empty = messages.length === 0 && !streaming;
  const hasVision = plugin.modelManager.hasVision();
  const [ctxNotes, setCtxNotes] = useState<string[]>([]);
  const [ctxNoteContents, setCtxNoteContents] = useState<Record<string, string>>({});

  // Auto-inject active note content
  useEffect(() => {
    if (!notePath) return;
    const f = plugin.app.vault.getAbstractFileByPath(notePath);
    if (!f) return;
    (plugin.app.vault.read(f as any) as Promise<string>).then((c: string) => {
      setCtxNotes([notePath]);
      setCtxNoteContents({ [notePath]: c });
    }).catch(() => {});
  }, [notePath, plugin]);

  const tokenEstimate = useMemo(() => {
    const allText = messages.map(m => m.content).join(" ") + (ctxNoteContents[notePath] || "").slice(0, 1000);
    return Math.ceil(allText.length / 2);
  }, [messages, ctxNoteContents, notePath]);

  const handleExport = useCallback(() => {
    const md = messages.map(m => `### ${m.role === "user" ? "你" : "AI"}\n\n${m.content}\n`).join("\n---\n\n");
    const now = new Date().toISOString().slice(0, 10);
    const path = `AI对话_${now}.md`;
    plugin.app.vault.create(path, `---\ntitle: AI 对话\ndate: ${now}\n---\n\n${md}`).then(() => new Notice("已导出：" + path)).catch(() => new Notice("导出失败"));
  }, [messages, plugin]);

  return (
    <div className="ds-root">
      {/* ===== 工具栏 ===== */}
      <div className="ds-toolbar">
        <div className="ds-tb-left">
          <button className="ds-tb-btn ds-tb-provider" onClick={() => setShowProviders(!showProviders)}>
            <span>{pi.icon}</span><span>{pi.label}</span>
            {activeProvider === "deepseek" && <span className="ds-tb-tag">{modelMode === "reasoner" ? "Pro" : "Flash"}</span>}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {chatHistoryItems.length > 0 && (
            <button className="ds-tb-btn" onClick={() => setShowHistory(!showHistory)} title="历史">📋</button>
          )}
        </div>
        <div className="ds-tb-right">
          <span className="ds-tb-token" title="估算 Token 数">~{tokenEstimate} tok</span>
          <button className="ds-tb-btn" onClick={handleExport} title="导出对话">📤</button>
          <button className="ds-tb-btn" onClick={() => { callbacks.onNewChat(); setMessages([]); setToolResults([]); }} title="新建">➕</button>
          <button className="ds-tb-btn" onClick={() => callbacks.onSaveNote(messages.map(m => m.content).join("\n\n"))} title="保存">💾</button>
        </div>
      </div>

      {/* 模型选择弹出 */}
      {showProviders && <div className="ds-backdrop" onClick={() => setShowProviders(false)}>
        <div className="ds-popup" onClick={e => e.stopPropagation()}>
          <div className="ds-popup-hd">选择模型</div>
          {availableProviders.filter(p => p.id === "deepseek").map(p => (
            <div key={p.id} className="ds-popup-grp">
              <button className={`ds-popup-item ${activeProvider === "deepseek" && modelMode === "chat" ? "on" : ""}`}
                onClick={() => { onProviderChange("deepseek"); onModelModeChange("chat"); setShowProviders(false); }}>
                <span>🔴 DeepSeek V4 Flash</span><span className="ds-popup-sub">快速响应 · 日常问答</span>
              </button>
              <button className={`ds-popup-item ${activeProvider === "deepseek" && modelMode === "reasoner" ? "on" : ""}`}
                onClick={() => { onProviderChange("deepseek"); onModelModeChange("reasoner"); setShowProviders(false); }}>
                <span>🧠 DeepSeek V4 Pro</span><span className="ds-popup-sub">深度推理 · 复杂问题</span>
              </button>
            </div>
          ))}
          {availableProviders.filter(p => p.id !== "deepseek").map(p => (
            <button key={p.id} className={`ds-popup-item ${activeProvider === p.id ? "on" : ""}`}
              onClick={() => { onProviderChange(p.id); setShowProviders(false); }}>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>}

      {/* 历史弹出 */}
      {showHistory && <div className="ds-backdrop" onClick={() => setShowHistory(false)}>
        <div className="ds-popup" style={{maxWidth:380}} onClick={e => e.stopPropagation()}>
          <div className="ds-popup-hd">对话历史</div>
          <ChatHistory
            items={chatHistoryItems}
            onLoad={(id) => { onNewConversation(); setShowHistory(false); }}
            onDelete={(id) => { plugin.chatPersistence?.deleteConversation?.(id); }}
            onClose={() => setShowHistory(false)}
          />
        </div>
      </div>}

      {/* ===== 附件标签 ===== */}
      {(attachedFile || pendingFile) && (
        <div className="ds-chips">
          {attachedFile && <span className="ds-chip">📄 {attachedFile.name}<button className="ds-chip-x" onClick={() => setAttachedFile(null)}>×</button></span>}
          {pendingFile && <span className="ds-chip ds-chip-img">{analyzing ? "⏳" : "📎"} {pendingFile.name}
            <span className="ds-chip-go">{analyzing ? "识别中…" : "等待"}</span>
          </span>}
        </div>
      )}

      {/* ===== 上下文标签栏 ===== */}
      {ctxNotes.length > 0 && (
        <div className="ds-ctx-bar">
          <span className="ds-ctx-bar-label">上下文:</span>
          <div className="ds-ctx-bar-chips">
            {ctxNotes.map(n => (
              <span key={n} className="ds-ctx-chip">
                📄 {n.split("/").pop()?.replace(".md","")}
                <button className="ds-ctx-chip-x" onClick={() => { setCtxNotes(ctxNotes.filter(x => x !== n)); const c = {...ctxNoteContents}; delete c[n]; setCtxNoteContents(c); }}>×</button>
              </span>
            ))}
            {attachedFile && <span className="ds-ctx-chip">📎 {attachedFile.name}</span>}
          </div>
        </div>
      )}

      {/* ===== 消息区 ===== */}
      <div className="ds-scroll" ref={scrollRef}>
        {empty && (
          <div className="ds-welcome">
            <div className="ds-welcome-icon">💬</div>
            <div className="ds-welcome-title">DeepSeek AI 助手</div>
            <div className="ds-welcome-sub">{noteName ? `当前笔记：${noteName}` : "打开笔记获取上下文，或直接提问"}</div>
            <div className="ds-grid2">
              {SUGGESTED.map((s, i) => (
                <button key={i} className="ds-chip-prompt" onClick={() => send(s.prompt)}>
                  <span>{s.icon}</span><span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <ChatMessageView key={m.id || i} message={m} index={i}
            onCopy={(t) => navigator.clipboard.writeText(t).then(() => new Notice("已复制"))}
            onRegenerate={() => { const prev = i > 0 && messages[i - 1].role === "user" ? messages[i - 1].content : ""; if (prev) { setMessages(messages.slice(0, i)); send(prev); } }}
            onEdit={() => setEditingIdx(i)}
            onDelete={() => setMessages((p) => p.filter((_, j) => j !== i))}
            isEditing={editingIdx === i}
            onEditSave={(t) => { const u = [...messages]; u[i] = { ...u[i], content: t }; setMessages(u); setEditingIdx(null); if (u[i].role === "user") { const n = u.slice(0, i + 1); setMessages(n); send(t); } }}
            onEditCancel={() => setEditingIdx(null)}
            modelTag={activeProvider === "deepseek" ? (modelMode === "reasoner" ? "V4 Pro" : "V4 Flash") : pi.label}
          />
        ))}

        {/* 工具调用结果卡片 */}
        {toolResults.map((tr, i) => (
          <div key={"tool-" + i} className="ds-msg-row ai">
            <div className="ds-msg-card ds-tool-card">
              <div className="ds-tool-head">
                <span>🔧 {tr.call.name}</span>
                <span className="ds-tool-time">{tr.elapsedMs}ms</span>
              </div>
              {tr.error ? (
                <div className="ds-tool-err">{tr.error}</div>
              ) : (
                <div className="ds-tool-out">{tr.output.slice(0, 1000)}</div>
              )}
            </div>
          </div>
        ))}

        {streaming && (
          <div className="ds-msg-row ai">
            <div className="ds-msg-card">
              <div className="ds-meta">AI 助手</div>
              {reasoningText && (
                <details className="ds-reason" open={!streamingText && !canvasProgress && !noteProgress}>
                  <summary className="ds-reason-summary">
                    💭 思考过程 {!streamingText && !canvasProgress && !noteProgress ? "✓" : ""}
                  </summary>
                  <div className="ds-reason-body">{reasoningText}</div>
                </details>
              )}
              {/* 知识图谱生成进度卡 */}
              {canvasProgress ? (
                <div className="ds-canvas-progress">
                  <div className="ds-cp-header">
                    <span className="ds-cp-icon">🧠</span>
                    <span className="ds-cp-title">正在生成知识图谱</span>
                    <span className="ds-cp-phase">{canvasProgress.phase}</span>
                  </div>
                  <div className="ds-cp-bar-track">
                    <div className="ds-cp-bar-fill" style={{
                      width: `${Math.min(Math.round((canvasProgress.nodeCount + canvasProgress.edgeCount) / 2), 100)}%`,
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                  <div className="ds-cp-stats">
                    <span>🧩 节点 {canvasProgress.nodeCount} 个</span>
                    <span>🔗 连线 {canvasProgress.edgeCount} 条</span>
                    <span className="ds-cp-pct">{Math.min(Math.round((canvasProgress.nodeCount + canvasProgress.edgeCount) / 2), 100)}%</span>
                  </div>
                  <details className="ds-cp-raw">
                    <summary className="ds-cp-raw-summary">📋 查看生成详情</summary>
                    <pre className="ds-cp-raw-content">{streamingText.slice(-3000)}</pre>
                  </details>
                </div>
              ) : noteProgress ? (
                /* 笔记生成进度卡 */
                <div className="ds-canvas-progress">
                  <div className="ds-cp-header">
                    <span className="ds-cp-icon">📝</span>
                    <span className="ds-cp-title">正在生成笔记</span>
                    <span className="ds-cp-phase">{noteProgress.phase}</span>
                  </div>
                  <div className="ds-cp-bar-track">
                    <div className="ds-cp-bar-fill" style={{
                      width: `${Math.min(Math.round(noteProgress.sectionCount * 15 + noteProgress.charCount / 100), 95)}%`,
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                  <div className="ds-cp-stats">
                    <span>📑 章节 {noteProgress.sectionCount} 个</span>
                    <span>📄 {noteProgress.charCount} 字</span>
                    <span className="ds-cp-pct">{Math.min(Math.round(noteProgress.sectionCount * 15 + noteProgress.charCount / 100), 95)}%</span>
                  </div>
                </div>
              ) : (
                <div className="ds-body">
                  {streamingText ? <div className="ds-stream">{streamingText}<span className="ds-cursor" /></div>
                    : !reasoningText ? <div className="ds-loading"><span className="ds-dot" /><span className="ds-dot" /><span className="ds-dot" /></div> : null}
                </div>
              )}
              <button className="ds-stop" onClick={() => { abortRef.current?.abort(); }}>⏹ 停止</button>
            </div>
          </div>
        )}
      </div>

      {/* ===== 错误 ===== */}
      {error && <div className="ds-err"><span>⚠️ {error}</span><button onClick={() => setError(null)}>×</button></div>}

      {/* ===== 输入 ===== */}
      <ChatInput onSend={send} onAttach={handleAttach}
        streaming={streaming} providerIcon={pi.icon} />
    </div>
  );
};

/** Extract balanced JSON from incomplete/streaming text by counting braces */
function balanceBraces(text: string): string | null {
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (text[i] === "}") { depth--; if (depth === 0 && start >= 0) return text.slice(start, i + 1); }
  }
  return null;
}

/** Extract valid Canvas JSON from AI response (handles code blocks, tool calls, raw JSON) */
function extractCanvasJSON(text: string): string | null {
  const nodeIdx = text.indexOf('"nodes"');
  if (nodeIdx < 0) return null;

  // 从 "nodes" 位置往前，收集所有深度为 0 的 { 位置（候选起点）
  let depth = 0;
  const starts: number[] = [];
  for (let i = nodeIdx; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{") {
      if (depth === 0) starts.push(i);
      depth--;
    }
  }

  // 逐个候选尝试：提取平衡 JSON → 解析 → 验证有 nodes 数组
  for (const start of starts) {
    depth = 0; let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end <= start) continue;
    const json = text.slice(start, end);
    try {
      const p = JSON.parse(json);
      if (p.nodes && Array.isArray(p.nodes) && p.nodes.length > 0) return json;
    } catch { /* 试下一个候选 */ }
  }

  return null;
}

// ---- 安全网：检测 AI 是否输出了笔记但忘记调用 createNote ----
// 支持两种笔记格式：
//   A. --- YAML frontmatter 开头
//   B. # Markdown 标题开头（至少 2 个 ## 章节）

/** 在文本中查找笔记内容起始位置（支持 frontmatter 和标题开头） */
function findNoteStart(text: string): number {
  const t = text.trim();
  // A. --- frontmatter
  const fmIdx = text.indexOf("---");
  if (fmIdx >= 0) {
    const after = text.substring(fmIdx + 3).trimStart();
    if (/^\n/.test(after) || after.startsWith("tags:") || after.startsWith("created:") ||
        after.startsWith("title:") || after.startsWith("date:") || after.startsWith("---")) {
      return fmIdx;
    }
  }
  // B. # 标题（后面至少有一个 ## 章节）
  const h1Match = text.match(/^#\s+.+$/m);
  if (h1Match && h1Match.index !== undefined) {
    const afterTitle = text.substring(h1Match.index + h1Match[0].length);
    if (/^##\s/m.test(afterTitle)) return h1Match.index;
  }
  return -1;
}

/** 从完整响应中提取纯笔记内容（跳过前言，剥离尾部工具调用残留） */
function extractNoteContent(text: string): string {
  const start = findNoteStart(text);
  if (start < 0) return text;
  let content = text.substring(start);

  // 剥离尾部 AI 客套话和畸形工具调用残留
  // 匹配模式：createNote\n{...}、---\n\ncreateNote {...} 等
  const toolNames = ["createNote","modifyNote","appendNote","searchVault","readNote","listNotes","getFileTree","getTags","saveCanvas"];
  const garbagePatterns = [
    // 尾部 --- 分隔符（后面只有空白或工具调用）
    /\n---\s*$/,
    // 工具名 + JSON 块
    new RegExp(`\\n(${toolNames.join("|")})\\s*\\n?\\s*\\{[\\s\\S]*$`, "m"),
    // "接下来，我将使用..." 之类的客套话
    /\n{1,2}(接下来|现在|我来|我将|让我|下面|以上是)[^\n]*$/,
    // 末尾单独的 "createNote" 字样
    /\ncreateNote\s*$/i,
  ];

  for (const pattern of garbagePatterns) {
    const match = content.match(pattern);
    if (match && match.index !== undefined) {
      content = content.substring(0, match.index);
    }
  }

  return content.trim();
}

function isAutoSaveNote(text: string): boolean {
  const noteContent = extractNoteContent(text);
  const t = noteContent.trim();
  if (t.length < 300) return false;
  // A. --- frontmatter + 有标题
  if (t.startsWith("---") && /^#\s/m.test(t)) return true;
  // B. # 标题开头 + 至少 2 个 ## 章节
  if (/^#\s+.+$/m.test(t)) {
    const h2Count = (t.match(/^##\s/gm) || []).length;
    if (h2Count >= 2) return true;
  }
  return false;
}

function extractNoteTitle(text: string): string | null {
  const noteContent = extractNoteContent(text);
  const t = noteContent.trim();
  // 跳过可能的 frontmatter 找第一个 # 标题
  let body = t;
  if (t.startsWith("---")) {
    const closeIdx = t.indexOf("\n---\n", 3);
    body = closeIdx >= 0 ? t.substring(closeIdx + 5).trim() : t;
  }
  const m = body.match(/^#\s+(.+)/m);
  return m ? m[1].trim().replace(/[/\\?%*:|"<>]/g, "_") : null;
}

function getCurrentFolder(notePath: string): string {
  if (!notePath) return "";
  const lastSlash = notePath.lastIndexOf("/");
  return lastSlash >= 0 ? notePath.substring(0, lastSlash + 1) : "";
}

// ---- 构建 API 消息（含工具定义）----
async function buildApi(plugin: DeepSeekPlugin, msgs: ChatMessage[], file: { name: string; content: string } | null, notePath: string): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];

  // ============================================================
  // 1. System：AI 身份 + 工具定义 + 规则（不混入笔记/附件）
  // ============================================================
  let sys = plugin.settings.systemPrompt?.trim() || "你是 Obsidian 知识管理助手，用中文回答。用 Markdown 格式组织回答。先给结论再展开。";
  sys += buildToolsPrompt();
  out.push({ role: "system", content: sys });

  // ============================================================
  // 2. Context：当前笔记 + RAG + 记忆（独立 system 消息）
  // ============================================================
  const ctxParts: string[] = [];

  if (notePath) {
    const nf = plugin.app.vault.getAbstractFileByPath(notePath);
    if (nf) {
      try {
        const c = await plugin.app.vault.read(nf as any);
        const lastSlash = notePath.lastIndexOf("/");
        const folder = lastSlash >= 0 ? notePath.substring(0, lastSlash) : "";
        ctxParts.push(`## 📝 当前笔记\n**文件**: ${notePath}${folder ? `\n**所属目录**: \`${folder}/\`（创建新笔记时请优先放在此目录下）` : ""}\n\n${c.slice(0, 20000)}`);
      } catch { ctxParts.push(`当前笔记：${notePath}`); }
    }
  }

  if (plugin.ragManager?.isAvailable) {
    const lu = [...msgs].reverse().find(m => m.role === "user");
    if (lu) try {
      const r = await plugin.ragManager.search(lu.content, 5);
      if (r.length) ctxParts.push("## 🔗 Vault 相关笔记\n" + r.map((x: any) => `- [[${x.title}]] (${Math.round(x.score * 100)}%)`).join("\n"));
    } catch {}
  } else if (plugin.searchIndex) {
    const lu = [...msgs].reverse().find(m => m.role === "user");
    if (lu) try {
      const r = plugin.searchIndex.search(lu.content, 5);
      if (r.length) ctxParts.push("## 🔗 Vault 相关笔记\n" + r.map((x: any) => `- [[${x.title}]]`).join("\n"));
    } catch {}
  }

  if (plugin.settings.memoryEnabled && plugin.memory) {
    const lu = [...msgs].reverse().find(m => m.role === "user");
    if (lu) {
      const r = plugin.memory.retrieve(lu.content, 5);
      if (r.length) ctxParts.push("## 🧠 记忆\n" + r.map((m: any) => `- ${m.title}`).join("\n"));
    }
  }

  if (ctxParts.length > 0) {
    out.push({ role: "system" as const, content: "以下是本次对话可用的参考上下文，请在回答时参考：\n\n" + ctxParts.join("\n\n---\n\n") });
  }

  // ============================================================
  // 3. 关键规则提醒（对话前最后一条系统消息，确保模型遵守）
  // ============================================================
  out.push({
    role: "system" as const,
    content: `🔴 最高优先级规则：
- 创建笔记/保存文件 → 必须调用 <tool_call>createNote
- 画知识图谱 → 必须调用 <tool_call>saveCanvas  
- 绝对禁止在聊天中直接输出笔记/文件内容。回复只需一句话+工具调用即可。`,
  });

  // ============================================================
  // 4. Attachment + Messages：附件紧贴最后一条用户消息前
  // ============================================================
  const history = msgs.slice(-25);
  // 找到最后一条 user 消息的位置
  let lastUserIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") { lastUserIdx = i; break; }
  }
  for (let i = 0; i < history.length; i++) {
    // 在最后一条 user 消息前插入附件（含工具调用提醒）
    if (file && i === lastUserIdx) {
      out.push({
        role: "user" as const,
        content: `📂 用户上传了文件「${file.name}」，内容如下。\n⚠️ 用户接下来让你做的事（创建笔记/总结/问答等），都基于此文件。如需创建笔记，请调用 createNote 工具，**禁止直接输出笔记全文**。\n\n${file.content.slice(0, 80000)}`,
      });
      new Notice(`📎 附件已注入：${file.name}（${file.content.length} 字符）`, 4000);
    }
    out.push({ role: history[i].role, content: history[i].content.slice(0, 80000) });
  }
  // 如果 history 里没有 user 消息（理论上不会），附件放最前面
  if (file && lastUserIdx < 0) {
    out.splice(2, 0, {
      role: "user" as const,
      content: `📂 用户上传了文件「${file.name}」，内容如下。\n⚠️ 用户接下来让你做的事（创建笔记/总结/问答等），都基于此文件。如需创建笔记，请调用 createNote 工具，**禁止直接输出笔记全文**。\n\n${file.content.slice(0, 80000)}`,
    });
  }
  return out;
}
