// Layer 6 — response validation + degraded replies.
// Deterministic backend is the source of truth; AI enhances, never rewrites.

import type { EvidencePackage } from "./evidence";
import type { CopilotIntent } from "./types";

/** Validate the model answer against evidence + scope.
 * FINAL FIX (Failure 3): validation is intent-specific. RCA structure/honesty
 * checks run ONLY for intent==="rca"; summary/metric/comparison answers get
 * completeness + factual-consistency checks instead. RCA-only notes must never
 * leak into ordinary answers. Numeric + evidence-trace checks stay for all
 * intents (never weakened).
 * Slice 6: priority answers additionally flag recommendations without
 * evidence, invented urgency, and guaranteed-money phrasing.
 * Part 9 (clean output): raw JSON / tool objects / provider internals /
 * markdown artifacts are flagged so the orchestrator can sanitize.
 * RCA answers additionally validate the 6-part structure (situation,
 * facts, causes, support, limits, next step) and never allow an invented
 * root cause when evidence supports only a partial explanation. */
export function validateAnswer(answer: string, evidence: EvidencePackage | null, intent?: string): string[] {
  const warnings: string[] = [];
  if (!answer || answer.trim().length < 2) warnings.push("Empty model response — degraded reply used.");
  // Validate BEFORE sanitizing: numeric claims must trace to evidence.
  // (Applies to EVERY intent — never weakened.)
  if (evidence && evidence.items.length > 0) {
    const figures = answer.match(/₹[\d,]+(?:\.\d+)?|\b\d[\d,]{3,}(?:\.\d+)?/g) || [];
    if (figures.length > 0) {
      const canon = (s: string) => s.replace(/[₹,\s]/g, "");
      const evBlobs = evidence.items.map((i) => canon(`${i.display} ${i.valueMinor ?? ""} ${i.value ?? ""}`));
      const evJoined = evBlobs.join(" | ");
      let untraced = 0;
      for (const f of figures.slice(0, 12)) {
        const c = canon(f).replace(/\.0+$/, "");
        if (!c || c.length < 3) continue;
        const minor = /^\d+(\.0+)?$/.test(c) ? String(Math.round(Number(c) * 100)) : "";
        if (!evJoined.includes(c) && !(minor && evJoined.includes(minor))) untraced += 1;
      }
      if (untraced > 0) {
        warnings.push(`Numeric check: ${untraced} figure(s) in the answer do not trace to verified evidence — verify before presenting as fact.`);
      }
    }
  }
  // FINAL FIX (Failure 3): RCA-only checks — gated strictly on intent==="rca".
  // Summaries / metric lookups / comparisons must NEVER receive "RCA
  // structure note" / "RCA honesty note" diagnostics. Those notes are
  // internal RCA validation, not user-facing summary feedback.
  // RCA structure check: situation + facts + causes + support + limits + next step.
  if (intent === "rca" && answer && answer.trim().length > 50) {
    const hasSituation = /situation|observed|overview|summary/i.test(answer);
    const hasCauses = /caus|driver|factor|reason/i.test(answer);
    const hasLimits = /cannot|limitation|unknown|additional data|not (enough|available)|partial/i.test(answer);
    const hasNext = /next step|recommend|action|do next/i.test(answer);
    if (!hasSituation || !hasCauses || !hasNext) {
      warnings.push("RCA structure note: answer should carry situation, verified facts, causes with support, limits, and a next step.");
    }
    if (!hasLimits && evidence && evidence.warnings.length > 0) {
      warnings.push("RCA honesty note: evidence carries limitations — surface what cannot be established from available data.");
    }
    if (/\b(root cause is|caused by|due to|the reason is)\b/i.test(answer)
      && !/likely|possible|evidence suggests|consistent with|contributing|hypothesis/i.test(answer)) {
      warnings.push("RCA honesty note: causal claim stated without hedging — present as evidence-supported hypothesis unless fully verified.");
    }
  }
  if (/```json|"tool_calls"|"function"\s*:\s*\{|role\s*[:=]\s*["']tool["']/i.test(answer)) {
    warnings.push("Answer contains raw tool/JSON output — sanitize to owner-friendly text.");
  }
  // FINAL FIX (Failure 3): intent-specific completeness checks for NON-RCA
  // answers. Summary: must read as a finished summary with grounded figures,
  // never a dangling fragment. Metric: claimed figures must trace to
  // evidence. Comparison: both periods + no invented % on zero baselines.
  if ((intent === "summary" || intent === "metric" || intent === "comparison") && answer && answer.trim().length > 0) {
    const t = answer.trim();
    // Dangling-fragment detector: answer ends mid-phrase (trailing
    // preposition/article or cut preset label like "Your summary for Last").
    if (/\b(for|of|in|on|at|to|the|a|an|last|this)\s*$/i.test(t) || /your summary for last$/i.test(t)) {
      warnings.push("Summary completeness note: answer appears cut off mid-sentence — treat as truncated, not complete.");
    } else if (intent === "summary" && t.length < 80 && evidence && evidence.items.length > 0) {
      warnings.push("Summary completeness note: answer is too short to cover the verified evidence — verify completeness before presenting.");
    }
    if (intent === "comparison" && evidence && evidence.items.length > 0) {
      const hasBothPeriods = /vs|compared|previous|last\s+(month|week|period)|diff/i.test(t);
      if (!hasBothPeriods && /compar/i.test(t)) {
        warnings.push("Comparison note: answer should align both periods with the absolute difference.");
      }
    }
  }
  if (/\b(muse-spark|baseten|fireworks|meta-api|trace_id|latency|finish_reason)\b/i.test(answer)
    && !/Muse Spark \(fallback\)|Muse Spark \(specialist\)/i.test(answer)) {
    warnings.push("Answer leaks provider/model internals — remove before presenting.");
  }
  if (/\*\*/.test(answer)) {
    warnings.push("Answer contains literal Markdown artifacts — clean formatting.");
  }
  if (evidence && evidence.warnings.length > 0) {
    warnings.push(...evidence.warnings.map((w) => `Evidence note: ${w}`));
  }
  if (evidence) {
    // Slice 3: catch invented % on zero previous periods. Deterministic pct
    // is null ("new") when the previous side was zero; a model that prints a
    // % for such a row contradicts evidence.
    const nullPct = evidence.items.filter((i) => i.comparison && i.comparison.pct == null);
    if (nullPct.length > 0) {
      const inventedPct = /(^|\s)\+?\d+(\.\d+)?\s*%/.test(answer);
      if (inventedPct) {
        warnings.push(
          `Evidence note: % change is unavailable for ${nullPct.length} comparison row(s) (previous period was zero/empty — report "new"). Verify any % in the answer traces to evidence with a non-null pct.`,
        );
      }
    }
    const hasMissingChannel = evidence.items.some((i) => i.dimensions?.channel === "Unspecified/missing") ||
      evidence.warnings.some((w) => /no recorded channel|channel coverage is incomplete|No channel information/i.test(w));
    if (hasMissingChannel && /\b(upi|cash|card|bank transfer|online|offline|store|walk-in)\b.*channel|channel.*\b(upi|cash|card|bank transfer|online|offline|store|walk-in)\b/i.test(answer)) {
      warnings.push("Evidence note: verify the answer does not present a payment method as a sales channel — channel evidence is incomplete.");
    }
    // Slice 6: priority-answer honesty — guaranteed money, invented urgency,
    // and evidence-free recommendations.
    const isPriorityAnswer = /priorit|#1|action:|next step:/i.test(answer);
    if (isPriorityAnswer) {
      if (/guarantee[sd]?\b|will definitely|assured return|will increase .*profit.*for sure/i.test(answer)) {
        warnings.push("Priority note: financial improvement is stated as guaranteed — qualify as verified/calculated/estimate/qualitative.");
      }
      if (/\burgent\b|\bcritical\b/i.test(answer)) {
        const hasCritical = evidence.items.some((i) =>
          i.comparison && typeof i.comparison.diffMinor === "number" && typeof i.comparison.pct === "number"
          && ((i.comparison.diffMinor as number) < 0 ? (i.comparison.pct as number) <= -25 : (i.comparison.pct as number) >= 25));
        if (!hasCritical) warnings.push("Priority note: verify 'urgent/critical' wording traces to a verified large move — otherwise use high/medium/low.");
      }
    }
  }
  return warnings;
}

/** Deterministic-only degraded reply (honest, evidence-backed, no AI). */
export function degradedReply(intent: CopilotIntent, evidence: EvidencePackage | null, businessName: string): string {
  if (intent === "greeting") return "Hello! I'm your AI COO. Ask me about sales, profit, stock, or peak hours.";
  if (intent === "casual") return "Happy to help! Ask me about your sales, profit, expenses, or what to focus on next.";
  // Part 9: honest failure for image requests — never a fake business answer.
  if (intent === "image") {
    return "I couldn't create that image right now — the image service is unavailable. Please try again in a moment.";
  }
  // FINAL FIX (Failure 2): truncated/failed summaries get an honest degraded
  // reply — never a dangling fragment like "Your summary for Last". When
  // evidence exists, ground the degraded reply in verified figures; when it
  // does not, say so honestly.
  if (intent === "summary" && (!evidence || evidence.items.length === 0)) {
    return `I couldn't put together your summary for ${businessName} just now — the explanation service returned an incomplete response and there's no cached evidence to fall back on. Please try again in a moment.`;
  }
  if (intent === "rca" && (!evidence || evidence.items.length === 0)) {
    return `I couldn't pull verified figures for ${businessName} right now, so I can't diagnose a cause yet (AI reasoning is temporarily unavailable and there's no cached evidence). Please try again in a moment.`;
  }
  if (intent === "recommendation" && (!evidence || evidence.items.length === 0)) {
    return `I couldn't pull verified figures for ${businessName} right now, so I won't guess at recommendations (AI reasoning is temporarily unavailable and there's no cached evidence). Please try again in a moment.`;
  }
  if (!evidence || evidence.items.length === 0) {
    return `I couldn't pull verified figures for ${businessName} right now (AI reasoning is temporarily unavailable and there's no cached evidence). Please try again in a moment.`;
  }
  const lines = evidence.items.slice(0, 6).map((i) => `• ${i.label}: ${i.display}`).join("\n");
  return `Here's what I can verify from your records for ${businessName} (AI explanation temporarily unavailable):\n${lines}\nAsk again shortly for the full explanation.`;
}
