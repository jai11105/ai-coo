# AI Powered COO — API Contracts

**Status:** Finalized Phase 0 baseline  
**Protocol:** HTTPS / REST with Server-Sent Events (SSE) for streaming  
**Data format:** JSON (UTF-8)  
**Authentication:** Supabase Auth Bearer Token (`Authorization: Bearer <jwt>`)  
**Runtime Model Policy:** 100% Meta models. Third-party providers (Baseten, Fireworks) act strictly as inference hosts for approved Meta checkpoints.

---

## 1. Global architectural & security standards

### 1.1 Server-side business context & authorization resolution
Every tenant-scoped request must resolve business context on the server via `getAuthorizedBusinessContext(req)`.
1. The client presents a Supabase Auth JWT in the `Authorization` header.
2. The server extracts the authenticated user ID (`auth.uid()`).
3. If the request targets a specific business (via `x-business-id` header or body/path parameter), the server **never trusts this ID blindly**. It validates that:
   - The user has an active membership record in `business_members` where `business_id = target_id` and `status = 'active'`.
   - The user's role (`owner`, `admin`, `editor`, `viewer`) satisfies the specific endpoint's authorization requirements.
4. If the user is not an active member of the requested business, the server rejects the request with `403 Forbidden` (`FORBIDDEN`) or `404 Not Found` (`BUSINESS_NOT_FOUND`) without leaking existence.
5. The server retrieves the business's authoritative settings: IANA timezone, currency code, locale, tax jurisdiction, and GST registration status. Client-supplied context cannot override server-persisted settings.

### 1.2 Role-based access control (RBAC) matrix

| Role | Read Ledger / Dashboards / Copilot | Create / Edit Transactions | Void / Delete Transactions | Manage Categories | Update Business Settings | View Audit Logs |
|---|---|---|---|---|---|---|
| **owner** | Yes | Yes | Yes | Yes | Yes | Yes |
| **admin** | Yes | Yes | Yes | Yes | Yes | Yes |
| **editor** | Yes | Yes | Yes | Yes (Create/Edit) | No | No |
| **viewer** | Yes | No | No | No | No | No |

---

## 2. Standard response envelopes & error handling

### 2.1 Standard Success Envelope
```json
{
  "data": {},
  "meta": {
    "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "timestamp": "2026-10-31T07:30:00.000Z",
    "cursor": null,
    "hasMore": false
  }
}
```

### 2.2 Standard Error Envelope
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request payload failed validation.",
    "fieldErrors": {
      "items.0.quantity": "Quantity must be greater than zero."
    },
    "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}
