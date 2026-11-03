# AI Powered COO — Database Design

**Status:** Finalized Phase 0 baseline  
**Database engine:** Supabase PostgreSQL  
**Multi-tenancy:** Business-scoped with Row Level Security (RLS) on all tenant tables  

---

## 1. Database principles

1. **Supabase PostgreSQL as single source of truth:** All operational, analytical, and conversational data originates from and persists in Supabase.
2. **Tenant isolation by `business_id`:** Every customer-owned record is explicitly scoped by `business_id` directly or through a parent foreign key.
3. **Database-enforced Row Level Security (RLS):** Every tenant table enforces PostgreSQL RLS policies against `auth.uid()`, guaranteeing multi-tenant safety.
4. **Isolated demo datasets:** Two completely isolated demo datasets (the **Meta demo dataset** and a **second separate demo dataset**) are isolated from live customer accounts and isolated across demo users to prevent data collisions.
5. **UTC storage, timezone-aware presentation:** All timestamps are stored in UTC (`timestamptz`). Filtering, aggregations, and presentations use the business-configured IANA timezone.
6. **Decimal-safe money handling:** Money is stored as integer minor units (`bigint`, e.g., cents, paise) paired with an ISO 4217 currency code (`char(3)`). Floating-point arithmetic is prohibited for financial figures.
7. **Strict COGS separation:** A sale transaction's Cost of Goods Sold (`buying_cost_total_minor`) reflects the inventory cost of items sold, whereas a standalone stock acquisition is a distinct `purchase` transaction. These concepts are never merged.
8. **Soft deletion and auditability:** Critical business records utilize soft deletion (`deleted_at timestamptz null`) and audit logging (`audit_logs`) to ensure non-destructive operations and full traceability.

---

## 2. Entity relationship overview

```text
auth.users (Supabase Auth)
    |
 profiles
    |
 business_members <====> businesses
                            |
       +--------------------+--------------------+--------------------+
       |                    |                    |                    |
  categories       business_settings       transactions          tax_rule_sets
                                                 |                    |
                                         transaction_items       tax_rates
                                                 |
                            +--------------------+--------------------+
                            |                                         |
                      chat_sessions                               audit_logs
                            |
                      chat_messages
                            |
                   copilot_intent_logs
```

---

## 3. Core tables specification

### 3.1 `profiles`
User identity metadata linked to Supabase Auth.
```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text null,
  preferred_locale text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 3.2 `businesses`
The core tenant entity representing an operating company.
```sql
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text null,
  logo_url text null,
  industry text null,
  business_type text null,               -- e.g., retail, f&b, services, manufacturing
  country_code char(2) not null,         -- ISO 3166-1 alpha-2 (e.g., 'IN', 'US')
  region_code text null,                 -- State / Province code (e.g., 'KA', 'CA')
  currency_code char(3) not null,        -- ISO 4217 (e.g., 'INR', 'USD')
  timezone text not null,                -- IANA timezone (e.g., 'Asia/Kolkata')
  locale text not null default 'en-IN',  -- Formatting locale
  financial_year_start_month smallint not null default 4, -- 1-12 (e.g., 4 for April)
  is_demo boolean not null default false,
  demo_dataset_key text null,            -- 'meta_demo' | 'sample_business_2' | null
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 3.3 `business_members`
User membership and role assignments per business.
```sql
create table business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_business_member unique (business_id, user_id)
);
```

