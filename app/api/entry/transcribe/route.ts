import { NextResponse } from "next/server";
import { transcribeWithMeta } from "@/lib/server/meta-asr";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_MIME = new Set([
  "audio/wav",
  "audio/x-wav",
  // Converted WAV uploads only — raw WebM/Opus/MP4 is converted client-side
  // to mono PCM16 WAV before reaching this route (see lib/audio-wav.ts).
]);

/**
 * POST /api/entry/transcribe — recorded-audio transcription.
 * Request: multipart/form-data { audio: WAV Blob (mono PCM16 16 kHz) }
 * Browser records via MediaRecorder (no Web Speech API anywhere) and converts
 * to WAV client-side. Forwards to Meta Muse Voice Transcribe 1.0 server-side;
 * META_API_KEY never leaves the server. Returns { data: { transcript } }.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Send recorded audio as multipart form-data." } },
        { status: 400 }
      );
    }
    const file = form.get("audio") ?? form.get("file");
    const languageRaw = form.get("language");
    const language = typeof languageRaw === "string" && languageRaw.trim() ? languageRaw.trim().slice(0, 12) : undefined;
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Empty recording. Please record again and speak clearly." } },
        { status: 400 }
      );
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Recording is too large (max 15 MB). Please record a shorter entry." } },
        { status: 400 }
      );
    }
    const mime = (file.type || "audio/wav").split(";")[0].trim().toLowerCase();
    const okMime = ALLOWED_MIME.has(mime);
    if (!okMime) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `Audio must be WAV (got ${mime || "unknown"}). Convert to mono PCM16 WAV before uploading.` } },
        { status: 400 }
      );
    }
    const { transcript } = await transcribeWithMeta(file, {
      filename: "entry.wav",
      mimeType: mime,
      language,
    });
    if (!transcript) {
      return NextResponse.json(
        { error: { code: "EMPTY_TRANSCRIPT", message: "No speech was recognized. Please record again and speak clearly." } },
        { status: 422 }
      );
    }
    return NextResponse.json({
      data: { transcript },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transcription failed.";
    const status = /not configured/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: { code: "TRANSCRIBE_FAILED", message } }, { status });
  }
}