```

### 2.3 Global Error Codes & HTTP Status Mapping

| HTTP Status | Error Code | Description |
|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | Request parameters or body failed Zod schema validation. |
| `400 Bad Request` | `INVALID_TIMEZONE` | Specified timezone is not a valid IANA timezone string. |
| `401 Unauthorized` | `UNAUTHENTICATED` | Missing, malformed, or expired Supabase Auth JWT. |
| `403 Forbidden` | `FORBIDDEN` | User does not have the required role in the target business. |
| `404 Not Found` | `NOT_FOUND` | Requested entity (transaction, session, category) does not exist. |
| `404 Not Found` | `BUSINESS_NOT_FOUND` | Business does not exist or user is not a member. |
| `409 Conflict` | `CONFLICT` | Optimistic locking version mismatch during update. |
| `422 Unprocessable` | `INSUFFICIENT_DATA` | Historical data volume is inadequate for statistical analysis or forecasting. |
| `429 Too Many Requests` | `RATE_LIMITED` | Rate limit exceeded. Returns `Retry-After` header in seconds. |
| `502 Bad Gateway` | `PROVIDER_UNAVAILABLE`| Upstream Meta inference endpoint failed across all fallbacks. |
| `500 Internal Error` | `INTERNAL_ERROR` | Unhandled server exception. Secrets and traces are stripped. |

### 2.4 Rate Limiting Specifications
- **Ledger & Dashboard APIs:** 120 requests/minute per business.
- **Voice Transcription (`/api/entry/transcribe`, `/api/copilot/voice/transcribe`):** 20 requests/minute per user.
- **Structured Extraction (`/api/entry/extract`):** 30 requests/minute per business.
- **Copilot Chat (`/api/copilot/chat`):** 30 requests/minute per business.
- **Copilot Voice Synthesis (`/api/copilot/voice/speak`):** 30 requests/minute per business.

---

## 3. Financial calculations & decimal safety standards

All monetary amounts are represented as integer minor units (`*Minor`, e.g., cents, paise) paired with an explicit ISO 4217 currency code (`char(3)`). Floating-point arithmetic is prohibited.

### 3.1 Mathematical Calculation Rules

#### Line item calculations:
- `line_subtotal_minor = round(quantity * unit_price_minor)`  
  *(where `unit_price_minor` is `unit_selling_price_minor` for sales, or `unit_buying_cost_minor` for purchases)*
- `line_total_minor = line_subtotal_minor - line_discount_minor + line_tax_minor`

#### Header calculations:
- `subtotal_minor = sum(line_subtotal_minor)`
- `discount_minor = sum(line_discount_minor) + header_discount_minor`
- `tax_total_minor = sum(line_tax_minor) + header_tax_minor`
- `total_minor = subtotal_minor - discount_minor + tax_total_minor`

#### Type-specific transaction rules:
1. **Sale (`transaction_type = 'sale'`):**
   - `buying_cost_total_minor = sum(round(quantity * unit_buying_cost_minor))`  
     *(calculated across items where unit buying cost is provided; `null` if entirely unknown)*
   - `gross_profit_minor = (subtotal_minor - discount_minor) - buying_cost_total_minor`  
     *(Net revenue excluding tax minus COGS. `null` if `buying_cost_total_minor` is `null`)*
   - `gross_margin_percentage = round(((gross_profit_minor / (subtotal_minor - discount_minor)) * 100), 2)`
2. **Purchase (`transaction_type = 'purchase'`):**
   - Reflects inventory procurement and stock additions.
   - `total_minor = subtotal_minor - discount_minor + tax_total_minor`
   - `buying_cost_total_minor` is strictly `null` (standalone purchases must never be conflated with sale COGS).
   - `gross_profit_minor` is strictly `null`.
3. **Expense (`transaction_type = 'expense'`):**
   - Reflects operational overhead (rent, utilities, salaries, logistics).
   - `total_minor = subtotal_minor - discount_minor + tax_total_minor`
   - `buying_cost_total_minor` is strictly `null`.
   - `gross_profit_minor` is strictly `null`.

---

## 4. Timezone-safe date range handling

Date filters are interpreted in the business's authoritative IANA timezone (`businesses.timezone`) and converted to UTC (`timestamptz`) boundaries before querying Supabase PostgreSQL.

### 4.1 Boundary Conversion Rules
1. **`today`:**  
   Local: `[YYYY-MM-DD 00:00:00.000, YYYY-MM-DD 23:59:59.999]` in business timezone.  
   *Example (`Asia/Kolkata` UTC+05:30 on 2026-10-31):*  
   UTC: `2026-10-30T18:30:00.000Z` to `2026-10-31T18:29:59.999Z`.
2. **`yesterday`:**  
   Local: `[Yesterday 00:00:00.000, Yesterday 23:59:59.999]` in business timezone.  
   *Example (`Asia/Kolkata` on 2026-10-31):*  
   UTC: `2026-10-29T18:30:00.000Z` to `2026-10-30T18:29:59.999Z`.
3. **`7d` (Last 7 Days):**  
   Local: Start of day 6 days ago (`00:00:00.000`) through end of today (`23:59:59.999`).
4. **`30d` (Last 30 Days):**  
   Local: Start of day 29 days ago (`00:00:00.000`) through end of today (`23:59:59.999`).
5. **`mtd` (Month to Date):**  
   Local: First day of current month (`YYYY-MM-01 00:00:00.000`) through end of today (`23:59:59.999`).
6. **`all`:**  
   UTC: `1970-01-01T00:00:00.000Z` through end of today in business timezone.
7. **`custom`:**  
   Client provides local dates `from` (`YYYY-MM-DD`) and `to` (`YYYY-MM-DD`). The server converts `from 00:00:00.000` and `to 23:59:59.999` in business timezone to UTC.

All responses include structured timeframe metadata:
```json
"timeframe": {
  "preset": "today",
  "timezone": "Asia/Kolkata",
  "localFrom": "2026-10-31T00:00:00.000+05:30",
  "localTo": "2026-10-31T23:59:59.999+05:30",
  "utcFrom": "2026-10-30T18:30:00.000Z",
  "utcTo": "2026-10-31T18:29:59.999Z"
}
```

---

## 5. Stable compound cursor pagination

To prevent skipping or duplicating records when multiple transactions share identical timestamps, cursor pagination uses a deterministic compound ordering key:
$$\text{Compound Key} = (\text{transaction\_date}, \text{id})$$

### 5.1 Cursor Specification
- **Encoding:** Opaque base64 string encoding a JSON payload:
  ```json
  {"t": "2026-10-30T14:30:00.000Z", "id": "c39a04b1-889b-439d-b472-cf52750e6490"}
  ```
- **SQL Evaluation (Default: `date_desc`):**
  ```sql
  WHERE (transactions.transaction_date, transactions.id) < ($1, $2)
  ORDER BY transactions.transaction_date DESC, transactions.id DESC
  LIMIT $3
  ```
- **Meta response:** Returns `cursor` (the base64 string for the last item) and `hasMore: boolean`. When on the last page, `cursor` is `null` and `hasMore` is `false`.

---

## 6. Transaction APIs (Data / Ledger & Manual Entry)

### 6.1 `GET /api/transactions`
Retrieves paginated, filtered transaction records from the ledger.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`, `viewer`.
- **Validation (Query parameters):**
  - `scope`: enum `['all', 'sales', 'purchase', 'expense']` (default: `'all'`).
  - `preset`: enum `['all', 'today', 'yesterday', '7d', '30d', 'mtd', 'custom']` (default: `'all'`).
  - `from`: string (ISO 8601 UTC or YYYY-MM-DD; required if `preset=custom`).
  - `to`: string (ISO 8601 UTC or YYYY-MM-DD; required if `preset=custom`).
  - `categoryId`: UUID (optional).
  - `status`: enum `['confirmed', 'draft', 'voided']` (default: `'confirmed'`).
  - `search`: string (max 100 chars, matches description, reference code, counterparty).
  - `sort`: enum `['date_desc', 'date_asc', 'amount_desc', 'amount_asc']` (default: `'date_desc'`).
  - `cursor`: base64 string (optional).
  - `limit`: integer min 1, max 100 (default: 25).

