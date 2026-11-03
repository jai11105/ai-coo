// POST /api/copilot/chat — Slice 1+2: every message via the AI flow.
// Auth → tenant context → deterministic evidence → Standard → validate.

import { NextResponse } from "next/server";
import { DATASET_TRANSACTIONS, DATASET_PROFILES } from "@/lib/datasets";
import type { DemoDatasetKey } from "@/lib/types";
import { orchestrate } from "@/lib/ai/orchestrate";
import { loadBusinessTransactions } from "@/lib/ai/server-data";
import { getAuthorizedBusinessContext, httpStatus } from "@/lib/ai/server-context";
import { checkRateLimit, rateKey, CHAT_LIMIT, CHAT_WINDOW_MS } from "@/lib/ai/rate-limit";
import { persistTrace } from "@/lib/ai/trace-store";
import { PROMPT_VERSION } from "@/lib/ai/config";
import { recordTrace, scrubForLog } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function err(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ error: { code, message, requestId } }, { status });
}

export async function POST(req: Request) {
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const body = (await req.json().catch(() => null)) as {
      message?: unknown; conversationId?: unknown; businessId?: unknown; datasetKey?: unknown;
    } | null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const conversationId = typeof body?.conversationId === "string" && body.conversationId.trim()
      ? body.conversationId.trim().slice(0, 80)
      : `conv_${requestId}`;
    if (!message) return err("VALIDATION_ERROR", "Message is required.", 400, requestId);
    if (message.length > 2000) return err("VALIDATION_ERROR", "Message too long (max 2000 chars).", 400, requestId);

    // Demo mode (no auth header / businessId "demo"): deterministic demo
    // evidence through the SAME orchestrator + prompts — never a separate
    // hardcoded response system. Live mode: verified membership + Supabase.
    const hasAuth = Boolean((req.headers.get("authorization") || "").startsWith("Bearer "));
    const rawBusiness = typeof body?.businessId === "string" ? body.businessId.trim() : "";
    const isDemo = !hasAuth || !rawBusiness || rawBusiness === "demo";

    if (isDemo) {
      const datasetKey: DemoDatasetKey =
        body?.datasetKey === "sample_business_2" ? "sample_business_2" : "meta_demo";
      const profile = DATASET_PROFILES[datasetKey];
      const rl = checkRateLimit(rateKey("chat", null, `demo:${datasetKey}`), CHAT_LIMIT, CHAT_WINDOW_MS);
      if (!rl.ok) return err("RATE_LIMITED", "Too many requests. Please wait.", 429, requestId);
      const result = await orchestrate({
        message,
        businessId: `demo:${datasetKey}`,
        businessName: profile.displayName,
        currency: profile.currencyCode,
        timezone: profile.timezone,
        userId: null,
        conversationId,
        transactions: DATASET_TRANSACTIONS[datasetKey],
        dataVersion: `demo:${datasetKey}:${DATASET_TRANSACTIONS[datasetKey].length}`,
      });
      try {
        recordTrace({
          traceId: result.traceId, businessId: `demo:${datasetKey}`, userId: null,
          question: scrubForLog(message).slice(0, 500), intent: result.intent,
          provider: result.provider, model: result.model, promptVersion: PROMPT_VERSION,
          toolCalls: [], evidenceIds: result.evidence.map((e) => e.id),
          inputTokens: result.tokens?.input, outputTokens: result.tokens?.output,
          latencyMs: result.latencyMs, status: "ok", createdAt: new Date().toISOString(),
        });
      } catch { /* best-effort */ }
      return NextResponse.json({
        data: { ...result, conversationId },
        meta: { requestId, timestamp: new Date().toISOString() },
      });
    }

    const ctx = await getAuthorizedBusinessContext(req);
    const rlLive = checkRateLimit(rateKey("chat", ctx.userId, ctx.businessId), CHAT_LIMIT, CHAT_WINDOW_MS);
    if (!rlLive.ok) return err("RATE_LIMITED", "Too many requests. Please wait.", 429, requestId);
    const { transactions, dataVersion } = await loadBusinessTransactions(ctx.businessId, ctx.currency, ctx.timezone);

    const result = await orchestrate({
      message,
      businessId: ctx.businessId,
      businessName: ctx.businessName,
      currency: ctx.currency,
      timezone: ctx.timezone,
      userId: ctx.userId,
      conversationId,
      transactions,
      dataVersion,
    });

    let sessionId: string | null = null;
    let userMessageId: string | null = null;
    let assistantMessageId: string | null = null;
    let persistNote: string | null = null;
    try {
      const { resolveLiveSession } = await import("@/lib/ai/conversation-store");
      const { persistCopilotTurn } = await import("@/lib/ai/conversation-persist");
      const sess = await resolveLiveSession(
        { userId: ctx.userId, businessId: ctx.businessId }, conversationId, message,
      );
      if (sess.sessionId) {
        sessionId = sess.sessionId;
        const pr = await persistCopilotTurn({
          scope: { userId: ctx.userId, businessId: ctx.businessId },
          sessionId: sess.sessionId, question: message, answer: result.answer,
          provider: result.provider, model: result.model,
        });
        userMessageId = pr.userMessageId;
        assistantMessageId = pr.assistantMessageId;
        if (!pr.persisted && pr.error) persistNote = pr.error;
      } else if (sess.error) persistNote = sess.error;
    } catch (e) {
      persistNote = e instanceof Error ? e.message.slice(0, 200) : "Persistence failed.";
    }
    try {
      await persistTrace({
        trace: {
          traceId: result.traceId, businessId: ctx.businessId, userId: ctx.userId,
          question: scrubForLog(message).slice(0, 500), intent: result.intent,
          provider: result.provider, model: result.model, promptVersion: PROMPT_VERSION,
          toolCalls: [], evidenceIds: result.evidence.map((e) => e.id),
          inputTokens: result.tokens?.input, outputTokens: result.tokens?.output,
          latencyMs: result.latencyMs, status: "ok", createdAt: new Date().toISOString(),
        },
        requestId, conversationId, userId: ctx.userId, businessId: ctx.businessId,
        traceId: result.traceId, provider: result.provider, model: result.model,
      });
    } catch { /* best-effort */ }

    const warnings = persistNote ? [...result.warnings, `History note: ${persistNote}`] : result.warnings;
    return NextResponse.json({
      data: {
        ...result, conversationId, warnings,
        sessionId, userMessageId, assistantMessageId,
        persisted: Boolean(sessionId && userMessageId && assistantMessageId),
      },
      meta: { requestId, timestamp: new Date().toISOString() },
    });
  } catch (e) {
    const status = httpStatus(e, 500);
    const message = e instanceof Error ? e.message : "Copilot request failed.";
    const code = status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : status === 400 ? "VALIDATION_ERROR" : status === 429 ? "RATE_LIMITED" : "COPILOT_FAILED";
    return err(code, message, status, requestId);
  }
}
