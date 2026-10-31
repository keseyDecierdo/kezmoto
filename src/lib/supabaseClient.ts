import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * The one Supabase client for the whole app. Every service imports this
 * instance — creating a second one would mean a second auth listener and a
 * second realtime socket.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Supabase is not configured. Copy .env.example to .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from Supabase → Project Settings → API.'
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const PHOTO_BUCKET = 'listing-photos';
export const DOCUMENT_BUCKET = 'listing-documents';
export const PROOF_BUCKET = 'payment-proofs';
export const ID_BUCKET = 'id-documents';
export const FACE_BUCKET = 'face-captures';
