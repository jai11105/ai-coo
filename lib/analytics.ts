import type {
  ActivityScope,
  CompareMode,
  DatePreset,
  DateRangeSel,
  MockKpi,
  MockTransaction,
} from "./types";
import { DATASET_ANCHOR } from "./datasets";

// Shared filtering + calculation layer. Dashboard KPIs, charts and insights
// must ALL derive from this module so totals never contradict the ledger.
//
// Date-preset conventions (preserved, now timezone-aware for live):
// - Today: single business-local calendar day.
// - Yesterday: previous business-local calendar day.
// - This Week: rolling 7-day window (anchor-6 → anchor). This is the
//   established product convention (not Monday-start); preserved verbatim.
// - This Month: month-to-date (monthStart(anchor) → anchor).
// - Last Month: complete previous business-local calendar month.
// - Custom: exact user-selected inclusive start/end.
// Live callers must use resolveRangeInTimezone()/todayInTimezone() with the
// active business timezone (e.g. Asia/Kolkata). Demo callers keep the fixed
// ANCHOR_TODAY for deterministic seeds.

export const ANCHOR_TODAY = "2026-10-31";

/** Business-local calendar day (YYYY-MM-DD) in the given IANA timezone.
 * Falls back to UTC when the timezone is missing/invalid. Never uses the
 * browser system timezone when a business timezone is available. */
