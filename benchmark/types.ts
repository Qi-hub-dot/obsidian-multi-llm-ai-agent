// ============================================================
// Benchmark shared types
// ============================================================

export interface TestCase {
  id: string;
  input: any;
  expected: any;
  description: string;
  category: string;
}

export interface BenchmarkResult {
  module: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  cases: CaseResult[];
  summary: string;
}

export interface CaseResult {
  id: string;
  passed: boolean;
  expected: any;
  actual: any;
  description: string;
  durationMs: number;
}

export interface SearchQuery {
  id: string;
  query: string;
  category: string;           // "short" | "long" | "mixed" | "edge"
  groundTruth: string[];      // expected note titles in order of relevance
  notes: SearchNote[];        // the vault of notes to search in
}

export interface SearchNote {
  title: string;
  content: string;
  tags: string[];
}

export interface CanvasTestCase {
  id: string;
  description: string;
  input: any;                 // raw AI JSON output (possibly malformed)
  expectedNodes: number;      // expected number of nodes after normalization
  expectedEdges: number;      // expected number of edges after normalization
  expectedFirstNodeText?: string;
}

export interface ToolCallTestCase {
  id: string;
  description: string;
  input: string;              // raw AI response text
  expectedCalls: number;      // expected number of parsed tool calls
  expectedNames: string[];    // expected tool names
}
