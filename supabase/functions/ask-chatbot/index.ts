// KEZMOTO — ask-chatbot
//
// Buying-advice assistant. If a listing_id is given, fetches that listing
// plus comparables so the AI can reason about whether the price looks fair
// rather than guessing. Logs every Q&A to ai_chatbot_logs under the caller's
// own RLS session (that table's insert policy already allows this — no
// service-role client needed anywhere in this function).
import { handlePreflight, json } from '../_shared/cors.ts';
import { supabaseAsCaller } from '../_shared/supabaseAdmin.ts';
import { askGemini } from '../_shared/gemini.ts';
import { fetchComparables } from '../_shared/comparables.ts';

const SYSTEM_PROMPT = `You are a motorcycle-buying assistant for first-time buyers in the Philippines. Be concise, practical, and safety-focused. Cover things like OR/CR verification, LTO transfer process, mechanical red flags, and fair negotiation tips.

If listing data is provided, compare the target listing's price against the comparable listings before judging whether the price is fair, and explain why in plain language.`;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { question, listing_id: listingId } = await req.json();
    if (!question || typeof question !== 'string') {
      return json({ error: 'question is required.' }, 400);
    }

    const asCaller = supabaseAsCaller(req);
    const {
      data: { user },
    } = await asCaller.auth.getUser();
    if (!user) return json({ error: 'Sign in required.' }, 401);

    let context = '';
    if (listingId && typeof listingId === 'string') {
      const { data: listing } = await asCaller
        .from('listings')
        .select('listing_id, brand, model, year, price, mileage, engine_status, brake_status, tire_status, light_status')
        .eq('listing_id', listingId)
        .maybeSingle();

      if (listing) {
        const comparables = await fetchComparables(asCaller, listing);
        context = `\n\nListing in question: ${listing.brand} ${listing.model} (${listing.year}), ₱${listing.price}, ${listing.mileage ?? 'unknown'} km. Condition notes — engine: ${listing.engine_status ?? 'not stated'}; brakes: ${listing.brake_status ?? 'not stated'}; tires: ${listing.tire_status ?? 'not stated'}; lights: ${listing.light_status ?? 'not stated'}.\n\nComparable listings currently active: ${
          comparables.length === 0
            ? 'none found.'
            : comparables.map((c) => `${c.brand} ${c.model} (${c.year}) — ₱${c.price}, ${c.mileage ?? 'unknown'} km`).join('; ')
        }`;
      }
    }

    const answer = await askGemini({
      system: SYSTEM_PROMPT,
      user: `${context}\n\nBuyer's question: ${question}`,
      maxTokens: 1024,
    });

    // Best-effort logging — a logging failure shouldn't hide the answer from the user.
    await asCaller.from('ai_chatbot_logs').insert({
      user_id: user.id,
      question,
      answer,
      listing_id: listingId ?? null,
    });

    return json({ answer });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