#### Response (`200 OK`):
```json
{
  "data": [
    {
      "id": "c39a04b1-889b-439d-b472-cf52750e6490",
      "referenceNumber": "TXN-2026-0042",
      "transactionType": "sale",
      "transactionDate": "2026-10-30T14:30:00.000Z",
      "description": "Counter Sale: Produce",
      "category": {
        "id": "7b0a701d-dcf3-4c9b-8395-d055e8486010",
        "name": "Vegetables"
      },
      "counterpartyName": "Walk-in Customer",
      "channel": "in-store",
      "paymentMethod": "upi",
      "currencyCode": "INR",
      "subtotalMinor": 60000,
      "discountMinor": 0,
      "taxTotalMinor": 3000,
      "totalMinor": 63000,
      "buyingCostTotalMinor": 38000,
      "grossProfitMinor": 22000,
      "grossMarginPercentage": 36.67,
      "status": "confirmed",
      "source": "manual",
      "version": 1,
      "createdAt": "2026-10-30T14:31:00.000Z",
      "updatedAt": "2026-10-30T14:31:00.000Z"
    }
  ],
  "meta": {
    "requestId": "b3e020d2-92ec-49ce-a8d9-3ecff2288344",
    "timestamp": "2026-10-31T07:30:00.000Z",
    "timeframe": {
      "preset": "30d",
      "timezone": "Asia/Kolkata",
      "localFrom": "2026-10-02T00:00:00.000+05:30",
      "localTo": "2026-10-31T23:59:59.999+05:30",
      "utcFrom": "2026-10-01T18:30:00.000Z",
      "utcTo": "2026-10-31T18:29:59.999Z"
    },
    "cursor": "eyJ0IjoiMjAyNi0xMC0zMFQxNDozMDowMC4wMDBaIiwiaWQiOiJjMzlhMDRiMS04ODliLTQzOWQtYjQ3Mi1jZjUyNzUwZTY0OTAifQ==",
    "hasMore": false
  }
}
```

#### Error Behavior:
- `401 UNAUTHENTICATED`: Token missing or invalid.
- `403 FORBIDDEN`: User lacks membership in the active business.
- `400 VALIDATION_ERROR`: Malformed cursor, invalid date range, or invalid scope.

---

### 6.2 `GET /api/transactions/:id`
Retrieves single transaction details with full line items.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`, `viewer`.

#### Response (`200 OK`):
```json
{
  "data": {
    "id": "c39a04b1-889b-439d-b472-cf52750e6490",
    "businessId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "referenceNumber": "TXN-2026-0042",
    "transactionType": "sale",
    "transactionDate": "2026-10-30T14:30:00.000Z",
    "description": "Counter Sale: Produce",
    "category": {
      "id": "7b0a701d-dcf3-4c9b-8395-d055e8486010",
      "name": "Vegetables"
    },
    "counterpartyName": "Walk-in Customer",
    "channel": "in-store",
    "paymentMethod": "upi",
    "currencyCode": "INR",
    "subtotalMinor": 60000,
    "discountMinor": 0,
    "taxTotalMinor": 3000,
    "totalMinor": 63000,
    "buyingCostTotalMinor": 38000,
    "grossProfitMinor": 22000,
    "grossMarginPercentage": 36.67,
    "status": "confirmed",
    "source": "manual",
    "version": 1,
    "items": [
      {
        "id": "f51c08a2-113b-417d-a192-dc203918a201",
        "lineNumber": 1,
        "itemName": "Organic Tomatoes",
        "quantity": 10.0,
        "unit": "kg",
        "unitSellingPriceMinor": 6000,
        "unitBuyingCostMinor": 3800,
        "lineSubtotalMinor": 60000,
        "lineDiscountMinor": 0,
        "lineTaxMinor": 3000,
        "lineTotalMinor": 63000
      }
    ],
    "createdAt": "2026-10-30T14:31:00.000Z",
    "updatedAt": "2026-10-30T14:31:00.000Z"
  },
  "meta": {
    "requestId": "a02f091c-92ec-49ce-a8d9-3ecff2288344"
  }
}
```

---

### 6.3 `POST /api/transactions`
Creates a transaction through the shared transaction service.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`.
- **Validation (Zod schema):**
  - `transactionType`: enum `['sale', 'purchase', 'expense']`.
  - `transactionDate`: ISO 8601 string.
  - `description`: string min 1, max 255.
  - `categoryId`: UUID (optional).
  - `counterpartyName`: string max 100 (optional).
  - `channel`: string max 50 (optional).
  - `paymentMethod`: enum `['cash', 'upi', 'card', 'bank_transfer', 'credit', 'other']`.
  - `currencyCode`: string length 3 (must match business currency).
  - `items`: array of line items (min 1 for sale and purchase).
    - `lineNumber`: integer >= 1.
    - `itemName`: string min 1, max 100.
    - `quantity`: number > 0.
    - `unit`: string min 1, max 20.
    - `unitSellingPriceMinor`: integer >= 0 (required for sale).
    - `unitBuyingCostMinor`: integer >= 0 (optional for sale; required for purchase).
    - `lineDiscountMinor`: integer >= 0 (default: 0).
    - `lineTaxMinor`: integer >= 0 (default: 0).
  - `source`: enum `['manual', 'voice', 'import']`.

