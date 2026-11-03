// Slice 6 - Priority recommendations engine (pure, no network).
// Evidence-first: candidates ONLY from verified deterministic evidence.
// Ranking priority-rank-v1: severity tier, then impact, then strength, id.

import type { EvidenceItem, EvidencePackage } from "./evidence";

export const PRIORITY_RANKING_VERSION = "priority-rank-v1";
export const MAX_CANDIDATES = 10;
export const MAX_RECOMMENDATIONS = 3;

export type PrioritySeverity = "critical-issue" | "high-priority-issue" | "growth-opportunity" | "operational-improvement" | "monitor";
export type PriorityKind = "problem" | "opportunity" | "monitor";
export type ImpactKind = "verified" | "calculated" | "estimate" | "qualitative";
export type PriorityUrgency = "high" | "medium" | "low";
export type PriorityConfidence = "high" | "medium" | "low";

export interface PriorityCandidate {
  id: string; title: string; severity: PrioritySeverity; kind: PriorityKind;
  urgency: PriorityUrgency; impactMinor: number; impactLabel: string;
  evidenceStrength: 2 | 1 | 0; evidenceRefs: string[]; signals: string[];
  action: string; whyItMatters: string; constraints: string; risks: string;
  nextStep: string; timeHorizon: string;
}

export interface PriorityRecommendation {
  id: string; title: string; priority: number; type: PriorityKind; severity: PrioritySeverity;
  action: string; whyItMatters: string; supportingEvidence: string[];
  expectedImpact: { kind: ImpactKind; text: string };
  urgency: PriorityUrgency; confidence: PriorityConfidence;
  constraints: string; risks: string; nextStep: string; timeHorizon: string;
  evidenceRefs: string[];
}

export const SEVERITY_ORDER: Record<PrioritySeverity, number> = {
  "critical-issue": 0, "high-priority-issue": 1, "growth-opportunity": 2,
  "operational-improvement": 3, monitor: 4,
};

export function isPriorityQuestion(message: string): boolean {
  const n = (message || "").toLowerCase().trim();
  if (!n) return false;
  if (n.includes("losing") && (n.includes("money") || n.includes("profit"))) return true;
  if (n.includes("where") && n.includes("losing")) return true;
  if (/\b(rank|biggest|highest|top)\b/.test(n) && /\b(opportunit|opportunities|impact|priorit|issue|problem)\b/.test(n)) return true;
  if (n.includes("priorit") || n.includes("focus on first") || n.includes("focus first")) return true;
  if (n.includes("what should") || n.includes("what to do") || n.includes("what actions")) return true;
  if (n.includes("what to focus")) return true;
  if (/\bwhich (problem|issue)\b/.test(n)) return true;
  if (n.includes("improve") && n.includes("profit")) return true;
  if (n.includes("do this week")) return true;
  if (n.includes("number one") || n.includes("second priorit")) return true;
  return false;
}

export function isPriorityFollowup(message: string): boolean {
  const n = (message || "").toLowerCase();
  return n.includes("most urgent") || n.includes("number one") || n.includes("second")
    || n.includes("third") || n.includes("why is that") || n.includes("how can i fix")
    || n.includes("can i do both") || n.includes("which one gives")
    || n.includes("what about the second") || n.includes("what should i do first");
}

export function cmpItem(pkg: EvidencePackage, m: string): EvidenceItem | null {
  const r = pkg.items.filter((i) => i.metric === m);
  return r.length > 0 ? r[0] : null;
}
export function diffOf(i: EvidenceItem | null): number | null {
  if (!i || !i.comparison || typeof i.comparison.diffMinor !== "number") return null;
  return i.comparison.diffMinor;
}
export function pctOf(i: EvidenceItem | null): number | null {
  if (!i || !i.comparison) return null;
  const p = i.comparison.pct;
  return typeof p === "number" ? p : null;
}
export function evidenceIds(items: EvidenceItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    if (i && i.id && !seen.has(i.id)) { seen.add(i.id); out.push(i.id); }
  }
  return out;
}
export function strengthFor(refs: number, limited: boolean): 2 | 1 | 0 {
  if (limited || refs <= 0) return 0;
  if (refs >= 2) return 2;
  return 1;
}
export function hasWarning(pkg: EvidencePackage, re: RegExp): boolean {
  return pkg.warnings.some((w) => re.test(w));
}
