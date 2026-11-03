// Slice 8 — per-user / per-tenant rate limits + request-size guards.
// In-memory per-process token buckets (serverless-safe best-effort).
// Pure + mock-testable: no network, no Supabase, no secrets.
const buckets = new Map<string, { count: number; resetAt: number }>();
export const CHAT_LIMIT = 30;
export const CHAT_WINDOW_MS = 60_000;
export const IMAGE_LIMIT = 10;
export const IMAGE_WINDOW_MS = 60_000;
export const TTS_LIMIT = 20;
export const TTS_WINDOW_MS = 60_000;
export const TRANSCRIBE_LIMIT = 20;
export const TRANSCRIBE_WINDOW_MS = 60_000;
export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterMs: number } {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count < limit) {
    b.count += 1;
    return { ok: true, retryAfterMs: 0 };
  }
  return { ok: false, retryAfterMs: Math.max(0, b.resetAt - now) };
}
export function rateKey(scope: string, userId: string | null, businessId: string | null): string {
  return `${scope}:${userId || "anon"}:${businessId || "demo"}`;
}
export function clearRateLimits(): void {
  buckets.clear();
}
export const MAX_CHAT_CHARS = 2000;
export const MAX_IMAGE_PROMPT_CHARS = 1000;
export const MAX_TTS_CHARS = 6000;
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
