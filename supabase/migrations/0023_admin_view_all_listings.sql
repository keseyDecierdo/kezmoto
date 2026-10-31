-- =========================================================================
-- KEZMOTO — Admins can view every listing, not just active ones
--
-- Root cause of the blank "Unit" column on the admin Reports page: listings
-- has exactly one SELECT policy (0002) — `status = 'active' or auth.uid()
-- = seller_id`. transactionsApi embeds `listing:listings(brand, model,
-- year, photos)` as a join, and PostgREST/RLS silently returns that joined
-- resource as null (not an error) once it fails the listing's own RLS
-- check. The moment a deal is far enough along to be worth reporting on
-- (commission paid, or completed), its listing has almost always already
-- flipped to 'sold' (see 0021's sync_listing_sold_status), so it no longer
-- satisfies `status = 'active'` — and the viewing admin is essentially
-- never that listing's seller_id either. Net effect: row.listing comes
-- back null for exactly the transactions Reports cares about, and
-- listingTitle/listingPhoto end up blank.
--
-- Mirrors the "any admin can view all transactions" / "any admin can view
-- all payments" policies already added in 0010 for the same reporting
-- reason — additive, widens read access only, never touches the existing
-- write policies (sellers still can only insert/update their own listings).
-- =========================================================================

drop policy if exists "any admin can view all listings" on listings;
create policy "any admin can view all listings" on listings
  for select using (
    exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
  );
