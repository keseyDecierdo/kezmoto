-- =========================================================================
-- KEZMOTO — Notifications RLS
-- =========================================================================

alter table notifications enable row level security;

-- A recipient can see and mark read only their own notifications.
drop policy if exists "recipients can view own notifications" on notifications;
create policy "recipients can view own notifications" on notifications
  for select using (auth.uid() = recipient_id);

drop policy if exists "recipients can update own notifications" on notifications;
create policy "recipients can update own notifications" on notifications
  for update using (auth.uid() = recipient_id);

-- Insert is open to any signed-in user rather than a per-event participant
-- check: a notification's whole point is one user creating a row for
-- someone else (e.g. the other side of a chat), so there is no "own row" to
-- check against on insert. Same pragmatic simplification already used for
-- the payment-proofs bucket in 0009_payments_schema.sql.
drop policy if exists "signed-in users can create notifications" on notifications;
create policy "signed-in users can create notifications" on notifications
  for insert with check (auth.uid() is not null);
