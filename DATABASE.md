# AI Powered COO — Database Design

**Status:** Phase 0 proposal; confirm against the actual UI and transaction contracts before migrations.

## 1. Database principles

- PostgreSQL via Supabase.
- Every customer-owned record is tenant-scoped by `business_id` directly or through a parent relation.
- RLS is enabled on every tenant-owned table.
- User identity comes from Supabase Auth (`auth.uid()`), not client-supplied user IDs.
- Store timestamps in UTC; report using the business timezone.
- Store money with decimal-safe representation. Recommended: integer minor units plus ISO currency code, or PostgreSQL `numeric` with a documented precision strategy. Do not use floating point.
- Use migrations as the source of schema changes.
- Prefer soft deletion for important financial records, with audit history; hard deletion only under explicit retention/privacy policy.

## 2. Entity relationship overview

```text
auth.users
   |
 profiles
   |
 business_members ---- businesses
                          |
       +------------------+------------------+
       |                  |                  |
 transactions         categories       business_settings
       |
 transaction_items

 businesses ---- chat_sessions ---- chat_messages
 businesses ---- copilot_intent_logs
 businesses ---- audit_logs
 businesses ---- demo_dataset_assignments (optional)
```

## 3. Proposed tables

### 3.1 `profiles`
- `id uuid primary key references auth.users(id)`
- `display_name text`
- `avatar_url text null`
- `preferred_locale text`
- `created_at timestamptz`
- `updated_at timestamptz`

### 3.2 `businesses`
- `id uuid primary key`
- `name text not null`
- `legal_name text null`
- `logo_url text null`
- `industry text null`
- `business_type text null`
- `country_code char(2) not null`
- `region_code text null`
- `currency_code char(3) not null`
- `timezone text not null`
- `locale text not null`
- `financial_year_start_month smallint`
- `is_demo boolean not null default false`
- `demo_dataset_key text null`
- `created_at timestamptz`
- `updated_at timestamptz`

### 3.3 `business_members`
- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `user_id uuid not null references profiles(id)`
- `role text not null` — owner, admin, editor, viewer (constrain with enum/check)
- `status text not null`
- `created_at timestamptz`
- Unique constraint on `(business_id, user_id)`.

