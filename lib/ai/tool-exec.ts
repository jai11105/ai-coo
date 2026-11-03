// Slice 7 Stage 1 — validation (single path, strict schema/scope).
import { COPILOT_TOOL_ALLOWLIST, type CopilotToolName } from "./tool-defs";
export interface ScopeGate { businessId: string; rangeStart: string; rangeEnd: string }
export interface ToolReq {
  name: string; args: Record<string, unknown>; businessId: string;
  rangeStart: string; rangeEnd: string; toolCallId?: string;
}
function isRec(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function sqlish(s: string): boolean {
  return /select\s|insert\s|update\s|delete\s|drop\s|;\s*--|supabase|exec\s*\(|database/i.test(s);
}
const intIn = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const MODE_OK = (m: unknown): boolean => m === "Previous Period" || m === "Same Period Last Year";
export function validateCopilotToolCall(req: ToolReq, scope: ScopeGate): { ok: boolean; error?: string; args?: Record<string, unknown> } {
  if (!COPILOT_TOOL_ALLOWLIST.includes(req.name as CopilotToolName)) {
    return { ok: false, error: `Unknown tool "${String(req.name)}" — allowlisted tools only.` };
  }
  if (req.businessId !== scope.businessId) return { ok: false, error: "Business scope mismatch — request rejected." };
  if (req.rangeStart !== scope.rangeStart || req.rangeEnd !== scope.rangeEnd) {
    return { ok: false, error: "Timeframe scope mismatch — request rejected." };
  }
  const args = isRec(req.args) ? req.args : {};
  if (sqlish(JSON.stringify(args)) || sqlish(String(req.name))) {
    return { ok: false, error: "Arbitrary data access rejected — deterministic evidence only." };
  }
  if ("__malformed" in args) return { ok: false, error: `Malformed arguments for ${req.name} — JSON object required.` };
  switch (req.name) {
    case "get_products":
    case "get_top_product_by_qty":
      if (args.limit !== undefined && !intIn(args.limit, 1, 8)) return { ok: false, error: `${req.name} limit must be integer 1..8.` };
      break;
    case "get_recent":
      if (args.limit !== undefined && !intIn(args.limit, 1, 10)) return { ok: false, error: "get_recent limit must be integer 1..10." };
      break;
    case "rank_business_priorities":
      if (args.limit !== undefined && !intIn(args.limit, 1, 3)) return { ok: false, error: "rank_business_priorities limit must be integer 1..3." };
      break;
    case "get_comparison":
      if (args.mode !== undefined && !MODE_OK(args.mode)) return { ok: false, error: "get_comparison mode must be Previous Period or Same Period Last Year." };
      break;
    case "get_compare_dimension":
      if (args.dimension !== "product" && args.dimension !== "category" && args.dimension !== "channel") {
        return { ok: false, error: "get_compare_dimension dimension must be product, category, or channel." };
      }
      if (args.mode !== undefined && !MODE_OK(args.mode)) return { ok: false, error: "get_compare_dimension mode must be Previous Period or Same Period Last Year." };
      if (args.limit !== undefined && !intIn(args.limit, 1, 8)) return { ok: false, error: "get_compare_dimension limit must be integer 1..8." };
      break;
    default: break;
  }
  const allowedKeys: Record<string, string[]> = {
    get_products: ["limit"], get_top_product_by_qty: ["limit"], get_recent: ["limit"],
    rank_business_priorities: ["limit"], get_comparison: ["mode"],
    get_compare_dimension: ["dimension", "mode", "limit"],
  };
  const allowed = allowedKeys[req.name] ?? [];
  for (const k of Object.keys(args)) {
    if (!allowed.includes(k)) return { ok: false, error: `Unexpected argument "${k}" for ${req.name}.` };
  }
  return { ok: true, args };
}
export function parseToolCalls(choiceMessage: unknown): { id: string; name: string; args: Record<string, unknown> }[] {
  if (!choiceMessage || typeof choiceMessage !== "object") return [];
  const m = choiceMessage as { tool_calls?: unknown };
  if (!Array.isArray(m.tool_calls)) return [];
  const out: { id: string; name: string; args: Record<string, unknown> }[] = [];
  for (const tc of m.tool_calls) {
    const t = tc as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    const fname = t?.function?.name;
    if (typeof fname !== "string" || !fname) continue;
    let args: Record<string, unknown> = {};
    const rawArgs = t?.function?.arguments;
    try {
      if (typeof rawArgs === "string") {
        const parsed: unknown = JSON.parse(rawArgs || "{}");
        if (isRec(parsed)) args = parsed;
      } else if (isRec(rawArgs)) args = rawArgs;
    } catch { args = { __malformed: String(rawArgs).slice(0, 200) }; }
    out.push({ id: typeof t.id === "string" ? t.id : `call_${out.length}`, name: fname.slice(0, 80), args });
  }
  return out;
}
