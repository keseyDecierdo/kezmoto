/* =========================================================================
   KEZMOTO - Wanted posts
   Public to read, owner-only to write. The author's display name is embedded
   from profiles, the same way listings carry their seller.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { WantedPostRow } from '../lib/database.types';
import type { User, WantedPost } from '../types';
import { mapWantedPost } from './mappers';
import { settle } from './simulate';

const WANTED_SELECT = '*, buyer:profiles!wanted_posts_buyer_id_fkey(full_name)';

type WantedRowWithBuyer = WantedPostRow & { buyer: { full_name: string | null } | null };

export const wantedApi = {
  async list(): Promise<WantedPost[]> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('wanted_posts')
        .select(WANTED_SELECT)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load wanted posts. (${error.message})`);

      return ((data ?? []) as unknown as WantedRowWithBuyer[]).map((row) =>
        mapWantedPost(row, row.buyer?.full_name ?? undefined)
      );
    }, []);
  },

  async create(
    input: Omit<WantedPost, 'id' | 'createdAt' | 'authorId' | 'authorName'>,
    author: User
  ): Promise<WantedPost> {
    const { data, error } = await supabase
      .from('wanted_posts')
      .insert({
        buyer_id: author.id,
        preferred_brand: input.brand,
        preferred_model: input.model,
        budget_min: input.budgetMin,
        budget_max: input.budgetMax,
        location: input.location,
        notes: input.notes,
        status: 'open',
      })
      .select('*')
      .single();

    if (error) throw new Error(`Could not publish the post. (${error.message})`);
    return mapWantedPost(data as WantedPostRow, author.name);
  },

  async delete(id: string): Promise<void> {
    // `.select()` after delete returns the row(s) actually removed - without
    // it, a delete RLS blocks (0 rows affected, e.g. a missing/mismatched
    // policy) comes back with no error at all, and a caller has no way to
    // tell "deleted" from "silently did nothing." Confirmed live: exactly
    // this happened once before the delete policy migration had actually
    // been pushed - the UI showed a success toast for a post that was
    // never removed.
    const { data, error } = await supabase
      .from('wanted_posts')
      .delete()
      .eq('wanted_post_id', id)
      .select('wanted_post_id');
    if (error) throw new Error(`Could not delete that post. (${error.message})`);
    if (!data || data.length === 0) {
      throw new Error('Could not delete that post. (Nothing was removed - you may not own this post.)');
    }
  },
};
