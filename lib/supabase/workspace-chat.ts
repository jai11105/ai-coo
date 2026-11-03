// Live Copilot chat persistence (Phase 4). Existing chat_sessions /
// chat_messages ALL policies only (member + own user). No model, prompt,
// provider, or architecture change here.

import { supabase } from "./client";
import { formatDbError } from "./businesses";

export interface LiveChatSession {
  id: string;
  business_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface LiveChatMessage {
  id: string;
  session_id: string;
  business_id: string;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  model: string | null;
  status: string;
  created_at: string;
}

const SESSION_FIELDS = "id,business_id,user_id,title,created_at,updated_at,archived_at";
const MESSAGE_FIELDS = "id,session_id,business_id,role,content,provider,model,status,created_at";

/** Latest chat session for user+business, or null when none exists. */
export async function fetchLatestChatSession(
  businessId: string,
  userId: string
): Promise<LiveChatSession | null> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select(SESSION_FIELDS)
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[fetchLatestChatSession] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  return (data as LiveChatSession | null) ?? null;
}

/** Create a chat session for user+business. */
export async function createChatSession(
  businessId: string,
  userId: string,
  title = "New Conversation"
): Promise<LiveChatSession> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ business_id: businessId, user_id: userId, title })
    .select(SESSION_FIELDS)
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[createChatSession] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  return data as LiveChatSession;
}

/** Messages for a chat session (newest last). */
export async function fetchChatMessages(sessionId: string): Promise<LiveChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select(MESSAGE_FIELDS)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[fetchChatMessages] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  return (data ?? []) as LiveChatMessage[];
}

/** Append a chat message to a session. */
export async function createChatMessage(
  sessionId: string,
  businessId: string,
  role: "user" | "assistant",
  content: string
): Promise<LiveChatMessage> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ session_id: sessionId, business_id: businessId, role, content })
    .select(MESSAGE_FIELDS)
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[createChatMessage] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  return data as LiveChatMessage;
}
