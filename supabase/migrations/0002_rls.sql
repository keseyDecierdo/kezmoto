-- =========================================================================
-- KEZMOTO — Row Level Security
-- Every table is protected. RLS with no policy denies everything, so each
-- table below gets exactly the policies the app needs and nothing wider.
-- =========================================================================

alter table profiles enable row level security;
alter table listings enable row level security;
alter table wanted_posts enable row level security;
alter table chats enable row level security;
alter table messages enable row level security;
alter table favorites enable row level security;
alter table document_redactions enable row level security;

-- PROFILES: readable by everyone (seller name on a card), writable by the owner
drop policy if exists "profiles are viewable by everyone" on profiles;
create policy "profiles are viewable by everyone" on profiles
  for select using (true);
drop policy if exists "users can update own profile" on profiles;
create policy "users can update own profile" on profiles
  for update using (auth.uid() = profile_id);
-- Fallback for client-side profile creation; the 0003 trigger normally does it.
drop policy if exists "users can insert own profile" on profiles;
create policy "users can insert own profile" on profiles
  for insert with check (auth.uid() = profile_id);

-- LISTINGS: anyone can view active listings; only the seller sees their own
-- drafts / reserved / sold / removed units and only the seller can write.
drop policy if exists "active listings are viewable by everyone" on listings;
create policy "active listings are viewable by everyone" on listings
  for select using (status = 'active' or auth.uid() = seller_id);
drop policy if exists "sellers can insert own listings" on listings;
create policy "sellers can insert own listings" on listings
  for insert with check (auth.uid() = seller_id);
drop policy if exists "sellers can update own listings" on listings;
create policy "sellers can update own listings" on listings
  for update using (auth.uid() = seller_id);

-- WANTED POSTS: viewable by everyone, editable by owner
drop policy if exists "wanted posts viewable by everyone" on wanted_posts;
create policy "wanted posts viewable by everyone" on wanted_posts
  for select using (true);
drop policy if exists "buyers can insert own wanted posts" on wanted_posts;
create policy "buyers can insert own wanted posts" on wanted_posts
  for insert with check (auth.uid() = buyer_id);
drop policy if exists "buyers can update own wanted posts" on wanted_posts;
create policy "buyers can update own wanted posts" on wanted_posts
  for update using (auth.uid() = buyer_id);

-- CHATS: only participants can view; a user can only open a thread they are in
drop policy if exists "chat participants can view" on chats;
create policy "chat participants can view" on chats
  for select using (auth.uid() in (buyer_id, seller_id, admin_id));
drop policy if exists "users can create chats they participate in" on chats;
create policy "users can create chats they participate in" on chats
  for insert with check (auth.uid() in (buyer_id, seller_id));
-- Needed by Request Middleman (status) and the unread badge (last_read stamps).
drop policy if exists "chat participants can update" on chats;
create policy "chat participants can update" on chats
  for update using (auth.uid() in (buyer_id, seller_id, admin_id));

-- MESSAGES: only chat participants can read/write
drop policy if exists "chat participants can read messages" on messages;
create policy "chat participants can read messages" on messages
  for select using (
    exists (
      select 1 from chats
      where chats.chat_id = messages.chat_id
      and auth.uid() in (chats.buyer_id, chats.seller_id, chats.admin_id)
    )
  );
-- Hardened past the spec: sending as yourself is not enough — you must also be
-- in the thread, otherwise anyone could post into a stranger's conversation.
drop policy if exists "chat participants can send messages" on messages;
create policy "chat participants can send messages" on messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from chats
      where chats.chat_id = messages.chat_id
      and auth.uid() in (chats.buyer_id, chats.seller_id, chats.admin_id)
    )
  );

-- FAVORITES: only the owner can view/manage their favorites
drop policy if exists "users manage own favorites" on favorites;
create policy "users manage own favorites" on favorites
  for all using (auth.uid() = profile_id);

-- DOCUMENT REDACTIONS: only the listing's seller can manage
drop policy if exists "sellers manage own document redactions" on document_redactions;
create policy "sellers manage own document redactions" on document_redactions
  for all using (
    exists (
      select 1 from listings
      where listings.listing_id = document_redactions.listing_id
      and listings.seller_id = auth.uid()
    )
  );
-- Buyers need the labels and black boxes to render the document on a listing
-- they are browsing, so reading is separated from managing.
drop policy if exists "document redactions are viewable by everyone" on document_redactions;
create policy "document redactions are viewable by everyone" on document_redactions
  for select using (true);
