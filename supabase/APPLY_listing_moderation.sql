-- ======================================================================
-- KEZMOTO — one-shot: admin-outreach chats + duplicate-posting/admin-removal
-- flags + listing appeals (0029 + 0030 + 0031 + 0032)
-- Paste ALL of this into Supabase -> SQL Editor -> Run. Safe to re-run.
-- ======================================================================

-- =========================================================================
-- KEZMOTO — Admin can start a chat with a seller directly (no buyer)
--
-- New admin pages let an admin message a seller about one of their units,
-- or in general, without a buyer ever being involved (see Sellers / View
-- Units). `chats.buyer_id` and `admin_id` are both nullable (0001), and the
-- messages RLS already treats `admin_id` as a full participant for read/send
-- (0002) — the one thing missing is an INSERT policy that lets an admin
-- create a brand-new row with only `admin_id` set. This is additive: the
-- existing "users can create chats they participate in" policy (buyer or
-- seller) is untouched, so every existing chat-creation path behaves exactly
-- as before.
-- =========================================================================

drop policy if exists "admins can start outreach chats" on chats;
create policy "admins can start outreach chats" on chats
  for insert
  with check (is_admin() and auth.uid() = admin_id);

-- =========================================================================
-- KEZMOTO — Fraud flags: duplicate-posting check + admin removal reason
--
-- Two additions to the existing fraud_flags table (0012):
--   1. Two new flag_type values: 'duplicate_posting' (a new cross-seller
--      same-brand/model + same-photo rule in check-listing-fraud) and
--      'admin_removed' (an admin removing a listing ad hoc, with no prior
--      AI/rule flag — see the new SellerUnits admin page).
--   2. An `admin_note` column so an admin's typed reason for removing a
--      listing never overwrites `detail`, which already holds the
--      AI/rule-generated explanation for flags that have one.
-- =========================================================================

alter table fraud_flags drop constraint if exists fraud_flags_flag_type_check;
alter table fraud_flags add constraint fraud_flags_flag_type_check
  check (flag_type in (
    'low_price', 'duplicate_image', 'duplicate_listing', 'suspicious_text',
    'posting_pattern', 'duplicate_posting', 'admin_removed'
  ));

alter table fraud_flags add column if not exists admin_note text;

-- =========================================================================
-- KEZMOTO — Listing appeals (schema)
--
-- A listing removed by an admin (via fraud_flags.status = 'reviewed_removed',
-- see sync_fraud_removal in 0012) is otherwise gone for good. This table lets
-- the seller explain themselves and an admin reinstate it — approving an
-- appeal flips the listing back to 'active' via a trigger, the same
-- one-admin-action-not-two-writes shape as sync_fraud_removal itself.
-- =========================================================================

create table if not exists listing_appeals (
  listing_appeal_id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(listing_id) on delete cascade,
  fraud_flag_id uuid references fraud_flags(fraud_flag_id),
  seller_id uuid not null references profiles(profile_id) on delete cascade,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  admin_note text,
  reviewed_by uuid references profiles(profile_id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists listing_appeals_status_created_idx on listing_appeals (status, created_at desc);
create index if not exists listing_appeals_listing_idx on listing_appeals (listing_id);

-- One open appeal per listing — no point stacking duplicates while one is
-- still pending review.
create unique index if not exists listing_appeals_one_pending_idx
  on listing_appeals (listing_id)
  where status = 'pending';

-- Approving an appeal reinstates the listing — one admin action, not two
-- writes that could drift. security definer so this doesn't require opening
-- a general "admin can update any listing" policy, same reasoning as
-- sync_fraud_removal (0012).
create or replace function sync_listing_appeal_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    update listings set status = 'active' where listing_id = new.listing_id;
  end if;
  return new;
end;
$$;

drop trigger if exists listing_appeals_sync_approval on listing_appeals;
create trigger listing_appeals_sync_approval
after update on listing_appeals
for each row execute function sync_listing_appeal_approval();

-- =========================================================================
-- KEZMOTO — Listing appeals (RLS)
-- Same shape as user_reports (0027): the seller can file and see their own
-- appeal, admins can see and review every appeal.
-- =========================================================================

alter table listing_appeals enable row level security;

drop policy if exists "sellers can file their own appeals" on listing_appeals;
create policy "sellers can file their own appeals" on listing_appeals
  for insert
  with check (
    auth.uid() = seller_id
    and exists (
      select 1 from listings
      where listings.listing_id = listing_appeals.listing_id
        and listings.seller_id = auth.uid()
    )
  );

drop policy if exists "sellers and admins can view appeals" on listing_appeals;
create policy "sellers and admins can view appeals" on listing_appeals
  for select using (auth.uid() = seller_id or is_admin());

drop policy if exists "admins can review appeals" on listing_appeals;
create policy "admins can review appeals" on listing_appeals
  for update using (is_admin()) with check (is_admin());

-- Make the API pick up the new table/columns immediately.
notify pgrst, 'reload schema';
