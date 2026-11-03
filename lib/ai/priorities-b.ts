// Slice 6 - candidate builders part A (sales/profit/cost/expense).
import type { EvidencePackage } from "./evidence";
import { cmpItem, diffOf, evidenceIds, pctOf, strengthFor } from "./priorities-a";
import type { PriorityCandidate } from "./priorities-a";

export function salesProfitCandidates(pkg: EvidencePackage): PriorityCandidate[] {
  const out: PriorityCandidate[] = [];
  const cmpRev = cmpItem(pkg, "compare_revenue");
  const d = diffOf(cmpRev);
  if (cmpRev && d !== null && d < 0) {
    const pct = pctOf(cmpRev);
    const hit = pct === null ? Math.abs(d) > 0 : pct <= -5;
    if (hit) {
      const critical = pct !== null && pct <= -25;
      out.push({
        id: "prio-sales-decline", title: critical ? "Reverse the sales decline" : "Address the sales dip",
        severity: critical ? "critical-issue" : "high-priority-issue", kind: "problem", urgency: "high",
        impactMinor: Math.abs(d), impactLabel: "Sales down " + cmpRev.display,
        evidenceStrength: strengthFor(1, false), evidenceRefs: evidenceIds([cmpRev]), signals: ["sales_decline"],
        action: "Review pricing, availability, and top products; focus effort on the strongest items.",
        whyItMatters: "Sales funds everything else - a dip cuts cash for costs and expenses.",
        constraints: "Needs product availability and customer time.",
        risks: "Delay lets the dip continue; careless discounts hurt margins.",
        nextStep: "Feature the top-selling product this week.", timeHorizon: "this week",
      });
    }
  }
  const cmpNet = cmpItem(pkg, "compare_net");
  const cmpGross = cmpItem(pkg, "compare_gross");
  let pRow = null;
  if (cmpNet && (diffOf(cmpNet) === null ? 0 : (diffOf(cmpNet) as number)) < 0) pRow = cmpNet;
  else if (cmpGross && (diffOf(cmpGross) === null ? 0 : (diffOf(cmpGross) as number)) < 0) pRow = cmpGross;
  const pd = diffOf(pRow);
  if (pRow && pd !== null && pd < 0) {
    const pct = pctOf(pRow);
    if (Math.abs(pd) > 0 && (pct === null || pct <= -5)) {
      const critical = pct !== null && pct <= -25;
      const refs = cmpRev ? [pRow, cmpRev] : [pRow];
      out.push({
        id: "prio-profit-decline", title: critical ? "Stop the profit drop" : "Protect profit",
        severity: critical ? "critical-issue" : "high-priority-issue", kind: "problem", urgency: "high",
        impactMinor: Math.abs(pd), impactLabel: pRow.label + ": " + pRow.display,
        evidenceStrength: strengthFor(cmpRev ? 2 : 1, false),
        evidenceRefs: evidenceIds(refs), signals: ["profit_decline"],
        action: "Find whether lower sales or higher costs drove it; act on the larger driver first.",
        whyItMatters: "Falling profit means keeping less from every sale.",
        constraints: "Needs same-period cost and sales figures.",
        risks: "Wrong cuts hurt sales; delay widens the gap.",
        nextStep: "Compare this period vs previous period costs line by line.", timeHorizon: "this week",
      });
    }
  }
  return out;
}

export function costCandidates(pkg: EvidencePackage): PriorityCandidate[] {
  const out: PriorityCandidate[] = [];
  const cmpCogs = cmpItem(pkg, "compare_cogs") || cmpItem(pkg, "compare_buying_cost");
  const dc = diffOf(cmpCogs);
  if (cmpCogs && dc !== null && dc > 0) {
    const pct = pctOf(cmpCogs);
    if (pct === null || pct >= 5) {
      const hot = pct !== null && pct >= 25;
      out.push({
        id: "prio-cogs-rise", title: "Control rising buying costs",
        severity: hot ? "high-priority-issue" : "operational-improvement",
        kind: "problem", urgency: hot ? "high" : "medium",
        impactMinor: Math.abs(dc), impactLabel: cmpCogs.label + ": " + cmpCogs.display,
        evidenceStrength: strengthFor(1, false), evidenceRefs: evidenceIds([cmpCogs]), signals: ["cogs_rise"],
        action: "Discuss prices with suppliers; cut waste on costliest items.",
        whyItMatters: "Higher buying costs shrink gross profit on every sale.",
        constraints: "Supplier terms and ordered stock may limit speed.",
        risks: "Hasty supplier switches can hurt quality.",
        nextStep: "List the 3 costliest purchases; ask for better rates.", timeHorizon: "next 2 weeks",
      });
    }
  }
  const cmpExp = cmpItem(pkg, "compare_expenses");
  const de = diffOf(cmpExp);
  if (cmpExp && de !== null && de > 0) {
    const pct = pctOf(cmpExp);
    if (pct === null || pct >= 5) {
      const hot = pct !== null && pct >= 25;
      out.push({
        id: "prio-expense-rise", title: "Review rising expenses",
        severity: hot ? "high-priority-issue" : "operational-improvement",
        kind: "problem", urgency: hot ? "high" : "medium",
        impactMinor: Math.abs(de), impactLabel: cmpExp.label + ": " + cmpExp.display,
        evidenceStrength: strengthFor(1, false), evidenceRefs: evidenceIds([cmpExp]), signals: ["expense_rise"],
        action: "Review recent expenses; pause or trim ones not helping sales.",
        whyItMatters: "Expenses come straight out of net profit.",
        constraints: "Rent and wages may be fixed short term.",
        risks: "Cutting customer-facing spend can cut sales.",
        nextStep: "Circle the largest rise: keep, reduce, or pause.", timeHorizon: "next 2 weeks",
      });
    }
  }
  return out;
}
