// Slice 3 deterministic checks: dimensions + comparisons (no network).
// Run: node -r sucrase/register scripts/check-slice3.cjs
const assert = require("node:assert/strict");

const A = require("../lib/analytics.ts");
const Tools = require("../lib/ai/tools.ts");
const Dims = require("../lib/ai/tools-dims.ts");
const Trends = require("../lib/ai/tools-trends.ts");
const Sel = require("../lib/ai/select-evidence.ts");
const Val = require("../lib/ai/validate.ts");
const Orch = require("../lib/ai/orchestrator.ts");
const Adapter = require("../lib/live-adapter.ts");

const TZ = "Asia/Kolkata";
const RANGE = { start: "2026-10-25", end: "2026-10-31" };
function ctx(txns, range = RANGE) {
  return {
    transactions: txns,
    scope: { businessId: "biz-a", businessName: "Biz A", currency: "INR", timezone: TZ },
    range, preset: "Custom", nowIso: "2026-11-02T00:00:00.000Z",
  };
}
function T(o) {
  return {
    id: o.id, type: o.type, date: o.date, category: o.category,
    product: o.product, qty: o.qty, unitPriceMinor: o.unit,
    buyingCostMinor: o.cost, buyingCostTotalMinor: o.costTotal,
    party: "P", amountMinor: o.amount, currency: "INR",
    paymentMethod: o.method || "UPI", channel: o.channel,
    reference: o.id, notes: undefined,
  };
}

const TXNS = [
  T({ id: "s1", type: "sale", date: "2026-10-31T10:00", category: "Groceries", product: "Rice", qty: 2, unit: 50000, cost: 30000, costTotal: 60000, amount: 100000, channel: "Walk-in" }),
  T({ id: "s2", type: "sale", date: "2026-10-30T11:00", category: "Groceries", product: "Oil", qty: 1, unit: 37000, cost: 24000, costTotal: 24000, amount: 37000, channel: "Swiggy" }),
  T({ id: "s3", type: "sale", date: "2026-10-28T12:00", category: "Dairy", product: "Milk", qty: 5, unit: 6600, cost: 5400, costTotal: 27000, amount: 33000, channel: "Walk-in" }),
  T({ id: "s0", type: "sale", date: "2026-10-10T10:00", category: "Groceries", product: "Rice", qty: 1, unit: 50000, cost: 30000, costTotal: 30000, amount: 50000 }),
  T({ id: "p1", type: "purchase", date: "2026-10-29T10:00", category: "Stock — FMCG", product: "Rice bag", qty: 10, unit: 30000, amount: 300000 }),
  T({ id: "e1", type: "expense", date: "2026-10-28T09:00", category: "Rent", amount: 2500000 }),
  T({ id: "e2", type: "expense", date: "2026-10-26T09:00", category: "Electricity", amount: 184500 }),
];

module.exports = { TXNS, ctx, T, TZ, RANGE };

