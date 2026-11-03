// Layer 3 — COO orchestrator.
// Flow: intent → deterministic tools → Standard (+fallback) → validate.
// Deterministic backend is the source of truth; Standard enhances.

import { resolveRangeInTimezone, todayInTimezone } from "../analytics";
import type { DateRangeSel, MockTransaction } from "../types";
import { aiConfig, PROMPT_VERSION } from "./config";
import { appendTurn, getConversation, historyLines, updateState } from "./context";
import type { EvidencePackage } from "./evidence";
import { preRouteIntent, timeframeHint } from "./intent";
import { buildStandardPrompt } from "./prompts";
import { callFireworksFallback, callMetaStandard, isRetryableProviderError } from "./providers";
import { toolBusinessOverview, toolExpenses, toolProfit, toolPurchases, toolSales, type ToolContext } from "./tools";
import { toolCategories, toolProducts } from "./tools-dims";
import { toolCompare, toolTrends } from "./tools-trends";
import { toolPeakHours, toolRecent } from "./tools-peak";
import { degradedReply, validateAnswer } from "./validate";
import { newTraceId, recordTrace, scrubForLog, type CopilotIntent, type CopilotResponse } from "./types";

export interface OrchestratorInput {
  message: string;
  businessId: string;
  businessName: string;
  currency: string;
  timezone: string;
  userId: string | null;
  conversationId: string;
  transactions: MockTransaction[];
  dataVersion: string;
}

/** Live RCA fast-path budget (ms). Verified live 2026-11-02 against the AZ
 * demo business: resolver skipped (0) → deterministic evidence (~10ms) →
 * Baseten single attempt (~6s, HTTP 200) → Standard compose primary
 * (~10-12s on success; 15s cap on provider-side stalls) + one 8s retry.
 * Typical success ≈ 16-17s end-to-end (route maxDuration 60s). Worst case
 * (Meta stall on both compose attempts) ≈ 29s then honest degraded with the
 * exact failing stage named — never the old 52.9s all-providers-timeout.
 * FINAL FIX (Failure 1): agreed RCA fallback chain is Baseten → Fireworks
 * (with prepared specialist evidence) → deterministic evidence-only if
 * Fireworks also fails. Spark composition is never a successful RCA answer
 * when the specialist produced no memo; the Fireworks fallback is honest
 * fallback reasoning, labeled as such — never a substitute specialist. */
export const RCA_SPECIALIST_TIMEOUT_MS = 20000;
export const RCA_COMPOSE_TIMEOUT_MS = 15000;
export const RCA_COMPOSE_RETRY_TIMEOUT_MS = 8000;
/** RCA compose output budget. The RCA compose prompt carries the ~3000-char
 * Baseten memo plus full evidence, and muse-spark-1.3 burns hidden reasoning
 * tokens from the same max_tokens pool — 1500 truncated live with
 * finish_reason "length" and zero content on both attempts (verified
 * 2026-11-02). 2500 gives the reasoning + composed answer headroom. Only
 * used for the direct RCA compose (tool loop skipped on the RCA path);
 * non-RCA budgets are untouched. A truncated compose (finish_reason length
 * with partial content) is never presented as a complete answer — it routes
 * to the Fireworks fallback / degraded instead. */
export const RCA_COMPOSE_MAX_TOKENS = 2500;

const PRESET_BY_HINT: Record<string, string> = {
  today: "Today", yesterday: "Yesterday", this_week: "This Week",
  this_month: "This Month", last_month: "Last Month",
};

