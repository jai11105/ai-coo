// Provider clients: Meta (Muse Spark Standard, primary) + Fireworks
// (Meta Muse serverless fallback — resolved live via GET /models).
// Same system instructions + evidence restrictions for fallback.
// Slice 7: with-tools chat/completions variants for the Copilot agentic loop
// (Meta primary + Fireworks fallback share the loop driver; Baseten runs its
// own native tool-calling lifecycle in lib/ai/baseten.ts over the
// application-side specialist allowlist — never direct Supabase access).
import { aiConfig } from "./config";
import { parseToolCalls } from "./tool-exec";
import type { CopilotToolDefinition } from "./tool-defs";
export interface ChatMsg { role: "system" | "user" | "assistant"; content: string }
export interface ModelResult {
  text: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** FINAL FIX (Failure 2): raw finish_reason from the provider. `length`
   *  means the output was cut at the token budget — callers must treat
   *  partial content as truncated, never as a complete answer. */
  finishReason?: string | null;
  /** True when finishReason signals the response was cut short. */
  truncated?: boolean;
}
export interface ToolMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
}
export interface ToolsResult extends ModelResult {
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
}

// Shared content extraction for reasoning-model chat/completions responses.
// Handles: string content, OpenAI content-block arrays, reasoning_content
// fallback (Meta/Fireworks reasoning models), refusal ignored. Never throws.
// FINAL FIX (Failure 2+5): finish-reason is surfaced so truncated partial
// content is never presented as a complete answer. Callers check `truncated`.
function extractTextContent(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const m = msg as {
    content?: unknown;
    reasoning_content?: unknown;
    reasoning?: unknown;
  };
  const raw = m.content;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
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
    if (parts.length > 0) return parts.join("\n").trim();
  }
  const rc = m.reasoning_content;
  if (typeof rc === "string" && rc.trim()) return rc.trim();
  const rz = m.reasoning;
  if (typeof rz === "string" && rz.trim()) return rz.trim();
  return "";
}

function finishReasonOf(json: unknown): string | null {
  try {
    const j = json as { choices?: { finish_reason?: unknown }[] };
    const fr = j?.choices?.[0]?.finish_reason;
    return typeof fr === "string" ? fr : null;
  } catch { return null; }
}

export async function postChatCompletions(opts: {
  base: string; apiKey: string; model: string;
  messages: ChatMsg[]; maxTokens: number; timeoutMs: number;
}): Promise<{ text: string; inputTokens?: number; outputTokens?: number; status: number; finishReason: string | null; truncated: boolean }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${opts.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: 0.4,
        max_tokens: opts.maxTokens,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === "AbortError" ? "Provider timed out." : `Provider unreachable: ${e instanceof Error ? e.message : "network error"}`);
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 400);
    const err = new Error(`Provider HTTP ${res.status}. ${body}`);
    (err as unknown as { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown; refusal?: unknown }; text?: string; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  const msg = json?.choices?.[0]?.message;
  // Reasoning models (muse-spark-1.3 / muse-spark-open) may put the answer in
  // content blocks or reasoning_content when content is null. Extract all forms.
  const text = extractTextContent(msg ?? null) || (typeof json?.choices?.[0]?.text === "string" ? (json.choices[0].text as string).trim() : "");
  const finishReason = finishReasonOf(json);
  // FINAL FIX (Failure 2): a non-empty answer cut by finish_reason "length"
  // is partial output, NOT a complete answer. Return it with truncated=true
  // so the orchestrator routes to fallback / degraded instead of rendering
  // a dangling fragment such as "Your summary for Last". The empty-content
  // case still throws (no usable content at all).
  const truncated = finishReason === "length";
  if (!text && truncated) {
    const err = new Error("Primary model response truncated (finish_reason length, token limit reached) with no usable content.");
    (err as unknown as { status?: number }).status = 502;
    throw err;
  }
  return { text, inputTokens: json?.usage?.prompt_tokens, outputTokens: json?.usage?.completion_tokens, status: 200, finishReason, truncated };
}

/** Primary: Meta Muse Spark Standard chat.
 * Default 1200 tokens: reasoning models consume hidden reasoning tokens from
 * the same pool — 900 truncated live answers with empty responses. */