#### Request (Sale Example):
```json
{
  "transactionType": "sale",
  "transactionDate": "2026-10-31T09:15:00.000Z",
  "description": "Counter Sale: Produce",
  "categoryId": "7b0a701d-dcf3-4c9b-8395-d055e8486010",
  "counterpartyName": "Walk-in Customer",
  "channel": "in-store",
  "paymentMethod": "upi",
  "currencyCode": "INR",
  "items": [
    {
      "lineNumber": 1,
      "itemName": "Organic Tomatoes",
      "quantity": 10.0,
      "unit": "kg",
      "unitSellingPriceMinor": 6000,
      "unitBuyingCostMinor": 3800,
      "lineDiscountMinor": 0,
      "lineTaxMinor": 3000
    }
  ],
  "source": "manual"
}
```

#### Shared Transaction Service Processing:
1. Recomputes all totals on the server. Rejects mismatched currencies.
2. For `sale`: `subtotalMinor = 60000`, `discountMinor = 0`, `taxTotalMinor = 3000`, `totalMinor = 63000`.  
   `buyingCostTotalMinor = 38000`, `grossProfitMinor = 22000` (Margin = 36.67%).
3. Generates human-readable `referenceNumber` (e.g., `TXN-2026-0043`).
4. Persists `transactions` and `transaction_items` atomically in a single PostgreSQL transaction.
5. Writes snapshot to `audit_logs` (`action = 'insert'`).

#### Response (`201 Created`): Returns created transaction record.
#### Error Behavior:
- `400 VALIDATION_ERROR`: Missing items, negative quantities, or invalid transaction type.
- `403 FORBIDDEN`: User has `viewer` role only.

---

### 6.4 `PATCH /api/transactions/:id`
Updates an existing transaction using optimistic concurrency.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`.
- **Validation:** Same rules as `POST /api/transactions`, plus required `version: integer`.
- **Concurrency control:** If `version` does not match the database `version`, rejects with `409 Conflict` (`CONFLICT`). Increments `version = version + 1` on success.
- **Auditability:** Writes `before_data` and `after_data` to `audit_logs`.

---

### 6.5 `DELETE /api/transactions/:id`
Performs an auditable soft deletion (`deleted_at = now()`).

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`.
- **Processing:** Sets `deleted_at = now()`, marks `status = 'voided'`, logs action to `audit_logs`. Hard deletion is prohibited.
- **Response (`200 OK`):** `{"data": {"id": "...", "deleted": true, "deletedAt": "..."}}`.

---

## 7. Scope-aware Dashboard APIs

