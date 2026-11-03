// Deterministic dimension tools: products, categories, channels (Slice 3).
// Reuses lib/analytics.ts — NO duplicated math. Types never mixed.

import {
  buildCategoryBreakdown,
  buildChannelSplit,
  buildProductPerformance,
  filterByRange,
} from "../analytics";
import { formatMoney } from "../utils";
import type { EvidenceItem, EvidencePackage } from "./evidence";
import { bs, eid, moneyItem, tf, type ToolContext } from "./tools";

export function toolProducts(ctx: ToolContext, limit = 5): EvidencePackage {
  const inRange = filterByRange(ctx.transactions, ctx.range, ctx.scope.timezone);
  const rows = buildProductPerformance(inRange.filter((t) => t.type === "sale"), limit);
  const items: EvidenceItem[] = rows.map((r, i) => {
    const base = moneyItem(
      eid("product.rank"), "product_revenue", `Product #${i + 1}: ${r.name}`,
      r.revenue, ctx.scope, ctx.range, ctx.preset,
      `sum(sale revenue) for product over ${ctx.range.start}..${ctx.range.end}`,
      r.qty == null ? "revenue verified; qty unknown (no line items)" : `${r.qty} units over ${r.count} sales`,
    );
    base.dimensions = { product: r.name, category: r.category, type: "sale" };
    base.display = `${formatMoney(r.revenue, ctx.scope.currency)}${r.qty == null ? " · qty unknown" : ` · ${r.qty} units`}`;
    return base;
  });
  // Product profit only when per-sale cost evidence exists on that product.
  // Never estimated, never derived from standalone purchases.
  const warnings: string[] = [];
  const withoutCost = rows.filter((r) => !r.hasCostEvidence);
  if (items.length === 0) warnings.push("No sales in this range.");
  else if (withoutCost.length > 0) {
    warnings.push(
      `Product-level profit unavailable for ${withoutCost.length}/${rows.length} product(s) (no per-sale cost evidence) — revenue only, no estimate.`,
    );
  }
  return {
    packageId: eid("pkg"), question: "", intent: "product", timeframe: tf(ctx.range, ctx.preset),
    items, warnings, generatedAt: ctx.nowIso,
  };
}

/** Top product by units sold. Answers "which product sold the most (units)". */
export function toolTopProductByQty(ctx: ToolContext, limit = 5): EvidencePackage {
  const inRange = filterByRange(ctx.transactions, ctx.range, ctx.scope.timezone);
  const rows = buildProductPerformance(inRange.filter((t) => t.type === "sale"), 100)
    .filter((r) => r.qty != null)
    .sort((a, b) => (b.qty ?? 0) - (a.qty ?? 0))
    .slice(0, Math.max(1, limit));
  const items: EvidenceItem[] = rows.map((r, i) => ({
    id: eid("product.units"), metric: "product_units", label: `Product #${i + 1} by units: ${r.name}`,
    value: r.qty, unit: "count",
    display: `${r.qty} units · ${formatMoney(r.revenue, ctx.scope.currency)}`,
    timeframe: tf(ctx.range, ctx.preset), businessScope: bs(ctx.scope), source: "deterministic",
    calculation: `sum(sale qty) for product over ${ctx.range.start}..${ctx.range.end}`,
    completeness: `${r.count} sales`,
    dimensions: { product: r.name, category: r.category, type: "sale" },
  }));
  const warnings: string[] = [];
  if (items.length === 0) {
    warnings.push("No verifiable unit quantities in this range (sales without line-item quantities, or no sales). Units never defaulted to 1.");
  }
  return {
    packageId: eid("pkg"), question: "", intent: "product", timeframe: tf(ctx.range, ctx.preset),
    items, warnings, generatedAt: ctx.nowIso,
  };
}

export function toolCategories(ctx: ToolContext): EvidencePackage {
  const inRange = filterByRange(ctx.transactions, ctx.range, ctx.scope.timezone);
  // Slice 3: type-separated breakdown — never mixes sales, purchases,
  // expenses into one category total (old split mixed them).
  const rows = buildCategoryBreakdown(inRange).slice(0, 8);
  const items: EvidenceItem[] = rows.map((r) => {
    const share = r.sharePct == null ? "share n/a (zero type total)" : `${r.sharePct.toFixed(1)}% of ${r.type} total`;
    const base = moneyItem(
      eid("category.share"), "category_total", `Category (${r.type}): ${r.category}`,
      r.total, ctx.scope, ctx.range, ctx.preset,
      `sum(${r.type}.total_minor) for category over ${ctx.range.start}..${ctx.range.end}`,
      `${r.count} ${r.type} txns · ${share}`,
    );
    base.dimensions = { category: r.category, type: r.type };
    base.display = `${formatMoney(r.total, ctx.scope.currency)} (${share})`;
    return base;
  });
  return {
    packageId: eid("pkg"), question: "", intent: "category", timeframe: tf(ctx.range, ctx.preset),
    items, warnings: items.length === 0 ? ["No transactions in this range."] : [], generatedAt: ctx.nowIso,
  };
}

/** Sales by channel with contribution + missing-data honesty. Never invents
 * a channel; blank rows land in "Unspecified/missing". Never payment method. */
export function toolChannels(ctx: ToolContext): EvidencePackage {
  const inRange = filterByRange(ctx.transactions, ctx.range, ctx.scope.timezone);
  const sales = inRange.filter((t) => t.type === "sale");
  const rows = buildChannelSplit(sales).slice(0, 8);
  const items: EvidenceItem[] = rows.map((r) => {
    const share = r.sharePct == null ? "share n/a (zero sales)" : `${r.sharePct.toFixed(1)}% of sales`;
    const base = moneyItem(
      eid("channel.share"), "channel_revenue", `Channel: ${r.channel}`,
      r.revenue, ctx.scope, ctx.range, ctx.preset,
      `sum(sale revenue) for channel over ${ctx.range.start}..${ctx.range.end}`,
      `${r.count} sales · ${share}${r.missing ? " · channel not recorded" : ""}`,
    );
    base.dimensions = { channel: r.channel, type: "sale" };
    base.display = `${formatMoney(r.revenue, ctx.scope.currency)} (${share})`;
    return base;
  });
  const warnings: string[] = [];
  if (sales.length === 0) warnings.push("No sales in this range.");
  else {
    const missing = rows.find((r) => r.missing);
    if (missing) warnings.push(`${formatMoney(missing.revenue, ctx.scope.currency)} of sales has no recorded channel — channel coverage is incomplete. No channel invented.`);
    if (rows.length === 1 && rows[0].missing) warnings.push("No channel information recorded for any sale in this range.");
  }
  return {
    packageId: eid("pkg"), question: "", intent: "channel", timeframe: tf(ctx.range, ctx.preset),
    items, warnings, generatedAt: ctx.nowIso,
  };
}
