// KEZMOTO — check-listing-fraud
//
// Runs all five checks from the brief against one listing and writes any
// that fire to `fraud_flags`. Four are deterministic rules (no AI call);
// the fifth sends the listing's text to Gemini for scam-pattern language.
// None of these ever touch the listing itself — they only ever produce
// advisory rows an admin reviews (see the Fraud Flag Review screen).
//
// Every read here uses the caller-scoped client — RLS already lets any
// signed-in seller read active listings, so no elevated privilege is needed
// to run the checks. Only the final `fraud_flags` insert needs the
// service-role client, because that table has no policy granting anything
// to a non-admin session (see 0013) — not even the ability to see whether
// your own listing was flagged.
import { handlePreflight, json } from '../_shared/cors.ts';
import { supabaseAdmin, supabaseAsCaller } from '../_shared/supabaseAdmin.ts';
import { askGemini, extractJson } from '../_shared/gemini.ts';
import { averagePrice, fetchComparables } from '../_shared/comparables.ts';

interface FlagToWrite {
  flag_type:
    | 'low_price'
    | 'duplicate_image'
    | 'duplicate_listing'
    | 'suspicious_text'
    | 'posting_pattern'
    | 'duplicate_posting';
  detail: string;
  ai_confidence: number;
}

const LOW_PRICE_RATIO = 0.6; // flag if more than ~40% below the comparable average
const IMAGE_HASH_THRESHOLD = 6; // out of 64 bits — a close visual match
const POSTING_PATTERN_LIMIT = 5; // listings
const POSTING_PATTERN_WINDOW_HOURS = 24;

