/* =========================================================================
   KEZMOTO - Favorites
   One row per (profile, listing). RLS keeps the table private to its owner,
   so every query here is implicitly scoped to the signed-in user.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import { settle } from './simulate';

const currentUserId = async (): Promise<string | null> =>
  (await supabase.auth.getSession()).data.session?.user.id ?? null;

export const favoritesApi = {
  async list(): Promise<string[]> {
    return settle(async () => {
      const userId = await currentUserId();
      if (!userId) return [];

      const { data, error } = await supabase
        .from('favorites')
        .select('listing_id')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load your saved units. (${error.message})`);
      return (data ?? []).map((row) => row.listing_id);
    }, []);
  },

  async toggle(listingId: string): Promise<string[]> {
    const userId = await currentUserId();
    if (!userId) throw new Error('Sign in to save units.');

    const { data: existing } = await supabase
      .from('favorites')
      .select('favorite_id')
      .eq('profile_id', userId)
      .eq('listing_id', listingId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('favorite_id', existing.favorite_id);
      if (error) throw new Error(`Could not remove that unit. (${error.message})`);
    } else {
      const { error } = await supabase
        .from('favorites')
        .insert({ profile_id: userId, listing_id: listingId });
      if (error) throw new Error(`Could not save that unit. (${error.message})`);
    }

    return favoritesApi.list();
  },
};
