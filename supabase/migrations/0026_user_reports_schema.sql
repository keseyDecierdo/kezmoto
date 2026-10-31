-- =========================================================================
-- KEZMOTO — User reports + account disabling (schema)
-- A customer can report the other side of a chat; an admin reviews the
-- report and can disable the reported account. Apply 0027 right after.
-- =========================================================================

-- ACCOUNT DISABLING --------------------------------------------------------
alter table profiles add column if not exists is_disabled boolean not null default false;
alter table profiles add column if not exists disabled_at timestamptz;
alter table profiles add column if not exists disabled_reason text;

-- Helpers are SECURITY DEFINER so policies on `profiles` itself can call them
-- without recursing back into profiles' own RLS.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where profile_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_disabled_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_disabled from profiles where profile_id = auth.uid()),
    false
  );
$$;

-- USER REPORTS -------------------------------------------------------------
create table if not exists user_reports (
  report_id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(profile_id) on delete cascade,
  reported_user_id uuid not null references profiles(profile_id) on delete cascade,
  chat_id uuid references chats(chat_id) on delete set null,
  reason text not null check (reason in (
    'scam_or_fraud', 'harassment', 'fake_listing',
    'inappropriate_content', 'no_show', 'other'
  )),
  details text,
  -- Last few chat messages at the time of the report, so an admin has context
  -- even when they are not the chat's assigned middleman.
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  admin_note text,
  reviewed_by uuid references profiles(profile_id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);

create index if not exists user_reports_status_created_idx on user_reports (status, created_at desc);
create index if not exists user_reports_reported_idx on user_reports (reported_user_id);

-- One open report per reporter/target/chat — stops the same complaint being
-- filed over and over.
create unique index if not exists user_reports_one_pending_idx
  on user_reports (reporter_id, reported_user_id, coalesce(chat_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';
