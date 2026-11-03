// Deterministic business tools (server-side, source of truth) — core.
// Reuses lib/analytics.ts — NO duplicated math. Money in minor units.

import {
  calcTotals,
  filterByRange,
  filterByScope,
  type Totals,
} from "../analytics";
import { formatMoney } from "../utils";
import type { ActivityScope, DateRangeSel, MockTransaction } from "../types";
import type { EvidenceItem, EvidencePackage } from "./evidence";

export interface ToolBusinessScope {
  businessId: string;
  businessName: string;
  currency: string;
  timezone: string;
}

export interface ToolContext {
  transactions: MockTransaction[];
  scope: ToolBusinessScope;
  range: DateRangeSel;
  preset: string;
  nowIso: string;
}

let evidenceSeq = 0;
export function eid(prefix: string): string {
  evidenceSeq += 1;
  return `${prefix}.${Date.now().toString(36)}.${evidenceSeq}`;
}

export function tf(range: DateRangeSel, preset: string) {
  return { start: range.start, end: range.end, preset };
}

export function bs(scope: ToolBusinessScope) {
  return { businessId: scope.businessId, businessName: scope.businessName, currency: scope.currency, timezone: scope.timezone };
}

export function moneyItem(
  id: string, metric: string, label: string, valueMinor: number, scope: ToolBusinessScope,
  range: DateRangeSel, preset: string, calculation: string, completeness: string,
): EvidenceItem {
  return {
    id, metric, label, valueMinor, unit: scope.currency,
    display: formatMoney(valueMinor, scope.currency),
    timeframe: tf(range, preset), businessScope: bs(scope),
    source: "deterministic", calculation, completeness,
  };
}

export function scopedTxns(all: MockTransaction[], range: DateRangeSel, scope: ActivityScope, timezone?: string | null): MockTransaction[] {
  return filterByScope(filterByRange(all, range, timezone ?? undefined), scope);
}

export function countItem(
  id: string, metric: string, label: string, count: number, scope: ToolBusinessScope,
  range: DateRangeSel, preset: string, calculation: string, completeness: string,
): EvidenceItem {
  return {
    id, metric, label, value: count, unit: "count",
    display: `${count} transaction${count === 1 ? "" : "s"}`,
    timeframe: tf(range, preset), businessScope: bs(scope),
    source: "deterministic", calculation, completeness,
  };
}

/** Business overview: revenue/COGS/gross/expenses/net/purchases + per-type counts.
 * Slice 3: counts are first-class evidence (sales/purchase/expense transaction
 * counts). Formulas unchanged: COGS from sale.buying_cost_total_minor only,
 * gross = revenue − COGS, net = gross − expenses. Purchases stay stock-only. */
export function toolBusinessOverview(ctx: ToolContext, scope: ActivityScope = "All"): { totals: Totals; pkg: EvidencePackage } {
  const inScope = scopedTxns(ctx.transactions, ctx.range, scope, ctx.scope.timezone);
  const totals = calcTotals(filterByRange(ctx.transactions, ctx.range, ctx.scope.timezone));
  const inRange = filterByRange(ctx.transactions, ctx.range, ctx.scope.timezone);
  const salesN = inRange.filter((t) => t.type === "sale").length;
  const purchN = inRange.filter((t) => t.type === "purchase").length;
  const expN = inRange.filter((t) => t.type === "expense").length;
  const calc = (what: string) =>
    `${what} over ${ctx.range.start}..${ctx.range.end} (${ctx.preset}, tz ${ctx.scope.timezone}); COGS from sale.buying_cost_total_minor only`;
  const items: EvidenceItem[] = [
    moneyItem(eid("sales.total"), "total_sales", "Total sales", totals.revenue, ctx.scope, ctx.range, ctx.preset, calc("sum(sale.total_minor)"), `${salesN} sales`),
    countItem(eid("sales.count"), "sales_count", "Sales transactions", salesN, ctx.scope, ctx.range, ctx.preset, calc("count(sale)"), `${salesN} sales`),
    moneyItem(eid("sales.cogs"), "buying_cost", "Buying cost (COGS)", totals.cogs, ctx.scope, ctx.range, ctx.preset, calc("sum(sale.buying_cost_total_minor)"), "COGS lives on sales only"),
    moneyItem(eid("profit.gross"), "gross_profit", "Gross profit", totals.gross, ctx.scope, ctx.range, ctx.preset, calc("revenue minus COGS"), "revenue minus COGS"),
    moneyItem(eid("expense.total"), "total_expenses", "Total expenses", totals.expenses, ctx.scope, ctx.range, ctx.preset, calc("sum(expense.total_minor)"), `${expN} expenses`),
    countItem(eid("expense.count"), "expense_count", "Expense transactions", expN, ctx.scope, ctx.range, ctx.preset, calc("count(expense)"), `${expN} expenses`),
    moneyItem(eid("purchase.total"), "total_purchases", "Total purchases (stock)", totals.purchases, ctx.scope, ctx.range, ctx.preset, calc("sum(purchase.total_minor) — stock only, never COGS"), `${purchN} purchases`),
    countItem(eid("purchase.count"), "purchase_count", "Purchase transactions", purchN, ctx.scope, ctx.range, ctx.preset, calc("count(purchase) — stock only, never COGS"), `${purchN} purchases`),
    moneyItem(eid("profit.net"), "net_profit", "Net profit", totals.net, ctx.scope, ctx.range, ctx.preset, calc("gross minus expenses"), "gross minus overhead"),
  ];
  return {
    totals,
    pkg: {
      packageId: eid("pkg"), question: "", intent: "summary", timeframe: tf(ctx.range, ctx.preset),
      items, warnings: totals.count === 0 ? ["No transactions in this range."] : [], generatedAt: ctx.nowIso,
    },
  };
}

export function toolSales(ctx: ToolContext): EvidencePackage {
  const { pkg } = toolBusinessOverview(ctx);
  return { ...pkg, items: pkg.items.filter((i) => ["total_sales", "sales_count", "buying_cost", "gross_profit"].includes(i.metric)), intent: "metric" };
}
export function toolPurchases(ctx: ToolContext): EvidencePackage {
  const { pkg } = toolBusinessOverview(ctx);
  return { ...pkg, items: pkg.items.filter((i) => ["total_purchases", "purchase_count"].includes(i.metric)), intent: "metric" };
}
export function toolExpenses(ctx: ToolContext): EvidencePackage {
  const { pkg } = toolBusinessOverview(ctx);
  return { ...pkg, items: pkg.items.filter((i) => ["total_expenses", "expense_count"].includes(i.metric)), intent: "metric" };
}
export function toolProfit(ctx: ToolContext): EvidencePackage {
  const { pkg } = toolBusinessOverview(ctx);
  return { ...pkg, items: pkg.items.filter((i) => ["gross_profit", "net_profit", "total_sales", "buying_cost", "total_expenses", "sales_count", "expense_count"].includes(i.metric)), intent: "metric" };
}
