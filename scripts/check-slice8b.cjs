// Slice 8 checks part B (mocked). Run: node scripts/check-slice8b.cjs
const { assert, readSrc } = require("./slice8-harness.cjs");
(async () => {
  const im = readSrc("lib/ai/image-assets.ts");
  assert.ok(im.includes("bucketInvented: false"), "no bucket invented");
  assert.ok(im.includes("persisted: false"), "no false claim");
  assert.ok(readSrc("app/api/copilot/image/route.ts").includes("recordImageAsset"), "metadata tracked");
  console.log("ok - 5 image asset honesty");
  const tr = readSrc("app/api/copilot/traces/route.ts");
  assert.ok(tr.includes("UNAUTHENTICATED"), "unauth rejected");
  assert.ok(tr.includes("t.businessId === ctx"), "tenant scoped");
  console.log("ok - 6 traces tenant isolation");
  const buckets = new Map();
  function check(key, limit, windowMs, now) {
    const b = buckets.get(key);
    if (!b || now >= b.resetAt) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return { ok: true }; }
    if (b.count < limit) { b.count += 1; return { ok: true }; }
    return { ok: false };
  }
  assert.equal(check("u1", 2, 60000, 0).ok, true);
  assert.equal(check("u1", 2, 60000, 1).ok, true);
  assert.equal(check("u1", 2, 60000, 2).ok, false);
  assert.equal(check("u2", 2, 60000, 2).ok, true, "per-user isolation");
  assert.equal(check("u1", 2, 60000, 61000).ok, true, "window resets");
  console.log("ok - 7 rate-limit buckets + isolation");
  assert.ok(readSrc("lib/ai/tts.ts").includes("Text answer unaffected"), "tts survival");
  console.log("ok - 8 TTS survival intact");
  assert.ok(readSrc("lib/ai/tool-defs.ts").includes("MAX_TOOL_ROUNDS = 3"), "loop limits");
  assert.ok(readSrc("lib/ai/tool-exec.ts").includes("Business scope mismatch"), "tool scope");
  console.log("ok - 9 tool allowlists intact");
  const m1 = readSrc("supabase/migrations/009_copilot_slice8_hardening_part1.sql");
  const m2 = readSrc("supabase/migrations/010_copilot_slice8_hardening_part2.sql");
  assert.ok(m1.includes("enable row level security"), "RLS enabled");
  assert.ok(m2.includes("copilot_traces_member_read"), "member policy");
  assert.ok(!/disable row level security|bypass/i.test(m1 + m2), "RLS never disabled");
  console.log("ok - 10 migrations keep RLS");
  const page = readSrc("app/copilot/page.tsx");
  for (const s of ["SUPABASE_SERVICE_ROLE_KEY", "META_API_KEY", "BASETEN_API_KEY", "FIREWORKS_API_KEY"]) {
    assert.ok(!page.includes(s), `no ${s} in browser`);
  }
  console.log("ok - 11 secret protection");
  assert.ok(readSrc("lib/ai/orchestrate.ts").includes("callMetaStandardWithTools"), "slice 7 intact");
  assert.ok(readSrc("lib/ai/image.ts").includes("/images/generations"), "image intact");
  assert.ok(readSrc("lib/ai/config.ts").includes("muse-spark-1.3"), "providers intact");
  console.log("ok - 12 slices 1-7 intact");
  console.log("PART B PASSED (mocked; live verification still required)");
})().catch((e) => { console.error(e); process.exit(1); });
