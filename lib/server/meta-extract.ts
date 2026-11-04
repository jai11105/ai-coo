// Server-only Log Entry extraction via Muse Spark Contributor (Meta API).
// NEVER import this file from client components — it reads secret keys.
//
// Model separation:
// - Muse Spark 1.3 (META_MODEL_ID) = primary COO Copilot reasoning. Untouched.
// - Muse Spark 1.3 Contributor (META_EXTRACTION_MODEL_ID) = Log Entry
//   transcript-to-JSON extraction ONLY. Used exclusively here.

import type { TransactionType } from "../types";
import type { VoiceDraft } from "../voice-entry";

const ALLOWED: TransactionType[] = ["sale", "purchase", "expense"];

function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && isFinite(v)) return String(v);
  return "";
}

function toNumOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v.trim()))) {
    return Number(v.trim());
  }
  return null;
}

function toDateOrEmpty(v: unknown): string {
  const s = toStr(v);
  if (!s) return "";
  const match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso) {
    return iso;
  }
  return "";
}

/** System prompt for Contributor transcript-to-JSON extraction. */
export function extractionSystemPrompt(todayYmd?: string): string {
  const todayClause = todayYmd
    ? `- Today is ${todayYmd}. If the owner does not mention any date, set date to ${todayYmd}. If they mention a relative day, compute it from today as YYYY-MM-DD: today / innaiku / indru / aaj = today; yesterday / nethu / netru / kal (when the entry is about something already done) = yesterday; day before yesterday / mundhanethu / mundhanaal / parson = 2 days ago; tomorrow / naalaiku / naalai = tomorrow. Spoken calendar dates such as "2nd November" or "5th" use the current year, and the current month when only a day is given. Never output a date in any format other than YYYY-MM-DD. Do not add "date" to uncertain_fields when the date defaulted to today.`
    : "- Leave date empty when unknown.";
  return [
    "You extract a single business transaction from a spoken log-entry transcript.",
    "Return ONLY valid JSON (no markdown, no commentary) with exactly these keys:",
    '{"transaction_type":"sale|purchase|expense","date":"YYYY-MM-DD or empty"',
    '"description":"","category":"","counterparty":"","channel":""',
    '"payment_method":"","item_name":"","quantity":""',
    '"unit_selling_price":"","unit_buying_cost":"","amount":""',
    '"confidence":0.0,"uncertain_fields":[],"needs_clarification":[]}',
    "Rules:",
    '- transaction_type is sale, purchase or expense. "sold" implies sale;',
    ' "bought/purchased/stock" implies purchase; "paid/spent/rent/salary" implies expense.',
    todayClause,
    "- Money: plain rupee numbers as strings (e.g. 250), never symbols/commas.",
    "- Sale needs item_name + quantity + unit_selling_price.",
    "- Purchase needs item_name + quantity + unit_buying_cost.",
    "- Expense needs amount + description.",
    "- NEVER invent missing values: leave them empty,",
    " list them in uncertain_fields, and ask in needs_clarification",
    " when incomplete or ambiguous.",
    "Return only the JSON object. Do not explain.",
  ].join("\n");
}
/** Normalize any model JSON into the canonical VoiceDraft. Never invents values. */
export function normalizeDraft(raw: unknown, transcript: string): VoiceDraft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const inner =
    (o.draft && typeof o.draft === "object" ? (o.draft as Record<string, unknown>) : null) ??
    (o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : null) ??
    (o.result && typeof o.result === "object" ? (o.result as Record<string, unknown>) : null) ??
    o;
  const tRaw = toStr(inner.transaction_type || inner.type).toLowerCase();
  const transaction_type: TransactionType = (ALLOWED as string[]).includes(tRaw)
    ? (tRaw as TransactionType)
    : "sale";
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(toStr).filter(Boolean).slice(0, 8) : [];
  const confidence = toNumOrNull(inner.confidence);
  return {
    transaction_type,
    date: toDateOrEmpty(inner.date),
    description: toStr(inner.description || inner.notes),
    category: toStr(inner.category),
    counterparty: toStr(inner.counterparty || inner.party),
    channel: toStr(inner.channel),
    payment_method: toStr(inner.payment_method || inner.paymentMethod),
    item_name: toStr(inner.item_name || inner.itemName || inner.product),
    quantity: toStr(inner.quantity ?? inner.qty),
    unit_selling_price: toStr(inner.unit_selling_price ?? inner.selling_price),
    unit_buying_cost: toStr(inner.unit_buying_cost ?? inner.buying_price),
    amount: toStr(inner.amount ?? inner.total ?? inner.total_amount),
    confidence: confidence == null ? null : Math.min(1, Math.max(0, confidence)),
    uncertain_fields: arr(inner.uncertain_fields ?? inner.uncertainFields),
    needs_clarification: arr(inner.needs_clarification ?? inner.clarifications),
    transcript,
  };
}

