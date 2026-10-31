// Service-role client for use inside Edge Functions only — never ship this
// key to the frontend. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically into every Edge Function's environment by the
// Supabase platform; nothing to configure for these two specifically.
import { createClient } from 'npm:@supabase/supabase-js@2';

export function supabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in this function's environment.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * A client scoped to the calling user's own JWT, so a read through it is
 * still subject to normal RLS — used both to confirm the caller is really
 * who they claim to be, and to read data (comparable listings, the target
 * listing) that RLS already lets them see, without needing service-role
 * privileges for reads at all.
 */
export function supabaseAsCaller(req: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY are not set in this function's environment.");
  }
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