export async function callMetaStandard(system: string, user: string, maxTokens = 1200, timeoutMs = 8000): Promise<ModelResult> {
  const c = aiConfig();
  if (!c.metaApiKey) throw new Error("META_API_KEY is not configured on the server.");
  const r = await postChatCompletions({
    base: c.metaBaseUrl, apiKey: c.metaApiKey, model: c.metaModelId,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    maxTokens, timeoutMs,
  });
  if (!r.text) throw new Error("Primary model returned an empty response.");
  return { text: r.text, provider: "meta", model: c.metaModelId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, finishReason: r.finishReason, truncated: r.truncated };
}

/** Fallback: Fireworks Meta Muse serverless model with identical instructions.
 *  Model ID comes from FIREWORKS_MODEL_ID (server env); default was resolved
 *  live via GET {base}/models — muse-glimmer-30b is NOT servable on this
 *  account (HTTP 404 NOT_FOUND), muse-spark-open returns HTTP 200.
 *  Part 6: Fireworks is evidence-grounded — the same Standard instructions go
 *  in, plus the fallback role (answer from supplied evidence, no new tool
 *  loop when evidence is already prepared). Timeout is 15s (verified live
 *  ~8.056s for a valid fallback response; Meta primary/retry stay at 8s).
 *  Never presented as Baseten analysis.
 * Default 1200 tokens (same reasoning-budget reason as primary). */
export async function callFireworksFallback(system: string, user: string, maxTokens = 1200, timeoutMs = 15000): Promise<ModelResult> {
  const c = aiConfig();
  if (!c.fireworksApiKey) throw new Error("FIREWORKS_API_KEY is not configured on the server.");
  const { FIREWORKS_FALLBACK_ROLE } = await import("./prompts");
  const r = await postChatCompletions({
    base: c.fireworksBaseUrl, apiKey: c.fireworksApiKey, model: c.fireworksModelId,
    messages: [{ role: "system", content: `${system}\n\n${FIREWORKS_FALLBACK_ROLE}` }, { role: "user", content: user }],
    maxTokens, timeoutMs,
  });
  if (!r.text) throw new Error("Fallback model returned an empty response.");
  return { text: r.text, provider: "fireworks-fallback", model: c.fireworksModelId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, finishReason: r.finishReason, truncated: r.truncated };
}

/** Retryable = transport/timeout/5xx/429. Never retry on 4xx validation.
 * Empty/truncated responses are NOT retryable on the same provider (a
 * same-budget retry would exhaust the same token pool again) — they route
 * straight to the Fireworks fallback, which has its own full budget. */
export function isRetryableProviderError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  const status = (e as unknown as { status?: number } | null)?.status;
  // Retryable: 429 rate-limit, 5xx server faults (500/502/503/529), and
  // transport faults (timeout/network/abort). Timeouts surface either as an
  // AbortError or as the providers.ts "Provider timed out." message — both
  // must count so a stalled primary actually retries instead of dropping
  // straight to degraded. Never retry 400/401/403/404/402 validation or
  // empty/truncated responses (same-budget retry would exhaust the pool).
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  if (e instanceof Error && e.name === "AbortError") return true;
  return /timed out|timeout|unreachable|network|ECONN|ETIMEDOUT|fetch failed|aborted|abort/i.test(msg);
}

/** Classify a provider failure into the task-mandated buckets (no leakage).
 *  Buckets: http_400/401/403/404/402/429/5xx, timeout, network, truncated,
 *  config, unknown. Used for fallback decisions + sanitized traces. */
