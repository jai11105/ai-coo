-- Slice 8 — Copilot trace persistence table (PART 1 of 2).
-- Apply manually via Supabase SQL Editor. Re-runnable. RLS stays ENABLED.
create table if not exists public.copilot_traces (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  conversation_id text not null,
  trace_id text not null,
  user_id uuid not null,
  business_id uuid not null,
  question text not null default '',
  intent text,
  provider text not null default '',
  model text not null default '',
  prompt_version text not null default '',
  status text not null default 'ok',
  latency_ms integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  evidence_ids text[] not null default '{}',
  tool_calls jsonb not null default '[]'::jsonb,
  provider_attempts jsonb not null default '[]'::jsonb,
  specialist jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  constraint copilot_traces_status_chk check (status in ('ok','error','degraded')),
  constraint copilot_traces_latency_chk check (latency_ms >= 0)
);
create index if not exists copilot_traces_business_created_idx
  on public.copilot_traces (business_id, created_at desc);
create index if not exists copilot_traces_conversation_idx
  on public.copilot_traces (conversation_id, created_at desc);
alter table public.copilot_traces enable row level security;

