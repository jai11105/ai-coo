// Slice 7 Stage 2A — Muse Image explicit creative generation (server-only).
// Explicit requests only; never charts/dashboards; never auto-generated.
// Verified contract (never invent alternative model IDs):
//   Model ID: muse-image-1.0 (configurable via META_IMAGE_MODEL)
//   Base URL: https://api.meta.ai/v1 (META_BASE_URL / META_API_BASE_URL)
//   POST {META_BASE_URL}/images/generations with { model, prompt, size }
//   Auth: Bearer META_API_KEY (same Meta credential as chat — verified compatible).
// URL join strips trailing "/" so /v1 is never duplicated (/v1/v1).
import { aiConfig } from "./config";
export interface ImageGenInput { prompt: string; businessId: string; size?: string }
export interface ImageGenResult {
  ok: boolean; imageUrl?: string; b64?: string; revisedPrompt?: string;
  error?: string; provider?: string;
}
const EXPLICIT_RE = /\b(generate|create|make|design)\b[^.]{0,120}\b(image|poster|photo|illustration|advertisement|ad\b|creative|banner|promo|promotional|launch)\b|\b(image|poster|photo|illustration|advertisement|creative|banner)\b[^.]{0,80}\b(for|of)\b|\bdiwali offer poster\b|\bproduct advertisement\b|\bmarketing creative\b/i;
const CHART_RE = /\b(chart|graph|dashboard|metric|plot|visualiz|kpi|trend\s*chart)\b/i;
export function isExplicitImageRequest(message: string): boolean {
  const m = (message || "").slice(0, 1000);
  if (!EXPLICIT_RE.test(m)) return false;
  if (CHART_RE.test(m)) return false;
  return true;
}
export function validateImageRequest(input: ImageGenInput): { ok: boolean; error?: string; prompt?: string; size?: string } {
  const prompt = (input.prompt || "").trim().slice(0, 1000);
  if (!input.businessId) return { ok: false, error: "Business context is required." };
  if (prompt.length < 8) return { ok: false, error: "Describe the creative you want (poster, ad, product launch image)." };
  if (CHART_RE.test(prompt)) return { ok: false, error: "Image generation is for creatives only — charts and dashboards are not generated as images." };
  if (!EXPLICIT_RE.test(prompt) && !/poster|advertisement|creative|banner|promo|launch/i.test(prompt)) {
    return { ok: false, error: "Image generation runs only on explicit creative requests." };
  }
  const size = (input.size || "1024x1024").trim();
  if (!/^\d{3,4}x\d{3,4}$/.test(size)) return { ok: false, error: "Size must look like 1024x1024." };
  return { ok: true, prompt, size };
}
export async function generateCopilotImage(input: ImageGenInput): Promise<ImageGenResult> {
  const v = validateImageRequest(input);
  if (!v.ok) return { ok: false, error: v.error };
  const c = aiConfig();
  if (!c.metaApiKey) return { ok: false, error: "META_API_KEY is not configured on the server.", provider: "meta-image" };
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 45000);
  try {
    // metaBaseUrl already has trailing "/" stripped in aiConfig(); joining
    // with "/images/generations" keeps exactly one "/v1" segment.
    // Defensive: collapse an accidental "/v1/v1" (e.g. misconfigured base).
    const base = c.metaBaseUrl.replace(/\/+$/, "");
    const url = `${base}/images/generations`.replace(/\/v1\/v1(\/|$)/, "/v1$1");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${c.metaApiKey}` },
      body: JSON.stringify({ model: c.metaImageModelId, prompt: v.prompt, size: v.size }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 400);
      return { ok: false, error: `Image generation failed (HTTP ${res.status}). ${body || "Please retry."}`, provider: "meta-image" };
    }
    const json = (await res.json().catch(() => null)) as {
      data?: { url?: string; b64_json?: string; revised_prompt?: string }[];
      output?: { url?: string }[];
      url?: string;
    } | null;
    const first = json?.data?.[0];
    const imageUrl = first?.url || json?.output?.[0]?.url || json?.url;
    const b64 = first?.b64_json;
    const revisedPrompt = first?.revised_prompt;
    if (!imageUrl && !b64) return { ok: false, error: "Image service returned no image. Please retry.", provider: "meta-image" };
    return { ok: true, imageUrl, b64, revisedPrompt, provider: "meta-image" };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "AbortError" ? "Image generation timed out. Please retry." : `Image service unreachable: ${e instanceof Error ? e.message : "network error"}`, provider: "meta-image" };
  } finally { clearTimeout(timeout); }
}
