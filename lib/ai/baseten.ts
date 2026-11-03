// Slice 5 — Baseten Data Analyst specialist provider (server-side only).
// Dedicated specialist, NOT a general fallback. Isolated from Meta-primary
// and Fireworks-fallback logic.
//
// Actual deployment contract (from server env, never invented):
// - BASETEN_BASE_URL: deployment base, e.g. https://inference.baseten.co/v1
// - Model/deployment id: BASETEN_MUSE_SPARK_MODEL_ID (preferred) with
//   BASETEN_MODEL_ID accepted as an alias (both observed in the wild).
//   Documented accessible checkpoint: meta-models/muse-spark-open-1026.
// - Transport: OpenAI-compatible POST {base}/chat/completions with
//   { model, messages, temperature, max_tokens } (+ optional tools /
//   tool_choice:"auto" for the Part-4 specialist tool-calling lifecycle).
//   Response choices[0].message: content + optional reasoning_content +
//   optional tool_calls [{id, function:{name, arguments}}].
// - Native tool calling is verified per-response: when the model returns
//   tool_calls they are parsed via the shared parser (lib/ai/tool-exec.ts),
//   validated against the specialist allowlist, executed application-side,
//   and returned as role:"tool" messages before continuing. When the model
//   returns content only (no tool_calls), the single-shot path below is
//   used unchanged — no behavior change for content-only memos.
// - Never expose credentials to the browser. Never log keys/payloads.
// - Timeout 12s (specialist prompts carry compact evidence, slightly larger
//   than Standard's 8s budget) + ONE controlled retry on retryable faults
//   only (timeout/network/429/5xx). Never retry on 4xx validation.

import { aiConfig } from "./config";
import { parseToolCalls } from "./tool-exec";

export interface BasetenSpecialistResult {
  text: string;
  provider: "baseten-specialist";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  retries: number;
  truncated: boolean;
  /** Part 4: native tool-call rounds executed (0 = content-only memo). */
  toolRounds?: number;
  toolCallsExecuted?: { name: string; ok: boolean }[];
}

export interface BasetenToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface BasetenToolsResponse {
  text: string;
  toolCalls: BasetenToolCall[];
  inputTokens?: number;
  outputTokens?: number;
  truncated: boolean;
  finishReason: string | null;
}

export const BASETEN_TIMEOUT_MS = 12000;

// Reasoning budget: muse-spark-open-1026 consumes hidden reasoning tokens from
// the same max_tokens pool as content. 900 truncated full memos live
// (finish_reason "length" + partial content -> partial RCA). 1500 gives the
// ~450-word memo headroom without changing model assignment.
export const BASETEN_MAX_TOKENS_DEFAULT = 1500;

export function basetenConfigured(): { configured: boolean; reason: string; model: string; base: string } {
  const c = aiConfig();
  const model = c.basetenModelId;
  if (!c.basetenApiKey) return { configured: false, reason: "BASETEN_API_KEY is not configured on the server.", model, base: c.basetenBaseUrl };
  if (!c.basetenBaseUrl) return { configured: false, reason: "BASETEN_BASE_URL is not configured — specialist calls gracefully degrade (no invented endpoint).", model, base: "" };
  if (!model) return { configured: false, reason: "Baseten model/deployment ID is not configured (BASETEN_MUSE_SPARK_MODEL_ID or BASETEN_MODEL_ID).", model: "", base: c.basetenBaseUrl };
  return { configured: true, reason: "ok", model, base: c.basetenBaseUrl };
}