### 7.1 `GET /api/dashboard`
Provides scope-aware aggregated analytics. The selected `scope` strictly alters the calculation definitions of KPI cards, charts, and insights in unison.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`, `viewer`.
- **Query parameters:**
  - `scope`: enum `['all', 'sales', 'purchase', 'expense']` (required).
  - `preset`: enum `['all', 'today', 'yesterday', '7d', '30d', 'mtd', 'custom']` (required).
  - `from`: string (required if `preset=custom`).
  - `to`: string (required if `preset=custom`).

### 7.2 Scope Behavior Matrix

| Metric / Component | Scope: `all` | Scope: `sales` | Scope: `purchase` | Scope: `expense` |
|---|---|---|---|---|
| **KPI Card 1** | **Sales Revenue** (`sales_revenue`) | **Sales Revenue** (`sales_revenue`) | **Total Purchases** (`total_purchases`) | **Operating Expenses** (`operating_expenses`) |
| **KPI Card 2** | **Gross Profit** (`gross_profit`) | **Gross Profit** (`gross_profit`) | **Procured Units** (`procured_units`) | **Top Expense Category** (`top_expense_category`) |
| **KPI Card 3** | **Operating Expenses** (`operating_expenses`) | **Gross Margin %** (`gross_margin_pct`) | **Active Suppliers** (`supplier_count`) | **Expense to Revenue %** (`expense_to_revenue_pct`) |
| **KPI Card 4** | **Net Profit** (`net_profit`) | **Avg Order Value** (`average_order_value`) | **Avg Purchase Value** (`average_purchase_value`) | **Avg Daily Expense** (`average_daily_expense`) |
| **KPI Card 5** | **Transaction Count** (`transaction_count`) | **Sales Count** (`sales_count`) | **Purchase Count** (`purchase_count`) | **Expense Count** (`expense_count`) |
| **Donut Chart** | Revenue by Category / Composition | Sales by Product / Category | Purchases by Supplier / Item | Expenses by Category |
| **Bar Chart** | Period Comparison (Sales vs Expenses) | Period-over-period Sales Revenue | Top Suppliers by Procurement Value | Top Expense Categories vs Prior Period |
| **Trend Chart** | Revenue vs Expenses Movement | Sales Revenue and Volume Trend | Procurement Cost Trend | Daily/Weekly Expense Trend |

#### Analytical Guardrails:
Peak hours, seasonal patterns, festival comparisons, and forecasting appear only when historical data sufficiency criteria are met (minimum 30–60 days of continuous data). Otherwise, a transparent `dataSufficiencyNote` is provided; numbers are never fabricated.

#### Response (`200 OK` — Example for `scope=all`):
```json
{
  "data": {
    "businessContext": {
      "businessId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "businessName": "Sri Lakshmi Traders",
      "currencyCode": "INR",
      "timezone": "Asia/Kolkata"
    },
    "selectedTimeframe": {
      "preset": "mtd",
      "timezone": "Asia/Kolkata",
      "localFrom": "2026-10-01T00:00:00.000+05:30",
      "localTo": "2026-10-31T23:59:59.999+05:30",
      "utcFrom": "2026-09-30T18:30:00.000Z",
      "utcTo": "2026-10-31T18:29:59.999Z"
    },
    "activeScope": "all",
    "kpis": [
      {
        "id": "sales_revenue",
        "label": "Sales Revenue",
        "valueMinor": 125000000,
        "formatted": "₹12,50,000",
        "changePercentage": 14.2,
        "trend": "up"
      },
      {
        "id": "gross_profit",
        "label": "Gross Profit",
        "valueMinor": 43750000,
        "formatted": "₹4,37,500",
        "marginPercentage": 35.0,
        "changePercentage": 8.5,
        "trend": "up"
      },
      {
        "id": "operating_expenses",
        "label": "Operating Expenses",
        "valueMinor": 21000000,
        "formatted": "₹2,10,000",
        "changePercentage": -2.1,
        "trend": "down"
      },
      {
        "id": "net_profit",
        "label": "Net Profit",
        "valueMinor": 22750000,
        "formatted": "₹2,27,500",
        "netMarginPercentage": 18.2,
        "changePercentage": 21.0,
        "trend": "up"
      },
      {
        "id": "transaction_count",
        "label": "Transaction Count",
        "count": 482,
        "changePercentage": 5.4,
        "trend": "up"
      }
    ],
    "charts": {
      "donutChart": {
        "title": "Category Contribution",
        "series": [
          { "label": "Vegetables", "valueMinor": 62500000, "percentage": 50.0 },
          { "label": "Fruits", "valueMinor": 37500000, "percentage": 30.0 },
          { "label": "Grains", "valueMinor": 25000000, "percentage": 20.0 }
        ]
      },
      "barChart": {
        "title": "Weekly Sales vs Expense Comparison",
        "categories": ["Week 1", "Week 2", "Week 3", "Week 4"],
        "series": [
          { "name": "Sales Revenue", "data": [280000, 310000, 320000, 340000] },
          { "name": "Operating Expenses", "data": [50000, 52000, 53000, 55000] }
        ]
      },
      "trendChart": {
        "title": "Revenue & Expense Movement",
        "timestamps": ["2026-10-01", "2026-10-10", "2026-10-20", "2026-10-30"],
        "series": [
          { "name": "Revenue", "data": [35000, 42000, 39000, 48000] },
          { "name": "Expenses", "data": [6500, 7000, 6800, 7200] }
        ]
      }
    },
    "insights": {
      "businessHealthSummary": {
        "status": "healthy",
        "summary": "Revenue up 14.2% MTD with strong gross margins (35.0%) and controlled opex."
      },
      "performanceMovement": {
        "primaryDriver": "Vegetables category volume surge (+18%)",
        "varianceAmountMinor": 15500000
      },
      "forecastAndOutlook": {
        "available": true,
        "projectedRevenueMinor": 138000000,
        "confidenceRangeMinor": [131000000, 145000000],
        "confidenceScore": 0.88,
        "dataSufficiencyNote": "Based on 60 days of verified transaction history."
      },
      "alertsAndCauses": [
        {
          "type": "opportunity",
          "severity": "medium",
          "title": "High Margin on Organic Tomatoes",
          "description": "Organic tomatoes achieved 42% gross margin compared to 35% category baseline."
        }
      ],
      "prioritizedInsights": [
        "Top 20% of products generate 72% of total gross profit (Pareto concentration).",
        "Operating expenses reduced by 2.1% due to lower utility charges."
      ]
    }
  },
  "meta": {
    "requestId": "d80b72c9-92ec-49ce-a8d9-3ecff2288344",
    "timestamp": "2026-10-31T07:30:00.000Z"
  }
}
```

---

## 8. Log Entry voice APIs

### 8.1 `POST /api/entry/transcribe`
Transcribes spoken user audio into text using **Meta Muse Voice Transcribe 1.0**.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`.
- **Rate Limit:** 20 req/min per user.
- **Provider:** Meta API (`Meta Muse Voice Transcribe 1.0`).
- **Input:** `multipart/form-data` with `audio` file (`audio/webm`, `audio/wav`, `audio/mp4`, max 10MB).
- **Processing:** Validates mime type and payload size. Streams audio buffer to Meta Voice Transcribe. Ephemeral audio buffer is purged from memory immediately following completion.

