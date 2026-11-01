/* =========================================================================
   KEZMOTO - Chats and messages
   A thread is a `chats` row plus its `messages`. The participant a screen
   shows is always the other side of the deal, so every read needs to know who
   is looking.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { ChatRow, DbRole, ListingRow, MessageRow, ProfileRow } from '../lib/database.types';
import type { ChatMessage, ChatParticipant, ChatThread, Listing, UserRole, WantedPost } from '../types';
import { avatarColorFor, mapListingStatus, mapMessage } from './mappers';
import { photoUrl, uploadPhoto } from './storageService';
import { settle } from './simulate';
import { transactionsApi } from './transactionsService';
import { notificationsApi } from './notificationsService';
import { formatPrice } from '../utils/format';

type ProfileStub = Pick<ProfileRow, 'profile_id' | 'full_name' | 'role' | 'profile_photo_url'>;
type AdminStub = Pick<ProfileRow, 'profile_id' | 'full_name' | 'profile_photo_url'>;
type ListingStub = Pick<ListingRow, 'listing_id' | 'brand' | 'model' | 'year' | 'photos' | 'status'>;

type ChatRowWithJoins = ChatRow & {
  listing: ListingStub | null;
  buyer: ProfileStub | null;
  seller: ProfileStub | null;
  admin: AdminStub | null;
  messages: MessageRow[] | null;
};

const CHAT_SELECT = `
  *,
  listing:listings(listing_id, brand, model, year, photos, status),
  buyer:profiles!chats_buyer_id_fkey(profile_id, full_name, role, profile_photo_url),
  seller:profiles!chats_seller_id_fkey(profile_id, full_name, role, profile_photo_url),
  admin:profiles!chats_admin_id_fkey(profile_id, full_name, profile_photo_url),
  messages(*)
`;

/* -------------------------------------------------------------------------
   Who is looking
   ------------------------------------------------------------------------- */
const currentUserId = async (): Promise<string | null> =>
  (await supabase.auth.getSession()).data.session?.user.id ?? null;

const requireUserId = async (): Promise<string> => {
  const id = await currentUserId();
  if (!id) throw new Error('You need to be signed in to use messages.');
  return id;
};

/** Role is needed on every message insert; it never changes mid-session. */
const roleCache = new Map<string, DbRole>();

const roleOf = async (userId: string): Promise<DbRole> => {
  const cached = roleCache.get(userId);
  if (cached) return cached;
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('profile_id', userId)
    .maybeSingle();
  const role = (data?.role ?? 'customer') as DbRole;
  roleCache.set(userId, role);
  return role;
};

/* -------------------------------------------------------------------------
   Mapping
   ------------------------------------------------------------------------- */
const toParty = (
  profile: { profile_id: string; full_name: string | null; profile_photo_url: string | null } | null,
  role: UserRole,
  fallbackName: string
): ChatParticipant | null =>
  profile
    ? {
        id: profile.profile_id,
        name: profile.full_name?.trim() || fallbackName,
        avatarColor: avatarColorFor(profile.profile_id),
        ...(profile.profile_photo_url ? { avatarUrl: profile.profile_photo_url } : {}),
        role,
      }
    : null;

const mapThread = (row: ChatRowWithJoins, viewerId: string): ChatThread => {
  const hasBuyer = row.buyer_id != null;
  const viewerIsBuyer = row.buyer_id === viewerId;
  // A buyer-less thread is an admin reaching out to a seller directly (see
  // openAdminThreadWithSeller) - neither side is "the buyer", so the normal
  // buyer/seller swap doesn't apply. Every row that DOES have a buyer keeps
  // today's exact behavior; this branch only ever changes what was
  // previously the wrong fallback (`row.buyer` being null anyway).
  const viewerIsAdminOutreach = !hasBuyer && viewerId === row.seller_id;
  const other = !hasBuyer
    ? viewerIsAdminOutreach
      ? row.admin
      : row.seller
    : viewerIsBuyer
      ? row.seller
      : row.buyer;
  const otherRole: UserRole = viewerIsAdminOutreach ? 'admin' : (other as ProfileStub | null)?.role ?? 'customer';

  const messages: ChatMessage[] = [...(row.messages ?? [])]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(mapMessage);

  const lastReadAt = viewerIsBuyer ? row.buyer_last_read_at : row.seller_last_read_at;
  const unreadCount = messages.filter(
    (message) =>
      message.senderId !== viewerId &&
      (!lastReadAt || new Date(message.sentAt).getTime() > new Date(lastReadAt).getTime())
  ).length;

  const listing = row.listing;

  return {
    id: row.chat_id,
    listingId: listing?.listing_id ?? null,
    listingTitle: listing ? `${listing.brand} ${listing.model} (${listing.year})` : null,
    listingPhoto: listing?.photos?.[0] ? photoUrl(listing.photos[0]) : null,
    listingStatus: listing ? mapListingStatus(listing.status) : null,
    isOwnListing: listing != null && row.seller_id === viewerId,
    participant: {
      id: other?.profile_id ?? 'unknown',
      name: other?.full_name?.trim() || (otherRole === 'admin' ? 'KEZMOTO admin' : 'KEZMOTO rider'),
      avatarColor: avatarColorFor(other?.profile_id ?? row.chat_id),
      ...(other?.profile_photo_url ? { avatarUrl: other.profile_photo_url } : {}),
      role: otherRole,
    },
    hasBuyer,
    ...(row.admin
      ? { assignedAdmin: { id: row.admin.profile_id, name: row.admin.full_name?.trim() || 'KEZMOTO admin' } }
      : {}),
    parties: [
      toParty(row.buyer, row.buyer?.role ?? 'customer', 'KEZMOTO rider'),
      toParty(row.seller, row.seller?.role ?? 'customer', 'KEZMOTO rider'),
      toParty(row.admin, 'admin', 'KEZMOTO admin'),
    ].filter((party): party is ChatParticipant => party !== null),
    unreadCount,
    updatedAt: messages[messages.length - 1]?.sentAt ?? row.created_at,
    middlemanRequested:
      row.status === 'middleman_requested' || row.status === 'middleman_joined',
    messages,
  };
};

