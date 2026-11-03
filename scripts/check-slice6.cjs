// Slice 6 regression: priority recommendations engine (mocked I/O only).
// Run: node -r sucrase/register scripts/check-slice6.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const Prio = require("../lib/ai/priorities.ts");
const Tools = require("../lib/ai/specialist-tools.ts");
const P = require("../lib/ai/prompts.ts");
const Cfg = require("../lib/ai/config.ts");
const Ctx = require("../lib/ai/context.ts");
const F = require("../lib/ai/followup.ts");
const Sel = require("../lib/ai/select-evidence.ts");

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
function pkg(items, warnings, intent) {
  return {
    packageId: "pkg.test", question: "q", intent: intent || "recommendation",
    timeframe: { start: "2026-10-01", end: "2026-10-31", preset: "This Month" },
    items, warnings: warnings || [], generatedAt: "2026-11-02T00:00:00.000Z",
  };
}
const REV = item({
  id: "compare.a", metric: "compare_revenue", label: "Revenue vs Previous Period",
  valueMinor: 100000, display: "Rs.1,000.00 vs Rs.1,500.00 (-33.3%)",
  dims: { metric: "revenue" },
  cmp: { prevStart: "2026-09-01", prevEnd: "2026-09-30", currentMinor: 100000, previousMinor: 150000, diffMinor: -50000, pct: -33.3 },
});
const EXP = item({
  id: "compare.b", metric: "compare_expenses", label: "Expenses vs Previous Period",
  valueMinor: 80000, display: "Rs.800.00 vs Rs.600.00 (+33.3%)",
  dims: { metric: "expenses" },
  cmp: { prevStart: "2026-09-01", prevEnd: "2026-09-30", currentMinor: 80000, previousMinor: 60000, diffMinor: 20000, pct: 33.3 },
});
const PROD1 = item({
  id: "product.rank.a", metric: "product_revenue", label: "Product #1: Rice",
  valueMinor: 90000, display: "Rs.900.00 - 9 units", dims: { product: "Rice", category: "G", type: "sale" },
});
const PROD2 = item({
  id: "product.rank.b", metric: "product_revenue", label: "Product #2: Oil",
  valueMinor: 10000, display: "Rs.100.00 - 1 unit", dims: { product: "Oil", category: "G", type: "sale" },
});
const SCOPE = { businessId: "biz-a", rangeStart: "2026-10-01", rangeEnd: "2026-10-31" };
function req(tool, input, scope) {
  const s = scope || SCOPE;
  return { tool, input: input || {}, businessId: s.businessId, rangeStart: s.rangeStart, rangeEnd: s.rangeEnd };
}
// 1. Priority question is correctly identified.
{
  assert.equal(Prio.isPriorityQuestion("What should I focus on first?"), true);
  assert.equal(Prio.isPriorityQuestion("What are my top three business priorities?"), true);
  assert.equal(Prio.isPriorityQuestion("Where am I losing the most money?"), true);
  assert.equal(Prio.isPriorityQuestion("Rank my biggest business opportunities."), true);
  assert.equal(Prio.isPriorityQuestion("What should I do this week?"), true);
  assert.equal(Prio.isPriorityQuestion("Which problem should I solve immediately?"), true);
  console.log("ok - 1 priority question identified");
}
// 2. Simple metric lookup does not invoke priority analysis.
{
  assert.equal(Prio.isPriorityQuestion("What are my sales this month?"), false);
  assert.equal(Prio.isPriorityQuestion("How much profit did I make?"), false);
  assert.equal(Prio.isPriorityQuestion("Show me expenses."), false);
  const Orch = require("../lib/ai/orchestrator.ts");
  assert.equal(Orch.detectMetricIntent("how much profit?"), "metric");
  assert.equal(Orch.detectMetricIntent("What should I focus on first?"), "recommendation");
  assert.equal(Orch.detectMetricIntent("Where am I losing the most money?"), "recommendation");
  assert.equal(Orch.detectMetricIntent("Rank my biggest business opportunities."), "recommendation");
  assert.equal(Orch.detectMetricIntent("Which problem should I solve immediately?"), "recommendation");
  assert.equal(Orch.detectMetricIntent("compare product performance across two periods"), "product");
  assert.equal(Orch.detectMetricIntent("which products declined?"), "product");
  console.log("ok - 2 simple metric lookup skips priority analysis");
}
// 3. Candidates derived from deterministic evidence.
{
  const c = Prio.identifyCandidates(pkg([REV, EXP, PROD1, PROD2]));
  assert.ok(c.length >= 2, "expected >=2 candidates");
  assert.ok(c.some((x) => x.id === "prio-sales-decline"));
  assert.ok(c.every((x) => x.evidenceRefs.length > 0));
  assert.equal(Prio.identifyCandidates(pkg([])).length, 0);
  console.log("ok - 3 candidates from deterministic evidence");
}
// 4. Ranking is consistent and explainable.
{
  const a = Prio.rankCandidates(Prio.identifyCandidates(pkg([REV, EXP, PROD1, PROD2])));
  const b = Prio.rankCandidates(Prio.identifyCandidates(pkg([REV, EXP, PROD1, PROD2])));
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.ok(a[0].severity === "critical-issue" || a[0].severity === "high-priority-issue");
  assert.ok(Prio.RANKING_METHODOLOGY_NOTE.includes("priority-rank-v1"));
  assert.equal(Prio.PRIORITY_RANKING_VERSION, "priority-rank-v1");
  console.log("ok - 4 ranking consistent + explainable");
}

