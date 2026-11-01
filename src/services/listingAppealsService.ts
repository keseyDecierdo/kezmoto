/* =========================================================================
   KEZMOTO - Listing appeals
   A seller appeals a listing an admin removed; only admins can list or
   review appeals (RLS in 0032). Approving one reinstates the listing via
   the sync_listing_appeal_approval trigger (0031), not a second write here.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { ListingAppealRow, ListingRow, ProfileRow } from '../lib/database.types';
import type { ListingAppeal, ListingAppealStatus } from '../types';
import { mapListingAppeal } from './mappers';
import { photoUrl } from './storageService';
import { notificationsApi } from './notificationsService';
import { settle } from './simulate';

type ListingStub = Pick<ListingRow, 'listing_id' | 'brand' | 'model' | 'year' | 'photos'>;
type ProfileStub = Pick<ProfileRow, 'profile_id' | 'full_name'>;

/** Best-effort: tells every admin an appeal is waiting. A failure here must
    never make the (already saved) appeal look like it failed. */
const notifyAdmins = async (listingTitle: string): Promise<void> => {
  try {
    const { data: admins } = await supabase.from('profiles').select('profile_id').eq('role', 'admin');
    await Promise.all(
      ((admins ?? []) as { profile_id: string }[]).map((admin) =>
        notificationsApi.create({
          recipientId: admin.profile_id,
          type: 'listing_appeal',
          title: 'New listing appeal',
          body: `A seller is appealing the removal of "${listingTitle}".`,
          link: '/admin/appeals',
        })
      )
    );
  } catch {
    // Notification is a courtesy; the appeal itself is already saved.
  }
};

export const listingAppealsApi = {
  async fileAppeal(listingId: string, fraudFlagId: string | null, message: string): Promise<void> {
    const sellerId = (await supabase.auth.getSession()).data.session?.user.id;
    if (!sellerId) throw new Error('You need to be signed in to file an appeal.');

    const { data: listing } = await supabase
      .from('listings')
      .select('brand, model')
      .eq('listing_id', listingId)
      .maybeSingle();

    const { error } = await supabase.from('listing_appeals').insert({
      listing_id: listingId,
      fraud_flag_id: fraudFlagId,
      seller_id: sellerId,
      message: message.trim(),
    });
    if (error) {
      // 23505 = the one-open-appeal-per-listing unique index.
      throw new Error(
        error.code === '23505'
          ? 'You already have an open appeal for this listing. An admin will review it soon.'
          : `Could not send your appeal. (${error.message})`
      );
    }

    await notifyAdmins(listing ? `${listing.brand} ${listing.model}` : 'your listing');
  },

  /** Admin-only. Newest first, with the listing and seller joined in. */
  async listAll(status?: ListingAppealStatus): Promise<ListingAppeal[]> {
    return settle(async () => {
      let query = supabase.from('listing_appeals').select('*').order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw new Error(`Could not load listing appeals. (${error.message})`);
      const rows = (data ?? []) as ListingAppealRow[];
      if (rows.length === 0) return [];

      const listingIds = Array.from(new Set(rows.map((r) => r.listing_id)));
      const { data: listings } = await supabase
        .from('listings')
        .select('listing_id, brand, model, year, photos')
        .in('listing_id', listingIds);
      const listingById = new Map(((listings ?? []) as ListingStub[]).map((l) => [l.listing_id, l]));

      const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id)));
      const { data: sellers } = await supabase
        .from('profiles')
        .select('profile_id, full_name')
        .in('profile_id', sellerIds);
      const sellerById = new Map(((sellers ?? []) as ProfileStub[]).map((s) => [s.profile_id, s]));

      return rows.map((row) => {
        const listing = listingById.get(row.listing_id);
        return mapListingAppeal(row, {
          listingTitle: listing ? `${listing.brand} ${listing.model} (${listing.year})` : null,
          listingPhoto: listing?.photos?.[0] ? photoUrl(listing.photos[0]) : null,
          sellerName: sellerById.get(row.seller_id)?.full_name ?? null,
        });
      });
    }, []);
  },

  /** 'approved' also reinstates the listing - via the trigger, not here. */
  async review(appealId: string, status: Exclude<ListingAppealStatus, 'pending'>, adminNote: string): Promise<void> {
    const adminId = (await supabase.auth.getSession()).data.session?.user.id ?? null;
    const { error } = await supabase
      .from('listing_appeals')
      .update({
        status,
        admin_note: adminNote.trim() || null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('listing_appeal_id', appealId);
    if (error) throw new Error(`Could not update the appeal. (${error.message})`);
  },
};
