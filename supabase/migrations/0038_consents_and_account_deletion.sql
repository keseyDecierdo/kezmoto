-- =========================================================================
-- KEZMOTO — Consent records and "Delete my account"
-- (Data Privacy Act of 2012 / RA 10173)
--
-- * profiles.terms_accepted_at / terms_version: set at sign-up when the
--   user ticks "I agree to the Terms of Service and Privacy Policy".
-- * profiles.biometric_consent_at: set when the user agrees, before the ID
--   and face scan, that their ID and face photos are processed for
--   verification (including by Google Gemini).
-- * delete_my_account(): removes the caller's account and personal data.
--   Commission / plan payment records are kept but anonymised (accounting).
-- Run after 0035–0037. Safe to re-run.
-- =========================================================================

alter table public.profiles
  add column if not exists terms_accepted_at   timestamptz,
  add column if not exists terms_version       text,
  add column if not exists biometric_consent_at timestamptz;

-- ------------------------------------------------------------ sign-up
-- Same as 0035, plus the consent fields.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  raw_sex text := lower(nullif(trim(meta ->> 'sex'), ''));
  raw_birthdate text := nullif(trim(meta ->> 'birthdate'), '');
  raw_terms text := nullif(trim(meta ->> 'terms_version'), '');
begin
  insert into public.profiles (
    profile_id, role, full_name, phone, address,
    first_name, middle_name, last_name, sex, birthdate,
    region, province, city, barangay, street,
    terms_version, terms_accepted_at
  )
  values (
    new.id,
    'customer',                                   -- admins are promoted manually
    coalesce(meta ->> 'full_name', ''),
    coalesce(meta ->> 'phone', ''),
    coalesce(meta ->> 'address', ''),
    nullif(trim(meta ->> 'first_name'), ''),
    nullif(trim(meta ->> 'middle_name'), ''),
    nullif(trim(meta ->> 'last_name'), ''),
    case when raw_sex in ('male', 'female') then raw_sex end,
    case when raw_birthdate ~ '^\d{4}-\d{2}-\d{2}$' then raw_birthdate::date end,
    nullif(trim(meta ->> 'region'), ''),
    nullif(trim(meta ->> 'province'), ''),
    nullif(trim(meta ->> 'city'), ''),
    nullif(trim(meta ->> 'barangay'), ''),
    nullif(trim(meta ->> 'street'), ''),
    raw_terms,
    case when raw_terms is not null then now() end
  )
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

-- ------------------------------------------------ ID / face consent
create or replace function public.record_biometric_consent()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  stamped timestamptz;
begin
  update public.profiles
    set biometric_consent_at = coalesce(biometric_consent_at, now())
    where profile_id = auth.uid()
    returning biometric_consent_at into stamped;
  return stamped;
end;
$$;

revoke all on function public.record_biometric_consent() from public;
grant execute on function public.record_biometric_consent() to authenticated;

-- ------------------------------------------------ deal guard bypass
-- Same as 0034, plus one early exit used only inside delete_my_account().
create or replace function enforce_transaction_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  acting_is_admin boolean;
  acting uuid := auth.uid();
begin
  -- delete_my_account() (0038) anonymises the leaving user's deals.
  if coalesce(current_setting('kezmoto.account_delete', true), '') = 'on' then
    return new;
  end if;

  select (role = 'admin') into acting_is_admin from profiles where profile_id = acting;

  if acting_is_admin and (old.admin_id is null or old.admin_id = acting) then
    return new;
  end if;

  if acting in (old.buyer_id, old.seller_id) then
    if old.status not in ('inquiry', 'negotiating') then
      raise exception 'Only the assigned admin can update this transaction once a middleman is involved.';
    end if;

    -- Never editable by buyer/seller.
    if new.chat_id is distinct from old.chat_id
      or new.listing_id is distinct from old.listing_id
      or new.buyer_id is distinct from old.buyer_id
      or new.seller_id is distinct from old.seller_id
      or new.admin_id is distinct from old.admin_id
      or new.meetup_at is distinct from old.meetup_at
      or new.meetup_location is distinct from old.meetup_location
      or new.commission_status is distinct from old.commission_status
      or new.payment_reference is distinct from old.payment_reference
      or new.commission_amount is distinct from old.commission_amount
    then
      raise exception 'Buyers and sellers can only make, accept or close a price offer.';
    end if;

    -- Making / changing an offer stamps yourself as the proposer;
    -- withdrawing or declining clears both fields together.
    if new.proposed_price is distinct from old.proposed_price
      or new.proposed_by is distinct from old.proposed_by
    then
      if not (
        (new.proposed_price is not null and new.proposed_by = acting)
        or (new.proposed_price is null and new.proposed_by is null)
      ) then
        raise exception 'An offer must be made in your own name.';
      end if;
    end if;

    -- Closing the sale: only the seller, only to "completed", with a price.
    if new.status is distinct from old.status then
      if not (acting = old.seller_id and new.status = 'completed' and new.agreed_price is not null) then
        raise exception 'Only the seller can close the deal, by marking the unit sold.';
      end if;
    end if;

    -- The agreed price changes only by accepting the OTHER party's offer
    -- at exactly that amount, or by the seller closing the sale.
    if new.agreed_price is distinct from old.agreed_price then
      if not (
        (old.proposed_by is not null
          and old.proposed_by <> acting
          and new.agreed_price = old.proposed_price)
        or (acting = old.seller_id and new.status = 'completed')
      ) then
        raise exception 'You can only accept the other side''s offer.';
      end if;
    end if;

    return new;
  end if;

  raise exception 'Not authorized to update this transaction.';
