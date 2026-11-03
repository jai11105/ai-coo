// Slice 7 Stage 1 — Copilot tool definitions (single registry, no duplicates).
// Reuses existing deterministic executors only. OpenAI-compatible shape for
// Meta Muse Spark Standard + Fireworks Muse Spark Open chat/completions.
export const COPILOT_TOOL_ALLOWLIST = [
  "get_business_overview",
  "get_sales",
  "get_profit",
  "get_expenses",
  "get_purchases",
  "get_products",
  "get_top_product_by_qty",
  "get_categories",
  "get_channels",
  "get_trends",
  "get_comparison",
  "get_compare_dimension",
  "get_peak_hours",
  "get_recent",
  "rank_business_priorities",
] as const;
export type CopilotToolName = (typeof COPILOT_TOOL_ALLOWLIST)[number];
export interface CopilotToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
const INT = (lo: number, hi: number) => ({ type: "integer", minimum: lo, maximum: hi });
export const COPILOT_TOOL_DEFINITIONS: CopilotToolDefinition[] = [
  { type: "function", function: { name: "get_business_overview", description: "Verified totals: revenue, COGS, gross/net profit, expenses, purchases + counts.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_sales", description: "Verified sales slice (revenue, COGS, gross).", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_profit", description: "Verified profit slice. Never estimated.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_expenses", description: "Verified expenses slice.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_purchases", description: "Verified stock purchases (never COGS).", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_products", description: "Top products by verified revenue.", parameters: { type: "object", properties: { limit: INT(1, 8) }, additionalProperties: false } } },
  { type: "function", function: { name: "get_top_product_by_qty", description: "Top products by verified units only.", parameters: { type: "object", properties: { limit: INT(1, 8) }, additionalProperties: false } } },
  { type: "function", function: { name: "get_categories", description: "Type-separated category breakdown.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_channels", description: "Sales by recorded channel only.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_trends", description: "Deterministic daily revenue trend + peak day.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_comparison", description: "Totals comparison across two periods.", parameters: { type: "object", properties: { mode: { type: "string", enum: ["Previous Period", "Same Period Last Year"] } }, additionalProperties: false } } },
  { type: "function", function: { name: "get_compare_dimension", description: "Dimension comparison (product/category/channel).", parameters: { type: "object", properties: { dimension: { type: "string", enum: ["product", "category", "channel"] }, mode: { type: "string", enum: ["Previous Period", "Same Period Last Year"] }, limit: INT(1, 8) }, required: ["dimension"], additionalProperties: false } } },
  { type: "function", function: { name: "get_peak_hours", description: "Peak revenue hours from timestamps.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_recent", description: "Latest persisted transactions.", parameters: { type: "object", properties: { limit: INT(1, 10) }, additionalProperties: false } } },
  { type: "function", function: { name: "rank_business_priorities", description: "Deterministic priority-rank-v1 ranking (max 3).", parameters: { type: "object", properties: { limit: INT(1, 3) }, additionalProperties: false } } },
];
export const MAX_TOOL_ROUNDS = 3;
export const MAX_TOOL_CALLS_PER_TURN = 4;
export const TOOL_LOOP_TIMEOUT_MS = 25000;

/** Intent → allowed Copilot tool names (§4A: intent-specific tools only).
 *  Greetings/casual/unclear get NO tools; metric questions get only the
 *  relevant slice; image requests get none (direct image route, no tool loop).
 *  Names are the exact allowlisted executor names above — never renamed. */
export function toolsForIntent(intent: string, message = ""): CopilotToolDefinition[] {
  const msg = (message || "").toLowerCase();
  const byName = (names: string[]) =>
    COPILOT_TOOL_DEFINITIONS.filter((d) => names.includes(d.function.name));
  switch (intent) {
    case "greeting":
    case "casual":
    case "unclear":
    case "image":
      return [];
    case "metric":
    case "summary": {
      if (/\b(purchases?|stock)\b/.test(msg) && !/\bsales?\b/.test(msg)) return byName(["get_purchases"]);
      if (/\bexpenses?|overhead|rent|salar/.test(msg)) return byName(["get_expenses"]);
      if (/\bprofits?|margins?|loss|cogs|buying cost|gross|net\b/.test(msg)) return byName(["get_profit"]);
      if (/\bsales?|revenues?|turnover\b/.test(msg)) return byName(["get_sales"]);
      if (/\bproduct|best.?sell|most sold|top\b/.test(msg)) return byName(["get_products", "get_top_product_by_qty"]);
      if (/\bcategor/.test(msg)) return byName(["get_categories"]);
      if (/\bchannel|payment|upi|\bcash\b|card\b/.test(msg)) return byName(["get_channels"]);
      if (/\btrend\b/.test(msg)) return byName(["get_trends"]);
      if (/\brecent|latest|transaction/.test(msg)) return byName(["get_recent"]);
      if (intent === "summary") return byName(["get_business_overview"]);
      return byName(["get_business_overview", "get_sales"]);
    }
    case "comparison":
      return byName(["get_comparison", "get_compare_dimension"]);
    case "trend":
      return byName(["get_trends"]);
    case "product":
      return byName(["get_products", "get_top_product_by_qty", "get_compare_dimension"]);
    case "category":
      return byName(["get_categories", "get_compare_dimension"]);
    case "channel":
      return byName(["get_channels", "get_compare_dimension"]);
    case "rca":
      // Routine tool-call slice for RCA-class questions answered on the
      // Muse Spark path (evidence shown when the specialist is unavailable):
      // comparison + profit + sales + expenses only. Dimension drills are
      // specialist-evidence (Baseten slice) and are not sent to Spark here.
      return byName(["get_comparison", "get_profit", "get_sales", "get_expenses"]);
    case "recommendation":
      return byName(["rank_business_priorities", "get_business_overview", "get_comparison", "get_products", "get_categories", "get_channels", "get_peak_hours"]);
    case "peak_hours":
      return byName(["get_peak_hours"]);
    case "scenario":
      return byName(["get_business_overview", "get_comparison", "get_profit", "get_expenses", "get_sales"]);
    default:
      return byName(["get_business_overview"]);
  }
}

/** Intent → per-call token budget (§4D: task-specific output budgets).
 *  Greetings are small (no tools); simple metrics stay lean; summaries and
 *  comparisons moderate; deep RCA/recommendation/scenario/peak analysis get
 *  larger budgets where justified (reasoning-model headroom). */
export function maxTokensForIntent(intent: string): number {
  switch (intent) {
    case "greeting":
    case "casual":
    case "unclear":
      return 400;
    case "metric":
      return 1000;
    case "summary":
      return 1200;
    case "comparison":
    case "trend":
    case "product":
    case "category":
    case "channel":
      return 1200;
    case "rca":
    case "recommendation":
    case "peak_hours":
    case "scenario":
      return 1500;
    default:
      return 1200;
  }
}
