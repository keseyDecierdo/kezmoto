/* =========================================================================
   KEZMOTO - AI features (Phase 5)

   The app never calls Gemini directly and never sees an API key - every
   call here goes through a Supabase Edge Function, which holds the key as
   a secret and is the only thing that ever writes a score or a fraud flag.
   This file is a thin, typed wrapper over `supabase.functions.invoke`.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { IdType, QualityCheck } from '../types';

export interface AskChatbotResult {
  answer: string;
}

export interface ScoreListingQualityResult {
  score: number;
  breakdown: QualityCheck[];
}

export interface ScoreConditionResult {
  score: number;
  explanation: string;
}

export interface CheckFraudResult {
  flagsRaised: number;
}

export interface VerifyIdResult {
  matched: boolean;
  extractedName: string;
}

export interface FaceMatchResult {
  matched: boolean;
  confidence: number;
}

/**
 * A non-2xx response's `error.message` from supabase-js is always the
 * generic "Edge Function returned a non-2xx status code" - the function's
 * own `{ error: "..." }` body (see every function's `json({ error }, ...)`
 * calls) is only reachable via `error.context`, the raw Response. Every AI
 * call benefits from surfacing that real message instead of the generic
 * one - verify-id in particular has several specific, user-facing errors
 * (blank name, unreadable photo) that would otherwise be silently lost.
 */
const messageFrom = async (error: { message?: string; context?: unknown }): Promise<string> => {
  const context = error.context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // body wasn't JSON - fall through to the generic message below
    }
  }
  return error.message ?? 'Edge Function unavailable - has it been deployed?';
};

const RETRY_DELAYS_MS = [2000, 4000];
const isTransient = (message: string) => /busy|too long|could not reach/i.test(message);

const invoke = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    const { data, error } = await supabase.functions.invoke<T>(name, { body });
    if (!error) {
      if (!data) throw new Error(`${name} returned no data.`);
      return data;
    }
    const message = await messageFrom(error);
    // Busy/overloaded AI is usually gone in seconds - retry quietly before
    // bothering the user with an error.
    if (attempt < RETRY_DELAYS_MS.length && isTransient(message)) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      continue;
    }
    throw new Error(`${name} failed. (${message})`);
  }
};

export const aiApi = {
  /** `listingId` is optional - omit it for a general buying-advice question. */
  askChatbot(question: string, listingId?: string): Promise<AskChatbotResult> {
    return invoke('ask-chatbot', { question, listing_id: listingId });
  },

  /** Rules-based Layer 1 + AI-assisted Layer 2, summed and written to the listing. */
  scoreListingQuality(listingId: string): Promise<ScoreListingQualityResult> {
    return invoke('score-listing-quality', { listing_id: listingId });
  },

  /** The "worth buying" score - mileage/price/condition-text reasoning against comparables. */
  scoreCondition(listingId: string): Promise<ScoreConditionResult> {
    return invoke('score-condition', { listing_id: listingId });
  },

  /** Runs all five fraud checks (4 rules + 1 AI) and writes any that fire to `fraud_flags`. */
  checkFraud(listingId: string): Promise<CheckFraudResult> {
    return invoke('check-listing-fraud', { listing_id: listingId });
  },

  /** Reads the printed name off an uploaded valid ID and matches it against
      the caller's own profile name - sets `profiles.id_name_matched` (step
      1 of 2; see faceMatch for the other half of `verified`). */
  verifyId(idDocumentPath: string, idType: IdType): Promise<VerifyIdResult> {
    return invoke('verify-id', { id_document_path: idDocumentPath, id_type: idType });
  },

  /** Compares a freshly captured live selfie against the ID photo already
      on file (the function reads that path itself) - sets
      `profiles.face_verified`, and `profiles.verified` once both steps
      have passed. */
  faceMatch(faceCapturePath: string): Promise<FaceMatchResult> {
    return invoke('face-match', { face_capture_path: faceCapturePath });
  },
};
