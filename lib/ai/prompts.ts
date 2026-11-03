// Layer 6 (part) — prompt modules (reusable, role-specific, versioned).
// Stable instructions stay separate from dynamic request context.
// No enormous static prompt per request; task-specific composition.
// Slice 5: Baseten Data Analyst role prompt (specialist) kept separate from
// the Standard COO role prompt; compact evidence payload only.

import { PROMPT_VERSION } from "./config";
import type { EvidencePackage } from "./evidence";
import { evidenceSummary } from "./evidence";

export const SHARED_BUSINESS_RULES = [
  "Sales, purchases and expenses are distinct. Buying cost on a sale is its cost of goods sold (COGS).",
  "Standalone stock purchases are NOT sales COGS. Gross profit = revenue − COGS. Net profit = gross − expenses.",
  "Never invent missing values. Never silently change metric definitions.",
  "Respect the requested date range and business timezone. Never mix tenants or demo businesses.",
  "Cite evidence IDs for every numerical claim. Distinguish verified facts from interpretations.",
  "Slice 3: category totals are per transaction type — never add sales + purchases + expenses into one category number.",
  "Slice 3: product-level profit exists only when the evidence item carries per-sale cost evidence; otherwise say profit is unavailable — never estimate.",
  "Slice 3: channel means the recorded sales channel only. A missing channel is 'Unspecified/missing' — never invent one, never substitute payment method.",
  "Slice 3: comparisons report both period values + absolute diff. % change appears only when evidence provides it (previous was non-zero); a missing % means 'new', never 0% or +100%.",
  "Slice 3: summary answers stay summaries — no auto-added RCA or recommendations unless asked.",
].join("\n");

export const STANDARD_SYSTEM = [
  "You are the AI Powered COO — the business owner's decision partner.",
  "Understand every message, keep conversation context, and answer in clear owner-friendly language.",
  "Labels: Buying Price/Cost, Selling Price, Gross Profit, Expenses, Net Profit.",
  "Most important findings first. Answer the exact question asked.",
  "Summary questions get summaries only — do not auto-add RCA or recommendations unless asked.",
  "You are ALWAYS the final response composer. A Data Analyst specialist (Baseten) may",
  "provide an internal analysis memo when you route deep diagnosis to it; you interpret",
  "that memo against verified evidence and compose the final owner-facing answer.",
  "Never present fallback reasoning (Fireworks) as specialist analysis.",
  "Never silently turn an unsupported specialist claim into a verified fact.",
  "You may call ONLY the business tools offered for this question (allowlisted",
  "deterministic functions). Never invent tool names, SQL, or tenant IDs.",
].join("\n");

/** Part 6 — Muse Spark 1.3 primary COO role (concise, evidence-first).
 *  Token-lean: five lines. Detailed business rules live in the evidence
 *  instructions block only when evidence is present. */
export const SPARK_PRIMARY_ROLE = [
  "You are Muse Spark 1.3, the primary COO Copilot.",
  "Call ONLY the relevant business tools offered, then explain the verified results.",
  "Facts come from tools — never invent figures, never dump raw JSON.",
].join("\n");

/** Part 6 — Baseten 1026 specialist analyst role (memo, no planning talk). */
export const BASETEN_SPECIALIST_ROLE = [
  "You are the specialist business analyst (Muse Spark Open 1026).",
  "Investigate ONLY the analytical question given, using the verified evidence",
  "and the specialist tools offered. Identify evidence-supported drivers.",
  "Produce a finished analysis memo — no planning monologue, no step-by-step",
  "narration of what you will do. Never repeat the whole evidence payload.",
  "Clearly mark missing evidence. Every number must trace to the evidence.",
].join("\n");

/** Part 6 — Fireworks evidence-grounded fallback role. */
export const FIREWORKS_FALLBACK_ROLE = [
  "You are the fallback answer model. The primary model is unavailable — produce",
  "the owner-facing answer directly from the verified evidence supplied.",
  "Same format and quality as the primary: concise, owner-friendly, no raw JSON,",
  "no tool objects. Never invent missing data or figures.",
  "The evidence supplied is already complete — do not request further tools.",
].join("\n");

