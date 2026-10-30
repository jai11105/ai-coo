# AI Powered COO — API Contracts

**Status:** Phase 0 proposal. Request/response schemas must be implemented as shared TypeScript types and runtime-validated on the server.

## 1. Contract principles

- All protected endpoints require Supabase Auth.
- Server resolves the active business from an authorized membership. Do not trust a client-provided business ID without checking membership and role.
- Use Zod or an equivalent runtime schema validator at API boundaries.
- Standard response envelope and error codes.
- Money values use integer minor units plus ISO currency code (or one consistently documented decimal strategy).
- Timestamps use ISO 8601; server stores UTC and interprets date filters using business timezone.
- Mutations are validated server-side and audited.
- Provider calls are server-side only.
- Never return secrets, provider keys, internal prompts or raw stack traces.

## 2. Standard response shapes

Success:
```json
{
  "data": {},
  "meta": {
    "requestId": "uuid",
    "nextCursor": null
  }
}
```

Error:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted fields.",
    "fieldErrors": {},
    "requestId": "uuid"
  }
}
```

Suggested codes:
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `BUSINESS_NOT_FOUND`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`
- `TRANSCRIPTION_FAILED`
- `EXTRACTION_FAILED`
- `INSUFFICIENT_DATA`
- `INTERNAL_ERROR`

## 3. Authentication and business context

- Supabase Auth manages login/session.
- Server middleware/helpers validate the session.
- A server-side `getAuthorizedBusinessContext()` resolves user, business membership, role, currency, timezone, locale and tax jurisdiction.
- If the user belongs to multiple businesses, the selected business must be checked against membership.
- Demo sessions are constrained to the assigned demo dataset.

## 4. Transaction APIs

### `GET /api/transactions`
Query:
- `type`: all | sale | purchase | expense
- `from`: ISO date/time
- `to`: ISO date/time
- `categoryId`
- `search`
- `cursor`
- `limit`
- `sort`

Returns paginated persisted transaction rows and safe related summaries. The server applies business scope and RLS.

### `POST /api/transactions`
Creates a transaction through the shared transaction service.

Example request:
```json
{
  "type": "sale",
  "date": "2026-10-30T10:30:00+05:30",
  "description": "Tomato sale",
  "categoryId": "uuid",
  "currency": "INR",
  "items": [
    {
      "name": "Tomato",
      "quantity": "10",
      "unit": "kg",
      "unitSellingPriceMinor": 5000,
      "unitBuyingCostMinor": 3200
    }
  ],
  "tax": {
    "jurisdictionCode": "IN",
    "taxCode": null,
    "amountMinor": 0
  },
  "paymentMethod": "cash",
  "channel": "counter",
  "source": "manual"
}
```

This is illustrative only. Final required fields depend on the transaction type, configured tax rules and agreed form UX. Server recalculates totals; it does not trust client-calculated totals.

### `GET /api/transactions/:id`
Returns a transaction and authorized line-item details.

### `PATCH /api/transactions/:id`
Updates an allowed transaction through the shared service. Use optimistic concurrency (`version`) to prevent overwriting newer changes.

### `DELETE /api/transactions/:id`
Performs the approved void/soft-delete operation, requires confirmation and permission, and writes an audit record. Avoid irreversible hard delete by default.

## 5. Categories APIs

- `GET /api/categories?type=sale|purchase|expense`
- `POST /api/categories`
- `PATCH /api/categories/:id`
- `DELETE /api/categories/:id` (deactivate if already referenced)

All category operations are business-scoped and role-checked.

## 6. Dashboard and analytics APIs

### `GET /api/dashboard`
Query:
- `from`
- `to`
- `preset`: all | today | yesterday | 7d | 30d | mtd | custom
- `scope`: all | sales | purchase | expense

Returns:
- business header/context
- selected date range and timezone
- five scope-aware KPI cards
- donut/pie chart data
- bar chart data
- trend/signal chart data
- five insight groups: performance movement, Pareto, period comparison, forecast, alerts/causes
- data sufficiency and caveat metadata

All metrics are computed from the approved deterministic analytics layer. The server must ensure every returned component uses the same normalized scope and timeframe.

### `GET /api/analytics/comparison`
Supports explicit comparison windows such as previous period, previous day, previous week, previous month and equivalent prior-year/festival windows where available.

### `GET /api/analytics/forecast`
Returns forecast series, horizon, method/version, data sufficiency, interval/range and limitations. No unsupported point forecast without uncertainty.

### `GET /api/analytics/anomalies`
Returns detected unusual movements with metric, baseline, observed value, deviation and evidence references.