export function resolveRange(hint: string | null, timezone: string): { range: DateRangeSel; preset: string } {
  // Rolling last-N-day hints resolve to exact Custom windows on
  // business-local today — never silently substituted with This Month.
  if (hint === "last_7_days" || hint === "last_30_days") {
    const days = hint === "last_7_days" ? 7 : 30;
    const anchor = todayInTimezone(timezone);
    const start = addDaysIsoLocal(anchor, -(days - 1));
    const label = hint === "last_7_days" ? "Last 7 Days" : "Last 30 Days";
    return { range: { start, end: anchor }, preset: label };
  }
  const preset = (hint && PRESET_BY_HINT[hint]) || "This Month";
  const range = resolveRangeInTimezone(
    preset as "Today" | "Yesterday" | "This Week" | "This Month" | "Last Month" | "Custom",
    { start: "", end: "" }, timezone,
  );
  return { range, preset };
}

/** Local ISO day arithmetic for range resolution (YYYY-MM-DD in/out). */
function addDaysIsoLocal(iso: string, n: number): string {
  const parts = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Slice 4: resolve a named preset without trusting model-supplied dates. */
export function resolvePreset(preset: string | null, timezone: string): { range: DateRangeSel; preset: string } {
  // Rolling labels pass through as exact Custom windows; Custom + core
  // presets resolve normally. Unknown labels fall back to This Month.
  if (preset === "Last 7 Days" || preset === "Last 30 Days") {
    const days = preset === "Last 7 Days" ? 7 : 30;
    const anchor = todayInTimezone(timezone);
    return { range: { start: addDaysIsoLocal(anchor, -(days - 1)), end: anchor }, preset };
  }
  const allowed = ["Today", "Yesterday", "This Week", "This Month", "Last Month", "Custom"];
  const safe = preset && allowed.includes(preset) ? preset : "This Month";
  const range = resolveRangeInTimezone(
    safe as "Today" | "Yesterday" | "This Week" | "This Month" | "Last Month" | "Custom",
    { start: "", end: "" }, timezone,
  );
  return { range, preset: safe };
}

/** Validate an intent's tool arguments against scope (metric, timeframe,
 *  dates, comparison, dimension, tenant). Invalid or unsupported arguments
 *  are rejected safely — never silently replaced with a different
 *  timeframe or dimension. Returns {ok} or {ok:false, error}. */
export function validateIntentToolArgs(opts: {
  intent: string;
  metric?: string | null;
  timeframePreset?: string | null;
  start?: string | null;
  end?: string | null;
  comparisonType?: string | null;
  dimension?: string | null;
  businessId?: string | null;
  scopeBusinessId?: string | null;
}): { ok: boolean; error?: string } {
  const allowedIntents = [
    "greeting", "casual", "summary", "metric", "comparison", "trend",
    "product", "category", "channel", "rca", "recommendation",
    "peak_hours", "scenario", "image", "unclear",
  ];
  if (!allowedIntents.includes(opts.intent)) {
    return { ok: false, error: `Unsupported intent "${opts.intent}".` };
  }
  if (opts.businessId && opts.scopeBusinessId && opts.businessId !== opts.scopeBusinessId) {
    return { ok: false, error: "Business scope mismatch — request rejected." };
  }
  const allowedPresets = [
    "Today", "Yesterday", "This Week", "This Month", "Last Month",
    "Last 7 Days", "Last 30 Days", "Custom",
  ];
  if (opts.timeframePreset && !allowedPresets.includes(opts.timeframePreset)) {
    return { ok: false, error: `Unsupported timeframe "${opts.timeframePreset}" — request rejected, not substituted.` };
  }
  if ((opts.start && !opts.end) || (!opts.start && opts.end)) {
    return { ok: false, error: "Custom range requires both start and end dates." };
  }
  if (opts.start && opts.end) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.start) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.end)) {
      return { ok: false, error: "Custom range dates must be YYYY-MM-DD." };
    }
    if (opts.start > opts.end) {
      return { ok: false, error: "Custom range start must not be after end." };
    }
  }
  if (opts.comparisonType && !["previous_period", "previous_month", "same_period_last_year"].includes(opts.comparisonType)) {
    return { ok: false, error: `Unsupported comparison "${opts.comparisonType}" — request rejected.` };
  }
  if (opts.dimension && !["product", "category", "channel"].includes(opts.dimension)) {
    return { ok: false, error: `Unsupported dimension "${opts.dimension}" — request rejected, not substituted.` };
  }
  if (opts.metric) {
    const allowedMetrics = [
      "sales", "revenue", "profit", "gross_profit", "net_profit", "expenses",
      "purchases", "products", "categories", "channels", "overview",
      "trend", "peak_hours", "recent", "comparison",
    ];
    if (!allowedMetrics.includes(opts.metric.toLowerCase())) {
      return { ok: false, error: `Unsupported metric "${opts.metric}" — request rejected.` };
    }
  }
  return { ok: true };
}

