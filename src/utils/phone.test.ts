import { describe, expect, it } from 'vitest';
import { formatPhLocal, isValidPhLocal, normalizePhLocal, toE164Ph } from './phone';

describe('normalizePhLocal', () => {
  it('keeps typed digits after the +63 9 prefix', () => {
    expect(normalizePhLocal('17 123 4567')).toBe('171234567');
    expect(normalizePhLocal('9')).toBe('9');
  });

  it('strips the prefix from pasted full numbers', () => {
    expect(normalizePhLocal('09171234567')).toBe('171234567');
    expect(normalizePhLocal('+63 917 123 4567')).toBe('171234567');
    expect(normalizePhLocal('639171234567')).toBe('171234567');
    expect(normalizePhLocal('9171234567')).toBe('171234567');
  });

  it('caps at 9 digits', () => {
    expect(normalizePhLocal('1712345678')).toBe('171234567');
  });
});

describe('formatting and validation', () => {
  it('groups digits as XX XXX XXXX', () => {
    expect(formatPhLocal('171234567')).toBe('17 123 4567');
    expect(formatPhLocal('1712')).toBe('17 12');
  });

  it('needs exactly 9 digits', () => {
    expect(isValidPhLocal('171234567')).toBe(true);
    expect(isValidPhLocal('17123456')).toBe(false);
  });

  it('stores in +639 form', () => {
    expect(toE164Ph('171234567')).toBe('+639171234567');
  });
});
