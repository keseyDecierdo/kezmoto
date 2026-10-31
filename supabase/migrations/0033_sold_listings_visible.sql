-- =========================================================================
-- KEZMOTO — Sold listings stay visible to everyone
--
-- Before this, the SELECT policy only let a listing through to a non-owner
-- while status = 'active' (0002). That's inconsistent with the client,
-- which already has a "Sold" status filter on Home (src/pages/Home.tsx) —
-- sold units were simply never reaching anyone but their own seller.
-- Reserved (under_negotiation) and draft stay exactly as restricted as
-- before; only 'sold' is added to the publicly-visible set.
-- =========================================================================

drop policy if exists "active listings are viewable by everyone" on listings;
create policy "active and sold listings are viewable by everyone" on listings
  for select using (status in ('active', 'sold') or auth.uid() = seller_id);
