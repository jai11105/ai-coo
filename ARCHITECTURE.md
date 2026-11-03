# AI Powered COO — Application Architecture

**Status:** Finalized Phase 0 baseline  
**Product:** AI Powered COO  
**Audience:** Business owners and operators worldwide  
**Primary objective:** Give a business owner a reliable, easy-to-understand view of business performance and help them make better decisions using their own verified business data.

---

## 1. Product principles

1. **Decision-first, not chatbot-first:** The Dashboard and COO Copilot exist to help an owner understand what is happening, why it is happening, what may happen next, and what action to consider.
2. **One source of truth:** Supabase PostgreSQL is the authoritative, persisted source of truth. Dashboard, Ledger, and Copilot use the same authorized transaction data and approved calculation definitions.
3. **Deterministic facts first, AI-enhanced interpretation second:** Server-side code calculates financial facts, comparisons, metrics, and evidence deterministically before invoking an AI model. AI models interpret the evidence, explain business decisions, prioritize directives, perform root cause analysis (RCA), and explain forecasts. AI must never invent, estimate without evidence, or silently alter figures.
4. **Unified transaction engine:** Manual and voice entry converge on the same canonical validation rules, shared transaction service, and auditable storage. A user must always review, edit, and explicitly confirm AI-extracted entries before saving.
5. **Global-ready, jurisdiction-aware:** Currency, locale, timezone, tax jurisdiction, and tax rules are explicit business settings. Tax behaviour is implemented through reviewed, versioned jurisdiction modules, not guessed by an LLM. For India, registration status (GST registered vs non-registered) must be checked before applying GST rules.
6. **Security and tenant isolation by default:** Every business-data request is authenticated via Supabase Auth, authorized for the selected business, and enforced by database Row Level Security (RLS). Demo datasets are completely isolated across users.
7. **Mobile-first PWA:** The app uses a bottom navigation bar on mobile, responsive desktop navigation, installable PWA capabilities, accessible controls, and readable light/dark themes.
8. **No silent data loss:** Deletes are confirmed, auditable, and implemented via soft-deletion where appropriate. Errors are visible and actionable.

---

## 2. Product scope and navigation

The application is mobile-first and fully responsive across mobile, tablet, and desktop viewports.

### 2.1 Mobile bottom navigation
The mobile layout features a persistent bottom navigation bar with four primary destinations:
1. **Dashboard:** At-a-glance financial health, scope-aware KPIs, charts, and prioritized business insights.
2. **Data / Ledger:** Verification and management surface for persisted Supabase transactions.
3. **Log Entry:** Rapid manual and voice-driven entry for Sales, Purchases, and Expenses.
4. **COO Copilot:** Decision intelligence partner providing directives, root cause analysis, conversational Q&A, and voice interactions.

### 2.2 Desktop navigation
On desktop and wide screens, navigation adapts to a responsive sidebar or top navigation rail while preserving the four primary destinations and direct access to business context.

### 2.3 Global controls & Business Profile / Settings
Accessible from the global header or settings area:
- Business identity and active business switcher.
- User profile and authentication status.
- Business Profile (legal name, industry, operating hours, branches/channels).
- Regional settings: Country, tax jurisdiction, timezone, locale, currency, date and number formatting.
- Theme preference: System / Light / Dark.
- Voice preferences (input language, spoken response toggle).
- Sign out.

---

## 3. User journeys and core features

### 3.1 Login and demo dataset entry
- Clean authentication page powered by Supabase Auth.
- Two distinct, completely isolated demo dataset options:
  1. **Meta demo dataset:** Curated sample retail/FMCG dataset showcasing multi-channel operations, peak seasons, and comprehensive COO decision scenarios.
  2. **Second separate demo dataset:** Distinct alternative business dataset (e.g., service or specialty retail) with independent operational metrics.
- **Strict demo isolation:** Demo sessions are sandboxed per user via dedicated demo business records (`is_demo = true`, `demo_dataset_key = 'meta_demo'`). Users cannot view, mutate, or mix data with other demo users or production tenants.
- Demo mode is prominently labelled in the UI banner/header to prevent confusion with live business records.
- A single-click reset capability restores demo data to its pristine template state without impacting any other tenant.

---

### 3.2 Scope-aware Dashboard

The Dashboard provides immediate visibility into business performance without requiring navigation to other tabs.