// 1. Sales / purchase / expense separation + COGS vs standalone purchases.
{
  const inR = TXNS.filter((t) => ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"].includes(t.date.slice(0, 10)));
  const totals = A.calcTotals(inR);
  assert.equal(totals.revenue, 170000);
  assert.equal(totals.cogs, 111000);
  assert.equal(totals.gross, 59000);
  assert.equal(totals.purchases, 300000);
  assert.equal(totals.expenses, 2684500);
  assert.equal(totals.net, 59000 - 2684500);
  const pkg = Tools.toolBusinessOverview(ctx(TXNS)).pkg;
  const by = Object.fromEntries(pkg.items.map((i) => [i.metric, i]));
  assert.equal(by.total_sales.valueMinor, 170000);
  assert.equal(by.sales_count.value, 3);
  assert.equal(by.buying_cost.valueMinor, 111000);
  assert.equal(by.total_purchases.valueMinor, 300000);
  assert.equal(by.purchase_count.value, 1);
  assert.equal(by.total_expenses.valueMinor, 2684500);
  assert.equal(by.expense_count.value, 2);
  console.log("ok - type separation + COGS isolation + counts");
}

// 2. Product performance: revenue rank, units, profit honesty.
{
  const perf = A.buildProductPerformance(TXNS.filter((t) => t.type === "sale"), 5);
  assert.equal(perf[0].name, "Rice");
  assert.equal(perf[0].revenue, 150000);
  assert.ok(perf.every((p) => p.hasCostEvidence));
  const noCost = [T({ id: "x1", type: "sale", date: "2026-10-31T10:00", category: "G", product: "NoCost", qty: 1, unit: 10000, amount: 10000 })];
  const pkg = Dims.toolProducts(ctx(noCost));
  assert.ok(pkg.warnings.some((w) => /profit unavailable/i.test(w)));
  const qtyPkg = Dims.toolTopProductByQty(ctx(TXNS));
  assert.equal(qtyPkg.items[0].dimensions.product, "Milk");
  assert.equal(qtyPkg.items[0].value, 5);
  const noQty = [T({ id: "x2", type: "sale", date: "2026-10-31T10:00", category: "G", product: "Q", amount: 10000 })];
  assert.ok(Dims.toolTopProductByQty(ctx(noQty)).warnings[0].includes("never defaulted"));
  console.log("ok - product performance + units + profit honesty");
}

// 3. Category performance: types never mixed; contribution within type.
{
  const rows = A.buildCategoryBreakdown(TXNS);
  const saleRows = rows.filter((r) => r.type === "sale");
  const purchRows = rows.filter((r) => r.type === "purchase");
  assert.ok(saleRows.length > 0 && purchRows.length > 0);
  const saleTotal = saleRows.reduce((s, r) => s + r.total, 0);
  const groceries = saleRows.find((r) => r.category === "Groceries");
  assert.ok(Math.abs((groceries.total / saleTotal) * 100 - groceries.sharePct) < 1e-9);
  assert.ok(!rows.some((r) => r.category === "Groceries" && r.type !== "sale"));
  const pkg = Dims.toolCategories(ctx(TXNS));
  assert.ok(pkg.items.every((i) => /\(sale\)|\(purchase\)|\(expense\)/.test(i.label)));
  console.log("ok - category type separation + contribution");
}

// 4. Channel performance + missing-data honesty + adapter passthrough.
{
  const rows = A.buildChannelSplit(TXNS.filter((t) => t.type === "sale"));
  const walk = rows.find((r) => r.channel === "Walk-in");
  assert.equal(walk.count, 2);
  const missing = rows.find((r) => r.missing);
  assert.ok(missing && missing.channel === "Unspecified/missing");
  // Full-history range (includes s0 with no channel) warns about incomplete
  // coverage; the narrow Oct 25–31 range has full channel coverage and warns
  // about nothing. Both are asserted to pin the honesty behavior.
  const fullPkg = Dims.toolChannels(ctx(TXNS, { start: "2026-10-01", end: "2026-10-31" }));
  assert.ok(fullPkg.warnings.some((w) => /incomplete/i.test(w)));
  assert.ok(fullPkg.items.some((i) => i.dimensions.channel === "Unspecified/missing"));
  const pkg = Dims.toolChannels(ctx(TXNS));
  assert.ok(!pkg.warnings.some((w) => /incomplete/i.test(w)));
  assert.ok(!pkg.items.some((i) => i.dimensions.channel === "UPI"));
  const mkLive = (channel) => ({
    id: "abcdefgh", business_id: "b", transaction_type: "sale",
    transaction_date: "2026-10-31", description: null, category_id: null,
    counterparty_name: null, channel, payment_method: "UPI",
    currency_code: "INR", subtotal_minor: 100, discount_minor: 0,
    tax_total_minor: 0, total_minor: 100, buying_cost_total_minor: 0,
    gross_profit_minor: 0, status: "x", source: "y",
  });
  const mapped = Adapter.liveToMockTransactions([mkLive("  Swiggy  ")], new Map(), "INR", TZ);
  assert.equal(mapped[0].channel, "Swiggy");
  const blank = Adapter.liveToMockTransactions([mkLive(null)], new Map(), "INR", TZ);
  assert.equal(blank[0].channel, undefined);
  console.log("ok - channels + missing honesty + adapter");
}

// 5. Period comparisons: both values + diff + pct; zero-prev; empty periods.
{
  const cur = { revenue: 170000, cogs: 111000, gross: 59000, purchases: 300000, expenses: 2684500, net: 59000 - 2684500, count: 6 };
  const prev = { revenue: 50000, cogs: 30000, gross: 20000, purchases: 0, expenses: 0, net: 20000, count: 1 };
  const rows = A.compareTotals(cur, prev);
  const rev = rows.find((r) => r.metric === "revenue");
  assert.equal(rev.current, 170000);
  assert.equal(rev.previous, 50000);
  assert.equal(rev.diff, 120000);
  assert.equal(rev.pct, 240);
  const purch = rows.find((r) => r.metric === "purchases");
  assert.equal(purch.pct, null);
  const pkg = Trends.toolCompare(ctx(TXNS, { start: "2026-10-25", end: "2026-10-31" }));
  const revItem = pkg.items.find((i) => i.metric === "compare_revenue");
  assert.ok(revItem.comparison && revItem.comparison.currentMinor === 170000);
  assert.ok(revItem.dimensions.prevStart && revItem.dimensions.pct !== undefined);
  const emptyPrev = Trends.toolCompare(ctx(TXNS, { start: "2026-09-01", end: "2026-09-02" }));
  assert.ok(emptyPrev.items.every((i) => i.comparison.pct === null));
  assert.ok(emptyPrev.warnings.some((w) => /current period/i.test(w)));
  const dimRows = A.compareDimMaps(new Map([["Rice", 100000]]), new Map());
  assert.equal(dimRows[0].previous, 0);
  assert.equal(dimRows[0].pct, null);
  console.log("ok - comparisons + zero-prev + empty periods");
}

// 6. Dimension comparisons + declining products.
{
  const prev = { start: "2026-10-18", end: "2026-10-24" };
  const txns = [
    T({ id: "a1", type: "sale", date: "2026-10-31T10:00", category: "G", product: "Rice", qty: 1, unit: 50000, amount: 50000 }),
    T({ id: "a2", type: "sale", date: "2026-10-20T10:00", category: "G", product: "Rice", qty: 4, unit: 50000, amount: 200000 }),
  ];
  const pkg = Trends.toolCompareDimension(ctx(txns), "product", prev);
  const rice = pkg.items.find((i) => i.dimensions.product === "Rice");
  assert.equal(rice.comparison.currentMinor, 50000);
  assert.equal(rice.comparison.previousMinor, 200000);
  assert.equal(rice.comparison.diffMinor, -150000);
  assert.ok(rice.comparison.pct < 0);
  console.log("ok - dimension comparison + decline");
}

// 7. Timezone + date boundaries (inclusive) + tenant isolation shape.
{
  const tzTxns = [T({ id: "z1", type: "sale", date: "2026-10-31T00:30", category: "G", amount: 10000 })];
  const inDay = A.filterByRange(tzTxns, { start: "2026-10-31", end: "2026-10-31" }, TZ);
  assert.equal(inDay.length, 1);
  const outDay = A.filterByRange(tzTxns, { start: "2026-10-30", end: "2026-10-30" }, TZ);
  assert.equal(outDay.length, 0);
  const mkScope = (bid) => ({ transactions: TXNS, scope: { businessId: bid, businessName: bid, currency: "INR", timezone: TZ }, range: RANGE, preset: "Custom", nowIso: "2026-11-02T00:00:00.000Z" });
  const a = Tools.toolBusinessOverview(mkScope("biz-a")).pkg;
  const b = Tools.toolBusinessOverview(mkScope("biz-b")).pkg;
  assert.equal(a.items[0].businessScope.businessId, "biz-a");
  assert.equal(b.items[0].businessScope.businessId, "biz-b");
  console.log("ok - timezone boundaries + tenant scoping");
}

// 8. Evidence consistency + validation + routing.
{
  const pkg = Trends.toolCompare(ctx(TXNS));
  for (const i of pkg.items) {
    assert.ok(i.id && i.metric && i.label && i.timeframe.start && i.businessScope.businessId && i.calculation && i.completeness !== undefined);
    assert.ok(i.source === "deterministic");
  }
  const zeroPkg = Trends.toolCompare(ctx(TXNS, { start: "2026-09-01", end: "2026-09-02" }));
  const w2 = Val.validateAnswer("Sales grew +100% vs last month.", zeroPkg);
  assert.ok(w2.some((w) => /% change is unavailable/i.test(w)));
  assert.equal(Orch.detectMetricIntent("compare product performance across two periods"), "product");
  assert.equal(Orch.detectMetricIntent("which products declined?"), "product");
  assert.equal(Orch.detectMetricIntent("sales by channel vs last month"), "channel");
  assert.equal(Orch.detectMetricIntent("this week vs previous week sales"), "comparison");
  const c = ctx(TXNS);
  assert.equal(Sel.selectEvidence("channel", "sales by channel", c).intent, "channel");
  assert.ok(Sel.selectEvidence("product", "compare product performance across two periods", c).items[0].metric.startsWith("compare_"));
  assert.ok(Sel.selectEvidence("comparison", "this week vs previous week sales", c).items[0].metric.startsWith("compare_"));
  console.log("ok - evidence consistency + validation + routing");
}

// 9. Deterministic fallback shape (no AI): degraded reply stays evidence-backed.
{
  const pkg = Dims.toolChannels(ctx(TXNS));
  const reply = Val.degradedReply("channel", pkg, "Biz A");
  assert.ok(reply.includes("Biz A") && pkg.items.length > 0);
  console.log("ok - deterministic fallback");
}

console.log("ALL SLICE 3 CHECKS PASSED");
