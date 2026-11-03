// Slice 4 checks: model-based follow-up context (no network).
// Run: node -r sucrase/register scripts/check-slice4.cjs
const assert = require("node:assert/strict");

const Ctx = require("../lib/ai/context.ts");
const F = require("../lib/ai/followup.ts");
const Orch = require("../lib/ai/orchestrator.ts");
const Sel = require("../lib/ai/select-evidence.ts");
const P = require("../lib/ai/prompts.ts");
const Val = require("../lib/ai/validate.ts");
const Prov = require("../lib/ai/providers.ts");

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
const TZ = "Asia/Kolkata";
function toolCtx(txns, range, preset) {
  return {
    transactions: txns,
    scope: { businessId: "biz-a", businessName: "Biz A", currency: "INR", timezone: TZ },
    range, preset, nowIso: "2026-11-02T00:00:00.000Z",
  };
}
const TXNS = [
  T({ id: "s1", type: "sale", date: "2026-10-31T10:00", category: "Groceries", product: "Rice", qty: 2, unit: 50000, cost: 30000, costTotal: 60000, amount: 100000, channel: "Walk-in" }),
  T({ id: "s2", type: "sale", date: "2026-09-28T11:00", category: "Groceries", product: "Rice", qty: 4, unit: 50000, cost: 30000, costTotal: 120000, amount: 200000, channel: "Walk-in" }),
];
function freshConv() {
  Ctx.clearAllConversations();
  return Ctx.getConversation(`c_${Math.random().toString(36).slice(2, 8)}`, "biz-a");
}

// 1. Metric continuity: timeframe-only follow-up preserves metric.
{
  const s = freshConv();
  s.activeMetric = "sales";
  s.timeframe = { start: "2026-10-01", end: "2026-10-31", preset: "This Month" };
  const r = F.mergeFallback("What about last month?", s);
  assert.equal(r.metric, "sales");
  assert.equal(r.timeframePreset, "Last Month");
  assert.equal(r.contextUpdates.timeframePreset, "Last Month");
  assert.equal(r.requiresClarification, false);
  console.log("ok - 1 metric continuity + timeframe-only update");
}

// 2. Entity continuity: pronoun resolves to stored entity.
{
  const s = freshConv();
  s.activeMetric = "products"; s.entityType = "product"; s.activeEntity = "Rice";
  const parsed = F.validateResolution({
    resolvedIntent: "rca", metric: "sales", entityType: "product", entity: "it",
    timeframePreset: null, comparisonRequested: false, comparisonType: null,
    analysisType: "diagnosis", requiresClarification: false, clarificationQuestion: null,
    contextUpdates: { analysisType: "diagnosis" },
  }, s);
  assert.ok(parsed && parsed.entity === "Rice" && parsed.entityType === "product");
  console.log("ok - 2 entity continuity / pronoun resolution");
}

// 3. Comparison follow-up keeps periods; fresh evidence retrieved.
{
  const s = freshConv();
  s.activeMetric = "sales";
  const r = F.mergeFallback("Compare both.", s);
  assert.equal(r.resolvedIntent, "comparison");
  assert.equal(r.comparisonRequested, true);
  assert.equal(r.metric, "sales");
  const rr = Orch.resolvePreset("Last Month", TZ);
  assert.equal(rr.preset, "Last Month");
  const pkg = Sel.selectEvidenceForResolution(
    { resolvedIntent: "comparison", metric: "sales", entityType: null, entity: null, timeframePreset: null, comparisonRequested: true, comparisonType: "previous_period", analysisType: "comparison", requiresClarification: false, clarificationQuestion: null, contextUpdates: { comparisonRequested: true }, method: "fallback" },
    "compare both", toolCtx(TXNS, rr.range, rr.preset), "Previous Period");
  assert.ok(pkg && pkg.items.length > 0 && pkg.items[0].comparison);
  console.log("ok - 3 period comparison + fresh evidence");
}

// 4-6. Diagnosis / recommendation / ambiguous follow-ups.
{
  const s = freshConv();
  s.activeMetric = "sales";
  const r = F.mergeFallback("Why did it decrease?", s);
  assert.equal(r.resolvedIntent, "rca");
  assert.equal(r.analysisType, "diagnosis");
  const r5 = F.mergeFallback("What should I do about it?", s);
  assert.equal(r5.resolvedIntent, "recommendation");
  assert.equal(r5.metric, "sales");
  const amb = F.mergeFallback("It?", freshConv());
  assert.equal(amb.requiresClarification, true);
  assert.ok((amb.clarificationQuestion || "").length > 10);
  console.log("ok - 4/5/6 diagnosis + recommendation + clarification");
}



