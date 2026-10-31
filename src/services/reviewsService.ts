/* =========================================================================
   KEZMOTO — Reviews
   One review per (transaction, reviewer) — each side rates the other once a
   deal completes. profiles.rating_avg is kept current by a database trigger
   (refresh_rating_avg), so nothing here recomputes it client-side.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { ReviewRow } from '../lib/database.types';
import type { Review } from '../types';
import { mapReview } from './mappers';
import { settle } from './simulate';

export const reviewsApi = {
  /** The signed-in user's own review of the other party in this deal, if left already. */
  async getMine(transactionId: string): Promise<Review | null> {
    return settle(async () => {
      const userId = (await supabase.auth.getSession()).data.session?.user.id;
      if (!userId) return null;
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('transaction_id', transactionId)
        .eq('reviewer_id', userId)
        .maybeSingle();
      if (error) throw new Error(`Could not load your review. (${error.message})`);
      return data ? mapReview(data as ReviewRow) : null;
    });
  },

  async create(input: {
    transactionId: string;
    revieweeId: string;
    rating: number;
    comment: string;
  }): Promise<Review> {
    const userId = (await supabase.auth.getSession()).data.session?.user.id;
    if (!userId) throw new Error('Sign in to leave a review.');

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        transaction_id: input.transactionId,
        reviewer_id: userId,
        reviewee_id: input.revieweeId,
        rating: input.rating,
        comment: input.comment,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Could not submit your review. (${error.message})`);
    return mapReview(data as ReviewRow);
  },

  async listForReviewee(profileId: string): Promise<Review[]> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('reviewee_id', profileId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load reviews. (${error.message})`);
      return ((data ?? []) as ReviewRow[]).map(mapReview);
    }, []);
  },
};
