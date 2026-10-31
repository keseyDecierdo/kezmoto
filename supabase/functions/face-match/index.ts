// KEZMOTO — face-match (step 2 of 2)
//
// Compares a freshly-captured live selfie against the face on the ID photo
// already uploaded in step 1 (verify-id) and judges whether they're the
// same person. Requires step 1 to have already passed — `id_name_matched`
// must be true and an `id_document_url` must be on file — so this can
// never be the first/only step. Writes `profiles.face_verified` and
// recomputes `profiles.verified` (true only once id_name_matched AND
// face_verified both are), mirroring verify-id's own recompute of the same
// flag. Both the downloads (service-role, bypasses the owner/admin-only
// read policy for these legitimate server-side reads) and the write are
// service-role; the caller's own JWT only confirms identity and reads
// their current profile under normal RLS.
import { handlePreflight, json } from '../_shared/cors.ts';
import { supabaseAdmin, supabaseAsCaller } from '../_shared/supabaseAdmin.ts';
import { askGemini, extractJson } from '../_shared/gemini.ts';
import { toBase64 } from '../_shared/base64.ts';

/** Face matching across live camera conditions (lighting, angle, a phone
    camera's own quality) is noisier than verify-id's plain text
    extraction, so a bare "yes" isn't trusted alone — require a confidence
    floor too. A single constant, trivial to tune or remove later. */
const CONFIDENCE_THRESHOLD = 0.6;

interface FaceMatchVerdict {
  matched: boolean | null;
  confidence: number | null;
  reason: string | null;
}

async function downloadAsBase64(
  admin: ReturnType<typeof supabaseAdmin>,
  bucket: string,
  path: string
): Promise<{ base64: string; mimeType: string } | null> {
  const { data: file, error } = await admin.storage.from(bucket).download(path);
  if (error || !file) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { base64: toBase64(bytes), mimeType: file.type || 'image/jpeg' };
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { face_capture_path: facePath } = await req.json();
    if (!facePath || typeof facePath !== 'string') {
      return json({ error: 'face_capture_path is required.' }, 400);
    }

    const asCaller = supabaseAsCaller(req);
    const {
      data: { user },
    } = await asCaller.auth.getUser();
    if (!user) return json({ error: 'Sign in required.' }, 401);

    // Defense in depth — storage RLS already restricts uploads to the
    // caller's own folder, but a wrong path passed here should fail loudly
    // rather than silently comparing someone else's capture.
    if (!facePath.startsWith(`${user.id}/`)) {
      return json({ error: 'That photo does not belong to your account.' }, 403);
    }

    const { data: profile, error: profileError } = await asCaller
      .from('profiles')
      .select('id_name_matched, id_document_url')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (profileError) return json({ error: profileError.message }, 500);

    if (!profile?.id_name_matched || !profile.id_document_url) {
      return json(
        { error: 'Upload and pass step 1 (your valid ID) before scanning your face.' },
        400
      );
    }

    const admin = supabaseAdmin();
    const [idImage, selfieImage] = await Promise.all([
      downloadAsBase64(admin, 'id-documents', profile.id_document_url),
      downloadAsBase64(admin, 'face-captures', facePath),
    ]);
    if (!idImage) return json({ error: 'Could not read your uploaded ID photo.' }, 500);
    if (!selfieImage) return json({ error: 'Could not read that selfie — try capturing again.' }, 500);

    const text = await askGemini({
      system:
        'You compare a government ID photo against a live selfie and judge whether they show the same person. Respond with JSON only.',
      user:
        'The first image is a government ID photo. The second image is a live selfie taken just now ' +
        'by the person claiming to be the ID holder. Do these two photos show the same person\'s face? ' +
        'Respond with only a JSON object: {"matched": true|false, "confidence": <number 0 to 1>, ' +
        '"reason": "<one short sentence>"}',
      images: [idImage, selfieImage],
      maxTokens: 256,
    });

    const parsed = extractJson<FaceMatchVerdict>(text);
    if (parsed?.matched == null) {
      return json(
        { error: 'Could not read that face clearly. Make sure your face is well-lit and centered, then try again.' },
        422
      );
    }

    const confidence =
      typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0;
    const reason = parsed.reason?.trim() || '';
    const aiSaysYes = Boolean(parsed.matched);
    const lowConfidence = aiSaysYes && confidence < CONFIDENCE_THRESHOLD;

    // Trust Gemini's own verdict, but require a confidence floor too — face
    // matching across live camera conditions (lighting, angle, a phone
    // camera's own quality) is noisier than verify-id's plain text
    // extraction, so a bare "yes" without real confidence isn't enough.
    const matched = aiSaysYes && !lowConfidence;
    const note = matched
      ? null
      : lowConfidence
        ? 'Match confidence was too low to confirm — try again with better lighting.'
        : reason || 'Your selfie did not match the face on your uploaded ID.';

    const { error: writeError } = await admin
      .from('profiles')
      .update({
        face_verified: matched,
        verified: matched && Boolean(profile.id_name_matched),
        face_capture_url: facePath,
        face_verification_note: note,
      })
      .eq('profile_id', user.id);
    if (writeError) return json({ error: writeError.message }, 500);

    return json({ matched, confidence });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    // Busy/timeout from the AI layer is transient — 503 lets the client retry.
    const retryable = /busy|too long|could not reach/i.test(message);
    return json({ error: message, retryable }, retryable ? 503 : 500);
  }
});
