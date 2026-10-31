-- =========================================================================
-- KEZMOTO — Phase 3 schema
-- Transaction lifecycle + admin middleman tooling. Extends Phase 2's
-- listings/chats/profiles. Run order: 0006 (this file) → 0007_transactions_rls
-- → 0008_transactions_realtime.
-- =========================================================================

-- TRANSACTIONS
create table transactions (
  transaction_id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(chat_id),
  listing_id uuid references listings(listing_id),
  buyer_id uuid references profiles(profile_id),
  seller_id uuid references profiles(profile_id),
  admin_id uuid references profiles(profile_id),
  proposed_price numeric(10,2),
  agreed_price numeric(10,2),
  status text default 'inquiry' check (status in (
    'inquiry','negotiating','middleman_assigned','verified',
    'inspection_scheduled','inspection_done','payment',
    'meetup_scheduled','completed','cancelled'
  )),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One transaction per chat — the app always looks it up by chat_id first.
create unique index transactions_chat_id_idx on transactions (chat_id);
create index transactions_buyer_idx on transactions (buyer_id);
create index transactions_seller_idx on transactions (seller_id);
create index transactions_admin_idx on transactions (admin_id);
create index transactions_status_idx on transactions (status);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists transactions_set_updated_at on transactions;
create trigger transactions_set_updated_at
before update on transactions
for each row execute function set_updated_at();

-- VERIFICATION CHECKLIST
create table verification_checklist (
  verification_checklist_id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(transaction_id) on delete cascade,
  or_cr_reviewed boolean default false,
  model_year_confirmed boolean default false,
  mileage_plausible boolean default false,
  condition_matches_listing boolean default false,
  ownership_matches_seller boolean default false,
  admin_notes text,
  verified_by uuid references profiles(profile_id),
  verified_at timestamptz,
  disclaimer_shown boolean default true
);

-- One checklist per transaction — the app upserts on this.
create unique index verification_checklist_transaction_idx on verification_checklist (transaction_id);

-- INSPECTIONS
create table inspections (
  inspection_id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(transaction_id) on delete cascade,
  inspected_by text,
  result_notes text,
  photos text[],
  pass_fail text check (pass_fail in ('pass','fail','conditional')),
  inspected_at timestamptz default now()
);

create index inspections_transaction_idx on inspections (transaction_id);

-- REVIEWS (post-transaction ratings)
create table reviews (
  review_id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(transaction_id),
  reviewer_id uuid references profiles(profile_id),
  reviewee_id uuid references profiles(profile_id),
  rating int check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now()
);

-- One review per (transaction, reviewer) — a side leaves one review of the
-- other party per deal, matching the single review-prompt in the UI.
create unique index reviews_transaction_reviewer_idx on reviews (transaction_id, reviewer_id);
create index reviews_reviewee_idx on reviews (reviewee_id);

-- Keeps profiles.rating_avg current without a client-side recompute on every
-- profile view — the spec calls this "cleaner long-term", so it's built that
-- way from the start rather than added later.
--
-- security definer is required here: a plain trigger runs with the caller's
-- own privileges, and profiles' update policy is `auth.uid() = profile_id` —
-- so without this, the UPDATE below silently touches 0 rows whenever the
-- reviewer (the caller) isn't also the reviewee, which is every real review.
create or replace function refresh_rating_avg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.reviewee_id, old.reviewee_id);
begin
  update profiles
  set rating_avg = coalesce(
    (select round(avg(rating)::numeric, 1) from reviews where reviewee_id = target),
    0
  )
  where profile_id = target;
  return null;
end;
$$;

drop trigger if exists reviews_refresh_rating_avg on reviews;
create trigger reviews_refresh_rating_avg
after insert or update or delete on reviews
for each row execute function refresh_rating_avg();
