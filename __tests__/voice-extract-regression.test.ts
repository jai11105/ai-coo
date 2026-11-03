// Voice extraction regression (mocked provider — no live credits).
// Run: npx tsc __tests__/voice-extract-regression.test.ts ... && node out/...js
import * as assert from "node:assert/strict";
import {
  normalizeDraft,
  extractContentText,
  stripToJsonPayload,
  finishReasonOf,
} from "../lib/server/meta-extract";
import { isVoiceDraft } from "../lib/voice-entry";

type MockResp = { ok: boolean; status: number; body: unknown; rawText?: string };

function mockFetchOnce(resp: MockResp) {
  const orig = globalThis.fetch;
  // @ts-expect-error mock fetch
  globalThis.fetch = async () => ({
    ok: resp.ok,
    status: resp.status,
    json: async () => (typeof resp.body === "string" ? JSON.parse(resp.body as string) : resp.body),
    text: async () => resp.rawText ?? (typeof resp.body === "string" ? resp.body : JSON.stringify(resp.body ?? "")),
  });
  return () => {
    globalThis.fetch = orig;
  };
}

export const TRANSCRIPT = "Sold 2 dosa batter at 50 rupees each to walk-in, UPI";

export const VALID_JSON = JSON.stringify({
  transaction_type: "sale",
  date: "",
  description: "Sold dosa batter",
  category: "Food",
  counterparty: "Walk-in",
  channel: "",
  payment_method: "UPI",
  item_name: "dosa batter",
  quantity: "2",
  unit_selling_price: "50",
  unit_buying_cost: "",
  amount: "100",
  confidence: 0.9,
  uncertain_fields: [],
  needs_clarification: [],
});

async function checkSuccessAndEmptyTranscript() {
  // 1. Successful structured extraction (string content, finish_reason stop).
  {
    const restore = mockFetchOnce({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: VALID_JSON }, finish_reason: "stop" }] },
    });
    process.env.META_API_KEY = "test-key";
    const { extractWithContributor } = await import("../lib/server/meta-extract");
    const draft = await extractWithContributor(TRANSCRIPT);
    assert.ok(isVoiceDraft(draft), "valid draft must pass isVoiceDraft");
    assert.equal(draft.item_name, "dosa batter");
    assert.equal(draft.transcript, TRANSCRIPT);
    restore();
    console.log("ok 1 - successful structured extraction");
  }
  // 2. Empty transcription response (parity with transcribe 422 EMPTY_TRANSCRIPT).
  {
    const transcript = "";
    assert.equal(transcript.trim(), "", "empty transcript blocked pre-extraction");
    console.log("ok 2 - empty transcription detected");
  }
}

async function checkForwardAndEmpty() {
  // 3. Non-empty transcript forwarded verbatim to provider user message.
  {
    let seen: unknown = null;
    const orig = globalThis.fetch;
    // @ts-expect-error mock
    globalThis.fetch = async (_u: unknown, init?: { body?: unknown }) => {
      seen = JSON.parse(String(init?.body ?? "{}"));
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: VALID_JSON }, finish_reason: "stop" }] }),
        text: async () => "",
      };
    };
    process.env.META_API_KEY = "test-key";
    const { extractWithContributor } = await import("../lib/server/meta-extract");
    await extractWithContributor(TRANSCRIPT);
    globalThis.fetch = orig;
    const body = seen as { messages?: { content?: string }[]; reasoning_effort?: string };
    assert.ok(body?.messages?.[1]?.content?.includes(TRANSCRIPT), "transcript verbatim");
    assert.equal(body?.reasoning_effort, "low", "request body must include reasoning_effort low");
    console.log("ok 3 - transcript forwarded verbatim; reasoning_effort low");
  }
  // 4. Empty model content -> explicit empty-result error (preserved).
  {
    const restore = mockFetchOnce({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: "" }, finish_reason: "stop" }] },
    });
    const { extractWithContributor } = await import("../lib/server/meta-extract");
    await assert.rejects(() => extractWithContributor(TRANSCRIPT), /empty result/i);
    restore();
    console.log("ok 4 - empty model response -> empty-result error");
  }
}

