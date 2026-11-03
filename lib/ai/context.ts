// Layer 2 — conversation context manager (server-side). Slice 4.
// Structured state: metric, entity, timeframe, comparison, analysis type,
// evidence refs, summary, clarification. Selective updates; budget;
// freshness guard. Single manager — no second store; orchestrate.ts only user.

import type { CopilotIntent } from "./types";

export interface TimeframeSel {
  start: string;
  end: string;
  preset: string;
}

export interface ComparisonSel {
  type: "previous_period" | "previous_month" | "same_period_last_year" | "custom" | null;
  targetLabel: string | null;
  prevStart: string | null;
  prevEnd: string | null;
}

export type AnalysisType =
  | "summary"
  | "comparison"
  | "diagnosis"
  | "recommendation"
  | "scenario"
  | null;

/** Slice 6: one ranked recommendation remembered for follow-ups. */
export interface ActivePriority {
  id: string;
  title: string;
  priority: number;
  severity: string;
  type: string;
}

export interface ConversationState {
  conversationId: string;
  businessId: string;
  activeMetric: string | null;
  previousMetric: string | null;
  entityType: string | null;
  activeEntity: string | null;
  timeframe: TimeframeSel | null;
  previousTimeframe: TimeframeSel | null;
  previousIntent: CopilotIntent | null;
  previousSummary: string | null;
  comparison: ComparisonSel | null;
  analysisType: AnalysisType;
  evidenceRefs: string[];
  /** Slice 6: active ranked priority list (max 3, deterministic order). */
  activePriorities: ActivePriority[];
  /** Slice 6: focused priority for "that one / fix it" follow-ups. */
  activePriorityId: string | null;
  summary: string | null;
  pendingClarification: string | null;
  version: number;
  updatedAt: number;
  lastEvidenceAt: number | null;
  lastDataVersion: string | null;
  turns: { role: "user" | "assistant"; content: string }[];
}

const STATES = new Map<string, ConversationState>();
export const MAX_TURNS = 20;
export const HISTORY_BUDGET_CHARS = 4000;
export const HISTORY_MAX_LINES = 6;

function key(conversationId: string, businessId: string): string {
  return `${businessId}::${conversationId}`;
}

function freshState(conversationId: string, businessId: string): ConversationState {
  return {
    conversationId, businessId,
    activeMetric: null, previousMetric: null,
    entityType: null, activeEntity: null,
    timeframe: null, previousTimeframe: null, previousIntent: null,
    previousSummary: null, comparison: null, analysisType: null,
    evidenceRefs: [], activePriorities: [], activePriorityId: null,
    summary: null, pendingClarification: null,
    version: 1, updatedAt: Date.now(),
    lastEvidenceAt: null, lastDataVersion: null,
    turns: [],
  };
}

export function getConversation(conversationId: string, businessId: string): ConversationState {
  const k = key(conversationId, businessId);
  const s = STATES.get(k);
  if (s) {
    if (s.businessId !== businessId) return freshState(conversationId, businessId);
    return s;
  }
  const fresh = freshState(conversationId, businessId);
  STATES.set(k, fresh);
  return fresh;
}

export function clearConversation(conversationId: string, businessId: string): void {
  STATES.delete(key(conversationId, businessId));
}

export function clearAllConversations(): void {
  STATES.clear();
}

/** Append a turn with truncation budget (oldest dropped past MAX_TURNS). */
export function appendTurn(state: ConversationState, role: "user" | "assistant", content: string): void {
  state.turns.push({ role, content: content.slice(0, 2000) });
  if (state.turns.length > MAX_TURNS) {
    const dropped = state.turns.length - MAX_TURNS;
    state.turns.splice(0, dropped);
    const note = `${dropped} older turn(s) summarized away`;
    state.previousSummary = state.previousSummary
      ? `${state.previousSummary} (+${note})`
      : note;
    const line = compactStateLine(state);
    state.summary = (state.summary ? `${state.summary} | ${note}: ${line}` : `${note}: ${line}`).slice(0, 800);
  }
  state.updatedAt = Date.now();
}

function compactStateLine(state: ConversationState): string {
  const bits: string[] = [];
  if (state.activeMetric) bits.push(`metric=${state.activeMetric}`);
  if (state.activeEntity) bits.push(`entity=${state.entityType || "?"}:${state.activeEntity}`);
  if (state.timeframe) bits.push(`tf=${state.timeframe.preset} ${state.timeframe.start}..${state.timeframe.end}`);
  return bits.join(", ") || "no active context";
}

/** Relevant recent history within a char budget (never unlimited raw). */
export function relevantHistory(
  state: ConversationState,
  budgetChars = HISTORY_BUDGET_CHARS,
  maxLines = HISTORY_MAX_LINES,
): { summary: string | null; lines: string[] } {
  const picked: string[] = [];
  let used = 0;
  const recent = state.turns.slice(-Math.max(maxLines * 2, maxLines));
  for (let i = recent.length - 1; i >= 0 && picked.length < maxLines; i -= 1) {
    const t = recent[i];
    const line = `${t.role === "user" ? "Owner" : "Copilot"}: ${t.content.slice(0, 300)}`;
    if (used + line.length > budgetChars && picked.length > 0) break;
    used += line.length;
    picked.unshift(line);
  }
  return { summary: state.summary || state.previousSummary, lines: picked };
}

