/* =========================================================================
   KEZMOTO - Seller Pro and Boost purchases

   Paid like the commission: the seller sends GCash to KEZMOTO, uploads the
   screenshot, and an admin approves. Approval is what grants Pro / the
   boost - a database trigger does it (0036_seller_pro_boosts.sql), so the
   client can never grant itself either.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { PlanKind, PlanPurchaseRow, PlanPurchaseStatus } from '../lib/database.types';
import { PLAN_DETAILS, PLAN_PRICES, isProKind } from '../utils/plans';
import { notificationsApi } from './notificationsService';
import { signProofUrl, uploadProof } from './storageService';

export interface PlanPurchase {
  id: string;
  buyerId: string;
  /** Filled for the admin list. */
  buyerName: string;
  kind: PlanKind;
  listingId: string | null;
  /** "Honda Click 125i 2022" for boosts. */
  listingTitle: string;
  amount: number;
  referenceNumber: string;
  proofPath: string;
  status: PlanPurchaseStatus;
  reviewNote: string;
  reviewedAt: string;
  createdAt: string;
}

type ProfileStub = { profile_id: string; full_name: string | null };
type ListingStub = { listing_id: string; brand: string; model: string; year: number };

const mapPurchase = (
  row: PlanPurchaseRow,
  names: Map<string, string> = new Map(),
  titles: Map<string, string> = new Map()
): PlanPurchase => ({
  id: row.purchase_id,
  buyerId: row.buyer_id,
  buyerName: names.get(row.buyer_id) ?? '',
  kind: row.kind,
  listingId: row.listing_id,
  listingTitle: row.listing_id ? titles.get(row.listing_id) ?? '' : '',
  amount: Number(row.amount),
  referenceNumber: row.reference_number,
  proofPath: row.proof_url,
  status: row.status,
  reviewNote: row.review_note ?? '',
  reviewedAt: row.reviewed_at ?? '',
  createdAt: row.created_at,
});

/** Adds buyer names and boosted listing titles in two small lookups. */
const withJoins = async (rows: PlanPurchaseRow[]): Promise<PlanPurchase[]> => {
  const buyerIds = [...new Set(rows.map((r) => r.buyer_id))];
  const listingIds = [...new Set(rows.map((r) => r.listing_id).filter((id): id is string => Boolean(id)))];
  const [profiles, listings] = await Promise.all([
    buyerIds.length
      ? supabase.from('profiles').select('profile_id, full_name').in('profile_id', buyerIds)
      : Promise.resolve({ data: [] }),
    listingIds.length
      ? supabase.from('listings').select('listing_id, brand, model, year').in('listing_id', listingIds)
      : Promise.resolve({ data: [] }),
  ]);
  const names = new Map(((profiles.data ?? []) as ProfileStub[]).map((p) => [p.profile_id, p.full_name ?? '']));
  const titles = new Map(
    ((listings.data ?? []) as ListingStub[]).map((l) => [l.listing_id, `${l.brand} ${l.model} ${l.year}`])
  );
  return rows.map((row) => mapPurchase(row, names, titles));
};

const currentUserId = async (): Promise<string | null> =>
  (await supabase.auth.getSession()).data.session?.user.id ?? null;

/** Best-effort: a failed notification never makes the purchase look failed. */
const notifyAdmins = async (title: string, body: string): Promise<void> => {
  try {
    const { data: admins } = await supabase.from('profiles').select('profile_id').eq('role', 'admin');
    await Promise.all(
      ((admins ?? []) as { profile_id: string }[]).map((admin) =>
        notificationsApi.create({
          recipientId: admin.profile_id,
          type: 'plan_purchase',
          title,
          body,
          link: '/admin/plans',
        })
      )
    );
  } catch {
    // The purchase itself is already saved.
  }
};

export const plansApi = {
  /** Seller submits proof of a GCash payment for Pro or a boost. */
  async submitPurchase(input: {
    kind: PlanKind;
    listingId?: string;
    referenceNumber: string;
    proofFile: File;
  }): Promise<PlanPurchase> {
    const buyerId = await currentUserId();
    if (!buyerId) throw new Error('Log in to continue.');

    const proofPath = await uploadProof(buyerId, input.proofFile);
    const { data, error } = await supabase
      .from('plan_purchases')
      .insert({
        buyer_id: buyerId,
        kind: input.kind,
        listing_id: input.kind === 'boost' ? input.listingId ?? null : null,
        amount: PLAN_PRICES[input.kind],
        reference_number: input.referenceNumber.trim(),
        proof_url: proofPath,
        status: 'pending',
      })
      .select('*')
      .single();
    if (error) throw new Error(`Could not submit your payment. (${error.message})`);

    void notifyAdmins(
      isProKind(input.kind) ? `New KEZMOTO ${PLAN_DETAILS[input.kind].label} payment` : 'New Boost payment',
      `₱${PLAN_PRICES[input.kind]} via GCash, ref. ${input.referenceNumber.trim()}. Check the screenshot and approve.`
    );
    return mapPurchase(data as PlanPurchaseRow);
  },

  /** The signed-in seller's own purchases, newest first. */
  async listMine(): Promise<PlanPurchase[]> {
    const buyerId = await currentUserId();
    if (!buyerId) return [];
    const { data, error } = await supabase
      .from('plan_purchases')
      .select('*')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw new Error(`Could not load your purchases. (${error.message})`);
    return withJoins((data ?? []) as PlanPurchaseRow[]);
  },

  /** Admin: every purchase, newest first. */
  async listAll(): Promise<PlanPurchase[]> {
    const { data, error } = await supabase
      .from('plan_purchases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw new Error(`Could not load plan payments. (${error.message})`);
    return withJoins((data ?? []) as PlanPurchaseRow[]);
  },

  proofUrl: (path: string) => signProofUrl(path),

  /** Admin approves (grants Pro / the boost, via trigger) or rejects. */
  async review(purchase: PlanPurchase, outcome: 'approved' | 'rejected', note = ''): Promise<void> {
    const adminId = await currentUserId();
    const { error } = await supabase
      .from('plan_purchases')
      .update({
        status: outcome,
        review_note: note.trim() || null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('purchase_id', purchase.id)
      .eq('status', 'pending');
    if (error) throw new Error(`Could not save the review. (${error.message})`);

    const what = isProKind(purchase.kind) ? 'KEZMOTO Pro' : 'Boost';
    void notificationsApi.create({
      recipientId: purchase.buyerId,
      type: 'plan_purchase',
      title: outcome === 'approved' ? `${what} is now active` : `${what} payment was not approved`,
      body:
        outcome === 'approved'
          ? isProKind(purchase.kind)
            ? `Unlimited listings, 3% commission and ${PLAN_DETAILS[purchase.kind].boosts} free boosts are ready.`
            : `${purchase.listingTitle || 'Your listing'} is now Featured for 7 days.`
          : note.trim() || 'We could not match your GCash payment. Check the reference number and try again.',
      link: isProKind(purchase.kind) ? '/plans' : '/units',
    });
  },

  /** Spends one free boost on the seller's own active listing. */
  async useBoostCredit(listingId: string): Promise<string> {
    const { data, error } = await supabase.rpc('use_boost_credit', { p_listing: listingId });
    if (error) throw new Error(error.message);
    return String(data ?? '');
  },
};