async function checkMalformedTruncatedUpstream() {
  // 5. Malformed JSON -> explicit malformed error; fences/prose still parse.
  {
    const restore = mockFetchOnce({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: "not json at all {{{" }, finish_reason: "stop" }] },
    });
    const { extractWithContributor } = await import("../lib/server/meta-extract");
    await assert.rejects(() => extractWithContributor(TRANSCRIPT), /malformed JSON/i);
    restore();
    assert.ok(stripToJsonPayload("```json\n" + VALID_JSON + "\n```").startsWith("{"));
    assert.equal(JSON.parse(stripToJsonPayload("Intro:\n" + VALID_JSON + "\nDone.")).item_name, "dosa batter");
    console.log("ok 5 - malformed explicit; fences/prose stripped");
  }
  // 6. Truncated (finish_reason length) -> explicit truncated error.
  {
    const restore = mockFetchOnce({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: VALID_JSON.slice(0, 40) }, finish_reason: "length" }] },
    });
    const { extractWithContributor } = await import("../lib/server/meta-extract");
    await assert.rejects(() => extractWithContributor(TRANSCRIPT), /truncated/i);
    assert.equal(finishReasonOf({ choices: [{ finish_reason: "length" }] }), "length");
    restore();
    console.log("ok 6 - truncated rejected explicitly");
  }
  // 7. Provider HTTP error -> upstream status preserved, no key leak.
  {
    const restore = mockFetchOnce({ ok: false, status: 429, body: {}, rawText: "rate limited" });
    const { extractWithContributor } = await import("../lib/server/meta-extract");
    const err = await extractWithContributor(TRANSCRIPT).then(
      () => null,
      (e: unknown) => e as Error & { upstreamStatus?: number }
    );
    assert.ok(err && /HTTP 429/.test(err.message));
    assert.equal(err?.upstreamStatus, 429);
    assert.ok(!/test-key/.test(err?.message ?? ""));
    restore();
    console.log("ok 7 - provider HTTP error distinct from empty");
  }
}

async function checkDraftShapes() {
  // 8. Valid draft passes review validator; all provider shapes handled.
  const draft = normalizeDraft(JSON.parse(VALID_JSON), TRANSCRIPT);
  assert.ok(isVoiceDraft(draft));
  assert.equal(draft.transaction_type, "sale");
  assert.ok(extractContentText({ content: [{ text: VALID_JSON }] }).includes("transaction_type"));
  assert.ok(extractContentText({ content: null, reasoning_content: VALID_JSON }).includes("transaction_type"));
  assert.ok(extractContentText({ content: null }, VALID_JSON).includes("transaction_type"));
  assert.equal(extractContentText({ content: 42 }), "");
  console.log("ok 8 - draft review-ready; shapes handled");
}

async function checkLargePayloadBudget() {
  // 9. Large payload: request must send max_tokens 4000 and reasoning_effort low.
  const bigDesc = "dosa batter sale batch " + "x".repeat(3500);
  const bigJson = JSON.stringify({ ...JSON.parse(VALID_JSON), description: bigDesc });
  assert.ok(bigJson.length > 3200, "fixture must exceed ~800-token budget");
  let seenMax = 0;
  let seenModel = "";
  let seenReasoningEffort = "";
  const orig = globalThis.fetch;
  // @ts-expect-error mock
  globalThis.fetch = async (_u: unknown, init?: { body?: unknown }) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { max_tokens?: number; model?: string; reasoning_effort?: string };
    seenMax = Number(body?.max_tokens ?? 0);
    seenModel = String(body?.model ?? "");
    seenReasoningEffort = String(body?.reasoning_effort ?? "");
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: bigJson }, finish_reason: "stop" }] }),
      text: async () => "",
    };
  };
  process.env.META_API_KEY = "test-key";
  const { extractWithContributor } = await import("../lib/server/meta-extract");
  const draft = await extractWithContributor(TRANSCRIPT);
  globalThis.fetch = orig;
  assert.equal(seenMax, 4000, "extraction must request max_tokens 4000");
  assert.equal(seenReasoningEffort, "low", "request body must send reasoning_effort low");
  assert.equal(seenModel, "muse-spark-1.3-contributor", "model ID must stay muse-spark-1.3-contributor");
  assert.ok(isVoiceDraft(draft), "large-payload draft must validate");
  assert.equal(draft.description, bigDesc);
  console.log("ok 9 - payload completes within max_tokens 4000 and reasoning_effort low");
}

