-- ============================================================================
-- Phase 3 · Task A + follow-up — Auto-create public.profiles rows on signup
-- PLUS one-time backfill for pre-existing users
-- ============================================================================
-- PART 1 — TRIGGER (future signups)
--   After a new row lands in auth.users (email/password signup), this trigger
--   inserts the matching row into public.profiles:
--     profiles.id           = the new auth user's UUID
--     profiles.display_name = signup metadata display_name, else the email
--                             prefix, else 'Owner' (column is NOT NULL)
--   Existing profile RLS policies are untouched. The SECURITY DEFINER function
--   performs the insert with the function owner's privileges, so no
--   service-role key and no client-side privileged call are ever needed.
--
-- APPLY MANUALLY (do NOT auto-run from app code):
--   1. Open the Supabase Dashboard → SQL Editor for this project.
--   2. Paste this entire file and press Run.
--   3. Re-run is safe (CREATE OR REPLACE + DROP TRIGGER IF EXISTS +
--      backfill is naturally idempotent via LEFT JOIN + ON CONFLICT DO NOTHING).
-- NOTE: reading auth.users needs SQL-Editor (postgres) privileges — the
-- trigger itself handles all future signups automatically.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_display_name text;
begin
  -- Prefer the display name captured at signup (options.data.display_name).
  v_display_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');

  -- Fall back to the email prefix, then to a generic name.
  if v_display_name is null then
    v_display_name := nullif(split_part(new.email, '@', 1), '');
  end if;
  if v_display_name is null then
    v_display_name := 'Owner';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;

  return new;
end;
$func$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- PART 2 — Backfill profiles for users who signed up before the trigger.
-- Inserts ONLY missing rows; never touches existing profiles.
-- ----------------------------------------------------------------------------

insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Owner'
  )
from auth.users as u
left join public.profiles as p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
