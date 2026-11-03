// FINAL FIXES RCA routing (mocked): cases 1-2.
const assert = require("node:assert/strict");
process.env.META_API_KEY = "test-meta-key";
process.env.FIREWORKS_API_KEY = "test-fw-key";
process.env.BASETEN_API_KEY = "test-bt-key";
process.env.BASETEN_BASE_URL = "https://inference.baseten.co/v1";
process.env.BASETEN_MUSE_SPARK_MODEL_ID = "meta-models/muse-spark-open-1026";
const Orch = require("../lib/ai/orchestrate.ts");
const O = require("../lib/ai/orchestrator.ts");
function T(o) { return { id: o.id, type: o.type, date: o.date, category: o.category, product: o.product, qty: o.qty, unitPriceMinor: o.unit, buyingCostMinor: o.cost, buyingCostTotalMinor: o.costTotal, party: "P", amountMinor: o.amount, currency: "INR", paymentMethod: "UPI", reference: o.id, notes: undefined }; }
const TZ = "Asia/Kolkata";
const TXNS = [ T({ id: "s1", type: "sale", date: "2026-10-20T10:00", category: "G", product: "Rice", qty: 2, unit: 50000, cost: 30000, costTotal: 60000, amount: 100000 }), T({ id: "s2", type: "sale", date: "2026-09-10T10:00", category: "G", product: "Rice", qty: 3, unit: 50000, cost: 30000, costTotal: 90000, amount: 150000 }), T({ id: "p1", type: "purchase", date: "2026-10-21T11:00", category: "G", product: "Rice", qty: 5, unit: 30000, amount: 150000 }), T({ id: "e1", type: "expense", date: "2026-10-22T12:00", category: "Rent", qty: 1, unit: 20000, amount: 20000 }) ];
const realFetch = globalThis.fetch;
let basetenCalls = 0;
function jsonRes(obj) { return new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } }); }
function fullAnswer(c) { return { choices: [{ message: { content: c }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 80 } }; }
const RCAJ = JSON.stringify({ resolvedIntent: "rca", metric: null, entityType: null, entity: null, timeframePreset: null, comparisonRequested: false, comparisonType: null, analysisType: "diagnosis", requiresClarification: false, clarificationQuestion: null, contextUpdates: { analysisType: "diagnosis" } });
const MEMO = "Memo: revenue declined. Contributing factor: lower units. Evidence suggests softness; additional data needed.";
(async () => {
  const base = { businessId: "biz-t", businessName: "T Biz", currency: "INR", timezone: TZ, userId: "u1", conversationId: "fx", transactions: TXNS, dataVersion: "v1" };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = JSON.parse(String((init && init.body) || "{}"));
    if (u.includes("baseten")) { basetenCalls += 1; return jsonRes({ choices: [{ message: { content: MEMO }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 60 } }); }
    if (u.includes("fireworks")) return jsonRes(fullAnswer("Fallback."));
    const dump = JSON.stringify(body.messages || "") + JSON.stringify(body);
    if (/structured JSON/i.test(dump)) {
      const um = String((body.messages || []).map((mm) => mm.content).join("\n"));
      const latest = /Latest owner message:([\s\S]*?)Respond with JSON only/i.exec(um)?.[1] || "";
      if (/rca|why|root cause|loss/i.test(latest)) return jsonRes({ choices: [{ message: { content: RCAJ } }] });
      return jsonRes({ choices: [{ message: { content: RCAJ } }] });
    }
    return jsonRes(fullAnswer("RCA composed from verified evidence with specialist memo."));
  };
  const b0 = basetenCalls;
  const r = await Orch.orchestrate({ ...base, conversationId: "fr1" + Date.now(), message: "give me rca" });
  assert.equal(r.intent, "rca");
  assert.equal(basetenCalls - b0, 1, "Baseten once");
  assert.ok(r.specialist && r.specialist.status === "used", "used");
  console.log("ok - 1 give me rca -> Baseten specialist route");
  assert.equal(O.detectMetricIntent("why am I making a loss?"), "rca");
  const b1 = basetenCalls;
  const r2 = await Orch.orchestrate({ ...base, conversationId: "fr2" + Date.now(), message: "why am I making a loss?" });
  assert.equal(r2.intent, "rca");
  assert.equal(basetenCalls - b1, 1, "loss RCA Baseten once");
  console.log("ok - 2 why am I making a loss? -> Baseten RCA route");
  globalThis.fetch = realFetch;
  console.log("RCA PART PASSED");
})().catch((e) => { globalThis.fetch = realFetch; console.error(e); process.exit(1); });

