-- =========================================================================
-- KEZMOTO — Wanted posts: missing delete policy
-- 0002_rls.sql gave wanted_posts select/insert/update policies but no
-- delete — an author had no way to remove their own post. Same owner
-- check already used for update.
-- =========================================================================

drop policy if exists "buyers can delete own wanted posts" on wanted_posts;
create policy "buyers can delete own wanted posts" on wanted_posts
  for delete using (auth.uid() = buyer_id);