export function classifyFailure(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const status = (e as unknown as { status?: number } | null)?.status;
  if (typeof status === "number" && Number.isFinite(status)) {
    if (status === 400) return "http_400";
    if (status === 401) return "http_401";
    if (status === 403) return "http_403";
    if (status === 404) return "http_404";
    if (status === 402) return "http_402";
    if (status === 429) return "http_429";
    if (status >= 500) return `http_${status}`;
    return `http_${status}`;
  }
  if (/not configured on the server/i.test(msg)) return "config";
  if (/truncat/i.test(msg)) return "truncated";
  if (/empty response/i.test(msg)) return "empty";
  if (e instanceof Error && e.name === "AbortError") return "timeout";
  if (/timed out|timeout/i.test(msg)) return "timeout";
  if (/unreachable|network|ECONN|ETIMEDOUT|fetch failed|ENOTFOUND|EAI_AGAIN/i.test(msg)) return "network";
  return "unknown";
}
// Slice 7: tools-aware chat/completions POST (OpenAI-compatible tool_calls).
// FINAL FIX (Failure 2): finish_reason is surfaced so a tool-loop round cut
// by the token budget is never mistaken for finished content downstream.
async function postChatWithTools(opts: {
  base: string; apiKey: string; model: string; messages: ToolMsg[];
  tools: CopilotToolDefinition[]; maxTokens: number; timeoutMs: number;
}): Promise<{ text: string; toolCalls: { id: string; name: string; args: Record<string, unknown> }[]; inputTokens?: number; outputTokens?: number; finishReason: string | null; truncated: boolean }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  let res: Response;
  try {
    const wireMessages = opts.messages.map((m) => {
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: "assistant", content: m.content || null,
          tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) } })),
        };
      }
      if (m.role === "tool") return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
      return { role: m.role, content: m.content };
    });
    res = await fetch(`${opts.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ model: opts.model, messages: wireMessages, tools: opts.tools, tool_choice: "auto", temperature: 0.4, max_tokens: opts.maxTokens }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === "AbortError" ? "Provider timed out." : `Provider unreachable: ${e instanceof Error ? e.message : "network error"}`);
  } finally { clearTimeout(timeout); }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 400);
    const err = new Error(`Provider HTTP ${res.status}. ${body}`);
    (err as unknown as { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown; refusal?: unknown; tool_calls?: unknown }; text?: string; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  const msg = json?.choices?.[0]?.message;
  // LIVE 2026-11-02: muse-spark-1.3 returns content:null + refusal:null on
  // reasoning-exhausted rounds (finish_reason "length"). Accept string content,
  // content-block arrays, and reasoning_content (reasoning-model answer
  // channel) — never treat a valid reasoning payload as empty.
  const text = extractTextContent(msg ?? null) || (typeof json?.choices?.[0]?.text === "string" ? (json.choices[0].text as string).trim() : "");
  const toolCalls = parseToolCalls(msg ?? null);
  const finishReason = finishReasonOf(json);
  const truncated = finishReason === "length";
  if (!text && toolCalls.length === 0 && truncated) {
    const err = new Error("Provider response truncated (finish_reason length) with no content or tool calls — token budget exhausted.");
    (err as unknown as { status?: number }).status = 502;
    throw err;
  }
  return { text, toolCalls, inputTokens: json?.usage?.prompt_tokens, outputTokens: json?.usage?.completion_tokens, finishReason, truncated };
}
/** Slice 7: Meta Standard with tools (primary tool-call loop).
 * LIVE 2026-11-02: muse-spark-1.3 is a reasoning model — ~300 hidden
 * reasoning tokens are consumed before content. Post-tool rounds MUST use
 * the 900-token budget or round-2 returns finish_reason "length" with
 * content null (verified: max300 -> null, max900 -> valid answer).
 * Default raised to 1200 — reasoning-heavy sales questions returned empty at
 * 900 on both primary and fallback. */
export async function callMetaStandardWithTools(messages: ToolMsg[], tools: CopilotToolDefinition[], maxTokens = 1200, timeoutMs = 8000): Promise<ToolsResult> {
  const c = aiConfig();
  if (!c.metaApiKey) throw new Error("META_API_KEY is not configured on the server.");
  const r = await postChatWithTools({ base: c.metaBaseUrl, apiKey: c.metaApiKey, model: c.metaModelId, messages, tools, maxTokens, timeoutMs });
  return { text: r.text, provider: "meta", model: c.metaModelId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, toolCalls: r.toolCalls, finishReason: r.finishReason, truncated: r.truncated };
}
/** Slice 7: Fireworks fallback with tools (same loop driver, same guards).
 * Default 1200 (same reasoning-budget reason as primary). */
export async function callFireworksWithTools(messages: ToolMsg[], tools: CopilotToolDefinition[], maxTokens = 1200, timeoutMs = 15000): Promise<ToolsResult> {
  const c = aiConfig();
  if (!c.fireworksApiKey) throw new Error("FIREWORKS_API_KEY is not configured on the server.");
  const r = await postChatWithTools({ base: c.fireworksBaseUrl, apiKey: c.fireworksApiKey, model: c.fireworksModelId, messages, tools, maxTokens, timeoutMs });
  return { text: r.text, provider: "fireworks-fallback", model: c.fireworksModelId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, toolCalls: r.toolCalls, finishReason: r.finishReason, truncated: r.truncated };
}

