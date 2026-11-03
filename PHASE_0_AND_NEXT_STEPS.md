# AI Powered COO — Phase 0 Completion and Development Roadmap

**Status:** Finalized Phase 0 baseline  
**Document version:** 1.1.0  
**Next milestone:** Phase 1 — Application Shell & UI Foundation (Frontend Only)  

---

## 1. Phase 0 deliverables overview

The complete architectural and specification baseline for AI Powered COO is documented across five synchronized Phase 0 files:

1. **`ARCHITECTURE.md`:** Product principles, 6-tier system boundaries, mobile-first navigation, scope-aware dashboard matrix, deterministic calculation engine, and runtime Meta model mapping.
2. **`DATABASE.md`:** Supabase PostgreSQL relational schema, multi-tenant isolation, demo sandboxing, RLS policies, audit logging, soft-deletion, and optimistic concurrency.
3. **`API_CONTRACTS.md`:** Strongly typed REST and SSE endpoint specifications, server-side context resolution, RBAC definitions, compound cursor pagination, timezone boundary math, and AI provider contracts.
4. **`PROVIDER_CONFIG.md`:** Runtime model specifications (100% Meta models), provider credentials, credit allocations, timeout/pre-token failover orchestration, and voice pipeline definitions.
5. **`PHASE_0_AND_NEXT_STEPS.md`:** Phase 0 sign-off, technical dependency chain, and implementation roadmap.

> **Important Boundary Notice:** Phase 0 deliverables represent architectural and contractual design alignment. **Phase 0 completion must not be confused with live provider endpoint connectivity, provisioned infrastructure, or implemented database security.** All backend integrations, security enforcement, and live model calls will be constructed and verified sequentially in Phases 1 through 11.

---

## 2. Finalized runtime model assignments

All runtime models invoked by the application are Meta models. Third-party providers are used strictly as inference infrastructure:

- **COO Copilot Primary LLM:** Meta Muse Spark 1.3 Contributor (Provider: Meta API)
- **COO Copilot Fallback 1:** Muse Spark Open 1026 (Provider: Baseten — $100 credit)
- **COO Copilot Fallback 2:** Muse Glimmer 30B (Provider: Fireworks — $1 credit)
- **Log Entry Speech-to-Text:** Meta Muse Voice Transcribe 1.0 (Provider: Meta API)
- **Log Entry Structured Extraction:** Muse Spark Contributor (Provider: Meta API)
- **Copilot Voice Input (STT):** Meta Muse Voice Transcribe 1.0 (Provider: Meta API)
- **Copilot Voice Output (TTS):** Meta MMS TTS (`facebook/mms-tts-eng`) (Separately provisioned inference endpoint)

*Prohibited runtime models:* OpenAI, Anthropic, Google, DeepSeek, Whisper, and Chatterbox are strictly prohibited.

---

## 3. Technical dependency chain

```text
Phase 1: App Shell & UI Foundation (Frontend Only)
   |
Phase 2: Supabase Schema, Auth, RLS & Negative Tenant Tests
   |
Phase 3: Shared Transaction Engine (COGS vs Purchase Separation & Auditing)
   +------------------------+------------------------+
   |                        |                        |
   v                        v                        v
Phase 4: Ledger / Data   Phase 5: Dashboard       Phase 8: Log Entry Voice
   |                        |                        |
   +------------------------+                        |
   |                                                 |
   v                                                 |
Phase 6: Deterministic Intelligence Engine           |
   |                                                 |
   v                                                 |
Phase 7: Copilot AI & Executive Directives           |
   |                                                 |
   +------------------------+------------------------+
                            |
                            v
Phase 9: Copilot Voice Input & MMS TTS Spoken Answers
                            |
Phase 10: Business Profile, Settings & Regional Tax
                            |
Phase 11: PWA Polish, Full Security Audit & Vercel Deployment
                            |
Phase 12: Verified End-to-End Demo Journey & Submission
```

---

## 4. Detailed 12-phase development roadmap

