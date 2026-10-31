import { describe, expect, it } from 'vitest';
import { commissionAmountFor } from '../services/paymentsService';
import type { Transaction } from '../types';
import { offerDelta, offerStateFor } from './offers';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1',
  chatId: 'c1',
  listingId: 'l1',
  listingTitle: null,
  listingPhoto: null,
  buyer: null,
  seller: null,
  adminId: null,
  adminName: null,
  proposedPrice: null,
  proposedBy: null,
  agreedPrice: null,
  status: 'negotiating',
  commissionStatus: 'pending',
  meetupAt: null,
  meetupLocation: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('offerStateFor', () => {
  it('is none without a deal or a pending offer', () => {
    expect(offerStateFor(null, 'buyer')).toBe('none');
    expect(offerStateFor(tx({}), 'buyer')).toBe('none');
  });

  it('tells the proposer and the other party apart', () => {
    const offer = tx({ proposedPrice: 40000, proposedBy: 'buyer' });
    expect(offerStateFor(offer, 'buyer')).toBe('mine');
    expect(offerStateFor(offer, 'seller')).toBe('theirs');
  });

  it('treats an offer equal to the agreed price as settled', () => {
    expect(offerStateFor(tx({ proposedPrice: 2500, proposedBy: 'buyer', agreedPrice: 2500 }), 'buyer')).toBe('none');
  });

  it('locks once a middleman runs the deal or it is closed', () => {
    expect(offerStateFor(tx({ status: 'middleman_assigned', proposedPrice: 40000, proposedBy: 'b' }), 'b')).toBe('locked');
    expect(offerStateFor(tx({ status: 'completed' }), 'b')).toBe('locked');
  });
});

describe('negotiated price', () => {
  it('compares an offer with the listed price', () => {
    expect(offerDelta(40000, 43000)).toEqual({ amount: 3000, percent: 7, below: true });
  });

  it('charges commission on the agreed price, not the listed one', () => {
    expect(commissionAmountFor(40000)).toBe(2000);
    expect(commissionAmountFor(43000)).toBe(2150);
  });
});
