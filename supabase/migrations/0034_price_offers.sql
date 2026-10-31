-- =========================================================================
-- KEZMOTO — In-chat price offers
-- A unit listed at ₱43,000 can now be agreed at ₱40,000 inside the chat:
-- either party makes an offer (proposed_price + proposed_by), the OTHER
-- party accepts it (agreed_price := proposed_price), and the seller's
-- "Mark as sold" closes the deal at the final price (status := completed).
-- Commission is already derived from agreed_price, so it follows.
--
-- Extends enforce_transaction_update (last defined in 0009). The admin
-- branch is unchanged; once a middleman is involved (status beyond
-- inquiry/negotiating) buyers and sellers still can't touch anything.
-- Run after 0033.
-- =========================================================================

alter table transactions
  add column if not exists proposed_by uuid references profiles(profile_id);

create or replace function enforce_transaction_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  acting_is_admin boolean;
  acting uuid := auth.uid();
begin
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
