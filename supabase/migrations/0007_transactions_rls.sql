-- =========================================================================
-- KEZMOTO — Phase 3 Row Level Security
-- =========================================================================

alter table transactions enable row level security;
alter table verification_checklist enable row level security;
alter table inspections enable row level security;
alter table reviews enable row level security;

-- TRANSACTIONS: only buyer, seller, or assigned admin can view
drop policy if exists "transaction participants can view" on transactions;
create policy "transaction participants can view" on transactions
  for select using (auth.uid() in (buyer_id, seller_id, admin_id));

-- Extends the policy above: as written, an admin who hasn't joined yet fails
-- `auth.uid() in (buyer_id, seller_id, admin_id)` for every unclaimed
-- transaction, so the Middleman queue would always be empty. Any admin may
-- see a transaction that has no admin assigned yet, so there is something to
-- claim; once claimed, the policy above takes over.
drop policy if exists "admins can view unclaimed transactions" on transactions;
create policy "admins can view unclaimed transactions" on transactions
  for select using (
    admin_id is null
    and exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  );

-- Same gap on chats: Phase 2's "chat participants can view" policy hides an
-- unclaimed middleman-requested chat from every admin, since none of them are
-- buyer_id/seller_id/admin_id yet. This is additive — it only ever widens
-- access to chats already flagged for middleman attention.
drop policy if exists "admins can view middleman queue chats" on chats;
create policy "admins can view middleman queue chats" on chats
  for select using (
    status in ('middleman_requested', 'middleman_joined')
    and exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  );

-- Buyer or seller can create a transaction they're part of
drop policy if exists "participants can create transactions" on transactions;
create policy "participants can create transactions" on transactions
  for insert with check (auth.uid() in (buyer_id, seller_id));

-- Row-level: the assigned admin, or either party, may touch the row at all.
-- This alone can't express "buyer/seller may only edit proposed_price, and
-- only pre-middleman" — RLS policies see whole rows, not columns — so a
-- trigger (below) enforces that narrower rule. Without it, any participant
-- could set their own agreed_price or reassign admin_id via a raw REST call.
drop policy if exists "admin can update assigned transactions" on transactions;
create policy "admin can update assigned transactions" on transactions
  for update using (auth.uid() = admin_id or auth.uid() in (buyer_id, seller_id));

create or replace function enforce_transaction_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  acting_is_admin boolean;
begin
  select (role = 'admin') into acting_is_admin from profiles where profile_id = auth.uid();

  -- An admin may fully manage a transaction that is either unclaimed
  -- (joining as middleman) or already assigned to them.
  if acting_is_admin and (old.admin_id is null or old.admin_id = auth.uid()) then
    return new;
  end if;

  -- Buyer or seller: proposed_price only, and only before a middleman joins.
  if auth.uid() in (old.buyer_id, old.seller_id) then
    if old.status not in ('inquiry', 'negotiating') then
      raise exception 'Only the assigned admin can update this transaction once a middleman is involved.';
    end if;
    if new.chat_id is distinct from old.chat_id
      or new.listing_id is distinct from old.listing_id
      or new.buyer_id is distinct from old.buyer_id
      or new.seller_id is distinct from old.seller_id
      or new.admin_id is distinct from old.admin_id
      or new.agreed_price is distinct from old.agreed_price
      or new.status is distinct from old.status
    then
      raise exception 'Buyers and sellers can only update the proposed price.';
    end if;
    return new;
  end if;

  raise exception 'Not authorized to update this transaction.';
end;
$$;

drop trigger if exists transactions_enforce_update on transactions;
create trigger transactions_enforce_update
before update on transactions
for each row execute function enforce_transaction_update();

-- VERIFICATION CHECKLIST: only admin role can read/write
drop policy if exists "admin manages verification checklist" on verification_checklist;
create policy "admin manages verification checklist" on verification_checklist
  for all using (
    exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  );

-- INSPECTIONS: only admin role can write; transaction participants can read
drop policy if exists "admin manages inspections" on inspections;
create policy "admin manages inspections" on inspections
  for all using (
    exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  );
drop policy if exists "participants can view inspections" on inspections;
create policy "participants can view inspections" on inspections
  for select using (
    exists (
      select 1 from transactions
      where transactions.transaction_id = inspections.transaction_id
      and auth.uid() in (transactions.buyer_id, transactions.seller_id, transactions.admin_id)
    )
  );

-- REVIEWS: anyone can read (public trust signal); only transaction participants can write
drop policy if exists "reviews are public" on reviews;
create policy "reviews are public" on reviews
  for select using (true);
drop policy if exists "participants can leave reviews" on reviews;
create policy "participants can leave reviews" on reviews
  for insert with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from transactions
      where transactions.transaction_id = reviews.transaction_id
      and transactions.status = 'completed'
      and auth.uid() in (transactions.buyer_id, transactions.seller_id)
      and reviewee_id in (transactions.buyer_id, transactions.seller_id)
      and reviewee_id <> auth.uid()
    )
  );
