// Slice 8 PART 2: turn persist + trusted assistant-message lookup.
import { serverStoreClient, assertMember } from "./conversation-store";
import type { PersistedScope, PersistResult, TrustedAssistantMessage } from "./conversation-store";
export async function persistCopilotTurn(opts: {
  scope: PersistedScope; sessionId: string; question: string;
  answer: string; provider: string | null; model: string | null;
}): Promise<PersistResult> {
  const sb = serverStoreClient();
  const base = { persisted: false, sessionId: opts.sessionId, userMessageId: null, assistantMessageId: null, partial: false };
  if (!sb) return { ...base, error: "Supabase server credentials are not configured." };
  const ok = await assertMember(opts.scope.userId, opts.scope.businessId);
  if (!ok) return { ...base, error: "Business not found or access denied." };
  const { data: sess } = await sb.from("chat_sessions").select("id,business_id,user_id")
    .eq("id", opts.sessionId).maybeSingle();
  const srow = sess as { id: string; business_id: string; user_id: string } | null;
  if (!srow || srow.business_id !== opts.scope.businessId || srow.user_id !== opts.scope.userId) {
    return { ...base, error: "Conversation ownership mismatch — write rejected." };
  }
  let userMessageId: string | null = null;
  let assistantMessageId: string | null = null;
  const q = (opts.question || "").slice(0, 4000);
  const a = (opts.answer || "").slice(0, 8000);
  const u = await sb.from("chat_messages")
    .insert({ session_id: opts.sessionId, business_id: opts.scope.businessId, role: "user", content: q })
    .select("id").single();
  if (!u.error && u.data) userMessageId = (u.data as { id: string }).id;
  const m = await sb.from("chat_messages")
    .insert({
      session_id: opts.sessionId, business_id: opts.scope.businessId, role: "assistant",
      content: a, provider: (opts.provider || "unknown").slice(0, 80),
      model: (opts.model || "unknown").slice(0, 120),
    })
    .select("id").single();
  if (!m.error && m.data) assistantMessageId = (m.data as { id: string }).id;
  try {
    await sb.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", opts.sessionId);
  } catch { /* best-effort */ }
  if (userMessageId && assistantMessageId) {
    return { persisted: true, sessionId: opts.sessionId, userMessageId, assistantMessageId, partial: false };
  }
  const errs: string[] = [];
  if (u.error) errs.push(`user:${String(u.error.message || "insert failed").slice(0, 120)}`);
  if (m.error) errs.push(`assistant:${String(m.error.message || "insert failed").slice(0, 120)}`);
  return {
    persisted: false, sessionId: opts.sessionId, userMessageId, assistantMessageId,
    partial: Boolean(userMessageId || assistantMessageId),
    error: `Partial persistence — ${errs.join(" | ") || "insert failed"}. Answer shown; history may be incomplete.`,
  };
}
export async function fetchTrustedAssistantMessage(opts: {
  scope: PersistedScope; messageId: string; sessionId?: string;
}): Promise<{ message: TrustedAssistantMessage | null; error?: string }> {
  const sb = serverStoreClient();
  if (!sb) return { message: null, error: "Supabase server credentials are not configured." };
  const mid = (opts.messageId || "").trim().slice(0, 80);
  if (!mid) return { message: null, error: "messageId is required." };
  const ok = await assertMember(opts.scope.userId, opts.scope.businessId);
  if (!ok) return { message: null, error: "Business not found or access denied." };
  const { data, error } = await sb.from("chat_messages")
    .select("id,session_id,business_id,role,content,created_at").eq("id", mid).maybeSingle();
  if (error || !data) return { message: null, error: "Assistant message not found." };
  const row = data as { id: string; session_id: string; business_id: string; role: string; content: string; created_at: string };
  if (row.role !== "assistant") return { message: null, error: "Only final assistant answers can be spoken." };
  if (row.business_id !== opts.scope.businessId) return { message: null, error: "Message business scope mismatch — rejected." };
  if (opts.sessionId && row.session_id !== opts.sessionId) return { message: null, error: "Message conversation mismatch — rejected." };
  const { data: sess } = await sb.from("chat_sessions").select("id,business_id,user_id")
    .eq("id", row.session_id).maybeSingle();
  const srow = sess as { id: string; business_id: string; user_id: string } | null;
  if (!srow || srow.business_id !== opts.scope.businessId || srow.user_id !== opts.scope.userId) {
    return { message: null, error: "Conversation ownership mismatch — rejected." };
  }
  if (!row.content || !row.content.trim()) return { message: null, error: "Assistant message is empty." };
  return {
    message: {
      id: row.id, sessionId: row.session_id, businessId: row.business_id,
      userId: opts.scope.userId, role: "assistant", content: row.content, createdAt: row.created_at,
    },
  };
}

