/* =========================================================================
   KEZMOTO — Transactions
   A transaction is created exactly once per chat, at the moment either side
   requests a middleman (there is no bare "inquiry" row before that in this
   phase). From there an admin claims it, drives it through the status
   sequence, and the buyer/seller watch it read-only via the tracker.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { TransactionRow } from '../lib/database.types';
import type { Transaction, TransactionStatus } from '../types';
import { mapTransaction } from './mappers';
import type { TransactionJoins } from './mappers';
import { photoUrl } from './storageService';
import { settle } from './simulate';

type PartyStub = { profile_id: string; full_name: string | null };
type ListingStub = { brand: string; model: string; year: number; photos: string[] } | null;

type TransactionRowWithJoins = TransactionRow & {
  buyer: PartyStub | null;
  seller: PartyStub | null;
  admin: PartyStub | null;
  listing: ListingStub;
};

const TRANSACTION_SELECT = `
  *,
  buyer:profiles!transactions_buyer_id_fkey(profile_id, full_name),
  seller:profiles!transactions_seller_id_fkey(profile_id, full_name),
  admin:profiles!transactions_admin_id_fkey(profile_id, full_name),
  listing:listings(brand, model, year, photos)
`;

const mapRow = (row: TransactionRowWithJoins): Transaction => {
  const joins: TransactionJoins = {
    buyer: row.buyer,
    seller: row.seller,
    adminName: row.admin?.full_name ?? null,
    listingTitle: row.listing ? `${row.listing.brand} ${row.listing.model} (${row.listing.year})` : null,
    listingPhoto: row.listing?.photos?.[0] ? photoUrl(row.listing.photos[0]) : null,
  };
  return mapTransaction(row, joins);
};

const currentUserId = async (): Promise<string | null> =>
  (await supabase.auth.getSession()).data.session?.user.id ?? null;

export const transactionsApi = {
  async getById(id: string): Promise<Transaction> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select(TRANSACTION_SELECT)
        .eq('transaction_id', id)
        .maybeSingle();
      if (error) throw new Error(`Could not load that transaction. (${error.message})`);
      if (!data) throw new Error('That transaction could not be found.');
      return mapRow(data as unknown as TransactionRowWithJoins);
    });
  },

  /** Null when no transaction exists yet for the thread (middleman never requested). */
  async getByChatId(chatId: string): Promise<Transaction | null> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select(TRANSACTION_SELECT)
        .eq('chat_id', chatId)
        .maybeSingle();
      if (error) throw new Error(`Could not load that transaction. (${error.message})`);
      return data ? mapRow(data as unknown as TransactionRowWithJoins) : null;
    });
  },

  /** Every deal the signed-in user is buying or selling — newest first. */
  async listMine(): Promise<Transaction[]> {
    return settle(async () => {
      const userId = await currentUserId();
      if (!userId) return [];
      const { data, error } = await supabase
        .from('transactions')
        .select(TRANSACTION_SELECT)
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(`Could not load your transactions. (${error.message})`);
      return ((data ?? []) as unknown as TransactionRowWithJoins[]).map(mapRow);
    }, []);
  },

  /** Unclaimed requests, plus ones already assigned to me and not yet resolved. */
  async listMiddlemanQueue(): Promise<Transaction[]> {
    return settle(async () => {
      const userId = await currentUserId();
      if (!userId) return [];
      const { data, error } = await supabase
        .from('transactions')
        .select(TRANSACTION_SELECT)
        .or(`admin_id.is.null,admin_id.eq.${userId}`)
        .not('status', 'in', '(completed,cancelled)')
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Could not load the middleman queue. (${error.message})`);
      return ((data ?? []) as unknown as TransactionRowWithJoins[]).map(mapRow);
    }, []);
  },

  /** Every transaction, for the admin Reports screen. Optional status filter. */
  async listAll(filter?: { status?: TransactionStatus }): Promise<Transaction[]> {
    return settle(async () => {
      let query = supabase.from('transactions').select(TRANSACTION_SELECT);
      if (filter?.status) query = query.eq('status', filter.status);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load transactions. (${error.message})`);
      return ((data ?? []) as unknown as TransactionRowWithJoins[]).map(mapRow);
    }, []);
  },

  /**
   * Finds or creates the transaction for a chat and marks it (and the chat)
   * as a middleman request. Called when either side taps "Request Middleman".
   */
  async requestMiddleman(input: {
    chatId: string;
    listingId: string | null;
    buyerId: string;
    sellerId: string;
  }): Promise<Transaction> {
    const existing = await transactionsApi.getByChatId(input.chatId);

    if (!existing) {
      const { error: insertError } = await supabase.from('transactions').insert({
        chat_id: input.chatId,
        listing_id: input.listingId,
        buyer_id: input.buyerId,
        seller_id: input.sellerId,
        status: 'negotiating',
      });
      if (insertError) throw new Error(`Could not request a middleman. (${insertError.message})`);
    }

    const { error: chatError } = await supabase
      .from('chats')
      .update({ status: 'middleman_requested' })
      .eq('chat_id', input.chatId);
    if (chatError) throw new Error(`Could not request a middleman. (${chatError.message})`);

    const transaction = await transactionsApi.getByChatId(input.chatId);
    if (!transaction) throw new Error('Could not request a middleman.');
    return transaction;
  },

  /**
   * Seller marked a unit sold from the chat, at the final price (the agreed
   * offer, or whatever they typed into "Sold for how much?").
   *
   * - No transaction yet → recorded as a completed sale.
   * - An open buyer/seller deal (inquiry/negotiating, no middleman active)
   *   → closed as completed at that price; `enforce_transaction_update`
   *   (0034) allows exactly this for the seller.
   * - A deal a middleman is running → left for the assigned admin to close.
   */
  async recordDirectSale(input: {
    chatId: string;
    listingId: string | null;
    buyerId: string;
    sellerId: string;
    agreedPrice: number;
  }): Promise<Transaction | null> {
    const existing = await transactionsApi.getByChatId(input.chatId);

    if (existing) {
      if (existing.status !== 'inquiry' && existing.status !== 'negotiating') return existing;
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'completed', agreed_price: input.agreedPrice })
        .eq('transaction_id', existing.id);
      if (error) {
        throw new Error(`Marked as sold, but the deal could not be closed. (${error.message})`);
      }
      return transactionsApi.getById(existing.id);
    }

    const { error } = await supabase.from('transactions').insert({
      chat_id: input.chatId,
      listing_id: input.listingId,
      buyer_id: input.buyerId,
      seller_id: input.sellerId,
      agreed_price: input.agreedPrice,
      status: 'completed',
    });
    if (error) {
      throw new Error(`Marked as sold, but the transaction record could not be saved. (${error.message})`);
    }

    return transactionsApi.getByChatId(input.chatId);
  },

  /**
   * Buyer or seller offers a price in the chat. Creates the chat's deal
   * (status "negotiating") on the first offer; later offers replace the
   * pending one. Either way the offer is stamped with who made it.
   */
  async makeOffer(input: {
    chatId: string;
    listingId: string | null;
    buyerId: string;
    sellerId: string;
    price: number;
  }): Promise<Transaction> {
    const me = await currentUserId();
    if (!me) throw new Error('Log in to make an offer.');
    const existing = await transactionsApi.getByChatId(input.chatId);

    const { error } = existing
      ? await supabase
          .from('transactions')
          .update({ proposed_price: input.price, proposed_by: me })
          .eq('transaction_id', existing.id)
      : await supabase.from('transactions').insert({
          chat_id: input.chatId,
          listing_id: input.listingId,
          buyer_id: input.buyerId,
          seller_id: input.sellerId,
          proposed_price: input.price,
          proposed_by: me,
          status: 'negotiating',
        });
    if (error) throw new Error(`Could not send your offer. (${error.message})`);

    const transaction = await transactionsApi.getByChatId(input.chatId);
    if (!transaction) throw new Error('Could not send your offer.');
    return transaction;
  },

  /** The other party accepts the pending offer: it becomes the agreed price. */
  async acceptOffer(transaction: Transaction): Promise<Transaction> {
    if (transaction.proposedPrice == null) throw new Error('There is no offer to accept.');
    const { error } = await supabase
      .from('transactions')
      // Accepting settles the offer, so the pending fields are cleared too.
      .update({ agreed_price: transaction.proposedPrice, proposed_price: null, proposed_by: null })
      .eq('transaction_id', transaction.id);
    if (error) throw new Error(`Could not accept the offer. (${error.message})`);
    return transactionsApi.getById(transaction.id);
  },

  /** Decline (other party) or withdraw (proposer) the pending offer. */
  async clearOffer(transactionId: string): Promise<Transaction> {
    const { error } = await supabase
      .from('transactions')
      .update({ proposed_price: null, proposed_by: null })
      .eq('transaction_id', transactionId);
    if (error) throw new Error(`Could not update the offer. (${error.message})`);
    return transactionsApi.getById(transactionId);
  },

  /** Admin claims an unclaimed transaction from the Middleman queue. */
  async joinAsMiddleman(transactionId: string): Promise<Transaction> {
    const adminId = await currentUserId();
    if (!adminId) throw new Error('You need to be signed in as an admin to do that.');

    const { data: current, error: readError } = await supabase
      .from('transactions')
      .select('chat_id')
      .eq('transaction_id', transactionId)
      .maybeSingle();
    if (readError) throw new Error(`Could not join this transaction. (${readError.message})`);
    if (!current) throw new Error('That transaction could not be found.');

    const { data: claimedTx, error: txError } = await supabase
      .from('transactions')
      .update({ admin_id: adminId, status: 'middleman_assigned' })
      .eq('transaction_id', transactionId)
      .select('transaction_id')
      .maybeSingle();
    if (txError) throw new Error(`Could not join this transaction. (${txError.message})`);
    // RLS silently drops the row instead of erroring once someone else has
    // already claimed it — `.select()` above is what lets this tell the two
    // apart from a real success.
    if (!claimedTx) throw new Error('Someone else already claimed this request.');

    if (current.chat_id) {
      const { data: claimedChat, error: chatError } = await supabase
        .from('chats')
        .update({ admin_id: adminId, status: 'middleman_joined' })
        .eq('chat_id', current.chat_id)
        .select('chat_id')
        .maybeSingle();
      if (chatError) throw new Error(`Joined the transaction, but not the chat. (${chatError.message})`);
      if (!claimedChat) throw new Error('Joined the transaction, but the chat was already claimed by someone else.');
    }

    return transactionsApi.getById(transactionId);
  },

  /** Buyer/seller move: only allowed pre-middleman, enforced again server-side. */
  async proposePrice(transactionId: string, price: number): Promise<Transaction> {
    const { error } = await supabase
      .from('transactions')
      .update({ proposed_price: price })
      .eq('transaction_id', transactionId);
    if (error) throw new Error(`Could not update the proposed price. (${error.message})`);
    return transactionsApi.getById(transactionId);
  },

  /** Admin move: advance (or roll back) the status, optionally locking in a price. */
  async updateStatus(
    transactionId: string,
    status: TransactionStatus,
    agreedPrice?: number
  ): Promise<Transaction> {
    const { error } = await supabase
      .from('transactions')
      .update({ status, ...(agreedPrice != null ? { agreed_price: agreedPrice } : {}) })
      .eq('transaction_id', transactionId);
    if (error) throw new Error(`Could not update the transaction. (${error.message})`);
    return transactionsApi.getById(transactionId);
  },

  /**
   * Admin move (Step 5): set a meetup date/time + place and advance the
   * status. commission_status/payment_reference are never touched here —
   * the app never exposes a way to set them directly; only
   * `sync_commission_status` does, triggered by an admin confirming or
   * rejecting a submission in `payments` (see paymentsApi.confirmPayment).
   */
  async scheduleMeetup(transactionId: string, meetupAt: string, meetupLocation: string): Promise<Transaction> {
    const { error } = await supabase
      .from('transactions')
      .update({ meetup_at: meetupAt, meetup_location: meetupLocation, status: 'meetup_scheduled' })
      .eq('transaction_id', transactionId);
    if (error) throw new Error(`Could not schedule the meetup. (${error.message})`);
    return transactionsApi.getById(transactionId);
  },

  /**
   * Live updates for one transaction — mainly so an admin's commission
   * confirm/reject (which flips commission_status, and sometimes status)
   * appears without a manual refresh. Re-fetches the joined row on every
   * change since the realtime payload only carries the bare updated columns.
   */
  /* The topic carries a random suffix so each call gets its own channel —
     see subscribeToNotifications's comment in notificationsService.ts for
     why a stable, reused topic crashes under React's dev-mode double-invoke. */
  subscribeToTransaction(transactionId: string, onChange: (transaction: Transaction) => void): () => void {
    const channel = supabase
      .channel(`transaction-${transactionId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
          filter: `transaction_id=eq.${transactionId}`,
        },
        () => {
          void transactionsApi.getById(transactionId).then(onChange).catch(() => undefined);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
