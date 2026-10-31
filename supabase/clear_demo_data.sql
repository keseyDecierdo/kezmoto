-- =========================================================================
-- KEZMOTO — clear demo/seed/test data
-- Run once in the Supabase SQL Editor. Deletes only the specific rows
-- listed below (identified during a live inventory of the project on
-- 2026-09-04) — never a table-wide delete. Does NOT touch profiles/accounts,
-- schema, RLS, or storage buckets (storage objects for these listings were
-- already removed separately). Safe to re-run: each statement is a no-op
-- once its rows are gone.
--
-- Order matters — children are deleted before the parents they reference.
-- =========================================================================

delete from payments where payment_id in (
  'f0172cc0-0d4c-49c9-9040-439eea713061'
);

delete from reviews where review_id in (
  'db66885c-37eb-4af7-88ca-3df26216b811'
);

delete from transactions where transaction_id in (
  '1fc373ca-b4c3-4a15-9f01-1f81add9faa1',
  'cc8dc633-3fd0-4682-ae62-f9014d2dc768'
);

delete from messages where chat_id in (
  'ab039084-f253-40b0-ba4c-943113cab62b',
  'd2214d01-7e59-4c86-a5d7-b6fd268767a1'
);

delete from chats where chat_id in (
  'ab039084-f253-40b0-ba4c-943113cab62b',
  'd2214d01-7e59-4c86-a5d7-b6fd268767a1'
);

delete from fraud_flags where fraud_flag_id in (
  '07b73501-ac90-496f-b017-d1d8886c7cee'
);

delete from ai_chatbot_logs where ai_chatbot_log_id in (
  '2ad13e58-745d-418e-ae46-d1a3e759657e'
);

delete from document_redactions where listing_id in (
  'a359282a-b71b-4b4c-8011-69668387b1e8', -- Kawasaki Ninja 400 (seed)
  '27ddbdc9-f7da-4a20-888b-d2c8d62de376', -- Suzuki Raider R150 (seed)
  '16bbcdb3-d02f-470b-ae39-be5cfd9388fd', -- Honda CBR150R (seed)
  '1b77d14b-318b-4842-8d81-d0863413d8dc', -- Yamaha YZF-R15 V3 (seed)
  'ecf9448d-ba26-44ad-b4f5-bb7325e098ec', -- Yamaha 4827432 (test)
  '0bed8c87-4983-4ef2-bff7-9b701ef92e13', -- TestBrand Upload Verify 100 (test)
  '48babb9f-0981-4d9c-8ca7-c2216b7ff690'  -- Throwaway DeleteProbe (test)
);

delete from wanted_posts where wanted_post_id in (
  '50eea8d4-b14b-4c5e-9459-c7f6ece42ddf', -- Honda Click 160 (seed)
  'bf391766-6032-42f8-aee5-9a5b1fd059b6'  -- Yamaha Mio Gear (seed)
);

delete from listings where listing_id in (
  'a359282a-b71b-4b4c-8011-69668387b1e8',
  '27ddbdc9-f7da-4a20-888b-d2c8d62de376',
  '16bbcdb3-d02f-470b-ae39-be5cfd9388fd',
  '1b77d14b-318b-4842-8d81-d0863413d8dc',
  'ecf9448d-ba26-44ad-b4f5-bb7325e098ec',
  '0bed8c87-4983-4ef2-bff7-9b701ef92e13',
  '48babb9f-0981-4d9c-8ca7-c2216b7ff690'
);
