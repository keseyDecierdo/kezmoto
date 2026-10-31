// Shared "comparable listings" lookup — same brand/model, year ± 2, active,
// excluding the listing itself. Used by the chatbot (price framing),
// score-condition (worth-buying reasoning), and the low-price fraud check.
// Reads only what RLS already lets any caller see (active listings), so this
// takes a caller-scoped client — no elevated privilege needed.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface ComparableListing {
  listing_id: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  mileage: number | null;
}

export async function fetchComparables(
  client: SupabaseClient,
  listing: { listing_id: string; brand: string; model: string; year: number },
  limit = 5
): Promise<ComparableListing[]> {
  const { data, error } = await client
    .from('listings')
    .select('listing_id, brand, model, year, price, mileage')
    .eq('brand', listing.brand)
    .eq('model', listing.model)
    .gte('year', listing.year - 2)
    .lte('year', listing.year + 2)
    .eq('status', 'active')
    .neq('listing_id', listing.listing_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as ComparableListing[];
}

export function averagePrice(comparables: ComparableListing[]): number | null {
  if (comparables.length === 0) return null;
  return comparables.reduce((sum, c) => sum + Number(c.price), 0) / comparables.length;
}
