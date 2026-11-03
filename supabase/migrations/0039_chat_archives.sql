-- =========================================================================
-- KEZMOTO - Archived chats
-- Archiving is personal: one row per (chat, person). The buyer archiving a
-- chat leaves it active for the seller and the admin. Nothing is deleted;
-- the app shows a chat as archived only while no message is newer than
-- archived_at, so a new message brings it back to Active on its own.
-- Safe to re-run.
-- =========================================================================

create table if not exists public.chat_archives (
  chat_id     uuid not null references public.chats(chat_id) on delete cascade,
  profile_id  uuid not null references public.profiles(profile_id) on delete cascade,
  archived_at timestamptz not null default now(),
  primary key (chat_id, profile_id)
);

alter table public.chat_archives enable row level security;

drop policy if exists "users read own chat archives" on public.chat_archives;
create policy "users read own chat archives" on public.chat_archives
  for select using (auth.uid() = profile_id);

-- Only for a chat the user is part of: buyer, seller or the joined admin.
drop policy if exists "users archive own chats" on public.chat_archives;
create policy "users archive own chats" on public.chat_archives
  for insert with check (
    auth.uid() = profile_id
    and exists (
      select 1 from public.chats c
      where c.chat_id = chat_archives.chat_id
        and auth.uid() in (c.buyer_id, c.seller_id, c.admin_id)
    )
  );

drop policy if exists "users re-archive own chats" on public.chat_archives;
create policy "users re-archive own chats" on public.chat_archives
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists "users unarchive own chats" on public.chat_archives;
create policy "users unarchive own chats" on public.chat_archives
  for delete using (auth.uid() = profile_id);
