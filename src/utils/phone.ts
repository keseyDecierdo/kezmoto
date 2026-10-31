/* Philippine mobile numbers. The sign-up field shows a fixed "+63 9" prefix,
   so the user only types the remaining 9 digits. */

/** The 9 digits after "+63 9", from whatever was typed or pasted. */
export const normalizePhLocal = (raw: string): string => {
  let digits = raw.replace(/\D/g, '');
  // A pasted full number (0917…, 63917…, +63 917…): drop the parts the
  // prefix already shows. Only when it's too long, so a typed 9 stays.
  if (digits.length > 9 && digits.startsWith('63')) digits = digits.slice(2);
  if (digits.length > 9 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length > 9 && digits.startsWith('9')) digits = digits.slice(1);
  return digits.slice(0, 9);
};

/** "171234567" → "17 123 4567" for display in the field. */
export const formatPhLocal = (nine: string): string =>
  [nine.slice(0, 2), nine.slice(2, 5), nine.slice(5, 9)].filter(Boolean).join(' ');

export const isValidPhLocal = (nine: string): boolean => /^\d{9}$/.test(nine);

/** Stored form: "+639171234567". */
export const toE164Ph = (nine: string): string => `+639${nine}`;
