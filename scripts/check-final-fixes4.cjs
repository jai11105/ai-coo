// FINAL FIXES part 4 (mocked): cases 7-10 evidence + markdown + truncation.
const assert = require("node:assert/strict");
process.env.META_API_KEY = "test-meta-key";
process.env.FIREWORKS_API_KEY = "test-fw-key";
process.env.BASETEN_API_KEY = "test-bt-key";
process.env.BASETEN_BASE_URL = "https://inference.baseten.co/v1";
process.env.BASETEN_MUSE_SPARK_MODEL_ID = "meta-models/muse-spark-open-1026";
const Orch = require("../lib/ai/orchestrate.ts");
function T(o) { return { id: o.id, type: o.type, date: o.date, category: o.category, product: o.product, qty: o.qty, unitPriceMinor: o.unit, buyingCostMinor: o.cost, buyingCostTotalMinor: o.costTotal, party: "P", amountMinor: o.amount, currency: "INR", paymentMethod: "UPI", reference: o.id, notes: undefined }; }
const TZ = "Asia/Kolkata";
const TXNS = [ T({ id: "s1", type: "sale", date: "2026-10-20T10:00", category: "G", product: "Rice", qty: 2, unit: 50000, cost: 30000, costTotal: 60000, amount: 100000 }), T({ id: "s2", type: "sale", date: "2026-09-10T10:00", category: "G", product: "Rice", qty: 3, unit: 50000, cost: 30000, costTotal: 90000, amount: 150000 }), T({ id: "p1", type: "purchase", date: "2026-10-21T11:00", category: "G", product: "Rice", qty: 5, unit: 30000, amount: 150000 }), T({ id: "e1", type: "expense", date: "2026-10-22T12:00", category: "Rent", qty: 1, unit: 20000, amount: 20000 }) ];
const realFetch = globalThis.fetch;
function jsonRes(obj) { return new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } }); }
function fullAnswer(c) { return { choices: [{ message: { content: c }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 80 } }; }
const SUM_JSON = JSON.stringify({ resolvedIntent: "summary", metric: "overview", entityType: null, entity: null, timeframePreset: null, comparisonRequested: false, comparisonType: null, analysisType: null, requiresClarification: false, clarificationQuestion: null, contextUpdates: {} });
(async () => {
  const base = { businessId: "biz-t", businessName: "T Biz", currency: "INR", timezone: TZ, userId: "u1", conversationId: "fx", transactions: TXNS, dataVersion: "v1" };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = JSON.parse(String((init && init.body) || "{}"));
    if (u.includes("fireworks")) return jsonRes(fullAnswer("Fallback."));
    const dump = JSON.stringify(body.messages || "") + JSON.stringify(body);
    if (/structured JSON/i.test(dump)) return jsonRes({ choices: [{ message: { content: SUM_JSON } }] });
    const hasH = (body.messages || []).some((mm) => mm.role === "tool");
    if ((body.tools || []).length > 0 && !hasH) return jsonRes({ choices: [{ message: { content: "", tool_calls: [{ id: "c1", function: { name: "get_business_overview", arguments: "{}" } }] } }] });
    return jsonRes(fullAnswer("Here is your summary for This Month. Totals verified across all records [sales.total.abc.xyz] [] and the breakdown (provider: meta) is shown above."));
  };
  const r6 = await Orch.orchestrate({ ...base, conversationId: "p4a" + Date.now(), message: "give me summary" });
  assert.ok(!/\[\]/.test(r6.answer), "no empty brackets");
  assert.ok(!/sales\.total\.abc\.xyz/i.test(r6.answer), "no raw ids");
  assert.ok(r6.evidence.length > 0, "linkage retained");
  assert.ok(!/provider:\s*meta/i.test(r6.answer), "no provider leak");
  console.log("ok - 7/8 evidence refs hidden, linkage kept");
  globalThis.fetch = realFetch;
  console.log("PART4A PASSED");
})().catch((e) => { globalThis.fetch = realFetch; console.error(e); process.exit(1); });