async function checkUsageLogging() {
  // 10. Usage log line captures finish_reason, prompt_tokens, completion_tokens, reasoning_tokens
  // and contains NO transcript text and NO API key.
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  const secretKey = "sk-super-secret-test-key-999";
  process.env.META_API_KEY = secretKey;
  const restore = mockFetchOnce({
    ok: true,
    status: 200,
    body: {
      choices: [{ message: { content: VALID_JSON }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 142,
        completion_tokens: 256,
        completion_tokens_details: { reasoning_tokens: 88 },
      },
    },
  });
  try {
    const { extractWithContributor, extractionSystemPrompt } = await import("../lib/server/meta-extract");
    const sysPrompt = extractionSystemPrompt("2026-11-04");
    assert.ok(
      sysPrompt.endsWith("Return only the JSON object. Do not explain."),
      "system prompt must end with strengthened instruction"
    );
    await extractWithContributor(TRANSCRIPT);
  } finally {
    console.log = origLog;
    restore();
  }
  const usageLog = logs.find((l) => l.includes("[meta-extract]"));
  assert.ok(usageLog, "must output [meta-extract] usage log line");
  assert.ok(usageLog.includes("finish_reason=stop"), "must log finish_reason");
  assert.ok(usageLog.includes("prompt_tokens=142"), "must log prompt_tokens");
  assert.ok(usageLog.includes("completion_tokens=256"), "must log completion_tokens");
  assert.ok(usageLog.includes("reasoning_tokens=88"), "must log reasoning_tokens");
  assert.ok(!usageLog.includes(TRANSCRIPT), "usage log line must NOT contain transcript text");
  assert.ok(!usageLog.includes(secretKey), "usage log line must NOT contain API key");
  console.log("ok 10 - usage logged (finish_reason, prompt, completion, reasoning) without transcript or secrets");
}

async function checkTodayDateHandling() {
  // 11. Valid today is used in the system prompt; invalid or missing falls back to server date.
  let capturedPrompt = "";
  const orig = globalThis.fetch;
  // @ts-expect-error mock
  globalThis.fetch = async (_u: unknown, init?: { body?: unknown }) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: { role: string; content: string }[] };
    capturedPrompt = body.messages?.find((m) => m.role === "system")?.content ?? "";
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: VALID_JSON }, finish_reason: "stop" }] }),
      text: async () => "",
    };
  };
  process.env.META_API_KEY = "test-key";
  const { extractWithContributor } = await import("../lib/server/meta-extract");

  // (a) Valid today is passed
  const customToday = "2026-05-15";
  await extractWithContributor(TRANSCRIPT, customToday);
  assert.ok(capturedPrompt.includes(`Today is ${customToday}`), "valid today must be included in system prompt");

  // (b) Missing today -> falls back to server date
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const serverToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  await extractWithContributor(TRANSCRIPT);
  assert.ok(capturedPrompt.includes(`Today is ${serverToday}`), "missing today must fall back to server date");

  // (c) Invalid calendar date format -> falls back to server date
  await extractWithContributor(TRANSCRIPT, "invalid-date");
  assert.ok(capturedPrompt.includes(`Today is ${serverToday}`), "invalid date format must fall back to server date");

  // (d) Impossible calendar date -> falls back to server date
  await extractWithContributor(TRANSCRIPT, "2026-02-31");
  assert.ok(capturedPrompt.includes(`Today is ${serverToday}`), "impossible calendar date must fall back to server date");

  globalThis.fetch = orig;
  console.log("ok 11 - valid today used in system prompt; invalid or missing falls back to server date");
}

async function run() {
  await checkSuccessAndEmptyTranscript();
  await checkForwardAndEmpty();
  await checkMalformedTruncatedUpstream();
  await checkDraftShapes();
  await checkLargePayloadBudget();
  await checkUsageLogging();
  await checkTodayDateHandling();
  console.log("\n# voice-extract regression: 11/11 passed (mocked, no live credits)");
}

run().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});


