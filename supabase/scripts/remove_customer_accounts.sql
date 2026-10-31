-- =========================================================================
-- KEZMOTO — Remove every CUSTOMER account (admins are kept)
--
-- PERMANENT. Deletes the customers' logins and everything tied to them:
-- listings, wanted posts, favorites, chats + messages, transactions,
-- payments, reviews, reports, appeals, notifications, AI logs.
--
-- How to use (Supabase → SQL Editor):
--   1. Run PART 1 alone first and read the list of who will be removed.
--   2. Run PART 2 to delete them. It runs as one transaction: if any step
--      fails, nothing is deleted.
--   3. Uploaded files (listing photos, ID and selfie images) stay in
--      Storage — empty those buckets from the Storage page if you want.
-- To keep someone (e.g. your own customer test account), add their email
-- to the `keep` list in BOTH parts.
-- =========================================================================

-- ------------------------------------------------------------- PART 1
-- Preview: who would be removed.
select u.email, p.full_name, p.role, u.created_at
from auth.users u
left join public.profiles p on p.profile_id = u.id
where coalesce(p.role::text, 'customer') <> 'admin'
  and u.email not in ('keep-this@example.com')          -- keep list
order by u.created_at;


-- ------------------------------------------------------------- PART 2
-- Delete. Select from "begin;" to "commit;" and run.
begin;

create temporary table doomed on commit drop as
select u.id
from auth.users u
left join public.profiles p on p.profile_id = u.id
where coalesce(p.role::text, 'customer') <> 'admin'
  and u.email not in ('keep-this@example.com');         -- keep list (same as above)

create temporary table doomed_listings on commit drop as
select listing_id from public.listings where seller_id in (select id from doomed);

create temporary table doomed_chats on commit drop as
select chat_id from public.chats
where buyer_id in (select id from doomed)
   or seller_id in (select id from doomed)
   or listing_id in (select listing_id from doomed_listings);

create temporary table doomed_transactions on commit drop as
select transaction_id from public.transactions
where buyer_id in (select id from doomed)
   or seller_id in (select id from doomed)
   or listing_id in (select listing_id from doomed_listings)
   or chat_id in (select chat_id from doomed_chats);

-- Children first, so no foreign key blocks the next delete.
delete from public.reviews
where transaction_id in (select transaction_id from doomed_transactions)
   or reviewer_id in (select id from doomed)
   or reviewee_id in (select id from doomed);

delete from public.payments
where transaction_id in (select transaction_id from doomed_transactions)
   or payer_id in (select id from doomed);

-- verification_checklist and inspections go with their transaction (cascade).
delete from public.transactions
where transaction_id in (select transaction_id from doomed_transactions);

delete from public.user_reports
where chat_id in (select chat_id from doomed_chats)
   or reporter_id in (select id from doomed)
   or reported_user_id in (select id from doomed);

delete from public.messages
where chat_id in (select chat_id from doomed_chats)
   or sender_id in (select id from doomed);

delete from public.chats
where chat_id in (select chat_id from doomed_chats);

delete from public.ai_chatbot_logs
where user_id in (select id from doomed)
   or listing_id in (select listing_id from doomed_listings);

delete from public.listing_appeals
where listing_id in (select listing_id from doomed_listings)
   or seller_id in (select id from doomed);

delete from public.fraud_flags
where listing_id in (select listing_id from doomed_listings);

-- Listings, wanted posts, favorites and notifications cascade from the
-- profile, and the profile cascades from the login.
delete from auth.users
where id in (select id from doomed);

commit;

-- Check: only admins (and anyone you kept) should be left.
select u.email, p.full_name, p.role
from auth.users u
left join public.profiles p on p.profile_id = u.id
order by p.role, u.email;
