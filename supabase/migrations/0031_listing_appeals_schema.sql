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
