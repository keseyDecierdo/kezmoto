import type { Listing } from '../types';

const BUDGET_TOLERANCE = 0.25;
const MIN_RESULTS = 3;
const FALLBACK_RESULTS = 6;

/** A bare 4-digit number in this range is far more likely a model year than a budget. */
const isYearLike = (value: number) => Number.isInteger(value) && value >= 1980 && value <= 2100;

const BUDGET_TOKEN = /^(?:₱|php|p)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?$/i;

/** Parses one token like `45000`, `45,000`, `₱45,000`, `45k` or `1.2m`. */
const parseBudgetToken = (token: string): number | null => {
  const match = BUDGET_TOKEN.exec(token.trim());
  if (!match) return null;
  const base = parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const suffix = match[2]?.toLowerCase();
  const value = suffix === 'k' ? base * 1_000 : suffix === 'm' ? base * 1_000_000 : base;
  if (!suffix && isYearLike(value)) return null;
  return value > 0 ? value : null;
};

/** Splits a query into the budget it contains (if any) and the leftover text words. */
export const splitQuery = (query: string): { budget: number | null; text: string } => {
  // Re-join "php 45000" so the currency word stays attached to its number.
  const normalized = query.trim().replace(/\b(php|p|₱)\s+(?=\d)/gi, '$1');
  const words: string[] = [];
  let budget: number | null = null;
  for (const word of normalized.split(/\s+/).filter(Boolean)) {
    const parsed: number | null = budget === null ? parseBudgetToken(word) : null;
    if (parsed !== null) budget = parsed;
    else words.push(word);
  }
  return { budget, text: words.join(' ').toLowerCase() };
};

export const parseBudget = (query: string): number | null => splitQuery(query).budget;

/**
 * Listings priced within ±25% of `budget`, nearest first. When that leaves
 * fewer than three, falls back to the closest few overall so the user never
 * hits an empty page just because their budget is unusual.
 */
export const rankByBudget = <T extends Pick<Listing, 'price'>>(
  listings: T[],
  budget: number
): T[] => {
  const byDistance = [...listings].sort(
    (a, b) => Math.abs(a.price - budget) - Math.abs(b.price - budget)
  );
  const near = byDistance.filter((l) => Math.abs(l.price - budget) <= budget * BUDGET_TOLERANCE);
  return near.length >= MIN_RESULTS ? near : byDistance.slice(0, Math.max(near.length, FALLBACK_RESULTS));
};

export interface SearchResult<T> {
  listings: T[];
  /** Set when the query contained a budget and results are price-ranked. */
  budget: number | null;
}

/** Text + budget search shared by every page with a search bar. */
export const searchListings = <T extends Pick<Listing, 'price' | 'brand' | 'model' | 'location' | 'year'>>(
  listings: T[],
  query: string
): SearchResult<T> => {
  const { budget, text } = splitQuery(query);
  const matched = text
    ? listings.filter((l) => {
        const haystack = [l.brand, l.model, l.location, String(l.year)].join(' ').toLowerCase();
        return text.split(' ').every((word) => haystack.includes(word));
      })
    : listings;
  return { listings: budget === null ? matched : rankByBudget(matched, budget), budget };
};
