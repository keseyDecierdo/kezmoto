/* =========================================================================
   KEZMOTO — Payments (Phase 4, manual GCash commission)

   No payment gateway, no Edge Function, no webhook. The seller pays
   KEZMOTO's GCash number directly and submits a reference number plus a
   screenshot; an admin reviews it and confirms or rejects. That confirm
   action is the entire trust boundary — see supabase/migrations/0009 and
   0010 for how RLS enforces "only an admin, never the payer, can move a
   payment to succeeded/failed."
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { PaymentRow } from '../lib/database.types';
import type { Payment, PaymentStatus } from '../types';
import { mapPayment } from './mappers';
import { signProofUrl, uploadProof } from './storageService';
import { settle } from './simulate';

/** Seller pays; flat percentage of the agreed price. One constant, easy to
    change later — not per-deal configurable in this phase. */
export const COMMISSION_RATE = 0.05;

/** KEZMOTO Pro sellers pass their lower rate (see utils/plans.ts). */
export const commissionAmountFor = (agreedPrice: number, rate: number = COMMISSION_RATE): number =>
  Math.round(agreedPrice * rate * 100) / 100;

const currentUserId = async (): Promise<string | null> =>
  (await supabase.auth.getSession()).data.session?.user.id ?? null;

export const paymentsApi = {
  async listByTransactionId(transactionId: string): Promise<Payment[]> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load payments. (${error.message})`);
      return ((data ?? []) as PaymentRow[]).map(mapPayment);
    }, []);
  },

  /** Every payment on the platform — the Commission Report's numeric source. Admin-only via RLS. */
  async listAll(): Promise<Payment[]> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load payments. (${error.message})`);
      return ((data ?? []) as PaymentRow[]).map(mapPayment);
    }, []);
  },

  /** Signed URL for a proof screenshot, minted on demand — null if there is none. */
  async proofUrlFor(payment: Payment): Promise<string | null> {
    return signProofUrl(payment.proofUrl);
  },

  /**
   * Seller submits proof of a GCash payment they already made. The amount is
   * calculated here from the deal's agreed price — informational for the
   * admin to compare against the screenshot, not a security boundary; the
   * admin's own review is what actually confirms it.
   */
  async submitCommissionPayment(input: {
    transactionId: string;
    agreedPrice: number;
    referenceNumber: string;
    proofFile: File;
    /** 0.05 by default; 0.03 while the seller has KEZMOTO Pro. */
    rate?: number;
  }): Promise<Payment> {
    const payerId = await currentUserId();
    if (!payerId) throw new Error('Sign in to submit a payment.');

    const proofPath = await uploadProof(payerId, input.proofFile);

    const { data, error } = await supabase
      .from('payments')
      .insert({
        transaction_id: input.transactionId,
        payer_id: payerId,
        payment_type: 'commission',
        amount: commissionAmountFor(input.agreedPrice, input.rate),
        currency: 'PHP',
        reference_number: input.referenceNumber.trim(),
        proof_url: proofPath,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error) throw new Error(`Could not submit the payment. (${error.message})`);
    return mapPayment(data as PaymentRow);
  },

  /** Admin confirms or rejects a submitted payment. RLS restricts this to admin profiles. */
  async confirmPayment(paymentId: string, outcome: Extract<PaymentStatus, 'succeeded' | 'failed'>): Promise<Payment> {
    const adminId = await currentUserId();
    if (!adminId) throw new Error('Sign in as an admin to review this payment.');

    const { data, error } = await supabase
      .from('payments')
      .update({ status: outcome, confirmed_by: adminId, confirmed_at: new Date().toISOString() })
      .eq('payment_id', paymentId)
      .select('*')
      .single();

    if (error) throw new Error(`Could not update the payment. (${error.message})`);
    return mapPayment(data as PaymentRow);
  },
};