/** Slice 4: comparison mode label (allowlisted only). */
export function comparisonLabelFor(type: string | null): "Previous Period" | "Same Period Last Year" {
  return type === "same_period_last_year" ? "Same Period Last Year" : "Previous Period";
}

/** Explicit standalone RCA request (e.g. "give me rca", "rca", "root cause
 * analysis") — deterministic, never a model call. Bare/general RCA has no
 * metric or entity context, so the resolver's model round-trip adds nothing;
 * the orchestrator skips it and goes straight to deterministic evidence. */
export function isExplicitRcaRequest(message: string): boolean {
  const n = (message || "").toLowerCase().trim().replace(/[!.?]+$/g, "").trim();
  if (!n) return false;
  if (/^(give me |show me |get |run |do )?rca$/.test(n)) return true;
  // FINAL FIX (Failure 1): "give <something> rca" variants (e.g. "give me rca
  // for ...") are explicit RCA — the earlier lines only matched the bare form
  // or "rca for <business>"; a trailing qualifier must not drop the request
  // off the specialist path.
  if (/^(give|show|get)\b.*\brca\b$/.test(n)) return true;
  if (/^(give me |show me |get )?(the |my |business |full )?root cause( analysis)?$/.test(n)) return true;
  if (/^(give me |show me )?root cause( analysis)?( for (my |the )?business)?$/.test(n)) return true;
  if (/^rca( for (my |the )?business)?$/.test(n)) return true;
  return false;
}

