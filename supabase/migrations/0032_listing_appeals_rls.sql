-- =========================================================================
-- KEZMOTO — Listing appeals (RLS)
-- Same shape as user_reports (0027): the seller can file and see their own
-- appeal, admins can see and review every appeal.
-- =========================================================================

alter table listing_appeals enable row level security;

drop policy if exists "sellers can file their own appeals" on listing_appeals;
create policy "sellers can file their own appeals" on listing_appeals
  for insert
  with check (
    auth.uid() = seller_id
    and exists (
      select 1 from listings
      where listings.listing_id = listing_appeals.listing_id
        and listings.seller_id = auth.uid()
    )
  );

drop policy if exists "sellers and admins can view appeals" on listing_appeals;
create policy "sellers and admins can view appeals" on listing_appeals
  for select using (auth.uid() = seller_id or is_admin());

drop policy if exists "admins can review appeals" on listing_appeals;
create policy "admins can review appeals" on listing_appeals
  for update using (is_admin()) with check (is_admin());

-- Make the API pick up the new table/columns immediately.
notify pgrst, 'reload schema';