async function postOnce(opts: {
  base: string; apiKey: string; model: string;
  system: string; user: string; maxTokens: number; timeoutMs: number;
}): Promise<{ text: string; inputTokens?: number; outputTokens?: number; truncated: boolean }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${opts.base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        temperature: 0.3,
        max_tokens: opts.maxTokens,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === "AbortError" ? "Baseten specialist timed out." : `Baseten specialist unreachable: ${e instanceof Error ? e.message : "network error"}`);
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 400);
    const err = new Error(`Baseten specialist HTTP ${res.status}. ${body}`);
    (err as unknown as { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }; text?: string; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  if (!json || !Array.isArray(json.choices)) {
    throw new Error("Baseten specialist returned a malformed response (missing choices).");
  }
  const choice = json.choices[0] as { message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }; text?: string; finish_reason?: unknown } | undefined;
  const msg = choice?.message;
  // muse-spark-open-1026 is a reasoning model: the analysis may arrive in
  // `content` (string or content-block array) or `reasoning_content` with
  // `content: null`. Accept string + block-array + reasoning channels.
  const extractBlocks = (raw: unknown): string => {
    if (typeof raw === "string") return raw.trim();
    if (Array.isArray(raw)) {
      const parts: string[] = [];
      for (const b of raw) {
        if (typeof b === "string" && b.trim()) parts.push(b.trim());
        else if (b && typeof b === "object") {
          const bb = b as { text?: unknown; content?: unknown };
          if (typeof bb.text === "string" && bb.text.trim()) parts.push(bb.text.trim());
          else if (typeof bb.content === "string" && bb.content.trim()) parts.push(bb.content.trim());
        }
      }
      return parts.join("\n").trim();
    }
    return "";
  };
  const contentStr = extractBlocks(msg?.content);
  const choiceText = typeof choice?.text === "string" ? choice.text.trim() : "";
  // Reasoning-channel selection (verified live 2026-11-02 on
  // meta-models/muse-spark-open-1026): the FINAL memo arrives in
  // `reasoning_content` while `content` is null (finish_reason "length" with
  // a truncated stream still carries the usable memo in the reasoning
  // channel). When both carry text, prefer the channel that reads as the
  // finished memo over the planning monologue.
  const reasoningRaw = (msg as { reasoning_content?: unknown; reasoning?: unknown } | undefined)?.reasoning_content
    ?? (msg as { reasoning?: unknown } | undefined)?.reasoning;
  const reasoningStr = typeof reasoningRaw === "string" ? reasoningRaw.trim() : "";
  const isMonologue = (s: string): boolean =>
    /must follow rules|we must|we should|we have |need to cite|internal monologue|chain-of-thought|we need to produce/i.test(s);
  let text = "";
  if (contentStr && reasoningStr) {
    text = isMonologue(contentStr) && !isMonologue(reasoningStr) ? reasoningStr : contentStr;
  } else {
    text = (reasoningStr || contentStr || choiceText).trim();
  }
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  const truncated = finishReason === "length";
  if (!text) {
    throw new Error(truncated
      ? "Baseten specialist response truncated (finish_reason length, token limit reached) with no usable content."
      : "Baseten specialist returned an empty response.");
  }
  return { text, inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens, truncated };
}

export interface BasetenToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface BasetenToolsResponse {
  text: string;
  toolCalls: BasetenToolCall[];
  inputTokens?: number;
  outputTokens?: number;
  truncated: boolean;
  finishReason: string | null;
}

/** Retryable = transport/timeout/5xx/429. Never retry 4xx validation/auth. */
export function isRetryableBasetenError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  const status = (e as unknown as { status?: number } | null)?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  return /timed out|unreachable|network|ECONN|ETIMEDOUT|fetch failed/i.test(msg);
}

/** Part 4 — Baseten OpenAI-compatible tool definitions for the specialist.
 *  Only the application-side specialist ops are exposed
 *  (lib/ai/specialist-tools.ts allowlist). Compact descriptions keep the
 *  specialist prompt small. */
export interface BasetenToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const SPECIALIST_TOOL_DESCRIPTIONS: Record<string, string> = {
  inspect_evidence: "Read verified evidence rows, optionally filtered by metric.",
  compare_metrics: "Read comparison rows (both periods + diff).",
  analyze_trend: "Read deterministic trend rows.",
  evaluate_variance: "Read large variance rows (big changes only).",
  evaluate_scenario: "Calculate a deterministic what-if outcome from an assumed pct change.",
  rank_business_priorities: "Rank evidence-backed business priorities (limit 1..3).",
  analyze_peak_hours: "Read deterministic peak-hour rows.",
};