#### Filters and Global Activity Slicer
- **Date presets:** All, Today, Yesterday, Last 7 Days, Last 30 Days, Month to Date (MTD).
- **Custom date range:** Explicit start date and end date picker respecting business timezone boundaries.
- **Global Activity Slicer:** `All` | `Sales` | `Purchase` | `Expense`.
- **Consistency requirement:** The selected activity slicer consistently alters the definitions and data of **all** 5 KPI cards, charts, and insights in unison.

#### Scope Behavior & KPI Matrix

| Metric / Component | Scope: `All` | Scope: `Sales` | Scope: `Purchase` | Scope: `Expense` |
|---|---|---|---|---|
| **KPI Card 1** | **Sales Revenue** (`sales_revenue`) | **Sales Revenue** (`sales_revenue`) | **Total Purchases** (`total_purchases`) | **Operating Expenses** (`operating_expenses`) |
| **KPI Card 2** | **Gross Profit** (`gross_profit`) | **Gross Profit** (`gross_profit`) | **Procured Units** (`procured_units`) | **Top Expense Category** (`top_expense_category`) |
| **KPI Card 3** | **Operating Expenses** (`operating_expenses`) | **Gross Margin %** (`gross_margin_pct`) | **Active Suppliers** (`supplier_count`) | **Expense to Revenue %** (`expense_to_revenue_pct`) |
| **KPI Card 4** | **Net Profit** (`net_profit`) | **Avg Order Value** (`average_order_value`) | **Avg Purchase Value** (`average_purchase_value`) | **Avg Daily Expense** (`average_daily_expense`) |
| **KPI Card 5** | **Transaction Count** (`transaction_count`) | **Sales Count** (`sales_count`) | **Purchase Count** (`purchase_count`) | **Expense Count** (`expense_count`) |
| **Donut Chart** | Revenue vs Expense Composition | Category / Product Contribution | Purchases by Supplier or Item | Expense Breakdown by Category |
| **Bar Chart** | Sales vs Expenses Comparison | Period-over-Period Sales Revenue | Top Suppliers by Procurement Value | Top Expense Categories vs Prior Period |
| **Trend Chart** | Revenue & Expense Movement | Sales Revenue & Volume Trend | Procurement Cost Trend | Daily/Weekly Operating Expense Movement |

#### Visualizations and Insights
- **Category/product contribution:** Identification of key revenue and margin drivers.
- **Business performance movement:** Net trajectory (growth/decline) against prior comparable windows.
- **Forecast and outlook:** Projections with explicit uncertainty ranges and confidence indicators.
- **Alerts and possible causes:** System-flagged anomalies, cost surges, or margin compressions with linked evidence.
- **Business health summary:** At-a-glance executive diagnostic score and key ratios.
- **Prioritized business insights:** High-impact operational observations.

#### Analytical guardrails
- Peak-hour analysis, festival comparisons, seasonal patterns, and forward-looking forecasts **only appear when sufficient supporting historical data exists** (typically 30–60 days of verified transaction history).
- When data is insufficient, display transparent data-readiness notices explaining what history is required. Never fabricate unsupported business facts, projections, or calculations.

---

### 3.3 Data / Ledger

The Data / Ledger tab serves as the transparent verification and record management surface for all persisted transaction records.

- Primary data source is the Supabase `transactions` table (with associated `transaction_items`).
- **Core capabilities:** Full-text search, multi-field filtering (date, transaction type, category, status), column sorting, compound cursor pagination, and detailed slide-out/modal view.
- **Displayed fields:**
  - Transaction ID and human-readable reference code (e.g., `TXN-2026-0042`).
  - Date and time (rendered in business timezone).
  - Transaction type: Sale, Purchase, Expense.
  - Description and counterparty (customer, supplier, payee).
  - Category name.
  - Quantity and unit (where applicable).
  - Selling value (`total_minor` for sales).
  - Buying cost / COGS (`buying_cost_total_minor` where applicable for sales).
  - Expense value (`total_minor` for expenses).
  - Status (e.g., `confirmed`, `draft`, `voided`).
  - Created and updated timestamps.
- **Shared Transaction Service:** Edit and soft-delete/void operations are mediated strictly through the shared transaction service.
- **Auditability:** Every mutation or deletion writes an immutable record to `audit_logs` capturing user identity, timestamp, request ID, before data, and after data.

---

### 3.4 Log Entry

Provides rapid, intuitive transaction logging with separate flows for Sale, Purchase, and Expense, supporting dynamic category selection and creation.

