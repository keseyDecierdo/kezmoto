/* =========================================================================
   KEZMOTO — Verification checklist
   One row per transaction, admin-only end to end. Saving stamps who
   reviewed it and when; if every check is true, the transaction itself
   advances to 'verified' so the buyer/seller see it without ever seeing the
   checklist (their view is transactions-only, per the RLS policy).
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { VerificationChecklistRow } from '../lib/database.types';
import type { VerificationChecklist } from '../types';
import { mapVerificationChecklist } from './mappers';
import { transactionsApi } from './transactionsService';
import { settle } from './simulate';

export type VerificationInput = Omit<
  VerificationChecklist,
  'transactionId' | 'verifiedBy' | 'verifiedAt'
>;

const ALL_CHECKS: (keyof VerificationInput)[] = [
  'orCrReviewed',
  'modelYearConfirmed',
  'mileagePlausible',
  'conditionMatchesListing',
  'ownershipMatchesSeller',
];

export const verificationApi = {
  async getByTransactionId(transactionId: string): Promise<VerificationChecklist | null> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('verification_checklist')
        .select('*')
        .eq('transaction_id', transactionId)
        .maybeSingle();
      if (error) throw new Error(`Could not load the verification checklist. (${error.message})`);
      return data ? mapVerificationChecklist(data as VerificationChecklistRow) : null;
    });
  },

  async save(transactionId: string, input: VerificationInput): Promise<VerificationChecklist> {
    const adminId = (await supabase.auth.getSession()).data.session?.user.id ?? null;
    const { data, error } = await supabase
      .from('verification_checklist')
      .upsert(
        {
          transaction_id: transactionId,
          or_cr_reviewed: input.orCrReviewed,
          model_year_confirmed: input.modelYearConfirmed,
          mileage_plausible: input.mileagePlausible,
          condition_matches_listing: input.conditionMatchesListing,
          ownership_matches_seller: input.ownershipMatchesSeller,
          admin_notes: input.adminNotes,
          verified_by: adminId,
          verified_at: new Date().toISOString(),
          disclaimer_shown: true,
        },
        { onConflict: 'transaction_id' }
      )
      .select('*')
      .single();

    if (error) throw new Error(`Could not save the verification checklist. (${error.message})`);

    if (ALL_CHECKS.every((key) => input[key])) {
      await transactionsApi.updateStatus(transactionId, 'verified');
    }

    return mapVerificationChecklist(data as VerificationChecklistRow);
  },
};
