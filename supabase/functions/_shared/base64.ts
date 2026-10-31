// Shared with verify-id and face-match — both download a photo via the
// service-role client and need it as base64 for Gemini's inlineData parts.
// 32KB chunks: a plain `String.fromCharCode(...bytes)` on a full-size photo
// overflows the call stack, so this can't be a one-liner.
export function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
