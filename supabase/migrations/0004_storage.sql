-- =========================================================================
-- KEZMOTO — Storage buckets and policies
-- Upload paths are always `{profile_id}/{listing or draft}/{file}`, so the
-- first path segment is the owner check.
--
-- listing-photos    public  — bike photos render on public cards
-- listing-documents private — OR/CR scans; reachable only through a short-lived
--                             signed URL created for a signed-in user
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('listing-documents', 'listing-documents', false)
on conflict (id) do update set public = excluded.public;

-- ------------------------------------------------------------ photos
drop policy if exists "listing photos are publicly readable" on storage.objects;
create policy "listing photos are publicly readable" on storage.objects
  for select using (bucket_id = 'listing-photos');

drop policy if exists "users upload photos to own folder" on storage.objects;
create policy "users upload photos to own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own photos" on storage.objects;
create policy "users update own photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own photos" on storage.objects;
create policy "users delete own photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------- documents
-- Signed-in users can read (so the app can mint a signed URL for a listing
-- they are viewing); anonymous visitors cannot, and there is no public URL.
-- A stricter version — signing only after checking the listing is active —
-- needs an Edge Function and belongs to the later hardening pass.
drop policy if exists "signed-in users can read listing documents" on storage.objects;
create policy "signed-in users can read listing documents" on storage.objects
  for select to authenticated using (bucket_id = 'listing-documents');

drop policy if exists "users upload documents to own folder" on storage.objects;
create policy "users upload documents to own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'listing-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own documents" on storage.objects;
create policy "users update own documents" on storage.objects
  for update to authenticated using (
    bucket_id = 'listing-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own documents" on storage.objects;
create policy "users delete own documents" on storage.objects
  for delete to authenticated using (
    bucket_id = 'listing-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
