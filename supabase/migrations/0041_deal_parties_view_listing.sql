-- =========================================================================
-- KEZMOTO - People in a deal can always see its unit
-- Before this, a listing was readable only while active (or sold, if 0033
-- was applied) or by its own seller. Once a unit was sold, the BUYER could
-- no longer read it, so their Transactions > View details had no photo or
-- unit details while the seller's did.
-- This adds one more read rule: anyone in a chat or transaction about the
-- listing (buyer, seller, assigned admin) may read it, whatever its status.
-- Public visibility is unchanged. Safe to re-run.
-- =========================================================================

-- security definer: checks chats / transactions without re-entering
-- listings' own policies.
create or replace function public.is_listing_party(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chats c
    where c.listing_id = p_listing
      and auth.uid() in (c.buyer_id, c.seller_id, c.admin_id)
  ) or exists (
    select 1 from public.transactions t
    where t.listing_id = p_listing
      and auth.uid() in (t.buyer_id, t.seller_id, t.admin_id)
  );
$$;

revoke all on function public.is_listing_party(uuid) from public;
grant execute on function public.is_listing_party(uuid) to authenticated;

drop policy if exists "deal parties can view the listing" on public.listings;
create policy "deal parties can view the listing" on public.listings
  for select using (public.is_listing_party(listing_id));