/* ------------------------------------------------------------------ api */
export const chatsApi = {
  async listThreads(): Promise<ChatThread[]> {
    return settle(async () => {
      const viewerId = await currentUserId();
      if (!viewerId) return [];

      const { data, error } = await supabase
        .from('chats')
        .select(CHAT_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load your conversations. (${error.message})`);

      return ((data ?? []) as unknown as ChatRowWithJoins[]).map((row) =>
        mapThread(row, viewerId)
      );
    }, []);
  },

  async getThread(id: string): Promise<ChatThread> {
    return settle(async () => {
      const viewerId = await requireUserId();
      const { data, error } = await supabase
        .from('chats')
        .select(CHAT_SELECT)
        .eq('chat_id', id)
        .maybeSingle();
      if (error) throw new Error(`That conversation could not be opened. (${error.message})`);
      if (!data) throw new Error('That conversation could not be opened.');
      return mapThread(data as unknown as ChatRowWithJoins, viewerId);
    });
  },

  /** Returns the existing thread for a listing, creating one if needed. */
  async openThreadForListing(listing: Listing): Promise<ChatThread> {
    const viewerId = await requireUserId();

    const { data: existing } = await supabase
      .from('chats')
      .select('chat_id')
      .eq('listing_id', listing.id)
      .eq('buyer_id', viewerId)
      .maybeSingle();

    if (existing) return chatsApi.getThread(existing.chat_id);

    if (listing.sellerId === viewerId) {
      throw new Error('This is your own unit - buyers will start the thread with you.');
    }

    const { data, error } = await supabase
      .from('chats')
      .insert({
        listing_id: listing.id,
        buyer_id: viewerId,
        seller_id: listing.sellerId,
        status: 'active',
      })
      .select('chat_id')
      .single();

    if (error) throw new Error(`Could not start that conversation. (${error.message})`);
    return chatsApi.getThread(data.chat_id);
  },

  /**
   * Admin-only: reaches out to a seller directly - about one specific
   * listing, or in general when `listingId` is omitted - without inserting
   * the admin as a fake buyer (see openThreadForListing). Returns the
   * existing outreach thread for that seller/listing pair if one is
   * already open.
   */
  async openAdminThreadWithSeller(sellerId: string, listingId?: string): Promise<ChatThread> {
    const adminId = await requireUserId();

    let existingQuery = supabase
      .from('chats')
      .select('chat_id')
      .eq('admin_id', adminId)
      .eq('seller_id', sellerId);
    existingQuery = listingId
      ? existingQuery.eq('listing_id', listingId)
      : existingQuery.is('listing_id', null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) return chatsApi.getThread(existing.chat_id);

    const { data, error } = await supabase
      .from('chats')
      .insert({
        listing_id: listingId ?? null,
        seller_id: sellerId,
        admin_id: adminId,
        status: 'active',
      })
      .select('chat_id')
      .single();

    if (error) throw new Error(`Could not start that conversation. (${error.message})`);
    return chatsApi.getThread(data.chat_id);
  },

  /**
   * Returns the existing thread for reaching out about a Wanted post,
   * creating one if needed. No listing is involved, so `listing_id` stays
   * null - the post's author is the schema's "buyer" (the one looking to
   * buy) regardless of which side reaches out first, same convention a
   * listing thread uses.
   */
  async openThreadForWantedPost(post: WantedPost): Promise<ChatThread> {
    const viewerId = await requireUserId();

    if (post.authorId === viewerId) {
      throw new Error('This is your own post - interested buyers will start the thread with you.');
    }

    const { data: existing } = await supabase
      .from('chats')
      .select('chat_id')
      .is('listing_id', null)
      .eq('buyer_id', post.authorId)
      .eq('seller_id', viewerId)
      .maybeSingle();

    if (existing) return chatsApi.getThread(existing.chat_id);

    const { data, error } = await supabase
      .from('chats')
      .insert({
        listing_id: null,
        buyer_id: post.authorId,
        seller_id: viewerId,
        status: 'active',
      })
      .select('chat_id')
      .single();

    if (error) throw new Error(`Could not start that conversation. (${error.message})`);
    return chatsApi.getThread(data.chat_id);
  },

  async sendMessage(
    threadId: string,
    senderId: string,
    body: string,
    imageFile?: File
  ): Promise<ChatMessage> {
    const imagePath = imageFile ? await uploadPhoto(senderId, imageFile) : null;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        chat_id: threadId,
        sender_id: senderId,
        sender_role: await roleOf(senderId),
        message_text: body || null,
        image_path: imagePath,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Message could not be sent. (${error.message})`);
    return mapMessage(data as MessageRow);
  },

  /** Drops a centred system notice into the thread - used for middleman
   *  requests and any other side-effect-of-an-action notice. */
  async postSystemMessage(threadId: string, text: string): Promise<void> {
    const viewerId = await requireUserId();
    const { error } = await supabase.from('messages').insert({
      chat_id: threadId,
      sender_id: viewerId,
      sender_role: await roleOf(viewerId),
      message_text: text,
      is_system: true,
    });
    if (error) throw new Error(`Could not post to the conversation. (${error.message})`);
  },

  /**
   * Flags the thread, creates (or reuses) its transaction row so the admin
   * middleman queue and the customer status tracker both have something to
   * show, and drops a system notice into the thread for both sides.
   */
  async requestMiddleman(threadId: string): Promise<ChatThread> {
    const { data: chat, error: readError } = await supabase
      .from('chats')
      .select('listing_id, buyer_id, seller_id')
      .eq('chat_id', threadId)
      .maybeSingle();
    if (readError) throw new Error(`Could not request a middleman. (${readError.message})`);
    if (!chat?.buyer_id || !chat.seller_id) throw new Error('That conversation could not be found.');

    const transaction = await transactionsApi.requestMiddleman({
      chatId: threadId,
      listingId: chat.listing_id,
      buyerId: chat.buyer_id,
      sellerId: chat.seller_id,
    });

    // Tell every admin, with the price so they can triage from the bell.
    // Best effort: a failed notification never blocks the request itself.
    try {
      const { data: admins } = await supabase.from('profiles').select('profile_id').eq('role', 'admin');
      const price =
        transaction.agreedPrice != null
          ? `Agreed ${formatPrice(transaction.agreedPrice)}`
          : transaction.proposedPrice != null
            ? `Offer ${formatPrice(transaction.proposedPrice)} pending`
            : 'No price agreed yet';
      const who = `${transaction.buyer?.name ?? 'Buyer'} ↔ ${transaction.seller?.name ?? 'Seller'}`;
      await Promise.all(
        ((admins ?? []) as { profile_id: string }[]).map((admin) =>
          notificationsApi.create({
            recipientId: admin.profile_id,
            type: 'middleman_request',
            title: 'Middleman requested',
            body: `${transaction.listingTitle ?? 'A unit'} · ${who} · ${price}`,
            link: '/admin/middleman',
          })
        )
      );
    } catch (err) {
      console.error('Could not notify admins about the middleman request.', err);
    }

    await chatsApi.postSystemMessage(
      threadId,
      'Middleman requested. A KEZMOTO admin will join this thread.'
    );

    return chatsApi.getThread(threadId);
  },

  async markRead(threadId: string): Promise<void> {
    const viewerId = await currentUserId();
    if (!viewerId) return;

    const { data } = await supabase
      .from('chats')
      .select('buyer_id, seller_id')
      .eq('chat_id', threadId)
      .maybeSingle();
    if (!data) return;

    const now = new Date().toISOString();
    const stamp =
      data.buyer_id === viewerId
        ? { buyer_last_read_at: now }
        : data.seller_id === viewerId
          ? { seller_last_read_at: now }
          : null;
    if (!stamp) return; // an admin sitting in the thread has no unread counter

    await supabase.from('chats').update(stamp).eq('chat_id', threadId);
  },

  /**
   * Live thread. Realtime respects RLS, so only participants ever receive a
   * row. Returns the unsubscribe function.
   */
  /* The topic carries a random suffix so each call gets its own channel -
     see subscribeToNotifications's comment in notificationsService.ts for
     why a stable, reused topic crashes under React's dev-mode double-invoke. */
  subscribeToMessages(threadId: string, onMessage: (message: ChatMessage) => void): () => void {
    const channel = supabase
      .channel(`chat-${threadId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${threadId}`,
        },
        (payload) => onMessage(mapMessage(payload.new as MessageRow))
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
