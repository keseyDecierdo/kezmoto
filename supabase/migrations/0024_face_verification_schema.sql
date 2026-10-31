-- =========================================================================
-- KEZMOTO — Two-step identity verification: ID type + face match
--
-- Extends 0014_identity_schema.sql's single-step "AI reads the name off an
-- ID photo" flow into two steps: (1) the same name-match check, now also
-- recording which kind of ID was submitted, and (2) a live selfie compared
-- against that ID photo's face.
--
-- `verified` keeps its existing meaning to every other screen (the badge
-- everyone already reads) but now requires BOTH steps — `id_name_matched`
-- carries what `verified` used to mean alone, and `face_verified` is the
-- new second factor. Both writes happen server-side (verify-id and the new
-- face-match Edge Function, both service-role), so no trigger is needed to
-- combine them — whichever function runs reads the other flag itself
-- before writing `verified`.
--
-- Backfill: anyone already `verified` under the old one-step rule already
-- passed a name match, so `id_name_matched` inherits that — this migration
-- does NOT touch `verified` itself, so no existing account is silently
-- unverified by this change. An existing verified user simply won't show
-- "fully verified" again until they also complete the new face-scan step,
-- the next time verify-id or face-match recomputes `verified`.
-- =========================================================================

alter table profiles
  add column if not exists id_type text check (id_type in ('national_id', 'drivers_license')),
  add column if not exists id_name_matched boolean default false,
  add column if not exists face_verified boolean default false,
  add column if not exists face_verification_note text,
  add column if not exists face_capture_url text;

update profiles set id_name_matched = true where verified = true and id_name_matched is distinct from true;

-- Private bucket for the live selfie capture — same shape as id-documents
-- (0014): never public, biometric, owner/admin-only. Policies live in
-- 0025_face_verification_rls.sql.
insert into storage.buckets (id, name, public)
values ('face-captures', 'face-captures', false)
on conflict (id) do update set public = excluded.public;
