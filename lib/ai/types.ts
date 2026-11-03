// Shared Copilot response + trace contracts (Slice 1).
// Every Copilot message returns this shape — greetings included.
// No hardcoded frontend answers: the server builds this via the AI flow.

export type CopilotIntent =
  | "greeting"
  | "casual"
  | "summary"
  | "metric"
  | "comparison"
  | "trend"
  | "product"
  | "category"
  | "channel"
  | "rca"
  | "recommendation"
  | "peak_hours"
  | "scenario"
  | "image"
  | "unclear";

export interface CopilotEvidenceRef {
  id: string;
  label: string;
  display: string;
}

/** One provider attempt (diagnostic-only, sanitized). Never holds keys,
 *  headers, payloads, or business rows — only host + model + outcome. */
export type ProviderAttemptKind =
  | "meta-primary"
  | "meta-retry"
  | "fireworks-fallback"
  | "meta-image"
  | "baseten-specialist";

export type ProviderAttemptClassification =
  | "ok"
  | "http"
  | "timeout"
  | "network"
  | "empty"
  | "config"
  | "unknown";

export interface ProviderAttempt {
  attempt: ProviderAttemptKind;
  provider: string;
  model: string;
  httpStatus: number | null;
  latencyMs: number;
  outcome: "ok" | "error";
  classification: ProviderAttemptClassification;
  /** Sanitized snippet, max 400 chars. Absent on success. */
  errorSnippet?: string;
  /** Base hostname only (no path/query/keys). */
  baseHost: string;
  maxTokens: number;
}

export interface StageTiming {
  stage: string;
  provider: string;
  model: string;
  timeoutMs: number;
  elapsedMs: number;
  httpStatus: number | null;
  outcome: "ok" | "error" | "skipped";
  classification: string;
  detail?: string;
}

export interface CopilotResponse {
  answer: string;
  intent: CopilotIntent;
  evidence: CopilotEvidenceRef[];
  provider: string; // e.g. "meta" | "deterministic-only" | "fallback:<name>"
  model: string;
  traceId: string;
  tokens?: { input?: number; output?: number };
  latencyMs: number;
  warnings: string[];
  followUp?: string | null;
  /** Slice 5: concise specialist-analysis status for the Copilot UI. */
  specialist?: {
    used: boolean;
    status: "used" | "skipped" | "unconfigured" | "failed" | "not_required";
    reason: string;
  };
  /** Per-stage timing for live RCA diagnostics (sanitized, no keys/payloads). */
  stageTimings?: StageTiming[];
}

export interface TraceEvent {
  traceId: string;
  businessId: string | null;
  userId: string | null;
  question: string;
  intent: CopilotIntent | null;
  provider: string;
  model: string;
  promptVersion: string;
  toolCalls: { name: string; ok: boolean; latencyMs: number; error?: string }[];
  evidenceIds: string[];
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  status: "ok" | "error" | "degraded";
  error?: string;
  /** Per-attempt provider observability (sanitized). Surfaced via
   *  GET /api/copilot/traces which returns full TraceEvent objects. */
  providerAttempts?: ProviderAttempt[];
  /** Slice 5: specialist routing + outcome observability (sanitized). */
  specialist?: {
    required: boolean;
    reason: string;
    kind: string | null;
    model: string | null;
    status: "ok" | "skipped" | "unconfigured" | "error" | "invalid";
    latencyMs?: number;
    retries?: number;
    toolCalls?: { name: string; ok: boolean; latencyMs: number; error?: string }[];
    evidenceRefs?: string[];
    validation?: string[];
  };
  /** Per-stage timing for live RCA diagnostics (sanitized, no keys/payloads). */
  stageTimings?: StageTiming[] | undefined;
  createdAt: string;
}

// In-memory trace ring (per-process, capped). Supabase persistence for
// traces lands in a later slice after schema review; never log secrets.
const TRACES: TraceEvent[] = [];
const TRACE_CAP = 200;

export function recordTrace(t: TraceEvent): void {
  TRACES.push(t);
  if (TRACES.length > TRACE_CAP) TRACES.splice(0, TRACES.length - TRACE_CAP);
}

export function recentTraces(limit = 20): TraceEvent[] {
  return TRACES.slice(-Math.max(1, Math.min(limit, TRACE_CAP)));
}

export function newTraceId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function scrubForLog(text: string): string {
  // Redact PAN-like / account-like digit runs and credential-looking pairs.
  // Also redact Bearer tokens and sk-style secrets so provider HTTP bodies
  // can never leak keys into traces/warnings. Never throws.
  return (text ?? "")
    .replace(/\b\d{12,19}\b/g, "[redacted-id]")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, "Bearer=[redacted]")
    .replace(/\bsk-[A-Za-z0-9\-_]{4,}\b/g, "[redacted-key]")
    .replace(/(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}
