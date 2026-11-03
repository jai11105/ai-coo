// Slice 8 — server-side Copilot conversation + message persistence (PART 1).
// Single durable store over EXISTING chat_sessions / chat_messages schema.
// Demo mode never writes. Live mode: service-role (server-only) + explicit
// membership check before every write/read. RLS stays enabled.
import { createClient } from "@supabase/supabase-js";
export interface PersistedScope { userId: string; businessId: string }
export interface PersistResult {
  persisted: boolean; sessionId: string | null;
  userMessageId: string | null; assistantMessageId: string | null;
  partial: boolean; error?: string;
}
export interface TrustedAssistantMessage {
  id: string; sessionId: string; businessId: string; userId: string;
  role: "assistant"; content: string; createdAt: string;
}
export function serverStoreClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
export function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((v || "").trim());
}
export async function assertMember(userId: string, businessId: string): Promise<boolean> {
  const sb = serverStoreClient();
  if (!sb) return false;
  const { data, error } = await sb.from("business_members").select("business_id")
    .eq("business_id", businessId).eq("user_id", userId).eq("status", "active").maybeSingle();
  return !error && Boolean(data);
}
export async function resolveLiveSession(
  scope: PersistedScope, conversationId: string, titleSeed: string,
): Promise<{ sessionId: string | null; error?: string }> {
  const sb = serverStoreClient();
  if (!sb) return { sessionId: null, error: "Supabase server credentials are not configured." };
  const ok = await assertMember(scope.userId, scope.businessId);
  if (!ok) return { sessionId: null, error: "Business not found or access denied." };
  const cid = (conversationId || "").trim().slice(0, 80);
  if (cid && isUuidLike(cid)) {
    const { data } = await sb.from("chat_sessions").select("id,business_id,user_id")
      .eq("id", cid).maybeSingle();
    const row = data as { id: string; business_id: string; user_id: string } | null;
    if (row && row.business_id === scope.businessId && row.user_id === scope.userId) {
      return { sessionId: row.id };
    }
  }
  const title = (titleSeed || "New Conversation").trim().slice(0, 60) || "New Conversation";
  const { data, error } = await sb.from("chat_sessions")
    .insert({ business_id: scope.businessId, user_id: scope.userId, title })
    .select("id").single();
  if (error || !data) {
    return { sessionId: null, error: `Session persist failed: ${String(error?.message || "unknown").slice(0, 200)}` };
  }
  return { sessionId: (data as { id: string }).id };
}