#### Manual entry workflows
- **Sale:** Capture selling price, buying cost / COGS (when known), quantity, unit, dynamic category, date/time, customer/channel, and tax. Automatically calculates gross profit and gross margin preview before save. Clearly flags provisional margins when buying cost is absent.
- **Purchase:** Capture item/stock description, quantity, unit, buying price per unit, total purchase value, supplier, date, and payment/tax details. Keeps standalone inventory purchases strictly separated from sales COGS.
- **Expense:** Capture expense category, description, expense amount, vendor/payee, date, payment method, and applicable tax details.

#### Voice entry workflow
Voice and manual entry converge on the exact same canonical transaction service and validation rules:
1. Browser records user audio via Web Audio / MediaRecorder API.
2. Audio payload is sent to the backend and transcribed via **Meta Muse Voice Transcribe 1.0** (Meta API).
3. Transcribed text is sent to **Muse Spark Contributor** (Meta API) for structured extraction.
4. The extraction model returns a structured JSON draft classifying transaction type, items, quantities, units, amounts, and category hints.
5. User reviews, edits, and verifies the structured draft in the UI.
6. User provides explicit confirmation.
7. Shared transaction service validates constraints, recalculates totals deterministically, and saves to Supabase.
8. Persisted transaction immediately updates the Ledger and Dashboard, and becomes available for Copilot analysis.

**Strict guardrails:**
- Never stream raw audio directly to the structured extraction model.
- Never write AI-generated drafts directly to Supabase without explicit user confirmation.

---

### 3.5 COO Copilot

COO Copilot is a dedicated decision-support intelligence partner designed to assist business operators.

#### Operating model
- **Evidence first:** Code calculates verified metrics, variance, trends, and anomalies deterministically from Supabase on the server.
- **AI interpretation:** The LLM receives a compact, verified evidence payload and provides clear business analysis, root cause explanations, and strategic direction.
- **Strict truthfulness:** The AI must never perform ad-hoc arithmetic or invent data.

#### Key capabilities
- **Executive Directives:** Three prioritized, evidence-backed operational directives updated on data changes.
- **Direct business Q&A:** Answers natural language questions on margins, revenue drops, cost leaks, and volume shifts.
- **Contextual follow-up:** Preserves active timeframes, filters, and business entities across conversational turns.
- **Root Cause Analysis (RCA):** Deconstructs margin compressions or revenue dips into volume, pricing, product mix, or supplier cost factors.
- **Pareto analysis (80/20):** Evaluates product and customer concentration risks.
- **Period comparisons:** Day-over-day, week-over-week, month-to-date, and prior-year comparisons.
- **Trends and anomalies:** Highlights unexpected expense spikes or demand slowdowns.
- **Voice interaction:** Voice question input via **Meta Muse Voice Transcribe 1.0** and spoken voice output via **Meta MMS TTS** (`facebook/mms-tts-eng`). Spoken answers and voice input are mandatory product features.
- **Intent and debug logs:** Detailed server-side logging of resolved intent, evidence references, model latency, and validation status to diagnose discrepancies, with automated PII and credential scrubbing before persistence.

---

## 4. Finalised runtime model mapping

All models called by the application at runtime must be Meta models. Third-party inference providers are permitted only when hosting an authorized Meta model checkpoint.

| Product capability | Model checkpoint | Inference provider | Role & Allocation | Fallback order |
|---|---|---|---|---|
| **COO Copilot LLM** | Meta Muse Spark 1.3 Contributor | Meta API | Primary chat reasoning | **Primary** |
| | Muse Spark Open 1026 | Baseten | First fallback ($100 credit) | **Fallback 1** |
| | Muse Glimmer 30B | Fireworks | Final fallback ($1 credit) | **Fallback 2** |
| **Executive Directives** | Meta Muse Spark 1.3 Contributor | Meta API | Strategic directives (w/ Baseten FB) | Single source |
| **Log Entry Voice STT** | Meta Muse Voice Transcribe 1.0 | Meta API | Audio transcription | Single source |
| **Log Entry Structured Extraction** | Muse Spark Contributor | Meta API | Text to structured draft | Single source (Meta API) |
| **Copilot Voice Input (STT)** | Meta Muse Voice Transcribe 1.0 | Meta API | Spoken question transcription | Single source |
| **Copilot Voice Output (TTS)** | Meta MMS TTS (`facebook/mms-tts-eng`) | Separately provisioned inference endpoint | English spoken response | Single source (Endpoint to be provisioned) |