// 7. Stale evidence prevention: refs unusable after timeframe/data change.
{
  const s = freshConv();
  s.timeframe = { start: "2026-10-01", end: "2026-10-31", preset: "This Month" };
  s.evidenceRefs = ["sales.total.x"];
  s.lastDataVersion = "v1"; s.lastEvidenceAt = Date.now();
  assert.deepEqual(Ctx.freshEvidenceRefs(s, "biz-a", "2026-10-01..2026-10-31", "v1"), ["sales.total.x"]);
  assert.deepEqual(Ctx.freshEvidenceRefs(s, "biz-a", "2026-09-01..2026-09-30", "v1"), []);
  assert.deepEqual(Ctx.freshEvidenceRefs(s, "biz-a", "2026-10-01..2026-10-31", "v2"), []);
  assert.deepEqual(Ctx.freshEvidenceRefs(s, "biz-B", "2026-10-01..2026-10-31", "v1"), []);
  console.log("ok - 7 stale evidence prevention");
}

// 8. Summarization + history budget: capped lines/chars, summary survives.
{
  const s = freshConv();
  s.activeMetric = "sales"; s.activeEntity = "Rice"; s.entityType = "product";
  s.timeframe = { start: "2026-10-01", end: "2026-10-31", preset: "This Month" };
  for (let i = 0; i < 30; i += 1) Ctx.appendTurn(s, i % 2 ? "assistant" : "user", `turn ${i} ` + "x".repeat(200));
  assert.ok(s.turns.length <= Ctx.MAX_TURNS);
  const h = Ctx.relevantHistory(s);
  assert.ok(h.lines.length <= Ctx.HISTORY_MAX_LINES);
  assert.ok(h.lines.join("\n").length <= Ctx.HISTORY_BUDGET_CHARS + 400);
  const sum = Ctx.summarizeConversation(s);
  assert.ok(sum.includes("sales") && sum.includes("This Month"));
  console.log("ok - 8 summarization + history budget");
}

// 9. Conversation + tenant isolation: no cross-talk.
{
  Ctx.clearAllConversations();
  const a = Ctx.getConversation("same", "biz-a");
  const b = Ctx.getConversation("same", "biz-b");
  a.activeMetric = "sales"; b.activeMetric = "expenses";
  assert.equal(Ctx.getConversation("same", "biz-a").activeMetric, "sales");
  assert.equal(Ctx.getConversation("same", "biz-b").activeMetric, "expenses");
  Ctx.updateState(a, { intent: "metric", metric: "sales" });
  assert.equal(b.activeMetric, "expenses");
  console.log("ok - 9 conversation + tenant isolation");
}

// 10. Resolver validation rejects bad schema (untrusted model output).
{
  const s = freshConv();
  assert.equal(F.validateResolution({ resolvedIntent: "nope" }, s), null);
  assert.equal(F.validateResolution({ resolvedIntent: "metric", metric: "DROP", contextUpdates: {} }, s), null);
  assert.equal(F.validateResolution({ resolvedIntent: "comparison", metric: null, comparisonRequested: true, contextUpdates: {} }, s), null);
  const badQ = F.validateResolution({ resolvedIntent: "metric", metric: "sales", requiresClarification: true, clarificationQuestion: "", contextUpdates: {} }, s);
  assert.equal(badQ, null);
  console.log("ok - 10 strict resolver validation");
}

// 11. Greetings + casual still resolve (API path) without business tools.
{
  const s = freshConv();
  s.activeMetric = "sales";
  assert.equal(F.mergeFallback("hi", s).resolvedIntent, "greeting");
  assert.equal(F.mergeFallback("thanks", s).resolvedIntent, "casual");
  const prompt = P.buildStandardPrompt({
    question: "hi", intent: "greeting", contextLines: [], evidence: null,
    businessLine: "Biz A", historyLines: [],
  });
  assert.ok(prompt.system.length > 50 && prompt.user.includes("hi"));
  console.log("ok - 11 greetings via API, no tools");
}

