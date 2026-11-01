-- =========================================================================
-- KEZMOTO — Seller Pro (₱149 / 30 days) and listing Boosts (₱49 / 7 days)
--
-- Free sellers keep everything they had, with up to 3 active listings.
-- Pro: unlimited listings, 3% commission (applied by the app), a badge and
-- 2 boost credits per purchase. A boost pins one listing to the top of Home
-- and Landing for 7 days.
--
-- Paid the same way as the commission: the seller sends GCash to KEZMOTO,
-- uploads the screenshot, and an admin approves. Purchases live in their own
-- table, so the commission `payments` flow is untouched.
-- Safe to re-run.
-- =========================================================================

-- ------------------------------------------------------------ columns
alter table public.profiles
  add column if not exists pro_until     timestamptz,
  add column if not exists boost_credits int not null default 0;

alter table public.listings
  add column if not exists boosted_until timestamptz;

create index if not exists listings_boosted_until_idx on public.listings (boosted_until desc nulls last);

-- ------------------------------------------------------------ purchases
create table if not exists public.plan_purchases (
  purchase_id      uuid primary key default gen_random_uuid(),
  buyer_id         uuid not null references public.profiles(profile_id) on delete cascade,
  kind             text not null check (kind in ('pro', 'boost')),
  listing_id       uuid references public.listings(listing_id) on delete set null,
  amount           numeric(10,2) not null check (amount > 0),
  reference_number text not null,
  proof_url        text not null,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note      text,
  reviewed_by      uuid references public.profiles(profile_id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint plan_purchases_boost_needs_listing check (kind <> 'boost' or listing_id is not null)
);

create index if not exists plan_purchases_buyer_idx on public.plan_purchases (buyer_id, created_at desc);
create index if not exists plan_purchases_status_idx on public.plan_purchases (status, created_at desc);

alter table public.plan_purchases enable row level security;

drop policy if exists "buyers read own plan purchases" on public.plan_purchases;
create policy "buyers read own plan purchases" on public.plan_purchases
  for select using (auth.uid() = buyer_id or is_admin());

drop policy if exists "buyers submit own plan purchases" on public.plan_purchases;
create policy "buyers submit own plan purchases" on public.plan_purchases
  for insert with check (
    auth.uid() = buyer_id
    and status = 'pending'
    and reviewed_by is null
    and (
      kind = 'pro'
      or exists (
        select 1 from public.listings l
        where l.listing_id = plan_purchases.listing_id and l.seller_id = auth.uid()
      )
    )
  );

drop policy if exists "admins review plan purchases" on public.plan_purchases;
create policy "admins review plan purchases" on public.plan_purchases
  for update using (is_admin()) with check (is_admin());

-- ------------------------------------------------- column guards
-- Pro status, credits and boosts change only through the functions below
-- (which set kezmoto.plan_write) or an admin / the SQL editor.
create or replace function public.enforce_plan_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null or is_admin()
     or coalesce(current_setting('kezmoto.plan_write', true), '') = 'on' then
    return new;
  end if;

  if tg_table_name = 'profiles' then
    if new.pro_until is distinct from old.pro_until
       or new.boost_credits is distinct from old.boost_credits then
      raise exception 'Pro status and boost credits change only through an approved purchase.';
    end if;
  elsif tg_table_name = 'listings' then
    if tg_op = 'INSERT' then
      new.boosted_until := null;
    elsif new.boosted_until is distinct from old.boosted_until then
      raise exception 'A listing is boosted only through a boost purchase or credit.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_plan_columns on public.profiles;
create trigger profiles_enforce_plan_columns
  before update on public.profiles
  for each row execute function public.enforce_plan_columns();

drop trigger if exists listings_enforce_plan_columns on public.listings;
create trigger listings_enforce_plan_columns
  before insert or update on public.listings
  for each row execute function public.enforce_plan_columns();

-- ------------------------------------------------- free listing limit
-- A non-Pro customer may have at most 3 listings that are active or under
-- negotiation. Checked whenever a listing becomes one of those.
create or replace function public.enforce_free_listing_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller public.profiles%rowtype;
  open_count int;
begin
  if new.status not in ('active', 'under_negotiation') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('active', 'under_negotiation') then
    return new; -- already counted
  end if;

  select * into seller from public.profiles where profile_id = new.seller_id;
  if seller.role = 'admin' or (seller.pro_until is not null and seller.pro_until > now()) then
    return new;
  end if;

  select count(*) into open_count
  from public.listings
  where seller_id = new.seller_id
    and status in ('active', 'under_negotiation')
    and listing_id <> new.listing_id;

  if open_count >= 3 then
    raise exception 'KEZ_LISTING_LIMIT: Free accounts can have 3 active listings.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_free_limit on public.listings;
create trigger listings_free_limit
  before insert or update of status on public.listings
  for each row execute function public.enforce_free_listing_limit();

-- ------------------------------------------------- approval
create or replace function public.apply_plan_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  perform set_config('kezmoto.plan_write', 'on', true);

  if new.kind = 'pro' then
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + interval '30 days',
          boost_credits = boost_credits + 2
      where profile_id = new.buyer_id;
  elsif new.kind = 'boost' and new.listing_id is not null then
    update public.listings
      set boosted_until = greatest(coalesce(boosted_until, now()), now()) + interval '7 days'
      where listing_id = new.listing_id;
  end if;

  perform set_config('kezmoto.plan_write', 'off', true);
  return new;
end;
$$;

drop trigger if exists plan_purchases_apply on public.plan_purchases;
create trigger plan_purchases_apply
  after update of status on public.plan_purchases
  for each row execute function public.apply_plan_purchase();

-- ------------------------------------------------- spend a boost credit
create or replace function public.use_boost_credit(p_listing uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  credits int;
  until timestamptz;
begin
  if not exists (
    select 1 from public.listings
    where listing_id = p_listing and seller_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Only your own active listing can be boosted.';
  end if;

  select boost_credits into credits from public.profiles where profile_id = auth.uid() for update;
  if coalesce(credits, 0) < 1 then
    raise exception 'You have no boost credits left.';
  end if;

  perform set_config('kezmoto.plan_write', 'on', true);
  update public.profiles set boost_credits = boost_credits - 1 where profile_id = auth.uid();
  update public.listings
    set boosted_until = greatest(coalesce(boosted_until, now()), now()) + interval '7 days'
    where listing_id = p_listing
    returning boosted_until into until;
  perform set_config('kezmoto.plan_write', 'off', true);

  return until;
end;
$$;

revoke all on function public.use_boost_credit(uuid) from public;
grant execute on function public.use_boost_credit(uuid) to authenticated;
