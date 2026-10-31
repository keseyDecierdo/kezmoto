/* =========================================================================
   KEZMOTO — Notifications
   One row per event a user should see a bell badge for. Realtime respects
   RLS, so a subscriber only ever receives their own rows — same shape as
   chatService.ts's subscribeToMessages.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { NotificationRow } from '../lib/database.types';
import { settle } from './simulate';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const mapNotification = (row: NotificationRow): AppNotification => ({
  id: row.notification_id,
  type: row.type,
  title: row.title,
  body: row.body,
  link: row.link,
  read: Boolean(row.read),
  createdAt: row.created_at,
});

const currentUserId = async (): Promise<string | null> =>
  (await supabase.auth.getSession()).data.session?.user.id ?? null;

export const notificationsApi = {
  async list(limit = 30): Promise<AppNotification[]> {
    return settle(async () => {
      const viewerId = await currentUserId();
      if (!viewerId) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', viewerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Could not load notifications. (${error.message})`);

      return ((data ?? []) as NotificationRow[]).map(mapNotification);
    }, []);
  },

  async markRead(id: string): Promise<void> {
    await supabase.from('notifications').update({ read: true }).eq('notification_id', id);
  },

  async markAllRead(): Promise<void> {
    const viewerId = await currentUserId();
    if (!viewerId) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', viewerId)
      .eq('read', false);
  },

  /** Fire-and-forget: a failed notification insert should never block the
   *  action that triggered it (sending a message, marking a listing sold). */
  async create(input: { recipientId: string; type: string; title: string; body?: string; link?: string }): Promise<void> {
    try {
      await supabase.from('notifications').insert({
        recipient_id: input.recipientId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      });
    } catch {
      // Best-effort — the primary action already succeeded.
    }
  },

  /** Live feed for the signed-in viewer. Returns the unsubscribe function.
   *
   *  The topic carries a random suffix so each call gets its own channel:
   *  supabase-js reuses an existing channel by topic name until its (async,
   *  network-round-trip) teardown finishes, and React's development-mode
   *  double-invoke of effects calls this twice back-to-back with no await in
   *  between — reusing a topic there hands back an already-`subscribe()`d
   *  channel, and adding another `.on()` to it throws. Confirmed live. */
  subscribeToNotifications(viewerId: string, onInsert: (notification: AppNotification) => void): () => void {
    const channel = supabase
      .channel(`notifications-${viewerId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${viewerId}`,
        },
        (payload) => onInsert(mapNotification(payload.new as NotificationRow))
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
