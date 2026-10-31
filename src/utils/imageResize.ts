/* =========================================================================
   KEZMOTO — Image downscaling

   A raw photo straight off a phone camera is 3-12 MB, and the AI features
   send one (verify-id) or two (face-match) of them to Gemini as base64,
   which inflates bytes by a further ~33%. That payload size is what drives
   the quota/overload failures and the slowness, so anything headed for an
   AI check gets shrunk here first.

   Decoding follows the same approach as imageHash.ts — createImageBitmap
   straight off the File, into an OffscreenCanvas — but this produces a new
   JPEG File rather than reading pixels back.
   ========================================================================= */

/** Readable printed text is the constraint, not the picture quality: verify-id
    has to OCR the name off an ID. Comfortably enough detail for that, while
    still cutting a 12 MB photo to a few hundred KB. */
export const AI_IMAGE_MAX_EDGE = 2000;
const DEFAULT_QUALITY = 0.85;

/** Longest-edge-constrained dimensions, preserving aspect ratio. Never
    upscales — a photo already smaller than the cap is left at its own size. */
const fit = (width: number, height: number, maxEdge: number) => {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

/**
 * Re-encodes `file` as a JPEG no larger than `maxEdge` on its longest side.
 *
 * Best-effort by design: a format the runtime can't decode (iOS HEIC in some
 * browsers) returns the **original** file rather than throwing, so a resize
 * problem can never be the reason someone can't upload their ID at all.
 */
export async function downscaleImage(
  file: File,
  maxEdge: number = AI_IMAGE_MAX_EDGE,
  quality: number = DEFAULT_QUALITY
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fit(bitmap.width, bitmap.height, maxEdge);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

    // Re-encoding a small, already-compressed photo can come out bigger than
    // it went in — keep whichever is actually smaller.
    if (blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
