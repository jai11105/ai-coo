// Evidence selection for the orchestrator (Slice 3 intents + Slice 4 resolved).
// Slice 6: recommendation/priority questions gather a broad verified package
// (totals comparison + products + categories + channels + peak) so candidates
// derive from real signals; follow-ups re-fetch fresh (never stale).

import type { EvidencePackage } from "./evidence";
import { compareRange } from "../analytics";
import type { FollowupResolution } from "./followup";
import { toolBusinessOverview, toolExpenses, toolProfit, toolPurchases, toolSales, type ToolContext } from "./tools";
import { toolCategories, toolChannels, toolProducts, toolTopProductByQty } from "./tools-dims";
import { toolCompare, toolCompareDimension, toolTrends } from "./tools-trends";
import { toolPeakHours, toolRecent } from "./tools-peak";
import { isPriorityFollowup, isPriorityQuestion } from "./priorities";

function isComparisonQuestion(msg: string): boolean {
  return /\bcompar|versus|\bvs\b|previous|last week|last month|yesterday|declin|drop|growth|change|difference\b/.test(msg);
}

function isUnitsQuestion(msg: string): boolean {
  return /\bunits?\b|\bqty\b|quantity|quantities|\bmost sold\b|best.?seller|highest volume|most popular\b/.test(msg);
}

/**
 * Slice 4: evidence selection from a validated follow-up resolution.
 * Comparison + diagnosis + recommendation always retrieve FRESH deterministic
 * evidence for the resolved range — stale refs are never reused.
 */
export function selectEvidenceForResolution(
  resolution: FollowupResolution,
  msg: string,
  toolCtx: ToolContext,
  compareMode: "Previous Period" | "Same Period Last Year" = "Previous Period",
): EvidencePackage | null {
  const intent = resolution.resolvedIntent;
  const metricKey = (resolution.metric || resolution.contextUpdates.metric || "").toLowerCase();
  const entityT = resolution.entityType || resolution.contextUpdates.entityType || null;
  if (intent === "comparison" || resolution.comparisonRequested || resolution.contextUpdates.comparisonRequested) {
    if (entityT === "product" || /\bproduct\b/.test(msg)) {
      return toolCompareDimension(toolCtx, "product", compareRange(toolCtx.range, compareMode));
    }
    if (entityT === "category" || /\bcategor/.test(msg)) {
      return toolCompareDimension(toolCtx, "category", compareRange(toolCtx.range, compareMode));
    }
    if (entityT === "channel" || /\bchannel\b/.test(msg)) {
      return toolCompareDimension(toolCtx, "channel", compareRange(toolCtx.range, compareMode));
    }
    if (metricKey === "products" || intent === "product") {
      return toolCompareDimension(toolCtx, "product", compareRange(toolCtx.range, compareMode));
    }
    return toolCompare(toolCtx, compareMode);
  }
  if (intent === "product") {
    if (isComparisonQuestion(msg)) {
      return toolCompareDimension(toolCtx, "product", compareRange(toolCtx.range, compareMode));
    }
    // Slice 4: "which product contributed most" = revenue ranking.
    if (/contributed most|top|revenue|contribution/.test(msg)) return toolProducts(toolCtx);
    if (isUnitsQuestion(msg) || /best.?sell|most sold/.test(msg)) return toolTopProductByQty(toolCtx);
    return toolProducts(toolCtx);
  }
  if (intent === "rca") {
    // Genuine RCA diagnosis: bare RCA / loss-cause questions get the full
    // comparative specialist slice (never a narrowed single-metric slice).
    if (entityT === "product" || /\bproduct|contributed|top\b/.test(msg)) {
      return toolCompareDimension(toolCtx, "product", compareRange(toolCtx.range, compareMode));
    }
    if (entityT === "category" || /\bcategor/.test(msg)) {
      return toolCompareDimension(toolCtx, "category", compareRange(toolCtx.range, compareMode));
    }
    if (entityT === "channel" || /\bchannel\b/.test(msg)) {
      return toolCompareDimension(toolCtx, "channel", compareRange(toolCtx.range, compareMode));
    }
    if (metricKey === "profit" || metricKey === "gross_profit" || metricKey === "net_profit") return toolProfit(toolCtx);
    if (metricKey === "expenses") return toolExpenses(toolCtx);
    if (metricKey === "purchases") return toolPurchases(toolCtx);
    if (metricKey === "sales" || metricKey === "revenue") return toolCompare(toolCtx, compareMode);
    return selectSpecialistRcaEvidence(toolCtx, compareMode);
  }
  if (intent === "recommendation" || intent === "scenario") {
    if (metricKey === "profit" || metricKey === "gross_profit" || metricKey === "net_profit") return toolProfit(toolCtx);
    if (metricKey === "expenses") return toolExpenses(toolCtx);
    if (metricKey === "purchases") return toolPurchases(toolCtx);
    // Slice 6: priority-shaped asks get the broad merged package; generic
    // advice keeps the totals overview (Slice 1–5 behavior intact).
    if (intent === "recommendation" && (isPriorityQuestion(msg) || isPriorityFollowup(msg))) {
      return selectPriorityEvidence(toolCtx, compareMode);
    }
    return toolBusinessOverview(toolCtx).pkg;
  }
  return selectEvidence(intent, msg, toolCtx);
}