## 7. Log Entry voice APIs

### `POST /api/entry/transcribe`
- Authenticates user and business.
- Accepts audio upload or an approved temporary audio reference.
- Calls Modal-hosted faster-whisper.
- Returns transcript, detected language if available, duration and confidence/quality metadata if supplied.
- Deletes temporary audio according to retention policy.

### `POST /api/entry/extract`
Request:
```json
{
  "transcript": "Today 10 kg tomato purchased for 500 rupees",
  "language": "en-IN",
  "businessContext": {
    "currency": "INR",
    "timezone": "Asia/Kolkata"
  }
}
```

The server must construct trusted business context itself; client context is only a hint and must not override server settings.

Returns a proposed transaction draft:
```json
{
  "data": {
    "type": "purchase",
    "date": "2026-10-30",
    "currency": "INR",
    "items": [
      {
        "name": "Tomato",
        "quantity": "10",
        "unit": "kg",
        "unitBuyingPriceMinor": 5000
      }
    ],
    "needsClarification": [],
    "confidence": "review_required"
  }
}
```

This is a draft only. It is not saved until the user confirms through `POST /api/transactions`.

## 8. Copilot APIs

### `POST /api/copilot/decision`
- Authenticates and resolves business.
- Builds verified analytics/evidence on the server.
- Calls Baseten Muse Spark Open 1026.
- Returns three structured executive directives.
- Uses caching and refresh triggers; not called on every chat turn.

Suggested directive fields:
- `title`
- `priority`
- `whatChanged`
- `evidence`
- `whyItMatters`
- `recommendedAction`
- `expectedImpact` (only if estimable)
- `confidence`
- `dataLimitations`

### `POST /api/copilot/chat`
Request:
```json
{
  "sessionId": "uuid-or-null",
  "message": "Why did net profit fall this week?",
  "voiceOrigin": false
}
```

Server flow:
1. Authenticate user and business membership.
2. Load permitted chat history.
3. Understand intent, entities, scope and timeframe.
4. Build deterministic evidence from authorized data.
5. Validate evidence and construct a compact provider-neutral payload.
6. Call Fireworks DeepSeek V3.1 first.
7. If failure occurs before any stream token, try Meta Muse Spark Contributor, then Baseten Muse Spark Open 1026.
8. If a stream fails after partial text, do not append a different provider's answer. Return/record a recoverable interrupted state.
9. Validate structured claims against evidence where practical.
10. Persist user and assistant messages plus intent/provider diagnostics.

Streaming response uses a documented SSE or fetch-stream format. Define event types such as:
- `message_start`
- `token`
- `message_complete`
- `provider_fallback`
- `error`

Never expose hidden system prompts or provider secrets.

### `GET /api/copilot/history`
Returns paginated chat sessions/messages for the authorized user/business.

### `POST /api/copilot/voice/transcribe`
- Uses Meta Muse Voice Transcribe 1.0.
- Returns recognized text and language metadata.
- The resulting text is sent through the same `/api/copilot/chat` logic.

### `POST /api/copilot/voice/speak`
- Uses the separately selected TTS provider.
- Accepts validated answer text and voice/language preference.
- Returns a short-lived audio stream or URL.
- Must enforce limits and avoid sending private content to an unapproved provider.
- This endpoint is mandatory because spoken Copilot answers are a product requirement.

## 9. Business profile and settings APIs

- `GET /api/business/profile`
- `PATCH /api/business/profile`
- `GET /api/business/settings`
- `PATCH /api/business/settings`
- `GET /api/tax/jurisdictions`
- `GET /api/tax/rules?jurisdiction=...`
- `POST /api/tax/configuration/validate`

Changing country/jurisdiction must not silently rewrite historical transactions. Tax rule sets are effective-dated. Currency changes affect display defaults for new transactions; historical currency values remain explicit.

## 10. Demo APIs

- `GET /api/demo/options` returns the two available demo choices and labels.
- `POST /api/demo/session` creates/opens an isolated demo session for the selected dataset.
- Required option: Meta demo dataset.
- Second option: distinct sample business dataset.
- Demo operations must never cross into real customer tenants.

## 11. Contract testing

For every endpoint:
- Validate success and error schemas.
- Test unauthenticated and unauthorized requests.
- Test cross-tenant IDs.
- Test invalid transaction type/amount/date/currency.
- Test concurrency/version conflicts.
- Test provider timeout and rate limit.
- Test streaming failure before and after first token.
- Test data refresh and cache invalidation after transaction mutations.
