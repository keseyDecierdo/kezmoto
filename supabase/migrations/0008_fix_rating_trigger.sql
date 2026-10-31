-- =========================================================================
-- KEZMOTO — Fix: profiles.rating_avg never updated
--
-- refresh_rating_avg() ran as SECURITY INVOKER, so its `update profiles`
-- was itself subject to profiles' own RLS policy (`auth.uid() = profile_id`)
-- — meaning the update silently affected 0 rows whenever the reviewer
-- (the caller) wasn't also the reviewee, which is every real review. Live
-- test: reviewing another account left their rating_avg at 0.
--
-- Run this once against a project that already has 0006/0007 applied.
-- A fresh project can skip this file — 0006 already has the fix inline.
-- =========================================================================

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

-- Re-point the trigger at the corrected function definition — create or
-- replace above already updated the function in place, so this is only
-- here to make the fix's effect explicit and keep the file self-contained.
drop trigger if exists reviews_refresh_rating_avg on reviews;
create trigger reviews_refresh_rating_avg
after insert or update or delete on reviews
for each row execute function refresh_rating_avg();

-- Backfill: recompute every profile's rating_avg from whatever reviews
-- already exist, since none of them took effect before this fix.
update profiles p
set rating_avg = coalesce(
  (select round(avg(r.rating)::numeric, 1) from reviews r where r.reviewee_id = p.profile_id),
  0
);
