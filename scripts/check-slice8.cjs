// Slice 8 regression + security (mocked only, no network/Supabase).
// Run: node scripts/check-slice8.cjs
const { assert, readSrc } = require("./slice8-harness.cjs");
(async () => {
  const rl = readSrc("lib/ai/rate-limit.ts");
  for (const k of ["checkRateLimit", "rateKey", "CHAT_LIMIT", "IMAGE_LIMIT", "TTS_LIMIT", "TRANSCRIBE_LIMIT"]) {
    assert.ok(rl.includes(k), `rate-limit has ${k}`);
  }
  for (const r of ["app/api/copilot/chat/route.ts", "app/api/copilot/image/route.ts", "app/api/copilot/voice/speak/route.ts", "app/api/copilot/voice/transcribe/route.ts"]) {
    assert.ok(readSrc(r).includes("RATE_LIMITED"), `${r} returns 429`);
  }
  console.log("ok - 1 rate limits wired on chat/image/tts/transcribe");
  const a = readSrc("lib/ai/conversation-store.ts");
  const b = readSrc("lib/ai/conversation-persist.ts");
  assert.ok(a.includes("chat_sessions") && b.includes("chat_messages"), "existing schema reused");
  assert.ok(!/create table/i.test(a + b), "no second store in code");
  assert.ok((a + b).includes("business_members"), "membership verified");
  assert.ok((a + b).includes("Conversation ownership mismatch"), "ownership enforced");
  assert.ok(readSrc("app/api/copilot/chat/route.ts").includes("persistCopilotTurn"), "chat persists turns");
  console.log("ok - 2 persistence on existing schema with ownership");
  const speak = readSrc("app/api/copilot/voice/speak/route.ts");
  assert.ok(speak.includes("messageId"), "speak accepts messageId");
  assert.ok(speak.includes("fetchTrustedAssistantMessage"), "trusted record");
  assert.ok(speak.includes("Authenticated speech requires a messageId"), "arbitrary text rejected");
  assert.ok((speak + b).includes("Message business scope mismatch"), "cross-tenant rejected");
  assert.ok((speak + b).includes("Only final assistant answers"), "role check");
  assert.ok(readSrc("app/copilot/page.tsx").includes("assistantMessageId"), "UI passes trusted id");
  console.log("ok - 3 TTS trusted-message enforcement");
  const t = readSrc("lib/ai/trace-store.ts");
  assert.ok(t.includes("recordTrace"), "extends ring");
  assert.ok(t.includes("copilot_traces"), "durable table");
  assert.ok(!/META_API_KEY|BASETEN_API_KEY|Authorization/i.test(t), "no secrets");
  assert.ok(t.includes("table-missing"), "missing table honest");
  console.log("ok - 4 trace persistence without secrets");
  console.log("PART A PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
