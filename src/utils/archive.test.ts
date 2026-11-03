import { describe, expect, it } from 'vitest';
import { isArchivedThread } from './archive';

describe('isArchivedThread', () => {
  const thread = { updatedAt: '2026-11-03T10:00:00Z' };

  it('is archived when archived after the last message', () => {
    expect(isArchivedThread(thread, '2026-11-03T11:00:00Z')).toBe(true);
  });

  it('comes back to Active when a newer message arrives', () => {
    expect(isArchivedThread(thread, '2026-11-03T09:00:00Z')).toBe(false);
  });

  it('is active when never archived', () => {
    expect(isArchivedThread(thread, null)).toBe(false);
    expect(isArchivedThread(thread, undefined)).toBe(false);
  });
});
