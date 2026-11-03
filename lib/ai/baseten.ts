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
// - Timeout: BASETEN_TIMEOUT_MS (default 15000 per call) and BASETEN_TOTAL_BUDGET_MS
//   (default 20000 across tool rounds).

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
  disabledReasoningEffort?: boolean;
}

export const BASETEN_TIMEOUT_MS = Number(process.env.BASETEN_TIMEOUT_MS) || 15000;
export const BASETEN_TOTAL_BUDGET_MS = Number(process.env.BASETEN_TOTAL_BUDGET_MS) || 20000;

export const BASETEN_TOOL_ROUND_MAX_TOKENS = 1500;
export const BASETEN_MEMO_MAX_TOKENS = 3500;
export const BASETEN_MAX_TOKENS_DEFAULT = BASETEN_MEMO_MAX_TOKENS;

export const BASETEN_REASONING_EFFORT = (process.env.BASETEN_REASONING_EFFORT ?? "low").trim();

function shouldSendReasoningEffort(disabled?: boolean): boolean {
  if (disabled) return false;
  const val = BASETEN_REASONING_EFFORT.toLowerCase();
  return Boolean(val && val !== "off" && val !== "none" && val !== '""' && val !== "''");
}

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
  round?: number; retried?: boolean;
  disableReasoningEffort?: boolean;
}): Promise<{ text: string; inputTokens?: number; outputTokens?: number; truncated: boolean }> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  let res: Response;
  const sendReasoningEffort = shouldSendReasoningEffort(opts.disableReasoningEffort);
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
        ...(sendReasoningEffort ? { reasoning_effort: BASETEN_REASONING_EFFORT } : {}),
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === "AbortError" ? "Baseten specialist timed out." : `Baseten specialist unreachable: ${e instanceof Error ? e.message : "network error"}`);
  } finally {
    clearTimeout(timeout);
  }
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 400);
    if (res.status === 400 && /reasoning_effort/i.test(body) && !opts.disableReasoningEffort) {
      console.log(`[baseten] HTTP 400 reasoning_effort rejected (${body}) — retrying once without reasoning_effort`);
      return postOnce({
        ...opts,
        disableReasoningEffort: true,
      });
    }
    const err = new Error(`Baseten specialist HTTP ${res.status}. ${body}`);
    (err as unknown as { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown }; text?: string; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number }; reasoning_tokens?: number };
  } | null;
  if (!json || !Array.isArray(json.choices)) {
    throw new Error("Baseten specialist returned a malformed response (missing choices).");
  }
  const choice = json.choices[0] as { message?: { content?: unknown }; text?: string; finish_reason?: unknown } | undefined;
  const msg = choice?.message;

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
  const text = (contentStr || choiceText).trim();
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  const truncated = finishReason === "length";

  const reasoningTokens = json.usage?.completion_tokens_details?.reasoning_tokens
    ?? json.usage?.reasoning_tokens
    ?? 0;
  const completionTokens = json.usage?.completion_tokens ?? 0;

  console.log(
    `[baseten] round=${opts.round ?? 1} finish_reason=${finishReason || "unknown"} completion_tokens=${completionTokens} reasoning_tokens=${reasoningTokens} latencyMs=${latencyMs} retried=${opts.retried ?? false}`
  );

  // If finish_reason "length" OR empty content, retry ONCE with max_tokens doubled
  if ((truncated || !text) && !opts.retried) {
    return postOnce({
      ...opts,
      maxTokens: opts.maxTokens * 2,
      retried: true,
    });
  }

  if (!text) {
    return { text: "", inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens, truncated: true };
  }
  return { text, inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens, truncated };
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
 * second attempt would exceed the request deadline. Default keeps the
 * single controlled retry. timeoutMs overrides the specialist budget. */
