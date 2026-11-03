// Server-only helpers for Log Entry voice flow.
// NEVER import this file from client components — it reads secret keys.

export function metaAsrConfig() {
  // Official file transcription endpoint. Exact .env.local names:
  // META_ASR_TRANSCRIBE_URL (preferred), META_API_KEY.
  // META_BASE_URL is the chat/extraction host only — never used for ASR here.
  const url =
    process.env.META_ASR_TRANSCRIBE_URL || "https://api.meta.ai/v1/asr/transcribe";
  const apiKey = process.env.META_API_KEY || "";
  return { url, apiKey };
}

/**
 * Forward recorded WAV audio to Meta Muse Voice Transcribe 1.0.
 * Official file transcription contract:
 *   POST https://api.meta.ai/v1/asr/transcribe
 *   Authorization: Bearer <META_API_KEY>
 *   Accept: application/json
 *   multipart/form-data:
 *     request: JSON Blob (application/json)
 *       { mode: "PUSH_TO_TALK", model: "muse-voice-transcribe-1.0",
 *         audioEncoding: "WAV", languageBias: ["Tamil", "English"] }
 *     audio: WAV Blob/File (mono PCM16, 24 kHz preferred or 16 kHz)
 * Returns the top-level `transcript` (PUSH_TO_TALK has no useful `turns`).
 */
export async function transcribeWithMeta(
  audio: Blob,
  opts: { filename: string; mimeType: string; language?: string }
): Promise<{ transcript: string; raw: unknown }> {
  const { url, apiKey } = metaAsrConfig();
  if (!apiKey) {
    throw new Error(
      "META_API_KEY is not configured on the server. Add it to .env.local (server-only) and retry."
    );
  }
  const kind = (opts.mimeType || "").toLowerCase();
  const name = (opts.filename || "").toLowerCase();
  const isWav = kind.includes("wav") || name.endsWith(".wav");
  if (!isWav) {
    throw new Error(
      "Audio must be mono PCM16 WAV (24 kHz or 16 kHz). Convert WebM/Opus to WAV before uploading."
    );
  }
  const form = new FormData();
  // Part 1: `request` MUST be a JSON Blob with Content-Type application/json.
  form.append(
    "request",
    new Blob(
      [
        JSON.stringify({
          mode: "PUSH_TO_TALK",
          model: "muse-voice-transcribe-1.0",
          audioEncoding: "WAV",
          languageBias: ["Tamil", "English"],
        }),
      ],
      { type: "application/json" }
    )
  );
  // Part 2: converted WAV audio. Never set multipart Content-Type manually.
  form.append("audio", audio, opts.filename);

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      body: form,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === "AbortError"
        ? "Meta transcription timed out. Please try a shorter recording."
        : `Could not reach the Meta transcription service: ${e instanceof Error ? e.message : "network error"}`
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 500);
    throw new Error(`Meta transcription failed (HTTP ${res.status}). ${body || "Please retry."}`);
  }
  const raw = (await res.json().catch(() => null)) as {
    transcript?: unknown;
  } | null;
  // PUSH_TO_TALK: use the top-level transcript field only. Never `turns`.
  const transcript = typeof raw?.transcript === "string" ? raw.transcript.trim() : "";
  return { transcript, raw };
}
