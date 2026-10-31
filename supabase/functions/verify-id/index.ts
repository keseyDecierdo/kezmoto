// KEZMOTO — verify-id (step 1 of 2)
//
// Reads the printed full name off an uploaded valid-ID photo and compares
// it against the caller's own profile name — step 1 of identity
// verification. Writes `profiles.id_name_matched` (not `verified` directly
// — see face-match for step 2). `profiles.verified`, the flag/badge every
// other screen reads, now only becomes true once id_name_matched AND
// face_verified both are, so this recomputes it from the current
// face_verified value every time step 1 runs. On a mismatch,
// `id_verification_note` records why, for the owner's own eyes (mappers.ts
// never surfaces that note on a profile fetched for someone else). Both the
// download (service-role, bypasses the owner/admin-only read policy for
// this one legitimate server-side read) and the write are service-role;
// the caller's own JWT is only used to confirm identity and read their
// current name under normal RLS.
import { handlePreflight, json } from '../_shared/cors.ts';
import { supabaseAdmin, supabaseAsCaller } from '../_shared/supabaseAdmin.ts';
import { askGemini, extractJson } from '../_shared/gemini.ts';
import { toBase64 } from '../_shared/base64.ts';

interface ExtractedName {
  name: string | null;
}

const ID_TYPES = ['national_id', 'drivers_license'] as const;
type IdType = (typeof ID_TYPES)[number];

/** lowercase, letters/spaces only, collapsed whitespace. */
const normalize = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const nameTokens = (name: string): string[] => normalize(name).split(' ').filter(Boolean);

/** first = first token, last = last token, middle = first letter of the
    first token in between (if any) — enough to compare an initial like
    "G" against a spelled-out "Genelaso" without needing the rest to
    match. A single-token name (no last name on file) gets `last` set to
    the same token, so it only matches another single, identical token —
    not just a shared first name against a fuller name. */
function parseName(tokens: string[]): { first: string; last: string; middleFirstLetter: string | null } {
  const first = tokens[0] ?? '';
  const last = tokens[tokens.length - 1] ?? '';
  const middle = tokens.slice(1, -1);
  return { first, last, middleFirstLetter: middle[0]?.[0] ?? null };
}

/**
 * Not a strict legal-ID-grade match (a Phase 1 trust signal, not KYC
 * compliance). First and last name must match exactly; a middle
 * name/initial only has to agree when BOTH sides actually have one, and
 * even then only its first letter needs to match — "G." on one side and
 * "Genelaso" on the other is the same person, not a mismatch.
 */
function namesMatch(profileName: string, idName: string): boolean {
  const profile = parseName(nameTokens(profileName));
  const id = parseName(nameTokens(idName));
  if (!profile.first || !id.first) return false;
  if (profile.first !== id.first || profile.last !== id.last) return false;

  if (profile.middleFirstLetter && id.middleFirstLetter) {
    return profile.middleFirstLetter === id.middleFirstLetter;
  }
  return true;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { id_document_path: path, id_type: idType } = await req.json();
    if (!path || typeof path !== 'string') {
      return json({ error: 'id_document_path is required.' }, 400);
    }
    if (!ID_TYPES.includes(idType)) {
      return json({ error: 'id_type must be "national_id" or "drivers_license".' }, 400);
    }

    const asCaller = supabaseAsCaller(req);
    const {
      data: { user },
    } = await asCaller.auth.getUser();
    if (!user) return json({ error: 'Sign in required.' }, 401);

    // Defense in depth — storage RLS already restricts uploads to the
    // caller's own folder, but a wrong id passed here should fail loudly
    // rather than silently checking someone else's document.
    if (!path.startsWith(`${user.id}/`)) {
      return json({ error: 'That document does not belong to your account.' }, 403);
    }

    const { data: profile, error: profileError } = await asCaller
      .from('profiles')
      .select('full_name, face_verified, id_document_url')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (profileError) return json({ error: profileError.message }, 500);

    const profileName = profile?.full_name?.trim() ?? '';
    if (!profileName) {
      return json(
        { error: 'Set your name in your profile before uploading a valid ID.' },
        400
      );
    }

    const admin = supabaseAdmin();
    const { data: file, error: downloadError } = await admin.storage
      .from('id-documents')
      .download(path);
    if (downloadError || !file) {
      return json({ error: downloadError?.message ?? 'Could not read the uploaded ID.' }, 500);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = toBase64(bytes);
    const mimeType = file.type || 'image/jpeg';

    const text = await askGemini({
      system:
        'You read government-issued ID cards and extract the full name printed on them. Respond with JSON only.',
      user: 'What is the full name printed on this ID? Respond with only a JSON object: {"name": "<full name as printed, or null if you cannot read one>"}',
      image: { base64, mimeType },
      maxTokens: 256,
    });

    const parsed = extractJson<ExtractedName>(text);
    const extractedName = parsed?.name?.trim() || '';

    if (!extractedName) {
      return json({ error: 'Could not read a name off that photo. Try a clearer, well-lit picture.' }, 422);
    }

    const matched = namesMatch(profileName, extractedName);

    // A new ID photo invalidates any prior face match — that selfie was
    // compared against the OLD photo, and says nothing about this one.
    const isNewDocument = profile?.id_document_url !== path;
    const faceVerified = isNewDocument ? false : Boolean(profile?.face_verified);

    const { error: writeError } = await admin
      .from('profiles')
      .update({
        id_name_matched: matched,
        id_type: idType as IdType,
        id_document_url: path,
        id_verification_note: matched
          ? null
          : `ID name "${extractedName}" does not match profile name "${profileName}".`,
        verified: matched && faceVerified,
        ...(isNewDocument
          ? { face_verified: false, face_verification_note: null, face_capture_url: null }
          : {}),
      })
      .eq('profile_id', user.id);
    if (writeError) return json({ error: writeError.message }, 500);

    return json({ matched, extractedName });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