#### Response (`200 OK`):
```json
{
  "data": {
    "transcript": "Sold 25 kilograms of onions for 1250 rupees cash, buying cost was 800 rupees.",
    "detectedLanguage": "en-IN",
    "durationSeconds": 4.2
  },
  "meta": {
    "requestId": "e12a04b1-889b-439d-b472-cf52750e6490"
  }
}
```

---

### 8.2 `POST /api/entry/extract`
Transforms transcript text into a structured transaction draft using **Muse Spark Contributor** via the **Meta API**.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`.
- **Rate Limit:** 30 req/min per business.
- **Provider:** Meta API (Muse Spark Contributor, `META_EXTRACTION_MODEL_ID`).
- **Constraint:** Access is via Meta API; **never send raw audio to the extractor**. Input is strictly transcript text.
- **Validation (Request body):**
  - `transcript`: string min 3, max 2000 chars.

#### Request:
```json
{
  "transcript": "Sold 25 kilograms of onions for 1250 rupees cash, buying cost was 800 rupees."
}
```

#### Processing & Recalculation:
Server receives structured JSON from Contributor, validates proposed fields against business currency (`INR`) and active categories, and recalculates line totals and profit margins before returning the draft to the user for review.

#### Response (`200 OK` — Draft Preview):
```json
{
  "data": {
    "proposedTransaction": {
      "transactionType": "sale",
      "transactionDate": "2026-10-31T07:30:00.000Z",
      "description": "Voice Entry: Onions sale",
      "categorySuggestion": "Vegetables",
      "counterpartyName": "Cash Customer",
      "currencyCode": "INR",
      "paymentMethod": "cash",
      "channel": "in-store",
      "items": [
        {
          "lineNumber": 1,
          "itemName": "Onions",
          "quantity": 25.0,
          "unit": "kg",
          "unitSellingPriceMinor": 5000,
          "unitBuyingCostMinor": 3200,
          "lineSubtotalMinor": 125000,
          "lineDiscountMinor": 0,
          "lineTaxMinor": 0,
          "lineTotalMinor": 125000
        }
      ],
      "subtotalMinor": 125000,
      "discountMinor": 0,
      "taxTotalMinor": 0,
      "totalMinor": 125000,
      "buyingCostTotalMinor": 80000,
      "grossProfitMinor": 45000,
      "grossMarginPercentage": 36.0
    },
    "confidence": 0.94,
    "reviewRequired": true,
    "clarificationsNeeded": []
  },
  "meta": {
    "requestId": "f89c04b1-889b-439d-b472-cf52750e6490"
  }
}
```
*Draft transactions are never committed directly to Supabase. The user must review, edit if necessary, and explicitly confirm via `POST /api/transactions`.*

---

## 9. COO Copilot APIs

### 9.1 `POST /api/copilot/chat`
Conversational decision intelligence with Server-Sent Events (SSE) streaming and multi-provider failover.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`, `viewer`.
- **Rate Limit:** 30 req/min per business.

#### Runtime Model Fallback Order:
1. **Primary:** Meta Muse Spark 1.3 Contributor (Provider: Meta API)
2. **Fallback 1:** Muse Spark Open 1026 (Provider: Baseten — $100 credit)
3. **Fallback 2:** Muse Glimmer 30B (Provider: Fireworks — $1 credit)

#### Request:
```json
{
  "sessionId": "a54fd308-4d57-41b2-8419-f018e6921319",
  "message": "Why did our gross profit margin drop in the last 7 days?",
  "activeScope": "sales",
  "activePreset": "7d"
}
```

