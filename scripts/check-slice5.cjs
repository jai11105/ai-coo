// Slice 5 regression: Baseten Data Analyst specialist (mocked I/O only).
// Run: node -r sucrase/register scripts/check-slice5.cjs
// Mocked provider responses — never live API verification.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const Spec = require("../lib/ai/specialist.ts");
const Tools = require("../lib/ai/specialist-tools.ts");
const Val = require("../lib/ai/specialist-validate.ts");
const P = require("../lib/ai/prompts.ts");
const Cfg = require("../lib/ai/config.ts");
function item(o) {
  return {
    id: o.id, metric: o.metric, label: o.label,
    valueMinor: o.valueMinor, value: o.value, unit: o.unit || "INR",
    display: o.display, timeframe: { start: "2026-10-01", end: "2026-10-31", preset: "This Month" },
    businessScope: { businessId: o.biz || "biz-a", businessName: "Biz A", currency: "INR", timezone: "Asia/Kolkata" },
    source: o.source || "deterministic", calculation: o.calc || "sum(x)",
    completeness: o.comp || "1 txn", dimensions: o.dims, comparison: o.cmp,
  };
}
function pkg(items, warnings) {
  return {
    packageId: "pkg.test", question: "q", intent: "rca",
    timeframe: { start: "2026-10-01", end: "2026-10-31", preset: "This Month" },
    items, warnings: warnings || [], generatedAt: "2026-11-02T00:00:00.000Z",
  };
}
const SALES = item({ id: "sales.total.1", metric: "total_sales", label: "Total sales", valueMinor: 100000, display: "Rs.1,000.00" });
const CMP = item({
  id: "compare.1", metric: "compare_revenue", label: "Revenue vs Previous Period",
  valueMinor: 100000, display: "Rs.1,000.00 vs Rs.1,500.00 (-33.3%)",
  dims: { metric: "revenue" }, cmp: { prevStart: "2026-09-01", prevEnd: "2026-09-30", currentMinor: 100000, previousMinor: 150000, diffMinor: -50000, pct: -33.3 },
});
const PEAK = item({ id: "peak.hour.1", metric: "peak_hour_revenue", label: "Hour 10:00", valueMinor: 60000, display: "10:00 -- Rs.600.00 (4 txns)", dims: { hour: "10" } });
const SCOPE = { businessId: "biz-a", rangeStart: "2026-10-01", rangeEnd: "2026-10-31" };
function req(tool, input, scope) {
  const s = scope || SCOPE;
  return { tool, input: input || {}, businessId: s.businessId, rangeStart: s.rangeStart, rangeEnd: s.rangeEnd };
}
// 1. Greeting does not invoke Baseten.
{
  const r = Spec.decideSpecialistNeed("greeting", "hi", pkg([SALES]));
  assert.equal(r.needed, false);
  const r2 = Spec.decideSpecialistNeed("casual", "thanks", pkg([SALES]));
  assert.equal(r2.needed, false);
  console.log("ok - 1 greeting/casual never invoke Baseten");
}
// 2. Simple metric lookup does not invoke Baseten.
{
  assert.equal(Spec.decideSpecialistNeed("summary", "what are my sales this month?", pkg([SALES])).needed, false);
  assert.equal(Spec.decideSpecialistNeed("metric", "how much profit?", pkg([SALES])).needed, false);
  assert.equal(Spec.decideSpecialistNeed("product", "what was Rice revenue?", pkg([SALES])).needed, false);
  console.log("ok - 2 simple metric lookups skip Baseten");
}
// 3. RCA selects Baseten when evidence is sufficient.
{
  const r = Spec.decideSpecialistNeed("rca", "why did sales drop?", pkg([CMP]));
  assert.equal(r.needed, true);
  assert.equal(r.kind, "rca");
  assert.equal(Spec.decideSpecialistNeed("rca", "why did sales drop?", pkg([])).needed, false);
  console.log("ok - 3 RCA routes with evidence, skips when empty");
}
// 4. Recommendation selects Baseten when evidence is sufficient.
{
  const r = Spec.decideSpecialistNeed("recommendation", "what should I do?", pkg([SALES]));
  assert.equal(r.needed, true);
  assert.equal(r.kind, "recommendation");
  console.log("ok - 4 recommendation routes with evidence");
}
// 5. Peak-hour analysis uses deterministic timestamp evidence.
{
  const r = Spec.decideSpecialistNeed("peak_hours", "when are peak hours?", pkg([PEAK]));
  assert.equal(r.needed, true);
  const t = Tools.execSpecialistTool(req("analyze_peak_hours"), pkg([PEAK]), SCOPE);
  assert.equal(t.ok, true);
  assert.ok((t.evidence || []).some((e) => e.metric === "peak_hour_revenue"));
  console.log("ok - 5 peak-hour routing + deterministic tool");
}
// 6. Missing timestamps produce an honest limitation.
{
  const p = pkg([SALES], ["Timestamp data missing -- cannot determine peak hours. No hours invented."]);
  const r = Spec.decideSpecialistNeed("peak_hours", "when are peak hours?", p);
  assert.equal(r.needed, false);
  assert.match(r.reason, /timestamps/i);
  const t = Tools.execSpecialistTool(req("analyze_peak_hours"), p, SCOPE);
  assert.equal(t.ok, false);
  console.log("ok - 6 missing timestamps = honest limitation");
}
// 7. Scenario results distinguish calculations from assumptions.
{
  const t = Tools.execSpecialistTool(req("evaluate_scenario", { assumption: "10pct price hike", change_pct: 10 }), pkg([SALES]), SCOPE);
  assert.equal(t.ok, true);
  assert.equal(t.evidence.length, 2);
  assert.equal(t.evidence[1].source, "analytical");
  assert.match(t.evidence[1].completeness, /assumption, not verified fact/);
  console.log("ok - 7 scenario calc separated from assumption");
}
// 8. Specialist tool allowlist rejects unknown tools.
{
  for (const bad of ["run_sql", "exec_code", "query_db", "supabase_select"]) {
    const t = Tools.execSpecialistTool(req(bad), pkg([SALES]), SCOPE);
    assert.equal(t.ok, false);
    assert.match(t.error || "", /allowlisted/);
  }
  console.log("ok - 8 allowlist rejects unknown/arbitrary tools");
}
// 9. Invalid specialist tool arguments are rejected.
{
  assert.equal(Tools.execSpecialistTool(req("compare_metrics", {}), pkg([CMP]), SCOPE).ok, false);
  assert.equal(Tools.execSpecialistTool(req("evaluate_variance", { dimension: "profit" }), pkg([CMP]), SCOPE).ok, false);
  assert.equal(Tools.execSpecialistTool(req("evaluate_scenario", { assumption: "", change_pct: NaN }), pkg([SALES]), SCOPE).ok, false);
  assert.equal(Tools.execSpecialistTool(req("inspect_evidence", {}, { businessId: "biz-B", rangeStart: SCOPE.rangeStart, rangeEnd: SCOPE.rangeEnd }), pkg([SALES]), SCOPE).ok, false);
  assert.equal(Tools.execSpecialistTool(req("inspect_evidence", {}, { businessId: "biz-a", rangeStart: "2026-09-01", rangeEnd: "2026-09-30" }), pkg([SALES]), SCOPE).ok, false);
  console.log("ok - 9 invalid args + scope mismatches rejected");
}
// 10. Specialist output validation catches unsupported claims.
{
  const bad = Val.validateSpecialistOutput("Revenue crashed to Rs.9,99,999.00, down -87.5pct, caused by low footfall.", pkg([SALES]));
  assert.ok(bad.warnings.length > 0);
  const causal = Val.validateSpecialistOutput("The drop was caused by rain with no data.", pkg([CMP]));
  assert.ok(causal.warnings.some((w) => /causal/i.test(w)));
  const good = Val.validateSpecialistOutput("Total sales: Rs.1,000.00 (sales.total.1). Contributing factors need more data.", pkg([SALES]));
  assert.equal(good.ok, true);
  console.log("ok - 10 output validation flags unsupported claims");
}
// 11. Baseten unconfigured path is honest.
{
  ["BASETEN_API_KEY", "BASETEN_BASE_URL", "BASETEN_MUSE_SPARK_MODEL_ID", "BASETEN_MODEL_ID"].forEach((k) => { delete process.env[k]; });
  const B = require("../lib/ai/baseten.ts");
  const g = B.basetenConfigured();
  assert.equal(g.configured, false);
  assert.match(g.reason, /not configured/i);
  assert.equal(Cfg.providerStatus().baseten.configured, false);
  console.log("ok - 11 unconfigured path honest (no invented endpoint)");
}
// 12. Baseten timeout/error path is honest (mocked fetch, 500 + 1 retry).
{
  const B = require("../lib/ai/baseten.ts");
  process.env.BASETEN_API_KEY = "test-key";
  process.env.BASETEN_BASE_URL = "https://inference.baseten.co/v1";
  process.env.BASETEN_MUSE_SPARK_MODEL_ID = "meta-models/muse-spark-open-1026";
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("boom", { status: 500 }); };
  B.callBasetenSpecialist("sys", "user", 50).then(
    () => { console.error("expected throw"); process.exit(1); },
    (e) => {
      assert.match(e.message, /Baseten specialist HTTP 500/);
      assert.equal(calls, 2, "one controlled retry on 500");
      assert.equal(B.isRetryableBasetenError(e), true);
      assert.equal(B.isRetryableBasetenError(Object.assign(new Error("denied"), { status: 401 })), false);
      globalThis.fetch = realFetch;
      console.log("ok - 12 timeout/error honest + single retry on 5xx only");
      step13();
    },
  );
}
function step13() {
// 13. Fireworks is never misrepresented as Baseten.
  {
    const orch = fs.readFileSync(path.join(ROOT, "lib/ai/orchestrate.ts"), "utf8");
    assert.ok(orch.includes("answered by the reasoning fallback, not Baseten specialist analysis"));
    const prov = fs.readFileSync(path.join(ROOT, "lib/ai/providers.ts"), "utf8");
    assert.ok(prov.includes("Never presented as Baseten"));
    console.log("ok - 13 fireworks never misrepresented as Baseten");
  }
// 14. Standard remains the final response composer.
  {
    const orch = fs.readFileSync(path.join(ROOT, "lib/ai/orchestrate.ts"), "utf8");
    assert.ok(orch.includes("callMetaStandard(built.system"));
    assert.ok(P.STANDARD_SYSTEM.includes("ALWAYS the final response composer"));
    assert.ok(P.SPECIALIST_SYSTEM.includes("NOT the user-facing COO"));
    console.log("ok - 14 Standard composes final answer; specialist memo-only");
  }
// 15. Tenant/business scope is preserved.
  {
    const cross = Tools.execSpecialistTool(req("inspect_evidence", {}, { businessId: "biz-evil", rangeStart: SCOPE.rangeStart, rangeEnd: SCOPE.rangeEnd }), pkg([SALES]), SCOPE);
    assert.equal(cross.ok, false);
    const spec = P.buildSpecialistPrompt({ kind: "rca", question: "why?", businessLine: "Biz A (biz-a) - INR - Asia/Kolkata", contextLines: [], evidence: pkg([SALES]), historyLines: [] });
    assert.ok(spec.user.includes("biz-a") || spec.user.includes("Biz A"));
    console.log("ok - 15 tenant/business scope preserved");
  }
// 16. Slice 1-4 behavior remains intact.
  {
    const Intent = require("../lib/ai/intent.ts");
    assert.equal(Intent.preRouteIntent("hi").intent, "greeting");
    assert.ok(Cfg.aiConfig().metaModelId === "muse-spark-1.3");
    assert.ok(Cfg.aiConfig().fireworksModelId === "accounts/fireworks/models/muse-spark-open");
    assert.equal(Tools.SPECIALIST_TOOL_ALLOWLIST.length, 7);
    assert.ok(P.compactEvidenceForSpecialist(pkg([SALES, CMP, PEAK])).includes("sales.total.1"));
    console.log("ok - 16 slice 1-4 contracts intact");
  }
  console.log("ALL SLICE 5 CHECKS PASSED");
}
