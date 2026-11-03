// Slice 5 — specialist evidence-tool allowlist (pure, no network).
// Slice 6: rank_business_priorities executes the transparent
// priority-rank-v1 engine over verified evidence (strict I/O contract).
// The specialist may ONLY request these ops; application code executes them
// over the verified evidence package. No SQL, no code exec, no DB access.

import type { EvidenceItem, EvidencePackage } from "./evidence";
import type { PriorityCandidate } from "./priorities";

export const SPECIALIST_TOOL_ALLOWLIST = [
  "inspect_evidence",
  "compare_metrics",
  "analyze_trend",
  "evaluate_variance",
  "evaluate_scenario",
  "rank_business_priorities",
  "analyze_peak_hours",
] as const;

export type SpecialistToolName = (typeof SPECIALIST_TOOL_ALLOWLIST)[number];

export interface SpecialistToolRequest {
  tool: string;
  input: Record<string, unknown>;
  businessId: string;
  rangeStart: string;
  rangeEnd: string;
}

export interface SpecialistToolResult {
  ok: boolean;
  tool: string;
  evidence?: EvidenceItem[];
  summary?: string;
  error?: string;
}

function str(v: unknown, max = 120): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

/** Execute one allowlisted request application-side with scope checks. */
export function execSpecialistTool(
  req: SpecialistToolRequest,
  evidence: EvidencePackage,
  scope: { businessId: string; rangeStart: string; rangeEnd: string },
): SpecialistToolResult {
  if (!SPECIALIST_TOOL_ALLOWLIST.includes(req.tool as SpecialistToolName)) {
    return { ok: false, tool: String(req.tool), error: `Unknown tool "${String(req.tool)}" — allowlisted tools only.` };
  }
  if (req.businessId !== scope.businessId) {
    return { ok: false, tool: req.tool, error: "Business scope mismatch — request rejected." };
  }
  if (req.rangeStart !== scope.rangeStart || req.rangeEnd !== scope.rangeEnd) {
    return { ok: false, tool: req.tool, error: "Timeframe scope mismatch — request rejected." };
  }
  if (/select|sql|query|exec|database|supabase/i.test(JSON.stringify(req.input))) {
    return { ok: false, tool: req.tool, error: "Arbitrary data access rejected — deterministic evidence only." };
  }
  const items = evidence.items;
  const byMetric = (m: string) => items.filter((i) => i.metric === m);
  switch (req.tool as SpecialistToolName) {
    case "inspect_evidence": {
      const metric = str(req.input.metric);
      const picked = metric ? byMetric(metric) : items.slice(0, 8);
      if (metric && picked.length === 0) return { ok: false, tool: req.tool, error: `No evidence for metric "${metric}".` };
      return { ok: true, tool: req.tool, evidence: picked, summary: `${picked.length} verified item(s).` };
    }
    case "compare_metrics": {
      const a = str(req.input.metric_a);
      const b = str(req.input.metric_b);
      if (!a || !b) return { ok: false, tool: req.tool, error: "compare_metrics requires metric_a and metric_b." };
      const rows = items.filter((i) => i.comparison);
      if (rows.length === 0) return { ok: false, tool: req.tool, error: "No comparison evidence available." };
      return { ok: true, tool: req.tool, evidence: rows.slice(0, 6), summary: `${Math.min(rows.length, 6)} comparison row(s).` };
    }
    case "analyze_trend": {
      const out = items.filter((i) => /^trend/.test(i.metric));
      if (out.length === 0) return { ok: false, tool: req.tool, error: "No trend evidence available." };
      return { ok: true, tool: req.tool, evidence: out, summary: "Deterministic trend totals + peak day." };
    }
    case "evaluate_variance": {
      const dim = str(req.input.dimension);
      if (!dim || !["product", "category", "channel"].includes(dim)) {
        return { ok: false, tool: req.tool, error: "evaluate_variance requires dimension: product|category|channel." };
      }
      const out = items.filter((i) => i.metric === `compare_${dim}` || i.dimensions?.[dim]);
      if (out.length === 0) return { ok: false, tool: req.tool, error: `No ${dim} variance evidence available.` };
      return { ok: true, tool: req.tool, evidence: out, summary: `${out.length} ${dim} variance row(s).` };
    }
    case "evaluate_scenario": {
      const assumption = req.input.assumption;
      const pct = typeof req.input.change_pct === "number" ? req.input.change_pct : null;
      if (typeof assumption !== "string" || !assumption.trim() || pct == null || !Number.isFinite(pct) || Math.abs(pct) > 1000) {
        return { ok: false, tool: req.tool, error: "evaluate_scenario requires assumption (string) and change_pct (finite number)." };
      }
      const base = items.find((i) => /total_sales|revenue|net_profit|gross_profit/.test(i.metric) && typeof i.valueMinor === "number");
      if (!base || typeof base.valueMinor !== "number") {
        return { ok: false, tool: req.tool, error: "No numeric base evidence for scenario evaluation." };
      }
      const delta = Math.round((base.valueMinor * pct) / 100);
      const calc: EvidenceItem = {
        ...base,
        id: `${base.id}.scenario`,
        label: `Scenario: ${assumption.trim().slice(0, 80)} (${pct >= 0 ? "+" : ""}${pct}%)`,
        valueMinor: base.valueMinor + delta,
        display: `assumption ${pct >= 0 ? "+" : ""}${pct}% on ${base.display} (calculated, not observed)`,
        source: "analytical",
        calculation: `deterministic scenario: base ${base.valueMinor} * (1 + ${pct}/100)`,
        completeness: "calculated outcome — assumption, not verified fact",
      };
      return { ok: true, tool: req.tool, evidence: [base, calc], summary: "Calculated outcome kept separate from the assumption." };
    }
    case "rank_business_priorities": {
      // Slice 6: strict I/O contract over the transparent priority-rank-v1
      // engine (lib/ai/priorities.ts). No ad-hoc sorting here — ranking is
      // severity-tier, then impact, then evidence strength, then stable id.
      const inp = (req.input ?? {}) as Record<string, unknown>;
      const limitRaw = inp.limit;
      if (limitRaw !== undefined && (typeof limitRaw !== "number" || !Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 3)) {
        return { ok: false, tool: req.tool, error: "rank_business_priorities requires limit as integer 1..3 when provided." };
      }
      if (inp.severity_filter !== undefined) {
        const allowed = ["critical-issue", "high-priority-issue", "growth-opportunity", "operational-improvement", "monitor"];
        if (typeof inp.severity_filter !== "string" || !allowed.includes(inp.severity_filter)) {
          return { ok: false, tool: req.tool, error: "rank_business_priorities severity_filter must be a valid severity tier." };
        }
      }
      let ranked: PriorityCandidate[];
      try {
        // Lazy require keeps the allowlist module dependency-light for tests.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const P = require("./priorities") as typeof import("./priorities");
        const cands = P.identifyCandidates(evidence);
        ranked = P.rankCandidates(cands);
        const sev = inp.severity_filter as string | undefined;
        if (sev) ranked = ranked.filter((c) => c.severity === sev);
      } catch (e) {
        return { ok: false, tool: req.tool, error: `Priority ranking failed: ${e instanceof Error ? e.message : "engine error"}` };
      }
      if (ranked.length === 0) return { ok: false, tool: req.tool, error: "No evidence-backed priorities identified — do not invent any." };
      const limit = typeof limitRaw === "number" ? limitRaw : Math.min(3, ranked.length);
      const top = ranked.slice(0, limit);
      const idSet = new Set(evidence.items.map((i) => i.id));
      const missing = top.flatMap((c) => c.evidenceRefs).filter((id) => !idSet.has(id));
      if (missing.length > 0) {
        return { ok: false, tool: req.tool, error: `Priority evidence refs invalid: ${missing.slice(0, 3).join(", ")}` };
      }
      const lines = top.map((c, i) => `${i + 1}. [${c.severity}] ${c.title} — ${c.impactLabel} (refs: ${c.evidenceRefs.join(", ")})`);
      return { ok: true, tool: req.tool, evidence: evidence.items.filter((i) => top.some((c) => c.evidenceRefs.includes(i.id))).slice(0, 8), summary: `Ranked priorities (priority-rank-v1):\n${lines.join("\n")}` };
    }
    case "analyze_peak_hours": {
      const out = byMetric("peak_hour_revenue");
      if (out.length === 0) {
        const missing = evidence.warnings.find((w) => /timestamp/i.test(w));
        return { ok: false, tool: req.tool, error: missing || "No peak-hour evidence available." };
      }
      return { ok: true, tool: req.tool, evidence: out, summary: `${out.length} deterministic peak-hour row(s).` };
    }
    default:
      return { ok: false, tool: req.tool, error: `Unhandled tool "${req.tool}".` };
  }
}

