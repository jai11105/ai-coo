# AI Powered COO — Application Architecture

**Status:** Phase 0 baseline  
**Product:** AI Powered COO  
**Audience:** Business owners and operators worldwide  
**Primary objective:** Give a business owner a reliable, easy-to-understand view of business performance and help them make better decisions using their own verified business data.

---

## 1. Product principles

1. **Decision-first, not chatbot-first.** The Dashboard and COO Copilot must help an owner understand what is happening, why it is happening, what may happen next, and what action to consider.
2. **One source of truth.** Supabase is the persisted source of truth. Dashboard, Ledger and Copilot use the same authorized transaction data and approved calculation definitions.
3. **Deterministic facts, AI-enhanced interpretation.** Code calculates financial facts, comparisons, metrics and evidence. AI explains, prioritizes, forecasts where supported, performs RCA and recommends actions from that evidence. AI must not invent or silently alter figures.
4. **Simple data entry.** Manual and voice entry converge on the same validation and transaction service. A user reviews and confirms AI-extracted entries before saving.
5. **Global-ready, country-aware.** Currency, locale, time zone, tax jurisdiction and tax rules are explicit business settings. Tax behaviour is implemented through reviewed jurisdiction modules, not guessed by an LLM.
6. **Security by default.** Every business-data request is authenticated, authorized for the selected business and protected by database RLS.
7. **Mobile-first PWA.** The app uses a bottom tab bar on mobile, installable PWA capabilities, accessible controls and readable light/dark themes.
8. **No silent data loss.** Deletes are confirmed, auditable and recoverable where practical. Errors are visible and actionable.

## 2. Product scope and navigation

The application has four primary bottom tabs, visually similar to a familiar social-app bottom navigation pattern:

1. **Dashboard**
2. **Data / Ledger**
3. **Log Entry**
4. **COO Copilot**

The bottom navigation remains available on mobile. On wider screens, the same destinations may be presented in a responsive navigation rail or sidebar while preserving the four primary destinations.

Global controls available from the header or a Business Profile / Settings area:
- Business identity and currently selected business
- User/profile menu
- Business Profile
- Country / tax jurisdiction
- Currency and number/date formatting
- Theme: System / Light / Dark
- Font-size or readability preference if practical
- Notification and voice preferences
- Sign out

## 3. User journeys

### 3.1 Login and demo entry

- Provide a clear login page.
- Provide two clearly labelled demo-data entry options.
- Demo option 1 must load the required **Meta demo dataset**.
- Demo option 2 loads a separate sample business dataset.
- Demo mode must be isolated from real customer data and must not expose sponsor credentials or private provider data.
- Demo users must be able to explore all four tabs and experience the main workflows.
- Demo data must be labelled as demo/sample data wherever a user could mistake it for live business data.
- Define whether demo data is read-only or resettable. Default: demo data is isolated and resettable; destructive operations affect only that demo tenant.
- Real login uses Supabase Auth. Demo access must not bypass tenant authorization.

### 3.2 Dashboard

The owner should understand the state of the business without needing to open the other tabs.

Required filters:
- Date range selector with presets: All time, Today, Yesterday, Last 7 days, Last 30 days, Month to Date (MTD).
- Custom date range: start date and end date.
- Business activity slicer: All, Sales, Purchase, Expense.
- Every KPI, chart, comparison and insight on the dashboard must respond consistently to both filters.
- Define timezone-aware date boundaries using the business timezone.

Required dashboard composition:
- Header: business name, business identity/context, selected date range, selected activity scope.
- Five KPI cards. The exact five displayed metrics should be selected based on the chosen scope; for All, a recommended baseline is Sales Revenue, Gross Profit, Operating Expenses, Net Profit and Transaction Count. For Sales/Purchase/Expense scopes, cards must switch to relevant scope-specific measures and must not display misleading metrics.
- One pie/donut chart for a useful composition view (for example category contribution or expense composition).
- One bar chart for period/category comparisons.
- One trend/signal chart showing movement over time.
- Five additional insight areas:
  1. **Performance movement:** what increased/decreased and by how much.
  2. **Category / product Pareto:** top contributors and concentration, including 80/20-style analysis when supported.
  3. **Period comparison:** previous period, day-to-day, week-to-week, month-to-date and equivalent prior period comparisons.
  4. **Forecast and outlook:** short-horizon projections with confidence/range and explicit data sufficiency.
  5. **Alerts and causes:** unusual movements, possible root causes, risks and opportunities with links to supporting evidence.
