// KEZMOTO — score-listing-quality
//
// Layer 1 (rules, 80 pts) is computed here from the listing row itself —
// never trusted from the client, so a seller can't just claim "5 photos"
// without actually having them. Layer 2 (AI, 20 pts) rates how specific the
// condition notes are. The total + breakdown are written with the
// service-role client, since listings_enforce_score_lock (0012) blocks
// everyone else from touching these columns, including the seller.
import { handlePreflight, json } from '../_shared/cors.ts';
import { supabaseAdmin, supabaseAsCaller } from '../_shared/supabaseAdmin.ts';
import { askGemini, extractJson } from '../_shared/gemini.ts';

interface QualityCheck {
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
}

function scoreLayer1(listing: {
  photos: string[] | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  price: number | null;
  location: string | null;
  documents: string[] | null;
}): QualityCheck[] {
  const photoCount = listing.photos?.length ?? 0;
  const mileageOk = listing.mileage != null && listing.mileage > 0 && listing.mileage < 300000;
  const documentCount = listing.documents?.length ?? 0;

  return [
    { label: 'Photos complete (5+)', passed: photoCount >= 5, points: photoCount >= 5 ? 20 : 0, maxPoints: 20 },
    {
      label: 'Full specs provided',
      passed: Boolean(listing.brand && listing.model && listing.year),
      points: listing.brand && listing.model && listing.year ? 15 : 0,
      maxPoints: 15,
    },
    { label: 'Mileage provided', passed: mileageOk, points: mileageOk ? 10 : 0, maxPoints: 10 },
    {
      label: 'Price provided',
      passed: Boolean(listing.price && listing.price > 0),
      points: listing.price && listing.price > 0 ? 10 : 0,
      maxPoints: 10,
    },
    {
      label: 'Location provided',
      passed: Boolean(listing.location?.trim()),
      points: listing.location?.trim() ? 10 : 0,
      maxPoints: 10,
    },
    {
      label: 'Documents attached (2+)',
      passed: documentCount >= 2,
      points: documentCount >= 2 ? 15 : 0,
      maxPoints: 15,
    },
  ];
}

async function scoreLayer2(condition: {
  engine_status: string | null;
  brake_status: string | null;
  tire_status: string | null;
  light_status: string | null;
}): Promise<QualityCheck> {
  const prompt = `Rate how specific and informative these seller-written motorcycle condition notes are, from 0 to 20. A vague note like "good condition" scores low; a specific one naming what was checked, replaced, or noticed (mileage of parts, dates, particular sounds/issues) scores high.

Engine noise: ${condition.engine_status || '(not provided)'}
Brakes: ${condition.brake_status || '(not provided)'}
Tires: ${condition.tire_status || '(not provided)'}
Lights: ${condition.light_status || '(not provided)'}

Respond with only a JSON object: {"score": <0-20 integer>, "reason": "<one short sentence>"}`;

  const text = await askGemini({
    system: 'You are a strict but fair listing-quality grader for a motorcycle marketplace. Respond with JSON only.',
    user: prompt,
    maxTokens: 256,
  });

  const parsed = extractJson<{ score: number; reason: string }>(text);
  const score = parsed && Number.isFinite(parsed.score) ? Math.max(0, Math.min(20, Math.round(parsed.score))) : 10;
  const reason = parsed?.reason?.trim() || 'Condition description could be more detailed.';

  return { label: reason, passed: score >= 14, points: score, maxPoints: 20 };
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
        'listing_id, seller_id, photos, brand, model, year, mileage, price, location, documents, engine_status, brake_status, tire_status, light_status'
      )
      .eq('listing_id', listingId)
      .maybeSingle();
    if (readError) return json({ error: readError.message }, 500);
    if (!listing) return json({ error: 'Listing not found.' }, 404);

    const layer1 = scoreLayer1(listing);
    const layer2 = await scoreLayer2(listing);
    const breakdown = [...layer1, layer2];
    const score = breakdown.reduce((sum, check) => sum + check.points, 0);

    const admin = supabaseAdmin();
    const { error: writeError } = await admin
      .from('listings')
      .update({ listing_quality_score: score, listing_quality_breakdown: breakdown })
      .eq('listing_id', listingId);
    if (writeError) return json({ error: writeError.message }, 500);

    return json({ score, breakdown });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
