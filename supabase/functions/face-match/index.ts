// KEZMOTO - face-match (step 2 of 2)
//
// Compares a freshly-captured live selfie against the face on the ID photo
// already uploaded in step 1 (verify-id) and judges whether they're the
// same person. Requires step 1 to have already passed - `id_name_matched`
// must be true and an `id_document_url` must be on file - so this can
// never be the first/only step. Writes `profiles.face_verified` and
// recomputes `profiles.verified` (true only once id_name_matched AND
// face_verified both are), mirroring verify-id's own recompute of the same
// flag. Both the downloads (service-role, bypasses the owner/admin-only
// read policy for these legitimate server-side reads) and the write are
// service-role; the caller's own JWT only confirms identity and reads
// their current profile under normal RLS.
//
// The comparison itself runs on KEZMOTO's own Python face-service
// (face-service/ in this repo, hosted on Render). It uses the open-source
// face_recognition library: each face becomes a 128-number "face
// fingerprint", and the two are the same person when the distance between
// them is at or below the threshold. It only compares face geometry - it
// never looks at gender or any other attribute.
//
// Required secrets (Supabase > Edge Functions > Secrets):
//   FACE_SERVICE_URL     e.g. https://kezmoto-face-service.onrender.com
//   FACE_SERVICE_SECRET  the same value as FACE_SERVICE_SECRET on Render
import { handlePreflight, json } from '../_shared/cors.ts';
import { supabaseAdmin, supabaseAsCaller } from '../_shared/supabaseAdmin.ts';
import { toBase64 } from '../_shared/base64.ts';

/** Max face distance accepted as the same person. The face-service applies
    its own threshold too; this is checked again here so the decision that
    gets written to the database is made by this function, not trusted
    blindly from the network. 0.6 is the library default. dlib's model is
    known to rate different people of the same (especially Asian) ethnicity
    as closer than it should, and 0.5 let a different person through in
    testing - so KEZMOTO uses a strict 0.4. */
const MAX_DISTANCE = 0.4;

/** Shows up in the response and the logs, so it's easy to confirm which
    version of this function is actually deployed. */
const ENGINE = 'face-service-v2';

/** A free Render service sleeps when idle and needs up to about a minute to
    wake, so the first request after a quiet period is slow - allow for it. */
const SERVICE_TIMEOUT_MS = 100_000;

interface CompareResult {
  id_faces: number;
  selfie_faces: number;
  distance: number | null;
  matched: boolean;
  threshold: number;
}

async function downloadAsBase64(
  admin: ReturnType<typeof supabaseAdmin>,
  bucket: string,
  path: string
): Promise<string | null> {
  const { data: file, error } = await admin.storage.from(bucket).download(path);
  if (error || !file) return null;
  return toBase64(new Uint8Array(await file.arrayBuffer()));
}

/** Sends both photos to the Python face-service and returns its result. */
async function compareFaces(idBase64: string, selfieBase64: string): Promise<CompareResult> {
  const baseUrl = Deno.env.get('FACE_SERVICE_URL');
  const secret = Deno.env.get('FACE_SERVICE_SECRET');
  if (!baseUrl || !secret) {
    throw new Error('Face verification is not configured (missing FACE_SERVICE_URL or FACE_SERVICE_SECRET).');
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, '')}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ id_image: idBase64, selfie_image: selfieBase64 }),
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[face-match] face-service unreachable:', err);
    // "busy" makes the app retry on its own (see aiService.ts isTransient).
    throw new Error('Face verification is busy right now - please try again in a moment.');
  }

  if (res.ok) return (await res.json()) as CompareResult;

  const detail = await res.text().catch(() => '');
  console.error('[face-match] face-service error:', res.status, detail);
  if (res.status === 422) throw new BadImageError();
  if (res.status === 401 || res.status === 403) {
    throw new Error('Face verification is misconfigured (FACE_SERVICE_SECRET does not match Render).');
  }
  // 502/503/504 = Render still waking up or restarting.
  throw new Error('Face verification is busy right now - please try again in a moment.');
}

class BadImageError extends Error {}

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

    // Defense in depth - storage RLS already restricts uploads to the
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

    // The ID photo is always THIS user's own uploaded ID, read from their
    // profile - never a path the client sends.
    const admin = supabaseAdmin();
    const [idImage, selfieImage] = await Promise.all([
      downloadAsBase64(admin, 'id-documents', profile.id_document_url),
      downloadAsBase64(admin, 'face-captures', facePath),
    ]);
    if (!idImage) return json({ error: 'Could not read your uploaded ID photo.' }, 500);
    if (!selfieImage) return json({ error: 'Could not read that selfie - try capturing again.' }, 500);

    // A new scan always starts from "not verified". Without this, a scan that
    // ends in an error or a retake message would leave an OLD pass on the
    // account - so a previous (wrong) "face verified" could never be undone
    // by scanning someone else's face. Only a real match below sets it again.
    const { error: resetError } = await admin
      .from('profiles')
      .update({ face_verified: false, verified: false })
      .eq('profile_id', user.id);
    if (resetError) return json({ error: resetError.message }, 500);

    let result: CompareResult;
    try {
      result = await compareFaces(idImage, selfieImage);
    } catch (err) {
      if (err instanceof BadImageError) {
        return json({ error: 'That photo could not be processed. Please capture it again.' }, 422);
      }
      throw err;
    }

    // A face that can't be found is a retake, not a mismatch - don't mark the
    // account as failed for it.
    if (result.id_faces === 0) {
      return json(
        {
          error:
            'No face was found on your uploaded ID. Re-upload a sharp, well-lit photo of your ID in step 1, with the portrait clearly visible.',
        },
        422
      );
    }
    if (result.selfie_faces === 0) {
      return json(
        { error: 'Your face was not visible in the selfie. Face the camera in good light and try again.' },
        422
      );
    }
    if (result.selfie_faces > 1) {
      return json(
        { error: 'More than one face was detected. Make sure only your face is in the camera and try again.' },
        422
      );
    }

    const distance = typeof result.distance === 'number' ? result.distance : Infinity;
    // Both must agree: the face-service's own verdict AND this function's
    // threshold.
    const matched = Boolean(result.matched) && distance <= MAX_DISTANCE;
    console.log(`[face-match] ${ENGINE} user=${user.id} distance=${distance} max=${MAX_DISTANCE} matched=${matched}`);

    const note = matched
      ? null
      : 'Your selfie did not match the face on your uploaded ID. Make sure you are using your own ID and try again.';

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

    // `confidence` keeps the 0-1 shape the client already expects: 1 at
    // distance 0 (identical), 0 at distance 1 or more.
    const confidence = Number.isFinite(distance) ? Math.max(0, Math.min(1, 1 - distance)) : 0;
    return json({
      matched,
      confidence: Math.round(confidence * 100) / 100,
      // For checking/tuning in the browser's Network tab; the app ignores these.
      distance: Number.isFinite(distance) ? distance : null,
      max_distance: MAX_DISTANCE,
      engine: ENGINE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    console.error('[face-match]', message);
    const retryable = /busy|too long|could not reach/i.test(message);
    return json({ error: message, retryable }, retryable ? 503 : 500);
  }
});
