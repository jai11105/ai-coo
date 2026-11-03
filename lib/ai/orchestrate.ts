// Layer 3 — COO orchestrator main flow (Slice 4 + Slice 5 specialist).
// Follow-up resolution → fresh deterministic tools → [Baseten specialist
// when Standard routes deep analysis] → Standard → validate.
// Deterministic backend is the source of truth; Standard enhances.
// FINAL FIX (Failures 1-5): intent is frozen after resolution (never
// re-derived); RCA rides the Baseten→Fireworks→deterministic chain only
// (Spark composition is never labeled a successful RCA when Baseten fails);
// truncated provider output routes to fallback/degraded (never rendered as
// complete); validation is intent-specific; evidence citations and internal
// diagnostics are stripped from user-facing text at the final boundary.

import { aiConfig, PROMPT_VERSION, providerStatus } from "./config";
// Per-call generation budgets are task-specific (see maxTokensForIntent in
// tool-defs.ts): greetings small (400), simple metrics lean (1000),
// summaries/comparisons moderate (1200), deep analysis larger (1500).
// Reasoning models consume hidden reasoning tokens from the same pool — an
// empty/truncated response routes to the Fireworks fallback (own full
// budget), never a same-budget retry on the same provider.
const budgetFor = (intent: string): { meta: number; fireworks: number } => {
  const t = maxTokensForIntent(intent);
  const isGreeting = intent === "greeting" || intent === "casual";
  const fireworks = isGreeting ? t : Math.max(1500, t);
  return { meta: t, fireworks };
};
import { appendTurn, getConversation, relevantHistory, updateState } from "./context";
import type { ActivePriority, AnalysisType } from "./context";
import type { EvidencePackage } from "./evidence";
import { isExplicitImageRequest } from "./image";
import { resolveFollowup, type FollowupResolution } from "./followup";
import { preRouteIntent, rollingWindowHint, timeframeHint } from "./intent";
import { comparisonLabelFor, isExplicitRcaRequest, RCA_COMPOSE_MAX_TOKENS, RCA_COMPOSE_RETRY_TIMEOUT_MS, RCA_COMPOSE_TIMEOUT_MS, RCA_SPECIALIST_TIMEOUT_MS, resolvePreset, resolveRange, type OrchestratorInput } from "./orchestrator";
import { todayInTimezone } from "../analytics";

/** Local ISO day arithmetic (mirrors lib/analytics addDays, kept local to
 *  avoid exporting internals). YYYY-MM-DD in → YYYY-MM-DD out. */
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
import { buildSpecialistPrompt, buildStandardPrompt, priorityCandidatesBlock } from "./prompts";
import { callFireworksFallback, callFireworksWithTools, callMetaStandard, callMetaStandardWithTools, FIREWORKS_TIMEOUT_MS, isRetryableProviderError } from "./providers";
import type { ToolMsg } from "./providers";
import { MAX_TOOL_ROUNDS, TOOL_LOOP_TIMEOUT_MS, maxTokensForIntent, toolsForIntent } from "./tool-defs";
import { execCopilotTool, toolResultPayload } from "./tool-run";

import {
  basetenConfigured,
  basetenToolDefinitions,
  callBasetenSpecialistWithTools,
  BASETEN_TOOL_ROUND_MAX_TOKENS,
  BASETEN_MEMO_MAX_TOKENS,
  BASETEN_TIMEOUT_MS,
  BASETEN_TOTAL_BUDGET_MS,
  BASETEN_MAX_TOKENS_DEFAULT,
} from "./baseten";
import { execSpecialistTool } from "./specialist-tools";
import { selectEvidence, selectEvidenceForResolution, selectPriorityEvidence } from "./select-evidence";
import { decideSpecialistNeed } from "./specialist";
import { validateSpecialistOutput } from "./specialist-validate";
import { baseHostOf, classifyProviderError, httpStatusOf } from "./provider-diagnostics";
import {
  identifyCandidates, isPriorityFollowup, isPriorityQuestion, rankCandidates,
  resolvePriorityReference, toRecommendations, validateRecommendations,
  PRIORITY_RANKING_VERSION, type PriorityRecommendation,
} from "./priorities";
import type { ToolContext } from "./tools";
import { degradedReply, validateAnswer } from "./validate";
import { newTraceId, recordTrace, recentTraces, type CopilotResponse, type ProviderAttempt, type TraceEvent } from "./types";
import {
  buildErrorAttempt,
  buildOkAttempt,
  sanitizeErrorSnippet,
} from "./provider-diagnostics";

/** Metric key stored on conversation state (allowlisted, stable). */
function stateMetricFor(resolution: FollowupResolution, intent: string, msg: string): string | null {
  const m = (resolution.metric || resolution.contextUpdates.metric || "").toLowerCase() || null;
  if (m) return m;
  if (/profit|margin/.test(msg)) return "profit";
  if (/purchase|stock/.test(msg) && !/sale/.test(msg)) return "purchases";
  if (/expense|overhead|rent|salary/.test(msg)) return "expenses";
  if (/product|contributed|best.?sell|most sold|top/.test(msg)) return "products";
  if (/categor/.test(msg)) return "categories";
  if (/channel/.test(msg)) return "channels";
  if (/trend/.test(msg)) return "trend";
  if (/peak|best time|rush hour/.test(msg)) return "peak_hours";
  if (/sale|revenue|turnover/.test(msg)) return "sales";
  if (intent === "comparison") return "comparison";
  if (intent === "summary" || intent === "metric") return "overview";
  return null;
}

function analysisFor(resolution: FollowupResolution): AnalysisType {
  const a = resolution.analysisType || resolution.contextUpdates.analysisType || null;
  if (a) return a;
  if (resolution.resolvedIntent === "comparison") return "comparison";
  if (resolution.resolvedIntent === "rca") return "diagnosis";
  if (resolution.resolvedIntent === "recommendation") return "recommendation";
  if (resolution.resolvedIntent === "scenario") return "scenario";
  if (resolution.resolvedIntent === "summary" || resolution.resolvedIntent === "metric") return "summary";
  return null;
}

/** Tool-call surface recorded on traces (allowlisted deterministic only). */
function recordToolCall(
  toolCalls: { name: string; ok: boolean; latencyMs: number; error?: string }[],
  name: string,
  ok: boolean, latencyMs: number, error?: string,
): void {
  // Slice 7: per-tool names (tool:get_sales …) stay within the allowlisted
  // deterministic surface — never arbitrary code, SQL, or model-chosen IDs.
  toolCalls.push(error ? { name, ok, latencyMs, error } : { name, ok, latencyMs });
}