### Phase 1 — App shell and UI foundation (Immediate next phase)
- Next.js application shell setup with TypeScript and Tailwind CSS.
- Responsive mobile-first layout with persistent bottom navigation bar:
  1. **Dashboard**
  2. **Data / Ledger**
  3. **Log Entry**
  4. **COO Copilot**
- Responsive desktop navigation (sidebar or top rail).
- Authentication UI shell with login and sign-up pages.
- Two isolated demo dataset selection entry points:
  - **Meta demo dataset**
  - **Second separate demo dataset**
- Business Profile and Settings entry point.
- Light, Dark, and System theme toggle.
- Initial interactive UI shells with mock state for Dashboard (cards and slicer preview), Ledger (table preview), Log Entry (manual form toggles for Sale, Purchase, Expense), and COO Copilot (directives and chat preview).

> **Phase 1 Execution Boundary:** Strictly frontend application shell and navigation structure. Do not begin Supabase backend integration, database migrations, voice capture, or live AI model calls during Phase 1.

---

### Phase 2 — Supabase schema, authentication, tenant model, and RLS
- Execute Supabase PostgreSQL migrations for `profiles`, `businesses`, `business_members`, and `business_settings`.
- Implement Supabase Auth integration (email/password and magic link).
- Implement server-side `getAuthorizedBusinessContext(req)`.
- Configure PostgreSQL Row Level Security (RLS) on all tenant tables (`is_business_member(business_id)`).
- Seed and partition the two isolated demo datasets (`meta_demo` and `sample_business_2`).
- **Mandatory Quality Gate:** Automated negative cross-tenant tests verifying that a user in Business A cannot read, insert, update, or delete records belonging to Business B, even if explicitly passing Business B's UUID.

---

### Phase 3 — Shared transaction engine
- Canonical transaction types and Zod schemas for `sale`, `purchase`, and `expense`.
- Shared transaction service handling create, update, and soft-delete mutations.
- Server-side deterministic recalculation of line totals, discounts, taxes, and margins.
- Strict separation of sales COGS (`buying_cost_total_minor`) from standalone stock purchases.
- Optimistic locking via `version` column and immutable change logging via `audit_logs`.
- **Dependency Notice:** Must be fully completed and tested before connecting the Ledger, Dashboard, or Voice Entry flows.

---

### Phase 4 — Data / Ledger tab
- Connected Supabase transaction table with server-side compound cursor pagination `(transaction_date, id)`, search, and multi-field filtering.
- Scope-aware views (All, Sales, Purchase, Expense).
- Transaction detail modal with full line-item inspection.
- Auditable edit and soft-delete/void actions routed through the Phase 3 Shared Transaction Service.
- Loading, error, empty, and optimistic update states.

---

### Phase 5 — Scope-aware Dashboard
- Date preset filters: All, Today, Yesterday, Last 7 Days, Last 30 Days, Month to Date (MTD), and custom range, respecting business timezone boundaries.
- Global Activity Slicer (`All`, `Sales`, `Purchase`, `Expense`) with end-to-end synchronization across all cards, charts, and insights.
- Five scope-aware KPI cards dynamically switching measures based on active slicer.
- Visualizations: Donut chart, bar comparison chart, and time-series trend chart.
- Analytical insight sections: Performance movement, category Pareto, period comparisons, forecasts with confidence ranges, alerts, and business health summary.
- Guardrail enforcement: Peak-hour and festival patterns appear only when historical data sufficiency criteria are met (30–60 days).

---

### Phase 6 — COO deterministic intelligence engine
- Approved deterministic business calculation modules for RCA, Pareto concentration (80/20), period variance analysis, and statistical forecasting.
- Intent parsing, entity extraction, and timeframe/scope resolution.
- Server-side evidence builder constructing grounded, verifiable metrics from Supabase data.
- Automated query scrubbing and diagnostic logging to `copilot_intent_logs`.
- **Dependency Notice:** Deterministic evidence generation must be operational and verified before Copilot AI model integration begins.

---