### 3.4 `business_settings`
- `business_id uuid primary key references businesses(id)`
- `theme_preference text` — system, light, dark (user preference may instead live in profiles)
- `date_format text`
- `number_format text`
- `voice_input_language text`
- `voice_output_language text`
- `business_hours jsonb`
- `working_days smallint[]`
- `tax_jurisdiction_code text`
- `tax_registration_status text`
- `tax_registration_number_encrypted text null` — only if truly required; consider a dedicated protected secret store instead
- `tax_config jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Do not store sensitive tax identifiers unless needed. Restrict access and avoid returning them to ordinary UI/API responses.

### 3.5 `categories`
- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `transaction_type text not null` — sale, purchase, expense
- `name text not null`
- `parent_id uuid null references categories(id)`
- `is_active boolean not null default true`
- `created_at timestamptz`
- Unique active category name per business/type as appropriate.

### 3.6 `transactions`
Primary persisted transaction header and the table shown in the Data/Ledger tab.

- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `transaction_type text not null` — sale, purchase, expense
- `transaction_date timestamptz not null`
- `description text`
- `category_id uuid null references categories(id)`
- `counterparty_name text null` — customer/supplier/payee as appropriate
- `channel text null`
- `payment_method text null`
- `currency_code char(3) not null`
- `subtotal_minor bigint`
- `discount_minor bigint`
- `tax_total_minor bigint`
- `total_minor bigint not null`
- `buying_cost_total_minor bigint null` — sale COGS when relevant and known; do not use for standalone purchase total
- `gross_profit_minor bigint null` — derived/snapshotted only under documented policy; canonical analytics should recompute from validated line facts
- `status text not null` — draft, confirmed, voided (or approved state model)
- `source text not null` — manual, voice, import, integration
- `created_by uuid references profiles(id)`
- `updated_by uuid references profiles(id)`
- `created_at timestamptz`
- `updated_at timestamptz`
- `deleted_at timestamptz null`
- `version integer not null default 1`

Add constraints for valid type/status, nonnegative amounts where appropriate, and required fields by transaction type. Do not force every business workflow into one generic amount field.

### 3.7 `transaction_items`
- `id uuid primary key`
- `transaction_id uuid not null references transactions(id)`
- `business_id uuid not null references businesses(id)`
- `line_number integer not null`
- `item_name text not null`
- `product_id uuid null` — future product catalogue
- `quantity numeric(18,4) null`
- `unit text null`
- `unit_selling_price_minor bigint null`
- `unit_buying_cost_minor bigint null`
- `line_discount_minor bigint`
- `line_tax_minor bigint`
- `line_total_minor bigint not null`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

A future `products` table and inventory module can be added without blocking the initial transaction model.

### 3.8 `chat_sessions`
- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `user_id uuid not null references profiles(id)`
- `title text`
- `created_at timestamptz`
- `updated_at timestamptz`
- `archived_at timestamptz null`

### 3.9 `chat_messages`
- `id uuid primary key`
- `session_id uuid not null references chat_sessions(id)`
- `business_id uuid not null references businesses(id)`
- `role text not null` — user, assistant, system metadata (do not expose system prompts)
- `content text not null`
- `provider text null`
- `model text null`
- `status text not null`
- `usage_input_tokens integer null`
- `usage_output_tokens integer null`
- `latency_ms integer null`
- `created_at timestamptz`

### 3.10 `copilot_intent_logs`
- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `user_id uuid references profiles(id)`
- `session_id uuid null references chat_sessions(id)`
- `message_id uuid null references chat_messages(id)`
- `question_text text`
- `resolved_intent text`
- `resolved_scope jsonb`
- `resolved_timeframe jsonb`
- `evidence_reference jsonb`
- `provider text`
- `model text`
- `validation_status text`
- `error_code text`
- `latency_ms integer`
- `created_at timestamptz`

Avoid logging unnecessary sensitive content. Define retention and access policy.

### 3.11 `audit_logs`
- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `actor_user_id uuid null references profiles(id)`
- `action text not null`
- `entity_type text not null`
- `entity_id uuid null`
- `before_data jsonb null`
- `after_data jsonb null`
- `request_id text null`
- `created_at timestamptz`

Do not store secrets or sensitive fields in audit snapshots.

### 3.12 Tax configuration tables (recommended extension)
Use versioned tables rather than relying only on opaque JSON for rules:
- `tax_jurisdictions`: country/region identifiers and display names.
- `tax_rule_sets`: jurisdiction, version, effective_from, effective_to, status, source/reference and review metadata.
- `tax_rates`: rule set, tax code, rate, applicability conditions and inclusive/exclusive behaviour.
- `business_tax_registrations`: business, jurisdiction, registration status and protected registration reference if needed.

Tax rules must be reviewed, versioned and effective-dated. Country selection may suggest a framework but must not assume registration or tax applicability.

## 4. Demo data

Provide two isolated demo business datasets:
1. Required Meta demo dataset.
2. A second distinct sample business dataset.

Recommended approach:
- Seed demo businesses and transactions using migrations or a controlled seed script.
- Mark demo businesses with `is_demo = true` and a stable `demo_dataset_key`.
- Use dedicated demo access or isolated demo users; do not give demo sessions access to customer tenants.
- Clearly label demo mode in the UI.
- Provide a reset mechanism that only resets the selected demo tenant.
- Do not copy real sponsor/customer confidential data into the demo dataset unless explicitly licensed and approved.

## 5. RLS and authorization requirements

Enable RLS on all tenant-owned tables:
- businesses
- business_members
- business_settings
- categories
- transactions
- transaction_items
- chat_sessions
- chat_messages
- copilot_intent_logs
- audit_logs
- tax registration/configuration tables as appropriate

Policy intent:
- A user can read a business only if they are an active member.
- A user can read/update business data only within businesses where they have the relevant role.
- Editors can create/update transactions; viewers cannot.
- Deletion requires an allowed role and must use the approved delete/void policy.
- Chat sessions/messages and intent logs are scoped to the authorized business and user/member policy.
- Demo access is restricted to its assigned demo tenant.
- Never rely on UI hiding a button as authorization.

Use server-side authorization checks in addition to RLS. Test cross-tenant access attempts explicitly.

## 6. Indexes and constraints

At minimum consider:
- `transactions (business_id, transaction_date desc)`
- `transactions (business_id, transaction_type, transaction_date desc)`
- `transactions (business_id, category_id, transaction_date desc)`
- `transaction_items (business_id, transaction_id)`
- `business_members (user_id, status)`
- `business_members (business_id, user_id)`
- `chat_sessions (business_id, user_id, updated_at desc)`
- `chat_messages (session_id, created_at)`
- `copilot_intent_logs (business_id, created_at desc)`

Add uniqueness, foreign-key, status/type and money constraints. Validate query plans as data grows.

## 7. Migration sequence

1. Profiles and businesses.
2. Business memberships and settings.
3. Categories.
4. Transactions and transaction items.
5. Tax jurisdiction/configuration foundations.
6. Chat sessions and messages.
7. Copilot intent logs.
8. Audit logs.
9. Indexes, constraints, RLS policies and seed/demo data.

The exact migration order may be adjusted to satisfy foreign-key dependencies. Every migration must be reviewed and tested before production.
