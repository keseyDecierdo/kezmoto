/* =========================================================================
   KEZMOTO — Fraud flag review (admin-only)
   Every read/write here is gated by the single "admin manages fraud flags"
   RLS policy (0013) — a non-admin session gets nothing back, not an error.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { FraudFlagRow, ListingRow } from '../lib/database.types';
import type { FraudFlag, FraudFlagStatus } from '../types';
import { mapFraudFlag } from './mappers';
import { notificationsApi } from './notificationsService';
import { photoUrl } from './storageService';
import { settle } from './simulate';

type ListingStub = Pick<ListingRow, 'listing_id' | 'brand' | 'model' | 'year' | 'photos' | 'seller_id'>;
type SellerStub = { profile_id: string; full_name: string | null };

export const fraudApi = {
  /** Pending flags, grouped by listing on the client side — see FraudReview.tsx. */
  async listPending(): Promise<FraudFlag[]> {
    return settle(async () => {
      const { data: flags, error } = await supabase
        .from('fraud_flags')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Could not load fraud flags. (${error.message})`);
      const rows = (flags ?? []) as FraudFlagRow[];
      if (rows.length === 0) return [];

      const listingIds = Array.from(new Set(rows.map((row) => row.listing_id).filter((id): id is string => !!id)));
      const { data: listings } = await supabase
        .from('listings')
        .select('listing_id, brand, model, year, photos, seller_id')
        .in('listing_id', listingIds);
      const listingById = new Map((listings ?? []).map((l) => [l.listing_id, l as ListingStub]));

      const sellerIds = Array.from(new Set(Array.from(listingById.values()).map((l) => l.seller_id)));
      const { data: sellers } = sellerIds.length
        ? await supabase.from('profiles').select('profile_id, full_name').in('profile_id', sellerIds)
        : { data: [] as SellerStub[] };
      const sellerById = new Map((sellers ?? []).map((s) => [s.profile_id, s as SellerStub]));

      return rows.map((row) => {
        const listing = row.listing_id ? listingById.get(row.listing_id) : undefined;
        const seller = listing ? sellerById.get(listing.seller_id) : undefined;
        return mapFraudFlag(row, {
          listingTitle: listing ? `${listing.brand} ${listing.model} (${listing.year})` : null,
          listingPhoto: listing?.photos?.[0] ? photoUrl(listing.photos[0]) : null,
          sellerName: seller?.full_name ?? null,
        });
      });
    }, []);
  },

  /**
   * `reviewed_removed` also removes the listing — via the
   * `sync_fraud_removal` trigger (0012), not a second write here, so the two
   * can never end up inconsistent with each other. `adminNote` is the
   * admin's own typed reason, kept separate from `detail` (the AI/rule
   * explanation) — on a removal it's also sent to the seller as a
   * notification, best-effort, same as every other notification in the app.
   */
  async review(
    flagId: string,
    outcome: Extract<FraudFlagStatus, 'reviewed_ok' | 'reviewed_removed'>,
    adminNote?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('fraud_flags')
      .update({ status: outcome, admin_note: adminNote ?? null })
      .eq('fraud_flag_id', flagId);
    if (error) throw new Error(`Could not update the flag. (${error.message})`);

    if (outcome === 'reviewed_removed') {
      await notifySellerOfRemoval(flagId, adminNote);
    }
  },

  /**
   * Ad-hoc removal — an admin removing a listing that has no pending flag
   * yet (e.g. from the Sellers → View Units page), with a required reason.
   * Creates its own flag record (flag_type 'admin_removed') then reviews it
   * immediately, so it goes through the exact same removal + notification
   * path as reviewing a detected flag.
   */
  async removeListing(listingId: string, reason: string): Promise<void> {
    const { data, error } = await supabase
      .from('fraud_flags')
      .insert({ listing_id: listingId, flag_type: 'admin_removed', status: 'pending' })
      .select('fraud_flag_id')
      .single();
    if (error) throw new Error(`Could not remove the listing. (${error.message})`);
    await fraudApi.review(data.fraud_flag_id, 'reviewed_removed', reason);
  },
};

/** Best-effort: the fraud_flags write above is already saved either way. */
async function notifySellerOfRemoval(flagId: string, adminNote?: string): Promise<void> {
  try {
    const { data: flag } = await supabase
      .from('fraud_flags')
      .select('listing_id')
      .eq('fraud_flag_id', flagId)
      .maybeSingle();
    if (!flag?.listing_id) return;

    const { data: listing } = await supabase
      .from('listings')
      .select('seller_id, brand, model')
      .eq('listing_id', flag.listing_id)
      .maybeSingle();
    if (!listing?.seller_id) return;

    await notificationsApi.create({
      recipientId: listing.seller_id,
      type: 'listing_removed',
      title: 'Your listing was removed',
      body:
        adminNote?.trim() ||
        `Your listing "${listing.brand} ${listing.model}" was removed by a KEZMOTO admin.`,
      link: '/units',
    });
  } catch {
    // Notification is a courtesy; the removal itself is already saved.
  }
}
