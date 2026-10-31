-- =========================================================================
-- KEZMOTO — Storage policies for the face-captures bucket
-- Exact mirror of 0015_identity_rls.sql's id-documents policies: readable
-- by the capture's own owner or an admin only, writable only by the owner.
-- No RLS changes needed on `profiles` itself — 0002_rls.sql's existing
-- "readable by everyone / writable by the owner" policies already cover
-- the new columns from 0024_face_verification_schema.sql correctly.
-- =========================================================================

drop policy if exists "owner or admin can read face captures" on storage.objects;
create policy "owner or admin can read face captures" on storage.objects
  for select to authenticated using (
    bucket_id = 'face-captures'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
    )
  );

drop policy if exists "users upload face captures to own folder" on storage.objects;
create policy "users upload face captures to own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'face-captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own face captures" on storage.objects;
create policy "users update own face captures" on storage.objects
  for update to authenticated using (
    bucket_id = 'face-captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own face captures" on storage.objects;
create policy "users delete own face captures" on storage.objects
  for delete to authenticated using (
    bucket_id = 'face-captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