/** Specialist RCA slice — comparison + profit + sales + expenses merged.
 *  Intent-scoped for Baseten: carries the current AND comparison periods
 *  (never the whole dataset, never routine-only rows). Compact: capped at
 *  24 items so the specialist prompt stays focused. */
export function selectSpecialistRcaEvidence(
  toolCtx: ToolContext,
  compareMode: "Previous Period" | "Same Period Last Year" = "Previous Period",
): EvidencePackage | null {
  const parts: EvidencePackage[] = [];
  try {
    parts.push(toolCompare(toolCtx, compareMode));
    parts.push(toolProfit(toolCtx));
    parts.push(toolSales(toolCtx));
    parts.push(toolExpenses(toolCtx));
  } catch {
    return toolCompare(toolCtx, compareMode);
  }
  const seen = new Set<string>();
  const items: EvidencePackage["items"] = [];
  for (const p of parts) {
    for (const i of p.items) {
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      items.push(i);
      if (items.length >= 24) break;
    }
    if (items.length >= 24) break;
  }
  const warnings: string[] = [];
  for (const p of parts) {
    for (const w of p.warnings) {
      if (!warnings.includes(w)) warnings.push(w);
    }
  }
  if (items.length === 0) return toolCompare(toolCtx, compareMode);
  return {
    packageId: parts[0]?.packageId ?? "pkg.rca",
    question: "",
    intent: "rca",
    timeframe: { start: toolCtx.range.start, end: toolCtx.range.end, preset: toolCtx.preset },
    items,
    warnings: warnings.slice(0, 8),
    generatedAt: toolCtx.nowIso,
  };
}

/** Slice 6: broad priority package — totals comparison + dims + peak merged. */
export function selectPriorityEvidence(
  toolCtx: ToolContext,
  compareMode: "Previous Period" | "Same Period Last Year" = "Previous Period",
): EvidencePackage | null {
  const prev = compareRange(toolCtx.range, compareMode);
  const parts: EvidencePackage[] = [];
  try {
    parts.push(toolCompare(toolCtx, compareMode));
    parts.push(toolCompareDimension(toolCtx, "product", prev, 6));
    parts.push(toolCompareDimension(toolCtx, "category", prev, 6));
    parts.push(toolCompareDimension(toolCtx, "channel", prev, 6));
    parts.push(toolProducts(toolCtx, 5));
    parts.push(toolChannels(toolCtx));
    parts.push(toolPeakHours(toolCtx));
    const totals = toolBusinessOverview(toolCtx);
    parts.push(totals.pkg);
  } catch {
    return toolBusinessOverview(toolCtx).pkg;
  }
  const items = parts.flatMap((p) => p.items).slice(0, 40);
  const warnings: string[] = [];
  for (const p of parts) {
    for (const w of p.warnings) {
      if (!warnings.includes(w)) warnings.push(w);
    }
  }
  if (items.length === 0) return toolBusinessOverview(toolCtx).pkg;
  return {
    packageId: parts[0]?.packageId ?? "pkg.priority",
    question: "",
    intent: "recommendation",
    timeframe: parts[0]?.timeframe ?? { start: toolCtx.range.start, end: toolCtx.range.end, preset: toolCtx.preset },
    items,
    warnings: warnings.slice(0, 8),
    generatedAt: toolCtx.nowIso,
  };
}