/** Part 6 + 8 — small few-shot set teaching evidence-based answers. */
export const FEW_SHOT_EXAMPLES = [
  "Q: What are my total sales this month? | Evidence: sales.total.this_month = Rs.48,250.00 | A: Your sales this month are Rs.48,250.00 — steady performance driven by evening staples demand.",
  "Q: What are my expenses? | Evidence: top Rent Rs.25,000.00, Staff Wages Rs.32,000.00, total Rs.59,845.00 | A: Your expenses total Rs.59,845.00. Top categories: Rent, Staff Wages, Electricity.",
  "Q: What are my purchases? | Evidence: purchases.total.this_month = Rs.70,600.00 | A: Your stock purchases this month are Rs.70,600.00 — mostly the monthly staples restock.",
  "Q: What is my net profit? | Evidence: net Rs.15,280.00 (gross Rs.22,120.00 minus expenses Rs.6,840.00) | A: Your net profit is Rs.15,280.00 — gross Rs.22,120.00 minus Rs.6,840.00 expenses.",
  "Q: Summarize my business. | Evidence: overview totals present | A: Business overview: revenue, costs, and profit in brief — ask about any metric for detail.",
  "Q: Why did profit decrease? | Evidence: revenue down, COGS up | A: Driver 1: revenue dipped on weaker evening sales. Driver 2: buying costs rose. Next: review staples pricing.",
  "Q: What should I prioritize? | Evidence: ranked priorities present | A: Top 3: 1) restock staples, 2) shift dairy slot, 3) review power costs.",
].join("\n");

/** Part 6 + 8 — user-facing answer-length contract (shared by all models). */
export const ANSWER_LENGTH_CONTRACT = [
  "Answer-length contract: sales summary 1-3 short sentences; expense breakdown top 3",
  "categories + total; purchase summary 1-3 short sentences; profit question direct",
  "figures + brief explanation; standard summary concise overview; RCA max 3",
  "evidence-supported drivers + 1 next action; recommendations max 3; priorities top 3;",
  "executive report concise structured sections; explain-more detailed only when asked.",
  "Interpret the metrics — do not merely repeat them. Say what is missing when",
  "evidence is insufficient.",
].join("\n");

export const GREETING_INSTRUCTIONS = [
  "This is a greeting or casual message. Reply naturally and briefly (1–2 sentences).",
  "Do not call business tools. Do not invent business figures.",
  "You may offer one short hint of what you can help with (sales, profit, stock, peak hours).",
].join("\n");

export const EVIDENCE_INSTRUCTIONS = [
  "Explain what the verified results mean for the business owner.",
  "Present the most important findings first. Explain changes and differences simply.",
  "Every number must come from the evidence package below — cite evidence IDs.",
  "If evidence is empty or warns about missing data, say so clearly and suggest a next step.",
  "When an internal specialist memo is provided: interpret it against verified evidence, keep",
  "verified facts separate from specialist interpretations, and never repeat an unsupported",
  "specialist number as a verified fact. If no specialist memo is provided, say analysis is",
  "based on available evidence only — never claim specialist analysis happened.",
  "Slice 6 priority answers: present each recommendation with title + classification, why it matters,",
  "supporting evidence (IDs), the action, expected impact WITH its qualification",
  "(verified past result / calculated scenario / specialist estimate / qualitative possibility —",
  "never a guaranteed improvement), plus one risk or constraint and the next step.",
  "Cover fewer than three priorities with an honest reason when evidence justifies fewer.",
  "Owner-friendly language: no technical or accounting jargon.",
].join("\n");

export const VALIDATION_REQUIREMENTS = [
  "Before finalizing: every number traceable to evidence; no invented entities;",
  "timeframe and business match the request; missing data disclosed, not filled in.",
].join("\n");

