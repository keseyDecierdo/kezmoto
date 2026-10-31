import { describe, expect, it } from 'vitest';
import { parseBudget, rankByBudget, searchListings } from './budgetSearch';

const bike = (id: string, brand: string, price: number, year = 2019) => ({
  id,
  brand,
  model: 'X',
  location: 'Cebu',
  year,
  price,
});

describe('parseBudget', () => {
  it.each([
    ['45000', 45000],
    ['45,000', 45000],
    ['₱45,000', 45000],
    ['php 45000', 45000],
    ['45k', 45000],
    ['45K', 45000],
    ['1.2m', 1200000],
    ['honda 45k', 45000],
  ])('parses %s', (input, expected) => {
    expect(parseBudget(input)).toBe(expected);
  });

  it('does not treat years or plain text as budgets', () => {
    expect(parseBudget('2020')).toBeNull();
    expect(parseBudget('honda')).toBeNull();
    expect(parseBudget('')).toBeNull();
  });
});

describe('rankByBudget', () => {
  it('orders by closeness and drops far-off prices', () => {
    const list = [
      bike('a', 'Honda', 60000),
      bike('b', 'Honda', 44000),
      bike('c', 'Honda', 47000),
      bike('d', 'Honda', 45500),
      bike('e', 'Honda', 150000),
    ];
    expect(rankByBudget(list, 45000).map((l) => l.id)).toEqual(['d', 'b', 'c']);
  });

  it('falls back to the nearest units when few are in range', () => {
    const list = [bike('a', 'Honda', 90000), bike('b', 'Honda', 120000)];
    expect(rankByBudget(list, 45000).map((l) => l.id)).toEqual(['a', 'b']);
  });
});

describe('searchListings', () => {
  const list = [bike('a', 'Honda', 45000), bike('b', 'Yamaha', 46000), bike('c', 'Honda', 44000), bike('d', 'Honda', 47000)];

  it('combines text and budget', () => {
    const result = searchListings(list, 'honda 45k');
    expect(result.budget).toBe(45000);
    expect(result.listings.map((l) => l.id)).toEqual(['a', 'c', 'd']);
  });

  it('keeps plain text search unchanged', () => {
    expect(searchListings(list, 'yamaha').listings.map((l) => l.id)).toEqual(['b']);
  });
});
