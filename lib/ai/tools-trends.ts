// Deterministic tools: trends, comparison, peak hours, recent (Slice 3).
// Reuses lib/analytics.ts — NO duplicated math.

import {
  buildTrend,
  calcTotals,
  compareDimMaps,
  compareRange,
  compareTotals,
  filterByRange,
  sumByKey,
} from "../analytics";
import { formatMoney } from "../utils";
import type { CompareMode, DateRangeSel } from "../types";
import type { EvidenceItem, EvidencePackage } from "./evidence";
import { bs, eid, moneyItem, tf, type ToolContext } from "./tools";

export function toolTrends(ctx: ToolContext): EvidencePackage {
  const inRange = filterByRange(ctx.transactions, ctx.range, ctx.scope.timezone);
  const pts = buildTrend(inRange, ctx.range, ctx.scope.timezone);
  const peak = pts.reduce((a, b) => (b.revenue > (a?.revenue ?? -1) ? b : a), pts[0]);
  const total = pts.reduce((s, p) => s + p.revenue, 0);
  const items: EvidenceItem[] = [
    moneyItem(eid("trend.revenue"), "trend_revenue_total", "Revenue in period", total, ctx.scope, ctx.range, ctx.preset,
      `sum(daily revenue) over ${ctx.range.start}..${ctx.range.end}`, `${pts.length} days`),
  ];
  if (peak) {
    items.push({
      id: eid("trend.peak"), metric: "trend_peak_day", label: `Peak revenue day: ${peak.day}`,
      valueMinor: peak.revenue, unit: ctx.scope.currency,
      display: `${peak.day}: ${formatMoney(peak.revenue, ctx.scope.currency)}`,
      timeframe: tf(ctx.range, ctx.preset), businessScope: bs(ctx.scope), source: "deterministic",
      calculation: "max(daily revenue) from deterministic trend", completeness: `${pts.length} days`,
    });
  }
  return {
    packageId: eid("pkg"), question: "", intent: "trend", timeframe: tf(ctx.range, ctx.preset),
    items, warnings: pts.length === 0 ? ["Empty range."] : [], generatedAt: ctx.nowIso,
  };
}

export function toolCompare(ctx: ToolContext, mode: CompareMode = "Previous Period"): EvidencePackage {
  const prevRange = compareRange(ctx.range, mode);
  const curTx = filterByRange(ctx.transactions, ctx.range, ctx.scope.timezone);
  const prevTx = filterByRange(ctx.transactions, prevRange, ctx.scope.timezone);
  const cur = calcTotals(curTx);
  const prev = calcTotals(prevTx);
  const rows = compareTotals(cur, prev);
  const labelOf: Record<string, string> = {
    revenue: `Revenue vs ${mode}`, cogs: `Buying cost (COGS) vs ${mode}`,
    gross: `Gross profit vs ${mode}`, purchases: `Purchases (stock) vs ${mode}`,
    expenses: `Expenses vs ${mode}`, net: `Net profit vs ${mode}`,
  };
  const items: EvidenceItem[] = rows.map((r) => {
    const pct = r.pct == null
      ? "no % (previous period was zero/empty — new)"
      : `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(1)}%`;
    const base = moneyItem(eid("compare"), `compare_${r.metric}`, labelOf[r.metric] ?? r.metric,
      r.current, ctx.scope, ctx.range, ctx.preset,
      `current ${formatMoney(r.current, ctx.scope.currency)} vs ${mode.toLowerCase()} ${formatMoney(r.previous, ctx.scope.currency)} (${prevRange.start}..${prevRange.end}); diff ${formatMoney(r.diff, ctx.scope.currency)}; ${pct}`,
      `prev ${formatMoney(r.previous, ctx.scope.currency)} (${prevRange.start}..${prevRange.end})`);
    base.dimensions = {
      metric: r.metric, prevStart: prevRange.start, prevEnd: prevRange.end,
      current: String(r.current), previous: String(r.previous),
      diff: String(r.diff), pct: r.pct == null ? "null" : String(r.pct),
    };
    base.comparison = {
      prevStart: prevRange.start, prevEnd: prevRange.end,
      currentMinor: r.current, previousMinor: r.previous,
      diffMinor: r.diff, pct: r.pct,
    };
    base.display = `${formatMoney(r.current, ctx.scope.currency)} vs ${formatMoney(r.previous, ctx.scope.currency)} (${pct}; diff ${formatMoney(r.diff, ctx.scope.currency)})`;
    return base;
  });
  const warnings: string[] = [];
  if (prev.count === 0) warnings.push(`No transactions in the comparison period (${prevRange.start} to ${prevRange.end}) — shown as zero; % changes are "new", not 0%.`);
  if (cur.count === 0) warnings.push(`No transactions in the current period (${ctx.range.start} to ${ctx.range.end}) — shown as zero.`);
  return {
    packageId: eid("pkg"), question: "", intent: "comparison", timeframe: tf(ctx.range, ctx.preset),
    items, warnings, generatedAt: ctx.nowIso,
  };
}