### Strict routing and fallback rules
- **Exact fallback order:** COO Copilot chat strictly executes Primary (Meta API) $\rightarrow$ Fallback 1 (Baseten) $\rightarrow$ Fallback 2 (Fireworks).
- **Fallback triggers:** Connection failures, network timeouts (>8000ms), upstream rate limits, or 5xx provider outages. Disagreement in model opinion is never a fallback condition.
- **Streaming integrity:** Fallback is only permissible before the first token is emitted to the client. If a stream fails mid-generation, terminate cleanly and surface a retry prompt with `STREAM_INTERRUPTED`; never splice tokens from a secondary model into an existing stream.
- **No non-Meta models:** OpenAI, Anthropic, Google, DeepSeek, Whisper, or other non-Meta runtime models are strictly prohibited. Faster-whisper and Chatterbox are not permitted.

---

## 5. Architectural layers & system boundaries

The application enforces strict separation of concerns across distinct architectural layers:

```text
+-----------------------------------------------------------------------------------+
|  1. Presentation & Client Layer (Next.js App Router / React / TypeScript / PWA)   |
|  - Mobile Bottom Tab Bar (Dashboard, Ledger, Log Entry, Copilot)                  |
|  - Desktop Responsive Navigation Sidebar                                          |
|  - Theme Controller (System / Light / Dark) & PWA Service Worker Shell            |
|  - Client State & Cache Management (React Query / SWR / Context)                  |
+-----------------------------------------------------------------------------------+
                                         |
                            HTTPS / REST  |  Server-Sent Events (SSE)
                                         v
+-----------------------------------------------------------------------------------+
|  2. API & Server Routes Layer (Next.js Server Handlers: /api/...)                 |
|  - Route Handlers & Zod Schema Validation                                         |
|  - Rate Limiting Controller (per-business & per-user thresholds)                  |
|  - SSE Streaming Controller with pre-token failover orchestration                 |
|  - Safe Error Envelope Normalization                                              |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|  3. Server-Side Business Context & Security Layer                                 |
|  - getAuthorizedBusinessContext(req): Validates Supabase Auth JWT (auth.uid())     |
|  - Verifies business_members active status & RBAC role (owner, admin, editor, etc)|
|  - Loads authoritative business settings: timezone, currency, tax jurisdiction    |
|  - Rejects unauthorized cross-tenant requests before hitting database or models   |
+-----------------------------------------------------------------------------------+
                                         |
                     +-------------------+-------------------+
                     |                                       |
                     v                                       v
+-----------------------------------------+   +-------------------------------------+
|  4. Business Services Layer             |   |  5. Deterministic Intelligence Layer|
|  - Shared Transaction Service:          |   |  - Scope-Aware Aggregator:          |
|      * Server recalculation of totals   |   |      * Calculations for all scopes  |
|      * Decimal-safe integer minor math  |   |  - Evidence Builder:                |
|      * Sale COGS vs Purchase separation |   |      * Verified facts & KPI delta   |
|      * Optimistic locking (version)     |   |  - Variance, Pareto & Anomaly Engine|
|      * Soft-delete & Audit logging      |   |  - Data-Sufficiency Guardrails      |
+-----------------------------------------+   +-------------------------------------+
                     |                                       |
                     | Direct SQL / RLS                      | Compact Evidence
                     v                                       v
+-----------------------------------------+   +-------------------------------------+
|  6. Database & Persistence Layer        |   |  7. AI Provider Adapters Layer      |
|  (Supabase Cloud PostgreSQL)            |   |  - Meta API Adapter:                |
|  - Row Level Security (RLS) on all      |   |      * Muse Spark 1.3 Contributor   |
|    tenant tables (business_id)          |   |      * Muse Voice Transcribe 1.0    |
|  - Transactions & Items                 |   |  - Baseten Adapter:                 |
|  - Categories, Profiles, Settings       |   |      * Muse Spark Open 1026         |
|  - Chat Sessions & Messages             |   |  - Fireworks Adapter:               |
|  - copilot_intent_logs (PII redacted)   |   |      * Muse Glimmer 30B             |
|  - audit_logs (immutable change history)|   |  - Meta Contributor Adapter:        |
|  - Demo tenant partitioned schemas      |   |      * Muse Spark Contributor     |
|                                         |   |  - Meta MMS TTS Inference Adapter:  |
|                                         |   |      * facebook/mms-tts-eng (TTS)   |
+-----------------------------------------+   +-------------------------------------+
```

