import React, { useState } from 'react';
import { IonButton, IonIcon, IonTextarea, useIonRouter, useIonToast } from '@ionic/react';
import {
  banOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  flagOutline,
  personOutline,
} from 'ionicons/icons';
import AdminHero from '../components/AdminHero';
import AppPage from '../components/AppPage';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { confirmAction } from '../lib/sweetAlert';
import { userReportsApi, usersApi } from '../services/api';
import type { ReportStatus, UserReport } from '../types';
import { REPORT_REASON_LABEL } from '../types';
import { formatRelative } from '../utils/format';
import './UserReports.css';

const FILTERS: { id: ReportStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'reviewed', label: 'Reviewed' },
  { id: 'dismissed', label: 'Dismissed' },
];

/**
 * Admin-only queue of reports customers filed from a chat. The reported
 * user is never told a report exists — RLS (0027) keeps the table admin-only.
 */
const UserReports: React.FC = () => {
  const router = useIonRouter();
  const [present] = useIonToast();
  const [filter, setFilter] = useState<ReportStatus>('pending');
  const { data, loading, error, reload } = useAsync<UserReport[]>(() => userReportsApi.list(filter), [filter]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const toast = (message: string, color: 'success' | 'danger') =>
    present({ message, duration: 2200, color, position: 'top' });

  const run = async (report: UserReport, action: () => Promise<void>, doneMessage: string) => {
    setBusyId(report.id);
    try {
      await action();
      reload();
      await toast(doneMessage, 'success');
    } catch (err) {
      await toast(err instanceof Error ? err.message : 'Something went wrong.', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const review = (report: UserReport, status: Exclude<ReportStatus, 'pending'>) =>
    run(
      report,
      () => userReportsApi.review(report.id, status, notes[report.id] ?? ''),
      status === 'reviewed' ? 'Report marked as reviewed.' : 'Report dismissed.'
    );

  const disable = async (report: UserReport) => {
    const confirmed = await confirmAction({
      title: `Disable ${report.reportedUserName}?`,
      text: 'They will be signed out and unable to sign in or post until you enable the account again.',
      confirmText: 'Disable account',
      danger: true,
    });
    if (!confirmed) return;
    await run(
      report,
      async () => {
        await usersApi.setDisabled(
          report.reportedUserId,
          true,
          `Reported for: ${REPORT_REASON_LABEL[report.reason]}`
        );
        await userReportsApi.review(report.id, 'reviewed', notes[report.id] || 'Account disabled.');
      },
      'Account disabled and report closed.'
    );
  };

  const enable = (report: UserReport) =>
    run(report, () => usersApi.setDisabled(report.reportedUserId, false), 'Account enabled.');

  const reports = data ?? [];

  return (
    <AppPage title="User Reports">
      <AdminHero
        title="User Reports"
        description="Customers reporting someone from a chat. Review the evidence, then mark it reviewed or dismiss it."
        loading={loading && !data}
        stats={[
          {
            label: `${FILTERS.find((f) => f.id === filter)?.label ?? ''} reports`,
            value: reports.length,
            icon: flagOutline,
          },
        ]}
      />
      <div className="kez-tile user-reports__filters" role="group" aria-label="Filter by status">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`kez-chip${filter === item.id ? ' kez-chip--accent' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && <LoadingRows rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && reports.length === 0 && (
        <EmptyState
          icon={flagOutline}
          title={`No ${filter} reports`}
          message="When a customer reports someone from a chat, it shows up here."
        />
      )}

      {!loading && !error && reports.length > 0 && (
        <div className="kez-bento kez-bento--cards user-reports">
          {reports.map((report) => (
            <article className="kez-tile user-reports__card" key={report.id}>
              <header className="user-reports__head">
                <div>
                  <strong>{report.reportedUserName}</strong>
                  <span className="kez-muted"> reported by {report.reporterName}</span>
                </div>
                <div className="user-reports__chips">
                  <span className="kez-chip kez-chip--warning">{REPORT_REASON_LABEL[report.reason]}</span>
                  {report.reportedUserDisabled && <span className="kez-chip kez-chip--danger">Disabled</span>}
                </div>
              </header>

              {report.details && <p className="user-reports__details">{report.details}</p>}

              {report.evidence.length > 0 && (
                <details className="user-reports__evidence">
                  <summary>Chat context ({report.evidence.length} messages)</summary>
                  <ul>
                    {report.evidence.map((line, index) => (
                      <li key={index}>
                        <strong>{line.sender}:</strong> {line.text}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <span className="user-reports__meta">
                {formatRelative(report.createdAt)}
                {report.reviewedAt && ` · reviewed ${formatRelative(report.reviewedAt)}`}
                {report.adminNote && ` · Note: ${report.adminNote}`}
              </span>

              {report.status === 'pending' && (
                <IonTextarea
                  className="kez-field"
                  label="Admin note (optional)"
                  labelPlacement="stacked"
                  autoGrow
                  rows={2}
                  value={notes[report.id] ?? ''}
                  onIonInput={(e) => setNotes((prev) => ({ ...prev, [report.id]: String(e.detail.value ?? '') }))}
                />
              )}

              <div className="user-reports__actions">
                <IonButton
                  size="small"
                  fill="outline"
                  onClick={() => router.push(`/profile/${report.reportedUserId}`, 'forward')}
                >
                  <IonIcon slot="start" icon={personOutline} />
                  View profile
                </IonButton>

                {report.status === 'pending' && (
                  <>
                    <IonButton
                      size="small"
                      fill="outline"
                      color="medium"
                      disabled={busyId === report.id}
                      onClick={() => void review(report, 'dismissed')}
                    >
                      <IonIcon slot="start" icon={closeCircleOutline} />
                      Dismiss
                    </IonButton>
                    <IonButton
                      size="small"
                      fill="outline"
                      color="success"
                      disabled={busyId === report.id}
                      onClick={() => void review(report, 'reviewed')}
                    >
                      <IonIcon slot="start" icon={checkmarkCircleOutline} />
                      Mark reviewed
                    </IonButton>
                  </>
                )}

                {report.reportedUserDisabled ? (
                  <IonButton size="small" disabled={busyId === report.id} onClick={() => void enable(report)}>
                    Enable account
                  </IonButton>
                ) : (
                  <IonButton
                    size="small"
                    color="danger"
                    disabled={busyId === report.id}
                    onClick={() => void disable(report)}
                  >
                    <IonIcon slot="start" icon={banOutline} />
                    Disable account
                  </IonButton>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </AppPage>
  );
};

export default UserReports;
