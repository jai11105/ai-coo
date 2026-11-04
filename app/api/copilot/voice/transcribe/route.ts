// POST /api/copilot/voice/transcribe — Copilot voice questions.
// Reuses WAV validation + Meta ASR adapter (same as Log Entry). Recorded
// audio only (mono PCM16 WAV 16/24 kHz). Returns transcript; the CLIENT then
// submits it through the EXISTING /api/copilot/chat pipeline (no second
// conversation pipeline). META_API_KEY never leaves the server.
import { NextResponse } from "next/server";
import { transcribeWithMeta } from "@/lib/server/meta-asr";
import { httpStatus } from "@/lib/ai/server-context";
import { checkRateLimit, rateKey, TRANSCRIBE_LIMIT, TRANSCRIBE_WINDOW_MS } from "@/lib/ai/rate-limit";
export const runtime = "nodejs";
export const maxDuration = 60;
const ALLOWED = new Set(["audio/wav", "audio/x-wav"]);
function wavMeta(buf: Buffer): { ok: boolean; error?: string } {
  if (buf.length < 44) return { ok: false, error: "Audio must be mono PCM16 WAV (16 kHz or 24 kHz)." };
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return { ok: false, error: "Audio must be mono PCM16 WAV (16 kHz or 24 kHz)." };
  }
  const channels = buf.readUInt16LE(22);
  const bits = buf.readUInt16LE(34);
  const rate = buf.readUInt32LE(24);
  if (channels !== 1) return { ok: false, error: "Audio must be mono (1 channel). Convert before uploading." };
  if (bits !== 16) return { ok: false, error: "Audio must be 16-bit PCM. Convert before uploading." };
  if (rate !== 16000 && rate !== 24000) return { ok: false, error: "Sample rate must be 16 kHz or 24 kHz. Convert before uploading." };
  return { ok: true };
}
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const hasAuth = authHeader.startsWith("Bearer ");
    // Slice 8: when a signed-in caller transcribes, verify membership so an
    // invalid/foreign token cannot use the tenant-scoped voice path quietly.
    // Demo/anonymous callers stay allowed (rate-limited); the transcript still
    // flows through the authorized /api/copilot/chat pipeline afterwards.
    let rlKey = rateKey("transcribe", null, "copilot");
    if (hasAuth) {
      try {
        const { getAuthorizedBusinessContext } = await import("@/lib/ai/server-context");
        const vctx = await getAuthorizedBusinessContext(req);
        rlKey = rateKey("transcribe", vctx.userId, vctx.businessId);
      } catch (e) {
        const status = (e as { status?: number })?.status ?? 401;
        const code = status === 403 ? "FORBIDDEN" : "UNAUTHENTICATED";
        return NextResponse.json({ error: { code, message: e instanceof Error ? e.message : "Not authorized." } }, { status });
      }
    }
    const rl = checkRateLimit(rlKey, TRANSCRIBE_LIMIT, TRANSCRIBE_WINDOW_MS);
    if (!rl.ok) {
      return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many voice requests. Please wait a moment." } }, { status: 429 });
    }
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Send recorded audio as multipart form-data." } }, { status: 400 });
    const file = form.get("audio") ?? form.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Empty recording. Please record again and speak clearly." } }, { status: 400 });
    }
    console.info(`[api/transcribe] audio received (${file.size} bytes)`);
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Recording is too large (max 15 MB). Please record a shorter question." } }, { status: 400 });
    }
    const mime = (file.type || "audio/wav").split(";")[0].trim().toLowerCase();
    if (!ALLOWED.has(mime)) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: `Audio must be WAV (got ${mime || "unknown"}). Convert to mono PCM16 WAV before uploading.` } }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const meta = wavMeta(buf);
    if (!meta.ok) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: meta.error } }, { status: 400 });
    const { transcript } = await transcribeWithMeta(file, { filename: "copilot.wav", mimeType: mime });
    if (!transcript) {
      return NextResponse.json({ error: { code: "EMPTY_TRANSCRIPT", message: "No speech was recognized. Please record again and speak clearly." } }, { status: 422 });
    }
    console.info("[api/transcribe] ok");
    return NextResponse.json({ data: { transcript }, meta: { timestamp: new Date().toISOString() } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transcription failed.";
    const status = /not configured/i.test(message) ? 503 : httpStatus(e, 502);
    const code = status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : status === 429 ? "RATE_LIMITED" : "TRANSCRIBE_FAILED";
    return NextResponse.json({ error: { code, message } }, { status });
  }
}
