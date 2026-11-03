// Focused Revenue Trend check: custom 2026-10-01 → 2026-11-02 (33 days),
// Asia/Kolkata. Models the AZ report (9 txns, Revenue KPI Rs.13,250).
// Fixtures are SYNTHETIC stand-ins for live Supabase rows (actual Nov 1
// records must be confirmed in browser); they pin the contract: every
// in-range sale lands in its own daily bucket and trend total == KPI.
// Also reproduces the Bars maxBars=31 downsampling defect (Nov 1 = index 31,
// dropped when step=2) and proves the maxBars=trend.length fix.
import { buildTrend, calcTotals, dayInTimezone, filterByRange, filterByScope } from "../lib/analytics";
import { liveToMockTransactions } from "../lib/live-adapter";
import type { LiveTransaction } from "../lib/supabase/workspace";

const TZ = "Asia/Kolkata";
const range = { start: "2026-10-01", end: "2026-11-02" };
let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}\n  expected: ${e}\n  actual:   ${a}`);
}
function mk(id: string, type: "sale" | "purchase" | "expense", date: string, totalMinor: number): LiveTransaction {
  return { id, business_id: "b1", transaction_type: type, transaction_date: date, description: null, category_id: null, counterparty_name: "p", channel: null, payment_method: "UPI", currency_code: "INR", subtotal_minor: totalMinor, discount_minor: 0, tax_total_minor: 0, total_minor: totalMinor, buying_cost_total_minor: type === "sale" ? 0 : null, gross_profit_minor: null, status: "confirmed", source: "manual" };
}
// 7 sales = Rs.13,250 (matches reported KPI) + 1 purchase + 1 expense = 9 txns.
const rows = [
  mk("s1", "sale", "2026-10-05", 200000),
  mk("s2", "sale", "2026-10-12", 150000),
  mk("s3", "sale", "2026-10-20", 300000),
  mk("s4", "sale", "2026-10-28", 225000),
  mk("s5", "sale", "2026-10-31", 100000),
  mk("s6", "sale", "2026-11-01", 250000),
  mk("s7", "sale", "2026-11-01T14:30", 100000),
  mk("p1", "purchase", "2026-10-15", 500000),
  mk("e1", "expense", "2026-11-02", 75000),
];
const mapped = liveToMockTransactions(rows, new Map(), "INR", TZ);
check("mapped count", mapped.length, 9);
const inRange = filterByRange(mapped, range, TZ);
check("in-range count (end inclusive)", inRange.length, 9);
check("date-only Nov 1", dayInTimezone("2026-11-01", TZ), "2026-11-01");
check("local-datetime Nov 1", dayInTimezone("2026-11-01T14:30", TZ), "2026-11-01");
check("UTC-midnight in IST", dayInTimezone("2026-10-31T18:30:00Z", TZ), "2026-11-01");
const trend = buildTrend(filterByScope(inRange, "All"), range, TZ);
check("bucket count (33 days)", trend.length, 33);
const bucket = (day: string) => trend.find((t) => t.day === day)?.revenue;
check("Oct 31 bucket", bucket("2026-10-31"), 100000);
check("Nov 1 bucket (own daily bucket)", bucket("2026-11-01"), 350000);
check("Nov 2 bucket", bucket("2026-11-02"), 0);
const trendTotal = trend.reduce((s, t) => s + t.revenue, 0);
const kpiRevenue = calcTotals(filterByScope(inRange, "All")).revenue;
check("trend total == KPI revenue (Rs.13,250)", [trendTotal, kpiRevenue], [1325000, 1325000]);
// Mirror of components/charts.tsx Bars downsampling logic.
const sampled = (n: number, max: number) => { const s = Math.max(1, Math.ceil(n / max)); return Array.from({ length: n }, (_, i) => i).filter((i) => i % s === 0); };
const dropped31 = sampled(33, 31).includes(31);
check("BUG repro: maxBars=31 drops index 31 (Nov 1)", dropped31, false);
check("FIX: maxBars=33 keeps index 31 (Nov 1)", sampled(33, 33).includes(31), true);
if (failures > 0) { console.error(`\n${failures} FAILED`); process.exit(1); }
console.log("\nAll revenue-trend checks passed.");