/** Recent history as compact lines for prompts (budgeted, recent first). */
export function historyLines(state: ConversationState): string[] {
  return relevantHistory(state).lines;
}

/** Short summary preserving metric/entity/timeframe + clarification. */
export function summarizeConversation(state: ConversationState): string {
  const parts: string[] = [];
  parts.push(`metric=${state.activeMetric ?? "none"}`);
  if (state.previousMetric) parts.push(`prevMetric=${state.previousMetric}`);
  parts.push(`entity=${state.entityType && state.activeEntity ? `${state.entityType}:${state.activeEntity}` : "none"}`);
  if (state.timeframe) parts.push(`timeframe=${state.timeframe.preset} ${state.timeframe.start}..${state.timeframe.end}`);
  if (state.comparison?.targetLabel) parts.push(`comparison=${state.comparison.targetLabel}`);
  if (state.analysisType) parts.push(`analysis=${state.analysisType}`);
  if (state.pendingClarification) parts.push(`pending=${state.pendingClarification.slice(0, 120)}`);
  if (state.evidenceRefs.length > 0) parts.push(`evidence=${state.evidenceRefs.slice(-4).join(",")}`);
  if (state.activePriorities.length > 0) {
    parts.push(`priorities=${state.activePriorities.map((p) => `${p.priority}.${p.id}`).join(",")}`);
  }
  if (state.activePriorityId) parts.push(`activePriority=${state.activePriorityId}`);
  return parts.join(" | ").slice(0, 600);
}

/** Selective state update — only fields explicitly passed change. */
export function updateState(state: ConversationState, opts: {
  intent: CopilotIntent;
  metric?: string | null;
  previousMetric?: string | null;
  entityType?: string | null;
  entity?: string | null;
  timeframe?: TimeframeSel | null;
  comparison?: ComparisonSel | null;
  analysisType?: AnalysisType;
  evidenceRefs?: string[] | null;
  activePriorities?: ActivePriority[] | null;
  activePriorityId?: string | null | undefined;
  summary?: string | null;
  pendingClarification?: string | null;
  dataVersion?: string | null;
}): void {
  if (opts.timeframe) {
    if (state.timeframe) state.previousTimeframe = state.timeframe;
    state.timeframe = opts.timeframe;
  }
  if (opts.metric !== undefined) {
    if (opts.metric !== state.activeMetric) state.previousMetric = state.activeMetric;
    state.activeMetric = opts.metric;
  }
  if (opts.previousMetric !== undefined) state.previousMetric = opts.previousMetric;
  if (opts.entityType !== undefined) state.entityType = opts.entityType;
  if (opts.entity !== undefined) state.activeEntity = opts.entity;
  if (opts.comparison !== undefined) state.comparison = opts.comparison;
  if (opts.analysisType !== undefined) state.analysisType = opts.analysisType;
  if (opts.evidenceRefs !== undefined && opts.evidenceRefs !== null) {
    state.evidenceRefs = opts.evidenceRefs.slice(-12);
  }
  if (opts.activePriorities !== undefined && opts.activePriorities !== null) {
    state.activePriorities = opts.activePriorities.slice(0, 3).map((p) => ({
      id: String(p.id).slice(0, 80),
      title: String(p.title).slice(0, 160),
      priority: p.priority,
      severity: String(p.severity).slice(0, 40),
      type: String(p.type).slice(0, 20),
    }));
  }
  if (opts.activePriorityId !== undefined) {
    state.activePriorityId = opts.activePriorityId ? String(opts.activePriorityId).slice(0, 80) : null;
  }
  state.previousIntent = opts.intent;
  if (opts.summary) {
    state.previousSummary = opts.summary.slice(0, 500);
    state.summary = summarizeConversation({ ...state, previousSummary: opts.summary.slice(0, 500) });
  }
  if (opts.dataVersion) { state.lastDataVersion = opts.dataVersion; state.lastEvidenceAt = Date.now(); }
  if (opts.pendingClarification !== undefined) {
    state.pendingClarification = opts.pendingClarification ? opts.pendingClarification.slice(0, 300) : null;
  } else {
    state.pendingClarification = null;
  }
  state.version += 1;
  state.updatedAt = Date.now();
}

/** Evidence reusable only when business + timeframe + version match. */
export function isEvidenceFresh(state: ConversationState, businessId: string, rangeKey: string, dataVersion: string): boolean {
  if (state.businessId !== businessId) return false;
  if (!state.lastEvidenceAt) return false;
  if (state.lastDataVersion !== dataVersion) return false;
  const tf = state.timeframe ? `${state.timeframe.start}..${state.timeframe.end}` : "";
  return tf === rangeKey;
}

/** Stored evidence refs usable only when timeframe + version still match. */
export function freshEvidenceRefs(
  state: ConversationState,
  businessId: string,
  rangeKey: string,
  dataVersion: string,
): string[] {
  if (!isEvidenceFresh(state, businessId, rangeKey, dataVersion)) return [];
  return [...state.evidenceRefs];
}