/** Dimension comparison across two periods (product/category/channel sales).
 * Sales-only; same key + same metric both sides; exact inclusive boundaries
 * from the caller's ranges; timezone preserved via filterByRange. Zero
 * previous values yield pct null ("new"). */
export function toolCompareDimension(
  ctx: ToolContext,
  dim: "product" | "category" | "channel",
  prevRange: DateRangeSel,
  limit = 8,
): EvidencePackage {
  const curTx = filterByRange(ctx.transactions, ctx.range, ctx.scope.timezone).filter((t) => t.type === "sale");
  const prevTx = filterByRange(ctx.transactions, prevRange, ctx.scope.timezone).filter((t) => t.type === "sale");
  const keyOf = (t: { product?: string; category: string; channel?: string }) =>
    dim === "product" ? (t.product ?? t.category) : dim === "category" ? t.category : ((t.channel ?? "").trim() || "Unspecified/missing");
  const rows = compareDimMaps(sumByKey(curTx, keyOf), sumByKey(prevTx, keyOf)).slice(0, Math.max(1, limit));
  const items: EvidenceItem[] = rows.map((r) => {
    const pct = r.pct == null ? "new (no prior value)" : `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(1)}%`;
    const base = moneyItem(eid(`compare.${dim}`), `compare_${dim}`, `${dim} "${r.key}" vs prev (${prevRange.start}..${prevRange.end})`,
      r.current, ctx.scope, ctx.range, ctx.preset,
      `current ${formatMoney(r.current, ctx.scope.currency)} vs prev ${formatMoney(r.previous, ctx.scope.currency)} (${prevRange.start}..${prevRange.end}); diff ${formatMoney(r.diff, ctx.scope.currency)}; ${pct}`,
      `prev ${formatMoney(r.previous, ctx.scope.currency)}`);
    base.dimensions = {
      [dim]: r.key, prevStart: prevRange.start, prevEnd: prevRange.end,
      current: String(r.current), previous: String(r.previous),
      diff: String(r.diff), pct: r.pct == null ? "null" : String(r.pct),
    };
    base.comparison = {
      prevStart: prevRange.start, prevEnd: prevRange.end,
      currentMinor: r.current, previousMinor: r.previous,
      diffMinor: r.diff, pct: r.pct,
    };
    base.display = `${formatMoney(r.current, ctx.scope.currency)} vs ${formatMoney(r.previous, ctx.scope.currency)} (${pct})`;
    return base;
  });
  const warnings: string[] = [];
  if (curTx.length === 0) warnings.push(`No sales in the current period (${ctx.range.start} to ${ctx.range.end}).`);
  if (prevTx.length === 0) warnings.push(`No sales in the comparison period (${prevRange.start} to ${prevRange.end}) — shown as zero; % is "new".`);
  if (dim === "channel" && rows.some((r) => r.key === "Unspecified/missing")) {
    warnings.push("Some sales have no recorded channel — channel comparison is incomplete. No channel invented.");
  }
  return {
    packageId: eid("pkg"), question: "", intent: "comparison", timeframe: tf(ctx.range, ctx.preset),
    items, warnings, generatedAt: ctx.nowIso,
  };
}