export function todayInTimezone(timezone?: string | null, now = new Date()): string {
  const tz = (timezone ?? "").trim() || "UTC";
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Calendar-day string (YYYY-MM-DD) of an ISO timestamp in the given
 * business timezone. Date-only inputs ("2026-11-01" or "2026-11-01T..")
 * are returned verbatim (no UTC shift). Datetimes with an explicit offset
 * or Z are converted via Intl so a UTC-midnight stamp stays on the correct
 * business-local day. */
export function dayInTimezone(dateIso: string, timezone?: string | null): string {
  const raw = (dateIso ?? "").trim();
  if (raw.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const hasTime = raw.length > 10;
    const hasZone =
      /[zZ]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw) || /[+-]\d{4}$/.test(raw);
    // Date-only (or datetime WITHOUT zone, already business-local): no shift.
    if (!hasTime || !hasZone) return raw.slice(0, 10);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
    return todayInTimezone(timezone, d);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return todayInTimezone(timezone, d);
}

function toDay(s: string): string {
  return s.slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return dt.toISOString().slice(0, 10);
}

function addYears(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + n, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

function monthStart(iso: string): string {
  return iso.slice(0, 7) + "-01";
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function resolveRange(preset: DatePreset, custom: DateRangeSel, anchor = ANCHOR_TODAY): DateRangeSel {
  switch (preset) {
    case "Today":
      return { start: anchor, end: anchor };
    case "Yesterday":
      return { start: addDays(anchor, -1), end: addDays(anchor, -1) };
    case "This Week":
      // Established convention: rolling 7-day window. Preserved verbatim.
      return { start: addDays(anchor, -6), end: anchor };
    case "This Month":
      // Established convention: month-to-date. Preserved verbatim.
      return { start: monthStart(anchor), end: anchor };
    case "Last Month": {
      const prev = addMonths(monthStart(anchor), -1);
      const endPrev = addDays(monthStart(anchor), -1);
      return { start: prev, end: endPrev };
    }
    case "Custom":
      return custom.start <= custom.end ? custom : { start: custom.end, end: custom.start };
  }
}

/** Live variant: anchors presets on the BUSINESS-LOCAL today (never the
 * browser/UTC date or the demo ANCHOR_TODAY). Custom returns the exact
 * user-selected inclusive dates. Preset selection is never silently
 * rewritten to Custom. */
export function resolveRangeInTimezone(
  preset: DatePreset,
  custom: DateRangeSel,
  timezone?: string | null,
  now = new Date()
): DateRangeSel {
  const anchor = todayInTimezone(timezone, now);
  return resolveRange(preset, custom, anchor);
}

export function compareRange(range: DateRangeSel, mode: CompareMode): DateRangeSel {
  const len = daysBetween(range.start, range.end);
  if (mode === "Previous Period") {
    return { start: addDays(range.start, -(len + 1)), end: addDays(range.start, -1) };
  }
  return { start: addYears(range.start, -1), end: addYears(range.end, -1) };
}

export function filterByRange(txns: MockTransaction[], range: DateRangeSel, timezone?: string | null): MockTransaction[] {
  return txns.filter((t) => {
    const d = timezone ? dayInTimezone(t.date, timezone) : toDay(t.date);
    return d >= range.start && d <= range.end;
  });
}

export function filterByScope(txns: MockTransaction[], scope: ActivityScope): MockTransaction[] {
  if (scope === "All") return txns;
  const map: Record<string, string> = { Sales: "sale", Purchase: "purchase", Expense: "expense" };
  return txns.filter((t) => t.type === map[scope]);
}

export { DATASET_ANCHOR };
// __ANALYTICS2__
export interface Totals {
  revenue: number;
  cogs: number;
  gross: number;
  purchases: number;
  expenses: number;
  net: number;
  count: number;
}

export function calcTotals(txns: MockTransaction[]): Totals {
  let revenue = 0, cogs = 0, purchases = 0, expenses = 0;
  for (const t of txns) {
    if (t.type === "sale") {
      revenue += t.amountMinor;
      cogs += t.buyingCostTotalMinor ?? 0;
    } else if (t.type === "purchase") {
      purchases += t.amountMinor;
    } else {
      expenses += t.amountMinor;
    }
  }
  const gross = revenue - cogs;
  return { revenue, cogs, gross, purchases, expenses, net: gross - expenses, count: txns.length };
}

export function pctChange(cur: number, prev: number): number | null {
  // Previous period zero/empty → percentage is UNDEFINED (not 0%, not 100%).
  // Callers render "New" (cur != 0) or "—" (both zero). Never fabricate +100%.
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function buildKpis(cur: Totals, prev: Totals, scope: ActivityScope, curCode = "INR"): MockKpi[] {
  const hint = scope === "All" ? "vs comparison period" : `scoped: ${scope}`;
  if (scope === "Sales")
    return [
      { key: "revenue", label: "Revenue", valueMinor: cur.revenue, currency: curCode, deltaPct: pctChange(cur.revenue, prev.revenue), hint },
      { key: "cogs", label: "COGS", valueMinor: cur.cogs, currency: curCode, deltaPct: pctChange(cur.cogs, prev.cogs), hint },
      { key: "gross", label: "Gross Profit", valueMinor: cur.gross, currency: curCode, deltaPct: pctChange(cur.gross, prev.gross), hint },
      { key: "expenses", label: "Expenses", valueMinor: 0, currency: curCode, deltaPct: 0, hint: "excluded by slicer" },
      { key: "net", label: "Net Profit", valueMinor: cur.gross, currency: curCode, deltaPct: pctChange(cur.gross, prev.gross), hint: "scoped view" },
    ];
  if (scope === "Purchase")
    return [
      { key: "revenue", label: "Revenue", valueMinor: 0, currency: curCode, deltaPct: 0, hint: "excluded by slicer" },
      { key: "cogs", label: "COGS", valueMinor: 0, currency: curCode, deltaPct: 0, hint: "COGS lives on Sales" },
      { key: "gross", label: "Gross Profit", valueMinor: 0, currency: curCode, deltaPct: 0, hint: "excluded by slicer" },
      { key: "expenses", label: "Purchases", valueMinor: cur.purchases, currency: curCode, deltaPct: pctChange(cur.purchases, prev.purchases), hint: "stock acquisitions" },
      { key: "net", label: "Net Profit", valueMinor: 0, currency: curCode, deltaPct: 0, hint: "scoped view" },
    ];
  if (scope === "Expense")
    return [
      { key: "revenue", label: "Revenue", valueMinor: 0, currency: curCode, deltaPct: 0, hint: "excluded by slicer" },
      { key: "cogs", label: "COGS", valueMinor: 0, currency: curCode, deltaPct: 0, hint: "excluded by slicer" },
      { key: "gross", label: "Gross Profit", valueMinor: 0, currency: curCode, deltaPct: 0, hint: "excluded by slicer" },
      { key: "expenses", label: "Expenses", valueMinor: cur.expenses, currency: curCode, deltaPct: pctChange(cur.expenses, prev.expenses), hint },
      { key: "net", label: "Net Profit", valueMinor: -cur.expenses, currency: curCode, deltaPct: pctChange(-cur.expenses, -prev.expenses), hint: "scoped view" },
    ];
  return [
    { key: "revenue", label: "Revenue", valueMinor: cur.revenue, currency: curCode, deltaPct: pctChange(cur.revenue, prev.revenue), hint },
    { key: "cogs", label: "COGS", valueMinor: cur.cogs, currency: curCode, deltaPct: pctChange(cur.cogs, prev.cogs), hint: "inventory cost" },
    { key: "gross", label: "Gross Profit", valueMinor: cur.gross, currency: curCode, deltaPct: pctChange(cur.gross, prev.gross), hint: "Revenue minus COGS" },
    { key: "expenses", label: "Expenses", valueMinor: cur.expenses, currency: curCode, deltaPct: pctChange(cur.expenses, prev.expenses), hint: "overhead" },
    { key: "net", label: "Net Profit", valueMinor: cur.net, currency: curCode, deltaPct: pctChange(cur.net, prev.net), hint: "Gross minus Expenses" },
  ];
}
// __ANALYTICS3__
export interface TrendPoint { day: string; label: string; revenue: number; cogs: number; expenses: number; purchases: number }

export function buildTrend(txns: MockTransaction[], range: DateRangeSel, timezone?: string | null): TrendPoint[] {
  const days: string[] = [];
  let d = range.start;
  let guard = 0;
  while (d <= range.end && guard < 370) {
    days.push(d);
    const [y, m, dd] = d.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, dd));
    dt.setUTCDate(dt.getUTCDate() + 1);
    d = dt.toISOString().slice(0, 10);
    guard++;
  }
  return days.map((day) => {
    const inDay = txns.filter((t) => (timezone ? dayInTimezone(t.date, timezone) : t.date.slice(0, 10)) === day);
    let revenue = 0, cogs = 0, expenses = 0, purchases = 0;
    for (const t of inDay) {
      if (t.type === "sale") { revenue += t.amountMinor; cogs += t.buyingCostTotalMinor ?? 0; }
      else if (t.type === "purchase") purchases += t.amountMinor;
      else expenses += t.amountMinor;
    }
    return { day, label: day.slice(5), revenue, cogs, expenses, purchases };
  });
}

export interface SliceItem { name: string; value: number; pct: number }

export function buildCategorySplit(txns: MockTransaction[]): SliceItem[] {
  const map = new Map<string, number>();
  for (const t of txns) map.set(t.category, (map.get(t.category) ?? 0) + t.amountMinor);
  const entries = Array.from(map.entries());
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return entries
    .map(([name, value]) => ({ name, value, pct: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

// Slice 3 dimension + comparison helpers (ADDITIVE — existing functions
// above are preserved verbatim; approved formulas reused, never redefined).
// Sales / purchases / expenses are NEVER mixed in one total. Buying cost on
// sales (COGS) comes only from sale.buyingCostTotalMinor. Standalone stock
// purchases are never added to COGS. pctChange() is the single % definition.

export type DimTxnType = "sale" | "purchase" | "expense";

export interface CategoryBreakdown {
  category: string;
  type: DimTxnType;
  total: number;
  count: number;
  /** Share of the within-type total (0..100). Null when type total is zero. */
  sharePct: number | null;
}

/** Sales/purchases/expenses by category — one row per (type, category).
 * Types are never mixed: sharePct is always within the same txn type. */
export function buildCategoryBreakdown(txns: MockTransaction[]): CategoryBreakdown[] {
  const totalsByType = new Map<DimTxnType, number>();
  const groups = new Map<string, { type: DimTxnType; category: string; total: number; count: number }>();
  for (const t of txns) {
    const type = t.type as DimTxnType;
    totalsByType.set(type, (totalsByType.get(type) ?? 0) + t.amountMinor);
    const key = `${type}::${t.category}`;
    const cur = groups.get(key) ?? { type, category: t.category, total: 0, count: 0 };
    cur.total += t.amountMinor;
    cur.count += 1;
    groups.set(key, cur);
  }
  const order: Record<DimTxnType, number> = { sale: 0, purchase: 1, expense: 2 };
  return Array.from(groups.values())
    .map((g) => {
      const typeTotal = totalsByType.get(g.type) ?? 0;
      return {
        category: g.category, type: g.type, total: g.total, count: g.count,
        sharePct: typeTotal > 0 ? (g.total / typeTotal) * 100 : null,
      };
    })
    .sort((a, b) => order[a.type] - order[b.type] || b.total - a.total);
}

export interface ChannelSplit {
  channel: string;
  revenue: number;
  count: number;
  /** Share of total sales revenue (0..100). Null when sales total is zero. */
  sharePct: number | null;
  missing: boolean;
}

/** Sales by channel. Blank/absent becomes the single "Unspecified/missing"
 * bucket (never invented, never payment method). Sorted revenue desc. */
export function buildChannelSplit(txns: MockTransaction[]): ChannelSplit[] {
  const map = new Map<string, { revenue: number; count: number; missing: boolean }>();
  for (const t of txns) {
    if (t.type !== "sale") continue;
    const raw = (t.channel ?? "").trim();
    const key = raw || "Unspecified/missing";
    const cur = map.get(key) ?? { revenue: 0, count: 0, missing: key === "Unspecified/missing" };
    cur.revenue += t.amountMinor;
    cur.count += 1;
    map.set(key, cur);
  }
  const total = Array.from(map.values()).reduce((s, r) => s + r.revenue, 0);
  return Array.from(map.entries())
    .map(([channel, r]) => ({
      channel, revenue: r.revenue, count: r.count,
      sharePct: total > 0 ? (r.revenue / total) * 100 : null,
      missing: r.missing,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface ProductPerformance {
  name: string;
  category: string;
  revenue: number;
  qty: number | null;
  /** Sum of sale.buyingCostTotalMinor for this product (COGS basis). */
  cogs: number;
  /** revenue − cogs. Meaningful only when hasCostEvidence is true. */
  gross: number;
  /** True when >= 1 sale row carried a cost basis. When false, gross is
   * unavailable — never estimated. */
  hasCostEvidence: boolean;
  count: number;
}

/** Product performance from sales only. Reuses the buildTopProducts null-qty
 * convention (unknown stays null, never 1). COGS sums only recorded
 * sale.buyingCostTotalMinor; standalone purchases are excluded. */
export function buildProductPerformance(txns: MockTransaction[], limit = 5): ProductPerformance[] {
  const map = new Map<string, ProductPerformance>();
  for (const t of txns) {
    if (t.type !== "sale") continue;
    const key = t.product ?? t.category;
    const cur = map.get(key) ?? {
      name: key, category: t.category, revenue: 0, qty: 0 as number | null,
      cogs: 0, gross: 0, hasCostEvidence: false, count: 0,
    };
    cur.revenue += t.amountMinor;
    cur.count += 1;
    if (t.qty == null) {
      cur.qty = null;
    } else if (cur.qty != null) {
      cur.qty += t.qty;
    }
    if (t.buyingCostTotalMinor != null) {
      cur.hasCostEvidence = true;
      cur.cogs += t.buyingCostTotalMinor;
    }
    map.set(key, cur);
  }
  map.forEach((p) => { p.gross = p.revenue - p.cogs; });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, Math.max(1, limit));
}

export interface MetricComparison {
  metric: string;
  current: number;
  previous: number;
  /** current − previous (signed, same unit). */
  diff: number;
  /** pctChange(current, previous) — null when previous is zero/empty. */
  pct: number | null;
}

/** Deterministic comparison for approved totals. Caller supplies Totals from
 * calcTotals (no math redefined). Same metric + same scope both sides. Zero
 * previous values yield pct null ("new"), never a fabricated +100%. */
export function compareTotals(cur: Totals, prev: Totals): MetricComparison[] {
  const row = (metric: string, c: number, p: number): MetricComparison => ({
    metric, current: c, previous: p, diff: c - p, pct: pctChange(c, p),
  });
  return [
    row("revenue", cur.revenue, prev.revenue),
    row("cogs", cur.cogs, prev.cogs),
    row("gross", cur.gross, prev.gross),
    row("purchases", cur.purchases, prev.purchases),
    row("expenses", cur.expenses, prev.expenses),
    row("net", cur.net, prev.net),
  ];
}

export interface DimComparison {
  key: string;
  current: number;
  previous: number;
  diff: number;
  pct: number | null;
}

/** Per-key comparison (product/category/channel). Keys match exactly across
 * periods; one-sided keys compare against zero (pct null when prev is zero).
 * Sorted by current desc. */
export function compareDimMaps(cur: Map<string, number>, prev: Map<string, number>): DimComparison[] {
  const keys = new Set<string>();
  cur.forEach((_v, k) => { keys.add(k); });
  prev.forEach((_v, k) => { keys.add(k); });
  const rows: DimComparison[] = [];
  keys.forEach((key) => {
    const c = cur.get(key) ?? 0;
    const p = prev.get(key) ?? 0;
    rows.push({ key, current: c, previous: p, diff: c - p, pct: pctChange(c, p) });
  });
  return rows.sort((a, b) => b.current - a.current);
}

/** Sum helper for dimension maps (sales-only revenue by key). */
export function sumByKey(txns: MockTransaction[], keyOf: (t: MockTransaction) => string | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txns) {
    const k = keyOf(t);
    if (k == null) continue;
    map.set(k, (map.get(k) ?? 0) + t.amountMinor);
  }
  return map;
}

export interface TypeCompare { type: string; value: number; count: number }

export function buildTypeCompare(txns: MockTransaction[]): TypeCompare[] {
  const rows: TypeCompare[] = [
    { type: "Sales", value: 0, count: 0 },
    { type: "Purchase", value: 0, count: 0 },
    { type: "Expense", value: 0, count: 0 },
  ];
  for (const t of txns) {
    if (t.type === "sale") { rows[0].value += t.amountMinor; rows[0].count++; }
    else if (t.type === "purchase") { rows[1].value += t.amountMinor; rows[1].count++; }
    else { rows[2].value += t.amountMinor; rows[2].count++; }
  }
  return rows;
}

export interface ProductRank { name: string; category: string; revenue: number; qty: number | null }

/** Top products from live sale totals. Quantity is genuine ONLY when the
 * MockTransaction carries qty from transaction_items.quantity. When a
 * historical sale row has no line-item quantity (qty undefined — e.g.
 * header-only legacy rows), qty stays null and the UI shows the actual
 * revenue with an honest "qty unknown (no line items)" note — it NEVER
 * invents qty 1. */
export function buildTopProducts(txns: MockTransaction[], limit = 5): ProductRank[] {
  const map = new Map<string, ProductRank>();
  for (const t of txns) {
    if (t.type !== "sale") continue;
    const key = t.product ?? t.category;
    const cur = map.get(key) ?? { name: key, category: t.category, revenue: 0, qty: 0 as number | null };
    cur.revenue += t.amountMinor;
    if (t.qty == null) {
      cur.qty = null;
    } else if (cur.qty != null) {
      cur.qty += t.qty;
    }
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export function buildInsights(cur: Totals, prev: Totals, range: DateRangeSel, scope: ActivityScope): string[] {
  const out: string[] = [];
  if (cur.count === 0) return ["No transactions in this range — widen dates or clear the slicer."];
  const rev = pctChange(cur.revenue, prev.revenue);
  const exp = pctChange(cur.expenses, prev.expenses);
  const gross = pctChange(cur.gross, prev.gross);
  const fmt = (d: number | null) => (d == null ? "new (no prior-period value)" : `${d >= 0 ? "up" : "down"} ${Math.abs(d).toFixed(1)}%`);
  if (cur.revenue > 0) out.push(`Revenue ${fmt(rev)} vs comparison (${range.start} to ${range.end}, ${scope}).`);
  if (cur.gross !== 0 || prev.gross !== 0) out.push(`Gross profit ${fmt(gross)} on COGS discipline.`);
  if (cur.expenses > 0) out.push(`Overhead ${fmt(exp)} — see category split.`);
  if (cur.purchases > 0) out.push(`Stock purchases booked separately; COGS stays on Sales.`);
  return out.slice(0, 4);
}
