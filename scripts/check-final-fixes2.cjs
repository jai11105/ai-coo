// FINAL FIXES regression part 2 (mocked, no network): cases 3-6.
const assert = require("node:assert/strict");
process.env.META_API_KEY = "test-meta-key";
process.env.FIREWORKS_API_KEY = "test-fw-key";
process.env.BASETEN_API_KEY = "test-bt-key";
process.env.BASETEN_BASE_URL = "https://inference.baseten.co/v1";
process.env.BASETEN_MUSE_SPARK_MODEL_ID = "meta-models/muse-spark-open-1026";
const Orch = require("../lib/ai/orchestrate.ts");
const V = require("../lib/ai/validate.ts");
function T(o) { return { id: o.id, type: o.type, date: o.date, category: o.category, product: o.product, qty: o.qty, unitPriceMinor: o.unit, buyingCostMinor: o.cost, buyingCostTotalMinor: o.costTotal, party: "P", amountMinor: o.amount, currency: "INR", paymentMethod: "UPI", reference: o.id, notes: undefined }; }
const TZ = "Asia/Kolkata";
const TXNS = [ T({ id: "s1", type: "sale", date: "2026-10-20T10:00", category: "G", product: "Rice", qty: 2, unit: 50000, cost: 30000, costTotal: 60000, amount: 100000 }), T({ id: "s2", type: "sale", date: "2026-09-10T10:00", category: "G", product: "Rice", qty: 3, unit: 50000, cost: 30000, costTotal: 90000, amount: 150000 }), T({ id: "p1", type: "purchase", date: "2026-10-21T11:00", category: "G", product: "Rice", qty: 5, unit: 30000, amount: 150000 }), T({ id: "e1", type: "expense", date: "2026-10-22T12:00", category: "Rent", qty: 1, unit: 20000, amount: 20000 }) ];
const realFetch = globalThis.fetch;
let fireworksCalls = 0;
function jsonRes(obj) { return new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } }); }
function fullAnswer(c) { return { choices: [{ message: { content: c }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 80 } }; }
const SUMT = "Here is your complete summary for This Month. Total sales were verified across 2 transactions with gross and net profit broken out; see the figures above for the full breakdown.";
(async () => {
  const base = { businessId: "biz-t", businessName: "T Biz", currency: "INR", timezone: TZ, userId: "u1", conversationId: "fx", transactions: TXNS, dataVersion: "v1" };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("baseten")) return new Response("down", { status: 500 });
    if (u.includes("fireworks")) { fireworksCalls += 1; return jsonRes(fullAnswer("Fallback RCA from verified evidence: revenue declined vs previous period. Contributing factor: lower units; additional data needed.")); }
    return new Response("spark down", { status: 500 });
  };
  const f0 = fireworksCalls;
  const r3 = await Orch.orchestrate({ ...base, conversationId: "p2a" + Date.now(), message: "give me rca" });
  assert.equal(r3.intent, "rca");
  assert.equal(r3.provider, "fireworks-fallback", "got " + r3.provider);
  assert.equal(fireworksCalls - f0, 1);
  console.log("ok - 3 Baseten failure -> Fireworks fallback (honest label)");
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("baseten")) return new Response("down", { status: 500 });
    if (u.includes("fireworks")) { fireworksCalls += 1; return new Response("fw down", { status: 500 }); }
    return new Response("spark down", { status: 500 });
  };
  const f1 = fireworksCalls;
  const r4 = await Orch.orchestrate({ ...base, conversationId: "p2b" + Date.now(), message: "give me rca" });
  assert.equal(r4.provider, "degraded", "got " + r4.provider);
  assert.equal(fireworksCalls - f1, 1);
  assert.ok(r4.warnings.join(" ").includes("baseten-specialist"), "names stage");
  console.log("ok - 3b double failure -> deterministic degraded");
  globalThis.fetch = realFetch;
  console.log("PART2 PASSED");
})().catch((e) => { globalThis.fetch = realFetch; console.error(e); process.exit(1); });

