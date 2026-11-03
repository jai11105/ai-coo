// Orchestrator attempt-recording checks with mocked fetch (no network).
// Run: node -r sucrase/register scripts/check-orchestrate-attempts.cjs
const assert = require("node:assert/strict");
process.env.META_API_KEY = "test-meta-key";
process.env.META_BASE_URL = "https://api.meta.ai/v1";
process.env.META_MODEL_ID = "muse-spark-1.3";
process.env.FIREWORKS_API_KEY = "test-fw-key";
process.env.FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";
process.env.FIREWORKS_MODEL_ID = "accounts/fireworks/models/muse-glimmer-30b";

const { orchestrate } = require("../lib/ai/orchestrate.ts");
const { recentTraces } = require("../lib/ai/types.ts");
const realFetch = globalThis.fetch;
const useFetch = (h) => { globalThis.fetch = h; };
const restore = () => { globalThis.fetch = realFetch; };
const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const textRes = (body, status) => new Response(body, { status, headers: { "Content-Type": "text/plain" } });
const base = { businessId: "biz-test", businessName: "Test Biz", currency: "INR", timezone: "Asia/Kolkata", userId: "user-test", transactions: [], dataVersion: "test:1" };
const lastTrace = () => { const all = recentTraces(10); return all[all.length - 1]; };

(async () => {
  // 1. Meta 401: no retry, fallback runs -> degraded with both errors.
  // Slice 4: one extra Meta call precedes the answer phase — the follow-up
  // resolver (401 -> deterministic mergeFallback). Answer-phase attempts
  // unchanged: meta-primary (401, no retry) + fireworks-fallback.
  let calls = 0;
  useFetch(async (url) => { calls += 1; if (String(url).includes("api.meta.ai")) return textRes("Unauthorized", 401); return textRes("fw down", 500); });
  let res = await orchestrate({ ...base, message: "what are my sales for this month", conversationId: "c401" });
  let t = lastTrace();
  assert.equal(calls, 3);
  assert.equal(res.provider, "degraded");
  assert.equal(t.providerAttempts[0].attempt, "meta-primary");
  assert.equal(t.providerAttempts[0].httpStatus, 401);
  assert.ok(!t.providerAttempts.some((a) => a.attempt === "meta-retry"));
  assert.ok(t.error.includes("meta:") && t.error.includes("fireworks-fallback:"));
  restore();
  console.log("ok - 401 no-retry");

  // 2. Meta 429 then success: resolver retries once internally? No — the
  // resolver makes ONE call (429 -> mergeFallback, no retry inside resolver);
  // the answer phase then does meta-primary (ok). Total Meta calls = 2.
  let mc = 0;
  useFetch(async (url) => { if (String(url).includes("api.meta.ai")) { mc += 1; if (mc === 1) return textRes("slow", 429); return jsonRes({ choices: [{ message: { content: "Sales explained." } }] }); } throw new Error("no fallback"); });
  res = await orchestrate({ ...base, message: "what are my sales for this month", conversationId: "c429" });
  t = lastTrace();
  assert.equal(mc, 2);
  assert.equal(res.provider, "meta");
  assert.equal(t.providerAttempts.length, 1);
  assert.equal(t.providerAttempts[0].outcome, "ok");
  restore();
  console.log("ok - 429 resolver-fallback then primary ok");

  // 3. Meta timeout then fallback 503 -> 3 attempts, timeout class.
  useFetch(async (url) => { if (String(url).includes("api.meta.ai")) { const e = new Error("Provider timed out."); e.name = "AbortError"; throw e; } return textRes("fw boom", 503); });
  res = await orchestrate({ ...base, message: "what are my sales for this month", conversationId: "ctime" });
  t = lastTrace();
  assert.equal(res.provider, "degraded");
  assert.deepEqual(t.providerAttempts.map((a) => a.attempt), ["meta-primary", "meta-retry", "fireworks-fallback"]);
  assert.ok(t.providerAttempts.slice(0, 2).every((a) => a.classification === "timeout"));
  restore();
  console.log("ok - timeout");

  // 4. Meta success -> single ok attempt (greeting skips resolver fetch).
  useFetch(async () => jsonRes({ choices: [{ message: { content: "Sales are fine." } }] }));
  res = await orchestrate({ ...base, message: "hi", conversationId: "cok" });
  t = lastTrace();
  assert.equal(res.provider, "meta");
  assert.equal(t.providerAttempts.length, 1);
  assert.equal(t.providerAttempts[0].errorSnippet, undefined);
  restore();
  console.log("ok - success");
  console.log("ALL ORCHESTRATOR CHECKS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
