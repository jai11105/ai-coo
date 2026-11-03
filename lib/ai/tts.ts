// Slice 7 Stage 2C — Meta MMS TTS (facebook/mms-tts-eng, CC-BY-NC 4.0).
// English only. Speaks ONLY final validated Copilot answers. Text answer
// always survives TTS failure. Self-hosted Transformers worker via
// MMS_TTS_ENDPOINT_URL; no MMS_TTS_API_KEY required. Never invents a hosted
// inference endpoint — unconfigured endpoint degrades honestly.
import { aiConfig } from "./config";
export interface TtsInput { text: string }
export interface TtsResult { ok: boolean; audioBase64?: string; mimeType?: string; error?: string }
export function sanitizeForTts(answer: string): string {
  return (answer || "")
    .replace(/◈\s*\S+/g, " ")
    .replace(/\b(evidence|trace|specialist|diagnostic)[\w-]*\s*[:#]?\s*[a-z0-9_.-]+/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}
export function ttsConfigured(): boolean {
  return Boolean(aiConfig().mmsTtsEndpoint);
}
function cleanEnv(v: string | undefined): string {
  return (v ?? "").trim();
}

export async function synthesizeCopilotSpeech(input: TtsInput): Promise<TtsResult> {
  const text = sanitizeForTts(input.text);
  if (!text) return { ok: false, error: "Nothing speakable in the answer." };
  const c = aiConfig();
  if (!c.mmsTtsEndpoint) {
    return { ok: false, error: "Spoken answers are not configured (self-hosted MMS TTS endpoint required — see README). Text answer unaffected." };
  }
  // Hugging Face inference contract differs from a self-hosted Transformers
  // worker: HF expects { inputs: "<text>" } and returns binary audio, and
  // gated models require an HF token. Detect HF endpoints and speak the HF
  // contract; keep the worker contract ({ model, input, language }) otherwise.
  // No token is invented — when HF auth fails without a configured token the
  // exact external setup blocker is reported honestly.
  const isHf = /huggingface\.co/.test(c.mmsTtsEndpoint);
  const hfToken = cleanEnv(
    process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN,
  );
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(c.mmsTtsEndpoint, {
      method: "POST",
      headers: isHf
        ? {
          "Content-Type": "application/json",
          Accept: "audio/wav",
          ...(hfToken ? { Authorization: `Bearer ${hfToken}` } : {}),
        }
        : { "Content-Type": "application/json", Accept: "application/json" },
      body: isHf
        ? JSON.stringify({ inputs: text })
        : JSON.stringify({ model: c.mmsTtsModelId || "facebook/mms-tts-eng", input: text, language: "en" }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      if (isHf && (res.status === 401 || res.status === 403) && !hfToken) {
        return { ok: false, error: `Speech synthesis blocked (HTTP ${res.status} from Hugging Face): the configured MMS TTS endpoint requires a Hugging Face token and none is configured (set HF_API_KEY or HUGGINGFACE_API_KEY server-side). Text answer unaffected.` };
      }
      if (isHf && (res.status === 404 || res.status === 410)) {
        return { ok: false, error: `Speech synthesis blocked (HTTP ${res.status} from Hugging Face): the model endpoint is unavailable or moved — verify MMS_TTS_ENDPOINT_URL on the Hugging Face model page. Text answer unaffected. ${body}` };
      }
      return { ok: false, error: `Speech synthesis failed (HTTP ${res.status}). ${body || "Text answer unaffected."}` };
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("audio") || ct.includes("octet-stream") || ct.includes("x-wav")) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return { ok: false, error: "Speech audio invalid. Text answer unaffected." };
      return { ok: true, audioBase64: buf.toString("base64"), mimeType: ct.split(";")[0] || "audio/wav" };
    }
    const json = (await res.json().catch(() => null)) as { audio_base64?: string; audioBase64?: string; mime_type?: string; mimeType?: string; error?: unknown } | null;
    const b64 = json?.audio_base64 || json?.audioBase64;
    if (!b64) {
      const errText = typeof json?.error === "string" ? json.error.slice(0, 200) : "";
      return { ok: false, error: `Speech service returned no audio. ${errText}Text answer unaffected.` };
    }
    return { ok: true, audioBase64: b64, mimeType: json?.mime_type || json?.mimeType || "audio/wav" };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "AbortError" ? "Speech synthesis timed out. Text answer unaffected." : `Speech service unreachable. Text answer unaffected.` };
  } finally { clearTimeout(timeout); }
}