function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
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
        'listing_id, seller_id, brand, model, year, price, photo_hashes, description, reason_for_sale, engine_status, brake_status, tire_status, light_status, created_at'
      )
      .eq('listing_id', listingId)
      .maybeSingle();
    if (readError) return json({ error: readError.message }, 500);
    if (!listing) return json({ error: 'Listing not found.' }, 404);

    const flags: FlagToWrite[] = [];

    // 1. Unrealistic price — rules-based, one aggregate query.
    const comparables = await fetchComparables(asCaller, listing);
    const avg = averagePrice(comparables);
    if (avg != null && Number(listing.price) < avg * LOW_PRICE_RATIO) {
      flags.push({
        flag_type: 'low_price',
        detail: `Asking ₱${listing.price} vs. an average of ₱${Math.round(avg)} across ${comparables.length} comparable active listing(s).`,
        ai_confidence: 1.0,
      });
    }

    // 2. Duplicate / reused images — perceptual-hash comparison.
    const myHashes: string[] = listing.photo_hashes ?? [];
    if (myHashes.length > 0) {
      const { data: others } = await asCaller
        .from('listings')
        .select('listing_id, brand, model, photo_hashes')
        .eq('status', 'active')
        .neq('listing_id', listingId)
        .not('photo_hashes', 'is', null);

      for (const other of others ?? []) {
        const otherHashes: string[] = other.photo_hashes ?? [];
        const match = myHashes.some((mine) =>
          otherHashes.some((theirs) => hammingDistanceHex(mine, theirs) <= IMAGE_HASH_THRESHOLD)
        );
        if (match) {
          flags.push({
            flag_type: 'duplicate_image',
            detail: `A photo closely matches one on "${other.brand} ${other.model}" (listing ${other.listing_id}).`,
            ai_confidence: 1.0,
          });
          break; // one flag is enough to send to review
        }
      }
    }

    // 2b. Duplicate posting — same brand/model AND a closely-matching photo,
    // from a DIFFERENT seller: the classic "stolen photo, re-posted by
    // someone else" scam signal. Tighter than #2 above (image-only, no
    // brand/model match, no seller exclusion) — this is the one check that
    // also pushes a notification to every admin, since it's precise enough
    // to be worth an immediate look rather than waiting on the next pull of
    // Fraud Flag Review.
    if (myHashes.length > 0) {
      const { data: sameSellerExcluded } = await asCaller
        .from('listings')
        .select('listing_id, seller_id, brand, model, photo_hashes')
        .eq('status', 'active')
        .neq('listing_id', listingId)
        .neq('seller_id', listing.seller_id)
        .not('photo_hashes', 'is', null);

      const myBrand = (listing.brand ?? '').trim().toLowerCase();
      const myModel = (listing.model ?? '').trim().toLowerCase();

      for (const other of sameSellerExcluded ?? []) {
        const sameModel =
          (other.brand ?? '').trim().toLowerCase() === myBrand &&
          (other.model ?? '').trim().toLowerCase() === myModel;
        if (!sameModel) continue;

        const otherHashes: string[] = other.photo_hashes ?? [];
        const match = myHashes.some((mine) =>
          otherHashes.some((theirs) => hammingDistanceHex(mine, theirs) <= IMAGE_HASH_THRESHOLD)
        );
        if (match) {
          flags.push({
            flag_type: 'duplicate_posting',
            detail: `Same brand/model and a closely-matching photo as "${other.brand} ${other.model}" (listing ${other.listing_id}), posted by a different seller.`,
            ai_confidence: 1.0,
          });
          break;
        }
      }
    }

    // 3. Duplicate listing text — pg_trgm similarity via the DB function from 0012.
    const targetText = `${listing.description ?? ''} ${listing.reason_for_sale ?? ''}`.trim();
    if (targetText.length > 0) {
      const { data: similar } = await asCaller.rpc('find_similar_listings', {
        target_text: targetText,
        exclude_listing_id: listingId,
        exclude_seller_id: listing.seller_id,
        similarity_threshold: 0.5,
      });
      if (similar && similar.length > 0) {
        flags.push({
          flag_type: 'duplicate_listing',
          detail: `Description text closely matches ${similar.length} listing(s) from other sellers (top match: ${Math.round(similar[0].similarity * 100)}% similar).`,
          ai_confidence: 1.0,
        });
      }
    }

    // 4. Posting pattern abuse — same seller, many listings, short window.
    const windowStart = new Date(Date.now() - POSTING_PATTERN_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { count } = await asCaller
      .from('listings')
      .select('listing_id', { count: 'exact', head: true })
      .eq('seller_id', listing.seller_id)
      .gte('created_at', windowStart);
    if ((count ?? 0) > POSTING_PATTERN_LIMIT) {
      flags.push({
        flag_type: 'posting_pattern',
        detail: `Seller has posted ${count} listings in the last ${POSTING_PATTERN_WINDOW_HOURS} hours.`,
        ai_confidence: 1.0,
      });
    }

    // 5. Suspicious description text — the one AI call in this feature.
    const textForReview = [listing.description, listing.reason_for_sale, listing.engine_status, listing.brake_status]
      .filter(Boolean)
      .join('\n');
    if (textForReview.trim().length > 0) {
      const prompt = `Read this second-hand motorcycle listing text and judge whether it shows scam-pattern language: urgency pressure, requests to pay or communicate outside the platform, "too good to be true" framing, or details that contradict each other.

Listing text:
${textForReview}

Respond with only a JSON object: {"confidence": <0.0-1.0>, "reason": "<one short sentence>"}. Use a low confidence (under 0.3) for normal, honest-sounding listings — most listings are not scams.`;

      const text = await askGemini({
        system: 'You are a fraud-pattern detector for a motorcycle marketplace. Respond with JSON only.',
        user: prompt,
        maxTokens: 256,
      });
      const parsed = extractJson<{ confidence: number; reason: string }>(text);
      const confidence = parsed && Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
      if (confidence >= 0.5) {
        flags.push({
          flag_type: 'suspicious_text',
          detail: parsed?.reason?.trim() || 'Listing text flagged for scam-pattern language.',
          ai_confidence: Math.round(confidence * 100) / 100,
        });
      }
    }

    if (flags.length > 0) {
      const admin = supabaseAdmin();
      const { error: writeError } = await admin
        .from('fraud_flags')
        .insert(flags.map((flag) => ({ listing_id: listingId, ...flag })));
      if (writeError) return json({ error: writeError.message }, 500);

      // Only duplicate_posting pushes a notification — the other four checks
      // stay exactly as they were, pull-only via Fraud Flag Review.
      if (flags.some((flag) => flag.flag_type === 'duplicate_posting')) {
        try {
          const { data: admins } = await admin.from('profiles').select('profile_id').eq('role', 'admin');
          await Promise.all(
            ((admins ?? []) as { profile_id: string }[]).map((row) =>
              admin.from('notifications').insert({
                recipient_id: row.profile_id,
                type: 'fraud_flag',
                title: 'Suspicious listing detected',
                body: `${listing.brand} ${listing.model} looks like a duplicate of another seller's listing.`,
                link: '/admin/fraud',
              })
            )
          );
        } catch {
          // Notification is a courtesy; the flag itself is already saved.
        }
      }
    }

    return json({ flagsRaised: flags.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
