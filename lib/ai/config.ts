// AI provider + runtime configuration (server-side only).
// NEVER import from client components — reads secret keys.
// Exact .env names from .env.example are reused; nothing is renamed.
// No .env.local reads/writes here; process.env only.

export const PROMPT_VERSION = "v1.0.0-slice6";

export interface AiConfig {
  metaBaseUrl: string;
  metaApiKey: string;
  metaModelId: string;
  metaExtractionModelId: string;
  metaImageModelId: string;
  metaAsrUrl: string;
  basetenApiKey: string;
  basetenBaseUrl: string; // optional deployment base; empty = not configured
  basetenModelId: string;
  fireworksApiKey: string;
  fireworksBaseUrl: string;
  fireworksModelId: string;
  mmsTtsEndpoint: string;
  mmsTtsModelId: string;
}

function clean(v: string | undefined, fallback = ""): string {
  return (v ?? fallback).trim();
}

export function aiConfig(): AiConfig {
  return {
    metaBaseUrl: clean(process.env.META_BASE_URL || process.env.META_API_BASE_URL, "https://api.meta.ai/v1").replace(/\/$/, ""),
    metaApiKey: clean(process.env.META_API_KEY),
    metaModelId: clean(process.env.META_MODEL_ID, "muse-spark-1.3"),
    metaExtractionModelId: clean(process.env.META_EXTRACTION_MODEL_ID, "muse-spark-1.3-contributor"),
    // Verified Meta image model (image generation only — never chat).
    // Follows existing META_* conventions; default is the verified ID.
    metaImageModelId: clean(process.env.META_IMAGE_MODEL, "muse-image-1.0"),
    metaAsrUrl: clean(process.env.META_ASR_TRANSCRIBE_URL, "https://api.meta.ai/v1/asr/transcribe"),
    basetenApiKey: clean(process.env.BASETEN_API_KEY),
    basetenBaseUrl: clean(process.env.BASETEN_BASE_URL), // deployment base URL (from Baseten dashboard); empty when unprovisioned
    // Slice 5: accept both BASETEN_MUSE_SPARK_MODEL_ID (documented) and
    // BASETEN_MODEL_ID (observed alias, e.g. meta-models/muse-spark-open-1026).
    basetenModelId: clean(process.env.BASETEN_MUSE_SPARK_MODEL_ID || process.env.BASETEN_MODEL_ID),
    fireworksApiKey: clean(process.env.FIREWORKS_API_KEY),
    fireworksBaseUrl: clean(process.env.FIREWORKS_BASE_URL, "https://api.fireworks.ai/inference/v1").replace(/\/$/, ""),
    // Default resolved live 2026-11-02 via GET {base}/models with the project
    // key: muse-glimmer-30b -> HTTP 404 NOT_FOUND ("not deployed");
    // muse-spark-open -> HTTP 200 + text + tool_calls verified.
    fireworksModelId: clean(process.env.FIREWORKS_MODEL_ID, "accounts/fireworks/models/muse-spark-open"),
    mmsTtsEndpoint: clean(process.env.MMS_TTS_ENDPOINT_URL),
    mmsTtsModelId: clean(process.env.MMS_TTS_MODEL_ID, "facebook/mms-tts-eng"),
  };
}

export interface ProviderStatus {
  meta: { configured: boolean; model: string };
  baseten: { configured: boolean; model: string; note: string };
  fireworks: { configured: boolean; model: string; note: string };
  tts: { configured: boolean; model: string };
}

/** Honest capability report — never claims unverified endpoints work. */
export function providerStatus(): ProviderStatus {
  const c = aiConfig();
  return {
    meta: { configured: Boolean(c.metaApiKey), model: c.metaModelId },
    baseten: {
      configured: Boolean(c.basetenApiKey && c.basetenBaseUrl && c.basetenModelId),
      model: c.basetenModelId || "Muse Spark Open 1026 (deployment URL required)",
      note: c.basetenBaseUrl
        ? "Baseten deployment URL present — live verification still required."
        : "BASETEN_BASE_URL not set — specialist calls will gracefully degrade (no invented endpoint).",
    },
    fireworks: {
      configured: Boolean(c.fireworksApiKey),
      model: c.fireworksModelId,
      note: "Standard Fireworks inference base URL — function-calling compatibility requires live verification.",
    },
    tts: { configured: Boolean(c.mmsTtsEndpoint), model: c.mmsTtsModelId },
  };
}