// 12. Resolver prompt strict JSON; degraded RCA/recommendation honest.
{
  const rp = P.buildFollowupResolverPrompt({ message: "What about last month?", stateSummary: "metric=sales", history: [] });
  assert.ok(rp.system.includes("JSON ONLY") && rp.user.includes("What about last month?"));
  assert.ok(/can't diagnose|couldn't pull/i.test(Val.degradedReply("rca", null, "Biz A")));
  assert.ok(/won't guess|recommendation/i.test(Val.degradedReply("recommendation", null, "Biz A")));
  console.log("ok - 12 prompts modular + honest degraded");
}

// 13. End-to-end multi-turn (mocked providers, no network).
(async () => {
  const { orchestrate } = require("../lib/ai/orchestrate.ts");
  process.env.META_API_KEY = process.env.META_API_KEY || "test-meta-key";
  process.env.META_BASE_URL = process.env.META_BASE_URL || "https://api.meta.ai/v1";
  process.env.META_MODEL_ID = process.env.META_MODEL_ID || "muse-spark-1.3";
  process.env.FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY || "test-fw-key";
  process.env.FIREWORKS_BASE_URL = process.env.FIREWORKS_BASE_URL || "https://api.fireworks.ai/inference/v1";
  process.env.FIREWORKS_MODEL_ID = process.env.FIREWORKS_MODEL_ID || "accounts/fireworks/models/muse-spark-open";
  const realFetch = globalThis.fetch;
  const jsonRes = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const RES = {
    base: { resolvedIntent: "metric", metric: "sales", entityType: null, entity: null, timeframePreset: "This Month", comparisonRequested: false, comparisonType: null, analysisType: "summary", requiresClarification: false, clarificationQuestion: null, contextUpdates: { metric: "sales", timeframePreset: "This Month" } },
    last: { resolvedIntent: "metric", metric: "sales", entityType: null, entity: null, timeframePreset: "Last Month", comparisonRequested: false, comparisonType: null, analysisType: "summary", requiresClarification: false, clarificationQuestion: null, contextUpdates: { metric: "sales", timeframePreset: "Last Month" } },
    cmp: { resolvedIntent: "comparison", metric: "sales", entityType: null, entity: null, timeframePreset: null, comparisonRequested: true, comparisonType: "previous_period", analysisType: "comparison", requiresClarification: false, clarificationQuestion: null, contextUpdates: { comparisonRequested: true, comparisonType: "previous_period", analysisType: "comparison" } },
    why: { resolvedIntent: "rca", metric: "sales", entityType: null, entity: null, timeframePreset: null, comparisonRequested: false, comparisonType: null, analysisType: "diagnosis", requiresClarification: false, clarificationQuestion: null, contextUpdates: { analysisType: "diagnosis" } },
    prod: { resolvedIntent: "product", metric: "products", entityType: "product", entity: null, timeframePreset: null, comparisonRequested: false, comparisonType: null, analysisType: "summary", requiresClarification: false, clarificationQuestion: null, contextUpdates: { metric: "products", entityType: "product" } },
    act: { resolvedIntent: "recommendation", metric: "sales", entityType: null, entity: null, timeframePreset: null, comparisonRequested: false, comparisonType: null, analysisType: "recommendation", requiresClarification: false, clarificationQuestion: null, contextUpdates: { analysisType: "recommendation" } },
  };
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    const dump = JSON.stringify(body.messages || "");
    if (/structured JSON/i.test(dump)) {
      const um = String((body.messages || []).map((m) => m.content).join("\n"));
      const latest = /Latest owner message:([\s\S]*?)Respond with JSON only/i.exec(um)?.[1] || "";
      let out = RES.base;
      if (/compare both/i.test(latest)) out = RES.cmp;
      else if (/why did it/i.test(latest)) out = RES.why;
      else if (/what should/i.test(latest)) out = RES.act;
      else if (/contributed most/i.test(latest)) out = RES.prod;
      else if (/last month/i.test(latest) && /what about/i.test(latest)) out = RES.last;
      return jsonRes({ choices: [{ message: { content: JSON.stringify(out) } }] });
    }
    return jsonRes({ choices: [{ message: { content: "Verified answer with figures." } }] });
  };
  const base = { businessId: "biz-e2e", businessName: "E2E Biz", currency: "INR", timezone: TZ, userId: "u1", conversationId: `e2e_${Date.now()}`, transactions: TXNS, dataVersion: "v1" };
  const r1 = await orchestrate({ ...base, message: "What are my sales this month?" });
  assert.equal(r1.intent, "metric");
  assert.ok(r1.evidence.length > 0);
  const e1 = r1.evidence.map((e) => e.id).join(",");
  const r2 = await orchestrate({ ...base, message: "What about last month?" });
  assert.equal(r2.intent, "metric");
  assert.ok(r2.evidence.length > 0 && r2.evidence.map((e) => e.id).join(",") !== e1);
  const r3 = await orchestrate({ ...base, message: "Compare both." });
  assert.equal(r3.intent, "comparison");
  const r4 = await orchestrate({ ...base, message: "Why did it decrease?" });
  assert.equal(r4.intent, "rca");
  const r5 = await orchestrate({ ...base, message: "Which product contributed most?" });
  assert.equal(r5.intent, "product");
  const r6 = await orchestrate({ ...base, message: "What should I do about it?" });
  assert.equal(r6.intent, "recommendation");
  globalThis.fetch = async () => new Response("down", { status: 500 });
  const rd = await orchestrate({ ...base, conversationId: `e2e_d_${Date.now()}`, message: "What are my sales this month?" });
  assert.equal(rd.provider, "degraded");
  assert.ok(rd.evidence.length > 0);
  globalThis.fetch = realFetch;
  console.log("ok - 13 multi-turn e2e + degraded");
})().then(() => console.log("ALL SLICE 4 CHECKS PASSED")).catch((e) => { console.error(e); process.exit(1); });

