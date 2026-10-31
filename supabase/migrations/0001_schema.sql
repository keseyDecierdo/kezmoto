-- =========================================================================
-- KEZMOTO — Phase 2 schema
-- Run order: 0001_schema → 0002_rls → 0003_auth_trigger → 0004_storage
--            → 0005_realtime
--
-- Primary keys follow the `table_name + _id` convention.
--
-- Columns marked `KEZMOTO extension` are not in the Phase 2 spec sheet; they
-- exist because a Phase 1 screen already renders that value and the brief was
-- to change the data layer without changing the UI. Each one names the screen
-- that needs it.
-- =========================================================================

-- PROFILES (extends Supabase auth.users)
create table profiles (
  profile_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer','admin')),
  full_name text,
  phone text,
  profile_photo_url text,
  address text,
  verified boolean default false,
  rating_avg numeric(2,1) default 0,
  bio text,                          -- KEZMOTO extension: Profile → "About you"
  created_at timestamptz default now()
);

-- LISTINGS
create table listings (
  listing_id uuid primary key default gen_random_uuid(),
  seller_id uuid references profiles(profile_id) on delete cascade,
  brand text not null,
  model text not null,
  year int not null,
  mileage int,
  price numeric(10,2) not null,
  location text,
  reason_for_sale text,
  description text,                  -- KEZMOTO extension: Unit form step 4 / Listing Detail
  admin_assisted boolean default false, -- KEZMOTO extension: "Assisted" badge + Request Middleman
  engine_status text,
  brake_status text,
  tire_status text,
  light_status text,
  photos text[] not null,            -- storage paths, min 5 enforced in app logic
  documents text[],                  -- OR/CR storage paths (private bucket)
  document_blur_applied boolean default false,
  listing_quality_score int,         -- populated in a later phase
  condition_score int,               -- populated in a later phase
  status text default 'active' check (status in ('draft','active','under_negotiation','sold','removed')),
  created_at timestamptz default now()
);

create index listings_seller_id_idx on listings (seller_id);
create index listings_status_created_at_idx on listings (status, created_at desc);

-- WANTED POSTS
create table wanted_posts (
  wanted_post_id uuid primary key default gen_random_uuid(),
  buyer_id uuid references profiles(profile_id) on delete cascade,
  preferred_brand text,
  preferred_model text,
  budget_min numeric(10,2),
  budget_max numeric(10,2),
  location text,
  notes text,
  status text default 'open' check (status in ('open','matched','closed')),
  created_at timestamptz default now()
);

-- CHATS
create table chats (
  chat_id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(listing_id),
  buyer_id uuid references profiles(profile_id),
  seller_id uuid references profiles(profile_id),
  admin_id uuid references profiles(profile_id),
  status text default 'active' check (status in ('active','middleman_requested','middleman_joined','closed')),
  buyer_last_read_at timestamptz,    -- KEZMOTO extension: unread badge in Messages
  seller_last_read_at timestamptz,   -- KEZMOTO extension: unread badge in Messages
  created_at timestamptz default now()
);

-- One thread per buyer/listing pair, which is what openThreadForListing assumes.
create unique index chats_listing_buyer_idx on chats (listing_id, buyer_id);
create index chats_buyer_idx on chats (buyer_id);
create index chats_seller_idx on chats (seller_id);

-- MESSAGES
create table messages (
  message_id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(chat_id) on delete cascade,
  sender_id uuid references profiles(profile_id),
  sender_role text check (sender_role in ('customer','admin')),
  message_text text not null,
  is_system boolean default false,   -- KEZMOTO extension: centred system pill in the thread
  created_at timestamptz default now()
);

create index messages_chat_id_created_at_idx on messages (chat_id, created_at);

-- FAVORITES
create table favorites (
  favorite_id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(profile_id) on delete cascade,
  listing_id uuid references listings(listing_id) on delete cascade,
  created_at timestamptz default now(),
  unique (profile_id, listing_id)
);

-- DOCUMENT REDACTIONS
-- One row per uploaded document, even with an empty region list: this table
-- also carries the document's label, which the Phase 1 UI renders.
create table document_redactions (
  document_redaction_id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(listing_id) on delete cascade,
  document_url text not null,
  label text,                        -- KEZMOTO extension: caption under the document
  redaction_regions jsonb not null default '[]'::jsonb,  -- [{id,x,y,width,height}] as 0–1 fractions
  created_at timestamptz default now(),
  unique (listing_id, document_url)
);

create index document_redactions_listing_idx on document_redactions (listing_id);
