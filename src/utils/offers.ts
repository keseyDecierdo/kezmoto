import type { Transaction } from '../types';

/**
 * Where a chat's price negotiation stands, from the viewer's side:
 * - none     no offer yet (or the last one was declined)
 * - mine     the viewer's offer is waiting for the other party
 * - theirs   the other party's offer is waiting for the viewer
 * - locked   a middleman is running the deal, or it's closed —
 *            buyers and sellers can no longer negotiate here
 * `agreedPrice` rides alongside any of these once an offer was accepted.
 */
export type OfferState = 'none' | 'mine' | 'theirs' | 'locked';

export const offerStateFor = (transaction: Transaction | null, viewerId: string | undefined): OfferState => {
  if (!transaction) return 'none';
  if (transaction.status !== 'inquiry' && transaction.status !== 'negotiating') return 'locked';
  if (transaction.proposedPrice == null || !transaction.proposedBy) return 'none';
  // An offer equal to the agreed price was already accepted (older rows
  // kept the pending fields after acceptance).
  if (transaction.agreedPrice != null && transaction.proposedPrice === transaction.agreedPrice) return 'none';
  return transaction.proposedBy === viewerId ? 'mine' : 'theirs';
};

/** "₱3,000 below the listed price (7%)" style comparison for an offer. */
export const offerDelta = (offer: number, listed: number): { amount: number; percent: number; below: boolean } => {
  const amount = Math.abs(listed - offer);
  const percent = listed > 0 ? Math.round((amount / listed) * 100) : 0;
  return { amount, percent, below: offer < listed };
};
