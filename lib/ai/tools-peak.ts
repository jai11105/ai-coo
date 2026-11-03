// Deterministic tools: peak hours (from timestamps) + recent transactions.

import { filterByRange } from "../analytics";
import { formatMoney } from "../utils";
import type { EvidenceItem, EvidencePackage } from "./evidence";
import { bs, eid, tf, type ToolContext } from "./tools";

export function toolPeakHours(ctx: ToolContext): EvidencePackage {
  const inRange = filterByRange(ctx.transactions, ctx.range, ctx.scope.timezone);
  // Fallback widening: when the resolved range has no timestamped txns
  // (e.g. month-to-date covering only 1–2 empty days), widen to the last
  // 90 days of actual data so "peak hours" answers from real evidence
  // instead of an empty range. The widened timeframe is labeled honestly.
  let useRange = ctx.range;
  let usePreset = ctx.preset;
  let widened = false;
  const hasTimed = (txns: typeof inRange) => txns.some((t) => /T(\d{2}):(\d{2})/.test(t.date));
  if (inRange.length === 0 || !hasTimed(inRange)) {
    const sorted = [...ctx.transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (sorted.length > 0) {
      const end = sorted[0].date.slice(0, 10);
      const start = sorted[Math.min(89, sorted.length - 1)].date.slice(0, 10);
      const wide = { start: start <= end ? start : end, end };
      const wideTxns = filterByRange(ctx.transactions, wide, ctx.scope.timezone);
      if (wideTxns.length > 0 && hasTimed(wideTxns)) {
        useRange = wide;
        usePreset = `Last ${Math.min(90, sorted.length)} Transactions Window`;
        widened = true;
      }
    }
  }
  const inUse = widened ? filterByRange(ctx.transactions, useRange, ctx.scope.timezone) : inRange;
  const hours = new Map<number, { revenue: number; count: number }>();
  let withTime = 0;
  for (const t of inUse) {
    const m = /T(\d{2}):(\d{2})/.exec(t.date);
    if (!m) continue;
    withTime += 1;
    const h = Number(m[1]);
    const cur = hours.get(h) ?? { revenue: 0, count: 0 };
    if (t.type === "sale") cur.revenue += t.amountMinor;
    cur.count += 1; hours.set(h, cur);
  }
  const rows: [number, { revenue: number; count: number }][] = [];
  hours.forEach((v, k) => { rows.push([k, v]); });
  rows.sort((a, b) => b[1].revenue - a[1].revenue);
  const items: EvidenceItem[] = rows.slice(0, 5).map(([h, r]) => ({
    id: eid("peak.hour"), metric: "peak_hour_revenue", label: `Hour ${String(h).padStart(2, "0")}:00`,
    valueMinor: r.revenue, unit: ctx.scope.currency,
    display: `${String(h).padStart(2, "0")}:00 — ${formatMoney(r.revenue, ctx.scope.currency)} (${r.count} txns)`,
    timeframe: tf(useRange, usePreset), businessScope: bs(ctx.scope), source: "deterministic",
    calculation: `sum(sale revenue) by hour over ${useRange.start}..${useRange.end}`,
    completeness: `${withTime}/${inUse.length} carry timestamps`, dimensions: { hour: String(h) },
  }));
  const warnings: string[] = [];
  if (widened) warnings.push(`Requested range had no timestamped transactions — widened honestly to ${useRange.start}..${useRange.end}.`);
  if (inUse.length === 0) warnings.push("No transactions in this range.");
  else if (withTime < inUse.length) warnings.push(`Only ${withTime}/${inUse.length} carry usable timestamps.`);
  if (items.length === 0 && inUse.length > 0) warnings.push("Timestamp data missing — cannot determine peak hours. No hours invented.");
  return { packageId: eid("pkg"), question: "", intent: "peak_hours", timeframe: tf(useRange, usePreset), items, warnings, generatedAt: ctx.nowIso };
}

export function toolRecent(ctx: ToolContext, limit = 5): EvidencePackage {
  const sorted = [...ctx.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, Math.max(1, Math.min(limit, 10)));
  const items: EvidenceItem[] = sorted.map((t) => ({
    id: eid("recent.txn"), metric: "recent_transaction", label: `${t.type} · ${t.date.slice(0, 10)}`,
    valueMinor: t.amountMinor, unit: ctx.scope.currency,
    display: `${t.type} ${formatMoney(t.amountMinor, ctx.scope.currency)} — ${t.category}${t.product ? ` · ${t.product}` : ""}`,
    timeframe: tf(ctx.range, ctx.preset), businessScope: bs(ctx.scope), source: "deterministic",
    calculation: "latest persisted transactions (no aggregation)", completeness: t.reference ?? t.id,
    dimensions: { type: t.type, category: t.category },
  }));
  return {
    packageId: eid("pkg"), question: "", intent: "summary", timeframe: tf(ctx.range, ctx.preset),
    items, warnings: items.length === 0 ? ["No transactions yet."] : [], generatedAt: ctx.nowIso,
  };
}
