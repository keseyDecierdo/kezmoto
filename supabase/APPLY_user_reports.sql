-- ======================================================================
-- KEZMOTO — one-shot: user reports + account disabling (0026 + 0027)
-- Paste ALL of this into Supabase -> SQL Editor -> Run. Safe to re-run.
-- ======================================================================

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


-- =========================================================================
-- KEZMOTO — User reports + account disabling (RLS and guards)
-- =========================================================================

alter table user_reports enable row level security;

-- Reporters file reports only from a chat they are actually part of.
drop policy if exists "reporters can file reports" on user_reports;
create policy "reporters can file reports" on user_reports
  for insert with check (
    auth.uid() = reporter_id
    and (
      chat_id is null
      or exists (
        select 1 from chats
        where chats.chat_id = user_reports.chat_id
          and auth.uid() in (chats.buyer_id, chats.seller_id, chats.admin_id)
      )
    )
  );

-- A reporter can see their own reports; admins see everything.
drop policy if exists "reporters and admins can view reports" on user_reports;
create policy "reporters and admins can view reports" on user_reports
  for select using (auth.uid() = reporter_id or is_admin());

drop policy if exists "admins can review reports" on user_reports;
create policy "admins can review reports" on user_reports
  for update using (is_admin()) with check (is_admin());

-- PROFILES: admins may update any profile (to disable/enable accounts) ------
drop policy if exists "admins can update any profile" on profiles;
create policy "admins can update any profile" on profiles
  for update using (is_admin()) with check (is_admin());

-- "users can update own profile" has no column restriction, so without this a
-- user could PATCH their own role or re-enable their own disabled account.
-- RLS is row-level only; a trigger is what locks individual columns.
create or replace function enforce_profile_admin_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- service role (Edge Functions) and the SQL editor (no auth.uid()) are trusted.
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if is_admin() then
    if new.profile_id = auth.uid()
      and (new.is_disabled is distinct from old.is_disabled or new.role is distinct from old.role)
    then
      raise exception 'Admins cannot change their own role or disable their own account.';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
    or new.is_disabled is distinct from old.is_disabled
    or new.disabled_at is distinct from old.disabled_at
    or new.disabled_reason is distinct from old.disabled_reason
  then
    raise exception 'Only a KEZMOTO admin can change a role or disable an account.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_admin_columns on profiles;
create trigger profiles_enforce_admin_columns
before update on profiles
for each row execute function enforce_profile_admin_columns();

-- DISABLED ACCOUNTS CAN'T WRITE ---------------------------------------------
-- RESTRICTIVE policies are ANDed with the existing permissive ones, so a
-- disabled user's still-valid session can read but not post, list or message.
drop policy if exists "disabled users cannot send messages" on messages;
create policy "disabled users cannot send messages" on messages
  as restrictive for insert with check (not is_disabled_user());

drop policy if exists "disabled users cannot create chats" on chats;
create policy "disabled users cannot create chats" on chats
  as restrictive for insert with check (not is_disabled_user());

drop policy if exists "disabled users cannot create listings" on listings;
create policy "disabled users cannot create listings" on listings
  as restrictive for insert with check (not is_disabled_user());

drop policy if exists "disabled users cannot update listings" on listings;
create policy "disabled users cannot update listings" on listings
  as restrictive for update using (not is_disabled_user());

drop policy if exists "disabled users cannot create transactions" on transactions;
create policy "disabled users cannot create transactions" on transactions
  as restrictive for insert with check (not is_disabled_user());

drop policy if exists "disabled users cannot file reports" on user_reports;
create policy "disabled users cannot file reports" on user_reports
  as restrictive for insert with check (not is_disabled_user());

-- Make the API pick up the new table/columns immediately.
notify pgrst, 'reload schema';