export function basetenToolDefinitions(names: string[]): BasetenToolDefinition[] {
  return names
    .filter((n) => SPECIALIST_TOOL_DESCRIPTIONS[n])
    .map((n) => {
      let params: Record<string, unknown> = { type: "object", properties: {}, additionalProperties: false };
      if (n === "inspect_evidence") params = { type: "object", properties: { metric: { type: "string" } }, additionalProperties: false };
      if (n === "compare_metrics") params = { type: "object", properties: { metric_a: { type: "string" }, metric_b: { type: "string" } }, additionalProperties: false };
      if (n === "rank_business_priorities") params = { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 3 } }, additionalProperties: false };
      return { type: "function", function: { name: n, description: SPECIALIST_TOOL_DESCRIPTIONS[n], parameters: params } };
    });
}

/** Invoke the Baseten Data Analyst specialist once (+1 retry when retryable).
 * Pass retry:false for deadline-budgeted fast paths (e.g. live RCA) where a
 * second 12s attempt would exceed the request deadline. Default keeps the
 * single controlled retry. timeoutMs overrides the 12s specialist budget. */
export async function callBasetenSpecialist(
  system: string,
  user: string,
  maxTokens = BASETEN_MAX_TOKENS_DEFAULT,
  opts?: { retry?: boolean; timeoutMs?: number },
): Promise<BasetenSpecialistResult> {
  const c = aiConfig();
  const gate = basetenConfigured();
  if (!gate.configured) throw new Error(gate.reason);
  const retry = opts?.retry !== false;
  const timeoutMs = opts?.timeoutMs ?? BASETEN_TIMEOUT_MS;
  const started = Date.now();
  try {
    const r = await postOnce({
      base: c.basetenBaseUrl, apiKey: c.basetenApiKey, model: c.basetenModelId,
      system, user, maxTokens, timeoutMs,
    });
    return { text: r.text, provider: "baseten-specialist", model: c.basetenModelId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, latencyMs: Date.now() - started, retries: 0, truncated: r.truncated };
  } catch (e) {
    if (!retry || !isRetryableBasetenError(e)) throw e;
    const r = await postOnce({
      base: c.basetenBaseUrl, apiKey: c.basetenApiKey, model: c.basetenModelId,
      system, user, maxTokens, timeoutMs,
    });
    return { text: r.text, provider: "baseten-specialist", model: c.basetenModelId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, latencyMs: Date.now() - started, retries: 1, truncated: r.truncated };
  }
}

export async function postBasetenWithTools(opts: {
  base: string; apiKey: string; model: string;
  messages: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown }[];
  tools: BasetenToolDefinition[];
  maxTokens: number; timeoutMs: number;
}): Promise<BasetenToolsResponse> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${opts.base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ model: opts.model, messages: opts.messages, tools: opts.tools.slice(0, 6), tool_choice: "auto", temperature: 0.3, max_tokens: opts.maxTokens }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === "AbortError" ? "Baseten specialist timed out." : "Baseten specialist unreachable.");
  } finally { clearTimeout(timeout); }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 400);
    const err = new Error(`Baseten specialist HTTP ${res.status}. ${body}`);
    (err as unknown as { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown; tool_calls?: unknown }; text?: string; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  const msg = json?.choices?.[0]?.message ?? null;
  const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const content = msg && typeof (msg as { content?: unknown }).content === "string" ? s((msg as { content?: unknown }).content) : "";
  const rcRaw = (msg as { reasoning_content?: unknown; reasoning?: unknown } | null)?.reasoning_content ?? (msg as { reasoning?: unknown } | null)?.reasoning;
  const text = (content || s(rcRaw) || (typeof json?.choices?.[0]?.text === "string" ? s(json.choices[0].text) : "")).trim();
  const toolCalls = parseToolCalls(msg ?? null);
  const finishReason = typeof json?.choices?.[0]?.finish_reason === "string" ? (json.choices[0].finish_reason as string) : null;
  const truncated = finishReason === "length";
  if (!text && toolCalls.length === 0 && truncated) {
    const err = new Error("Baseten specialist response truncated with no content or tool calls.");
    (err as unknown as { status?: number }).status = 502;
    throw err;
  }
  return { text, toolCalls, inputTokens: json?.usage?.prompt_tokens, outputTokens: json?.usage?.completion_tokens, truncated, finishReason };
}

