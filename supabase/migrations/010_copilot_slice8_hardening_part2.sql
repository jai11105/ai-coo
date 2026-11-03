-- Slice 8 PART 2: RLS member-read policy + image-asset metadata table.
-- Re-runnable. No public access. No service-role exposure. No bucket invented.
drop policy if exists copilot_traces_member_read on public.copilot_traces;
create policy copilot_traces_member_read on public.copilot_traces
  for select using (
    exists (
      select 1 from public.business_members m
      where m.business_id::text = copilot_traces.business_id::text
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );
create table if not exists public.copilot_image_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  business_id uuid not null,
  conversation_id text not null default '',
  prompt text not null default '',
  revised_prompt text,
  provider text not null default 'meta-image',
  size text not null default '1024x1024',
  image_url text,
  has_b64 boolean not null default false,
  created_at timestamptz not null default now(),
  constraint copilot_image_assets_prompt_chk check (char_length(prompt) <= 1000)
);
create index if not exists copilot_image_assets_business_created_idx
  on public.copilot_image_assets (business_id, created_at desc);
alter table public.copilot_image_assets enable row level security;
drop policy if exists copilot_image_assets_member_read on public.copilot_image_assets;
create policy copilot_image_assets_member_read on public.copilot_image_assets
  for select using (
    exists (
      select 1 from public.business_members m
      where m.business_id::text = copilot_image_assets.business_id::text
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