export const SPECIALIST_SYSTEM = [
  BASETEN_SPECIALIST_ROLE,
  "You are NOT the user-facing COO. Your memo goes to the COO orchestrator, which composes the final answer.",
  "Analyze ONLY the compact verified evidence provided. Never access databases, never invent figures.",
  "Separate: verified facts (cite evidence IDs) / deterministic calculations / your interpretations /",
  "recommendations / assumptions / missing data and what additional data is required.",
  "Never invent a root cause from correlation alone. Never fabricate peak hours, percentages, or entities.",
  "Peak-hour analysis interprets deterministic time-based rows only; missing timestamps = report the limitation.",
  "Scenario analysis: clearly distinguish deterministic calculated outcomes from assumptions and risks.",
  "Priority recommendations: rank by expected impact + urgency; each needs action, priority, why it matters,",
  "supporting evidence, expected impact, and suggested next step. Keep the memo compact (under ~450 words).",
  "Slice 6 priority rules: interpret the supplied deterministically ranked candidates — do NOT invent new",
  "financial values or reorder without evidence. Every priority must cite supplied evidence IDs. Qualify",
  "expected impact as verified (past result), calculated (deterministic scenario), estimate (your judgement,",
  "labelled as such), or qualitative possibility. State constraints, risks, and a concrete next step per",
  "priority. Never guarantee a financial improvement.",
  "Output ONLY the finished memo — never your planning notes, reasoning trace, or deliberation. Start",
  "directly with the memo's first finding.",
].join("\n");

/** Compact evidence payload for the specialist (relevant items only). */
export function compactEvidenceForSpecialist(evidence: EvidencePackage, maxItems = 12): string {
  const items = evidence.items.slice(0, Math.max(1, maxItems));
  const lines = items.map((i) => {
    const dims = i.dimensions ? ` [${Object.entries(i.dimensions).map(([k, v]) => `${k}=${v}`).join(",")}]` : "";
    const cmp = i.comparison
      ? ` [prev ${i.comparison.previousMinor ?? "?"} diff ${i.comparison.diffMinor ?? "?"} pct ${i.comparison.pct == null ? "new" : i.comparison.pct}]`
      : "";
    return `- (${i.id}) ${i.label}: ${i.display}${dims}${cmp}`;
  });
  const warns = evidence.warnings.length > 0 ? `Evidence warnings: ${evidence.warnings.join(" | ")}` : "Evidence warnings: none";
  return [
    `Timeframe: ${evidence.timeframe.start}..${evidence.timeframe.end} (${evidence.timeframe.preset})`,
    `Business: ${evidence.items[0]?.businessScope.businessName ?? ""} (${evidence.items[0]?.businessScope.businessId ?? ""})`,
    ...lines,
    warns,
  ].join("\n");
}

const SPECIALIST_TASK: Record<string, string> = {
  rca: "ROOT CAUSE ANALYSIS. Report: observed problem; metric + timeframe; evidence-supported contributing factors with magnitude/direction; confidence + evidence limitations; additional data required.",
  recommendation: "PRIORITY RECOMMENDATIONS. The user payload includes deterministically ranked candidates (priority-rank-v1: severity tier, then impact, then evidence strength). Interpret them: business implications, urgency and trade-offs, constraints, risks, practical next steps. Cite supplied evidence IDs for every priority. Qualify expected impact per item as verified / calculated / estimate / qualitative. Never invent financial values, never guarantee improvements, never add priorities without evidence.",
  peak_hours: "PEAK-HOUR ANALYSIS. Interpret deterministic time rows: peak hours, best days/slots, low periods, concentration, weekday/weekend (when present), practical opportunities. Missing timestamps = limitation, never invented hours.",
  scenario: "SCENARIO ANALYSIS. Interpret assumptions, expected impact, risks, trade-offs, conditions that change the result. Distinguish calculated outcomes from assumptions.",
  report: "DEEP BUSINESS REPORT. Key findings, performance changes, contributing factors, risks, actionable insights from relevant evidence only — no raw-data dumps.",
};

/** Compact ranked-candidate block appended for recommendation tasks. */
export function priorityCandidatesBlock(
  cands: { id: string; title: string; severity: string; impactLabel: string; evidenceRefs: string[]; urgency: string }[],
): string {
  if (cands.length === 0) return "Deterministic candidates: none — no evidence-backed priorities; say so honestly.";
  const lines = cands.map((c, i) =>
    `${i + 1}. [${c.severity}] ${c.title} — ${c.impactLabel} (urgency ${c.urgency}; refs: ${c.evidenceRefs.join(", ") || "none"})`);
  return `Deterministic ranked candidates (priority-rank-v1 — interpret, do not reorder without evidence):\n${lines.join("\n")}`;
}

/** Compose the Baseten specialist prompt: role + task + compact evidence.
 *  Part 7: compact relevant evidence only (max 12 items); history capped at
 *  the last 4 lines; static role/task blocks stay stable (cache-friendly). */