// 5. Evidence strength affects confidence.
{
  const ranked = Prio.rankCandidates(Prio.identifyCandidates(pkg([REV, EXP, PROD1, PROD2])));
  const recs = Prio.toRecommendations(ranked);
  const strong = recs.filter((r) => r.severity !== "monitor");
  assert.ok(strong.every((r) => ["high", "medium", "low"].includes(r.confidence)));
  const warnPkg = pkg([PROD1], ["Only 1/5 carry usable timestamps."]);
  const wc = Prio.identifyCandidates(warnPkg);
  assert.ok(wc.some((x) => x.severity === "monitor"));
  console.log("ok - 5 evidence strength affects confidence");
}
// 6. Missing evidence does not produce invented values.
{
  assert.deepEqual(Prio.toRecommendations(Prio.rankCandidates(Prio.identifyCandidates(pkg([])))), []);
  const w = Prio.validateRecommendations([], pkg([]));
  assert.ok(w.some((x) => /no recommendations/i.test(x)));
  console.log("ok - 6 missing evidence -> no invented values");
}
// 7. Fewer than three when fewer justified.
{
  const steady = pkg([item({ id: "sales.total.1", metric: "total_sales", label: "Total sales", valueMinor: 100000, display: "Rs.1,000.00" })]);
  const recs = Prio.toRecommendations(Prio.rankCandidates(Prio.identifyCandidates(steady)));
  assert.ok(recs.length <= 3 && recs.length >= 1);
  console.log("ok - 7 fewer than three when justified");
}
// 8. Duplicate recommendations rejected.
{
  const ranked = Prio.rankCandidates(Prio.identifyCandidates(pkg([REV, EXP, PROD1, PROD2])));
  const recs = Prio.toRecommendations(ranked);
  const dup = [...recs, Object.assign({}, recs[0])];
  const w = Prio.validateRecommendations(dup, pkg([REV, EXP, PROD1, PROD2]));
  assert.ok(w.some((x) => /duplicate/i.test(x)));
  console.log("ok - 8 duplicates rejected");
}
// 9. Supporting evidence references are valid.
{
  const ranked = Prio.rankCandidates(Prio.identifyCandidates(pkg([REV, EXP, PROD1, PROD2])));
  const recs = Prio.toRecommendations(ranked);
  assert.deepEqual(Prio.validateRecommendations(recs, pkg([REV, EXP, PROD1, PROD2])), []);
  const bad = [Object.assign({}, recs[0], { evidenceRefs: ["nope.missing"] })];
  assert.ok(Prio.validateRecommendations(bad, pkg([REV, EXP, PROD1, PROD2])).some((x) => /invalid evidence reference/i.test(x)));
  const noEv = [Object.assign({}, recs[0], { evidenceRefs: [] })];
  assert.ok(Prio.validateRecommendations(noEv, pkg([REV, EXP, PROD1, PROD2])).some((x) => /no supporting evidence/i.test(x)));
  console.log("ok - 9 evidence refs valid");
}
// 10. Historical facts and projected impacts distinguished.
{
  const recs = Prio.toRecommendations(Prio.rankCandidates(Prio.identifyCandidates(pkg([REV, EXP, PROD1, PROD2]))));
  assert.ok(recs.every((r) => ["verified", "calculated", "estimate", "qualitative"].includes(r.expectedImpact.kind)));
  assert.ok(recs.some((r) => r.expectedImpact.kind === "verified"));
  assert.ok(!/you are guaranteed|guaranteed profit|guaranteed improvement/i.test(recs.map((r) => r.expectedImpact.text).join(" ")));
  console.log("ok - 10 impact kinds distinguished");
}
// 11. Risks and constraints represented.
{
  const recs = Prio.toRecommendations(Prio.rankCandidates(Prio.identifyCandidates(pkg([REV, EXP, PROD1, PROD2]))));
  assert.ok(recs.every((r) => r.risks && r.constraints && r.nextStep && r.action && r.whyItMatters));
  console.log("ok - 11 risks + constraints present");
}
// 12. Baseten receives only relevant compact evidence.
{
  const spec = P.buildSpecialistPrompt({
    kind: "recommendation", question: "What should I focus on?",
    businessLine: "Biz A (biz-a) - INR - Asia/Kolkata", contextLines: [],
    evidence: pkg([REV, EXP, PROD1, PROD2]), historyLines: [],
  });
  assert.ok(spec.user.length <= 4000, "compact payload bounded");
  assert.ok(spec.user.includes("compare.a") || spec.user.includes("Revenue"));
  const block = P.priorityCandidatesBlock([{ id: "prio-x", title: "T", severity: "critical-issue", impactLabel: "L", evidenceRefs: [REV.id], urgency: "high" }]);
  assert.ok(block.includes("priority-rank-v1") && block.includes("compare.a"));
  console.log("ok - 12 Baseten compact evidence only");
}


