-- =========================================================================
-- KEZMOTO - Direct sale: record the agreed meetup place
-- When there is no middleman, the seller's "Mark as sold" now saves the
-- agreed price AND the meetup place / time. enforce_transaction_update is
-- re-created from 0038 unchanged except for one exception: the seller may
-- set meetup_at / meetup_location only while closing a deal with no admin
-- (inquiry / negotiating -> completed). Run after 0038. Safe to re-run.
-- =========================================================================

create or replace function enforce_transaction_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  acting_is_admin boolean;
  acting uuid := auth.uid();
  -- 0040: the seller closing a deal that has no middleman may record the
  -- meetup place / time they agreed with the buyer.
  seller_closing_direct boolean := coalesce(
    acting = old.seller_id
    and old.admin_id is null
    and old.status in ('inquiry', 'negotiating')
    and new.status = 'completed',
    false);
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
      or (
        (new.meetup_at is distinct from old.meetup_at
          or new.meetup_location is distinct from old.meetup_location)
        and not seller_closing_direct
      )
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