### 3.4 `business_settings`
Configurable operational, regional, and tax preferences.
```sql
create table business_settings (
  business_id uuid primary key references businesses(id) on delete cascade,
  theme_preference text not null default 'system' check (theme_preference in ('system', 'light', 'dark')),
  date_format text not null default 'DD/MM/YYYY',
  number_format text not null default 'en-IN',
  voice_input_language text not null default 'en-IN',
  voice_output_enabled boolean not null default true,
  voice_output_voice text not null default 'facebook/mms-tts-eng',
  business_hours jsonb null,             -- Opening and closing hours per weekday
  working_days smallint[] not null default '{1,2,3,4,5,6}', -- 0=Sun..6=Sat
  tax_jurisdiction_code text not null default 'IN',
  is_gst_registered boolean not null default false,         -- Explicit check for India
  tax_registration_number_encrypted text null,              -- Encrypted GSTIN / EIN
  tax_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 3.5 `categories`
Dynamic operational categories for classification.
```sql
create table categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('sale', 'purchase', 'expense')),
  name text not null,
  parent_id uuid null references categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_category_name_per_type unique (business_id, transaction_type, name)
);
```

### 3.6 `transactions`
Primary persisted transaction header; the core ledger record.
```sql
create table transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  reference_number text not null,        -- Human-readable unique voucher code (e.g., 'TXN-2026-0001')
  transaction_type text not null check (transaction_type in ('sale', 'purchase', 'expense')),
  transaction_date timestamptz not null,
  description text null,
  category_id uuid null references categories(id) on delete restrict,
  counterparty_name text null,           -- Customer name (sale), Supplier (purchase), Payee (expense)
  channel text null,                     -- e.g., 'in-store', 'online', 'wholesale'
  payment_method text null,              -- e.g., 'cash', 'upi', 'card', 'bank_transfer'
  currency_code char(3) not null,        -- Immutable ISO currency code of the transaction
  subtotal_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  tax_total_minor bigint not null default 0,
  total_minor bigint not null,           -- Selling total (sale), Purchase total, or Expense total
  buying_cost_total_minor bigint null,   -- Sale COGS only; null for purchase/expense
  gross_profit_minor bigint null,        -- Calculated sale margin snapshot: (subtotal - discount) - buying_cost
  status text not null default 'confirmed' check (status in ('draft', 'confirmed', 'voided')),
  source text not null default 'manual' check (source in ('manual', 'voice', 'import')),
  created_by uuid null references profiles(id) on delete set null,
  updated_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,           -- Soft deletion marker
  version integer not null default 1,    -- Optimistic locking concurrency check
  constraint chk_positive_total check (total_minor >= 0),
  constraint uq_business_reference unique (business_id, reference_number)
);
```

### 3.7 `transaction_items`
Granular line items associated with transaction headers.
```sql
create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  line_number integer not null,
  item_name text not null,
  quantity numeric(18,4) null,
  unit text null,                        -- e.g., 'kg', 'pcs', 'litres', 'hours'
  unit_selling_price_minor bigint null,  -- For sales
  unit_buying_cost_minor bigint null,    -- Unit purchase price or Unit COGS
  line_subtotal_minor bigint not null default 0,
  line_discount_minor bigint not null default 0,
  line_tax_minor bigint not null default 0,
  line_total_minor bigint not null,
  metadata jsonb null,                   -- Additional attributes (HSN code, barcode)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_transaction_line unique (transaction_id, line_number)
);
```

### 3.8 `chat_sessions`
Conversational threads for COO Copilot.
```sql
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'New Conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);
```

### 3.9 `chat_messages`
Individual message records in a Copilot conversation.
```sql
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  provider text null,                    -- 'meta' | 'baseten' | 'fireworks'
  model text null,                       -- e.g., 'Muse Spark 1.3 Contributor', 'Muse Spark Open 1026'
  status text not null default 'completed' check (status in ('pending', 'streaming', 'completed', 'failed', 'interrupted')),
  usage_input_tokens integer null,
  usage_output_tokens integer null,
  latency_ms integer null,
  created_at timestamptz not null default now()
);
```

### 3.10 `copilot_intent_logs`
Diagnostic logs capturing question understanding, resolved scope, and evidence links to diagnose incorrect answers without storing sensitive user prompts.
```sql
create table copilot_intent_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  session_id uuid null references chat_sessions(id) on delete cascade,
  message_id uuid null references chat_messages(id) on delete cascade,
  question_text text not null,
  resolved_intent text not null,         -- e.g., 'revenue_inquiry', 'margin_root_cause', 'forecast'
  resolved_scope jsonb not null,         -- Activity scope, product/category filters
  resolved_timeframe jsonb not null,     -- Calculated UTC start/end range
  evidence_reference jsonb not null,     -- Deterministic KPIs passed to LLM
  provider text not null,                -- 'meta' | 'baseten' | 'fireworks'
  model text not null,
  validation_status text not null,       -- 'passed' | 'repaired' | 'failed'
  error_code text null,
  latency_ms integer not null,
  created_at timestamptz not null default now()
);
```

### 3.11 `audit_logs`
Immutable change logs for auditing transactional edits and deletions.
```sql
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  actor_user_id uuid null references profiles(id) on delete set null,
  action text not null,                  -- 'insert' | 'update' | 'void' | 'delete'
  entity_type text not null,             -- 'transaction' | 'category' | 'settings'
  entity_id uuid null,
  before_data jsonb null,
  after_data jsonb null,
  request_id text null,
  created_at timestamptz not null default now()
);
```

---

## 4. Demo dataset architecture and multi-user isolation

To guarantee that demo users experience fully functional workflows without data collisions:

1. **Two distinct demo templates:**
   - **Template 1 (`meta_demo`):** High-volume retail & FMCG dataset containing seasonal patterns, peak-hour distributions, and multi-category transactions tailored for COO analysis.
   - **Template 2 (`sample_business_2`):** Specialty boutique/service dataset with high gross margin variance and distinct operational overhead.
2. **Per-user demo tenancy:**
   - When a user logs in via demo mode, the application instantiates an isolated demo business record linked specifically to that demo user (`is_demo = true`, `demo_dataset_key = 'meta_demo'`, assigned to user's ephemeral or demo UID).
   - Alternatively, a session-level tenant clone is spawned from the seed template.
   - **Strict isolation guarantee:** Users only read and write to their own isolated demo business ID. Cross-demo pollution or data collisions between concurrent reviewers are impossible.
3. **Resettable demo data:**
   - A single-click "Reset Demo Data" action flushes the calling user's demo tenant records and re-seeds from the template without impacting any other tenant.

---

## 5. Row Level Security (RLS) policies

RLS is enabled on every table containing a `business_id`. A helper function verifies active membership:

```sql
create or replace function is_business_member(b_id uuid)
returns boolean security definer set search_path = public as $$
  select exists (
    select 1 from business_members
    where business_id = b_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$ language sql stable;

create or replace function get_business_role(b_id uuid)
returns text security definer set search_path = public as $$
  select role from business_members
  where business_id = b_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1;
$$ language sql stable;
```

### 5.1 Complete RLS Coverage Across Tables

Every table enforces Row Level Security:

1. **`profiles`:**
   ```sql
   alter table profiles enable row level security;
   create policy "Users can view and edit their own profile"
     on profiles for all using (auth.uid() = id);
   ```

2. **`businesses`:**
   ```sql
   alter table businesses enable row level security;
   create policy "Members can view their businesses"
     on businesses for select using (is_business_member(id));
   create policy "Owners and admins can update business profile"
     on businesses for update using (is_business_member(id) and get_business_role(id) in ('owner', 'admin'));
   ```

3. **`business_members`:**
   ```sql
   alter table business_members enable row level security;
   create policy "Members can view membership list"
     on business_members for select using (is_business_member(business_id));
   create policy "Owners and admins can manage memberships"
     on business_members for all using (is_business_member(business_id) and get_business_role(business_id) in ('owner', 'admin'));
   ```

4. **`business_settings`:**
   ```sql
   alter table business_settings enable row level security;
   create policy "Members can view business settings"
     on business_settings for select using (is_business_member(business_id));
   create policy "Owners and admins can update settings"
     on business_settings for update using (is_business_member(business_id) and get_business_role(business_id) in ('owner', 'admin'));
   ```

5. **`categories`:**
   ```sql
   alter table categories enable row level security;
   create policy "Members can view active categories"
     on categories for select using (is_business_member(business_id) and is_active = true);
   create policy "Editors, admins, and owners can manage categories"
     on categories for all using (is_business_member(business_id) and get_business_role(business_id) in ('owner', 'admin', 'editor'));
   ```

6. **`transactions` & `transaction_items`:**
   ```sql
   alter table transactions enable row level security;
   create policy "Members can view non-deleted transactions"
     on transactions for select using (is_business_member(business_id) and deleted_at is null);
   create policy "Editors, admins, and owners can insert transactions"
     on transactions for insert with check (is_business_member(business_id) and get_business_role(business_id) in ('owner', 'admin', 'editor'));
   create policy "Editors, admins, and owners can update transactions"
     on transactions for update using (is_business_member(business_id) and get_business_role(business_id) in ('owner', 'admin', 'editor'));

   alter table transaction_items enable row level security;
   create policy "Members can view transaction items"
     on transaction_items for select using (is_business_member(business_id));
   create policy "Editors, admins, and owners can manage items"
     on transaction_items for all using (is_business_member(business_id) and get_business_role(business_id) in ('owner', 'admin', 'editor'));
   ```

7. **`chat_sessions` & `chat_messages`:**
   ```sql
   alter table chat_sessions enable row level security;
   create policy "Users can view and manage their chat sessions"
     on chat_sessions for all using (is_business_member(business_id) and user_id = auth.uid());

   alter table chat_messages enable row level security;
   create policy "Users can view and manage their chat messages"
     on chat_messages for all using (is_business_member(business_id) and exists (
       select 1 from chat_sessions s where s.id = session_id and s.user_id = auth.uid()
     ));
   ```

8. **`copilot_intent_logs`:**
   ```sql
   alter table copilot_intent_logs enable row level security;
   create policy "Members can view diagnostic intent logs"
     on copilot_intent_logs for select using (is_business_member(business_id));
   ```

9. **`audit_logs`:**
   ```sql
   alter table audit_logs enable row level security;
   create policy "Owners and admins can view audit logs"
     on audit_logs for select using (is_business_member(business_id) and get_business_role(business_id) in ('owner', 'admin'));
   ```

---

## 6. Strategic indexes

```sql
-- Transactions filtering and sorting
create index idx_transactions_business_date on transactions (business_id, transaction_date desc) where deleted_at is null;
create index idx_transactions_business_type_date on transactions (business_id, transaction_type, transaction_date desc) where deleted_at is null;
create index idx_transactions_business_category on transactions (business_id, category_id, transaction_date desc) where deleted_at is null;
create index idx_transactions_reference on transactions (business_id, reference_number);

-- Transaction items joins
create index idx_items_transaction_id on transaction_items (transaction_id);
create index idx_items_business_id on transaction_items (business_id);

-- Copilot chat and intent logs
create index idx_chat_messages_session on chat_messages (session_id, created_at asc);
create index idx_chat_sessions_business on chat_sessions (business_id, user_id, updated_at desc);
create index idx_intent_logs_business on copilot_intent_logs (business_id, created_at desc);

-- Audit logs
create index idx_audit_logs_business on audit_logs (business_id, created_at desc);
```

---

## 7. Migration roadmap

1. **Migration 001:** `profiles`, `businesses`, `business_members`, `business_settings`.
2. **Migration 002:** `categories`, `tax_jurisdictions`, `tax_rule_sets`.
3. **Migration 003:** `transactions`, `transaction_items`, and check constraints.
4. **Migration 004:** `chat_sessions`, `chat_messages`, `copilot_intent_logs`.
5. **Migration 005:** `audit_logs` and soft-deletion triggers.
6. **Migration 006:** RLS policies and helper functions.
7. **Migration 007:** Seed datasets for `meta_demo` and `sample_business_2`.