#### Server Orchestration & Failover Lifecycle:
1. Authenticates session and validates business membership.
2. Performs automated redaction on `message` (scrubs PAN, account numbers, tokens, and tax IDs).
3. Queries Supabase to construct deterministic financial evidence (verified margin numbers, category variances, pricing shifts).
4. Attempts invocation with **Primary (Meta API — Meta Muse Spark 1.3 Contributor)**.
5. **Pre-token failover:** If Meta API fails (timeout > 8000ms, 5xx status, connection drop, rate limit) **before the first token is sent to the client**, the server automatically retries with **Fallback 1 (Baseten — Muse Spark Open 1026)**.
6. If Baseten fails before the first token, retries with **Fallback 2 (Fireworks — Muse Glimmer 30B)**.
7. **Interrupted stream rule:** If an error occurs **after** tokens have already been sent to the client, the server **never** splices another provider's tokens into the existing output. It emits `event: error` (`code: "STREAM_INTERRUPTED"`, `retryable: true`) and terminates cleanly.
8. Writes prompt, resolved intent, evidence references, and model metrics into `copilot_intent_logs`.

#### SSE Stream Events:
- `event: message_start`  
  `data: {"messageId": "...", "provider": "meta", "model": "Muse Spark 1.3 Contributor"}`
- `event: token`  
  `data: {"delta": "Based on verified ledger data, gross margin declined 4.2%..."}`
- `event: evidence_reference`  
  `data: {"kpis": ["gross_profit_margin"], "topImpactItem": "Cooking Oil"}`
- `event: message_complete`  
  `data: {"totalTokens": 340, "latencyMs": 1150, "finishReason": "stop"}`
- `event: error` *(on streaming failure)*  
  `data: {"code": "STREAM_INTERRUPTED", "message": "Upstream connection dropped mid-stream. Please retry.", "retryable": true}`

---

### 9.2 Copilot Question Logging, Redaction & Retention
Consistent with `DATABASE.md` (`copilot_intent_logs`):
- **Redaction:** Before persisting question text, the server applies automated regex scrubbing to replace sensitive tokens, credit card numbers, passwords, and tax IDs (GSTIN/EIN) with `[REDACTED]`.
- **Logged fields:** `business_id`, `user_id`, `session_id`, `message_id`, scrubbed `question_text`, `resolved_intent`, `resolved_scope`, `resolved_timeframe`, `evidence_reference`, `provider`, `model`, `validation_status`, `error_code`, `latency_ms`.
- **Retention policy:** Retained for 90 days for diagnostic and answer-quality analysis. Purged immediately upon user/business tenant deletion requests.

---

### 9.3 `POST /api/copilot/decision`
Generates three high-priority Executive Directives for business operators.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`, `viewer`.
- **Provider:** Meta Muse Spark 1.3 Contributor (Meta API) with Baseten fallback.
- **Caching:** Directives are cached by business ID and data version; regenerated only on meaningful ledger mutations or explicit refresh.

#### Response (`200 OK`):
```json
{
  "data": {
    "directives": [
      {
        "priority": 1,
        "title": "Address Cooking Oil Margin Compression",
        "category": "pricing",
        "whatChanged": "Supplier cost increased 12% on Oct 24 without a corresponding retail price update.",
        "evidence": "COGS up ₹14,200; gross margin fell from 28% to 16%.",
        "whyItMatters": "Cooking oil represents 18% of weekly revenue.",
        "recommendedAction": "Increase shelf price from ₹165 to ₹182 per litre or negotiate volume discount.",
        "expectedImpact": "Restores approximately ₹18,000 in monthly net profit.",
        "confidence": 0.92,
        "dataLimitations": "Assumes volume elasticity remains within -0.3 based on 30-day trend."
      },
      {
        "priority": 2,
        "title": "Capitalize on Weekend Peak Hours",
        "category": "operations",
        "whatChanged": "Saturday 5 PM - 8 PM accounts for 34% of weekly tomato volume.",
        "evidence": "220 kg sold during peak windows with 3 stock-out incidents.",
        "whyItMatters": "Estimated ₹8,500 in lost sales due to stockouts.",
        "recommendedAction": "Pre-pack stock and adjust supplier delivery schedule to Friday evening.",
        "expectedImpact": "+10-15% weekend produce throughput.",
        "confidence": 0.86,
        "dataLimitations": "Valid for seasonal dry weather period."
      },
      {
        "priority": 3,
        "title": "Renegotiate Packaging Expense",
        "category": "expense",
        "whatChanged": "Packaging expense increased 22% month-over-month.",
        "evidence": "Unit box cost jumped from ₹12 to ₹15.",
        "whyItMatters": "Opex increased by ₹6,000 without volume increase.",
        "recommendedAction": "Consolidate purchasing with primary supplier to secure tier-1 rates.",
        "expectedImpact": "Saves ₹5,000 monthly.",
        "confidence": 0.95,
        "dataLimitations": "Subject to supplier minimum order quantity."
      }
    ],
    "generatedAt": "2026-10-31T07:30:00.000Z"
  },
  "meta": {
    "requestId": "f10b72c9-92ec-49ce-a8d9-3ecff2288344"
  }
}
```

---

### 9.4 `POST /api/copilot/voice/transcribe`
Transcribes spoken user questions for Copilot using **Meta Muse Voice Transcribe 1.0** (Meta API).

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`, `viewer`.
- **Response (`200 OK`):** `{"data": {"transcript": "Why did gross profit drop?", "durationSeconds": 2.1}}`.