/** Part 4 — Baseten specialist WITH native tool-calling lifecycle.
 *  (1) prompt + relevant tool schemas (auto); (2) validate calls vs the
 *  specialist allowlist; (3) exec application-side (scope-checked); (4)
 *  return results as role tool messages with tool_call_id; (5) continue
 *  until the final memo or max 3 rounds. Content-only memos return round 1. */
export async function callBasetenSpecialistWithTools(opts: {
  system: string;
  user: string;
  tools: BasetenToolDefinition[];
  exec: (c: BasetenToolCall) => Promise<{ ok: boolean; payload: string; name: string }>;
  maxTokens?: number;
  timeoutMs?: number;
  maxRounds?: number;
}): Promise<BasetenSpecialistResult> {
  const c = aiConfig();
  const gate = basetenConfigured();
  if (!gate.configured) throw new Error(gate.reason);
  const maxTokens = opts.maxTokens ?? BASETEN_MAX_TOKENS_DEFAULT;
  const timeoutMs = opts.timeoutMs ?? BASETEN_TIMEOUT_MS;
  const maxRounds = Math.max(1, Math.min(opts.maxRounds ?? 3, 4));
  const started = Date.now();
  const wire: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown }[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  const executed: { name: string; ok: boolean }[] = [];
  let rounds = 0;
  let last: BasetenToolsResponse | null = null;
  for (let r = 0; r < maxRounds; r++) {
    if (Date.now() - started > timeoutMs) break;
    rounds += 1;
    const res = await postBasetenWithTools({
      base: c.basetenBaseUrl, apiKey: c.basetenApiKey, model: c.basetenModelId,
      messages: wire, tools: opts.tools, maxTokens, timeoutMs,
    });
    last = res;
    const calls = res.toolCalls.slice(0, 4);
    if (calls.length === 0) {
      return {
        text: res.text, provider: "baseten-specialist", model: c.basetenModelId,
        inputTokens: res.inputTokens, outputTokens: res.outputTokens,
        latencyMs: Date.now() - started, retries: 0, truncated: res.truncated,
        toolRounds: rounds, toolCallsExecuted: executed,
      };
    }
    wire.push({
      role: "assistant", content: res.text || "",
      tool_calls: calls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) } })),
    });
    for (const t of calls) {
      if (Date.now() - started > timeoutMs) break;
      let out: { ok: boolean; payload: string; name: string };
      try { out = await opts.exec(t); }
      catch (e) { out = { ok: false, payload: JSON.stringify({ ok: false, tool: t.name, error: e instanceof Error ? e.message.slice(0, 300) : "Tool failed." }), name: t.name }; }
      executed.push({ name: t.name, ok: out.ok });
      wire.push({ role: "tool", content: out.payload.slice(0, 4000), tool_call_id: t.id });
    }
  }
  const text = (last?.text || "").trim();
  if (!text) throw new Error("Baseten specialist tool loop ended without a final memo.");
  return {
    text, provider: "baseten-specialist", model: c.basetenModelId,
    inputTokens: last?.inputTokens, outputTokens: last?.outputTokens,
    latencyMs: Date.now() - started, retries: 0, truncated: last?.truncated ?? false,
    toolRounds: rounds, toolCallsExecuted: executed,
  };
}
