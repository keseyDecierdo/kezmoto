import { describe, expect, it } from 'vitest';
import {
  commissionRateFor,
  daysLeft,
  featuredFirst,
  freeSlotsLeft,
  isBoosted,
  isPro,
} from './plans';

const NOW = new Date('2026-11-01T00:00:00Z').getTime();
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

describe('plans', () => {
  it('treats Pro as active only until proUntil', () => {
    expect(isPro({ proUntil: inDays(3) }, NOW)).toBe(true);
    expect(isPro({ proUntil: inDays(-1) }, NOW)).toBe(false);
    expect(isPro({ proUntil: '' }, NOW)).toBe(false);
    expect(isPro(null, NOW)).toBe(false);
  });

  it('charges 3% to Pro and 5% to free sellers', () => {
    expect(commissionRateFor(true)).toBe(0.03);
    expect(commissionRateFor(false)).toBe(0.05);
  });

  it('counts free listing slots', () => {
    expect(freeSlotsLeft(1, false)).toBe(2);
    expect(freeSlotsLeft(5, false)).toBe(0);
    expect(freeSlotsLeft(9, true)).toBe(Infinity);
  });

  it('rounds days left up and never below zero', () => {
    expect(daysLeft(inDays(4.2), NOW)).toBe(5);
    expect(daysLeft(inDays(-2), NOW)).toBe(0);
  });

  it('puts boosted listings first and keeps the rest in order', () => {
    const items = [
      { id: 'a', boostedUntil: '' },
      { id: 'b', boostedUntil: inDays(2) },
      { id: 'c', boostedUntil: inDays(-1) },
      { id: 'd', boostedUntil: inDays(6) },
    ];
    expect(isBoosted(items[1], NOW)).toBe(true);
    expect(featuredFirst(items, NOW).map((i) => i.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('yearly Pro', () => {
  it('costs less than 12 months and gives 24 boosts', async () => {
    const { PLAN_PRICES, PLAN_DETAILS, yearlySavings, isProKind } = await import('./plans');
    expect(PLAN_PRICES.pro_year).toBeLessThan(PLAN_PRICES.pro * 12);
    expect(yearlySavings()).toBe(298);
    expect(PLAN_DETAILS.pro_year).toMatchObject({ days: 365, boosts: 24 });
    expect(isProKind('pro_year')).toBe(true);
    expect(isProKind('boost')).toBe(false);
  });
});