- Provide an at-a-glance business health / decision summary with clear supporting metrics.
- Do not overload the screen: use progressive disclosure, expandable insight details and sensible visual hierarchy. The owner should see the most important decisions first.

Dashboard behaviour:
- The activity slicer changes the entire dashboard scope, not only one chart.
- All means all transaction types, but metrics must preserve their financial definitions and avoid adding unlike values together.
- Sales scope focuses on revenue, units, selling price, COGS, gross profit, product/category/customer/channel performance where those dimensions exist.
- Purchase scope focuses on buying/stock purchases, suppliers, quantities, purchase value and trends where those dimensions exist.
- Expense scope focuses on operating expenses, category/vendor breakdown, trends and unusual expense movements.
- Empty data, insufficient history and missing dimensions must be explained instead of fabricating insights.

### 3.3 Data / Ledger tab

Purpose: a transparent verification surface to check that saved transaction rows are correct.

- Show the persisted Supabase `transactions` records in a clean, searchable table.
- The primary table is the transaction table. Join/display related fields only where useful (such as category, business, creator or item summary).
- Show transaction ID/reference, date/time, type, description, category, quantity/unit where relevant, selling value, buying cost/COGS where relevant, expense value, status and created/updated timestamps as appropriate.
- Provide filters for date, transaction type, category and status.
- Provide search, pagination or virtualized loading, sorting and row detail.
- Provide a row detail view to inspect the saved values and associated transaction items.
- Provide clear loading, empty, error and retry states.
- This is a verification view; avoid making it a second complicated data-entry form.
- Add only the settings necessary for table display, export, refresh and column visibility. Do not add unrelated settings here.
- Editing/deleting may be initiated here if permitted, but it must call the shared transaction service and enforce authorization.

### 3.4 Log Entry tab

Purpose: fast, understandable manual and voice entry for Sales, Purchase and Expense.

- Separate entry modes or clearly visible type selector: Sale / Purchase / Expense.
- Manual entry and voice entry must produce the same canonical transaction structure.
- Dynamic categories must be selectable; allow adding a category if the user's role permits it.
- Keep forms short and reveal conditional fields only when relevant.
- Validate date, currency, quantities, prices, totals, tax fields and required dimensions.
- Show a live calculation preview before save.

**Sale entry preview**
- Product/service, quantity and unit
- Selling price per unit and selling total
- Buying cost / COGS per unit and total when known
- Gross profit and gross margin when enough data exists
- Discount, tax and payment/channel fields when applicable
- Make clear whether a profit figure is provisional because buying cost is missing.

**Purchase entry preview**
- Product/item or description, quantity, unit
- Buying price per unit and purchase total
- Supplier and stock-related fields when applicable
- Tax components where configured for the business jurisdiction

**Expense entry preview**
- Expense category, description, amount
- Vendor/payee, date, payment method and tax fields when applicable

- Show the user the calculated result before saving.
- Save only after explicit user confirmation.
- Provide edit and delete with confirmation; use audit trail/soft-delete where appropriate.
- On success, update Ledger and Dashboard from persisted data. Copilot must use the new transaction after the data refresh/invalidation completes.
- Never let the AI extraction model directly write to Supabase.

### 3.5 COO Copilot tab

This is the signature product experience and must feel like a business decision partner, not a generic chatbot.

Required capabilities:
- Executive Directives section with three prioritized, evidence-backed directives.
- Interactive chat with follow-up questions and conversation history.
- Understand questions in natural language, including supported local languages and mixed Tamil/English where supported by the selected models.
- Answer the question actually asked, respect timeframe and business scope, and explain uncertainty.
- Voice question input and **spoken voice answer are mandatory product requirements**, not optional.
- Support interrupt/retry/replay controls for voice interactions where feasible.
- Provide citations/evidence references to relevant dashboard metrics or transaction groups inside the app.
- Keep a clear separation between facts, interpretation, forecast, possible causes and recommended actions.

