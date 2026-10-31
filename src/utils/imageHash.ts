/* =========================================================================
   KEZMOTO — Perceptual image hashing
   A cheap, dependency-free 8×8 average-hash (aHash), used only for the
   advisory duplicate-photo fraud check (Phase 5) — not exact matching, and
   nothing here ever blocks a listing on its own; a match only ever writes a
   `fraud_flags` row for an admin to look at.
   ========================================================================= */

/** Best-effort: returns null (never throws) on a format the runtime can't decode. */
export async function averageHash(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = 8;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, size, size);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, size, size);

    const gray: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    const avg = gray.reduce((sum, value) => sum + value, 0) / gray.length;

    let bits = '';
    for (const value of gray) bits += value >= avg ? '1' : '0';

    let hex = '';
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex; // 64 bits -> 16 hex chars
  } catch {
    return null;
  }
}

/** Bit-difference between two same-length hex hashes. Infinity if they can't be compared. */
export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}