export function buildSpecialistPrompt(opts: {
  kind: "rca" | "recommendation" | "peak_hours" | "scenario" | "report";
  question: string;
  businessLine: string;
  contextLines: string[];
  evidence: EvidencePackage;
  historyLines: string[];
  toolNames?: string[];
}): { system: string; user: string; version: string; estimatedChars: number } {
  const system = [SPECIALIST_SYSTEM, "", "BUSINESS RULES:", SHARED_BUSINESS_RULES].join("\n");
  const parts: string[] = [];
  parts.push(`Business: ${opts.businessLine}`);
  // Token optimization: specialist carries at most 2 context lines and 2
  // history lines — the compact evidence + task already define the slice.
  if (opts.contextLines.length > 0) parts.push(`Context:\n${opts.contextLines.slice(-2).join("\n")}`);
  if (opts.historyLines.length > 0) parts.push(`Conversation (last ${Math.min(opts.historyLines.length, 2)}):\n${opts.historyLines.slice(-2).join("\n")}`);
  parts.push("Verified evidence (compact — only relevant items):");
  parts.push(compactEvidenceForSpecialist(opts.evidence));
  parts.push(`Task: ${SPECIALIST_TASK[opts.kind] ?? SPECIALIST_TASK.report}`);
  if (opts.toolNames && opts.toolNames.length > 0) {
    parts.push(`Specialist tools available (call only when you need verified rows beyond the evidence above): ${opts.toolNames.join(", ")}. Call with minimal arguments; then write the memo from returned evidence.`);
  }
  parts.push(`Owner question: ${opts.question}`);
  parts.push("Respond with ONLY the finished internal analysis memo (owner-friendly findings allowed — the COO composes the final answer). Do not include planning notes or deliberation.");
  const user = parts.join("\n");
  return { system, user, version: PROMPT_VERSION, estimatedChars: system.length + user.length };
}

/** Slice 4: resolver prompt — structured JSON only (Muse Spark Standard). */
export function buildFollowupResolverPrompt(opts: {
  message: string;
  stateSummary: string;
  history: string[];
}): { system: string; user: string } {
  const system = [
    "You resolve a business owner's follow-up message into structured JSON.",
    "Use conversation state for pronouns and omitted metric/entity/timeframe.",
    "Continuity: keep metric when only timeframe changes; keep entity on",
    "\"it/that product/same category\"; keep comparison periods on \"compare both\".",
    "Update ONLY fields the message changes. Never invent business IDs.",
    "Reply with JSON ONLY, no prose, matching this schema:",
    '{"resolvedIntent":"summary|metric|comparison|trend|product|category|channel|rca|recommendation|peak_hours|scenario|greeting|casual|unclear",',
    '"metric":"sales|revenue|profit|gross_profit|net_profit|expenses|purchases|products|categories|channels|overview|trend|peak_hours|recent|comparison|null",',
    '"entityType":"product|category|channel|null","entity":"name|null",',
    '"timeframePreset":"Today|Yesterday|This Week|This Month|Last Month|null",',
    '"comparisonRequested":false,"comparisonType":"previous_period|previous_month|same_period_last_year|null",',
    '"analysisType":"summary|comparison|diagnosis|recommendation|scenario|null",',
    '"requiresClarification":false,"clarificationQuestion":null,',
    '"contextUpdates":{"metric":null,"entityType":null,"entity":null,"timeframePreset":null,',
    '"comparisonRequested":false,"comparisonType":null,"analysisType":null}}',
    "Rules: short follow-ups inherit metric/entity/timeframe from state.",
    "\"Why did it decrease?\" -> rca + diagnosis. \"What should I do?\" ->",
    "recommendation. \"Compare both\" -> comparisonRequested true. Ambiguous",
    "pronouns with no state -> requiresClarification true + one question.",
  ].join("\n");
  const user = [
    `Conversation state: ${opts.stateSummary}`,
    opts.history.length > 0 ? `Recent turns:\n${opts.history.join("\n")}` : "Recent turns: (none — first message)",
    `Latest owner message: ${opts.message.slice(0, 1000)}`,
    "Respond with JSON only.",
  ].join("\n");
  return { system, user };
}

export interface PromptBuild {
  system: string;
  user: string;
  version: string;
  estimatedChars: number;
}