Required COO intelligence:
- Business performance summary
- Root Cause Analysis (RCA)
- Pareto / concentration analysis
- Day-to-day, week-to-week, month-to-date and equivalent-period comparisons
- Seasonal and festival-period comparisons where historical data and a relevant calendar/jurisdiction are available
- Peak hours / day-of-week patterns where timestamps and sufficient transaction volume exist
- Forecasting with ranges, assumptions and confidence / data sufficiency
- Anomaly detection
- Sales, product, category, channel, customer and supplier analysis where those fields exist
- Expense control and margin analysis
- Action recommendations ranked by impact, urgency and confidence
- Follow-up questions that preserve the previous question's timeframe, scope and entities unless the user changes them
- Outcome tracking for recommendations can be added after the core decision loop is stable

Rules:
- Never claim a festival effect, peak hour or root cause without supporting data.
- Distinguish correlation from causation.
- Every important recommendation should say why, expected impact if estimable, confidence/data limitations and a practical next step.
- If the data is insufficient, say what is missing and avoid false precision.
- Store chat history and structured intent/debug context, excluding secrets and unnecessary personal data.

### 3.6 Business Profile and Settings

Business Profile must capture:
- Business name, logo and contact/business identity details
- Country and tax jurisdiction (state/province/region where relevant)
- Currency
- Business timezone
- Locale, date and number formats
- Financial year start
- Industry/business type
- Optional business operating hours and weekly working days
- Optional business channels, branches and locations

Settings:
- Currency selector, with formatting applied consistently across the app.
- Theme selector: System / Light / Dark.
- Readable font family, contrast and sizing; ensure charts and tables remain legible in both themes.
- Voice language and playback preferences.
- User and business-member management based on role.
- Tax configuration and effective dates.

### 3.7 Global tax and jurisdiction design

- Country selection must choose a jurisdiction configuration, not ask the AI to invent tax rules.
- For India, the application may present GST as the applicable tax framework and ask for required details such as state, GST registration status and relevant registration/tax settings. Do not assume every Indian business is GST-registered or apply one tax rate to every item.
- For other countries, use a versioned country/jurisdiction tax module with effective dates, tax types, rates, exemptions and required business configuration.
- Keep tax calculation deterministic and auditable.
- Show a clear “needs configuration / verify with a qualified tax professional” state where rules or business status are unknown.
- Do not present the app as a substitute for official tax advice or filing compliance.
- Tax modules must be reviewed and updated when laws change; model knowledge is not the tax source of truth.

## 4. Technology architecture

Initial proposed stack:
- Frontend: Next.js, React, TypeScript
- Styling: Tailwind CSS
- Backend: Next.js server routes / server-side services
- Database and authentication: Supabase PostgreSQL + Supabase Auth
- Authorization: server-side business membership checks + PostgreSQL RLS
- Hosting: Vercel (or another approved HTTPS host)
- PWA: web app manifest, icons, service worker/offline shell and installability
- Version control: GitHub

Use server-only modules for provider API keys. No provider key or Supabase service-role key may be exposed to browser code.

## 5. AI provider architecture

Locked intended assignments:
- **Coding agent:** Muse Code using Meta Muse Spark 1.3 Contributor.
- **Primary Copilot chat:** Fireworks `accounts/fireworks/models/deepseek-v3p1` (DeepSeek V3.1).
- **Copilot chat fallback 1:** Meta Muse Spark 1.3 Contributor.
- **Copilot chat fallback 2:** Baseten Muse Spark Open 1026.
- **Executive Directives:** Baseten Muse Spark Open 1026.
- **Voice input for Copilot:** Meta Muse Voice Transcribe 1.0.
- **Voice input for Log Entry:** Modal-hosted faster-whisper.
- **Voice transaction extraction:** Baseten Muse Spark Open 1026.
- **Copilot text-to-speech:** separate TTS adapter/provider. This is mandatory for the product; select and configure a provider before the Copilot voice-answer milestone. Do not assume Meta Voice Transcribe provides TTS.

Provider rules:
- All calls occur server-side.
- Build a provider adapter interface so models can be changed without rewriting Copilot business logic.
- Use the same server-built evidence and conversation context across chat fallbacks.
- Fallback only on provider errors, timeouts, rate limits or unavailable service; not because two models disagree.
- If streaming fails before the first token, try the next provider.
- If streaming fails after partial text has been sent, do not append another model's answer. Show a restart/retry action.
- Limit tokens and context; avoid sending the entire database or all analytics.
- Cache Executive Directives and regenerate only on defined triggers.
- Track provider, model, latency, token usage, error class and estimated cost without logging credentials.
- Sponsor credits are hackathon-only; implement graceful provider failure and make it easy to replace a provider after the hackathon.