/** Extract text from a chat message regardless of provider shape.
 * Handles: string content, OpenAI content-block arrays
 * ({text} / {content}), reasoning_content / reasoning channels,
 * and legacy `text` field. Never throws on non-string content.
 * Mirrors lib/ai/providers.ts extractTextContent (reasoning-safe).
 */
export function extractContentText(msg: unknown, fallbackText?: unknown): string {
  if (msg && typeof msg === "object") {
    const m = msg as {
      content?: unknown;
      reasoning_content?: unknown;
      reasoning?: unknown;
      refusal?: unknown;
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
    // Reasoning models (muse-spark family) may surface the answer in
    // reasoning_content when content is null. Prefer it over empty.
    const rc = m.reasoning_content ?? m.reasoning;
    if (typeof rc === "string" && rc.trim()) return rc.trim();
    if (Array.isArray(rc)) {
      const parts: string[] = [];
      for (const b of rc) {
        if (typeof b === "string" && b.trim()) parts.push(b.trim());
        else if (b && typeof b === "object") {
          const bb = b as { text?: unknown; content?: unknown };
          if (typeof bb.text === "string" && bb.text.trim()) parts.push(bb.text.trim());
          else if (typeof bb.content === "string" && bb.content.trim()) parts.push(bb.content.trim());
        }
      }
      if (parts.length > 0) return parts.join("\n").trim();
    }
  }
  if (typeof fallbackText === "string" && fallbackText.trim()) return fallbackText.trim();
  return "";
}

/** Strip ```json / ``` fences and surrounding prose, returning the JSON payload. */
export function stripToJsonPayload(text: string): string {
  let s = (text || "").trim();
  if (!s) return s;
  // Remove markdown fences: ```json ... ``` or ``` ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1] && fence[1].trim()) s = fence[1].trim();
  // If prose surrounds JSON, slice from first { to last }.
  if (s && s[0] !== "{" && s[0] !== "[") {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) s = s.slice(start, end + 1).trim();
  }
  return s;
}

export function finishReasonOf(json: unknown): string | null {
  try {
    const j = json as { choices?: { finish_reason?: unknown }[] };
    const fr = j?.choices?.[0]?.finish_reason;
    return typeof fr === "string" ? fr : null;
  } catch {
    return null;
  }
}

function metaExtractionConfig(): { base: string; apiKey: string; model: string } {
  const base = (
    process.env.META_BASE_URL ||
    process.env.META_API_BASE_URL ||
    "https://api.meta.ai/v1"
  ).replace(/\/$/, "");
  const apiKey = process.env.META_API_KEY || "";
  const model = process.env.META_EXTRACTION_MODEL_ID || "muse-spark-1.3-contributor";
  return { base, apiKey, model };
}

interface ChatChoice {
  message?: {
    content?: unknown;
    reasoning_content?: unknown;
    reasoning?: unknown;
    refusal?: unknown;
  };
  text?: unknown;
  finish_reason?: unknown;
}

