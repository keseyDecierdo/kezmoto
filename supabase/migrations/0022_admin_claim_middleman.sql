-- =========================================================================
-- KEZMOTO — Admin can actually claim an unclaimed middleman request
--
-- Root cause of "I join a middleman request but can't send or see messages
-- in that chat": joinAsMiddleman() writes admin_id/status to both
-- `transactions` and `chats`, but the only UPDATE policy either table had
-- was scoped to someone already a party to the row:
--   transactions: auth.uid() = admin_id or auth.uid() in (buyer_id, seller_id)
--   chats:        auth.uid() in (buyer_id, seller_id, admin_id)
-- For a brand-new claim, admin_id (old value) is null and the joining admin
-- is neither buyer nor seller, so both USING clauses are false. RLS then
-- silently drops the row from the UPDATE's target set — 0 rows touched, no
-- error raised (the client call never chains `.select()`), so the app
-- believed the join succeeded. transactions.enforce_transaction_update
-- (0007) would have allowed it — `acting_is_admin and old.admin_id is
-- null` — but that trigger never even ran, since RLS excluded the row
-- before the trigger had a chance.
--
-- Net effect: chats.admin_id stayed null forever, so the messages RLS
-- policies (`auth.uid() in (chats.buyer_id, chats.seller_id,
-- chats.admin_id)`, both read and write) never recognized the admin as a
-- participant — hence no sending, and nothing from the admin ever reaching
-- the other two parties either.
--
-- These two additive policies mirror the existing "admins can view
-- unclaimed transactions" (0007) pattern: any admin may claim a row with no
-- admin assigned yet, but only for themselves (`with check`), and once
-- claimed the existing participant policies take back over for every
-- later update.
-- =========================================================================

drop policy if exists "admins can claim unclaimed transactions" on transactions;
create policy "admins can claim unclaimed transactions" on transactions
  for update
  using (
    admin_id is null
    and exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  )
  with check (admin_id = auth.uid());

drop policy if exists "admins can claim unclaimed chats" on chats;
create policy "admins can claim unclaimed chats" on chats
  for update
  using (
    admin_id is null
    and exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  )
  with check (admin_id = auth.uid());