---

### 9.5 `POST /api/copilot/voice/speak`
Synthesizes spoken audio for Copilot answers using **Meta MMS TTS** (`facebook/mms-tts-eng`) hosted on a separately provisioned inference endpoint.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`, `viewer`.
- **Rate Limit:** 30 req/min per business.
- **Checkpoint:** `facebook/mms-tts-eng` (English).
- **Validation (Body):**
  - `text`: string min 1, max 2000 chars.
  - `language`: string length 2 (default: `'en'`).

#### Request:
```json
{
  "text": "Gross margin declined by 4.2% this week primarily due to an unadjusted supplier price increase on Cooking Oil.",
  "language": "en"
}
```

#### Response (`200 OK`):
Binary audio stream (`audio/mpeg` or `audio/wav`) for browser playback.

---

### 9.6 `GET /api/copilot/history`
Retrieves paginated chat sessions and messages for the authorized user and business.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`, `editor`, `viewer`.
- **Query parameters:** `sessionId` (optional), `limit` (default: 50).

---

## 10. Business Profile, Settings & Tax APIs

### 10.1 `GET /api/business/profile` & `PATCH /api/business/profile`
- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `GET`: `owner`, `admin`, `editor`, `viewer`. `PATCH`: `owner`, `admin`.
- **Fields:** `name`, `legalName`, `industry`, `businessType`, `countryCode`, `regionCode`, `businessHours`, `workingDays`.

### 10.2 `GET /api/business/settings` & `PATCH /api/business/settings`
- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `GET`: `owner`, `admin`, `editor`, `viewer`. `PATCH`: `owner`, `admin`.
- **Fields:** `themePreference`, `dateFormat`, `numberFormat`, `voiceInputLanguage`, `voiceOutputEnabled`, `taxJurisdictionCode`, `isGstRegistered`, `taxConfig`.
- **India GST Validation:** When `taxJurisdictionCode = 'IN'`, server validates `isGstRegistered`. If false, GSTIN and tax fields are disabled. If true, standard GSTIN format is verified.
- **Historical Currency Protection:** Updating `currencyCode` changes default formatting for new records; existing records in `transactions` retain their original immutable `currency_code`.

### 10.3 Tax Rule Endpoints
- `GET /api/tax/jurisdictions`: Lists supported jurisdictions (`IN`, `US`, `GB`, `AE`, `SG`).
- `GET /api/tax/rules?jurisdiction=IN`: Returns active, versioned tax rates and effective dates.
- `POST /api/tax/configuration/validate`: Verifies business tax settings against current jurisdiction rules.

---

## 11. Categories APIs

- `GET /api/categories?type=sale|purchase|expense`
  - **Authorization:** `owner`, `admin`, `editor`, `viewer`.
- `POST /api/categories`
  - **Authorization:** `owner`, `admin`, `editor`.
  - **Validation:** `name` (1–50 chars), `transactionType` (`sale`, `purchase`, `expense`), optional `parentId`.
- `PATCH /api/categories/:id`
  - **Authorization:** `owner`, `admin`, `editor`.
- `DELETE /api/categories/:id`
  - **Authorization:** `owner`, `admin`. Sets `is_active = false` if transactions are associated.

---

## 12. Demo isolation APIs

### 12.1 `GET /api/demo/options`
Returns available demo datasets:
1. `meta_demo`: Curated retail FMCG business with seasonal and peak-hour patterns.
2. `sample_business_2`: Alternative business with distinct cost and margin structures.

### 12.2 `POST /api/demo/session`
Attaches or provisions an isolated demo business sandbox for the calling user.
- **Guaranteed Isolation:** Demo mutations are strictly scoped to the user's isolated demo business ID. Demo users never view or overwrite other demo users' data.
- **Request:** `{"datasetKey": "meta_demo"}`.
- **Response (`201 Created`):** Returns demo session token and isolated business context.

### 12.3 `POST /api/demo/reset`
- **Authorization:** Calling user in demo mode.
- **Processing:** Resets only the calling user's isolated demo business records back to pristine template state. Does not affect any other user.

---

## 13. Audit logs API

### 13.1 `GET /api/audit-logs`
Retrieves change logs for transaction mutations, voids, and settings updates.

- **Authentication:** Required (`Bearer <jwt>`).
- **Authorization:** `owner`, `admin`.
- **Query parameters:** `entityType` (`transaction`, `category`, `settings`), `limit` (default: 50), `cursor`.
- **Response:** Array of immutable audit records containing `action`, `actorUserId`, `entityType`, `entityId`, `beforeData`, `afterData`, and `requestId`.
