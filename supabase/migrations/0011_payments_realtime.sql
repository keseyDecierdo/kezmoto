-- =========================================================================
-- KEZMOTO — Realtime for payments
-- The Transaction Tracker subscribes to its own transaction row, so an
-- admin's confirm/reject decision (which sync_commission_status reflects
-- onto commission_status/status) appears for the seller without a manual
-- refresh.
-- =========================================================================

do $$
begin
  begin
    alter publication supabase_realtime add table transactions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table payments;
  exception when duplicate_object then null;
  end;
end $$;
