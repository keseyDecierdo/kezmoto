-- =========================================================================
-- KEZMOTO — Sync listing status when a transaction completes
-- The admin-driven middleman flow (TransactionDetail) advances a
-- transaction all the way to 'completed' without ever touching the
-- underlying listing — only the app's "Mark as sold" shortcut in
-- ChatPanel did that, and only because the acting user is the seller
-- (listings' RLS only lets the seller update their own row).
--
-- An admin finishing a deal is usually not that seller, so a plain client
-- update would silently be blocked by RLS. A security definer trigger
-- here mirrors the existing sync_commission_status (0009) pattern: once a
-- transaction reaches 'completed', the linked listing is force-marked
-- 'sold' regardless of who completed it, so the Reports "Units sold" /
-- "Total sales value" totals (and every other screen that reads
-- listings.status) stay consistent with what the transactions table says
-- actually sold.
-- =========================================================================

create or replace function sync_listing_sold_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and new.listing_id is not null then
    update listings
    set status = 'sold'
    where listing_id = new.listing_id
      and status is distinct from 'sold';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_sync_listing_sold_status on transactions;
create trigger transactions_sync_listing_sold_status
after insert or update on transactions
for each row execute function sync_listing_sold_status();
