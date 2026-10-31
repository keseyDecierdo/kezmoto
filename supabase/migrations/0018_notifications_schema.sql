-- Notifications feed. One row per event a user should see a bell badge for.
create table notifications (
  notification_id uuid primary key default gen_random_uuid(),
  recipient_id uuid references profiles(profile_id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read boolean default false,
  created_at timestamptz default now()
);

create index notifications_recipient_created_idx on notifications (recipient_id, created_at desc);