// 13-15. Baseten unconfigured path honest; failure honest; fireworks never baseten.
{
  ["BASETEN_API_KEY", "BASETEN_BASE_URL", "BASETEN_MUSE_SPARK_MODEL_ID", "BASETEN_MODEL_ID"].forEach((k) => { delete process.env[k]; });
  const B = require("../lib/ai/baseten.ts");
  assert.equal(B.basetenConfigured().configured, false);
  const orch = fs.readFileSync(path.join(ROOT, "lib/ai/orchestrate.ts"), "utf8");
  assert.ok(orch.includes("not specialist-interpreted") || orch.includes("Specialist analysis unavailable"));
  assert.ok(orch.includes("answered by the reasoning fallback, not Baseten specialist analysis"));
  const prov = fs.readFileSync(path.join(ROOT, "lib/ai/providers.ts"), "utf8");
  assert.ok(prov.includes("Never presented as Baseten"));
  console.log("ok - 13/14/15 baseten honesty + fireworks never baseten");
}
// 16. Standard remains final composer.
{
  const orch = fs.readFileSync(path.join(ROOT, "lib/ai/orchestrate.ts"), "utf8");
  assert.ok(orch.includes("callMetaStandard(built.system"));
  assert.ok(P.STANDARD_SYSTEM.includes("ALWAYS the final response composer"));
  console.log("ok - 16 Standard composes final answer");
}
// 17-18. Follow-up preserves priority context; ambiguous triggers clarification.
{
  Ctx.clearAllConversations();
  const s = Ctx.getConversation("c_prio_1", "biz-a");
  Ctx.updateState(s, {
    intent: "recommendation", metric: "overview",
    timeframe: { start: "2026-10-01", end: "2026-10-31", preset: "This Month" },
    analysisType: "recommendation",
    activePriorities: [
      { id: "prio-sales-decline", title: "Reverse the sales decline", priority: 1, severity: "critical-issue", type: "problem" },
      { id: "prio-expense-rise", title: "Review rising expenses", priority: 2, severity: "operational-improvement", type: "problem" },
    ],
    evidenceRefs: ["compare.a"], dataVersion: "v1",
  });
  const r1 = F.mergeFallback("What is the most urgent one?", s);
  assert.equal(r1.resolvedIntent, "recommendation");
  assert.equal(r1.requiresClarification, false);
  const ref = Prio.resolvePriorityReference("What is the most urgent one?", s.activePriorities);
  assert.deepEqual([ref.kind, ref.index], ["specific", 0]);
  const ref2 = Prio.resolvePriorityReference("What about the second priority?", s.activePriorities);
  assert.deepEqual([ref2.kind, ref2.index], ["specific", 1]);
  const amb = Prio.resolvePriorityReference("Can I do both?", s.activePriorities);
  assert.equal(amb.kind, "ambiguous");
  assert.ok(amb.clarification && amb.clarification.includes("or"));
  const rAmb = F.mergeFallback("Can I do both?", s);
  assert.equal(rAmb.requiresClarification, true);
  console.log("ok - 17/18 priority follow-up + clarification");
}
// 19. Stale evidence not reused.
{
  Ctx.clearAllConversations();
  const s = Ctx.getConversation("c_stale", "biz-a");
  Ctx.updateState(s, {
    intent: "recommendation", timeframe: { start: "2026-10-01", end: "2026-10-31", preset: "This Month" },
    evidenceRefs: ["compare.a"], dataVersion: "v1",
  });
  assert.deepEqual(Ctx.freshEvidenceRefs(s, "biz-a", "2026-09-01..2026-09-30", "v1"), []);
  assert.deepEqual(Ctx.freshEvidenceRefs(s, "biz-a", "2026-10-01..2026-10-31", "v2"), []);
  assert.ok(Ctx.freshEvidenceRefs(s, "biz-a", "2026-10-01..2026-10-31", "v1").includes("compare.a"));
  console.log("ok - 19 stale evidence rejected");
}
// 20. Tenant scope isolated + strict tool contract.
{
  const cross = Tools.execSpecialistTool(
    req("rank_business_priorities", {}, { businessId: "biz-evil", rangeStart: SCOPE.rangeStart, rangeEnd: SCOPE.rangeEnd }),
    pkg([REV]), SCOPE
  );
  assert.equal(cross.ok, false);
  assert.match(cross.error, /scope mismatch/i);
  const badLimit = Tools.execSpecialistTool(req("rank_business_priorities", { limit: 9 }), pkg([REV]), SCOPE);
  assert.equal(badLimit.ok, false);
  const badSev = Tools.execSpecialistTool(req("rank_business_priorities", { severity_filter: "urgent" }), pkg([REV]), SCOPE);
  assert.equal(badSev.ok, false);
  const good = Tools.execSpecialistTool(req("rank_business_priorities", { limit: 2 }), pkg([REV, EXP, PROD1, PROD2]), SCOPE);
  assert.equal(good.ok, true);
  assert.ok(good.summary.includes("priority-rank-v1"));
  const sql = Tools.execSpecialistTool(req("rank_business_priorities", { note: "select * from db" }), pkg([REV]), SCOPE);
  assert.equal(sql.ok, false);
  console.log("ok - 20 tenant scope + strict tool contract");
}
// 21. Slice 1-5 intact.
{
  const Spec = require("../lib/ai/specialist.ts");
  const Intent = require("../lib/ai/intent.ts");
  const SVal = require("../lib/ai/specialist-validate.ts");
  const VAns = require("../lib/ai/validate.ts");
  assert.equal(Intent.preRouteIntent("hi").intent, "greeting");
  assert.equal(Spec.decideSpecialistNeed("metric", "how much profit?", pkg([REV])).needed, false);
  assert.ok(Cfg.aiConfig().metaModelId === "muse-spark-1.3");
  assert.ok(Cfg.aiConfig().fireworksModelId === "accounts/fireworks/models/muse-spark-open");
  assert.equal(Tools.SPECIALIST_TOOL_ALLOWLIST.length, 7);
  assert.ok(Cfg.PROMPT_VERSION.includes("slice6"));
  const vBad = SVal.validateSpecialistOutput("Priority 1 will guarantee profit. No qualification.", pkg([REV]));
  assert.ok(vBad.warnings.some((x) => /qualify|guarantee/i.test(x)));
  const va = VAns.validateAnswer("Your top priority is urgent and guaranteed to double profit.", pkg([REV]));
  assert.ok(va.some((x) => /guaranteed|urgent/i.test(x)));
  console.log("ok - 21 slices 1-5 intact");
}
console.log("ALL SLICE 6 CHECKS PASSED");
