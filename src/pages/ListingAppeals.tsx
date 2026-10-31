import React, { useState } from 'react';
import { IonButton, IonIcon, IonTextarea, useIonRouter, useIonToast } from '@ionic/react';
import {
  arrowUndoOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  eyeOutline,
} from 'ionicons/icons';
import AdminHero from '../components/AdminHero';
import AppPage from '../components/AppPage';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { listingAppealsApi } from '../services/api';
import type { ListingAppeal, ListingAppealStatus } from '../types';
import { formatRelative } from '../utils/format';
import './ListingAppeals.css';

const FILTERS: { id: ListingAppealStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'denied', label: 'Denied' },
];

/** Admin-only queue of seller appeals against a removed listing. Approving
    one reinstates the listing (via the sync_listing_appeal_approval trigger),
    not a second write here. */
const ListingAppeals: React.FC = () => {
  const router = useIonRouter();
  const [present] = useIonToast();
  const [filter, setFilter] = useState<ListingAppealStatus>('pending');
  const { data, loading, error, reload } = useAsync<ListingAppeal[]>(
    () => listingAppealsApi.listAll(filter),
    [filter]
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const toast = (message: string, color: 'success' | 'danger') =>
    present({ message, duration: 2200, color, position: 'top' });

  const review = async (appeal: ListingAppeal, status: Exclude<ListingAppealStatus, 'pending'>) => {
    setBusyId(appeal.id);
    try {
      await listingAppealsApi.review(appeal.id, status, notes[appeal.id] ?? '');
      reload();
      await toast(
        status === 'approved' ? 'Appeal approved — the listing is active again.' : 'Appeal denied.',
        'success'
      );
    } catch (err) {
      await toast(err instanceof Error ? err.message : 'Something went wrong.', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const appeals = data ?? [];

  return (
    <AppPage title="Listing Appeals">
      <AdminHero
        title="Listing Appeals"
        description="Sellers asking for a removed listing to go back up. Approve to restore it, or deny with a short note."
        loading={loading && !data}
        stats={[
          {
            label: `${FILTERS.find((f) => f.id === filter)?.label ?? ''} appeals`,
            value: appeals.length,
            icon: arrowUndoOutline,
          },
        ]}
      />
      <div className="kez-tile listing-appeals__filters" role="group" aria-label="Filter by status">
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

      {!loading && !error && appeals.length === 0 && (
        <EmptyState
          icon={arrowUndoOutline}
          title={`No ${filter} appeals`}
          message="When a seller appeals a removed listing, it shows up here."
        />
      )}

      {!loading && !error && appeals.length > 0 && (
        <div className="kez-bento kez-bento--cards listing-appeals">
          {appeals.map((appeal) => (
            <article className="kez-tile listing-appeals__card" key={appeal.id}>
              <header className="listing-appeals__head">
                <div>
                  <strong>{appeal.listingTitle ?? 'Removed listing'}</strong>
                  <span className="kez-muted"> — {appeal.sellerName ?? 'Unknown seller'}</span>
                </div>
              </header>

              <p className="listing-appeals__message">{appeal.message}</p>

              <span className="listing-appeals__meta">
                {formatRelative(appeal.createdAt)}
                {appeal.reviewedAt && ` · reviewed ${formatRelative(appeal.reviewedAt)}`}
                {appeal.adminNote && ` · Note: ${appeal.adminNote}`}
              </span>

              {appeal.status === 'pending' && (
                <IonTextarea
                  className="kez-field"
                  label="Admin note (optional)"
                  labelPlacement="stacked"
                  autoGrow
                  rows={2}
                  value={notes[appeal.id] ?? ''}
                  onIonInput={(e) => setNotes((prev) => ({ ...prev, [appeal.id]: String(e.detail.value ?? '') }))}
                />
              )}

              <div className="listing-appeals__actions">
                <IonButton
                  size="small"
                  fill="outline"
                  onClick={() => router.push(`/listing/${appeal.listingId}`, 'forward')}
                >
                  <IonIcon slot="start" icon={eyeOutline} />
                  View listing
                </IonButton>

                {appeal.status === 'pending' && (
                  <>
                    <IonButton
                      size="small"
                      fill="outline"
                      color="medium"
                      disabled={busyId === appeal.id}
                      onClick={() => void review(appeal, 'denied')}
                    >
                      <IonIcon slot="start" icon={closeCircleOutline} />
                      Deny
                    </IonButton>
                    <IonButton
                      size="small"
                      color="success"
                      disabled={busyId === appeal.id}
                      onClick={() => void review(appeal, 'approved')}
                    >
                      <IonIcon slot="start" icon={checkmarkCircleOutline} />
                      Approve
                    </IonButton>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </AppPage>
  );
};

export default ListingAppeals;
