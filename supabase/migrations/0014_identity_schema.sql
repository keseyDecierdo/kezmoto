-- =========================================================================
-- KEZMOTO — Identity trust: Facebook + AI-verified valid ID
-- Gives the existing `profiles.verified` column (0001_schema.sql) its first
-- real meaning: true only once an uploaded ID's printed name has been
-- AI-matched against the account's full_name by the verify-id Edge
-- Function. `id_verification_note` holds the reason for the owner's own
-- eyes when it doesn't match — never surfaced to other users (mappers.ts
-- deliberately omits it from any "view someone else" read path, same as
-- email already is).
-- =========================================================================

alter table profiles
  add column if not exists facebook_url text,
  add column if not exists id_document_url text,
  add column if not exists id_verification_note text;

-- Private bucket for the ID photo itself. Policies (owner/admin-only read,
-- owner-only write) live in 0015_identity_rls.sql, same schema/RLS split
-- used by 0012/0013.
insert into storage.buckets (id, name, public)
values ('id-documents', 'id-documents', false)
on conflict (id) do update set public = excluded.public;
