// Slice 4 — model-based follow-up resolution (Muse Spark Standard).
// Latest message interpreted against structured conversation state into a
// validated structured resolution. Primary path is model-based (strict JSON
// schema); deterministic mergeFallback covers provider failure honestly.
// Never trusts business/tenant scope from model or client.

import type { AnalysisType, ConversationState } from "./context";
import { preRouteIntent, timeframeHint } from "./intent";
import { detectMetricIntent } from "./orchestrator";
import { buildFollowupResolverPrompt } from "./prompts";
import { callMetaStandard } from "./providers";
import type { CopilotIntent } from "./types";

export const ALLOWED_INTENTS: CopilotIntent[] = [
  "greeting", "casual", "summary", "metric", "comparison", "trend",
  "product", "category", "channel", "rca", "recommendation",
  "peak_hours", "scenario", "unclear",
];
export const ALLOWED_METRICS = [
  "sales", "revenue", "profit", "gross_profit", "net_profit",
  "expenses", "purchases", "products", "categories", "channels",
  "overview", "trend", "peak_hours", "recent", "comparison",
];
export const ALLOWED_ENTITY_TYPES = ["product", "category", "channel"];
export const ALLOWED_TIMEFRAMES = ["Today", "Yesterday", "This Week", "This Month", "Last Month"];
export const ALLOWED_COMPARISON_TYPES = ["previous_period", "previous_month", "same_period_last_year"];
export const ALLOWED_ANALYSIS: Exclude<AnalysisType, null>[] = [
  "summary", "comparison", "diagnosis", "recommendation", "scenario",
];
/** Allowlisted tool-call surface the orchestrator may record (Slice 7:
 *  deterministic.evidence for evidence-selection + tool:<name> per executed
 *  Copilot tool, all allowlisted deterministic only). */
export const ALLOWED_TOOL_CALLS = ["deterministic.evidence"];

export type ComparisonType = "previous_period" | "previous_month" | "same_period_last_year" | null;

export interface FollowupContextUpdates {
  metric?: string | null;
  entityType?: string | null;
  entity?: string | null;
  timeframePreset?: string | null;
  comparisonRequested?: boolean;
  comparisonType?: ComparisonType;
  analysisType?: AnalysisType;
}

export interface FollowupResolution {
  resolvedIntent: CopilotIntent;
  metric: string | null;
  entityType: string | null;
  entity: string | null;
  timeframePreset: string | null;
  comparisonRequested: boolean;
  comparisonType: ComparisonType;
  analysisType: AnalysisType;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
  contextUpdates: FollowupContextUpdates;
  method: "model" | "fallback";
}

