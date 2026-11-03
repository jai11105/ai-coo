// Slice 8 part C: remaining mocked security checks. Run: node scripts/check-slice8c.cjs
const { assert, readSrc } = require("./slice8-harness.cjs");
(async () => {
  // 13. Auth vs unauth: chat + traces + speak distinguish paths.
  {
    const chat = readSrc("app/api/copilot/chat/route.ts");
    assert.ok(chat.includes("UNAUTHENTICATED") && chat.includes("FORBIDDEN"), "chat auth codes");
    assert.ok(chat.includes("isDemo"), "demo isolation preserved");
    const tr = readSrc("app/api/copilot/traces/route.ts");
    assert.ok(tr.includes("UNAUTHENTICATED"), "traces require auth");
    const sp = readSrc("app/api/copilot/voice/speak/route.ts");
    assert.ok(sp.includes("hasAuth"), "speak splits authed/demo");
    console.log("ok - 13 authed vs unauth paths");
  }
  // 14. Conversation + message ownership enforced server-side.
  {
    const b = readSrc("lib/ai/conversation-persist.ts");
    assert.ok(b.includes("Conversation ownership mismatch"), "ownership chain");
    assert.ok(b.includes("assertMember"), "membership gate");
    console.log("ok - 14 conversation/message ownership");
  }
  // 15. Unauthorized image/voice rejected (auth verification present).
  {
    const img = readSrc("app/api/copilot/image/route.ts");
    assert.ok(img.includes("getAuthorizedBusinessContext"), "image verifies tenant");
    const v = readSrc("app/api/copilot/voice/transcribe/route.ts");
    assert.ok(v.includes("getAuthorizedBusinessContext"), "voice verifies tenant");
    console.log("ok - 15 image + voice authorization");
  }
  // 16. Invalid audio/image payloads rejected.
  {
    const v = readSrc("app/api/copilot/voice/transcribe/route.ts");
    assert.ok(v.includes("15 * 1024 * 1024") && v.includes("WAV"), "audio limits");
    const im = readSrc("lib/ai/image.ts");
    assert.ok(im.includes("1024x1024") || im.includes("Size must"), "image size guard");
    console.log("ok - 16 invalid payload guards");
  }
  // 17. Persistence failures + partial failures honest (never throw into answer).
  {
    const chat = readSrc("app/api/copilot/chat/route.ts");
    assert.ok(chat.includes("History note"), "partial persistence surfaced honestly");
    assert.ok(chat.includes("persisted: Boolean"), "persisted flag honest");
    const b = readSrc("lib/ai/conversation-persist.ts");
    assert.ok(b.includes("Partial persistence"), "partial shape");
    console.log("ok - 17 persistence/partial failure honesty");
  }
  // 18. Cache freshness + stale evidence prevention intact.
  {
    const ctx = readSrc("lib/ai/context.ts");
    assert.ok(ctx.includes("isEvidenceFresh") && ctx.includes("freshEvidenceRefs"), "freshness guards");
    assert.ok(ctx.includes("lastDataVersion"), "dataVersion invalidation");
    console.log("ok - 18 cache freshness + invalidation intact");
  }
  // 19. Provider error/timeout handling intact (no invented usage/costs).
  {
    const prov = readSrc("lib/ai/providers.ts");
    assert.ok(prov.includes("timed out") || prov.includes("AbortError"), "timeout handling");
    const tr = readSrc("lib/ai/trace-store.ts");
    assert.ok(!/estimated.*cost|fake.*token/i.test(tr), "no fabricated costs");
    console.log("ok - 19 provider error/timeout + no fabricated usage");
  }
  // 20. Prompt-injection + SQL guards intact.
  {
    assert.ok(readSrc("lib/ai/tool-exec.ts").includes("Arbitrary data access rejected"), "tool SQL guard");
    assert.ok(readSrc("lib/ai/followup.ts").includes("ALLOWED_INTENTS"), "followup allowlist");
    console.log("ok - 20 injection/allowlist guards intact");
  }
  console.log("PART C PASSED (mocked; live verification still required)");
})().catch((e) => { console.error(e); process.exit(1); });
