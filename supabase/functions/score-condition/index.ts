// KEZMOTO — score-condition
//
// The "worth purchasing" score: reasons about mileage-for-age, whether the
// condition notes suggest issues, and whether the price is consistent with
// both — using comparable listings for price context. Writes are
// service-role only, same lock as score-listing-quality.
import { handlePreflight, json } from '../_shared/cors.ts';
import { supabaseAdmin, supabaseAsCaller } from '../_shared/supabaseAdmin.ts';
import { askGemini, extractJson } from '../_shared/gemini.ts';
import { fetchComparables } from '../_shared/comparables.ts';

interface ConditionResult {
  score: number;
  explanation: string;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { listing_id: listingId } = await req.json();
    if (!listingId || typeof listingId !== 'string') {
      return json({ error: 'listing_id is required.' }, 400);
    }

    const asCaller = supabaseAsCaller(req);
    const { data: listing, error: readError } = await asCaller
      .from('listings')
      .select(
        'listing_id, brand, model, year, mileage, price, reason_for_sale, engine_status, brake_status, tire_status, light_status'
      )
      .eq('listing_id', listingId)
      .maybeSingle();
    if (readError) return json({ error: readError.message }, 500);
    if (!listing) return json({ error: 'Listing not found.' }, 404);

    const comparables = await fetchComparables(asCaller, listing);
    const comparableText =
      comparables.length === 0
        ? 'No comparable listings currently active.'
        : comparables
            .map((c) => `${c.brand} ${c.model} (${c.year}) — ₱${c.price}, ${c.mileage ?? 'unknown'} km`)
            .join('\n');

    const prompt = `Reason step by step, then give a 0–100 "worth purchasing" score for this second-hand motorcycle listing.

Listing: ${listing.brand} ${listing.model}, year ${listing.year}, ${listing.mileage ?? 'unknown'} km, asking ₱${listing.price}.
Reason for sale: ${listing.reason_for_sale || '(not stated)'}
Engine noise: ${listing.engine_status || '(not stated)'}
Brakes: ${listing.brake_status || '(not stated)'}
Tires: ${listing.tire_status || '(not stated)'}
Lights: ${listing.light_status || '(not stated)'}

Comparable active listings (same brand/model, year ± 2):
${comparableText}

Consider: is the mileage high for the bike's age? Do the condition notes suggest issues? Is the price consistent with the stated condition and the comparables? This is based only on what the seller reported, not a physical inspection.

Respond with only a JSON object: {"score": <0-100 integer>, "explanation": "<2-3 sentences, plain language>"}`;

    const text = await askGemini({
      system:
        'You are a motorcycle condition and value assessor for a marketplace in the Philippines. Be balanced, not alarmist, and be explicit that this is based on seller-reported information only. Respond with JSON only.',
      user: prompt,
      maxTokens: 512,
    });

    const parsed = extractJson<ConditionResult>(text);
    const score = parsed && Number.isFinite(parsed.score) ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 50;
    const explanation =
      parsed?.explanation?.trim() ||
      'Based on seller-reported information only — see the KEZMOTO admin verification for confirmed details.';

    const admin = supabaseAdmin();
    const { error: writeError } = await admin
      .from('listings')
      .update({ condition_score: score, condition_score_explanation: explanation })
      .eq('listing_id', listingId);
    if (writeError) return json({ error: writeError.message }, 500);

    return json({ score, explanation });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
