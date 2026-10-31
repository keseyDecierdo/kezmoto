-- =========================================================================
-- KEZMOTO — Clear all conversations and listings (accounts are kept)
--
-- PERMANENT. Admin accounts and their profiles stay untouched.
-- Run in Supabase → SQL Editor. One transaction: if a step fails, nothing
-- is deleted. Image FILES are removed separately from the Storage page
-- (Supabase does not allow deleting stored files with SQL).
-- =========================================================================

begin;

-- Conversations and everything that hangs off them -----------------------
delete from public.reviews;
delete from public.payments;              -- payment proofs (records)
delete from public.transactions;          -- deals + price offers; checklists/inspections cascade
delete from public.user_reports;
delete from public.messages;              -- includes chat photos (records)
delete from public.chats;
delete from public.notifications;

-- Listings (their photos are being emptied from Storage too) -------------
delete from public.ai_chatbot_logs;
delete from public.listing_appeals;
delete from public.fraud_flags;
delete from public.listings;              -- favorites + document redactions cascade
delete from public.wanted_posts;

commit;

-- Check: every count should be 0.
select 'chats' as table_name, count(*) from public.chats
union all select 'messages', count(*) from public.messages
union all select 'transactions', count(*) from public.transactions
union all select 'listings', count(*) from public.listings
union all select 'wanted_posts', count(*) from public.wanted_posts
union all select 'profiles (kept)', count(*) from public.profiles;
