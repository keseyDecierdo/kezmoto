-- Chat image attachments. A message can now carry an image instead of (or
-- alongside) text, so message_text can no longer be required.
alter table messages add column image_path text;
alter table messages alter column message_text drop not null;
