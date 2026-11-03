// Deterministic Dashboard verification (Asia/Kolkata, now=2026-11-01 12:00 IST).
import {
  ANCHOR_TODAY,
  buildKpis,
  buildTopProducts,
  calcTotals,
  compareRange,
  dayInTimezone,
  filterByRange,
  pctChange,
  resolveRange,
  resolveRangeInTimezone,
  todayInTimezone,
} from "../lib/analytics";
import type { MockTransaction } from "../lib/types";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-11-01T06:30:00.000Z");
let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}\n  expected: ${e}\n  actual:   ${a}`);
}
console.log(`anchor=${ANCHOR_TODAY} todayIST=${todayInTimezone(TZ, NOW)}`);
const custom = { start: "2026-10-30", end: "2026-11-01" };
check("Today IST", resolveRangeInTimezone("Today", custom, TZ, NOW), { start: "2026-11-01", end: "2026-11-01" });
check("Yesterday IST", resolveRangeInTimezone("Yesterday", custom, TZ, NOW), { start: "2026-10-31", end: "2026-10-31" });
check("This Week IST", resolveRangeInTimezone("This Week", custom, TZ, NOW), { start: "2026-10-26", end: "2026-11-01" });
check("This Month IST", resolveRangeInTimezone("This Month", custom, TZ, NOW), { start: "2026-11-01", end: "2026-11-01" });
check("Last Month IST", resolveRangeInTimezone("Last Month", custom, TZ, NOW), { start: "2026-10-01", end: "2026-10-31" });
check("Custom exact", resolveRangeInTimezone("Custom", custom, TZ, NOW), { start: "2026-10-30", end: "2026-11-01" });
const sample: MockTransaction[] = [
  { id: "a", type: "sale", date: "2026-10-30T10:00", category: "G", party: "p", amountMinor: 100, currency: "INR", paymentMethod: "UPI", reference: "r" },
  { id: "b", type: "sale", date: "2026-11-01", category: "G", party: "p", amountMinor: 200, currency: "INR", paymentMethod: "UPI", reference: "r" },
  { id: "c", type: "sale", date: "2026-11-01T00:00", category: "G", party: "p", amountMinor: 300, currency: "INR", paymentMethod: "UPI", reference: "r" },
];
check("boundary inclusion", filterByRange(sample, custom, TZ).map((t) => t.id).sort(), ["a", "b", "c"]);
check("UTC-midnight IST", dayInTimezone("2026-10-31T18:30:00Z", TZ), "2026-11-01");
check("UTC-midnight UTC", dayInTimezone("2026-10-31T18:30:00Z", "UTC"), "2026-10-31");
check("date-only verbatim", dayInTimezone("2026-11-01", TZ), "2026-11-01");
check("prev-period", compareRange(custom, "Previous Period"), { start: "2026-10-27", end: "2026-10-29" });
check("pct zero-prev", pctChange(1200000, 0), null);
check("pct zero-zero", pctChange(0, 0), null);
check("pct normal", pctChange(150, 100), 50);
check("pct neg-prev", pctChange(-26000, -10000), -160);
check("pct sign-flip", pctChange(5000, -10000), 150);
const sales: MockTransaction[] = [
  { id: "s1", type: "sale", date: "2026-10-30T10:00", category: "G", product: "dhal", qty: 2, party: "p", amountMinor: 800000, currency: "INR", paymentMethod: "UPI", reference: "r", buyingCostTotalMinor: 300000 },
  { id: "s2", type: "sale", date: "2026-11-01T10:00", category: "G", product: "rice", qty: 20, party: "p", amountMinor: 400000, currency: "INR", paymentMethod: "UPI", reference: "r", buyingCostTotalMinor: 100000 },
];
const curT = calcTotals([...sales,
  { id: "e1", type: "expense", date: "2026-10-31T10:00", category: "X", party: "p", amountMinor: 3400000, currency: "INR", paymentMethod: "UPI", reference: "r" },
]);
const kpis = buildKpis(curT, calcTotals([]), "All", "INR");
check("zero-prev deltas null", kpis.map((k) => k.deltaPct), [null, null, null, null, null]);
const ranked = buildTopProducts(sales, 5);
check("rice qty 20", ranked.find((p) => p.name === "rice")?.qty, 20);
check("dhal qty 2", ranked.find((p) => p.name === "dhal")?.qty, 2);
const legacy = buildTopProducts([
  { id: "s9", type: "sale", date: "2026-10-30T10:00", category: "G", product: "legacy", party: "p", amountMinor: 500000, currency: "INR", paymentMethod: "UPI", reference: "r" },
], 5);
check("missing qty null", legacy[0]?.qty, null);
check("demo anchor intact", resolveRange("This Month", custom), { start: "2026-10-01", end: "2026-10-31" });
if (failures > 0) { console.error(`\n${failures} FAILED`); process.exit(1); }
console.log("\nAll checks passed.");