export async function orchestrate(input: OrchestratorInput): Promise<CopilotResponse> {
  const started = Date.now();
  const traceId = newTraceId();
  const question = (input.message || "").trim().slice(0, 2000);
  const toolCalls: { name: string; ok: boolean; latencyMs: number; error?: string }[] = [];
  const cfg = aiConfig();
  const stageTimings: import("./types").StageTiming[] = [];
  const stage = (
    stageName: string, provider: string, model: string, timeoutMs: number,
    elapsedMs: number, error: unknown, httpStatus?: number | null,
  ): void => {
    const classification = error ? classifyProviderError(error) : "ok";
    const entry: import("./types").StageTiming = {
      stage: stageName, provider, model, timeoutMs,
      elapsedMs: Math.max(0, Math.round(elapsedMs)),
      httpStatus: httpStatus ?? httpStatusOf(error),
      outcome: error ? "error" : "ok",
      classification,
    };
    if (error) {
      entry.detail = (error instanceof Error ? error.message : String(error ?? "failed")).slice(0, 200);
    }
    stageTimings.push(entry);
  };

  // Slice 4: single conversation manager. Business scope always comes from
  // the verified server context (input.businessId) — never from the model.
  const conv = getConversation(input.conversationId, input.businessId);

  // Strict pre-model intent routing (§2): image intent is detected with a
  // lightweight deterministic check BEFORE any LLM/provider call. Image
  // requests route DIRECTLY to muse-image (image branch below skips the
  // resolver LLM + Standard + Baseten + Fireworks) — zero Spark calls.
  // Greetings/casual also skip the resolver LLM (deterministic pre-route).
  // Live RCA fix: explicit standalone RCA ("give me rca", "rca", "root cause
  // analysis") also skips the resolver LLM — the request carries no metric
  // or entity context for the model to resolve, and the 8s round-trip was
  // burning ~15% of the 55s request deadline before any analysis began.
  const wantsImage = isExplicitImageRequest(question);
  const preFast = preRouteIntent(question);
  const wantsRcaFast = !wantsImage && isExplicitRcaRequest(question);
  const skipResolverLlm = wantsImage || (preFast !== null && !preFast.needsTools) || wantsRcaFast;

  // Follow-up resolution: SKIPPED for image requests (direct image route
  // needs no resolution) and greeting/casual pre-routes (deterministic).
  // NOTE: this fallback object is deterministic-only — it MUST NOT call any
  // LLM, so image requests stay at zero Spark calls.
  const tResolve0 = Date.now();
  const resolution: FollowupResolution = skipResolverLlm
    ? {
      resolvedIntent: wantsImage ? ("image" as FollowupResolution["resolvedIntent"]) : wantsRcaFast ? ("rca" as FollowupResolution["resolvedIntent"]) : preFast!.intent,
      metric: conv.activeMetric, entityType: conv.entityType, entity: conv.activeEntity,
      timeframePreset: null, comparisonRequested: false, comparisonType: null,
      analysisType: wantsRcaFast ? "diagnosis" : null, requiresClarification: false, clarificationQuestion: null,
      contextUpdates: wantsRcaFast ? { analysisType: "diagnosis" } : {}, method: "fallback" as const,
    }
    : await resolveFollowup({
      message: question, state: conv,
      businessName: input.businessName, timezone: input.timezone,
    });
  stage(
    "intent_routing", resolution.method === "fallback" ? "deterministic" : "meta",
    resolution.method === "fallback" ? "mergeFallback" : cfg.metaModelId,
    resolution.method === "fallback" ? 0 : 8000,
    Date.now() - tResolve0, null,
  );
  const intent = resolution.resolvedIntent;
  // FINAL FIX (Failure 1): freeze the intent right after resolution. No later
  // stage may re-derive, narrow, or otherwise mutate it: a resolved "rca"
  // stays "rca" through evidence slicing, specialist gating, composition, and
  // validation. This closes the bypass where a bare "give me rca" was
  // re-classified downstream into a Spark-only answer.
  const frozenIntent: typeof intent = intent;

  // Route C — Muse Image DIRECT branch: no resolver LLM (skipped above),
  // no Muse Spark call, no tool loop, no Baseten, no Fireworks. Only the
  // existing deterministic image path (lib/ai/image.ts) runs.
  if (wantsImage || (intent as string) === "image") {
    const t0 = Date.now();
    const { recordImageAsset } = await import("./image-assets");
    const { generateCopilotImage, validateImageRequest } = await import("./image");
    const hist0 = relevantHistory(conv);
    void hist0;
    appendTurn(conv, "user", question);
    const vv = validateImageRequest({ prompt: question, businessId: input.businessId });
    if (!vv.ok) {
      const answer = `I can generate that creative — ${vv.error} Please describe the poster/ad (e.g. "Design a promotional poster for my Diwali sale").`;
      appendTurn(conv, "assistant", answer);
      const latencyMs = Date.now() - started;
      recordTrace({
        traceId, businessId: input.businessId, userId: input.userId, question: question.slice(0, 500),
        intent: "image", provider: "meta-image", model: cfg.metaImageModelId, promptVersion: PROMPT_VERSION,
        toolCalls: [], evidenceIds: [], latencyMs, status: "ok",
        providerAttempts: [], createdAt: new Date().toISOString(),
      });
      return {
        answer, intent: "image", evidence: [], provider: "meta-image", model: cfg.metaImageModelId,
        traceId, latencyMs, warnings: [], followUp: null,
        specialist: { used: false, status: "not_required", reason: "Direct image request." },
      };
    }
    try {
      const r = await generateCopilotImage({ prompt: vv.prompt || question, businessId: input.businessId, size: vv.size });
      const latencyMs = Date.now() - started;
      if (!r.ok) {
        const answer = `Sorry — I couldn't create that image: ${r.error} Please describe the creative again to retry.`;
        appendTurn(conv, "assistant", answer);
        updateState(conv, { intent: "image" });
        recordTrace({
          traceId, businessId: input.businessId, userId: input.userId, question: question.slice(0, 500),
          intent: "image", provider: "meta-image", model: cfg.metaImageModelId, promptVersion: PROMPT_VERSION,
          toolCalls: [], evidenceIds: [], latencyMs, status: "degraded",
          providerAttempts: [buildErrorAttempt({ attempt: "meta-image", provider: "meta-image", model: cfg.metaImageModelId, baseUrl: cfg.metaBaseUrl, maxTokens: 0, latencyMs: Date.now() - t0, error: new Error(r.error || "Image failed.") })],
          createdAt: new Date().toISOString(),
        });
        return {
          answer, intent: "image", evidence: [], provider: "meta-image", model: cfg.metaImageModelId,
          traceId, latencyMs, warnings: ["Image provider unavailable — no Muse Spark call was made."],
          followUp: null,
          specialist: { used: false, status: "not_required", reason: "Direct image request." },
        };
      }
      const asset = recordImageAsset({
        userId: input.userId, businessId: input.businessId, conversationId: input.conversationId,
        prompt: vv.prompt || question, revisedPrompt: r.revisedPrompt,
        provider: r.provider || "meta-image", size: vv.size || "1024x1024",
        imageUrl: r.imageUrl, hasB64: Boolean(r.b64),
      });
      const src = r.imageUrl || (r.b64 ? `data:image/png;base64,${r.b64}` : "");
      const answer = src ? `![generated creative](${src})` : "Image generated but no displayable payload was returned — please retry.";
      appendTurn(conv, "assistant", src ? `Generated creative for: ${(vv.prompt || question).slice(0, 200)} (asset ${asset.id})` : answer);
      updateState(conv, { intent: "image" });
      const latencyMs2 = Date.now() - started;
      recordTrace({
        traceId, businessId: input.businessId, userId: input.userId, question: question.slice(0, 500),
        intent: "image", provider: "meta-image", model: cfg.metaImageModelId, promptVersion: PROMPT_VERSION,
        toolCalls: [], evidenceIds: [],
        latencyMs: latencyMs2, status: "ok",
        providerAttempts: [buildOkAttempt({ attempt: "meta-image", provider: "meta-image", model: cfg.metaImageModelId, baseUrl: cfg.metaBaseUrl, maxTokens: 0, latencyMs: Date.now() - t0 })],
        createdAt: new Date().toISOString(),
      });
      return {
        answer, intent: "image", evidence: [],
        provider: "meta-image", model: cfg.metaImageModelId,
        traceId, latencyMs: latencyMs2, warnings: [], followUp: null,
        specialist: { used: false, status: "not_required", reason: "Direct image request — zero Muse Spark calls." },
      };
    } catch (e) {
      const latencyMs = Date.now() - started;
      const msg = e instanceof Error ? e.message.slice(0, 300) : "Image generation failed.";
      recordTrace({
        traceId, businessId: input.businessId, userId: input.userId, question: question.slice(0, 500),
        intent: "image", provider: "meta-image", model: cfg.metaImageModelId, promptVersion: PROMPT_VERSION,
        toolCalls: [], evidenceIds: [], latencyMs, status: "degraded",
        providerAttempts: [buildErrorAttempt({ attempt: "meta-image", provider: "meta-image", model: cfg.metaImageModelId, baseUrl: cfg.metaBaseUrl, maxTokens: 0, latencyMs: Date.now() - t0, error: e })],
        createdAt: new Date().toISOString(),
      });
      return {
        answer: `Image generation failed honestly: ${msg} (no Muse Spark call was made).`,
        intent: "image", evidence: [], provider: "meta-image", model: cfg.metaImageModelId,
        traceId, latencyMs, warnings: ["Image provider error — no Muse Spark call was made."], followUp: null,
        specialist: { used: false, status: "not_required", reason: "Direct image request." },
      };
    }
  }

  // Timeframe: the LATEST question wins. Explicit rolling window ("last 30
  // days") resolves to an exact Custom range on business-local today — never
  // substituted with This Month, never overridden by conversation state.
  // Then an explicit fresh preset from the resolver, then a message hint,
  // then inherited state, then default. A previous turn's timeframe can
  // never silently override the latest question's requested slice.
  const hint = timeframeHint(question);
  const rolling = rollingWindowHint(question);
  const hintPreset = !rolling && hint
    ? (hint === "today" ? "Today" : hint === "yesterday" ? "Yesterday"
      : hint === "this_week" ? "This Week" : hint === "this_month" ? "This Month"
      : hint === "last_month" ? "Last Month" : null)
    : null;
  const presetName = rolling
    ? null
    : (resolution.timeframePreset
      || resolution.contextUpdates.timeframePreset
      || hintPreset
      || conv.timeframe?.preset || null);
  // Latest-question-wins guard: when the resolver returned no FRESH preset
  // (it echoed stored state) but the message carries its own explicit window
  // (rolling N-days or a preset hint), the message wins — stored state must
  // never silently override the latest question's requested slice.
  // Rolling "last N days/weeks" → exact Custom range on business-local today.
  // Never substituted with This Month. resolveRange(hint) default preserved
  // for the non-rolling path.
  const rolled = rolling
    ? (() => {
      const anchor = todayInTimezone(input.timezone);
      return { start: addDaysIso(anchor, -(rolling.days - 1)), end: anchor };
    })()
    : null;
  const resolved = presetName
    ? resolvePreset(presetName, input.timezone)
    : resolveRange(hint, input.timezone);
  const range = rolled ?? resolved.range;
  const preset = rolled ? rolling!.label : resolved.preset;

  // Evidence-period honesty: measure actual data coverage inside the
  // resolved range. Partial coverage (e.g. a 30-day window with only 2
  // days of data) must be disclosed — never presented as a complete
  // 30-day result. The coverage note is appended to evidence warnings so
  // models and deterministic fallbacks both surface it.
  const coverageNote = (() => {
    try {
      const inRange = input.transactions.filter((t) => {
        const d = (t.date || "").slice(0, 10);
        return d >= range.start && d <= range.end;
      });
      if (inRange.length === 0) return `No recorded transactions between ${range.start} and ${range.end} (${preset}).`;
      const days = new Set(inRange.map((t) => (t.date || "").slice(0, 10))).size;
      const spanDays =
        Math.max(
          1,
          Math.round(
            (new Date(range.end + "T00:00:00Z").getTime() - new Date(range.start + "T00:00:00Z").getTime()) / 86400000,
          ) + 1,
        );
      if (days < spanDays && spanDays >= 7) {
        return `Partial coverage: ${days} of ${spanDays} days in ${range.start}..${range.end} (${preset}) have recorded transactions — figures below reflect actual coverage only, not a complete ${preset.toLowerCase()} result.`;
      }
      return null;
    } catch {
      return null;
    }
  })();

  const comparisonRequested = Boolean(resolution.comparisonRequested || resolution.contextUpdates.comparisonRequested);
  const comparisonType = resolution.comparisonType || resolution.contextUpdates.comparisonType || null;
  const compareMode = comparisonLabelFor(comparisonType);
  const analysisType = analysisFor(resolution);

  // Part 2C (mixed requests): "Analyze my sales and create a poster ..." —
  // split deliberately: business evidence retrieval continues for the analysis
  // half; the creative half is handled by Muse Image AFTER evidence is
  // prepared, never inside the business tool loop.
  const wantsImageToo = intent !== "image" && !resolution.requiresClarification
    && /\b(generate|create|make|design)\b[^.]{0,120}\b(image|poster|advertisement|creative|banner|promo|promotional|launch)\b/i.test(question.slice(0, 1000));

  const needsTools = intent !== "greeting" && intent !== "casual" && intent !== "unclear" && intent !== "image" && !resolution.requiresClarification;

  let evidence: EvidencePackage | null = null;
  const toolCtx: ToolContext = {
    transactions: input.transactions,
    scope: { businessId: input.businessId, businessName: input.businessName, currency: input.currency, timezone: input.timezone },
    range, preset, nowIso: new Date().toISOString(),
  };
  // Slice 6: genuine priority questions use the broad merged package so the
  // deterministic engine sees real signals (fallback keeps prior behavior).
  const isPriorityAsk = intent === "recommendation" && (isPriorityQuestion(question) || isPriorityFollowup(question));
  if (needsTools) {
    const t0 = Date.now();
    try {
      // Slice 4: resolution-aware selection; FRESH retrieval every turn
      // (never reuse prior evidence IDs as current evidence).
      // Timed as its own stage for live RCA diagnostics.
      evidence = selectEvidenceForResolution(resolution, question.toLowerCase(), toolCtx, compareMode)
        ?? selectEvidence(intent, question.toLowerCase(), toolCtx);
      if (isPriorityAsk && evidence) {
        const broad = selectPriorityEvidence(toolCtx, compareMode);
        if (broad && broad.items.length >= evidence.items.length) evidence = broad;
      }
      if (evidence) {
        evidence.question = question; evidence.intent = intent;
        if (coverageNote && !evidence.warnings.includes(coverageNote)) {
          evidence.warnings = [...evidence.warnings, coverageNote].slice(0, 8);
        }
      }
      recordToolCall(toolCalls, "deterministic.evidence", true, Date.now() - t0);
      stage("evidence_collection", "deterministic", "local", 0, Date.now() - t0, null, 200);
    } catch (e) {
      recordToolCall(toolCalls, "deterministic.evidence", false, Date.now() - t0, e instanceof Error ? e.message : "tool failed");
      stage("evidence_collection", "deterministic", "local", 0, Date.now() - t0, e);
    }
  }

  // Slice 6: deterministic priority engine runs on verified evidence BEFORE
  // any model call. Candidates -> transparent rank -> output contract.
  // Baseten later INTERPRETS these; Standard composes the final answer.
  let rankedRecs: PriorityRecommendation[] = [];
  let priorityValidation: string[] = [];
  let priorityCandidateCount = 0;
  if (isPriorityAsk && evidence && evidence.items.length > 0 && !resolution.requiresClarification) {
    try {
      const cands = identifyCandidates(evidence);
      priorityCandidateCount = cands.length;
      const ranked = rankCandidates(cands);
      rankedRecs = toRecommendations(ranked);
      priorityValidation = validateRecommendations(rankedRecs, evidence);
    } catch {
      rankedRecs = [];
      priorityValidation = ["Priority ranking unavailable — answering from verified evidence only."];
    }
  }
  // Slice 6: ordinal follow-ups ("most urgent", "second") resolve against the
  // stored active list. Fresh evidence above still governs the numbers;
  // the stored list only disambiguates WHICH priority the owner means.
  let priorityFocus: PriorityRecommendation | null = null;
  let priorityClarification: string | null = null;
  if (isPriorityAsk && !resolution.requiresClarification) {
    const stored = (conv.activePriorities ?? []).map((p) => ({ id: p.id, title: p.title, priority: p.priority }));
    const pool = rankedRecs.length > 0
      ? rankedRecs
      : stored;
    if (pool.length > 0 && isPriorityFollowup(question) && !isPriorityQuestion(question)) {
      const ref = resolvePriorityReference(question, pool);
      if (ref.kind === "ambiguous" && ref.clarification) {
        priorityClarification = ref.clarification;
      } else if (ref.kind === "specific" && ref.index != null && pool[ref.index]) {
        const hit = pool[ref.index];
        const full = rankedRecs.find((r) => r.id === hit.id) ?? null;
        priorityFocus = full ?? {
          id: hit.id, title: hit.title, priority: hit.priority, type: "problem",
          severity: "high-priority-issue", action: "", whyItMatters: "",
          supportingEvidence: [], expectedImpact: { kind: "qualitative", text: "See ranked list." },
          urgency: "medium", confidence: "low", constraints: "", risks: "",
          nextStep: "", timeHorizon: "", evidenceRefs: [],
        };
      }
    } else if (rankedRecs.length > 0 && !isPriorityFollowup(question)) {
      priorityFocus = null;
    }
  }

  const histFull = relevantHistory(conv);
  // §4C conversation context: include relevant history only. Greetings send
  // NO history lines (no context needed, no evidence context). Simple metric
  // questions send a small slice; deeper analysis keeps the normal window.
  const greetingIntent = intent === "greeting" || intent === "casual";
  const compactIntent = intent === "metric" || intent === "summary";
  const histLimit = greetingIntent ? 0 : compactIntent ? 2 : 6;
  const hist = greetingIntent
    ? { lines: [] as string[], summary: null as string | null }
    : { lines: histFull.lines.slice(-histLimit), summary: histFull.summary };
  const metricKey = stateMetricFor(resolution, intent, question.toLowerCase());
  const resolvedEntity = resolution.entity || resolution.contextUpdates.entity || conv.activeEntity;
  const resolvedEntityType = resolution.entityType || resolution.contextUpdates.entityType || conv.entityType;
  const resolvedLines: string[] = [];
  if (metricKey) resolvedLines.push(`Metric: ${metricKey}`);
  if (resolvedEntity) resolvedLines.push(`Entity: ${resolvedEntityType || "entity"} = ${resolvedEntity}`);
  resolvedLines.push(`Period: ${range.start} to ${range.end} (${preset})`);
  if (comparisonRequested) resolvedLines.push(`Comparison: ${compareMode} (fresh deterministic comparison evidence)`);
  if (analysisType && analysisType !== "summary") resolvedLines.push(`Analysis: ${analysisType}`);
  if (resolution.requiresClarification && resolution.clarificationQuestion) {
    resolvedLines.push(`Clarification needed: ${resolution.clarificationQuestion}`);
  }
  // Slice 6: priority context for Standard composition + follow-up grounding.
  if (rankedRecs.length > 0) {
    const list = rankedRecs.map((r) => `${r.priority}. [${r.severity}] ${r.title} (refs: ${r.evidenceRefs.join(", ") || "none"})`).join(" | ");
    resolvedLines.push(`Ranked priorities (${PRIORITY_RANKING_VERSION}): ${list}`);
    resolvedLines.push(`Ranking: severity tier, then monetary impact, then evidence strength. Fewer than 3 when fewer are justified.`);
  }
  if (priorityFocus) {
    resolvedLines.push(`Owner is asking about priority #${priorityFocus.priority}: "${priorityFocus.title}" — focus the answer there.`);
  }
  if (priorityClarification) {
    resolvedLines.push(`Ambiguous priority reference — ask exactly: ${priorityClarification}`);
  }
  resolvedLines.push(`Resolver: ${resolution.method}`);

  const built = buildStandardPrompt({
    question: priorityClarification ? `${question}\n(Ambiguous priority reference — ask this clarification: ${priorityClarification})` : question,
    intent,
    contextLines: [
      `Period: ${range.start} to ${range.end} (${preset})`,
      ...(comparisonRequested ? [`Comparison target: ${compareMode}`] : []),
      ...(analysisType && analysisType !== "summary" ? [`Analysis type: ${analysisType}`] : []),
      ...(rankedRecs.length > 0 ? [priorityCandidatesBlock(rankedRecs.map((r) => ({ id: r.id, title: r.title, severity: r.severity, impactLabel: r.expectedImpact.text, evidenceRefs: r.evidenceRefs, urgency: r.urgency })))] : []),
    ],
    evidence,
    businessLine: `${input.businessName} · ${input.currency} · ${input.timezone}`,
    historyLines: hist.lines,
    historySummary: hist.summary,
    resolvedLines,
  });

  // Diagnostic-only: keep each provider attempt independently visible.
  // Never overwritten — primary, retry, specialist, and fallback errors all survive.
  const providerAttempts: ProviderAttempt[] = [];
  const primaryErrors: string[] = [];
  // §4D task-specific budgets via budgetFor(intent) (tool-defs
  // maxTokensForIntent): greetings 400, metrics 1000, summaries 1200, deep
  // analysis 1500. The old flat 900/1200 constants are removed — every
  // primary/fallback/tool-loop call below uses budgetFor(intent).

  // Slice 5: Standard decides whether specialist analysis is needed — AFTER
  // deterministic evidence is verified, exactly once per request. Greetings,
  // casual, simple lookups, clarification-needed, and missing/insufficient
  // evidence never invoke Baseten.
  // FINAL FIX (Failure 1): the gate runs on FROZEN intent. `isRcaRequest`
  // below is frozenIntent==="rca" — it cannot be narrowed by evidence shape,
  // message length, or downstream re-derivation. Genuine RCA always escalates.
  const specialistNeed = decideSpecialistNeed(frozenIntent, question, evidence, {
    requiresClarification: resolution.requiresClarification,
  });
  // Mandatory RCA escalation: a genuine RCA question MUST reach Baseten
  // whenever deterministic evidence exists. If the deep-diagnosis gate said
  // "not required" for an rca intent (misclassification/bypass), escalate
  // here with the RCA kind so the specialist path is never skipped.
  // FINAL FIX (Failure 1): when Baseten is unconfigured OR its call fails,
  // RCA follows the agreed fallback chain Baseten → Fireworks (with prepared
  // specialist evidence) → deterministic evidence-only — Spark composition is
  // NEVER presented as a successful Baseten RCA (see compose path below).
  if (
    frozenIntent === "rca" &&
    !specialistNeed.needed &&
    evidence &&
    evidence.items.length > 0 &&
    !resolution.requiresClarification
  ) {
    specialistNeed.needed = true;
    specialistNeed.kind = "rca";
    specialistNeed.reason = "rca intent with verified evidence — escalated to Baseten specialist (routing bypass guard).";
  }
  let specialistMemo: string | null = null;
  const specialistToolsForKind = (kind: string): string[] => {
    if (kind === "rca") return ["inspect_evidence", "compare_metrics", "analyze_trend", "evaluate_variance"];
    if (kind === "recommendation") return ["rank_business_priorities", "inspect_evidence", "compare_metrics"];
    if (kind === "peak_hours") return ["analyze_peak_hours", "inspect_evidence"];
    if (kind === "scenario") return ["evaluate_scenario", "inspect_evidence", "compare_metrics"];
    return ["inspect_evidence", "compare_metrics", "analyze_trend"];
  };
  let specialistValidation: string[] = [];
  let specialistStatus: "ok" | "skipped" | "unconfigured" | "error" | "invalid" = "skipped";
  let specialistLatencyMs = 0;
  let specialistRetries = 0;
  let specialistModel: string | null = null;
  let specialistToolCalls: { name: string; ok: boolean; latencyMs: number; error?: string }[] = [];
  if (specialistNeed.needed && specialistNeed.kind && evidence) {
    const gate = basetenConfigured();
    specialistModel = gate.model || cfg.basetenModelId || null;
    if (!gate.configured) {
      specialistStatus = "unconfigured";
      stage("baseten_specialist", "baseten-specialist", specialistModel || "Muse Spark Open 1026", 0, 0, new Error(gate.reason));
    } else {
      const specTools = specialistToolsForKind(specialistNeed.kind || "report");
      const specBuilt = buildSpecialistPrompt({
        kind: specialistNeed.kind,
        question,
        businessLine: `${input.businessName} · ${input.currency} · ${input.timezone}`,
        contextLines: [
          `Period: ${range.start} to ${range.end} (${preset})`,
          ...(comparisonRequested ? [`Comparison target: ${compareMode}`] : []),
          ...(analysisType ? [`Analysis type: ${analysisType}`] : []),
          // Slice 6: Baseten interprets the deterministic ranking — compact
          // candidate block only (full evidence payload stays bounded).
          ...(specialistNeed.kind === "recommendation" && rankedRecs.length > 0
            ? [priorityCandidatesBlock(rankedRecs.map((r) => ({ id: r.id, title: r.title, severity: r.severity, impactLabel: r.expectedImpact.text, evidenceRefs: r.evidenceRefs, urgency: r.urgency })))]
            : []),
        ],
        evidence,
        historyLines: hist.lines,
        toolNames: specTools,
      });
      // Live RCA fix: single Baseten attempt with a deadline-budgeted 20s cap
      // (no blind retry — the old retry doubled a slow specialist to 24s and
      // stacked with resolver + tool-loop + compose timeouts past the 55s
      // client deadline). Non-RCA specialist calls keep the controlled retry.
      // Part 4: the specialist runs its native tool-calling lifecycle —
      // relevant specialist ops are offered (tool_choice auto), validated
      // against SPECIALIST_TOOL_ALLOWLIST, executed application-side over
      // verified evidence, and returned as role tool messages. When the model
      // returns content only, the same single-shot behavior is preserved.
      const isRca = frozenIntent === "rca";
      const specialistTimeout = isRca ? RCA_SPECIALIST_TIMEOUT_MS : BASETEN_TOTAL_BUDGET_MS;
      const t0 = Date.now();
      const specialistScope = { businessId: input.businessId, rangeStart: range.start, rangeEnd: range.end };
      const specialistExec = async (c: { id: string; name: string; args: Record<string, unknown> }) => {
        const r = execSpecialistTool(
          { tool: c.name, input: c.args, businessId: input.businessId, rangeStart: range.start, rangeEnd: range.end },
          evidence,
          specialistScope,
        );
        const payload = r.ok
          ? JSON.stringify({ ok: true, tool: r.tool, summary: r.summary || "", rows: (r.evidence ?? []).slice(0, 8).map((i) => ({ id: i.id, label: i.label, display: i.display })) })
          : JSON.stringify({ ok: false, tool: r.tool, error: r.error || "Specialist tool failed." });
        return { ok: r.ok, payload: payload.slice(0, 4000), name: c.name };
      };
      try {
        const spec = await callBasetenSpecialistWithTools({
          system: specBuilt.system,
          user: specBuilt.user,
          tools: basetenToolDefinitions(specTools),
          exec: specialistExec,
          maxTokens: BASETEN_TOOL_ROUND_MAX_TOKENS,
          timeoutMs: specialistTimeout,
          maxRounds: 3,
        });
        specialistLatencyMs = spec.latencyMs;
        specialistRetries = spec.retries;
        specialistModel = spec.model;
        // Part 4: record native tool-call rounds for traces + diagnostics.
        specialistToolCalls = (spec.toolCallsExecuted ?? []).map((t) => ({ name: t.name, ok: t.ok, latencyMs: 0 }));
        stage("baseten_specialist_request", "baseten-specialist", spec.model, specialistTimeout, Date.now() - t0, null, 200);
        const tParse0 = Date.now();
        const v = validateSpecialistOutput(spec.text, evidence);
        stage("baseten_response_parse", "baseten-specialist", spec.model, 0, Date.now() - tParse0, null, 200);

        // If Baseten response has finish_reason "length" OR empty content (even after retry),
        // mark the memo as unusable. Never pass a truncated memo to Spark as if it were complete
        // (and never claim "specialist agrees" in that case).
        if (spec.truncated || !spec.text.trim()) {
          specialistStatus = "invalid";
          specialistMemo = null;
          specialistValidation = [
            "Specialist memo unusable (finish_reason length / truncated at token limit) — analysis discarded."
          ];
        } else {
          specialistStatus = "ok";
          specialistMemo = spec.text;
          specialistValidation = [...v.warnings];
        }
        stage("specialist_validation", "deterministic", "local", 0, Date.now() - tParse0, null, 200);
        providerAttempts.push(
          specialistStatus === "ok"
            ? buildOkAttempt({
                attempt: "baseten-specialist", provider: "baseten-specialist", model: spec.model,
                baseUrl: cfg.basetenBaseUrl, maxTokens: BASETEN_MEMO_MAX_TOKENS, latencyMs: Date.now() - t0,
              })
            : buildErrorAttempt({
                attempt: "baseten-specialist", provider: "baseten-specialist", model: spec.model,
                baseUrl: cfg.basetenBaseUrl, maxTokens: BASETEN_MEMO_MAX_TOKENS, latencyMs: Date.now() - t0,
                error: new Error(`Specialist output validation: ${specialistValidation.join(" | ").slice(0, 300)}`),
              }),
        );
      } catch (e) {
        specialistLatencyMs = Date.now() - t0;
        specialistStatus = "error";
        specialistValidation = [sanitizeErrorSnippet(e)];
        stage("baseten_specialist_request", "baseten-specialist", specialistModel || cfg.basetenModelId || "Muse Spark Open 1026", specialistTimeout, Date.now() - t0, e);
        providerAttempts.push(
          buildErrorAttempt({
            attempt: "baseten-specialist", provider: "baseten-specialist",
            model: specialistModel || cfg.basetenModelId || "Muse Spark Open 1026",
            baseUrl: cfg.basetenBaseUrl, maxTokens: BASETEN_MEMO_MAX_TOKENS,
            latencyMs: Date.now() - t0, error: e,
          }),
        );
      }
    }
  }

  // Live RCA fix: strip the reasoning-trace planning preamble from a
  // truncated memo before feeding Standard. Baseten streams its deliberation
  // ("We need to produce...", "We must...", "Let's craft...") ahead of the
  // finished memo when cut by finish_reason "length" — that preamble wastes
  // compose tokens and its planning figures trip numeric validation. The
  // finished memo (verified-facts sections) is what Standard needs.
  const memoForCompose = (() => {
    if (!specialistMemo) return "";
    const m = specialistMemo;
    const cut = m.search(/\n##?\s+(verified facts|observed problem|most important|key findings|findings|analysis|memo\b)/i);
    if (cut > 200) {
      const tail = m.slice(cut).trim();
      if (tail.length > 400) return tail;
    }
    return m;
  })();
  const memoSuffixFor = (forFallback: boolean) => memoForCompose
    ? `\n\nInternal specialist memo (Baseten Data Analyst — interpret against verified evidence; never repeat an unsupported specialist number as fact):\n${memoForCompose.slice(0, forFallback ? 1200 : 2000)}`
    : specialistNeed.needed && specialistStatus !== "ok"
      ? `\n\nSpecialist note: Baseten specialist analysis was ${specialistStatus} (${specialistNeed.reason}). Base the answer on available verified evidence only — never claim specialist analysis happened.`
      : forFallback ? "" : "";
  // FINAL FIX (Failure 1): RCA compose path by specialist outcome.
  // - memo present → Standard composes WITH the Baseten memo (provider meta,
  //   specialist.used). If Spark compose fails entirely → Fireworks fallback
  //   WITH the memo → deterministic evidence-only if Fireworks also fails.
  // - memo absent (Baseten error/invalid/unconfigured) → Spark compose is
  //   SKIPPED: a Spark-only composition is never labeled a successful RCA.
  //   The request goes Fireworks-with-evidence → deterministic evidence-only
  //   degraded (exact failing stage named). This is the agreed fallback
  //   behavior; only the "silently succeed as Muse Spark 1.3" hole is closed.
  //   (rcaNeedsSpecialistCompose is computed just before the Spark compose
  //   call, after specialistNeed/specialistMemo are known.)
  // Slice 7 Stage 1 — complete tool-call lifecycle (Meta primary, then
  // Fireworks fallback through the SAME loop driver; Baseten untouched).
  // Greetings/casual/unclear/clarification-need skip tools (unchanged).
  // Live RCA fix: RCA skips the agentic tool loop entirely — deterministic
  // evidence above already covers diagnosis (comparison + dimension splits),
  // and the loop's serialized 8s/15s rounds were the dominant term pushing
  // live RCA past the 55s client deadline. Specialist + direct Standard
  // compose still run below.
  // Recommendation fix: if a specialist memo exists (Baseten), skip the tool loop
  // and compose directly with the 20s compose timeout (prompt already has evidence + ranked candidates + memo).
  const useToolLoop = needsTools && evidence !== null && frozenIntent !== "rca" && !specialistMemo;
  const toolScope = { businessId: input.businessId, rangeStart: range.start, rangeEnd: range.end };
  const execBase = { transactions: input.transactions, scope: toolCtx.scope, range, preset, nowIso: toolCtx.nowIso };
  // FINAL FIX (Failure 2): the tool loop propagates finish_reason. A final
  // content round cut by the token budget (finish_reason "length") is partial
  // output — it must NOT be returned as a complete answer. The caller checks
  // `truncated` and routes to fallback/degraded instead.
  const runLoop = async (
    kind: "meta" | "fireworks",
    system: string, user: string,
  ): Promise<{ text: string; provider: string; model: string; inputTokens?: number; outputTokens?: number; truncated?: boolean; finishReason?: string | null } | null> => {
    const startedLoop = Date.now();
    const messages: ToolMsg[] = [
      { role: "system", content: `${system}\n\nYou can call ONLY the verified business tools offered for this question to fetch figures. Every number in the final answer must come from tool results — cite evidence IDs. Never invent figures, tool names, or arguments.` },
      { role: "user", content: user },
    ];
    let rounds = 0;
    let text = "";
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let provider = kind === "meta" ? "meta" : "fireworks-fallback";
    let model = kind === "meta" ? cfg.metaModelId : cfg.fireworksModelId;
    let lastTruncated = false;
    let lastFinishReason: string | null = null;
    while (rounds < MAX_TOOL_ROUNDS) {
      if (Date.now() - startedLoop > TOOL_LOOP_TIMEOUT_MS) {
        const e = new Error("Tool loop timed out.") as Error & { status?: number | null };
        e.status = null;
        throw e;
      }
      rounds += 1;
      const remainingLoopMs = TOOL_LOOP_TIMEOUT_MS - (Date.now() - startedLoop);
      const roundTimeoutMs = Math.max(1000, Math.min(20000, remainingLoopMs));
      const fwRoundTimeoutMs = Math.max(1000, Math.min(FIREWORKS_TIMEOUT_MS, remainingLoopMs));
      const maxTokens = kind === "meta" ? budgetFor(frozenIntent).meta : budgetFor(frozenIntent).fireworks;
      const r = kind === "meta"
        ? await callMetaStandardWithTools(messages, toolsForIntent(frozenIntent, question), maxTokens, roundTimeoutMs)
        : await callFireworksWithTools(messages, toolsForIntent(frozenIntent, question), maxTokens, fwRoundTimeoutMs);
      provider = r.provider; model = r.model;
      inputTokens = (inputTokens ?? 0) + (r.inputTokens ?? 0);
      outputTokens = (outputTokens ?? 0) + (r.outputTokens ?? 0);
      lastTruncated = r.truncated === true;
      lastFinishReason = r.finishReason ?? null;
      const calls = (r.toolCalls ?? []).slice(0, 4);
      // FINAL FIX (Failure 2): a content round cut by the token budget is
      // partial output. Throw a truncation error so the caller routes to
      // fallback/degraded instead of rendering the fragment as complete.
      if (calls.length === 0) {
        if (lastTruncated && r.text) {
          const e = new Error("Provider response truncated (finish_reason length) — partial content is not a complete answer.");
          (e as unknown as { status?: number }).status = 502;
          throw e;
        }
        text = r.text; break;
      }
      messages.push({ role: "assistant", content: r.text || "", toolCalls: calls });
      for (const c of calls) {
        const t0 = Date.now();
        const tr = execCopilotTool(
          { name: c.name, args: c.args ?? {}, businessId: toolScope.businessId, rangeStart: toolScope.rangeStart, rangeEnd: toolScope.rangeEnd, toolCallId: c.id },
          execBase, toolScope,
        );
        recordToolCall(toolCalls, `tool:${tr.tool}`, tr.ok, Date.now() - t0, tr.ok ? undefined : tr.error);
        messages.push({ role: "tool", content: toolResultPayload(tr), toolCallId: c.id });
      }
    }
    if (!text) {
      const finBudget = budgetFor(frozenIntent);
      const fin = kind === "meta"
        ? await callMetaStandard(`${system}\nAnswer from verified tool results only.`, messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n").slice(-6000) + "\nCompose the final owner-facing answer. Never invent figures.", finBudget.meta)
        : await callFireworksFallback(`${system}\nAnswer from verified tool results only.`, messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n").slice(-6000) + "\nCompose the final owner-facing answer. Never invent figures.", finBudget.fireworks, FIREWORKS_TIMEOUT_MS);
      // FINAL FIX (Failure 2): a truncated final-compose is partial output —
      // never present it as complete. Route to fallback/degraded instead.
      if (fin.truncated === true && fin.text) {
        const e = new Error("Provider response truncated (finish_reason length) — partial content is not a complete answer.");
        (e as unknown as { status?: number }).status = 502;
        throw e;
      }
      text = fin.text; provider = fin.provider; model = fin.model;
      inputTokens = (inputTokens ?? 0) + (fin.inputTokens ?? 0);
      outputTokens = (outputTokens ?? 0) + (fin.outputTokens ?? 0);
      lastTruncated = fin.truncated === true;
      lastFinishReason = fin.finishReason ?? null;
    }
    return { text, provider, model, inputTokens, outputTokens, truncated: lastTruncated, finishReason: lastFinishReason };
  };
  const timedMeta = async (attempt: "meta-primary" | "meta-retry") => {
    const t0 = Date.now();
    // Deadline-budgeted compose caps keep Baseten (20s single attempt) +
    // compose inside the 55s client deadline. A single retry runs on
    // retryable transport faults only (timeout/network/429/5xx) — never a
    // same-budget retry after an empty/truncated response, which routes to
    // the Fireworks fallback with its own full budget instead.
    const isCasualOrGreeting = frozenIntent === "greeting" || frozenIntent === "casual";
    const composeTimeout = attempt === "meta-retry"
      ? (frozenIntent === "rca" ? RCA_COMPOSE_RETRY_TIMEOUT_MS : 8000)
      : (isCasualOrGreeting ? 8000 : RCA_COMPOSE_TIMEOUT_MS);
    // The RCA compose prompt carries the Baseten memo plus evidence, and the
    // reasoning model burns hidden tokens from the same pool — 2500-token
    // budget for RCA compose only; non-RCA budgets are untouched.
    const composeBudget = frozenIntent === "rca" ? RCA_COMPOSE_MAX_TOKENS : budgetFor(frozenIntent).meta;
    try {
      const memoSuffix = memoSuffixFor(false);
      let r: { text: string; provider: string; model: string; inputTokens?: number; outputTokens?: number; truncated?: boolean; finishReason?: string | null };
      if (useToolLoop) {
        const looped = await runLoop("meta", built.system, built.user + memoSuffix);
        if (!looped || !looped.text) throw new Error("Primary model returned an empty response.");
        r = looped;
      } else {
        r = await callMetaStandard(built.system, built.user + memoSuffix, composeBudget, composeTimeout);
      }
      // FINAL FIX (Failure 2): a truncated compose (finish_reason "length")
      // with partial content is NOT a successful answer. Throw so the caller
      // routes to the Fireworks fallback / degraded — never render a dangling
      // fragment like "Your summary for Last" as complete.
      if (r.truncated === true && r.text) {
        const e = new Error("Primary model response truncated (finish_reason length) — partial content is not a complete answer.");
        (e as unknown as { status?: number }).status = 502;
        throw e;
      }
      providerAttempts.push(
        buildOkAttempt({
          attempt,
          provider: "meta",
          model: cfg.metaModelId,
          baseUrl: cfg.metaBaseUrl,
          maxTokens: frozenIntent === "rca" ? RCA_COMPOSE_MAX_TOKENS : budgetFor(frozenIntent).meta,
          latencyMs: Date.now() - t0,
        }),
      );
      stage(
        attempt === "meta-retry" ? "standard_compose_retry" : "standard_composition",
        "meta", cfg.metaModelId, composeTimeout, Date.now() - t0, null, 200,
      );
      return r;
    } catch (e) {
      providerAttempts.push(
        buildErrorAttempt({
          attempt,
          provider: "meta",
          model: cfg.metaModelId,
          baseUrl: cfg.metaBaseUrl,
          maxTokens: frozenIntent === "rca" ? RCA_COMPOSE_MAX_TOKENS : budgetFor(frozenIntent).meta,
          latencyMs: Date.now() - t0,
          error: e,
        }),
      );
      stage(
        attempt === "meta-retry" ? "standard_compose_retry" : "standard_composition",
        "meta", cfg.metaModelId, composeTimeout, Date.now() - t0, e,
      );
      throw e;
    }
  };
  let result: { text: string; provider: string; model: string; inputTokens?: number; outputTokens?: number; truncated?: boolean; finishReason?: string | null } | null = null;
  // FINAL FIX (Failure 1): when the RCA specialist path produced NO memo
  // (Baseten unconfigured/error/invalid), Spark composition is SKIPPED — a
  // Spark-only composition must never be labeled a successful RCA. The
  // request flows to the Fireworks-with-evidence fallback below, then to
  // deterministic degraded if Fireworks also fails.
  const rcaNeedsSpecialistCompose = frozenIntent === "rca" && specialistNeed.needed;
  const skipSparkForFailedRca = rcaNeedsSpecialistCompose && !specialistMemo;
  if (skipSparkForFailedRca) {
    primaryErrors.push("RCA specialist produced no usable memo — Spark composition skipped (never a substitute for Baseten analysis).");
    stage("standard_composition", "meta", cfg.metaModelId, 0, 0, null, 200);
  } else {
    try {
      result = await timedMeta("meta-primary");
    } catch (e) {
      primaryErrors.push(e instanceof Error ? e.message : "primary failed");
      if (isRetryableProviderError(e)) {
        try {
          result = await timedMeta("meta-retry");
        } catch (e2) {
          primaryErrors.push(e2 instanceof Error ? e2.message : "primary retry failed");
        }
      }
    }
  }
  void rcaNeedsSpecialistCompose;
  let fallbackError = "";
  // Fallback reliability: no Fireworks after a successful + valid primary
  // response, and no duplicate retries. Routine Spark failure -> Fireworks
  // with prepared routine evidence -> deterministic-only fallback.
  // FINAL FIX (Failure 1): RCA specialist failure -> Fireworks WITH the
  // prepared specialist evidence (agreed fallback), then deterministic
  // evidence-only if Fireworks also fails. The old "NO Fireworks substitute"
  // rule silently converted a Baseten failure into a Spark answer with a
  // Muse Spark 1.3 success badge; the new chain never labels a Spark
  // composition a successful RCA. On RCA the honest degraded response below
  // carries the exact failing stage + reason instead.
  // FINAL FIX (Failure 2): a truncated Fireworks fallback (finish_reason
  // "length") with partial content is NOT a successful answer — it throws
  // into the degraded path instead of rendering a fragment as complete.
  // RCA rides the specialist path (specialistNeed.needed true via the frozen
  // intent + bypass guard), so Baseten failure reaches Fireworks here WITH
  // the prepared specialist evidence, then deterministic below if Fireworks
  // also fails. Non-specialist RCA (no evidence at all) degrades directly.
  const specialistPathTaken = specialistNeed.needed;
  const useFallback = !result && (frozenIntent !== "rca" || specialistPathTaken);
  if (useFallback) {
    // Genuine primary failure routes ONCE to the Fireworks fallback with
    // the prepared routine evidence + compact history (own full budget —
    // never raw datasets or full conversation dumps). Empty/truncated
    // primary responses are NOT retried on Meta — isRetryable gates that —
    // and Fireworks never runs after a successful + valid primary response
    // (this block only executes when result is still null). A Fireworks
    // failure then falls to the deterministic evidence-only reply below.
    // Slice 4+5: the SAME Standard instructions go to the reasoning fallback,
    // including the specialist memo when present (fallback interprets it the
    // same way; it is NEVER presented as Baseten analysis).
    // Fallback skips the tool loop: prompt already carries verified evidence (and specialist memo when present).
    // A single direct compose call avoids several sequential 25s rounds and stays within the client deadline.
    const fbMemoSuffix = memoSuffixFor(true);
    const t0 = Date.now();
    try {
      result = await callFireworksFallback(
        built.system,
        built.user + fbMemoSuffix,
        budgetFor(frozenIntent).fireworks,
        FIREWORKS_TIMEOUT_MS,
      );
      // FINAL FIX (Failure 2): truncated fallback content is partial — never
      // present it as a complete answer. Throw into the degraded path.
      if (result && result.truncated === true && result.text) {
        const e = new Error("Fallback model response truncated (finish_reason length) — partial content is not a complete answer.");
        (e as unknown as { status?: number }).status = 502;
        throw e;
      }
      providerAttempts.push(
        buildOkAttempt({
          attempt: "fireworks-fallback",
          provider: "fireworks-fallback",
          model: cfg.fireworksModelId,
          baseUrl: cfg.fireworksBaseUrl,
          maxTokens: budgetFor(frozenIntent).fireworks,
          latencyMs: Date.now() - t0,
        }),
      );
      stage("fireworks_fallback", "fireworks", cfg.fireworksModelId, FIREWORKS_TIMEOUT_MS, Date.now() - t0, null, 200);
    } catch (e) {
      fallbackError = e instanceof Error ? e.message : "fallback failed";
      providerAttempts.push(
        buildErrorAttempt({
          attempt: "fireworks-fallback",
          provider: "fireworks-fallback",
          model: cfg.fireworksModelId,
          baseUrl: cfg.fireworksBaseUrl,
          maxTokens: budgetFor(frozenIntent).fireworks,
          latencyMs: Date.now() - t0,
          error: e,
        }),
      );
      stage("fireworks_fallback", "fireworks", cfg.fireworksModelId, FIREWORKS_TIMEOUT_MS, Date.now() - t0, e);
    }
  }

  const latencyMs = Date.now() - started;
  // Slice 5: concise specialist status for traces + Copilot UI.
  // Slice 6: priority diagnostics folded in (requested/candidates/method/rank).
  const specialistTrace: TraceEvent["specialist"] = {
    required: specialistNeed.needed,
    reason: specialistNeed.reason,
    kind: specialistNeed.kind,
    model: specialistModel,
    status: specialistStatus,
    latencyMs: specialistLatencyMs || undefined,
    retries: specialistRetries || undefined,
    evidenceRefs: evidence ? evidence.items.map((i) => i.id) : undefined,
    validation: [...specialistValidation, ...priorityValidation].length > 0
      ? [...specialistValidation, ...priorityValidation]
      : undefined,
  };
  const priorityTrace = isPriorityAsk
    ? {
        requested: true,
        candidateCount: priorityCandidateCount,
        rankingMethod: PRIORITY_RANKING_VERSION,
        finalRanking: rankedRecs.map((r) => r.id),
        recommendationCount: rankedRecs.length,
        focusedPriority: priorityFocus?.id ?? null,
        validation: priorityValidation.length > 0 ? [...priorityValidation] : undefined,
      }
    : { requested: false, candidateCount: 0, rankingMethod: PRIORITY_RANKING_VERSION, finalRanking: [], recommendationCount: 0, focusedPriority: null, validation: undefined };
  (specialistTrace as unknown as Record<string, unknown>).priority = priorityTrace;
  const specialistUi = ((): CopilotResponse["specialist"] => {
    if (!specialistNeed.needed) return { used: false, status: "not_required", reason: specialistNeed.reason };
    if (specialistStatus === "ok") {
      return {
        used: true,
        status: "used",
        reason: specialistValidation.length > 0
          ? `${specialistNeed.reason} (${specialistValidation[0]})`
          : specialistNeed.reason,
      };
    }
    if (specialistStatus === "unconfigured") return { used: false, status: "unconfigured", reason: "Specialist unavailable — analysis based on available evidence only." };
    if (specialistStatus === "invalid" || specialistStatus === "error") {
      return { used: false, status: "failed", reason: "Specialist analysis failed or was truncated — analysis based on available evidence only." };
    }
    return { used: false, status: "skipped", reason: specialistNeed.reason };
  })();
  const finish = (answer: string, provider: string, model: string, warnings: string[], status: "ok" | "degraded") => {
    appendTurn(conv, "user", question);
    appendTurn(conv, "assistant", answer);
    // Slice 6: persist the ranked list + focus so follow-ups ("most urgent",
    // "second", "fix it") resolve without guessing. Cleared only when a new
    // priority analysis replaces it or scope changes force fresh evidence.
    const activePriorities: ActivePriority[] | undefined = rankedRecs.length > 0
      ? rankedRecs.map((r) => ({ id: r.id, title: r.title, priority: r.priority, severity: r.severity, type: r.type }))
      : undefined;
    const focusId = priorityFocus?.id ?? (priorityClarification ? (conv.activePriorityId ?? undefined) : undefined);
    updateState(conv, {
      intent,
      metric: metricKey,
      entityType: resolvedEntityType ?? undefined,
      entity: resolvedEntity ?? undefined,
      timeframe: { start: range.start, end: range.end, preset },
      comparison: comparisonRequested
        ? { type: comparisonType ?? "previous_period", targetLabel: compareMode, prevStart: null, prevEnd: null }
        : undefined,
      analysisType,
      evidenceRefs: evidence ? evidence.items.map((i) => i.id) : undefined,
      activePriorities: activePriorities ?? null,
      activePriorityId: focusId === undefined ? undefined : (focusId ?? null),
      summary: answer.slice(0, 200),
      pendingClarification: priorityClarification ?? (resolution.requiresClarification ? (resolution.clarificationQuestion || "clarify") : undefined),
      dataVersion: evidence ? input.dataVersion : undefined,
    });
    recordTrace({
      traceId, businessId: input.businessId, userId: input.userId, question, intent,
      provider, model, promptVersion: built.version,
      toolCalls, evidenceIds: evidence?.items.map((i) => i.id) ?? [],
      inputTokens: result?.inputTokens, outputTokens: result?.outputTokens,
      latencyMs, status, error: warnings.join(" | ") || undefined,
      providerAttempts: [...providerAttempts],
      specialist: specialistTrace,
      createdAt: new Date().toISOString(),
    });
    // Final response marker makes the end-to-end request duration visible in
    // per-stage live timings. Recorded before the trace snapshot below so
    // traces carry the same stage list as the API response.
    stage("final_response", provider, model, 0, Date.now() - started, null, status === "ok" ? 200 : 206);
    const trace = recentTraces(200).find((t) => t.traceId === traceId);
    if (trace) trace.stageTimings = [...stageTimings];
    return {
      answer, intent, evidence: (evidence?.items ?? []).map((i) => ({ id: i.id, label: i.label, display: i.display })),
      provider, model, traceId, tokens: { input: result?.inputTokens, output: result?.outputTokens },
      latencyMs, warnings,
      followUp: priorityClarification ?? (resolution.requiresClarification ? resolution.clarificationQuestion : null),
      specialist: specialistUi,
      stageTimings: [...stageTimings],
    } as CopilotResponse;
  };

  if (!result) {
    // Slice 6: when providers are down but deterministic priorities exist,
    // compose an evidence-backed degraded answer (honest limitation notice)
    // instead of a bare figures dump. Baseten unavailability stays explicit.
    let answer = degradedReply(intent, evidence, input.businessName);
    if (isPriorityAsk && rankedRecs.length > 0 && evidence) {
      const lines = rankedRecs.map((r) =>
        `${r.priority}. ${r.title} [${r.severity}] — ${r.whyItMatters} Action: ${r.action} (${r.expectedImpact.kind}: ${r.expectedImpact.text} Evidence: ${r.evidenceRefs.join(", ")}) Next: ${r.nextStep}`);
      answer = `Here are your top ${rankedRecs.length} priorit${rankedRecs.length === 1 ? "y" : "ies"} from verified figures for ${input.businessName} (specialist explanation temporarily unavailable):\n${lines.join("\n")}`;
    }
    // Slice 4: honest specialist limitation — deep RCA asks for Baseten; when
    // unconfigured/failing, say so instead of inventing analysis.
    // Live RCA fix: name the exact failing stage so the owner/logs identify
    // whether it was provider processing vs network vs config.
    const parts: string[] = [];
    if (primaryErrors.length > 0) {
      parts.push(`meta: ${sanitizeErrorSnippet(primaryErrors.join(" | retry: "))}`);
    }
    if (fallbackError) {
      parts.push(`fireworks-fallback: ${sanitizeErrorSnippet(fallbackError)}`);
    }
    if (specialistNeed.needed && (specialistStatus === "error" || specialistStatus === "invalid")) {
      const failedStage = [...stageTimings].reverse().find((s) => s.stage.startsWith("baseten_") && s.outcome === "error");
      parts.push(
        failedStage
          ? `baseten-specialist[${failedStage.stage} ${failedStage.elapsedMs}ms/${failedStage.timeoutMs}ms ${failedStage.classification}${failedStage.httpStatus ? ` http=${failedStage.httpStatus}` : ""}]: ${specialistValidation[0] || specialistNeed.reason}`
          : `baseten-specialist: ${specialistValidation[0] || specialistNeed.reason}`,
      );
    }
    const detail = parts.length > 0
      ? parts.join(" | ")
      : sanitizeErrorSnippet("AI providers unavailable");
    const warnings = [`AI providers unavailable: ${detail}. Deterministic evidence shown without AI enhancement.`];
    if (isPriorityAsk && rankedRecs.length > 0) {
      warnings.push("Specialist analysis unavailable (Baseten) — priorities below are deterministically ranked from verified evidence only, not specialist-interpreted.");
    }
    if ((intent === "rca" || intent === "recommendation" || intent === "scenario") && !providerStatus().baseten.configured) {
      warnings.push("Deep specialist analysis (Baseten Data Analyst) is not configured — showing verified figures only.");
    }
    if (specialistNeed.needed && specialistStatus === "error" && specialistValidation.length > 0) {
      warnings.push(`Specialist analysis unavailable (Baseten): ${specialistValidation[0]} — showing verified figures only.`);
    }
    void PROMPT_VERSION;
    return finish(answer, "degraded", cfg.metaModelId, warnings, "degraded");
  }
  // FINAL FIX (Failures 1+3+4+5): ordered 7-stage final pipeline. The order
  // is load-bearing: (1) provider text parsed, (2) truncation checked,
  // (3) numeric/evidence validation, (4) INTENT-SPECIFIC validation only,
  // (5) diagnostics split off user content, (6) markdown cleaned,
  // (7) final render. RCA diagnostics never enter non-RCA warnings; internal
  // IDs / empty [] markers / provider details never enter the answer.
  // Pipeline order: (1) parse is `result.text`; (2) truncation verified via
  // finish_reason BEFORE validation (a truncated partial throws above and
  // never reaches here); (3)+(4).validateAnswer(result.text, evidence,
  // frozenIntent) runs numeric checks for ALL intents + RCA-only checks
  // ONLY for rca; (5) validationWarnings stay in warnings/traces; (6)
  // sanitize below; (7) finish().
  const validationWarnings = validateAnswer(result.text, evidence, frozenIntent);
  // Part 9: strip raw internals from the user-facing answer (tool objects,
  // markdown artifacts) — validation flags above stay in
  // warnings/traces, never in the answer body.
  // FINAL FIX (Failures 4+5): hardened 7-stage sanitizer. Internal evidence
  // linkage stays in traces/validation (evidenceIds) — it never rides in the
  // user-facing answer. This stage: (a) strips bracket citation IDs
  // ([sales.total...], [ev:...], bare [12]) AND empty [] markers; (b) unescapes
  // literal \* artifacts and repairs malformed markdown WITHOUT touching
  // financial values; (c) removes specialist-truncation/internal-diagnostic
  // sentences and provider/model execution details from the ANSWER body (they
  // stay in warnings/traces). Sanitization never changes figures, never drops
  // meaningful qualifications ("likely", "partial", "additional data needed"),
  // and never conceals a genuine limitation.
  let finalText = (result.text || "").trim();
  // Clean-answer formatting + output validation (numbers/dates preserved):
  // strip raw evidence IDs, tool-call JSON, provider errors, model IDs,
  // truncation notes, literal Markdown artifacts — then validate numeric
  // claims against evidence BEFORE returning (never after formatting).
  finalText = finalText
    .replace(/```json[\s\S]*?```/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\{"tool_calls"[\s\S]{0,2000}?\}/g, " ")
    .replace(/\{"function"[\s\S]{0,1200}?\}/g, " ")
    .replace(/\b(sales\.total|sales\.count|sales\.cogs|profit\.gross|expense\.total|expense\.count|purchase\.total|purchase\.count|profit\.net|trend\.revenue|trend\.peak|compare|product\.rank|product\.units|category\.share|channel\.share|peak\.hour|recent\.txn)\.[a-z0-9_]+\.[a-z0-9_]+/gi, "")
    // FINAL FIX (Failure 4): bracket citation forms — [id], (id), "evidence
    // <id>", "per <id>" — plus bare numeric brackets and EMPTY [] markers.
    // Internal IDs remain in evidenceIds/traces for validation; the answer
    // carries human text only. Never invent citations: nothing is added.
    .replace(/\[(?:sales\.total|sales\.count|sales\.cogs|profit\.gross|expense\.total|expense\.count|purchase\.total|purchase\.count|profit\.net|trend\.revenue|trend\.peak|compare|product\.rank|product\.units|category\.share|channel\.share|peak\.hour|recent\.txn|ev|evidence)[^\]]*\]/gi, "")
    .replace(/\((?:sales\.total|sales\.count|sales\.cogs|profit\.gross|expense\.total|expense\.count|purchase\.total|purchase\.count|profit\.net|trend\.revenue|trend\.peak|compare|product\.rank|product\.units|category\.share|channel\.share|peak\.hour|recent\.txn|ev|evidence)[^)]*\)/gi, "")
    .replace(/\bevidence\s+(?:id\s+)?[a-z0-9][a-z0-9_.-]*\.[a-z0-9_.-]+/gi, "verified records")
    .replace(/\[\s*\]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\b(trace_id|traceId|latency|finish_reason)\s*[:=]\s*\S+/gi, "")
    .replace(/\b(muse-spark-1\.3|muse-spark-open-1026|muse-spark-open|muse-image-1\.0)\b/gi, "Muse Spark")
    .replace(/Provider HTTP \d+[^.\n]*/gi, "")
    .replace(/Baseten specialist response truncated[^\n]*/gi, "Specialist analysis was partial")
    // FINAL FIX (Failure 5): internal diagnostic sentences stay in
    // warnings/traces, never in the answer body. Remove (not reword):
    // specialist-truncation notes, RCA-structure/honesty internal notes,
    // and provider/model execution details leaked into prose. The keep-list
    // regex below is identity (diagnostic lines that ARE user-safe stay);
    // the removal regex above handles the internal-only lines.
    .replace(/^\s*(?:RCA\s+(?:structure|honesty)\s+note|Specialist\s+(?:truncation\s+)?note|Specialist\s+memo\s+truncated)[^\n]*$/gim, "")
    .replace(/__+/g, "")
    .replace(/[ \t]*\(?(?:provider|model)\s*[:=]\s*(?:meta|baseten-specialist|fireworks-fallback|muse-spark[^)\s]*)[^)\n]*\)?/gi, "")
    .replace(/(?:served|answered|composed)\s+by\s+(?:baseten|fireworks|meta|muse\s+spark)[^.\n]*/gi, "")
    .replace(/\*\*/g, "")
    // Unescape literal backslash-star artifacts (\* → *) then collapse stray
    // lone backslashes; collapse stray lone * tokens. Financial values (₹,
    // digits, %, commas, decimals) are untouched.
    .replace(/\\\*/g, "*")
    .replace(/(?<!\\)\*(?!\*)/g, "")
    .replace(/\\(?=[^*a-zA-Z0-9₹.,%\-])/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Collapse whitespace left by removed citation markers without joining
  // sentences: "figures [] grew" → "figures grew".
  finalText = finalText.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
  // FINAL FIX (Failure 2, last line of defense): if sanitization leaves a
  // dangling fragment ("Your summary for Last"), it is a truncated partial —
  // route to the honest degraded reply instead of presenting it as complete.
  if (/your summary for last$/i.test(finalText) || /\b(for|of|in|on|at|to|the|a|an|last|this)\s*$/i.test(finalText) && finalText.length < 120) {
    return finish(degradedReply(frozenIntent, evidence, input.businessName), "degraded", cfg.metaModelId, [...validationWarnings, "Summary completeness note: provider returned a truncated fragment — degraded reply used."], "degraded");
  }
  if (!finalText) {
    return finish(degradedReply(frozenIntent, evidence, input.businessName), "degraded", cfg.metaModelId, [...validationWarnings, "Model returned only internal output — sanitized to degraded reply."], "degraded");
  }
  // Slice 5: fold validated specialist caveats into the final warnings so
  // Standard never silently upgrades a flagged memo into verified fact.
  for (const w of specialistValidation) {
    if (specialistStatus === "ok") validationWarnings.push(`Specialist note: ${w}`);
  }
  // Slice 6: deterministic priority validation is always surfaced so the
  // owner sees duplicates / bad refs / unqualified money claims honestly.
  // Duplicate-id findings are hard failures: they indicate a ranking bug.
  for (const w of priorityValidation) {
    validationWarnings.push(/duplicate recommendation id/i.test(w) ? `Priority ranking issue: ${w}` : `Priority note: ${w}`);
  }
  // Slice 6: catch unsupported urgency + guaranteed-money claims in the
  // composed answer (Standard or fallback) before it reaches the owner.
  if (isPriorityAsk && rankedRecs.length > 0) {
    const txt = finalText || "";
    if (/guarantee[sd]? will (increase|save|earn)|assured .*₹|will definitely .*₹/i.test(txt)) {
      validationWarnings.push("Priority note: the answer states a financial outcome as guaranteed — treat it as a possibility, not a verified result.");
    }
  }
  if (specialistNeed.needed && specialistStatus !== "ok") {
    validationWarnings.push(
      specialistStatus === "unconfigured"
        ? "Specialist analysis unavailable (Baseten not configured) — analysis based on available evidence only."
        : "Specialist analysis unavailable — analysis based on available evidence only.",
    );
  }
  // FINAL FIX (Failure 1): provider attribution. A Fireworks composition that
  // interpreted a Baseten memo is NOT Baseten analysis; a Fireworks fallback
  // that ran WITHOUT a memo is evidence-grounded fallback reasoning only.
  // Neither is ever labeled "Muse Spark Open 1026" — that label is reserved
  // for genuine Baseten specialist output (provider "baseten-specialist").
  if ((frozenIntent === "recommendation" || frozenIntent === "scenario" || frozenIntent === "rca") && result.provider === "fireworks-fallback") {
    validationWarnings.push("Evidence note: answered by the reasoning fallback, not Baseten specialist analysis.");
  }
  // Part 2C: mixed analyze + poster requests — business insight composed
  // above; generate the creative via Muse Image and append it to the SAME
  // answer so the owner gets both halves deliberately separated.
  if (wantsImageToo) {
    try {
      const { generateCopilotImage } = await import("./image");
      const img = await generateCopilotImage({ prompt: question.slice(0, 1000), businessId: input.businessId });
      if (img.ok && (img.imageUrl || img.b64)) {
        const src = img.imageUrl || `data:image/png;base64,${img.b64}`;
        finalText = `${finalText}\n\n![generated creative](${src})`;
      } else {
        validationWarnings.push(`Image note: ${img.error || "the poster could not be generated"} — business insight above is unaffected.`);
      }
    } catch (e) {
      validationWarnings.push(`Image note: poster generation failed (${e instanceof Error ? e.message.slice(0, 160) : "error"}) — business insight above is unaffected.`);
    }
  }
  return finish(finalText, result.provider, result.model, validationWarnings, validationWarnings.length > 0 ? "degraded" : "ok");
}
