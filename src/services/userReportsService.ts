/* =========================================================================
   KEZMOTO — User reports
   Customers file a report from a chat; only admins can list or review them
   (RLS in 0027). The reported user never sees that a report exists.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { ProfileRow, UserReportRow } from '../lib/database.types';
import type { ReportEvidenceLine, ReportReason, ReportStatus, UserReport } from '../types';
import { REPORT_REASON_LABEL } from '../types';
import { mapUserReport } from './mappers';
import { notificationsApi } from './notificationsService';
import { settle } from './simulate';

export interface CreateReportInput {
  reportedUserId: string;
  chatId: string | null;
  reason: ReportReason;
  details: string;
  evidence: ReportEvidenceLine[];
}

type ProfileStub = Pick<ProfileRow, 'profile_id' | 'full_name' | 'is_disabled'>;


/** Best-effort: tells every admin a report is waiting. A failure here must
    never make the (already saved) report look like it failed. */
const notifyAdmins = async (reporterId: string, input: CreateReportInput): Promise<void> => {
  try {
    const { data: admins } = await supabase.from('profiles').select('profile_id').eq('role', 'admin');
    const { data: people } = await supabase
      .from('profiles')
      .select('profile_id, full_name')
      .in('profile_id', [reporterId, input.reportedUserId]);
    const nameOf = (id: string) =>
      ((people ?? []) as { profile_id: string; full_name: string | null }[]).find((p) => p.profile_id === id)
        ?.full_name?.trim() || 'A customer';

    await Promise.all(
      ((admins ?? []) as { profile_id: string }[]).map((admin) =>
        notificationsApi.create({
          recipientId: admin.profile_id,
          type: 'user_report',
          title: 'New user report',
          body: `${nameOf(reporterId)} reported ${nameOf(input.reportedUserId)}: ${REPORT_REASON_LABEL[input.reason]}`,
          link: '/admin/user-reports',
        })
      )
    );
  } catch {
    // Notification is a courtesy; the report itself is already saved.
  }
};

export const userReportsApi = {
  async create(input: CreateReportInput): Promise<void> {
    const reporterId = (await supabase.auth.getSession()).data.session?.user.id;
    if (!reporterId) throw new Error('You need to be signed in to report someone.');

    const { error } = await supabase.from('user_reports').insert({
      reporter_id: reporterId,
      reported_user_id: input.reportedUserId,
      chat_id: input.chatId,
      reason: input.reason,
      details: input.details.trim() || null,
      evidence: input.evidence,
    });
    if (error) {
      // 23505 = the one-open-report-per-chat unique index.
      throw new Error(
        error.code === '23505'
          ? 'You already have an open report on this person. An admin will review it soon.'
          : `Could not send your report. (${error.message})`
      );
    }

    await notifyAdmins(reporterId, input);
  },

  /** Admin-only. Newest first, with reporter / reported names joined in. */
  async list(status?: ReportStatus): Promise<UserReport[]> {
    return settle(async () => {
      let query = supabase.from('user_reports').select('*').order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw new Error(`Could not load user reports. (${error.message})`);
      const rows = (data ?? []) as UserReportRow[];
      if (rows.length === 0) return [];

      const ids = Array.from(new Set(rows.flatMap((r) => [r.reporter_id, r.reported_user_id])));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('profile_id, full_name, is_disabled')
        .in('profile_id', ids);
      const byId = new Map(((profiles ?? []) as ProfileStub[]).map((p) => [p.profile_id, p]));

      return rows.map((row) =>
        mapUserReport(row, {
          reporterName: byId.get(row.reporter_id)?.full_name,
          reportedUserName: byId.get(row.reported_user_id)?.full_name,
          reportedUserDisabled: Boolean(byId.get(row.reported_user_id)?.is_disabled),
        })
      );
    }, []);
  },

  async review(reportId: string, status: Exclude<ReportStatus, 'pending'>, adminNote: string): Promise<void> {
    const adminId = (await supabase.auth.getSession()).data.session?.user.id ?? null;
    const { error } = await supabase
      .from('user_reports')
      .update({
        status,
        admin_note: adminNote.trim() || null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('report_id', reportId);
    if (error) throw new Error(`Could not update the report. (${error.message})`);
  },
};
