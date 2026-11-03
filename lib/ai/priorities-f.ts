// Slice 6 - validation + ordinal refs + methodology note.
import type { EvidencePackage } from "./evidence";
import { MAX_RECOMMENDATIONS, PRIORITY_RANKING_VERSION } from "./priorities-a";
import type { PriorityRecommendation } from "./priorities-a";

export function validateRecommendations(recs: PriorityRecommendation[], ev: EvidencePackage | null): string[] {
  const w: string[] = [];
  if (!recs || recs.length === 0) {
    w.push("No recommendations produced - explain the limitation instead of inventing priorities.");
    return w;
  }
  if (recs.length > MAX_RECOMMENDATIONS) w.push("More than " + MAX_RECOMMENDATIONS + " recommendations - keep focused.");
  const ids = new Set<string>();
  const titles = new Set<string>();
  const items = (ev && ev.items) ? ev.items : [];
  const valid = new Set(items.map((i) => i.id));
  const sev = ["critical-issue", "high-priority-issue", "growth-opportunity", "operational-improvement", "monitor"];
  for (const r of recs) {
    if (!r.id || ids.has(r.id)) w.push("Duplicate recommendation id " + (r.id || "?") + " - rejected.");
    ids.add(r.id);
    const t = (r.title || "").trim().toLowerCase();
    if (t && titles.has(t)) w.push("Duplicate recommendation " + r.title + " - keep one.");
    titles.add(t);
    if (sev.indexOf(r.severity) < 0) w.push("Invalid priority classification " + r.severity + ".");
    if (["problem", "opportunity", "monitor"].indexOf(r.type) < 0) w.push("Invalid type " + r.type + " for " + r.title + ".");
    if (!r.evidenceRefs || r.evidenceRefs.length === 0) w.push("Recommendation " + r.title + " has no supporting evidence.");
    const refs = r.evidenceRefs || [];
    for (const ref of refs) {
      if (!valid.has(ref)) w.push("Invalid evidence reference " + ref + " in " + r.title + ".");
    }
    if (!r.action || !r.action.trim()) w.push("Recommendation " + r.title + " has no action.");
    if (!r.risks || !r.constraints) w.push("Recommendation " + r.title + " must state risks and constraints.");
    const k = r.expectedImpact && r.expectedImpact.kind;
    if (["verified", "calculated", "estimate", "qualitative"].indexOf(k) < 0) {
      w.push("Recommendation " + r.title + " must qualify expected impact.");
    }
    const txt = ((r.expectedImpact && r.expectedImpact.text) || "") + " " + (r.action || "");
    if (/guarantee|will increase|will save|assured/i.test(txt) && k !== "verified") {
      w.push("Recommendation " + r.title + " states a financial outcome as guaranteed - reword unless verified.");
    }
  }
  return w;
}

export function resolvePriorityReference(
  message: string,
  recs: { id: string; title: string; priority: number }[],
): { kind: "specific" | "ambiguous" | "none"; index: number | null; clarification: string | null } {
  const n = (message || "").toLowerCase();
  if (recs.length === 0) return { kind: "none", index: null, clarification: null };
  if (n.indexOf("most urgent") >= 0 || n.indexOf("number one") >= 0 || n.indexOf("#1") >= 0) {
    return { kind: "specific", index: 0, clarification: null };
  }
  if (n.indexOf("second") >= 0 || n.indexOf("#2") >= 0) {
    if (recs.length < 2) return { kind: "specific", index: 0, clarification: null };
    return { kind: "specific", index: 1, clarification: null };
  }
  if (n.indexOf("third") >= 0 || n.indexOf("#3") >= 0) {
    if (recs.length < 3) {
      return { kind: "ambiguous", index: null, clarification: "I found " + recs.length + " - which one: " + recs.map((r) => r.title).join(" or ") + "?" };
    }
    return { kind: "specific", index: 2, clarification: null };
  }
  if (n.indexOf("can i do both") >= 0 || n.indexOf("which one gives") >= 0 || n.indexOf("what about the second") >= 0) {
    if (recs.length >= 2) {
      return { kind: "ambiguous", index: null, clarification: "Do you mean " + recs[0].title + " or " + recs[1].title + " - or should I compare both?" };
    }
    return { kind: "specific", index: 0, clarification: null };
  }
  return { kind: "none", index: null, clarification: null };
}

export const RANKING_METHODOLOGY_NOTE =
  "Ranking " + PRIORITY_RANKING_VERSION + ": severity tier first (critical > high > opportunity > operational > monitor), " +
  "then monetary impact within a tier, then evidence strength, then stable id order. " +
  "Weak evidence caps confidence at low. Fewer than " + MAX_RECOMMENDATIONS + " when fewer are justified.";