### Communication Protocols:
- **Client to Server:** HTTPS REST for all data and transaction operations; Server-Sent Events (SSE) for Copilot streaming answers. WebSockets are deliberately omitted as real-time bi-directional streaming is not required.
- **Server to Database:** PostgreSQL protocol over connection pool with Row Level Security.
- **Server to AI Providers:** Authenticated HTTPS REST / RPC with streaming response consumption.

---

## 6. Business Profile and jurisdiction tax design

### Business Profile & Regional Configuration
- Business Name, Legal Name, Logo, Industry, Business Type.
- Operating hours, active working days, optional branch/channel identifiers.
- Currency code (ISO 4217) and number/date formatting locale.
- Business timezone (IANA string, e.g., `Asia/Kolkata`, `America/New_York`).
- Financial year start month (e.g., April for India/UK, January for US).

### Jurisdiction-aware tax rules
- Tax calculations must be deterministic, auditable, and driven by versioned code modules rather than AI estimates.
- **India path:** Explicitly asks whether the business is **GST registered** before enabling GSTIN fields, HSN/SAC codes, and CGST/SGST/IGST breakdown. Non-registered businesses operate without mandatory tax overhead. Rates are item/category specific, not a flat assumption.
- **Global jurisdictions:** Supports country-specific rule modules with effective start/end dates.
- **Currency immutability:** Updating the business currency setting only changes display defaults for future records; historical transaction currency codes and minor units remain immutable.

---

## 7. Security, tenant isolation, and auditability

1. **Authentication:** Managed exclusively via Supabase Auth.
2. **Multi-tenancy:** Every customer entity is tied to a `business_id`. Row Level Security (RLS) policies enforce tenant isolation at the PostgreSQL level (`is_business_member(business_id)`).
3. **Demo dataset isolation:** Demo datasets are partitioned by assigned demo tenant IDs or isolated session tenants. Negative RLS tests guarantee zero cross-tenant read/write leakage.
4. **Credential safety:** Provider API keys, service-role keys, and inference endpoints reside exclusively in server-side environment variables. No secrets are ever exposed in client bundles.
5. **Auditing & Soft Deletion:** Critical transaction mutations and deletions are soft-deleted (`deleted_at`) and write snapshot records to `audit_logs`.
6. **Copilot Query Redaction:** Before storing questions in `copilot_intent_logs`, automated server-side scrubbing strips PANs, account numbers, credentials, and tax IDs.
7. **Ephemeral Audio:** Audio recorded for voice transcription is processed in memory or stored in ephemeral storage, deleted immediately following transcription.

---

## 8. Quality gates and acceptance criteria

The product meets Phase 0 architectural standards when all conditions are fulfilled:

1. **Demo & Auth:** Clean login flow; both Meta demo dataset and second demo dataset launch into completely isolated environments.
2. **Navigation:** Responsive shell operates smoothly with bottom tab bar on mobile and sidebar on desktop.
3. **Data Integrity:** Manual Sale, Purchase, and Expense entries validate through the shared transaction service; Ledger reflects saved Supabase records with proper COGS separation.
4. **Dashboard Consistency:** Global Activity Slicer (`All`, `Sales`, `Purchase`, `Expense`) and date presets reliably update all 5 KPI cards, charts, and insights in unison.
5. **Log Entry Voice:** Audio $\rightarrow$ Meta Muse Voice Transcribe 1.0 $\rightarrow$ Muse Spark Contributor $\rightarrow$ structured draft $\rightarrow$ user review $\rightarrow$ confirmed save to Supabase.
6. **Copilot Intelligence:** Server generates verified evidence; Meta Muse Spark 1.3 Contributor answers Q&A; Baseten (Muse Spark Open 1026) and Fireworks (Muse Glimmer 30B) activate reliably on simulated upstream failure.
7. **Copilot Voice Q&A:** Voice question transcribed by Meta Voice Transcribe 1.0; answer generated and spoken aloud via Meta MMS TTS (`facebook/mms-tts-eng`).
8. **Jurisdiction Settings:** India GST flow validates registration status; tax calculations remain deterministic; historical currencies remain uncorrupted.
9. **Zero Non-Meta Runtime Models:** All runtime model invocations strictly verify against approved Meta checkpoints.