end;
$$;

-- ------------------------------------------------ delete my account
-- Deletes the caller's login, profile, listings, wanted posts, favorites,
-- chats (and their messages), reviews, reports, notifications and AI logs.
-- Payment rows (commission, Pro, Boosts) lose the link to the person but
-- keep amount and date. Uploaded files are removed by the app first.
-- p_dry_run = true runs only the checks, so the app can stop before it
-- removes any uploaded files.
drop function if exists public.delete_my_account();
create or replace function public.delete_my_account(p_dry_run boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Log in to delete your account.';
  end if;
  if exists (select 1 from public.profiles where profile_id = me and role = 'admin') then
    raise exception 'Admin accounts cannot be deleted from the app. Ask another admin.';
  end if;
  if exists (
    select 1 from public.transactions
    where (buyer_id = me or seller_id = me)
      and status not in ('completed', 'cancelled')
  ) then
    raise exception 'KEZ_OPEN_DEAL: Finish or cancel your open deals before deleting your account.';
  end if;
  if p_dry_run then
    return;
  end if;

  perform set_config('kezmoto.account_delete', 'on', true);

  -- Payment records stay (anonymised) for accounting.
  update public.payments set payer_id = null where payer_id = me;
  update public.plan_purchases set listing_id = null
    where listing_id in (select listing_id from public.listings where seller_id = me);

  -- Deals: keep the finished record without the person or their chat.
  update public.transactions
    set buyer_id = case when buyer_id = me then null else buyer_id end,
        seller_id = case when seller_id = me then null else seller_id end,
        proposed_by = case when proposed_by = me then null else proposed_by end,
        chat_id = case
          when chat_id in (select chat_id from public.chats where buyer_id = me or seller_id = me) then null
          else chat_id end,
        listing_id = case
          when listing_id in (select listing_id from public.listings where seller_id = me) then null
          else listing_id end
    where buyer_id = me or seller_id = me or proposed_by = me
       or listing_id in (select listing_id from public.listings where seller_id = me);

  delete from public.reviews where reviewer_id = me or reviewee_id = me;
  delete from public.user_reports where reporter_id = me or reported_user_id = me;

  delete from public.messages
    where sender_id = me
       or chat_id in (
         select chat_id from public.chats
         where buyer_id = me or seller_id = me
            or listing_id in (select listing_id from public.listings where seller_id = me)
       );
  delete from public.chats
    where buyer_id = me or seller_id = me
       or listing_id in (select listing_id from public.listings where seller_id = me);

  delete from public.ai_chatbot_logs
    where user_id = me
       or listing_id in (select listing_id from public.listings where seller_id = me);
  delete from public.listing_appeals where seller_id = me;
  delete from public.fraud_flags
    where listing_id in (select listing_id from public.listings where seller_id = me);

  -- Profile (and its listings, wanted posts, favorites, notifications,
  -- plan purchases) cascades from the login.
  delete from auth.users where id = me;
  perform set_config('kezmoto.account_delete', 'off', true);
end;
$$;

revoke all on function public.delete_my_account(boolean) from public;
grant execute on function public.delete_my_account(boolean) to authenticated;
