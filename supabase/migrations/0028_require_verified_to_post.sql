-- =========================================================================
-- KEZMOTO — Only verified customers (or admins) can post a unit
-- "verified" = valid-ID name match AND face scan, written only by the
-- verify-id / face-match Edge Functions. Needs 0026 (is_admin helper style).
-- =========================================================================

create or replace function is_verified_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (coalesce(verified, false) or role = 'admin')
       from profiles where profile_id = auth.uid()),
    false
  );
$$;

-- RESTRICTIVE: ANDed with the existing "sellers can insert own listings".
drop policy if exists "only verified users can create listings" on listings;
create policy "only verified users can create listings" on listings
  as restrictive for insert with check (is_verified_or_admin());

notify pgrst, 'reload schema';
