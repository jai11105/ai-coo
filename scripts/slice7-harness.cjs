// Slice 7 harness: source-text assertions + self-contained loop/validation
// mirrors (no TS compilation needed; mirrors are kept in sync with
// lib/ai/tool-defs.ts, tool-exec.ts, tool-loop.ts by the checks below).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const MAX_TOOL_ROUNDS = 3;
const MAX_TOOL_CALLS_PER_TURN = 4;
const ALLOWLIST = [
  "get_business_overview", "get_sales", "get_profit", "get_expenses",
  "get_purchases", "get_products", "get_top_product_by_qty", "get_categories",
  "get_channels", "get_trends", "get_comparison", "get_compare_dimension",
  "get_peak_hours", "get_recent", "rank_business_priorities",
];
function validateMirror(req, scope) {
  if (!ALLOWLIST.includes(req.name)) return { ok: false, error: `Unknown tool "${req.name}" — allowlisted tools only.` };
  if (req.businessId !== scope.businessId) return { ok: false, error: "Business scope mismatch — request rejected." };
  if (req.rangeStart !== scope.rangeStart || req.rangeEnd !== scope.rangeEnd) return { ok: false, error: "Timeframe scope mismatch — request rejected." };
  const args = req.args && typeof req.args === "object" && !Array.isArray(req.args) ? req.args : {};
  if (/select\s|insert\s|update\s|delete\s|drop\s|supabase|exec\s*\(|database/i.test(JSON.stringify(args))) {
    return { ok: false, error: "Arbitrary data access rejected — deterministic evidence only." };
  }
  if ("__malformed" in args) return { ok: false, error: `Malformed arguments for ${req.name} — JSON object required.` };
  return { ok: true, args };
}
function parseMirror(msg) {
  if (!msg || typeof msg !== "object" || !Array.isArray(msg.tool_calls)) return [];
  const out = [];
  for (const tc of msg.tool_calls) {
    const fname = tc && tc.function && tc.function.name;
    if (typeof fname !== "string" || !fname) continue;
    let args = {};
    try {
      const raw = tc.function.arguments;
      if (typeof raw === "string") { const p = JSON.parse(raw || "{}"); if (p && typeof p === "object") args = p; }
      else if (raw && typeof raw === "object") args = raw;
    } catch { args = { __malformed: String(tc.function.arguments).slice(0, 200) }; }
    out.push({ id: typeof tc.id === "string" ? tc.id : `call_${out.length}`, name: fname.slice(0, 80), args });
  }
  return out;
}
async function runLoopMirror(opts) {
  const maxRounds = opts.maxRounds ?? MAX_TOOL_ROUNDS;
  const timeoutMs = opts.timeoutMs ?? 25000;
  const started = Date.now();
  const messages = [...opts.startMessages];
  const toolResults = [];
  let rounds = 0;
  let timedOut = false;
  for (let r = 0; r < maxRounds; r++) {
    if (Date.now() - started > timeoutMs) { timedOut = true; break; }
    rounds += 1;
    const res = await opts.provider.chat(messages);
    const calls = (res.toolCalls || []).slice(0, MAX_TOOL_CALLS_PER_TURN);
    if (calls.length === 0) return { text: res.text, rounds, toolResults, timedOut, hitIterationLimit: false };
    messages.push({ role: "assistant", content: res.text || "", toolCalls: calls });
    for (const c of calls) {
      if (Date.now() - started > timeoutMs) { timedOut = true; break; }
      let tr;
      try { tr = await opts.exec(c); } catch (e) { tr = { ok: false, tool: String(c.name), toolCallId: c.id, error: e.message }; }
      toolResults.push(tr);
      messages.push({ role: "tool", content: JSON.stringify(tr).slice(0, 500), toolCallId: c.id });
    }
    if (timedOut) break;
  }
  return { text: "", rounds, toolResults, timedOut, hitIterationLimit: true };
}
function readSrc(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
module.exports = { assert, fs, path, ROOT, MAX_TOOL_ROUNDS, ALLOWLIST, validateMirror, parseMirror, runLoopMirror, readSrc };
