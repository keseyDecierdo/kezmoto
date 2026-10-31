-- =========================================================================
-- KEZMOTO — Phase 4 schema (manual GCash commission, no gateway)
-- KEZMOTO never touches the sale price — buyer and seller settle that
-- between themselves. The only money this schema ever tracks is KEZMOTO's
-- own commission, and there is no payment gateway involved: the seller pays
-- KEZMOTO's GCash number directly, attaches proof, and an admin manually
-- confirms it. `payments` is the record of that submission and review, not
-- a gateway event log.
-- =========================================================================

alter table transactions
  add column if not exists commission_amount numeric(10,2),
  add column if not exists commission_payer text check (commission_payer in ('buyer','seller','split')),
  add column if not exists commission_status text default 'pending' check (commission_status in ('pending','paid','failed','waived')),
  add column if not exists payment_reference text,
  -- KEZMOTO extension: Step 5 of the brief describes meetup scheduling in
  -- prose without giving SQL. One date/time + place per deal, not a list of
  -- anything, so it lives on the transaction rather than a new table.
  add column if not exists meetup_at timestamptz,
  add column if not exists meetup_location text;

-- PAYMENTS — a manual commission submission and its admin review, not a
-- gateway log. One row per attempt (a rejected attempt can be followed by a
-- fresh one).
create table if not exists payments (
  payment_id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(transaction_id) on delete cascade,
  payer_id uuid references profiles(profile_id),
  payment_type text check (payment_type in ('commission','full_sale_facilitated')),
  amount numeric(10,2) not null,
  currency text default 'PHP',
  reference_number text,               -- the GCash transaction reference the seller typed in
  proof_url text,                      -- storage path in the private payment-proofs bucket
  status text default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  confirmed_by uuid references profiles(profile_id), -- the admin who reviewed it
  confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists payments_transaction_idx on payments (transaction_id);

drop trigger if exists payments_set_updated_at on payments;
create trigger payments_set_updated_at
before update on payments
for each row execute function set_updated_at(); -- reuses the function from 0006

-- ---------------------------------------------------------------------
-- An admin confirming or rejecting a submission is the one action that
-- should also move the transaction's commission_status (and, on success,
-- its overall status) forward — one click, not two separate manual steps
-- that could be left inconsistent with each other.
--
-- security definer for the same reason 0008's refresh_rating_avg needed it:
-- a plain trigger runs with the caller's own privileges, and this UPDATE
-- targets `transactions`, a table the confirming admin is trusted to change
-- but which enforce_transaction_update (below) otherwise gates through its
-- own admin-assignment check. Definer rights make this sync reliable
-- regardless of that edge case, the same way the rating trigger needed to
-- reliably write a review's target profile regardless of who left it.
-- ---------------------------------------------------------------------
create or replace function sync_commission_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_type is distinct from 'commission' or new.status = old.status then
    return new;
  end if;

  if new.status = 'succeeded' then
    update transactions
    set commission_status = 'paid',
        status = case
          when status in ('verified', 'inspection_scheduled', 'inspection_done') then 'payment'
          else status
        end
    where transaction_id = new.transaction_id;
  elsif new.status = 'failed' then
    update transactions set commission_status = 'failed' where transaction_id = new.transaction_id;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_sync_commission_status on payments;
create trigger payments_sync_commission_status
after update on payments
for each row execute function sync_commission_status();

-- ---------------------------------------------------------------------
-- Extends enforce_transaction_update (0007). No service role/webhook exists
-- in this design — the trusted writer for commission fields is now the
-- assigned admin, exactly like every other transaction field (status,
-- agreed_price) already was. The only real rule that needs stating
-- explicitly is what buyers/sellers still can't touch, so commission_status/
-- payment_reference/commission_amount join meetup_at/meetup_location in
-- that list below.
-- ---------------------------------------------------------------------
create or replace function enforce_transaction_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  acting_is_admin boolean;
begin
  select (role = 'admin') into acting_is_admin from profiles where profile_id = auth.uid();

  if acting_is_admin and (old.admin_id is null or old.admin_id = auth.uid()) then
    return new;
  end if;

  if auth.uid() in (old.buyer_id, old.seller_id) then
    if old.status not in ('inquiry', 'negotiating') then
      raise exception 'Only the assigned admin can update this transaction once a middleman is involved.';
    end if;
    if new.chat_id is distinct from old.chat_id
      or new.listing_id is distinct from old.listing_id
      or new.buyer_id is distinct from old.buyer_id
      or new.seller_id is distinct from old.seller_id
      or new.admin_id is distinct from old.admin_id
      or new.agreed_price is distinct from old.agreed_price
      or new.status is distinct from old.status
      or new.meetup_at is distinct from old.meetup_at
      or new.meetup_location is distinct from old.meetup_location
      or new.commission_status is distinct from old.commission_status
      or new.payment_reference is distinct from old.payment_reference
      or new.commission_amount is distinct from old.commission_amount
    then
      raise exception 'Buyers and sellers can only update the proposed price.';
    end if;
    return new;
  end if;

  raise exception 'Not authorized to update this transaction.';
end;
$$;

-- ---------------------------------------------------------------------
-- Storage: proof-of-payment screenshots. Private bucket, same shape as
-- listing-documents in 0004_storage.sql — owner-prefixed upload path,
-- reads via a signed URL, open to any signed-in user rather than a
-- per-transaction participant check (storage RLS can't easily join to
-- `transactions`, and 0004 already accepted this same simplification for
-- OR/CR documents, so this stays consistent with that precedent).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "signed-in users can read payment proofs" on storage.objects;
create policy "signed-in users can read payment proofs" on storage.objects
  for select to authenticated using (bucket_id = 'payment-proofs');

drop policy if exists "users upload payment proofs to own folder" on storage.objects;
create policy "users upload payment proofs to own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own payment proofs" on storage.objects;
create policy "users update own payment proofs" on storage.objects
  for update to authenticated using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own payment proofs" on storage.objects;
create policy "users delete own payment proofs" on storage.objects
  for delete to authenticated using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
