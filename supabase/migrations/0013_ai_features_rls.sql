-- =========================================================================
-- KEZMOTO — Phase 5 RLS
-- =========================================================================

alter table ai_chatbot_logs enable row level security;
alter table fraud_flags enable row level security;

-- AI CHATBOT LOGS: a user can see and add their own; nobody else's.
drop policy if exists "users can view own chatbot logs" on ai_chatbot_logs;
create policy "users can view own chatbot logs" on ai_chatbot_logs
  for select using (auth.uid() = user_id);

drop policy if exists "users can insert own chatbot logs" on ai_chatbot_logs;
create policy "users can insert own chatbot logs" on ai_chatbot_logs
  for insert with check (auth.uid() = user_id);

-- FRAUD FLAGS: admin-only, full stop — not even the listing's own seller can
-- see why (or whether) their listing was flagged. Because this table has no
-- policy granting anything to a non-admin session, the rules-based checks in
-- check-listing-fraud must write through the service-role client even though
-- the checks themselves only read data RLS already exposes to the caller.
drop policy if exists "admin manages fraud flags" on fraud_flags;
create policy "admin manages fraud flags" on fraud_flags
  for all using (
    exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  );
