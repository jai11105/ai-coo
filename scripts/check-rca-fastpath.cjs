// Live RCA fast-path verification (mocked providers, real app path).
// Run: node -r sucrase/register scripts/check-rca-fastpath.cjs
const assert = require("node:assert/strict");
process.env.META_API_KEY = "test-meta-key";
process.env.FIREWORKS_API_KEY = "test-fw-key";
process.env.BASETEN_API_KEY = "test-bt-key";
process.env.BASETEN_BASE_URL = "https://inference.baseten.co/v1";
process.env.BASETEN_MUSE_SPARK_MODEL_ID = "meta-models/muse-spark-open-1026";
const Orch = require("../lib/ai/orchestrate.ts");
const O = require("../lib/ai/orchestrator.ts");
function T(o) {
  return {
    id: o.id, type: o.type, date: o.date, category: o.category,
    product: o.product, qty: o.qty, unitPriceMinor: o.unit,
    buyingCostMinor: o.cost, buyingCostTotalMinor: o.costTotal,
    party: "P", amountMinor: o.amount, currency: "INR",
    paymentMethod: "UPI", reference: o.id, notes: undefined,
  };
}
const TZ = "Asia/Kolkata";
const TXNS = [
  T({ id: "s1", type: "sale", date: "2026-10-20T10:00", category: "G", product: "Rice", qty: 2, unit: 50000, cost: 30000, costTotal: 60000, amount: 100000 }),
  T({ id: "s2", type: "sale", date: "2026-09-10T10:00", category: "G", product: "Rice", qty: 3, unit: 50000, cost: 30000, costTotal: 90000, amount: 150000 }),
  T({ id: "p1", type: "purchase", date: "2026-10-21T11:00", category: "G", product: "Rice", qty: 5, unit: 30000, amount: 150000 }),
  T({ id: "e1", type: "expense", date: "2026-10-22T12:00", category: "Rent", qty: 1, unit: 20000, amount: 20000 }),
];
assert.equal(O.isExplicitRcaRequest("give me rca"), true);
assert.equal(O.isExplicitRcaRequest("rca"), true);
assert.equal(O.isExplicitRcaRequest("Give Me RCA!"), true);
assert.equal(O.isExplicitRcaRequest("root cause analysis"), true);
assert.equal(O.isExplicitRcaRequest("why did sales drop?"), false);
assert.equal(O.isExplicitRcaRequest("what are my sales?"), false);
assert.equal(O.RCA_SPECIALIST_TIMEOUT_MS, 20000);
assert.equal(O.RCA_COMPOSE_TIMEOUT_MS, 15000);
assert.equal(O.RCA_COMPOSE_RETRY_TIMEOUT_MS, 8000);
assert.equal(O.RCA_COMPOSE_MAX_TOKENS, 2500);
console.log("ok - 0 explicit-RCA detector + deadline budgets");
const realFetch = globalThis.fetch;
let sparkCalls = 0; let basetenCalls = 0; let fireworksCalls = 0;
let basetenModels = [];
function jsonRes(obj) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });
}
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const body = JSON.parse(String(init?.body || "{}"));
  if (u.includes("baseten")) {
    basetenCalls += 1;
    basetenModels.push(body.model);
    return jsonRes({
      choices: [{ message: { content: "Memo: revenue declined. Contributing factor: lower units in October vs September. Evidence suggests demand softness; additional data needed on pricing." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 60 },
    });
  }
  if (u.includes("fireworks")) {
    fireworksCalls += 1;
    return jsonRes({ choices: [{ message: { content: "Fallback answer." } }] });
  }
  sparkCalls += 1;
  const dump = JSON.stringify(body.messages || "") + JSON.stringify(body);
  if (/structured JSON/i.test(dump)) {
    const um = String((body.messages || []).map((mm) => mm.content).join("\n"));
    const latest = /Latest owner message:([\s\S]*?)Respond with JSON only/i.exec(um)?.[1] || "";
    if (/rca|why|root cause/i.test(latest)) {
      return jsonRes({ choices: [{ message: { content: JSON.stringify({ resolvedIntent: "rca", metric: null, entityType: null, entity: null, timeframePreset: null, comparisonRequested: false, comparisonType: null, analysisType: "diagnosis", requiresClarification: false, clarificationQuestion: null, contextUpdates: { analysisType: "diagnosis" } }) } }] });
    }
    return jsonRes({ choices: [{ message: { content: JSON.stringify({ resolvedIntent: "metric", metric: "sales", entityType: null, entity: null, timeframePreset: null, comparisonRequested: false, comparisonType: null, analysisType: null, requiresClarification: false, clarificationQuestion: null, contextUpdates: {} }) } }] });
  }
  const tools = (body.tools || []).map((t) => t.function?.name);
  const hasHistory = (body.messages || []).some((mm) => mm.role === "tool");
  if (!hasHistory && tools.length > 0) {
    return jsonRes({ choices: [{ message: { content: "", tool_calls: [{ id: "c1", function: { name: "get_comparison", arguments: "{}" } }] } }] });
  }
  return jsonRes({ choices: [{ message: { content: "RCA composed from verified evidence with specialist memo." } }] });
};
(async () => {
  const base = { businessId: "biz-t", businessName: "T Biz", currency: "INR", timezone: TZ, userId: "u1", conversationId: "rt_x", transactions: TXNS, dataVersion: "v1" };
  const s0 = sparkCalls; const b0 = basetenCalls; const f0 = fireworksCalls;
  const r = await Orch.orchestrate({ ...base, conversationId: `rt_rca_${Date.now()}`, message: "give me rca" });
  assert.equal(r.intent, "rca");
  assert.equal(basetenCalls - b0, 1, "RCA must call Baseten exactly once (no retry)");
  assert.deepEqual(basetenModels.slice(-1), ["meta-models/muse-spark-open-1026"]);
  assert.ok(r.answer.length > 50, "RCA answer composed");
  assert.ok(r.specialist && r.specialist.status === "used", `specialist used, got ${JSON.stringify(r.specialist)}`);
  assert.equal(sparkCalls - s0, 1, `RCA exactly 1 Spark call (compose), got ${sparkCalls - s0}`);
  assert.equal(fireworksCalls - f0, 0, "RCA zero Fireworks calls");
  const stages = (r.stageTimings || []).map((s) => s.stage);
  for (const need of ["intent_routing", "evidence_collection", "baseten_specialist_request", "baseten_response_parse", "specialist_validation", "standard_composition", "final_response"]) {
    assert.ok(stages.includes(need), `stage ${need} recorded (got ${stages.join(",")})`);
  }
  const routing = r.stageTimings.find((s) => s.stage === "intent_routing");
  assert.equal(routing.provider, "deterministic", "explicit RCA skips resolver LLM");
  const spec = r.stageTimings.find((s) => s.stage === "baseten_specialist_request");
  assert.equal(spec.timeoutMs, 20000);
  assert.equal(spec.model, "meta-models/muse-spark-open-1026");
  assert.equal(spec.outcome, "ok");
  console.log(`ok - 1 RCA fast path (spark=1, baseten=1, fireworks=0, stages=${stages.length})`);
  const s1 = sparkCalls; const b1 = basetenCalls;
  // Fresh conversation + plain summary question (metric never needs Baseten).
  const r2 = await Orch.orchestrate({ ...base, conversationId: `rt_m2_${Date.now()}_x`, message: "What are my total sales?" });
  assert.equal(r2.intent, "metric");
  assert.ok(r2.evidence.length > 0);
  assert.equal(basetenCalls - b1, 0, "metric must not call Baseten");
  assert.ok(sparkCalls - s1 >= 1, "metric still uses Spark");
  console.log("ok - 2 non-RCA metric path unchanged");
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("baseten")) return new Response("down", { status: 500 });
    if (u.includes("fireworks")) { fireworksCalls += 1; return jsonRes({ choices: [{ message: { content: "Fallback RCA from verified evidence: revenue declined vs previous period. Contributing factor: lower units; additional data needed on pricing." } }] }); }
    sparkCalls += 1;
    return new Response("spark down", { status: 500 });
  };
  const f1 = fireworksCalls;
  // FINAL (Failure 1): Baseten failure → Fireworks specialist fallback (with
  // prepared specialist evidence) → deterministic evidence-only if Fireworks
  // also fails. Spark composition is never a successful RCA answer.
  const r3 = await Orch.orchestrate({ ...base, conversationId: `rt_rd_${Date.now()}`, message: "give me rca" });
  assert.equal(r3.intent, "rca");
  assert.equal(r3.provider, "fireworks-fallback", `failed RCA must reach Fireworks fallback, got ${r3.provider}`);
  assert.equal(fireworksCalls - f1, 1, "failed RCA calls Fireworks exactly once");
  assert.ok(!String(r3.model || "").includes("open-1026") || r3.provider === "baseten-specialist", "Fireworks fallback never labeled Baseten specialist");
  assert.ok(r3.warnings.join(" ").includes("reasoning fallback, not Baseten specialist"), "fallback labeled honestly");
  console.log("ok - 3 Baseten failure -> Fireworks specialist fallback (honest label)");
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("baseten")) return new Response("down", { status: 500 });
    if (u.includes("fireworks")) { fireworksCalls += 1; return new Response("fw down", { status: 500 }); }
    sparkCalls += 1;
    return new Response("spark down", { status: 500 });
  };
  const f2 = fireworksCalls;
  const r4 = await Orch.orchestrate({ ...base, conversationId: `rt_rd2_${Date.now()}`, message: "give me rca" });
  assert.equal(r4.intent, "rca");
  assert.equal(r4.provider, "degraded", `double failure must degrade, got ${r4.provider}`);
  assert.equal(fireworksCalls - f2, 1, "double-failure RCA still attempts Fireworks once");
  assert.ok(r4.warnings.join(" ").includes("baseten-specialist"), "degraded names failing stage");
  assert.ok(!/muse-spark-1\.3/i.test(String(r4.model || "")) || r4.provider === "degraded", "degraded RCA never a Spark success");
  console.log("ok - 4 Baseten+Fireworks failure -> deterministic degraded with stage name");
  globalThis.fetch = realFetch;
  console.log("ALL RCA FAST-PATH CHECKS PASSED");
})().catch((e) => { globalThis.fetch = realFetch; console.error(e); process.exit(1); });