export async function callBasetenSpecialist(
  system: string,
  user: string,
  maxTokens = BASETEN_MEMO_MAX_TOKENS,
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
      system, user, maxTokens, timeoutMs, round: 1, retried: false,
    });
    return { text: r.text, provider: "baseten-specialist", model: c.basetenModelId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, latencyMs: Date.now() - started, retries: 0, truncated: r.truncated };
  } catch (e) {
    if (!retry || !isRetryableBasetenError(e)) throw e;
    const r = await postOnce({
      base: c.basetenBaseUrl, apiKey: c.basetenApiKey, model: c.basetenModelId,
      system, user, maxTokens, timeoutMs, round: 1, retried: true,
    });
    return { text: r.text, provider: "baseten-specialist", model: c.basetenModelId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, latencyMs: Date.now() - started, retries: 1, truncated: r.truncated };
  }
}

export async function postBasetenWithTools(opts: {
  base: string; apiKey: string; model: string;
  messages: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown }[];
  tools: BasetenToolDefinition[];
  maxTokens: number; timeoutMs: number;
  round: number;
  retried: boolean;
  disableReasoningEffort?: boolean;
}): Promise<BasetenToolsResponse> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  let res: Response;
  const sendReasoningEffort = shouldSendReasoningEffort(opts.disableReasoningEffort);
  try {
    res = await fetch(`${opts.base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        tools: opts.tools.slice(0, 6),
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: opts.maxTokens,
        ...(sendReasoningEffort ? { reasoning_effort: BASETEN_REASONING_EFFORT } : {}),
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === "AbortError" ? "Baseten specialist timed out." : "Baseten specialist unreachable.");
  } finally { clearTimeout(timeout); }
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 400);
    if (res.status === 400 && /reasoning_effort/i.test(body) && !opts.disableReasoningEffort) {
      console.log(`[baseten] HTTP 400 reasoning_effort rejected in round ${opts.round} (${body}) — retrying once without reasoning_effort`);
      return postBasetenWithTools({
        ...opts,
        disableReasoningEffort: true,
      });
    }
    const err = new Error(`Baseten specialist HTTP ${res.status}. ${body}`);
    (err as unknown as { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown; tool_calls?: unknown }; text?: string; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number }; reasoning_tokens?: number };
  } | null;
  const msg = json?.choices?.[0]?.message ?? null;
  const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const content = msg && typeof (msg as { content?: unknown }).content === "string" ? s((msg as { content?: unknown }).content) : "";
  const text = (content || (typeof json?.choices?.[0]?.text === "string" ? s(json.choices[0].text) : "")).trim();
  const toolCalls = parseToolCalls(msg ?? null);
  const finishReason = typeof json?.choices?.[0]?.finish_reason === "string" ? (json.choices[0].finish_reason as string) : null;
  const truncated = finishReason === "length";
  const reasoningTokens = json?.usage?.completion_tokens_details?.reasoning_tokens
    ?? json?.usage?.reasoning_tokens
    ?? 0;
  const completionTokens = json?.usage?.completion_tokens ?? 0;

  console.log(
    `[baseten] round=${opts.round} finish_reason=${finishReason || "unknown"} completion_tokens=${completionTokens} reasoning_tokens=${reasoningTokens} latencyMs=${latencyMs} retried=${opts.retried}`
  );

  return {
    text,
    toolCalls,
    inputTokens: json?.usage?.prompt_tokens,
    outputTokens: json?.usage?.completion_tokens,
    truncated,
    finishReason,
    disabledReasoningEffort: opts.disableReasoningEffort || false,
  };
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

  const totalBudgetMs = opts.timeoutMs ?? BASETEN_TOTAL_BUDGET_MS;
  const callTimeoutMs = BASETEN_TIMEOUT_MS;
  const maxRounds = Math.max(1, Math.min(opts.maxRounds ?? 3, 4));
  const started = Date.now();
  const wire: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown }[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  const executed: { name: string; ok: boolean }[] = [];
  let rounds = 0;
  let last: BasetenToolsResponse | null = null;
  let totalRetries = 0;
  let reasoningEffortDisabled = false;

  for (let r = 0; r < maxRounds; r++) {
    const elapsed = Date.now() - started;
    if (elapsed >= totalBudgetMs) break;
    const remaining = totalBudgetMs - elapsed;
    const perCallTimeout = Math.min(callTimeoutMs, remaining);
    if (perCallTimeout <= 500) break;

    rounds += 1;
    let currentTokens = executed.length > 0 || opts.tools.length === 0
      ? BASETEN_MEMO_MAX_TOKENS
      : (opts.maxTokens ?? BASETEN_TOOL_ROUND_MAX_TOKENS);

    let res = await postBasetenWithTools({
      base: c.basetenBaseUrl, apiKey: c.basetenApiKey, model: c.basetenModelId,
      messages: wire, tools: opts.tools, maxTokens: currentTokens, timeoutMs: perCallTimeout,
      round: rounds, retried: false, disableReasoningEffort: reasoningEffortDisabled,
    });
    if (res.disabledReasoningEffort) {
      reasoningEffortDisabled = true;
    }

    // Check if response has finish_reason "length" OR empty content (when no tool calls)
    const isTruncatedOrEmpty = res.truncated || (!res.text && res.toolCalls.length === 0);
    if (isTruncatedOrEmpty) {
      const remainingForRetry = totalBudgetMs - (Date.now() - started);
      const retryTimeout = Math.min(callTimeoutMs, remainingForRetry);
      if (retryTimeout > 1000) {
        currentTokens = currentTokens * 2;
        totalRetries += 1;
        try {
          const retryRes = await postBasetenWithTools({
            base: c.basetenBaseUrl, apiKey: c.basetenApiKey, model: c.basetenModelId,
            messages: wire, tools: opts.tools, maxTokens: currentTokens, timeoutMs: retryTimeout,
            round: rounds, retried: true, disableReasoningEffort: reasoningEffortDisabled,
          });
          if (retryRes.disabledReasoningEffort) {
            reasoningEffortDisabled = true;
          }
          res = retryRes;
        } catch {
          // If retry threw, keep prior res
        }
      }
    }

    last = res;
    const stillFailed = res.truncated || (!res.text && res.toolCalls.length === 0);
    if (stillFailed) {
      // Failed even after retry: mark memo as unusable!
      return {
        text: "",
        provider: "baseten-specialist",
        model: c.basetenModelId,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        latencyMs: Date.now() - started,
        retries: totalRetries,
        truncated: true,
        toolRounds: rounds,
        toolCallsExecuted: executed,
      };
    }

    const calls = res.toolCalls.slice(0, 4);
    if (calls.length === 0) {
      return {
        text: res.text,
        provider: "baseten-specialist",
        model: c.basetenModelId,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        latencyMs: Date.now() - started,
        retries: totalRetries,
        truncated: false,
        toolRounds: rounds,
        toolCallsExecuted: executed,
      };
    }

    wire.push({
      role: "assistant",
      content: res.text || "",
      tool_calls: calls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) } })),
    });

    for (const t of calls) {
      if (Date.now() - started > totalBudgetMs) break;
      let out: { ok: boolean; payload: string; name: string };
      try {
        out = await opts.exec(t);
      } catch (e) {
        out = {
          ok: false,
          payload: JSON.stringify({ ok: false, tool: t.name, error: e instanceof Error ? e.message.slice(0, 300) : "Tool failed." }),
          name: t.name,
        };
      }
      executed.push({ name: t.name, ok: out.ok });
      wire.push({ role: "tool", content: out.payload.slice(0, 4000), tool_call_id: t.id });
    }
  }

  const text = (last?.text || "").trim();
  const truncated = last?.truncated || !text;
  return {
    text: truncated ? "" : text,
    provider: "baseten-specialist",
    model: c.basetenModelId,
    inputTokens: last?.inputTokens,
    outputTokens: last?.outputTokens,
    latencyMs: Date.now() - started,
    retries: totalRetries,
    truncated,
    toolRounds: rounds,
    toolCallsExecuted: executed,
  };
}
