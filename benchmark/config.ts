// ============================================================
// Benchmark configuration
// ============================================================

export const CONFIG = {
  /** Verbose output: show per-case details */
  verbose: false,
  /** Timeout per test case in ms */
  caseTimeout: 5000,
  /** Output format: "terminal" | "json" | "markdown" */
  outputFormat: "terminal" as "terminal" | "json" | "markdown",
  /** Modules to run */
  modules: ["tokenizer", "canvas-robustness", "tool-call-parse", "search-precision"] as string[],
};

/** CJK n-gram tokenizer — pure function, extracted from vaultSearch.ts */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const segments = text.split(/([\u4e00-\u9fff\u3400-\u4dbf]+)/);

  for (const seg of segments) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(seg)) {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
      for (let i = 0; i < seg.length - 2; i++) {
        tokens.push(seg.slice(i, i + 3));
      }
    } else {
      const words = seg
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 2);
      tokens.push(...words);
    }
  }
  return tokens;
}

/** Canvas JSON normalizer — pure function, extracted from builtinTools.ts */
export function normalizeCanvasJSON(raw: any): { nodes: any[]; edges: any[] } {
  const rawNodes = raw.nodes || [];
  const rawEdges = raw.edges || [];

  const realNodes: any[] = [];
  const edgeFromNodes: any[] = [];
  for (const n of rawNodes) {
    if (n.fromNode || n.type === "edge") {
      edgeFromNodes.push(n);
    } else {
      realNodes.push(n);
    }
  }

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

  const labelToId = new Map<string, string>();
  for (const n of nodes) {
    labelToId.set(n.id, n.id);
    if (n.text) labelToId.set(n.text, n.id);
  }
  for (const n of rawNodes) {
    const oldId = String(n.id);
    if (n.text && !labelToId.has(oldId)) labelToId.set(oldId, oldId);
  }

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

/** Tool call parser — pure function, extracted from toolCallParser.ts */
export function parseToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const results: Array<{ name: string; args: Record<string, unknown> }> = [];
  const seenNames = new Set<string>();

  const stdRegex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = stdRegex.exec(text)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      if (json.name && typeof json.name === "string") {
        results.push({ name: json.name, args: json.args || {} });
        seenNames.add(json.name);
      }
    } catch { /* skip */ }
  }

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
        results.push({ name: toolName, args: json });
        seenNames.add(toolName);
      } catch { /* skip */ }
    }
  }

  return results;
}

/** Simple TF-IDF search for benchmarking — pure implementation */
export function simpleSearch(
  query: string,
  notes: Array<{ title: string; content: string }>,
  topK = 5,
): Array<{ title: string; score: number }> {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Build document frequency
  const df = new Map<string, number>();
  const docTokens: Array<Map<string, number>> = [];

  for (const note of notes) {
    const tf = new Map<string, number>();
    const titleTokens = tokenize(note.title);
    const bodyTokens = tokenize(note.content.slice(0, 5000));

    for (const t of titleTokens) tf.set(t, (tf.get(t) || 0) + 3);
    for (const t of bodyTokens) tf.set(t, (tf.get(t) || 0) + 1);

    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docTokens.push(tf);
  }

  const totalDocs = notes.length;
  const scored: Array<{ title: string; score: number }> = [];

  for (let i = 0; i < notes.length; i++) {
    let score = 0;
    for (const qt of queryTokens) {
      const tf = docTokens[i].get(qt) || 0;
      if (tf === 0) continue;
      const docFreq = df.get(qt) || 1;
      score += (1 + Math.log(tf)) * Math.log(totalDocs / docFreq);
    }

    const titleLower = notes[i].title.toLowerCase();
    if (titleLower.includes(query.toLowerCase())) score *= 1.5;

    if (score > 0) scored.push({ title: notes[i].title, score: Math.round(score * 100) / 100 });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
