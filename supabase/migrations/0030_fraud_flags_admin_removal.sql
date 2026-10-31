-- =========================================================================
-- KEZMOTO — Fraud flags: duplicate-posting check + admin removal reason
--
-- Two additions to the existing fraud_flags table (0012):
--   1. Two new flag_type values: 'duplicate_posting' (a new cross-seller
--      same-brand/model + same-photo rule in check-listing-fraud) and
--      'admin_removed' (an admin removing a listing ad hoc, with no prior
--      AI/rule flag — see the new SellerUnits admin page).
--   2. An `admin_note` column so an admin's typed reason for removing a
--      listing never overwrites `detail`, which already holds the
--      AI/rule-generated explanation for flags that have one.
-- =========================================================================

alter table fraud_flags drop constraint if exists fraud_flags_flag_type_check;
alter table fraud_flags add constraint fraud_flags_flag_type_check
  check (flag_type in (
    'low_price', 'duplicate_image', 'duplicate_listing', 'suspicious_text',
    'posting_pattern', 'duplicate_posting', 'admin_removed'
  ));

alter table fraud_flags add column if not exists admin_note text;

notify pgrst, 'reload schema';
