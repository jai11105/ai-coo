// Slice 6 - peak + gap candidates, merge, rank, contract, validation.
import type { EvidencePackage } from "./evidence";
import {
  MAX_CANDIDATES,
  cmpItem, evidenceIds, hasWarning, strengthFor,
} from "./priorities-a";
import type { PriorityCandidate } from "./priorities-a";
import { costCandidates, salesProfitCandidates } from "./priorities-b";
import { dimensionCandidates, productCandidates } from "./priorities-c";
import type { EvidenceItem } from "./evidence";

function byMetric(pkg: EvidencePackage, metric: string): EvidenceItem[] {
  return pkg.items.filter((i) => i.metric === metric);
}

export function peakGapCandidates(pkg: EvidencePackage): PriorityCandidate[] {
  const out: PriorityCandidate[] = [];
  const peakRows = byMetric(pkg, "peak_hour_revenue");
  const totalSales = cmpItem(pkg, "total_sales");
  if (peakRows.length > 0 && totalSales && typeof totalSales.valueMinor === "number" && totalSales.valueMinor > 0) {
    const top2 = peakRows.slice().sort((a, b) => (b.valueMinor || 0) - (a.valueMinor || 0))[0];
    const share = (top2.valueMinor || 0) / (totalSales.valueMinor as number);
    if (share >= 0.15) {
      out.push({
        id: "prio-peak-hours", title: "Make more of peak (" + top2.label + ")",
        severity: "growth-opportunity", kind: "opportunity", urgency: "low",
        impactMinor: top2.valueMinor || 0, impactLabel: top2.label + ": " + top2.display,
        evidenceStrength: strengthFor(peakRows.length >= 2 ? 2 : 1, hasWarning(pkg, /timestamp/i)),
        evidenceRefs: evidenceIds([top2, totalSales]), signals: ["peak_hour_opportunity"],
        action: "Staff the peak hour fully; keep best sellers ready.",
        whyItMatters: "Peak hours bring customers already - serve them better.",
        constraints: "Needs staff availability at that hour.",
        risks: "Extra staff cost must be watched against sales.",
        nextStep: "Ensure full staffing at peak this week.", timeHorizon: "this week",
      });
    }
  }
  if (hasWarning(pkg, /timestamp data missing|only .* carry usable timestamps/i)) {
    out.push({
      id: "prio-data-gap-time", title: "Record sale times for peak guidance",
      severity: "monitor", kind: "monitor", urgency: "low",
      impactMinor: 0, impactLabel: "Timestamps incomplete (verified warning)",
      evidenceStrength: 0, evidenceRefs: evidenceIds(peakRows.slice(0, 1)), signals: ["missing_data"],
      action: "Record time of each sale so peaks can be measured.",
      whyItMatters: "Without times, peak advice cannot be verified.",
      constraints: "Needs consistent time recording.",
      risks: "None; opportunity stays unverified until data improves.",
      nextStep: "Add time to every bill.", timeHorizon: "ongoing",
    });
  }
  return out;
}

export function identifyCandidates(pkg: EvidencePackage): PriorityCandidate[] {
  if (!pkg || pkg.items.length === 0) return [];
  const merged = salesProfitCandidates(pkg)
    .concat(costCandidates(pkg))
    .concat(productCandidates(pkg))
    .concat(dimensionCandidates(pkg))
    .concat(peakGapCandidates(pkg));
  const seen = new Set<string>();
  const out: PriorityCandidate[] = [];
  for (const c of merged) {
    if (seen.has(c.id) || out.length >= MAX_CANDIDATES) continue;
    seen.add(c.id);
    out.push(c);
  }
  if (out.length === 0) {
    out.push({
      id: "prio-monitor-steady", title: "Keep watching - no sharp move in verified figures",
      severity: "monitor", kind: "monitor", urgency: "low",
      impactMinor: 0, impactLabel: "No threshold breach in verified comparisons",
      evidenceStrength: strengthFor(Math.min(pkg.items.length, 2), false),
      evidenceRefs: evidenceIds(pkg.items.slice(0, 2)), signals: ["steady"],
      action: "Keep recording sales, costs, expenses; review next period.",
      whyItMatters: "Acting without a verified signal wastes effort.",
      constraints: "Needs continued clean records.",
      risks: "Overreacting to noise is the main risk.",
      nextStep: "Recheck after next period.", timeHorizon: "next period",
    });
  }
  return out;
}
