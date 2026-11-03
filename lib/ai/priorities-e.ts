// Slice 6 - rank + contract (part 1).
import {
  MAX_RECOMMENDATIONS, SEVERITY_ORDER,
} from "./priorities-a";
import type { ImpactKind, PriorityCandidate, PriorityConfidence, PriorityRecommendation } from "./priorities-a";

export function rankCandidates(cs: PriorityCandidate[]): PriorityCandidate[] {
  const max = Math.max(0, ...cs.map((c) => c.impactMinor || 0));
  return cs.slice().sort((a, b) => {
    const s = (SEVERITY_ORDER[a.severity] || 0) - (SEVERITY_ORDER[b.severity] || 0);
    if (s !== 0) return s;
    const ai = max > 0 ? (a.impactMinor || 0) / max : 0;
    const bi = max > 0 ? (b.impactMinor || 0) / max : 0;
    if (bi !== ai) return bi - ai;
    if (b.evidenceStrength !== a.evidenceStrength) return b.evidenceStrength - a.evidenceStrength;
    return a.id < b.id ? -1 : 1;
  });
}

export function toRecommendations(ranked: PriorityCandidate[], limit?: number): PriorityRecommendation[] {
  const lim = limit === undefined ? MAX_RECOMMENDATIONS : limit;
  const n = Math.max(1, Math.min(lim, MAX_RECOMMENDATIONS, ranked.length));
  return ranked.slice(0, n).map((c, i) => {
    const confidence: PriorityConfidence = (c.severity === "monitor" || c.evidenceStrength === 0)
      ? "low" : (c.evidenceStrength === 2 ? "high" : "medium");
    const verifiedSignal = c.signals.indexOf("sales_decline") >= 0 || c.signals.indexOf("profit_decline") >= 0
      || c.signals.indexOf("cogs_rise") >= 0 || c.signals.indexOf("expense_rise") >= 0
      || c.signals.indexOf("dimension_decline") >= 0 || c.signals.indexOf("top_product_opportunity") >= 0;
    const impactKind: ImpactKind = (c.impactMinor > 0 && verifiedSignal) ? "verified" : (c.impactMinor > 0 ? "calculated" : "qualitative");
    const head = impactKind === "verified" ? "Verified past move: " : "Deterministic scale: ";
    const impactText = c.impactMinor > 0
      ? (head + c.impactLabel + " - future gain depends on action, not guaranteed.")
      : "Qualitative possibility - no verified monetary size; benefit depends on execution.";
    return {
      id: c.id, title: c.title, priority: i + 1, type: c.kind, severity: c.severity,
      action: c.action, whyItMatters: c.whyItMatters, supportingEvidence: c.evidenceRefs.slice(),
      expectedImpact: { kind: impactKind, text: impactText },
      urgency: c.urgency, confidence, constraints: c.constraints, risks: c.risks,
      nextStep: c.nextStep, timeHorizon: c.timeHorizon, evidenceRefs: c.evidenceRefs.slice(),
    };
  });
}
