// Diagnostic-only provider-attempt helpers (no secrets, no payloads).
// Pure functions: safe to unit-test without network or Supabase.
// Never emits API keys, Authorization headers, request bodies, or rows.

import type {
  ProviderAttempt,
  ProviderAttemptClassification,
  ProviderAttemptKind,
} from "./types";
import { scrubForLog } from "./types";

export const PROVIDER_ERROR_SNIPPET_MAX = 400;

/** Hostname only — never path, query, port credentials, or full URL. */
export function baseHostOf(baseUrl: string): string {
  const raw = (baseUrl || "").trim();
  if (!raw) return "unknown";
  try {
    const host = new URL(raw).hostname.trim().toLowerCase();
    return host || "unknown";
  } catch {
    // Tolerate bare hosts ("api.meta.ai") without scheme.
    const bare = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0].split("?")[0].split("@").pop() || "";
    const host = bare.split(":")[0].trim().toLowerCase();
    return host || "unknown";
  }
}

/** Classify a provider failure without leaking payloads. */
export function classifyProviderError(e: unknown): ProviderAttemptClassification {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const status = (e as unknown as { status?: unknown } | null)?.status;
  if (typeof status === "number" && Number.isFinite(status)) return "http";
  if (/not configured on the server/i.test(msg)) return "config";
  if (/empty response/i.test(msg)) return "empty";
  if (e instanceof Error && e.name === "AbortError") return "timeout";
  if (/timed out/i.test(msg)) return "timeout";
  if (/unreachable|network|ECONN|ETIMEDOUT|fetch failed|ENOTFOUND|EAI_AGAIN| socket /i.test(msg)) {
    return "network";
  }
  if (/^Provider HTTP \d+/i.test(msg)) return "http";
  return "unknown";
}

/** Sanitized snippet: scrubbed + capped at 400 chars. Never includes keys. */
export function sanitizeErrorSnippet(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "provider failed");
  return scrubForLog(raw).slice(0, PROVIDER_ERROR_SNIPPET_MAX);
}

/** HTTP status carried on thrown provider errors (if any). */
export function httpStatusOf(e: unknown): number | null {
  const s = (e as unknown as { status?: unknown } | null)?.status;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

export function buildErrorAttempt(opts: {
  attempt: ProviderAttemptKind;
  provider: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  latencyMs: number;
  error: unknown;
}): ProviderAttempt {
  return {
    attempt: opts.attempt,
    provider: opts.provider,
    model: opts.model,
    httpStatus: httpStatusOf(opts.error),
    latencyMs: Math.max(0, Math.round(opts.latencyMs)),
    outcome: "error",
    classification: classifyProviderError(opts.error),
    errorSnippet: sanitizeErrorSnippet(opts.error),
    baseHost: baseHostOf(opts.baseUrl),
    maxTokens: opts.maxTokens,
  };
}

export function buildOkAttempt(opts: {
  attempt: ProviderAttemptKind;
  provider: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  latencyMs: number;
}): ProviderAttempt {
  return {
    attempt: opts.attempt,
    provider: opts.provider,
    model: opts.model,
    httpStatus: 200,
    latencyMs: Math.max(0, Math.round(opts.latencyMs)),
    outcome: "ok",
    classification: "ok",
    baseHost: baseHostOf(opts.baseUrl),
    maxTokens: opts.maxTokens,
  };
}
