// Slice 8 — durable trace persistence (extends lib/ai/types.ts ring).
// Same TraceEvent contract; adds best-effort Supabase persistence into
// copilot_traces when the table exists, else keeps in-memory only.
// Never persists keys/headers/secrets/audio. Failures never break answers.
import type { TraceEvent } from "./types";
import { recordTrace, scrubForLog } from "./types";
export interface TracePersistInput {
  trace: TraceEvent; requestId: string; conversationId: string;
  userId: string | null; businessId: string | null;
  traceId: string; provider: string; model: string;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export async function persistTrace(input: TracePersistInput): Promise<{ persisted: boolean; error?: string }> {
  try {
    recordTrace(input.trace);
  } catch { /* ring is best-effort */ }
  const { serverStoreClient } = await import("./conversation-store");
  const sb = serverStoreClient();
  if (!sb) return { persisted: false, error: "no-creds" };
  if (!input.businessId || !input.userId) return { persisted: false, error: "demo-scope" };
  if (String(input.businessId).startsWith("demo:")) return { persisted: false, error: "demo-scope" };
  const t = input.trace;
  const payload = {
    request_id: input.requestId.slice(0, 80),
    conversation_id: input.conversationId.slice(0, 80),
    trace_id: input.traceId.slice(0, 80),
    user_id: input.userId,
    business_id: input.businessId,
    question: scrubForLog(t.question || "").slice(0, 2000),
    intent: t.intent,
    provider: String(t.provider || "").slice(0, 80),
    model: String(t.model || "").slice(0, 120),
    prompt_version: String(t.promptVersion || "").slice(0, 40),
    status: t.status,
    latency_ms: num(t.latencyMs) ?? 0,
    input_tokens: num(t.inputTokens),
    output_tokens: num(t.outputTokens),
    evidence_ids: (t.evidenceIds || []).slice(0, 24).map((s) => String(s).slice(0, 80)),
    tool_calls: (t.toolCalls || []).slice(0, 24).map((c) => ({
      name: String(c.name).slice(0, 80), ok: Boolean(c.ok),
      latencyMs: num(c.latencyMs) ?? 0,
      error: c.error ? scrubForLog(c.error).slice(0, 300) : undefined,
    })),
    provider_attempts: (t.providerAttempts || []).slice(0, 12),
    specialist: t.specialist ? {
      required: t.specialist.required, reason: String(t.specialist.reason || "").slice(0, 300),
      kind: t.specialist.kind, model: t.specialist.model, status: t.specialist.status,
      latencyMs: num(t.specialist.latencyMs), retries: num(t.specialist.retries),
      validation: (t.specialist.validation || []).slice(0, 8).map((s) => scrubForLog(String(s)).slice(0, 300)),
    } : null,
    error_code: t.error ? scrubForLog(t.error).slice(0, 300) : null,
  };
  try {
    const { error } = await sb.from("copilot_traces").insert(payload);
    if (error) {
      const msg = String(error.message || "");
      if (/could not find|schema cache|does not exist|PGRST/i.test(msg)) {
        return { persisted: false, error: "table-missing" };
      }
      return { persisted: false, error: msg.slice(0, 200) };
    }
    return { persisted: true };
  } catch (e) {
    return { persisted: false, error: e instanceof Error ? e.message.slice(0, 200) : "insert failed" };
  }
}