function asIntent(v: unknown): CopilotIntent | null {
  return typeof v === "string" && (ALLOWED_INTENTS as string[]).includes(v) ? (v as CopilotIntent) : null;
}
function asAllow(v: unknown, list: string[]): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 120);
  return list.includes(t) ? t : null;
}
function asEntityName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!t || t.length < 2) return null;
  if (/^(it|that|this|they|them|same|both|that product|same product|that category|same category)$/i.test(t)) return "PRONOUN";
  return t;
}
export function validateResolution(raw: unknown, state: ConversationState): FollowupResolution | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const intent = asIntent(r.resolvedIntent);
  if (!intent) return null;
  const metric = r.metric == null ? null : asAllow(r.metric, ALLOWED_METRICS);
  if (r.metric != null && metric == null) return null;
  const etRaw = r.entityType == null ? null : asAllow(r.entityType, [...ALLOWED_ENTITY_TYPES, "none"]);
  const entityType = !etRaw || etRaw === "none" ? null : etRaw;
  let entity = r.entity == null ? null : asEntityName(r.entity);
  if (r.entity != null && entity == null) return null;
  if (entity === "PRONOUN") entity = state.activeEntity;
  const tf = r.timeframePreset == null ? null : asAllow(r.timeframePreset, [...ALLOWED_TIMEFRAMES, "none", "inherit"]);
  if (r.timeframePreset != null && tf == null) return null;
  const timeframePreset = !tf || tf === "none" || tf === "inherit" ? null : tf;
  const comparisonRequested = r.comparisonRequested === true;
  const ctRaw = r.comparisonType == null ? null : asAllow(r.comparisonType, [...ALLOWED_COMPARISON_TYPES, "none"]);
  if (r.comparisonType != null && ctRaw == null) return null;
  const comparisonType: ComparisonType = !ctRaw || ctRaw === "none" ? null : (ctRaw as ComparisonType);
  const anRaw = r.analysisType == null ? null : asAllow(r.analysisType, [...ALLOWED_ANALYSIS, "none"]);
  if (r.analysisType != null && anRaw == null) return null;
  const analysisType: AnalysisType = !anRaw || anRaw === "none" ? null : (anRaw as AnalysisType);
  const requiresClarification = r.requiresClarification === true;
  const cq = typeof r.clarificationQuestion === "string" ? r.clarificationQuestion.trim().slice(0, 300) : "";
  if (requiresClarification && !cq) return null;
  const cu = (r.contextUpdates && typeof r.contextUpdates === "object" ? r.contextUpdates : {}) as Record<string, unknown>;
  const updates: FollowupContextUpdates = {};
  if (cu.metric !== undefined) {
    if (cu.metric !== null && asAllow(cu.metric, ALLOWED_METRICS) == null) return null;
    updates.metric = cu.metric as string | null;
  }
  if (cu.entityType !== undefined) {
    if (cu.entityType !== null && asAllow(cu.entityType, [...ALLOWED_ENTITY_TYPES, "none"]) == null) return null;
    const v = cu.entityType as string | null;
    updates.entityType = !v || v === "none" ? null : v;
  }
  if (cu.entity !== undefined) {
    if (cu.entity !== null && asEntityName(cu.entity) == null) return null;
    let ev = cu.entity as string | null;
    if (ev && asEntityName(ev) === "PRONOUN") ev = state.activeEntity;
    updates.entity = ev;
  }
  if (cu.timeframePreset !== undefined) {
    if (cu.timeframePreset !== null && asAllow(cu.timeframePreset, [...ALLOWED_TIMEFRAMES, "none", "inherit"]) == null) return null;
    const v = cu.timeframePreset as string | null;
    updates.timeframePreset = !v || v === "none" || v === "inherit" ? null : v;
  }
  if (cu.comparisonRequested !== undefined) updates.comparisonRequested = cu.comparisonRequested === true;
  if (cu.comparisonType !== undefined) {
    if (cu.comparisonType !== null && asAllow(cu.comparisonType, [...ALLOWED_COMPARISON_TYPES, "none"]) == null) return null;
    const v = cu.comparisonType as string | null;
    updates.comparisonType = !v || v === "none" ? null : (v as ComparisonType);
  }
  if (cu.analysisType !== undefined) {
    if (cu.analysisType !== null && asAllow(cu.analysisType, [...ALLOWED_ANALYSIS, "none"]) == null) return null;
    const v = cu.analysisType as string | null;
    updates.analysisType = !v || v === "none" ? null : (v as AnalysisType);
  }
  if ((comparisonRequested || updates.comparisonRequested) && !metric && !updates.metric && !state.activeMetric) return null;
  return {
    resolvedIntent: intent, metric, entityType, entity, timeframePreset,
    comparisonRequested, comparisonType, analysisType,
    requiresClarification, clarificationQuestion: requiresClarification ? cq : null,
    contextUpdates: updates, method: "model",
  };
}
/** Deterministic continuity fallback (provider down): preserve, explicit cues only. */
export function mergeFallback(message: string, state: ConversationState): FollowupResolution {
  const n = message.toLowerCase();
  // STRICT: image-generation requests never enter resolver/fallback intent
  // confusion — detected upstream (orchestrator), but guard here too so a
  // "generate a poster" message can never resolve to metric/summary/comparison.
  if (/\b(generate|create|make|design)\b[^.]{0,120}\b(image|poster|advertisement|creative|banner|promo|promotional|launch)\b|\b(image|poster|advertisement|creative|banner)\b[^.]{0,80}\b(for|of)\b/i.test(message.slice(0, 1000))) {
    return {
      resolvedIntent: "unclear", metric: null, entityType: null,
      entity: null, timeframePreset: null, comparisonRequested: false,
      comparisonType: null, analysisType: null, requiresClarification: false,
      clarificationQuestion: null, contextUpdates: {}, method: "fallback",
    };
  }
  const pre = preRouteIntent(message);
  if (pre) {
    return {
      resolvedIntent: pre.intent, metric: state.activeMetric, entityType: state.entityType,
      entity: state.activeEntity, timeframePreset: null, comparisonRequested: false,
      comparisonType: null, analysisType: null, requiresClarification: false,
      clarificationQuestion: null, contextUpdates: {}, method: "fallback",
    };
  }
  const hint = timeframeHint(message);
  const preset = hint === "today" ? "Today" : hint === "yesterday" ? "Yesterday"
    : hint === "this_week" ? "This Week" : hint === "this_month" ? "This Month"
    : hint === "last_month" ? "Last Month" : hint === "this_year" ? "This Month"
    : hint === "last_year" ? "Last Month" : null;
  const intent = detectMetricIntent(message);
  // "What about last month?" = timeframe continuation of the active metric,
  // NOT a comparison (no comparison verb present). Bare "compare both" etc.
  // are comparisons.
  const wantsComparison = /\bcompare both\b|\bcompare them\b|^compare[?!.]*$|\bversus\b|\bvs\b|previous period|difference\b/.test(n)
    || (/\bcompar/.test(n) && !/^what about\b/.test(n.trim()));
  const wantsRca = /\bwhy\b|root cause|\brca\b|reason for|decreas|drop|declin/.test(n);
  const wantsRec = /\bwhat should|recommend|suggest|should i|advice|action|improve|priorit/.test(n)
    || /\b(rank|biggest|highest|top)\b.*\b(opportunit|opportunities|impact|priorit|issue|problem)\b/.test(n)
    || /\b(where|which)\b.*\b(losing|lose|loss)\b/.test(n)
    || /\bwhich (problem|issue)\b/.test(n)
    || /\bdo this week\b/.test(n)
    || /\bwhat to focus\b|\bwhat to do\b|\bwhat actions\b|\bmost urgent\b/.test(n);
  // Slice 6: ordinal / priority follow-ups resolve against the active
  // priority list ("most urgent" = #1, "second" = #2). Ambiguous "that/it"
  // across 2+ priorities asks ONE clarification instead of guessing.
  const hasActivePriorities = (state.activePriorities?.length ?? 0) > 0;
  const ordinalHit = hasActivePriorities && /\bmost urgent\b|number one|no\.?\s*1\b|#1\b|\bsecond\b|\bno\.?\s*2\b|#2\b|\bthird\b|\bno\.?\s*3\b|#3\b|\bfirst\b.*\b(this week|priority|one)\b|\bthat number one\b|\bwhy is that\b|\bhow can i fix\b|\bcan i do both\b|\bwhich one gives\b|\bwhat about the second\b/.test(n);
  if (ordinalHit && !wantsComparison && !preset) {
    const count = state.activePriorities.length;
    const titles = state.activePriorities.map((p, i) => `${i + 1}. "${p.title}"`).join(", ");
    let clarification: string | null = null;
    let ambiguous = false;
    if (/\bsecond\b|\bno\.?\s*2\b|#2\b|\bwhat about the second\b/.test(n) && count < 2) {
      ambiguous = false;
    } else if (/\bthird\b|\bno\.?\s*3\b|#3\b/.test(n) && count < 3) {
      ambiguous = true;
      clarification = `I found ${count} priorit${count === 1 ? "y" : "ies"} so far — which one: ${state.activePriorities.map((p) => `"${p.title}"`).join(" or ")}?`;
    } else if (/\b(can i do both|which one gives|both)\b/.test(n) && count >= 2) {
      ambiguous = true;
      clarification = `Do you mean "${state.activePriorities[0].title}" or "${state.activePriorities[1].title}" — or should I compare both?`;
    } else if (/\b(that|it|this)\b/.test(n) && count > 1 && !/\b(first|second|third|urgent|number|most)\b/.test(n)) {
      ambiguous = true;
      clarification = `Which priority — ${titles}?`;
    }
    return {
      resolvedIntent: "recommendation",
      metric: state.activeMetric, entityType: state.entityType, entity: state.activeEntity,
      timeframePreset: null, comparisonRequested: false,
      comparisonType: null, analysisType: "recommendation",
      requiresClarification: ambiguous,
      clarificationQuestion: ambiguous ? clarification : null,
      contextUpdates: { analysisType: "recommendation" }, method: "fallback",
    };
  }
  const bare = /^(it|that|this|they|them|compare|what about|and then|why|how)\b/.test(n.trim());
  const ambiguous = bare && !preset && !wantsComparison && !wantsRca && !wantsRec
    && !state.activeMetric && !state.activeEntity;
  const resolved: CopilotIntent = wantsRca ? "rca" : wantsRec ? "recommendation" : wantsComparison ? "comparison" : intent;
  const updates: FollowupContextUpdates = {};
  if (preset) updates.timeframePreset = preset;
  if (wantsComparison) updates.comparisonRequested = true;
  if (wantsRca) updates.analysisType = "diagnosis";
  if (wantsRec) updates.analysisType = "recommendation";
  if (resolved === "comparison" && !updates.comparisonRequested) updates.comparisonRequested = true;
  return {
    resolvedIntent: resolved,
    metric: state.activeMetric, entityType: state.entityType, entity: state.activeEntity,
    timeframePreset: preset, comparisonRequested: wantsComparison || resolved === "comparison",
    comparisonType: wantsComparison ? "previous_period" : null,
    analysisType: wantsRca ? "diagnosis" : wantsRec ? "recommendation" : resolved === "comparison" ? "comparison" : null,
    requiresClarification: ambiguous,
    clarificationQuestion: ambiguous ? "Could you say a little more — which metric or product should I look at?" : null,
    contextUpdates: updates, method: "fallback",
  };
}
function extractJson(text: string): unknown | null {
  const t = (text || "").trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { /* fall through */ }
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(t) || /(\{[\s\S]*\})/.exec(t);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function summarizeForResolver(state: ConversationState): string {
  const bits: string[] = [];
  bits.push(`metric=${state.activeMetric ?? "none"}`);
  if (state.previousMetric) bits.push(`prevMetric=${state.previousMetric}`);
  bits.push(`entity=${state.entityType && state.activeEntity ? `${state.entityType}:${state.activeEntity}` : "none"}`);
  bits.push(`timeframe=${state.timeframe ? `${state.timeframe.preset} ${state.timeframe.start}..${state.timeframe.end}` : "none"}`);
  bits.push(`intent=${state.previousIntent ?? "none"}`);
  if (state.comparison?.targetLabel) bits.push(`comparison=${state.comparison.targetLabel}`);
  if (state.analysisType) bits.push(`analysis=${state.analysisType}`);
  if (state.activePriorities.length > 0) {
    bits.push(`priorities=${state.activePriorities.map((p) => `${p.priority}.${p.id}:${p.title}`).join(",")}`);
  }
  if (state.activePriorityId) bits.push(`activePriority=${state.activePriorityId}`);
  return bits.join(" | ");
}

/** Model-based follow-up resolution via Muse Spark Standard (strict JSON).
 * Pass skipModel:true on deadline-budgeted fast paths (e.g. live RCA) where
 * the intent is already explicit — returns the deterministic mergeFallback
 * without burning a provider round-trip. */
export async function resolveFollowup(opts: {
  message: string;
  state: ConversationState;
  businessName: string;
  timezone: string;
  skipModel?: boolean;
  modelTimeoutMs?: number;
}): Promise<FollowupResolution> {
  const fallback = mergeFallback(opts.message, opts.state);
  if (fallback.resolvedIntent === "greeting" || fallback.resolvedIntent === "casual") return fallback;
  if (opts.skipModel) return fallback;
  try {
    const prompt = buildFollowupResolverPrompt({
      message: opts.message,
      stateSummary: summarizeForResolver(opts.state),
      history: opts.state.turns.slice(-6).map((t) => `${t.role}: ${t.content.slice(0, 240)}`),
    });
    const r = await callMetaStandard(prompt.system, prompt.user, 1000, opts.modelTimeoutMs ?? 8000);
    const valid = validateResolution(extractJson(r.text), opts.state);
    if (valid) return valid;
    return fallback;
  } catch {
    return fallback;
  }
}
