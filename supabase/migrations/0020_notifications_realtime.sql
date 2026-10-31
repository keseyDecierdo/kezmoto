-- =========================================================================
-- KEZMOTO — Realtime for notifications
-- The bell subscribes to INSERTs for the signed-in viewer, so a new
-- notification (new message, listing marked sold) appears live without a
-- manual refresh — same pattern as chat messages and transactions.
-- =========================================================================

do $$
begin
  begin
    alter publication supabase_realtime add table notifications;
  exception when duplicate_object then null;
  end;
end $$;
