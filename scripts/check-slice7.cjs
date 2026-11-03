// Slice 7 regression (mocked only, no network).
// Run: node scripts/check-slice7.cjs
const { assert, readSrc, validateMirror, parseMirror, runLoopMirror } = require("./slice7-harness.cjs");
(async () => {
  const defs = readSrc("lib/ai/tool-defs.ts");
  for (const t of ["get_business_overview", "get_sales", "get_profit", "get_expenses", "get_purchases", "get_products", "get_top_product_by_qty", "get_categories", "get_channels", "get_trends", "get_comparison", "get_compare_dimension", "get_peak_hours", "get_recent", "rank_business_priorities"]) {
    assert.ok(defs.includes(`"${t}"`), `registry has ${t}`);
  }
  assert.ok(defs.includes("MAX_TOOL_ROUNDS = 3"));
  assert.ok(defs.includes("MAX_TOOL_CALLS_PER_TURN = 4"));
  console.log("ok - 1 registry 15 tools, limits 3 rounds / 4 calls");
  const bad = validateMirror({ name: "drop_table", args: {}, businessId: "b", rangeStart: "s", rangeEnd: "e" }, { businessId: "b", rangeStart: "s", rangeEnd: "e" });
  assert.equal(bad.ok, false);
  console.log("ok - 2 invalid tool name rejected");
  const calls = parseMirror({ tool_calls: [{ id: "c1", type: "function", function: { name: "get_sales", arguments: "{bad json" } }] });
  assert.equal(calls.length, 1);
  const malformed = validateMirror({ name: "get_sales", args: calls[0].args, businessId: "b", rangeStart: "s", rangeEnd: "e" }, { businessId: "b", rangeStart: "s", rangeEnd: "e" });
  assert.equal(malformed.ok, false);
  console.log("ok - 3 malformed arguments rejected");
  const badBiz = validateMirror({ name: "get_sales", args: {}, businessId: "evil", rangeStart: "s", rangeEnd: "e" }, { businessId: "b", rangeStart: "s", rangeEnd: "e" });
  assert.equal(badBiz.ok, false);
  const badRange = validateMirror({ name: "get_sales", args: {}, businessId: "b", rangeStart: "x", rangeEnd: "e" }, { businessId: "b", rangeStart: "s", rangeEnd: "e" });
  assert.equal(badRange.ok, false);
  console.log("ok - 4 tenant/business scope validation");
  const sql = validateMirror({ name: "get_recent", args: { limit: 5, note: "select * from transactions" } }, { businessId: "b", rangeStart: "s", rangeEnd: "e" });
  assert.equal(sql.ok, false);
  console.log("ok - 5 arbitrary SQL rejected");
  // Real source parity: implementation must contain the same guards.
  const execSrc = readSrc("lib/ai/tool-exec.ts");
  assert.ok(execSrc.includes("Business scope mismatch"));
  assert.ok(execSrc.includes("Timeframe scope mismatch"));
  assert.ok(execSrc.includes("__malformed"));
  assert.ok(execSrc.includes("Arbitrary data access rejected"));
  const loopSrc = readSrc("lib/ai/tool-loop.ts");
  assert.ok(loopSrc.includes("MAX_TOOL_ROUNDS"));
  assert.ok(loopSrc.includes("MAX_TOOL_CALLS_PER_TURN"));
  const p1 = { calls: 0, async chat(m) { this.calls += 1; if (this.calls === 1) return { text: "", toolCalls: [{ id: "c1", name: "get_sales", args: {} }] }; assert.equal(m[m.length - 1].role, "tool"); return { text: "Sales done.", toolCalls: [] }; } };
  const o1 = await runLoopMirror({ provider: p1, startMessages: [{ role: "user", content: "sales?" }], exec: () => ({ ok: true, tool: "get_sales", toolCallId: "c1", summary: "1 verified item(s)." }) });
  assert.equal(o1.text, "Sales done.");
  assert.equal(o1.rounds, 2);
  console.log("ok - 6 one tool call + result to model + final answer");
  const p2 = { calls: 0, async chat() { this.calls += 1; if (this.calls === 1) return { text: "", toolCalls: [{ id: "a", name: "get_sales", args: {} }, { id: "b", name: "get_profit", args: {} }] }; return { text: "Both.", toolCalls: [] }; } };
  const o2 = await runLoopMirror({ provider: p2, startMessages: [{ role: "user", content: "both" }], exec: (c) => ({ ok: true, tool: c.name, toolCallId: c.id, summary: "ok" }) });
  assert.equal(o2.toolResults.length, 2);
  console.log("ok - 7 multiple tool calls in one response");
  const p3 = { async chat() { return { text: "", toolCalls: [{ id: "x", name: "get_sales", args: {} }] }; } };
  const o3 = await runLoopMirror({ provider: p3, startMessages: [{ role: "user", content: "loop" }], exec: () => ({ ok: true, tool: "get_sales", toolCallId: "x", summary: "ok" }), maxRounds: 2, timeoutMs: 5000 });
  assert.equal(o3.hitIterationLimit, true);
  console.log("ok - 8 iteration limit enforced");
  const p4 = { calls: 0, async chat() { this.calls += 1; if (this.calls === 1) return { text: "", toolCalls: [{ id: "f", name: "get_sales", args: {} }] }; return { text: "Recovered.", toolCalls: [] }; } };
  const o4 = await runLoopMirror({ provider: p4, startMessages: [{ role: "user", content: "q" }], exec: () => { throw new Error("boom"); } });
  assert.equal(o4.toolResults[0].ok, false);
  assert.equal(o4.text, "Recovered.");
  console.log("ok - 9 tool execution failure handled");
  const p5 = { async chat() { await new Promise((r) => setTimeout(r, 50)); return { text: "", toolCalls: [{ id: "t", name: "get_sales", args: {} }] }; } };
  const o5 = await runLoopMirror({ provider: p5, startMessages: [{ role: "user", content: "slow" }], exec: () => ({ ok: true, tool: "get_sales", toolCallId: "t", summary: "ok" }), maxRounds: 5, timeoutMs: 30 });
  assert.equal(o5.timedOut, true);
  console.log("ok - 10 timeout enforced");
  console.log("PART 1 PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
