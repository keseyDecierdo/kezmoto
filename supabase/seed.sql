-- =========================================================================
-- KEZMOTO — Optional demo data
-- Run this AFTER registering kez@kezmoto.app and admin@kezmoto.app through
-- the app, so the marketplace has something in it on first run.
--
-- The artwork paths point at the SVGs in public/mock/, which the storage
-- resolver passes through untouched — nothing is uploaded by this script.
-- Safe to re-run: it clears its own seeded rows first.
-- =========================================================================

do $$
declare
  kez uuid;
  admin_id uuid;
begin
  select id into kez from auth.users where email = 'kez@kezmoto.app';
  select id into admin_id from auth.users where email = 'admin@kezmoto.app';

  if kez is null then
    raise exception 'Register kez@kezmoto.app in the app first, then re-run this seed.';
  end if;

  -- Promote the admin account if it exists.
  if admin_id is not null then
    update profiles set role = 'admin', full_name = coalesce(nullif(full_name, ''), 'KEZMOTO Admin')
    where profile_id = admin_id;
  end if;

  update profiles
  set verified = true,
      bio = 'Weekend rider. Selling my second unit to fund a bigger displacement build.'
  where profile_id = kez;

  delete from listings where seller_id = kez and description like '[seed]%';
  delete from wanted_posts where buyer_id = kez and notes like '[seed]%';

  insert into listings (
    seller_id, brand, model, year, mileage, price, location, reason_for_sale,
    description, admin_assisted, engine_status, brake_status, tire_status,
    light_status, photos, documents, status
  ) values
  (
    kez, 'Yamaha', 'YZF-R15 V3', 2021, 14200, 92000, 'Lapu-Lapu City, Cebu',
    'Upgrading to a 400cc unit, need the funds for the down payment.',
    '[seed] Dealer-maintained R15 V3 with complete service records. Registered until March 2027.',
    true,
    'Smooth idle, no valve tick. Changed oil every 2,000 km.',
    'Front and rear pads replaced last month, ABS working.',
    'Original Michelin, roughly 70% thread left.',
    'All stock, headlight and signals fully functional.',
    array['/mock/bike-01.svg','/mock/bike-01-b.svg','/mock/bike-01-c.svg','/mock/bike-02.svg','/mock/bike-02-b.svg'],
    array['/mock/doc-or.svg','/mock/doc-cr.svg'],
    'active'
  ),
  (
    kez, 'Honda', 'CBR150R', 2020, 21800, 78500, 'Cebu City, Cebu',
    'Second unit, rarely used since I ride the R15 daily.',
    '[seed] Clean CBR150R kept in a covered garage. Minor scuff on the right fairing, photographed honestly.',
    false,
    'Quiet, slight tick when cold that clears after a minute.',
    'Rear pads at about 50%, front recently bled.',
    'Rear replaced Jan 2026, front at 60%.',
    'LED headlight upgrade, stock signals.',
    array['/mock/bike-02.svg','/mock/bike-02-b.svg','/mock/bike-02-c.svg','/mock/bike-03.svg','/mock/bike-03-b.svg'],
    array['/mock/doc-or.svg','/mock/doc-cr.svg'],
    'active'
  ),
  (
    kez, 'Kawasaki', 'Ninja 400', 2019, 32400, 245000, 'Mandaue City, Cebu',
    'Moving abroad next quarter.',
    '[seed] Big-bike ready Ninja 400 with fresh chain and sprocket set.',
    true,
    'Strong pull through the range, no smoke.',
    'Braided lines fitted, pads at 80%.',
    'Both replaced 3,000 km ago.',
    'Stock lighting, all working.',
    array['/mock/bike-04.svg','/mock/bike-04-b.svg','/mock/bike-04-c.svg','/mock/bike-05.svg','/mock/bike-05-b.svg'],
    array['/mock/doc-or.svg','/mock/doc-deed.svg'],
    'active'
  ),
  (
    kez, 'Suzuki', 'Raider R150', 2022, 8600, 96000, 'Talisay City, Cebu',
    'Bought a scooter for city commutes.',
    '[seed] Low-mileage Raider, still on original tires.',
    false,
    'Crisp throttle response, recently tuned.',
    'Stock brakes, pads barely worn.',
    'Original tires at 85%.',
    'Complete and working.',
    array['/mock/bike-06.svg','/mock/bike-06-b.svg','/mock/bike-06-c.svg','/mock/bike-07.svg','/mock/bike-07-b.svg'],
    array['/mock/doc-or.svg','/mock/doc-cr.svg'],
    'active'
  );

  -- Document labels (and, later, redaction boxes) for the seeded listings.
  insert into document_redactions (listing_id, document_url, label, redaction_regions)
  select l.listing_id,
         d.document_url,
         case
           when d.document_url like '%doc-or%' then 'Official Receipt (OR)'
           when d.document_url like '%doc-cr%' then 'Certificate of Registration (CR)'
           else 'Deed of Sale'
         end,
         '[]'::jsonb
  from listings l
  cross join lateral unnest(l.documents) as d(document_url)
  where l.seller_id = kez and l.description like '[seed]%'
  on conflict (listing_id, document_url) do nothing;

  insert into wanted_posts (
    buyer_id, preferred_brand, preferred_model, budget_min, budget_max, location, notes, status
  ) values
  (kez, 'Honda', 'Click 160', 70000, 95000, 'Cebu City, Cebu',
   '[seed] Looking for a low-mileage unit with complete papers. Can pay cash.', 'open'),
  (kez, 'Yamaha', 'Mio Gear', 45000, 60000, 'Mandaue City, Cebu',
   '[seed] For my daily commute — flood-free units only, please.', 'open');
end $$;
