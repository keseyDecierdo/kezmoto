-- =========================================================================
-- KEZMOTO — Phase 5 schema (AI chatbot, listing quality, condition score,
-- fraud detection). All AI calls happen in Edge Functions using the
-- service-role key — this file only prepares the tables and triggers that
-- make the trust boundaries those functions rely on hold at the database
-- level too, not just by omission from the app's own code paths.
-- =========================================================================

-- AI CHATBOT LOGS
create table if not exists ai_chatbot_logs (
  ai_chatbot_log_id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(profile_id),
  question text,
  answer text,
  listing_id uuid references listings(listing_id),
  created_at timestamptz default now()
);

create index if not exists ai_chatbot_logs_user_idx on ai_chatbot_logs (user_id, created_at desc);

-- FRAUD FLAGS (AI-detected and rules-detected, admin-reviewed)
create table if not exists fraud_flags (
  fraud_flag_id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(listing_id),
  flag_type text check (flag_type in ('low_price','duplicate_image','duplicate_listing','suspicious_text','posting_pattern')),
  detail text,
  ai_confidence numeric(3,2),        -- 0.00–1.00; 1.00 for deterministic rule-based flags
  status text default 'pending' check (status in ('pending','reviewed_ok','reviewed_removed')),
  created_at timestamptz default now()
);

create index if not exists fraud_flags_status_idx on fraud_flags (status, created_at);
create index if not exists fraud_flags_listing_idx on fraud_flags (listing_id);

-- `listing_quality_score` and `condition_score` columns already exist on
-- `listings` from Phase 2 — this phase is what actually populates them.
alter table listings
  add column if not exists condition_score_explanation text,
  -- KEZMOTO extension: the brief's Listing Detail mockup shows a per-check
  -- breakdown ("✅ Photos complete", "⚠️ Condition description could be more
  -- detailed") alongside the total — storing it is cheaper than recomputing
  -- Layer 1 client-side every render, and keeps the breakdown in sync with
  -- whatever score was actually written.
  add column if not exists listing_quality_breakdown jsonb,
  -- KEZMOTO extension: average-hash of each newly uploaded photo, computed
  -- client-side at pick time (see src/utils/imageHash.ts) and fed into the
  -- duplicate-image fraud check below. Not aligned by index to `photos` —
  -- edited-in and sample photos are skipped, only fresh uploads are hashed.
  add column if not exists photo_hashes text[];

-- ---------------------------------------------------------------------
-- Locks the four AI-written columns to the scoring/fraud Edge Functions.
-- Without this, the existing `sellers can update own listings` policy
-- (row-level only, from 0002) would let a seller PATCH their own
-- listing_quality_score or condition_score directly, defeating the whole
-- point of the feature — RLS sees whole rows, not columns, the same gap
-- Phase 4 found on `transactions.commission_status`.
-- ---------------------------------------------------------------------
create or replace function enforce_listing_score_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.listing_quality_score is distinct from old.listing_quality_score
    or new.listing_quality_breakdown is distinct from old.listing_quality_breakdown
    or new.condition_score is distinct from old.condition_score
    or new.condition_score_explanation is distinct from old.condition_score_explanation
  then
    raise exception 'Quality and condition scores can only be set by KEZMOTO''s scoring service.';
  end if;

  return new;
end;
$$;

drop trigger if exists listings_enforce_score_lock on listings;
create trigger listings_enforce_score_lock
before update on listings
for each row execute function enforce_listing_score_lock();

-- ---------------------------------------------------------------------
-- An admin marking a fraud flag "reviewed_removed" also removes the
-- listing — one action, not two writes an admin could leave inconsistent.
-- security definer so this doesn't require opening a general "admin can
-- update any listing" RLS policy (which does not exist, and would be a much
-- wider surface than this one field) just for this one path — same pattern
-- as sync_commission_status in 0009.
-- ---------------------------------------------------------------------
create or replace function sync_fraud_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'reviewed_removed' and old.status is distinct from new.status then
    update listings set status = 'removed' where listing_id = new.listing_id;
  end if;
  return new;
end;
$$;

drop trigger if exists fraud_flags_sync_removal on fraud_flags;
create trigger fraud_flags_sync_removal
after update on fraud_flags
for each row execute function sync_fraud_removal();

-- ---------------------------------------------------------------------
-- Duplicate-listing detection (Step 5.3 of the brief): text similarity
-- against other sellers' listings via pg_trgm. Exposed as a function rather
-- than raw SQL from the Edge Function so the "only active listings, only
-- other sellers" scoping lives in one place, matches what RLS already lets
-- any caller read, and needs no elevated privilege to call.
-- ---------------------------------------------------------------------
create extension if not exists pg_trgm;

create or replace function find_similar_listings(
  target_text text,
  exclude_listing_id uuid,
  exclude_seller_id uuid,
  similarity_threshold real default 0.5
)
returns table(listing_id uuid, seller_id uuid, similarity real)
language sql
stable
set search_path = public
as $$
  select l.listing_id, l.seller_id,
    similarity(coalesce(l.description, '') || ' ' || coalesce(l.reason_for_sale, ''), target_text) as similarity
  from listings l
  where l.listing_id <> exclude_listing_id
    and l.seller_id <> exclude_seller_id
    and l.status = 'active'
    and similarity(coalesce(l.description, '') || ' ' || coalesce(l.reason_for_sale, ''), target_text) > similarity_threshold
  order by similarity desc
  limit 5;
$$;
