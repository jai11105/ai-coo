// POST /api/copilot/voice/speak — speak ONLY the final validated answer.
// Body: { text }. English only (facebook/mms-tts-eng). Text answer always
// survives TTS failure (ok:false keeps the text usable in the UI).
import { NextResponse } from "next/server";
import { sanitizeForTts, synthesizeCopilotSpeech } from "@/lib/ai/tts";
import { getAuthorizedBusinessContext } from "@/lib/ai/server-context";
import { fetchTrustedAssistantMessage } from "@/lib/ai/conversation-persist";
import { checkRateLimit, rateKey, TTS_LIMIT, TTS_WINDOW_MS } from "@/lib/ai/rate-limit";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      text?: unknown; messageId?: unknown; sessionId?: unknown; conversationId?: unknown;
    } | null;
    const raw = typeof body?.text === "string" ? body.text : "";
    const messageId = typeof body?.messageId === "string" ? body.messageId.trim().slice(0, 80) : "";
    const sessionRef = typeof body?.sessionId === "string" ? body.sessionId.trim().slice(0, 80)
      : typeof body?.conversationId === "string" ? body.conversationId.trim().slice(0, 80) : "";
    const hasAuth = Boolean((req.headers.get("authorization") || "").startsWith("Bearer "));
    // Live/authenticated path: trusted persisted assistant message required.
    // Arbitrary client text is NEVER spoken for authenticated requests.
    if (hasAuth) {
      if (!messageId) {
        return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Authenticated speech requires a messageId for a persisted assistant answer." } }, { status: 400 });
      }
      let ctx: { userId: string; businessId: string };
      try {
        ctx = await getAuthorizedBusinessContext(req);
      } catch (e) {
        const status = (e as { status?: number })?.status ?? 401;
        return NextResponse.json({ error: { code: status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", message: e instanceof Error ? e.message : "Not authorized." } }, { status });
      }
      const rl = checkRateLimit(rateKey("tts", ctx.userId, ctx.businessId), TTS_LIMIT, TTS_WINDOW_MS);
      if (!rl.ok) {
        return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many speech requests. Please wait a moment." } }, { status: 429 });
      }
      const trusted = await fetchTrustedAssistantMessage({
        scope: { userId: ctx.userId, businessId: ctx.businessId },
        messageId, sessionId: sessionRef || undefined,
      });
      if (!trusted.message) {
        return NextResponse.json({ error: { code: "FORBIDDEN", message: trusted.error || "Assistant message could not be verified." } }, { status: 403 });
      }
      const text = sanitizeForTts(trusted.message.content);
      if (!text) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Nothing speakable in the answer." } }, { status: 400 });
      const r = await synthesizeCopilotSpeech({ text });
      if (!r.ok) return NextResponse.json({ error: { code: "TTS_FAILED", message: r.error } }, { status: 502 });
      return NextResponse.json({ data: { audioBase64: r.audioBase64, mimeType: r.mimeType, messageId: trusted.message.id }, meta: { timestamp: new Date().toISOString() } });
    }
    // Demo/unauthenticated path: sanitize supplied text (no persistence to verify).
    const text = sanitizeForTts(raw);
    if (!text) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Nothing speakable in the answer." } }, { status: 400 });
    if (raw.length > 6000) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Answer too long for speech (max 6000 characters)." } }, { status: 400 });
    const rl = checkRateLimit(rateKey("tts", null, "demo"), TTS_LIMIT, TTS_WINDOW_MS);
    if (!rl.ok) {
      return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many speech requests. Please wait a moment." } }, { status: 429 });
    }
    const r = await synthesizeCopilotSpeech({ text });
    if (!r.ok) return NextResponse.json({ error: { code: "TTS_FAILED", message: r.error } }, { status: 502 });
    return NextResponse.json({ data: { audioBase64: r.audioBase64, mimeType: r.mimeType }, meta: { timestamp: new Date().toISOString() } });
  } catch (e) {
    return NextResponse.json({ error: { code: "TTS_FAILED", message: e instanceof Error ? e.message : "Speech synthesis failed." } }, { status: 502 });
  }
}

