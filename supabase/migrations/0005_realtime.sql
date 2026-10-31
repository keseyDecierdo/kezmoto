-- =========================================================================
-- KEZMOTO — Realtime
-- The chat thread subscribes to INSERTs on messages filtered by chat_id.
-- Realtime respects RLS, so a subscriber only receives rows the messages
-- select policy already lets them read.
-- =========================================================================

-- Re-runnable: adding a table that is already published raises otherwise.
do $$
begin
  begin
    alter publication supabase_realtime add table messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table chats;
  exception when duplicate_object then null;
  end;
end $$;
