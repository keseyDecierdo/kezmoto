/* KEZMOTO Pro and Boosts: prices and the rules the screens share. The
   database enforces the same rules (0036_seller_pro_boosts.sql). */

export const PLAN_PRICES = { pro: 149, pro_year: 1490, boost: 49 } as const;
export const PRO_DAYS = 30;
export const PRO_YEAR_DAYS = 365;
export const BOOST_DAYS = 7;
export const PRO_BOOSTS = 2;
export const PRO_YEAR_BOOSTS = 24;

export type PlanKindName = keyof typeof PLAN_PRICES;

/** What each purchase gives, for labels and summaries. */
export const PLAN_DETAILS: Record<PlanKindName, { label: string; days: number; boosts: number }> = {
  pro: { label: 'Pro · 30 days', days: PRO_DAYS, boosts: PRO_BOOSTS },
  pro_year: { label: 'Pro · 1 year', days: PRO_YEAR_DAYS, boosts: PRO_YEAR_BOOSTS },
  boost: { label: 'Boost · 7 days', days: BOOST_DAYS, boosts: 0 },
};

export const isProKind = (kind: PlanKindName): boolean => kind === 'pro' || kind === 'pro_year';

/** Pesos saved by paying yearly instead of 12 monthly payments. */
export const yearlySavings = (): number => PLAN_PRICES.pro * 12 - PLAN_PRICES.pro_year;
export const FREE_LISTING_LIMIT = 3;

export const FREE_COMMISSION_RATE = 0.05;
export const PRO_COMMISSION_RATE = 0.03;

const isFuture = (iso: string | null | undefined, now = Date.now()): boolean =>
  Boolean(iso) && new Date(iso as string).getTime() > now;

export const isPro = (user: { proUntil?: string } | null | undefined, now = Date.now()): boolean =>
  isFuture(user?.proUntil, now);

export const isBoosted = (listing: { boostedUntil?: string } | null | undefined, now = Date.now()): boolean =>
  isFuture(listing?.boostedUntil, now);

/** Whole days left, rounded up; 0 once it has passed. */
export const daysLeft = (iso: string, now = Date.now()): number =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));

export const commissionRateFor = (pro: boolean): number => (pro ? PRO_COMMISSION_RATE : FREE_COMMISSION_RATE);

/** Listings a free seller can still post; Infinity for Pro and admins. */
export const freeSlotsLeft = (openListings: number, unlimited: boolean): number =>
  unlimited ? Infinity : Math.max(0, FREE_LISTING_LIMIT - openListings);

/** Featured listings first, otherwise keeps the incoming order. */
export const featuredFirst = <T extends { boostedUntil?: string }>(items: T[], now = Date.now()): T[] => [
  ...items.filter((item) => isBoosted(item, now)),
  ...items.filter((item) => !isBoosted(item, now)),
];
