-- =========================================================================
-- KEZMOTO - Free plan: 3 posts in total (sold ones count)
-- 0036 limited free sellers to 3 listings that were *still for sale*, so a
-- sold unit freed its slot and the seller could keep posting. Now a free
-- (non-Pro) customer may create at most 3 listings in total, whatever their
-- status - active, reserved, sold or removed. Pro and admins: unlimited.
-- Only new posts are checked; editing or re-activating an existing unit is
-- never blocked. Run after 0036. Safe to re-run.
-- =========================================================================

create or replace function public.enforce_free_listing_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller public.profiles%rowtype;
  posted int;
begin
  select * into seller from public.profiles where profile_id = new.seller_id;
  if seller.role = 'admin' or (seller.pro_until is not null and seller.pro_until > now()) then
    return new;
  end if;

  select count(*) into posted
  from public.listings
  where seller_id = new.seller_id;

  if posted >= 3 then
    raise exception 'KEZ_LISTING_LIMIT: Free accounts can post 3 units in total.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- New posts only (0036 also checked status updates; no longer needed).
drop trigger if exists listings_free_limit on public.listings;
create trigger listings_free_limit
  before insert on public.listings
  for each row execute function public.enforce_free_listing_limit();
