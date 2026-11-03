// Slice 5 — specialist routing decisions (pure, no network).
// Standard decides from intent + evidence; Baseten is never a fallback.
// STRICT BOUNDARIES (spec Part 2):
// - Routine (greeting/casual/summary/metric/comparison/trend/product/
//   category/channel + simple lookups) → Muse Spark 1.3 + deterministic tools.
//   NEVER Baseten.
// - Deep analysis only → Baseten specialist:
//   rca, recommendation (incl. priorities + executive reports),
//   scenario (what-if), peak_hours (deep investigation).
// - Comparison/trend/product/category/channel reach the specialist ONLY when
//   the question explicitly asks for deep diagnosis (why/decline/drivers/
//   executive report) — never for plain totals, rankings, or period lookups.

import type { EvidencePackage } from "./evidence";
import type { CopilotIntent } from "./types";

export type SpecialistKind = "rca" | "recommendation" | "peak_hours" | "scenario" | "report";

export interface SpecialistNeed {
  needed: boolean;
  kind: SpecialistKind | null;
  reason: string;
}

const SPECIALIST_INTENTS: Record<string, SpecialistKind> = {
  rca: "rca",
  recommendation: "recommendation",
  scenario: "scenario",
  peak_hours: "peak_hours",
  comparison: "report",
  trend: "report",
  product: "report",
  category: "report",
  channel: "report",
};

const NEVER_SPECIALIST: CopilotIntent[] = ["greeting", "casual", "unclear", "summary", "metric"];

/** Spec-name → ACTUAL implementation mapping (verified, contracts preserved).
 *  The intent brief names specialist functions getBusinessPerformance(),
 *  getProfitDrivers(), getRecommendationEvidence(), getPeakHours(),
 *  getExecutiveReportData(), runWhatIfScenario(). Those exact identifiers do
 *  NOT exist in this codebase (verified by search); the actual contracts are
 *  the allowlisted Copilot deterministic tools (lib/ai/tool-defs.ts,
 *  executed in lib/ai/tool-run.ts) plus the Baseten specialist allowlist
 *  (lib/ai/specialist-tools.ts). This table maps each brief name to the real
 *  tools used for that request — no renames, no invented functions. */
export const SPECIALIST_FUNCTION_MAP: Record<string, { copilotTools: string[]; specialistOps: string[] }> = {
  getBusinessPerformance: {
    copilotTools: ["get_comparison", "get_trends", "get_business_overview"],
    specialistOps: ["inspect_evidence", "compare_metrics", "analyze_trend", "evaluate_variance"],
  },
  getProfitDrivers: {
    copilotTools: ["get_profit", "get_compare_dimension", "get_products", "get_categories", "get_channels"],
    specialistOps: ["inspect_evidence", "compare_metrics", "evaluate_variance"],
  },
  getRecommendationEvidence: {
    copilotTools: ["rank_business_priorities", "get_business_overview", "get_comparison", "get_products", "get_categories", "get_channels", "get_peak_hours"],
    specialistOps: ["rank_business_priorities", "inspect_evidence"],
  },
  getPeakHours: {
    copilotTools: ["get_peak_hours"],
    specialistOps: ["analyze_peak_hours"],
  },
  getExecutiveReportData: {
    copilotTools: ["get_business_overview", "get_comparison", "get_trends", "get_products", "get_categories", "get_channels"],
    specialistOps: ["inspect_evidence", "compare_metrics", "analyze_trend"],
  },
  runWhatIfScenario: {
    copilotTools: ["get_business_overview", "get_comparison", "get_profit", "get_expenses", "get_sales"],
    specialistOps: ["evaluate_scenario", "inspect_evidence"],
  },
};

/** Standard's routing decision: deep analysis only, with evidence.
 *  STRICT (spec Part 2B): routine lookups NEVER reach the specialist.
 *  `report` kinds (comparison/trend/product/category/channel) reach Baseten
 *  ONLY when the question explicitly asks for deep diagnosis:
 *  why/decline/drivers/contribution-shift/executive report/diagnosis. */
export function isDeepDiagnosisQuestion(question: string): boolean {
  const q = (question || "").toLowerCase();
  return /why|root\s*cause|\brca\b|reason\s+for|what\s+happened|diagnos|drivers?|contribut|declin|drop\b|growth\s+slow|change\s+in|executive\s+report|full\s+report|recommend|suggest|should\s+i|what\s+should|advice|improve|priorit|scenario|what.?if|forecast|predict|peak|best\s+time/i.test(q);
}

export function decideSpecialistNeed(
  intent: CopilotIntent,
  question: string,
  evidence: EvidencePackage | null,
  opts?: { requiresClarification?: boolean },
): SpecialistNeed {
  if ((NEVER_SPECIALIST as string[]).includes(intent)) {
    return { needed: false, kind: null, reason: `${intent} is answered by Standard without specialist analysis.` };
  }
  if (opts?.requiresClarification) {
    return { needed: false, kind: null, reason: "Clarification needed before specialist analysis." };
  }
  const kind = SPECIALIST_INTENTS[intent] ?? null;
  if (!kind) return { needed: false, kind: null, reason: `${intent} is not a specialist analysis intent.` };
  if (!evidence || evidence.items.length === 0) {
    return { needed: false, kind, reason: "Insufficient evidence — specialist skipped honestly." };
  }
  if (kind === "peak_hours") {
    const hasPeak = evidence.items.some((i) => i.metric === "peak_hour_revenue");
    const missing = evidence.warnings.some((w) => /Timestamp data missing/i.test(w));
    if (!hasPeak || missing) {
      return { needed: false, kind, reason: "Peak-hour timestamps missing/incomplete — limitation reported without specialist call." };
    }
  }
  const q = (question || "").toLowerCase().trim();
  // STRICT: report-kind intents (comparison/trend/product/category/channel)
  // are routine lookups UNLESS the question explicitly asks for deep
  // diagnosis. "Compare product performance" / "show trends" stay on
  // Muse Spark + deterministic tools — never Baseten.
  if (kind === "report" && !isDeepDiagnosisQuestion(question)) {
    return { needed: false, kind: null, reason: "Routine lookup — Standard answers from deterministic evidence without specialist analysis." };
  }
  if (kind === "report"
    && /^(what (was|were|is)|how much|show me|list)\b[^?]*\?*$/.test(q)
    && !/why|recommend|suggest|should|improve|priority|priorities|scenario|what.?if|forecast|predict|contribut|declin|drop|growth|change|peak|trend|compar/i.test(q)) {
    return { needed: false, kind: null, reason: "Simple metric lookup — Standard answers from evidence." };
  }
  return { needed: true, kind, reason: `${intent} with ${evidence.items.length} verified evidence item(s) — specialist selected.` };
}
