# AI Powered COO — Phase 0 Completion and Development Roadmap

## 1. Phase 0 deliverables

The Phase 0 documentation set is:
- `ARCHITECTURE.md`
- `DATABASE.md`
- `API_CONTRACTS.md`
- `PROVIDER_CONFIG.md`

These are the baseline, not a reason to delay coding. Read them together, resolve any implementation-level schema details, then start Phase 1.

## 2. Immediate actions after Phase 0

1. Create a new GitHub repository for AI Powered COO.
2. Create the Next.js + TypeScript + Tailwind application.
3. Add the four Markdown files to the repository root.
4. Add `.gitignore` and `.env.example`; keep real secrets outside the coding-agent workspace.
5. Build the app shell with the four bottom tabs and responsive navigation.
6. Add login and the two isolated demo dataset entry options, including the required Meta demo dataset.
7. Run the app locally and verify navigation.
8. Commit the initial runnable skeleton.

## 3. Development roadmap

### Phase 1 — App shell and UI foundation
- Next.js / TypeScript / Tailwind setup.
- PWA manifest, icons placeholder, theme tokens and responsive layout.
- Four-tab bottom navigation: Dashboard, Data/Ledger, Log Entry, COO Copilot.
- Login page and demo entry choices.
- Business header and settings entry point.
- Light/dark/system theme.
- Initial empty/loading/error states.

**Exit check:** app runs, login/demo entry works, four tabs navigate, layout works on mobile and desktop.

### Phase 2 — Supabase, authentication, tenant model and RLS
- Create Supabase project and migrations.
- Profiles, businesses, business_members, settings and demo isolation.
- Transactions, transaction_items and categories.
- Authenticated server-side business context.
- RLS and server authorization.
- Seed the Meta demo dataset and second sample dataset.

**Exit check:** users can access only their authorized business; both demo options open isolated data.

### Phase 3 — Shared transaction engine
- Canonical transaction types and TypeScript contracts.
- Create, read, update, void/delete.
- Category management.
- Decimal-safe calculations and tax extension points.
- Audit records and optimistic concurrency.
- Manual entry validations.

**Exit check:** sale, purchase and expense records save correctly and can be verified in Supabase.

### Phase 4 — Ledger / Data tab
- Supabase-backed transactions table.
- Filters, search, sorting and pagination.
- Transaction detail view and line items.
- Edit/delete through shared transaction service.
- Refresh/error/empty states.

**Exit check:** UI values match persisted Supabase rows.

### Phase 5 — Dashboard
- Date presets: All, Today, Yesterday, 7d, 30d, MTD.
- Custom start/end date range.
- All / Sales / Purchase / Expense global slicer.
- Five scope-aware KPI cards.
- Donut/pie chart, bar chart and trend/signal chart.
- Five insight areas: performance movement, Pareto, comparisons, forecast, alerts/RCA.
- Business health / decision summary.
- Responsive, readable light/dark presentation.

**Exit check:** changing date or slicer updates all relevant dashboard sections consistently; calculations match tested source data.

### Phase 6 — COO intelligence foundation
- Approved metric definitions and deterministic analytics.
- Question understanding and timeframe/scope resolution.
- Evidence builder and source references.
- RCA, Pareto, period comparisons, anomaly detection.
- Forecasting with confidence/range and data sufficiency.
- Festival/seasonality and peak-hour analysis only where historical data supports it.
- Chat history and intent/debug logs.
- Response validation.

**Exit check:** each answer is tied to evidence, answers the actual question and reports limitations honestly.

### Phase 7 — Copilot AI providers and Executive Directives
- Baseten Executive Directives (three structured cards).
- Fireworks DeepSeek V3.1 primary streaming chat.
- Meta Muse Spark Contributor fallback 1.
- Baseten Muse Spark Open 1026 fallback 2.
- Provider adapters, error handling, token limits and cost logging.
- Chat history and follow-up context.

**Exit check:** text chat, follow-ups, streaming and fallback work end-to-end.

### Phase 8 — Log Entry voice
- Audio capture and upload.
- Modal faster-whisper transcription.
- Baseten structured transaction extraction.
- Preview, clarification and user confirmation.
- Shared transaction service save.
- Verify Ledger and Dashboard reflect the entry.

**Exit check:** voice and manual entry produce the same canonical persisted transaction.

### Phase 9 — Copilot voice input and spoken answer
- Meta Muse Voice Transcribe 1.0 for microphone input.
- Route recognized question through standard Copilot chat.
- Select and integrate a separate TTS provider.
- Speak the generated answer.
- Playback, stop, replay and error/retry controls.
- Language preferences.

**Exit check:** user asks by voice and receives both visible text and spoken answer. This is mandatory.

### Phase 10 — Business Profile, currency and tax jurisdiction
- Business profile fields.
- Country, region/state, timezone and currency.
- Number/date formatting and financial-year settings.
- Jurisdiction selection and tax configuration.
- India GST configuration path with registration status and business-specific applicability.
- Versioned, effective-dated tax rules.
- Other countries added as reviewed jurisdiction modules.

**Exit check:** settings affect display and deterministic tax calculations correctly; unknown rules never get guessed by AI.

### Phase 11 — PWA, security hardening and deployment
- Manifest, icons, service worker and install flow.
- HTTPS deployment.
- Safe offline shell and network state.
- Sensitive data cache policy.
- RLS negative tests and role checks.
- Production environment variables.
- Vercel deployment and smoke tests.

**Exit check:** installable app, secure tenant boundaries and reliable production flows.

### Phase 12 — Final demo and hackathon submission
- Seed and verify demo data.
- Prepare one complete business story for the demo.
- Demonstrate dashboard decisions, ledger verification, manual/voice entry, Copilot RCA/forecast/recommendations and voice Q&A.
- Record 3-minute intro + product demo.
- Final bug fixes and submission.

## 4. Suggested build order within the two-day implementation push

Keep the app runnable after every vertical slice. Prioritize:
1. App shell + login/demo options.
2. Supabase schema/auth/RLS.
3. Shared transaction service.
4. Ledger and basic manual entry.
5. Dashboard core.
6. Copilot text + Executive Directives.
7. Voice entry and voice Q&A/TTS.
8. PWA polish, deployment and demo.

If time becomes critical, reduce visual decoration and defer secondary analytics depth—not security, transaction correctness, or the mandatory voice-answer flow.

## 5. Definition of done

The product is demo-ready only when:
- A user can enter through login or a labelled demo dataset.
- Four bottom tabs work.
- Manual sale, purchase and expense entries save correctly.
- Saved data appears correctly in the Ledger and Dashboard.
- Date range and global slicer work across the Dashboard.
- The dashboard communicates meaningful business performance and decisions.
- Copilot can answer evidence-based questions, follow up, explain causes, compare periods and forecast when data is sufficient.
- Copilot voice input and spoken answers work.
- Log Entry voice produces a reviewable draft and saves only after confirmation.
- Country/currency/tax settings are represented safely and consistently.
- RLS prevents cross-business data access.
- The PWA installs and works over HTTPS.
