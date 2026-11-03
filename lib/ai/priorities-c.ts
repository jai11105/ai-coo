// Slice 6 - product + dimension + peak candidates.
import type { EvidencePackage } from "./evidence";
import { cmpItem, evidenceIds, hasWarning, strengthFor } from "./priorities-a";
import type { EvidenceItem } from "./evidence";
import type { PriorityCandidate } from "./priorities-a";

function byMetric(pkg: EvidencePackage, metric: string): EvidenceItem[] {
  return pkg.items.filter((i) => i.metric === metric);
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 36);
}

export function productCandidates(pkg: EvidencePackage): PriorityCandidate[] {
  const out: PriorityCandidate[] = [];
  const rows = byMetric(pkg, "product_revenue");
  if (rows.length >= 1) {
    const sorted = rows.slice().sort((a, b) => (b.valueMinor || 0) - (a.valueMinor || 0));
    const top = sorted[0];
    const total = sorted.reduce((s, r) => s + (r.valueMinor || 0), 0);
    const tm = top.valueMinor || 0;
    if (tm > 0) {
      const prodName = (top.dimensions && top.dimensions.product) || top.label;
      out.push({
        id: "prio-top-product", title: "Grow best seller (" + prodName + ")",
        severity: "growth-opportunity", kind: "opportunity", urgency: "medium",
        impactMinor: tm, impactLabel: top.label + ": " + top.display,
        evidenceStrength: strengthFor(sorted.length >= 2 ? 2 : 1, hasWarning(pkg, /profit unavailable/i)),
        evidenceRefs: evidenceIds(sorted.slice(0, 3)), signals: ["top_product_opportunity"],
        action: "Give the best seller better placement; tell every customer about it.",
        whyItMatters: "The best seller already proves demand - small pushes can add sales.",
        constraints: "Needs enough stock of the top item.",
        risks: "Pushing without stock disappoints customers.",
        nextStep: "Feature the top product at the counter this week.", timeHorizon: "this week",
      });
      const share = total > 0 ? tm / total : 0;
      if (share >= 0.6) {
        out.push({
          id: "prio-concentration-risk", title: "Reduce dependence on one product",
          severity: "high-priority-issue", kind: "problem", urgency: "medium",
          impactMinor: 0, impactLabel: "Top is " + Math.round(share * 100) + "% of product sales",
          evidenceStrength: strengthFor(2, false), evidenceRefs: evidenceIds(sorted.slice(0, 3)),
          signals: ["concentration_risk"],
          action: "Promote a second product so one item does not carry everything.",
          whyItMatters: "If the top item slows, most sales slow with it.",
          constraints: "Needs a credible second product with stock.",
          risks: "Ignoring concentration leaves the business fragile.",
          nextStep: "Pick one runner-up to promote alongside.", timeHorizon: "this month",
        });
      }
    }
  }
  return out;
}

export function dimensionCandidates(pkg: EvidencePackage): PriorityCandidate[] {
  const out: PriorityCandidate[] = [];
  const declines = byMetric(pkg, "compare_product")
    .concat(byMetric(pkg, "compare_category"))
    .concat(byMetric(pkg, "compare_channel"))
    .filter((i) => {
      if (!i.comparison || typeof i.comparison.diffMinor !== "number") return false;
      if ((i.comparison.diffMinor as number) >= 0) return false;
      const p = i.comparison.pct;
      return p === null || (typeof p === "number" && p <= -15);
    });
  declines.sort((a, b) => (a.comparison!.diffMinor as number) - (b.comparison!.diffMinor as number));
  for (const d of declines.slice(0, 2)) {
    const nm = (d.dimensions && (d.dimensions.product || d.dimensions.category || d.dimensions.channel)) || d.label;
    out.push({
      id: "prio-dim-" + slug(String(nm)), title: "Win back (" + nm + ")",
      severity: "high-priority-issue", kind: "problem", urgency: "medium",
      impactMinor: Math.abs(d.comparison!.diffMinor as number), impactLabel: d.label + ": " + d.display,
      evidenceStrength: strengthFor(1, false), evidenceRefs: evidenceIds([d]), signals: ["dimension_decline"],
      action: "Find why this segment dropped; run one focused win-back promotion.",
      whyItMatters: "A falling segment drags totals even when others hold.",
      constraints: "Needs segment stock and pricing flexibility.",
      risks: "Blanket discounts hurt margin without fixing the cause.",
      nextStep: "Talk to 5 customers from the segment this week.", timeHorizon: "next 2 weeks",
    });
  }
  return out;
}