/** Transcript → VoiceDraft via Muse Spark Contributor (Meta chat completions). */
export async function extractWithContributor(transcript: string, today?: string): Promise<VoiceDraft> {
  const clean = (transcript || "").trim();
  if (!clean) throw new Error("Transcript is required.");
  const cfg = metaExtractionConfig();
  if (!cfg.apiKey) {
    throw new Error("META_API_KEY is not configured on the server.");
  }
  const isRealDate =
    typeof today === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(today) &&
    (() => {
      const d = new Date(`${today}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === today;
    })();
  let todayYmd: string;
  if (isRealDate && today) {
    todayYmd = today;
  } else {
    const t = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    todayYmd = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }
  const body = JSON.stringify({
    model: cfg.model,
    messages: [
      { role: "system", content: extractionSystemPrompt(todayYmd) },
      { role: "user", content: `Transcript:\n${clean}` },
    ],
    temperature: 0,
    max_tokens: 4000,
    reasoning_effort: "low",
    response_format: { type: "json_object" },
  });
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === "AbortError"
        ? "Extraction timed out. Please retry."
        : "Could not reach the Meta extraction service."
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 500);
    // Surface the exact provider HTTP status + safe body (no keys) so the
    // frontend can distinguish auth/quota errors from empty content.
    // H2 (provider non-2xx mapped to generic 502): preserved as distinct
    // EXTRACT_UPSTREAM so the route can forward the provider status safely.
    const err = new Error(`Meta extraction failed (HTTP ${res.status}). ${text || "Please retry."}`);
    (err as unknown as { upstreamStatus?: number; code?: string }).upstreamStatus = res.status;
    (err as unknown as { upstreamStatus?: number; code?: string }).code = "EXTRACT_UPSTREAM";
    throw err;
  }
  const json = (await res.json().catch(() => null)) as {
    choices?: ChatChoice[];
    draft?: unknown;
    data?: unknown;
    result?: unknown;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
      reasoning_tokens?: number;
    };
  } | null;
  const c0 = json?.choices?.[0];
  const finishReason = finishReasonOf(json) ?? (typeof c0?.finish_reason === "string" ? c0.finish_reason : null);
  const promptTokens = json?.usage?.prompt_tokens ?? null;
  const completionTokens = json?.usage?.completion_tokens ?? null;
  const reasoningTokens =
    json?.usage?.completion_tokens_details?.reasoning_tokens ??
    json?.usage?.reasoning_tokens ??
    null;
  const reasoningPart = reasoningTokens != null ? ` reasoning_tokens=${reasoningTokens}` : "";
  console.log(
    `[meta-extract] finish_reason=${finishReason ?? "unknown"} prompt_tokens=${promptTokens ?? "none"} completion_tokens=${completionTokens ?? "none"}${reasoningPart}`
  );
  // H1 root cause: old code read only `message.content` as a plain string.
  // Reasoning/chat providers also return content-block arrays, reasoning_content,
  // or legacy `text` — all valid and were misclassified as empty.
  const content = extractContentText(c0?.message ?? null, c0?.text);
  if (content) {
    // Truncated (finish_reason length) must never be presented as complete.
    if (finishReason === "length") {
      const err = new Error("Extraction response was truncated (finish_reason length). Please record a shorter entry and retry.");
      (err as unknown as { code?: string }).code = "EXTRACT_TRUNCATED";
      throw err;
    }
    const payload = stripToJsonPayload(content);
    try {
      return normalizeDraft(JSON.parse(payload), clean);
    } catch {
      // H1b: fences/prose/malformed JSON → explicit, actionable error
      // (never the generic empty-result message).
      const err = new Error("Extraction returned malformed JSON. Please retry.");
      (err as unknown as { code?: string }).code = "EXTRACT_MALFORMED";
      throw err;
    }
  }
  if (json && (json.draft || json.data || json.result)) {
    return normalizeDraft(json.draft ?? json.data ?? json.result, clean);
  }
  // Genuinely empty: distinguish truncated-empty from empty-with-stop.
  if (finishReason === "length") {
    const err = new Error("Extraction response was truncated (finish_reason length) with no content. Please record a shorter entry and retry.");
    (err as unknown as { code?: string }).code = "EXTRACT_TRUNCATED";
    throw err;
  }
  throw new Error("Extraction returned an empty result. Please retry.");
}

