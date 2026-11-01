/* =========================================================================
   KEZMOTO - Storage
   Photos live in a public bucket and are stored as paths; documents live in a
   private bucket and are only ever handed out as short-lived signed URLs.
   Every object is written under `{profile_id}/…`, which is what the storage
   policies check.
   ========================================================================= */

import { DOCUMENT_BUCKET, FACE_BUCKET, ID_BUCKET, PHOTO_BUCKET, PROOF_BUCKET, supabase } from '../lib/supabaseClient';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/* -------------------------------------------------------------------------
   Local file staging

   The unit form creates object URLs so a pick renders instantly. The file
   itself is parked here under that URL and only uploaded when the seller
   saves, so abandoning the form costs nothing.
   ------------------------------------------------------------------------- */
const pendingFiles = new Map<string, File>();

export const rememberFile = (localUrl: string, file: File): void => {
  pendingFiles.set(localUrl, file);
};

export const isPendingUpload = (url: string): boolean => url.startsWith('blob:');

export const takePendingFile = (localUrl: string): File | undefined => {
  const file = pendingFiles.get(localUrl);
  pendingFiles.delete(localUrl);
  return file;
};

/** Non-destructive read - for the Phase 5 photo-hash pass, which needs the
    File without consuming it ahead of the actual upload. */
export const peekPendingFile = (localUrl: string): File | undefined => {
  return pendingFiles.get(localUrl);
};

/** Already a URL (sample artwork under /mock, or an absolute link)? Leave it. */
const isPlainUrl = (value: string): boolean =>
  value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/');

/* -------------------------------------------------------------------------
   Resolved URL → stored value

   A screen holds the URL it was given to render - a public link, or a signed
   one that expires within the hour. When that same value comes back on save
   (editing a unit, say), it has to become the bucket path again, or the row
   would end up holding a URL that stops working.
   ------------------------------------------------------------------------- */
const storedValueByUrl = new Map<string, string>();

const rememberResolved = (storedValue: string, url: string): string => {
  if (url !== storedValue) storedValueByUrl.set(url, storedValue);
  return url;
};

const extensionOf = (file: File): string => {
  const fromName = file.name.split('.').pop();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) return fromName.toLowerCase();
  const fromType = file.type.split('/')[1];
  return fromType ? fromType.toLowerCase() : 'bin';
};

const objectPath = (ownerId: string, file: File): string =>
  `${ownerId}/${crypto.randomUUID()}.${extensionOf(file)}`;

const upload = async (bucket: string, ownerId: string, file: File): Promise<string> => {
  const path = objectPath(ownerId, file);
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`);
  return path;
};

export const uploadPhoto = (ownerId: string, file: File) => upload(PHOTO_BUCKET, ownerId, file);
export const uploadDocument = (ownerId: string, file: File) => upload(DOCUMENT_BUCKET, ownerId, file);
export const uploadProof = (ownerId: string, file: File) => upload(PROOF_BUCKET, ownerId, file);
export const uploadIdDocument = (ownerId: string, file: File) => upload(ID_BUCKET, ownerId, file);
export const uploadFaceCapture = (ownerId: string, file: File) => upload(FACE_BUCKET, ownerId, file);

/**
 * Turns whatever the draft holds into a stored value: pending picks are
 * uploaded, anything already stored (or sample artwork) passes through.
 * Returns null when a pick can no longer be found, so callers that pair the
 * result with other draft state can drop both halves together.
 */
export const persistAsset = async (
  url: string,
  ownerId: string,
  kind: 'photo' | 'document'
): Promise<string | null> => {
  const alreadyStored = storedValueByUrl.get(url);
  if (alreadyStored) return alreadyStored;
  if (!isPendingUpload(url)) return url;
  const file = takePendingFile(url);
  if (!file) return null; // pick was revoked before save - better dropped than stored dead
  return kind === 'photo' ? uploadPhoto(ownerId, file) : uploadDocument(ownerId, file);
};

/** Same, for a whole list; anything that could not be resolved is dropped. */
export const persistAssets = async (
  urls: string[],
  ownerId: string,
  kind: 'photo' | 'document'
): Promise<string[]> => {
  const stored: string[] = [];
  for (const url of urls) {
    const value = await persistAsset(url, ownerId, kind);
    if (value) stored.push(value);
  }
  return stored;
};

/* ------------------------------------------------------------------ reads */

/** Public bucket: the URL can be built without a round trip. */
export const photoUrl = (storedValue: string): string => {
  if (isPlainUrl(storedValue)) return storedValue;
  const url = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storedValue).data.publicUrl;
  return rememberResolved(storedValue, url);
};

/**
 * Private bucket: one signed URL per document, minted in a single request for
 * the whole batch. Signing needs a session, so signed-out visitors get nothing
 * back and the listing simply renders without its document previews.
 */
export const signDocumentUrls = async (storedValues: string[]): Promise<Map<string, string>> => {
  const resolved = new Map<string, string>();
  const needsSigning: string[] = [];

  for (const value of storedValues) {
    if (isPlainUrl(value)) resolved.set(value, value);
    else if (!resolved.has(value)) needsSigning.push(value);
  }

  if (needsSigning.length === 0) return resolved;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return resolved;

  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrls(needsSigning, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return resolved;

  for (const entry of data) {
    if (entry.signedUrl && entry.path) {
      resolved.set(entry.path, rememberResolved(entry.path, entry.signedUrl));
    }
  }
  return resolved;
};

/** One signed URL for a proof-of-payment screenshot. Null if there is none, or signing fails. */
export const signProofUrl = async (storedValue: string | null): Promise<string | null> => {
  if (!storedValue) return null;
  if (isPlainUrl(storedValue)) return storedValue;

  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(storedValue, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return rememberResolved(storedValue, data.signedUrl);
};

/** One signed URL for a valid-ID photo. Storage RLS only allows the owner
    or an admin to read it, so this only ever resolves for the document's
    own owner viewing their own Profile page. Null if there is none, or
    signing fails (including a non-owner caller - RLS rejects the sign). */
export const signIdDocumentUrl = async (storedValue: string | null): Promise<string | null> => {
  if (!storedValue) return null;
  if (isPlainUrl(storedValue)) return storedValue;

  const { data, error } = await supabase.storage
    .from(ID_BUCKET)
    .createSignedUrl(storedValue, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return rememberResolved(storedValue, data.signedUrl);
};

/** One signed URL for a live-selfie capture. Same owner/admin-only RLS as
    signIdDocumentUrl. Null if there is none, or signing fails. */
export const signFaceCaptureUrl = async (storedValue: string | null): Promise<string | null> => {
  if (!storedValue) return null;
  if (isPlainUrl(storedValue)) return storedValue;

  const { data, error } = await supabase.storage
    .from(FACE_BUCKET)
    .createSignedUrl(storedValue, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return rememberResolved(storedValue, data.signedUrl);
};
