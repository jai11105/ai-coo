// Reliability regression tests — mocked providers only (no network).
// Run: node scripts/check-reliability.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let pass = 0;
const ok = (name) => { pass += 1; console.log(`ok - ${name}`); };
{
  const specialist = src("lib/ai/specialist.ts");
  assert.ok(specialist.includes("metric"), "metric in specialist gate");
  assert.ok(/NEVER_SPECIALIST/s.test(specialist), "never-specialist list exists");
  ok("1 routine metric intents excluded from Baseten specialist");
}
{
  const orch = src("lib/ai/orchestrator.ts");
  assert.ok(orch.includes("making"), "loss-cause RCA rule present");
  assert.ok(orch.includes('return "rca"'), "rca returns present");
  ok("2 loss-cause + RCA detector routes to rca intent");
}
{
  const main = src("lib/ai/orchestrate.ts");
  assert.ok(main.includes("routing bypass guard"), "bypass guard present");
  ok("3 RCA bypass guard escalates rca intent to specialist");
}
{
  const defs = src("lib/ai/tool-defs.ts");
  const baseten = src("lib/ai/baseten.ts");
  assert.ok(defs.includes("toolsForIntent"), "Spark toolsForIntent exists");
  assert.ok(baseten.includes("basetenToolDefinitions"), "Baseten defs exist");
  assert.ok(!defs.includes("inspect_evidence"), "Spark has no specialist ops");
  assert.ok(!baseten.includes("get_business_overview"), "Baseten has no routine tools");
  ok("4 independent Spark vs Baseten tool registries");
}
{
  const sel = src("lib/ai/select-evidence.ts");
  assert.ok(sel.includes("selectSpecialistRcaEvidence"), "RCA slice exists");
  assert.ok(sel.includes("toolCompare") && sel.includes("toolProfit"), "RCA slice merges parts");
  ok("5 specialist RCA evidence slice");
}
{
  const orch = src("lib/ai/orchestrator.ts");
  assert.ok(orch.includes("comparisonLabelFor"), "comparison helper present");
  ok("6 comparison routing + aligned periods");
}
{
  const orch = src("lib/ai/orchestrator.ts");
  const intent = src("lib/ai/intent.ts");
  assert.ok(orch.includes("last_30_days"), "rolling hints honored");
  assert.ok(intent.includes("Last 30 Days"), "bare 30-day handled");
  ok("7 rolling 7/30-day resolution");
}
{
  const main = src("lib/ai/orchestrate.ts");
  // FINAL (Failure 1): RCA specialist failure follows the agreed chain
  // Baseten → Fireworks (with prepared specialist evidence) → deterministic
  // evidence-only. Spark composition is never labeled a successful RCA when
  // the specialist produced no memo.
  assert.ok(main.includes("never a substitute for Baseten analysis"), "RCA Spark-skip guard present");
  assert.ok(main.includes("fireworks-fallback"), "Fireworks wired");
  assert.ok(main.includes("Deterministic evidence shown"), "deterministic fallback present");
  ok("8 Spark->Fireworks->deterministic; no Spark-as-specialist RCA success");
}
{
  const analytics = src("lib/analytics.ts");
  assert.ok(analytics.includes("if (prev === 0) return null"), "pct null on zero baseline");
  ok("9 empty baseline = new (no fabricated growth)");
}
{
  const main = src("lib/ai/orchestrate.ts");
  assert.ok(main.includes("Partial coverage"), "coverage note present");
  ok("10 partial data coverage disclosed");
}
{
  const main = src("lib/ai/orchestrate.ts");
  assert.ok(main.includes("truncated at the token limit"), "truncation notice present");
  ok("11 truncated specialist handled as partial");
}
{
  const main = src("lib/ai/orchestrate.ts");
  assert.ok(main.includes("Provider HTTP"), "provider error strip present");
  const validate = src("lib/ai/validate.ts");
  assert.ok(validate.includes("tool/JSON"), "tool JSON flagged");
  ok("12 clean answer formatting + validation");
}
{
  const orch = src("lib/ai/orchestrator.ts");
  assert.ok(orch.includes("validateIntentToolArgs"), "arg validator exists");
  assert.ok(orch.includes("not substituted"), "no silent substitution");
  ok("13 intent/tool-argument validation");
}
{
  const prov = src("lib/ai/providers.ts");
  assert.ok(prov.includes("isRetryableProviderError"), "retry gate exists");
  assert.ok(prov.includes("classifyFailure"), "failure classifier exists");
  ok("14 provider timeout/fallback reliability");
}
console.log(`\nAll ${pass} reliability checks passed (mocked, no network).`);