## 6. Core data and calculation rules

- Supabase is the persisted source of truth.
- A transaction header may have zero or more typed line items depending on transaction type and business workflow.
- Support non-item expense/events where appropriate.
- Define canonical types for Sale, Purchase and Expense.
- A sale's COGS is the buying cost associated with the goods sold; a standalone stock purchase is a separate Purchase transaction. Never merge these concepts.
- Use decimal-safe money handling (integer minor units or a suitable decimal strategy); never rely on binary floating point for financial totals.
- Store currency code on the business and, where required, on transactions. Define currency conversion separately; never sum different currencies without an explicit conversion policy.
- Store timestamps in UTC and interpret/report them using the business timezone.
- Tax values must preserve tax type, rate, taxable base, tax amount, jurisdiction and effective rule/version when applicable.
- All metrics must have documented definitions and tests.
- Dashboard and Copilot must consume the same approved analytics contracts.

## 7. PWA architecture

Required:
- Installable manifest with app name “AI Powered COO”, short name, icons, theme/background colors and start URL.
- Responsive mobile-first UI with bottom navigation.
- Service worker for app shell/static asset caching and safe update lifecycle.
- Offline indicator and graceful offline state.
- Do not silently queue financial writes unless an explicit conflict-safe offline transaction queue is implemented and tested.
- Voice capture and AI features require network connectivity; show a clear offline message.
- Authentication and sensitive business data must not be cached in a way that leaks across users or devices.
- HTTPS is required for production PWA and microphone access.
- Test install/update behaviour on Android Chrome and at least one desktop browser.

## 8. Security and privacy

- Supabase Auth identifies the user.
- Server verifies the user's membership and role for the selected business on every protected request.
- RLS policies enforce tenant boundaries even if a route has a bug.
- Never trust a business ID, role, amount, metric or business context supplied by the client without server validation.
- Keep provider keys and service-role credentials in server-side environment variables only.
- Never log API keys, access tokens, raw secrets or unnecessary audio.
- Define audio retention/deletion. Delete temporary audio after transcription unless the user explicitly enables a justified retention feature.
- Protect chat history and intent logs by tenant and user/business permissions.
- Audit sensitive mutations and deletions.
- Use least privilege and rate limits on expensive AI/voice endpoints.

## 9. Reliability, observability and recovery

- Standard error format for API routes.
- Loading, empty, offline, unauthorized, validation and provider-failure UI states.
- Retry only safe/idempotent operations.
- Use request IDs and structured server logs.
- Track transaction creation/update/delete, provider usage and AI validation outcomes.
- Do not expose stack traces or secrets to the user.
- Use database constraints and server-side validation as well as frontend validation.

## 10. Quality gates and acceptance criteria

The app is not complete until these journeys work end-to-end:

1. Demo login → Meta demo dataset → all four tabs.
2. Real login → only authorized business data.
3. Manual Sale → Supabase → Ledger → Dashboard → Copilot evidence.
4. Manual Purchase → correct purchase figures and no accidental COGS conflation.
5. Manual Expense → correct expense figures and category.
6. Edit/delete → persisted result, audit trail and refreshed dashboard.
7. Log Entry voice → Modal transcription → Baseten extraction → review → confirmation → same transaction service → Supabase.
8. Copilot text question → evidence → Fireworks DeepSeek V3.1 → streaming answer → history.
9. Fireworks failure → Meta fallback; Meta failure → Baseten fallback, with no mixed partial response.
10. Copilot voice question → Meta transcription → same chat flow → TTS spoken answer.
11. Dashboard filters and slicer consistently affect all relevant cards/charts/insights.
12. Tax and currency settings affect display and configured deterministic calculations correctly.
13. Tenant isolation passes negative tests.
14. PWA installs, updates and behaves safely offline.

## 11. Delivery constraints

Build in vertical slices and keep the app runnable after each phase. Prefer a complete, working core over many disconnected screens. Do not weaken validation or security to make a demo appear successful. Use demo data to showcase advanced intelligence, but label demo data clearly.