export const PRIORITY_COMPOSE_INSTRUCTIONS = [
  "Priority composition: rank by the deterministic candidate order supplied.",
  "Each recommendation carries: title + classification, why it matters, evidence,",
  "action, qualified expected impact, one risk/constraint, and the next step.",
  "Never present an uncalculated estimate as a guaranteed improvement.",
].join("\n");

export const FOLLOWUP_SYSTEM_ADDENDUM = [
  "Slice 4 follow-up rules: the resolved context below already merged this",
  "message with conversation state. Honor the resolved timeframe/entity.",
  "Comparison answers use fresh deterministic comparison evidence only.",
  "Diagnosis/recommendation answers build on retrieved evidence; keep",
  "verified facts separate from interpretations and next steps.",
  "Slice 6 priority follow-ups: when an active priority list is supplied,",
  "answer about the referenced priority (most urgent = #1, second = #2).",
  "When the reference is ambiguous across 2+ priorities, ask ONE focused",
  "clarification instead of guessing. Re-fetch evidence on scope changes;",
  "never reuse stale evidence.",
].join("\n");

/** Compose a Standard prompt: stable modules + dynamic context + evidence.
 *  Token-aware: only relevant slices are included by the orchestrator.
 *  Part 6 (model-specific): Muse Spark primary role + few-shot examples +
 *  answer-length contract. Part 7 (cache-friendly layout): static system
 *  role first, then stable few-shots, then dynamic evidence + request. */
export function buildStandardPrompt(opts: {
  question: string;
  intent: string;
  contextLines: string[];
  evidence?: EvidencePackage | null;
  businessLine: string;
  historyLines: string[];
  historySummary?: string | null;
  resolvedLines?: string[];
}): PromptBuild {
  const isGreeting = opts.intent === "greeting" || opts.intent === "casual";
  const isCompactMetric = opts.intent === "metric" || opts.intent === "summary";
  const system = [
    STANDARD_SYSTEM,
    "",
    SPARK_PRIMARY_ROLE,
    "",
    "BUSINESS RULES:",
    SHARED_BUSINESS_RULES,
    "",
    isGreeting ? GREETING_INSTRUCTIONS : EVIDENCE_INSTRUCTIONS,
    ...(opts.resolvedLines && opts.resolvedLines.length > 0 ? ["", FOLLOWUP_SYSTEM_ADDENDUM] : []),
    // Token optimization: few-shot examples + length contract ride along
    // only where they change behavior (non-compact turns). Compact metric /
    // summary turns already carry the evidence instructions; the examples
    // would only duplicate tokens on every routine lookup.
    ...(!isGreeting && !isCompactMetric
      ? ["", "FEW-SHOT EXAMPLES (follow the same evidence-based style):", FEW_SHOT_EXAMPLES, "", ANSWER_LENGTH_CONTRACT]
      : []),
    "",
    "VALIDATION:",
    VALIDATION_REQUIREMENTS,
  ].join("\n");
  const parts: string[] = [];
  parts.push(`Business: ${opts.businessLine}`);
  // Token optimization: compact metric/summary turns carry at most 2
  // history lines and a trimmed summary; deeper analysis keeps the window.
  if (opts.historySummary) parts.push(`Conversation summary: ${opts.historySummary.slice(0, isCompactMetric ? 200 : 500)}`);
  if (opts.historyLines.length > 0) {
    const keep = isCompactMetric ? opts.historyLines.slice(-2) : opts.historyLines.slice(-6);
    parts.push("Recent conversation:");
    parts.push(...keep);
  }
  if (opts.resolvedLines && opts.resolvedLines.length > 0) {
    parts.push("Resolved follow-up context:");
    parts.push(...opts.resolvedLines);
  }
  if (opts.contextLines.length > 0) {
    parts.push("Context:");
    parts.push(...opts.contextLines);
  }
  if (opts.evidence && opts.evidence.items.length > 0) {
    parts.push("Verified evidence (deterministic source of truth):");
    parts.push(evidenceSummary(opts.evidence));
    if (opts.evidence.warnings.length > 0) {
      parts.push("Evidence warnings: " + opts.evidence.warnings.join(" | "));
    }
  } else if (!isGreeting) {
    parts.push("No verified business evidence for this turn — answer from conversation context or disclose the limitation honestly.");
  }
  parts.push(`Owner question: ${opts.question}`);
  const user = parts.join("\n");
  return { system, user, version: PROMPT_VERSION, estimatedChars: system.length + user.length };
}
