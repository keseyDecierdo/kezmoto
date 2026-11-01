-- =========================================================================
-- KEZMOTO — Yearly Pro (₱1,490 / 365 days, 24 boost credits)
-- Adds 'pro_year' next to the monthly 'pro' purchase from 0036.
-- Run after 0036. Safe to re-run.
-- =========================================================================

alter table public.plan_purchases drop constraint if exists plan_purchases_kind_check;
alter table public.plan_purchases
  add constraint plan_purchases_kind_check check (kind in ('pro', 'pro_year', 'boost'));

drop policy if exists "buyers submit own plan purchases" on public.plan_purchases;
create policy "buyers submit own plan purchases" on public.plan_purchases
  for insert with check (
    auth.uid() = buyer_id
    and status = 'pending'
    and reviewed_by is null
    and (
      kind in ('pro', 'pro_year')
      or exists (
        select 1 from public.listings l
        where l.listing_id = plan_purchases.listing_id and l.seller_id = auth.uid()
      )
    )
  );

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
  elsif new.kind = 'pro_year' then
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + interval '365 days',
          boost_credits = boost_credits + 24
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
