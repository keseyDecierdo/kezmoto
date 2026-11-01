/* KEZMOTO earnings: one ledger of every peso the platform earns - the
   commission on each sale plus Pro and Boost purchases. Pure functions so
   the Earnings page and its tests share them. */

import type { Payment, Transaction } from '../types';
import type { PlanPurchase } from '../services/plansService';

export type EarningSource = 'commission' | 'pro' | 'pro_year' | 'boost';
/** Pro monthly and yearly are both "Subscriptions" in totals and the chart. */
export type EarningGroup = 'commission' | 'subscription' | 'boost';

export interface EarningRow {
  id: string;
  /** ISO time the money counts from: approval when earned, submission otherwise. */
  date: string;
  source: EarningSource;
  /** Who paid. */
  who: string;
  /** Unit title for commissions and boosts; plan name for Pro. */
  detail: string;
  /** Commission only. */
  salePrice: number | null;
  rate: number | null;
  amount: number;
  /** earned = admin confirmed; waiting = submitted, not yet reviewed. */
  status: 'earned' | 'waiting';
  /** Where the row opens. */
  link: string;
}

export const SOURCE_LABEL: Record<EarningSource, string> = {
  commission: 'Commission',
  pro: 'Pro · Monthly',
  pro_year: 'Pro · Yearly',
  boost: 'Boost',
};

export const groupOf = (source: EarningSource): EarningGroup =>
  source === 'commission' ? 'commission' : source === 'boost' ? 'boost' : 'subscription';

/** Joins commission payments to their deals and adds plan purchases. Failed
    or rejected payments earned nothing and are left out. */
export const buildLedger = (
  payments: Payment[],
  transactions: Transaction[],
  purchases: PlanPurchase[]
): EarningRow[] => {
  const txById = new Map(transactions.map((tx) => [tx.id, tx]));

  const commissions: EarningRow[] = payments
    .filter((p) => p.paymentType === 'commission' && (p.status === 'succeeded' || p.status === 'pending'))
    .map((p) => {
      const tx = txById.get(p.transactionId);
      const salePrice = tx?.agreedPrice ?? null;
      return {
        id: p.id,
        date: (p.status === 'succeeded' && p.confirmedAt) || p.createdAt,
        source: 'commission',
        who: tx?.seller?.name ?? 'Deleted account',
        detail: tx?.listingTitle ?? 'Unit no longer listed',
        salePrice,
        rate: salePrice ? Math.round((p.amount / salePrice) * 1000) / 1000 : null,
        amount: p.amount,
        status: p.status === 'succeeded' ? 'earned' : 'waiting',
        link: tx ? `/admin/transactions/${tx.id}` : '/admin/reports',
      };
    });

  const plans: EarningRow[] = purchases
    .filter((p) => p.status !== 'rejected')
    .map((p) => ({
      id: p.id,
      date: (p.status === 'approved' && p.reviewedAt) || p.createdAt,
      source: p.kind,
      who: p.buyerName || 'Deleted account',
      detail: p.kind === 'boost' ? p.listingTitle || 'Listing removed' : SOURCE_LABEL[p.kind],
      salePrice: null,
      rate: null,
      amount: p.amount,
      status: p.status === 'approved' ? 'earned' : 'waiting',
      link: '/admin/plans',
    }));

  return [...commissions, ...plans].sort((a, b) => b.date.localeCompare(a.date));
};

export interface EarningSummary {
  total: number;
  commission: number;
  subscription: number;
  boost: number;
  waiting: number;
  count: number;
}

export const summarize = (rows: EarningRow[]): EarningSummary =>
  rows.reduce<EarningSummary>(
    (acc, row) => {
      if (row.status === 'waiting') {
        acc.waiting += row.amount;
        return acc;
      }
      acc.total += row.amount;
      acc[groupOf(row.source)] += row.amount;
      acc.count += 1;
      return acc;
    },
    { total: 0, commission: 0, subscription: 0, boost: 0, waiting: 0, count: 0 }
  );

export type Period = 'month' | '30d' | 'year' | 'all';

/** Inclusive YYYY-MM-DD range for a period ending today. */
export const periodRange = (period: Period, today = new Date()): { from: string; to: string } => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const to = iso(today);
  if (period === 'all') return { from: '', to: '' };
  if (period === 'month') return { from: `${to.slice(0, 7)}-01`, to };
  if (period === 'year') return { from: `${to.slice(0, 4)}-01-01`, to };
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  return { from: iso(start), to };
};

export const inRange = (iso: string, from: string, to: string): boolean => {
  const day = iso.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
};

export interface MonthTotal {
  /** YYYY-MM */
  month: string;
  commission: number;
  subscription: number;
  boost: number;
  total: number;
}

/** Earned amounts per calendar month, oldest first, ending with this month. */
export const monthlyTotals = (rows: EarningRow[], months = 12, today = new Date()): MonthTotal[] => {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const byMonth = new Map<string, MonthTotal>(
    keys.map((month) => [month, { month, commission: 0, subscription: 0, boost: 0, total: 0 }])
  );
  rows
    .filter((row) => row.status === 'earned')
    .forEach((row) => {
      const bucket = byMonth.get(row.date.slice(0, 7));
      if (!bucket) return;
      bucket[groupOf(row.source)] += row.amount;
      bucket.total += row.amount;
    });
  return keys.map((key) => byMonth.get(key) as MonthTotal);
};

/** CSV for accounting; quotes every field. */
export const toCsv = (rows: EarningRow[]): string => {
  const head = ['Date', 'Source', 'Paid by', 'Detail', 'Sale price', 'Rate', 'Amount (PHP)', 'Status'];
  const quote = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.date.slice(0, 10),
      SOURCE_LABEL[r.source],
      r.who,
      r.detail,
      r.salePrice ?? '',
      r.rate != null ? `${Math.round(r.rate * 1000) / 10}%` : '',
      r.amount.toFixed(2),
      r.status === 'earned' ? 'Earned' : 'Waiting for approval',
    ]
      .map(quote)
      .join(',')
  );
  return [head.map(quote).join(','), ...lines].join('\r\n');
};
