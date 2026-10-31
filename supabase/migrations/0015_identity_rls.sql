-- =========================================================================
-- KEZMOTO — Identity trust: storage policies for the id-documents bucket
-- No RLS changes needed on `profiles` itself — 0002_rls.sql's existing
-- "readable by everyone / writable by the owner" policies already cover
-- the new columns from 0014_identity_schema.sql correctly.
-- =========================================================================

-- Tighter than listing-documents (0004_storage.sql): readable by its owner
-- or an admin only, never "any signed-in user" — this is a government ID,
-- not an OR/CR a buyer is expected to review. Same admin-check pattern as
-- 0007_transactions_rls.sql / 0010_payments_rls.sql.
drop policy if exists "owner or admin can read id documents" on storage.objects;
create policy "owner or admin can read id documents" on storage.objects
  for select to authenticated using (
    bucket_id = 'id-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from profiles where profile_id = auth.uid() and role = 'admin')
    )
  );

drop policy if exists "users upload id documents to own folder" on storage.objects;
create policy "users upload id documents to own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'id-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own id documents" on storage.objects;
create policy "users update own id documents" on storage.objects
  for update to authenticated using (
    bucket_id = 'id-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own id documents" on storage.objects;
create policy "users delete own id documents" on storage.objects
  for delete to authenticated using (
    bucket_id = 'id-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
