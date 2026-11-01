import { describe, expect, it } from 'vitest';
import type { Payment, Transaction } from '../types';
import type { PlanPurchase } from '../services/plansService';
import { buildLedger, inRange, monthlyTotals, periodRange, summarize, toCsv } from './earnings';

const payment = (over: Partial<Payment>): Payment => ({
  id: 'p1',
  transactionId: 't1',
  payerId: 's1',
  paymentType: 'commission',
  amount: 2000,
  currency: 'PHP',
  referenceNumber: '123',
  proofUrl: null,
  status: 'succeeded',
  confirmedBy: 'a1',
  confirmedAt: '2026-10-05T10:00:00Z',
  createdAt: '2026-10-04T10:00:00Z',
  updatedAt: '2026-10-05T10:00:00Z',
  ...over,
});

const tx = {
  id: 't1',
  listingTitle: 'Honda Click 125i',
  seller: { id: 's1', name: 'Juan Dela Cruz', avatarColor: '#000' },
  agreedPrice: 40000,
} as unknown as Transaction;

const purchase = (over: Partial<PlanPurchase>): PlanPurchase => ({
  id: 'x1',
  buyerId: 'b1',
  buyerName: 'Ana Reyes',
  kind: 'pro',
  listingId: null,
  listingTitle: '',
  amount: 149,
  referenceNumber: '999',
  proofPath: 'b1/r.png',
  status: 'approved',
  reviewNote: '',
  reviewedAt: '2026-11-01T08:00:00Z',
  createdAt: '2026-10-31T08:00:00Z',
  ...over,
});

describe('buildLedger', () => {
  const rows = buildLedger(
    [payment({}), payment({ id: 'p2', status: 'failed' }), payment({ id: 'p3', status: 'pending', confirmedAt: null })],
    [tx],
    [purchase({}), purchase({ id: 'x2', status: 'rejected' }), purchase({ id: 'x3', kind: 'pro_year', amount: 1490 })]
  );

  it('joins the deal and works out the commission rate', () => {
    const c = rows.find((r) => r.id === 'p1');
    expect(c).toMatchObject({ who: 'Juan Dela Cruz', detail: 'Honda Click 125i', salePrice: 40000, rate: 0.05 });
    expect(c?.link).toBe('/admin/transactions/t1');
  });

  it('leaves out failed and rejected payments, marks pending as waiting', () => {
    expect(rows.map((r) => r.id).sort()).toEqual(['p1', 'p3', 'x1', 'x3']);
    expect(rows.find((r) => r.id === 'p3')?.status).toBe('waiting');
  });

  it('totals earned money by group and keeps waiting separate', () => {
    expect(summarize(rows)).toMatchObject({
      total: 2000 + 149 + 1490,
      commission: 2000,
      subscription: 1639,
      boost: 0,
      waiting: 2000,
      count: 3,
    });
  });

  it('exports CSV with a header row', () => {
    const csv = toCsv(rows).split('\r\n');
    expect(csv[0]).toContain('"Amount (PHP)"');
    expect(csv).toHaveLength(rows.length + 1);
  });
});

describe('periods and months', () => {
  const today = new Date('2026-11-15T12:00:00Z');

  it('builds period ranges', () => {
    expect(periodRange('month', today)).toEqual({ from: '2026-11-01', to: '2026-11-15' });
    expect(periodRange('year', today)).toEqual({ from: '2026-01-01', to: '2026-11-15' });
    expect(periodRange('all', today)).toEqual({ from: '', to: '' });
    expect(inRange('2026-10-20T00:00:00Z', ...(Object.values(periodRange('30d', today)) as [string, string]))).toBe(true);
  });

  it('sums earned rows per month, oldest first', () => {
    const rows = buildLedger([payment({})], [tx], [purchase({})]);
    const months = monthlyTotals(rows, 3, today);
    expect(months.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(months[1]).toMatchObject({ commission: 2000, total: 2000 });
    expect(months[2]).toMatchObject({ subscription: 149, total: 149 });
  });
});
