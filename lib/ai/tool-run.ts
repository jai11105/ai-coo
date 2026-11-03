// Slice 7 Stage 1 — execution over EXISTING deterministic executors.
import { compareRange } from "../analytics";
import type { DateRangeSel, MockTransaction } from "../types";
import type { EvidenceItem, EvidencePackage } from "./evidence";
import { identifyCandidates, rankCandidates } from "./priorities";
import type { CopilotToolName } from "./tool-defs";
import { validateCopilotToolCall, type ScopeGate, type ToolReq } from "./tool-exec";
import { toolBusinessOverview, toolExpenses, toolProfit, toolPurchases, toolSales, type ToolContext } from "./tools";
import { toolCategories, toolChannels, toolProducts, toolTopProductByQty } from "./tools-dims";
import { toolCompare, toolCompareDimension, toolTrends } from "./tools-trends";
import { toolPeakHours, toolRecent } from "./tools-peak";
export interface ExecBase {
  transactions: MockTransaction[]; scope: ToolContext["scope"];
  range: DateRangeSel; preset: string; nowIso: string;
}
export interface ToolResult {
  ok: boolean; tool: string; toolCallId?: string; evidence?: EvidenceItem[];
  summary?: string; error?: string; latencyMs?: number;
}
export function execCopilotTool(req: ToolReq, base: ExecBase, scope: ScopeGate): ToolResult {
  const t0 = Date.now();
  const v = validateCopilotToolCall(req, scope);
  if (!v.ok) return { ok: false, tool: String(req.name), toolCallId: req.toolCallId, error: v.error, latencyMs: Date.now() - t0 };
  const args = v.args ?? {};
  const ctx: ToolContext = { transactions: base.transactions, scope: base.scope, range: base.range, preset: base.preset, nowIso: base.nowIso };
  try {
    let pkg: EvidencePackage | null = null;
    switch (req.name as CopilotToolName) {
      case "get_business_overview": pkg = toolBusinessOverview(ctx).pkg; break;
      case "get_sales": pkg = toolSales(ctx); break;
      case "get_profit": pkg = toolProfit(ctx); break;
      case "get_expenses": pkg = toolExpenses(ctx); break;
      case "get_purchases": pkg = toolPurchases(ctx); break;
      case "get_products": pkg = toolProducts(ctx, typeof args.limit === "number" ? args.limit : 5); break;
      case "get_top_product_by_qty": pkg = toolTopProductByQty(ctx, typeof args.limit === "number" ? args.limit : 5); break;
      case "get_categories": pkg = toolCategories(ctx); break;
      case "get_channels": pkg = toolChannels(ctx); break;
      case "get_trends": pkg = toolTrends(ctx); break;
      case "get_comparison": pkg = toolCompare(ctx, (args.mode as "Previous Period" | "Same Period Last Year" | undefined) ?? "Previous Period"); break;
      case "get_peak_hours": pkg = toolPeakHours(ctx); break;
      case "get_recent": pkg = toolRecent(ctx, typeof args.limit === "number" ? args.limit : 5); break;
      case "get_compare_dimension":
      case "rank_business_priorities": break;
      default: return { ok: false, tool: String(req.name), toolCallId: req.toolCallId, error: `Unhandled tool "${String(req.name)}".`, latencyMs: Date.now() - t0 };
    }
    if (req.name === "get_compare_dimension") {
      const dim = String(args.dimension) as "product" | "category" | "channel";
      const mode = (args.mode as string | undefined) ?? "Previous Period";
      const prev = compareRange(ctx.range, mode as "Previous Period" | "Same Period Last Year");
      pkg = toolCompareDimension(ctx, dim, prev, typeof args.limit === "number" ? args.limit : 8);
    }
    if (req.name === "rank_business_priorities") {
      const merged = mergePkgs([toolBusinessOverview(ctx).pkg, toolProducts(ctx), toolCategories(ctx), toolChannels(ctx), toolPeakHours(ctx)]);
      const ranked = rankCandidates(identifyCandidates(merged));
      if (ranked.length === 0) return { ok: false, tool: req.name, toolCallId: req.toolCallId, error: "No evidence-backed priorities identified — do not invent any.", latencyMs: Date.now() - t0 };
      const limit = typeof args.limit === "number" ? args.limit : Math.min(3, ranked.length);
      const top = ranked.slice(0, limit);
      const lines = top.map((c, i) => `${i + 1}. [${c.severity}] ${c.title} — ${c.impactLabel} (refs: ${c.evidenceRefs.join(", ")})`);
      return { ok: true, tool: req.name, toolCallId: req.toolCallId, evidence: merged.items.filter((i) => top.some((c) => c.evidenceRefs.includes(i.id))).slice(0, 8), summary: `Ranked priorities (priority-rank-v1):\n${lines.join("\n")}`, latencyMs: Date.now() - t0 };
    }
    if (!pkg) return { ok: false, tool: req.name, toolCallId: req.toolCallId, error: "Tool returned no evidence.", latencyMs: Date.now() - t0 };
    if (pkg.items.length === 0) {
      return { ok: false, tool: req.name, toolCallId: req.toolCallId, error: pkg.warnings[0] || "No verified rows for this tool in range.", latencyMs: Date.now() - t0 };
    }
    return { ok: true, tool: req.name, toolCallId: req.toolCallId, evidence: pkg.items.slice(0, 8), summary: `${pkg.items.length} verified item(s) via ${req.name}.`, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, tool: String(req.name), toolCallId: req.toolCallId, error: e instanceof Error ? e.message.slice(0, 300) : "Tool execution failed.", latencyMs: Date.now() - t0 };
  }
}
function mergePkgs(pkgs: EvidencePackage[]): EvidencePackage {
  const items: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const p of pkgs) for (const i of p.items) { if (!seen.has(i.id)) { seen.add(i.id); items.push(i); } }
  return { ...pkgs[0], items, warnings: pkgs.flatMap((p) => p.warnings).slice(0, 8) };
}
export function toolResultPayload(r: ToolResult): string {
  if (!r.ok) return JSON.stringify({ ok: false, tool: r.tool, error: r.error || "Tool failed." }).slice(0, 2000);
  const rows = (r.evidence ?? []).slice(0, 8).map((i) => ({ id: i.id, metric: i.metric, label: i.label, display: i.display }));
  return JSON.stringify({ ok: true, tool: r.tool, summary: r.summary || "", rows }).slice(0, 4000);
}
