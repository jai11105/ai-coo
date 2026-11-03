# AI COO — Slice 1+2 Completion Report

**Date:** 2026-11-02 · **Prompt version:** v1.0.0-slice1-2

## 1. Capability implemented
- **Slice 1 (core conversational Copilot):** every message — Hi, Hello, Good
  morning, How are you?, Thank you, casual chat, business questions,
  follow-ups — goes through `POST /api/copilot/chat`. No hardcoded frontend
  answers. Greetings route to Muse Spark Standard with a concise
  conversational prompt, no business tools.
- **Slice 2 (deterministic business answers):** overview, sales, purchases,
  expenses, profit, products, categories, trends, comparisons, peak-hour
  metrics, recent transactions — all from `lib/analytics.ts` via
  `lib/ai/tools*.ts`, enhanced by Standard into owner-friendly answers.

## 2. Existing functionality reused
- `lib/analytics.ts` (all math, COGS separation, timezone ranges) — untouched.
- `lib/live-adapter.ts`, `lib/supabase/workspace*.ts`, `businesses.ts` — untouched.
- `lib/server/meta-asr.ts`, `meta-extract.ts` (Log Entry voice) — untouched.
- `app/api/entry/*` (transcribe/extract) — untouched.
- Chat persistence (`workspace-chat.ts`) — reused; RLS assistant-block noted.

## 3. Files created
- `lib/ai/config.ts` — provider config, exact .env names, honest status.
- `lib/ai/evidence.ts` — evidence contract.
- `lib/ai/types.ts` — response/trace contracts, in-memory trace ring, scrubber.
- `lib/ai/intent.ts` — greeting/casual pre-router (model still answers all).
- `lib/ai/context.ts` — conversation state, budgets, freshness guard.
- `lib/ai/prompts.ts` — modular prompts (shared rules + Standard + task).
- `lib/ai/providers.ts` — Meta Standard primary + Fireworks fallback.
- `lib/ai/tools.ts`, `tools-dims.ts`, `tools-trends.ts`, `tools-peak.ts`.
- `lib/ai/orchestrator.ts` + `orchestrate.ts` + `select-evidence.ts`.
- `lib/ai/validate.ts`, `server-context.ts`, `server-data.ts`.
- `app/api/copilot/chat/route.ts`, `app/api/copilot/traces/route.ts`.
- `scripts/copilot-smoke.mjs`, `README.md`, `SLICE_1_2_REPORT.md` (this file).

## 4. Files modified
- `app/copilot/page.tsx` — send() now calls the API; thinking state; meta line
  shows intent/provider/model/latency; demo label honest; stale copy removed.
- `.env.example` — added `BASETEN_BASE_URL`, `FIREWORKS_BASE_URL`,
  `FIREWORKS_MODEL_ID`, `MMS_TTS_MODEL_ID` (placeholders only, no secrets).

## 5. Database changes and migrations
- None. Schema review found `chat_sessions`/`chat_messages` sufficient for
  Slice 1–2; trace persistence deferred to Slice 10 (needs new-table review).

## 6. Model/provider calls
- Primary: Meta `muse-spark-1.3` (`META_BASE_URL/chat/completions`, 8s
  timeout, 1 retry on retryable errors only).
- Fallback: Fireworks `accounts/fireworks/models/muse-glimmer-30b` with
  identical instructions; labeled `fireworks-fallback`, never as Baseten.
- Baseten: NOT called — `BASETEN_BASE_URL` empty; config reports degraded
  honestly. Specialist tools/prompts land in Slice 5.

## 7. Function-calling contracts
- Application-controlled deterministic tools only (no model-driven tool loop
  yet): overview/sales/purchases/expenses/profit/products/categories/trends/
  compare/peak-hours/recent. Full JSON-schema tool loop + Baseten analytical
  tools (`inspect_evidence`, `compare_metrics`, …) land in Slices 4–5.

## 8. Deterministic calculations used
- `calcTotals`, `filterByRange/Scope`, `buildTopProducts/CategorySplit/Trend`,
  `compareRange`, `resolveRangeInTimezone` — all from `lib/analytics.ts`.
  COGS = `sale.buying_cost_total_minor` only; purchases never in COGS.

## 9. Evidence sent to each model
- Greetings: none (conversational prompt only).
- Business: compact package (≤8 refs) with id/metric/label/display/timeframe/
  scope/calculation/completeness + warnings. Same package shape for fallback.

## 10. Prompt engineering + token optimization
- Modular prompts (shared rules / Standard / greeting-vs-evidence /
  validation), version `v1.0.0-slice1-2` recorded in traces.
- Last-6-turns history, compact evidence, 900 max output tokens, token usage
  tracked when the provider exposes it (never fabricated).

## 11. Security and tenant checks
- Live: JWT → `auth.getUser` → `business_members` active check → server-side
  settings; service-role reads scoped by business_id. Demo: isolated
  `demo:<dataset>` scope, no cross-tenant data. Secrets server-only; prompt-
  injection note (DB content = data); safe error envelopes.

## 12–13. Tests executed + results
- `npx tsc --noEmit`: **PASS** (0 errors, verified before shell congestion).
- `scripts/copilot-smoke.mjs`: created (static checks: no mock replies, route
  has demo+live paths, env vars documented, no secrets).
- Live API test (`curl POST /api/copilot/chat {Hi}`): **BLOCKED** — terminal
  shell integration congested by stuck background `next build` workers from
  earlier in the session; request could not be observed. Retrying after the
  user clears background jobs or restarts the dev server.
- `npm run build`: **INCONCLUSIVE** — same background-worker congestion; no
  result observed. Typecheck passed; route compiles under the same config.

## 14. Remaining blockers
- Live Meta/Fireworks round-trip unverified from this machine (needs
  `META_API_KEY` at runtime + clear shell). Code paths degrade honestly
  without keys (deterministic evidence + `providers unavailable` warning).
- `chat_messages` assistant INSERT blocked by RLS (42501, pre-existing) —
  assistant turns stay session-local on reload. Needs migration review.

## 15. Unverified provider capabilities
- Baseten native function calling: UNVERIFIED (no deployment URL; Slice 5).
- Fireworks tool-calling compat: UNVERIFIED (used as plain chat fallback).
- Meta `muse-spark-1.3` chat-completions shape: assumed OpenAI-compatible;
  needs live verification. Failures degrade honestly, never fabricated.