### Phase 7 — Copilot AI integration & Executive Directives
- Primary streaming chat integration with **Meta Muse Spark 1.3 Contributor** (Meta API).
- Multi-provider fallback orchestration: Meta API (8000ms timeout) → **Baseten (Muse Spark Open 1026)** → **Fireworks (Muse Glimmer 30B)**.
- Pre-token failover logic and interrupted-stream handling (`STREAM_INTERRUPTED`).
- Automated Executive Directives generation with caching and data-invalidation triggers.

---

### Phase 8 — Log Entry voice pipeline
- Web Audio / MediaRecorder microphone capture in the Log Entry view.
- Backend transcription via **Meta Muse Voice Transcribe 1.0** (Meta API).
- Structured extraction via **Muse Spark Contributor** (Meta API).
- Guardrail: Raw audio is never sent to the extractor.
- Interactive draft preview with edit capability.
- Explicit user confirmation before saving through the Phase 3 Shared Transaction Service to Supabase.

---

### Phase 9 — Copilot voice input & spoken answer (TTS)
- Voice question recording and transcription via **Meta Muse Voice Transcribe 1.0** (Meta API).
- Spoken voice answer generation using **Meta MMS TTS** (`facebook/mms-tts-eng`) hosted on a separately provisioned inference endpoint.
- In-browser audio playback controls (play, pause, replay, voice toggle).
- Synchronization between streaming text answer and audio generation.

---

### Phase 10 — Business Profile, regional settings, and tax jurisdiction
- Complete Business Profile management (legal name, industry, operating hours, branches).
- Timezone, currency, and locale formatting controls.
- India GST registration check (`is_gst_registered`) with conditional tax settings.
- Versioned, effective-dated jurisdiction tax modules.
- Protection against retroactive currency conversion.

---

### Phase 11 — PWA, security audit, and Vercel deployment
- PWA web app manifest, icons, and service worker shell.
- Production environment variable configuration.
- Comprehensive security audit including repeat negative RLS tests across all endpoints.
- Production deployment on Vercel with custom domain and HTTPS.

---

### Phase 12 — Demo readiness and presentation
- Rehearsal of the complete, verified retail business journey:
  1. Log in via isolated Meta demo dataset.
  2. Review scope-aware Dashboard with synchronized filters.
  3. Verify transactions in Data / Ledger.
  4. Execute a Voice Log Entry (mic $\rightarrow$ Meta STT $\rightarrow$ Contributor extraction $\rightarrow$ user review $\rightarrow$ Supabase save).
  5. Confirm newly saved transaction immediately updates Ledger and Dashboard.
  6. Ask Copilot a voice question; receive evidence-backed RCA and listen to spoken answer via Meta MMS TTS.
  7. Execute demo data reset and verify instant return to pristine state.
- Performance and latency verification across all Meta inference endpoints.
- Final documentation and hackathon submission.

---

## 5. Definition of done for Phase 0

Phase 0 is complete when:
- [x] All 5 documentation files (`ARCHITECTURE.md`, `DATABASE.md`, `API_CONTRACTS.md`, `PROVIDER_CONFIG.md`, `PHASE_0_AND_NEXT_STEPS.md`) are internally consistent.
- [x] 100% Meta runtime model mapping is locked across all documents.
- [x] Exact fallback chain (Meta API → Baseten → Fireworks) is defined and verified.
- [x] Meta API extraction (Contributor) is accurately documented.
- [x] Unresolved MMS TTS inference endpoint provisioning requirement is clearly flagged as a deployment dependency.
- [x] Scope-aware Dashboard and Global Activity Slicer requirements are clearly specified.
- [x] Shared transaction service and strict COGS vs Purchase separation are defined.
- [x] India GST registration conditional logic is established.
- [x] Clear boundary that Phase 0 documentation is not live security or endpoint testing.
- [x] Technical dependency order (Phase 2 RLS $\rightarrow$ Phase 3 Transaction Engine $\rightarrow$ Phases 4/5/8 $\rightarrow$ Phase 6 Deterministic Engine $\rightarrow$ Phase 7 Copilot) is codified.
- [x] Phase 1 is established as strictly frontend-only.
- [x] No application source code has been modified during Phase 0 documentation update.