export function selectEvidence(intent: string, msg: string, toolCtx: ToolContext): EvidencePackage | null {
  if (intent === "summary" || intent === "metric") {
    if (/\b(purchases?|stock)\b/.test(msg) && !/\bsales?\b/.test(msg)) return toolPurchases(toolCtx);
    if (/\b(expenses?|overhead|rent|salar)\b/.test(msg)) return toolExpenses(toolCtx);
    if (/\b(profits?|margins?|loss)\b/.test(msg)) return toolProfit(toolCtx);
    if (/\b(sales?|revenues?)\b/.test(msg)) return toolSales(toolCtx);
    // Slice 4: short timeframe-continuation follow-ups ("what about last
    // month?") carry no noun — inherit the sales default from the resolver
    // (metric=sales) rather than the generic overview, so continuity holds
    // even on the deterministic fallback path.
    if (/^what about\b|^and\b|^then\b/.test(msg.trim())) return toolSales(toolCtx);
    return toolBusinessOverview(toolCtx).pkg;
  }
  switch (intent) {
    case "product": {
      // Slice 3: product + comparison ("compare product performance across
      // two periods", "which products declined") routes to the dimension
      // comparison; units questions route to qty ranking.
      if (isComparisonQuestion(msg)) {
        const prev = compareRange(toolCtx.range, "Previous Period");
        return toolCompareDimension(toolCtx, "product", prev);
      }
      if (isUnitsQuestion(msg)) return toolTopProductByQty(toolCtx);
      return toolProducts(toolCtx);
    }
    case "category": {
      if (isComparisonQuestion(msg)) {
        const prev = compareRange(toolCtx.range, "Previous Period");
        return toolCompareDimension(toolCtx, "category", prev);
      }
      return toolCategories(toolCtx);
    }
    case "channel":
      if (isComparisonQuestion(msg)) {
        const prev = compareRange(toolCtx.range, "Previous Period");
        return toolCompareDimension(toolCtx, "channel", prev);
      }
      return toolChannels(toolCtx);
    case "trend": return toolTrends(toolCtx);
    case "comparison": {
      // Slice 3: route comparison + dimension to the dimension comparison;
      // plain metric comparisons keep the totals comparison.
      if (/\bproduct\b/.test(msg)) {
        const prev = compareRange(toolCtx.range, "Previous Period");
        return toolCompareDimension(toolCtx, "product", prev);
      }
      if (/\bcategor/.test(msg)) {
        const prev = compareRange(toolCtx.range, "Previous Period");
        return toolCompareDimension(toolCtx, "category", prev);
      }
      if (/\bchannel\b/.test(msg)) {
        const prev = compareRange(toolCtx.range, "Previous Period");
        return toolCompareDimension(toolCtx, "channel", prev);
      }
      return toolCompare(toolCtx);
    }
    case "peak_hours": return toolPeakHours(toolCtx);
    case "rca":
      return selectSpecialistRcaEvidence(toolCtx, "Previous Period");
    case "recommendation":
    case "scenario": {
      // Slice 6: genuine priority questions get the broad merged package so
      // candidates derive from real signals. Other recommendation/scenario
      // asks keep the totals overview (Slice 1–5 behavior intact).
      if (intent === "recommendation" && (isPriorityQuestion(msg) || isPriorityFollowup(msg))) {
        return selectPriorityEvidence(toolCtx);
      }
      return toolBusinessOverview(toolCtx).pkg;
    }
    default:
      if (/\brecent|latest\b/.test(msg)) return toolRecent(toolCtx);
      return toolBusinessOverview(toolCtx).pkg;
  }
}
