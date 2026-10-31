-- =========================================================================
-- KEZMOTO — Payments RLS (manual GCash confirm flow)
--
-- The trust boundary here is a human, not a webhook: a seller may submit
-- their own pending commission payment (reference number + proof), and only
-- an admin may move it to succeeded/failed — never the seller who submitted
-- it, and never the buyer. sync_commission_status (0009) is the only thing
-- that then reflects that decision onto the transaction itself.
-- =========================================================================

alter table payments enable row level security;

-- SELECT: transaction participants, or any admin (needed for the Reports
-- summary — see the note below on why "assigned admin only" isn't enough).
drop policy if exists "transaction participants can view payments" on payments;
create policy "transaction participants can view payments" on payments
  for select using (
    exists (
      select 1 from transactions
      where transactions.transaction_id = payments.transaction_id
      and auth.uid() in (transactions.buyer_id, transactions.seller_id, transactions.admin_id)
    )
  );

-- ---------------------------------------------------------------------
-- Reporting gap, found while wiring the Commission Report: a policy scoped
-- to "the assigned admin only" leaves a second admin's Reports screen
-- silently missing every deal the first admin ever handled — the report
-- would be simply wrong, not merely restricted. A commission/sales report
-- needs every admin to see every payment. Widens deliberately.
-- ---------------------------------------------------------------------
drop policy if exists "any admin can view all payments" on payments;
create policy "any admin can view all payments" on payments
  for select using (
    exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  );

-- INSERT: the seller may submit their own pending commission payment for a
-- transaction they're actually selling in — never on someone else's behalf,
-- and never already marked succeeded/failed (that's the admin's call, next).
drop policy if exists "seller can submit own commission payment" on payments;
create policy "seller can submit own commission payment" on payments
  for insert with check (
    auth.uid() = payer_id
    and status = 'pending'
    and exists (
      select 1 from transactions
      where transactions.transaction_id = payments.transaction_id
      and transactions.seller_id = auth.uid()
    )
  );

-- UPDATE: admin-only — confirming or rejecting a submission. Not the seller
-- who submitted it, not the buyer: a client can never mark its own payment
-- "succeeded".
drop policy if exists "admin can review payments" on payments;
create policy "admin can review payments" on payments
  for update using (
    exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  );

-- TRANSACTIONS: any admin can view every transaction, not just one they are
-- personally assigned to or one still unclaimed — the same reporting gap as
-- above, on the table the Commission Report's other half reads from.
drop policy if exists "admins can view unclaimed transactions" on transactions;
drop policy if exists "any admin can view all transactions" on transactions;
create policy "any admin can view all transactions" on transactions
  for select using (
    exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  );
