import React, { useMemo, useState } from 'react';
import { IonButton, IonIcon, IonTextarea, useIonRouter, useIonToast } from '@ionic/react';
import {
  alertCircleOutline,
  bicycleOutline,
  checkmarkCircleOutline,
  shieldOutline,
  trashOutline,
} from 'ionicons/icons';
import AdminHero from '../components/AdminHero';
import AppPage from '../components/AppPage';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { confirmAction } from '../lib/sweetAlert';
import { fraudApi } from '../services/api';
import type { FraudFlag } from '../types';
import { FRAUD_FLAG_LABEL } from '../types';
import { formatRelative } from '../utils/format';
import './FraudReview.css';

/**
 * Admin-only queue of pending fraud flags, grouped by listing. Neither the
 * flag type/detail nor the fact that a listing was flagged at all ever
 * reaches a buyer or the seller - this screen, gated by RLS (0013), is the
 * only place any of it is visible.
 */
const FraudReview: React.FC = () => {
  const router = useIonRouter();
  const [present] = useIonToast();
  const { data, loading, error, reload } = useAsync<FraudFlag[]>(() => fraudApi.listPending(), []);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const grouped = useMemo(() => {
    const byListing = new Map<string, FraudFlag[]>();
    for (const flag of data ?? []) {
      const list = byListing.get(flag.listingId) ?? [];
      list.push(flag);
      byListing.set(flag.listingId, list);
    }
    return Array.from(byListing.entries());
  }, [data]);

  const review = async (flag: FraudFlag, outcome: 'reviewed_ok' | 'reviewed_removed') => {
    setReviewingId(flag.id);
    try {
      await fraudApi.review(flag.id, outcome, outcome === 'reviewed_removed' ? notes[flag.id] : undefined);
      reload();
      await present({
        message: outcome === 'reviewed_removed' ? 'Flag confirmed - the listing was removed.' : 'Flag dismissed.',
        duration: 2000,
        color: outcome === 'reviewed_removed' ? 'danger' : 'success',
        position: 'top',
      });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not update the flag.',
        duration: 2600,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setReviewingId(null);
    }
  };

  const removeListing = async (flag: FraudFlag) => {
    if (!notes[flag.id]?.trim()) {
      await present({ message: 'Enter a reason for the seller before removing.', duration: 2400, color: 'danger', position: 'top' });
      return;
    }
    const confirmed = await confirmAction({
      title: 'Remove this listing?',
      text: `${flag.listingTitle ?? 'This unit'} will be taken off the marketplace immediately and the seller will be notified why.`,
      confirmText: 'Remove listing',
      danger: true,
    });
    if (!confirmed) return;
    await review(flag, 'reviewed_removed');
  };

  return (
    <AppPage title="Fraud Flag Review">
      <AdminHero
        title="Fraud Flag Review"
        description="Listings the system flagged as possibly suspicious. Clear a flag if it is fine, or remove the listing."
        loading={loading && !data}
        stats={[
          { label: 'Open flags', value: (data ?? []).length, icon: alertCircleOutline },
          { label: 'Listings affected', value: grouped.length, icon: bicycleOutline },
        ]}
      />
      {loading && <LoadingRows rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && grouped.length === 0 && (
        <EmptyState
          icon={shieldOutline}
          title="Nothing pending"
          message="Rules-based and AI-detected fraud signals show up here as new listings are checked."
        />
      )}

      {!loading && !error && grouped.length > 0 && (
        <div className="kez-bento kez-bento--cards fraud-review">
          {grouped.map(([listingId, flags]) => (
            <article className="kez-tile kez-tile--flush fraud-review__group" key={listingId}>
              <header
                className="fraud-review__group-head"
                onClick={() => router.push(`/listing/${listingId}`, 'forward')}
                role="button"
                tabIndex={0}
              >
                <strong>{flags[0].listingTitle ?? 'Unit'}</strong>
                <span className="kez-muted">Seller: {flags[0].sellerName ?? 'Unknown'}</span>
              </header>

              <ul className="fraud-review__flags">
                {flags.map((flag) => (
                  <li key={flag.id} className="fraud-review__flag">
                    <div className="fraud-review__flag-body">
                      <span className="kez-chip kez-chip--warning">{FRAUD_FLAG_LABEL[flag.flagType]}</span>
                      <p>{flag.detail}</p>
                      <span className="fraud-review__meta">
                        {flag.aiConfidence != null && `confidence ${Math.round(flag.aiConfidence * 100)}% · `}
                        {formatRelative(flag.createdAt)}
                      </span>
                      <IonTextarea
                        className="kez-field"
                        label="Reason for removal (shown to the seller)"
                        labelPlacement="stacked"
                        autoGrow
                        rows={2}
                        value={notes[flag.id] ?? ''}
                        onIonInput={(e) => setNotes((prev) => ({ ...prev, [flag.id]: String(e.detail.value ?? '') }))}
                      />
                    </div>
                    <div className="fraud-review__flag-actions">
                      <IonButton
                        size="small"
                        fill="outline"
                        color="medium"
                        disabled={reviewingId === flag.id}
                        onClick={() => void review(flag, 'reviewed_ok')}
                      >
                        <IonIcon slot="start" icon={checkmarkCircleOutline} />
                        Dismiss
                      </IonButton>
                      <IonButton
                        size="small"
                        color="danger"
                        disabled={reviewingId === flag.id}
                        onClick={() => void removeListing(flag)}
                      >
                        <IonIcon slot="start" icon={trashOutline} />
                        Remove listing
                      </IonButton>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </AppPage>
  );
};

export default FraudReview;
