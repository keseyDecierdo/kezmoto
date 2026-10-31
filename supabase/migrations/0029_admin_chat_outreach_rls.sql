-- =========================================================================
-- KEZMOTO — Admin can start a chat with a seller directly (no buyer)
--
-- New admin pages let an admin message a seller about one of their units,
-- or in general, without a buyer ever being involved (see Sellers / View
-- Units). `chats.buyer_id` and `admin_id` are both nullable (0001), and the
-- messages RLS already treats `admin_id` as a full participant for read/send
-- (0002) — the one thing missing is an INSERT policy that lets an admin
-- create a brand-new row with only `admin_id` set. This is additive: the
-- existing "users can create chats they participate in" policy (buyer or
-- seller) is untouched, so every existing chat-creation path behaves exactly
-- as before.
-- =========================================================================

drop policy if exists "admins can start outreach chats" on chats;
create policy "admins can start outreach chats" on chats
  for insert
  with check (is_admin() and auth.uid() = admin_id);