export function detectMetricIntent(message: string): CopilotIntent {
  const n = message.toLowerCase().trim();
  // FINAL FIX (Failure 1): bare "rca" / "give me rca" short-circuits to rca
  // BEFORE any metric line can steal it ("give me" is not a metric verb, but
  // future metric patterns must never shadow the explicit RCA form).
  if (/^(give me |show me |get |run |do )?rca[?!.]*$/.test(n)) return "rca";
  // Slice 4: short follow-ups with no new noun resolve against conversation
  // state in the orchestrator — but the detector still classifies explicit
  // analytic verbs so the fallback path never depends on model availability.
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|bye)\b/.test(n)) return "casual";
  // STRICT (spec Part 2): executive / full business reports are deep analysis
  // (specialist `report` kind via comparison intent) — never a plain summary.
  if (/\bexecutive\s+report\b|\bexec\s+report\b|\bfull\s+business\s+report\b|\bprepare\s+(a\s+|an\s+|the\s+)?report\b|\bbusiness\s+report\b/.test(n)) return "comparison";
  // Bare "compare both / compare them / compare" = comparison. Longer
  // "compare <noun> ..." keeps dimension routing below (Slice 3 intact), and
  // "what about <timeframe>" is a metric continuation, not a comparison.
  if (/^(compare both|compare them|compare[?!.]*$)/.test(n)) return "comparison";
  // "compare this month with last month" (and variants) are explicit
  // period comparisons — never a metric lookup or summary.
  if (/\bcompare\b[^.]{0,80}\b(this|last|previous)\b[^.]{0,40}\b(month|week|year|period|quarter)\b/.test(n)) return "comparison";
  if (/\b(this|current)\s+(month|week|year)\b[^.]{0,30}\b(vs|versus|with|compared?|against)\b[^.]{0,30}\b(last|previous)\b/.test(n)) return "comparison";
  if (/^(why|why did|what happened|reason for)\b/.test(n)) return "rca";
  if (/^give\b.*\brca\b|\brca\b.*\bfor\b.*\bbusiness\b/.test(n)) return "rca";
  if (/^(what should|what do i do|how do i fix|any advice|recommend)/.test(n)) return "recommendation";
  if (/^(which .*contributed|top product|best seller|most sold)\b/.test(n)) return "product";
  // Loss-cause questions are RCA/diagnosis, never a plain metric lookup.
  // "why am I making a loss?" / "why loss" must reach Baseten specialist.
  // Placed BEFORE the generic why/rca line so the loss cause is explicit,
  // and before profit/metric lines so it is never stolen by them.
  if (/\b(why|reason|root cause|\brca\b).*\b(loss|losing|lose)\b|\b(loss|losing|lose)\b.*\b(why|reason|root cause|\brca\b)/.test(n)) return "rca";
  if (/\b(making|made|having|incurr|facing|seeing|suffer)\b[^.]{0,40}\bloss/.test(n)) return "rca";
  if (/\b(why|root cause|rca|reason for)\b/.test(n)) return "rca";
  if (/\b(recommend|suggest|should i|what should|advice|action|improve|priority|priorities)\b/.test(n)) return "recommendation";
  // Slice 6: priority-shaped asks route to recommendation so the deterministic
  // priority engine (not a bare metric lookup) handles them. Placed before
  // dimension/metric lines; patterns avoid stealing dimension comparisons
  // ("compare product performance", "which products declined").
  if (/\b(priorit|focus on first|focus first|what to focus|what to do|what actions|most urgent)\b/.test(n)) return "recommendation";
  if (/\b(rank|biggest|highest|top)\b.*\b(opportunit|opportunities|impact|priorit|issue|problem)\b/.test(n)) return "recommendation";
  if (/\b(where|which)\b.*\b(losing|lose|loss)\b/.test(n)) return "recommendation";
  if (/\bwhich (problem|issue)\b/.test(n)) return "recommendation";
  if (/\bdo this week\b/.test(n)) return "recommendation";
  if (/\b(peak|best time|best hour|rush hour|busy|slow hour|weak period)\b/.test(n)) return "peak_hours";
  if (/\bwhat.?if|scenario|forecast|predict\b/.test(n)) return "scenario";
  // Slice 3: dimension comparisons keep their dimension intent so evidence
  // routes to the dimension comparison (not the generic totals comparison).
  if (/\bcompar|\bvs\b|both\b|previous|declin|drop|growth|change|difference\b/.test(n)) {
    if (/\bproduct|item|sku|best.?sell/.test(n)) return "product";
    if (/\bcategor/.test(n)) return "category";
    if (/\bchannel/.test(n)) return "channel";
    return "comparison";
  }
  if (/\btrend|over time|growth\b/.test(n)) return "trend";
  if (/\bproduct|item|sku|best.?sell/.test(n)) return "product";
  if (/\bcategor/.test(n)) return "category";
  if (/\bchannel|payment|upi|\bcash\b|card\b/.test(n)) return "channel";
  if (/\b(recent|latest|last .*(transaction|sale|entry))\b/.test(n)) return "summary";
  if (/\b(purchases?|stock|supplier)\b/.test(n) && !/\bsales?\b/.test(n)) return "metric";
  if (/\b(expenses?|spent|rent|salary|salaries|overhead)\b/.test(n)) return "metric";
  if (/\b(profits?|margins?|loss(?:es)?|earnings?|earn)\b/.test(n)) return "metric";
  if (/\b(sales?|revenues?|turnover|collection|business|summary|overview|total|how much|report)\b/.test(n)) return "summary";
  return "metric";
}
