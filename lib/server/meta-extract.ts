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
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s) return s;
  }
  return "";
}

/** System prompt for Contributor transcript-to-JSON extraction. */
export function extractionSystemPrompt(todayYmd: string): string {
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
    `- Today is ${todayYmd}. Resolve relative dates against it;`,
    " leave date empty when unknown.",
    "- Money: plain rupee numbers as strings (e.g. 250), never symbols/commas.",
    "- Sale needs item_name + quantity + unit_selling_price.",
    "- Purchase needs item_name + quantity + unit_buying_cost.",
    "- Expense needs amount + description.",
    "- NEVER invent missing values: leave them empty,",
    " list them in uncertain_fields, and ask in needs_clarification",
    " when incomplete or ambiguous.",
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
  message?: { content?: string };
  text?: string;
}

/** Transcript → VoiceDraft via Muse Spark Contributor (Meta chat completions). */
export async function extractWithContributor(transcript: string): Promise<VoiceDraft> {
  const clean = (transcript || "").trim();
  if (!clean) throw new Error("Transcript is required.");
  const cfg = metaExtractionConfig();
  if (!cfg.apiKey) {
    throw new Error("META_API_KEY is not configured on the server.");
  }
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayYmd = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  const body = JSON.stringify({
    model: cfg.model,
    messages: [
      { role: "system", content: extractionSystemPrompt(todayYmd) },
      { role: "user", content: `Transcript:\n${clean}` },
    ],
    temperature: 0,
    max_tokens: 800,
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
    throw new Error(`Meta extraction failed (HTTP ${res.status}). ${text || "Please retry."}`);
  }
  const json = (await res.json().catch(() => null)) as {
    choices?: ChatChoice[];
    draft?: unknown;
    data?: unknown;
    result?: unknown;
  } | null;
  const c0 = json?.choices?.[0];
  const content = (c0?.message?.content || c0?.text || "").trim();
  if (content) {
    try {
      return normalizeDraft(JSON.parse(content), clean);
    } catch {
      throw new Error("Extraction returned non-JSON content. Please retry.");
    }
  }
  if (json && (json.draft || json.data || json.result)) {
    return normalizeDraft(json.draft ?? json.data ?? json.result, clean);
  }
  throw new Error("Extraction returned an empty result. Please retry.");
}

