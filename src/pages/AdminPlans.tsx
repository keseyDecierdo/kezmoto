import React, { useMemo, useState } from 'react';
import { IonButton, IonIcon, IonInput, useIonToast, useIonViewWillEnter } from '@ionic/react';
import {
  cashOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  diamondOutline,
  flashOutline,
  hourglassOutline,
  imageOutline,
} from 'ionicons/icons';
import AdminHero from '../components/AdminHero';
import AppPage from '../components/AppPage';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { confirmAction } from '../lib/sweetAlert';
import type { PlanPurchaseStatus } from '../lib/database.types';
import { plansApi } from '../services/api';
import type { PlanPurchase } from '../services/plansService';
import { formatPrice, formatRelative } from '../utils/format';
import { PLAN_DETAILS, isProKind } from '../utils/plans';
import './ListingAppeals.css';
import './AdminPlans.css';

const FILTERS: { id: PlanPurchaseStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

const isThisMonth = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

/**
 * Admin queue for KEZMOTO Pro and Boost payments. Approving grants Pro or the
 * boost through a database trigger (0036), not a second write here.
 */
const AdminPlans: React.FC = () => {
  const [present] = useIonToast();
  const [filter, setFilter] = useState<PlanPurchaseStatus>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsync<PlanPurchase[]>(() => plansApi.listAll(), []);

  useIonViewWillEnter(() => reload({ silent: true }));

  const all = useMemo(() => data ?? [], [data]);
  const shown = all.filter((p) => p.status === filter);
  const stats = useMemo(() => {
    const approvedThisMonth = all.filter((p) => p.status === 'approved' && isThisMonth(p.reviewedAt || p.createdAt));
    return {
      pending: all.filter((p) => p.status === 'pending').length,
      approved: approvedThisMonth.length,
      revenue: approvedThisMonth.reduce((sum, p) => sum + p.amount, 0),
    };
  }, [all]);

  const openProof = async (purchase: PlanPurchase) => {
    const url = await plansApi.proofUrl(purchase.proofPath);
    if (url) window.open(url, '_blank', 'noopener');
    else void present({ message: 'Could not open the screenshot.', duration: 2200, color: 'danger', position: 'top' });
  };

  const review = async (purchase: PlanPurchase, outcome: 'approved' | 'rejected') => {
    const what = isProKind(purchase.kind)
      ? `KEZMOTO ${PLAN_DETAILS[purchase.kind].label}`
      : `a Boost for ${purchase.listingTitle || 'this listing'}`;
    const confirmed = await confirmAction({
      title: outcome === 'approved' ? 'Approve this payment?' : 'Reject this payment?',
      text:
        outcome === 'approved'
          ? `Only approve after you see ${formatPrice(purchase.amount)} with reference ${purchase.referenceNumber} in KEZMOTO's GCash. This activates ${what} for ${purchase.buyerName || 'the seller'}.`
          : `${purchase.buyerName || 'The seller'} will be told the payment could not be matched.`,
      confirmText: outcome === 'approved' ? 'Approve' : 'Reject',
      danger: outcome === 'rejected',
    });
    if (!confirmed) return;

    setBusyId(purchase.id);
    try {
      await plansApi.review(purchase, outcome, notes[purchase.id] ?? '');
      reload({ silent: true });
      void present({
        message: outcome === 'approved' ? `Approved — ${what} is active.` : 'Payment rejected.',
        duration: 2200,
        color: 'success',
        position: 'top',
      });
    } catch (err) {
      void present({
        message: err instanceof Error ? err.message : 'Something went wrong.',
        duration: 2600,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppPage title="Plan Payments">
      <AdminHero
        title="Plan Payments"
        description="KEZMOTO Pro and Boost payments sent through GCash. Check the receipt against KEZMOTO's GCash history, then approve or reject."
        loading={loading && !data}
        stats={[
          { label: 'Waiting for review', value: stats.pending, icon: hourglassOutline },
          { label: 'Approved this month', value: stats.approved, icon: checkmarkCircleOutline },
          { label: 'Revenue this month', value: formatPrice(stats.revenue), icon: cashOutline },
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

      {loading && !data && <LoadingRows rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!error && data && shown.length === 0 && (
        <EmptyState
          icon={diamondOutline}
          title={`No ${filter} payments`}
          message="When a seller pays for KEZMOTO Pro or a Boost, the GCash receipt shows up here."
        />
      )}

      {!error && shown.length > 0 && (
        <div className="kez-bento kez-bento--cards admin-plans">
          {shown.map((purchase) => (
            <article className="kez-tile listing-appeals__card" key={purchase.id}>
              <header className="admin-plans__head">
                <span className={`admin-plans__kind admin-plans__kind--${isProKind(purchase.kind) ? 'pro' : 'boost'}`}>
                  <IonIcon icon={isProKind(purchase.kind) ? diamondOutline : flashOutline} aria-hidden="true" />
                  {PLAN_DETAILS[purchase.kind].label}
                </span>
                <strong className="admin-plans__amount">{formatPrice(purchase.amount)}</strong>
              </header>

              <p className="listing-appeals__message">
                <strong>{purchase.buyerName || 'Unknown seller'}</strong>
                {purchase.kind === 'boost' && ` · ${purchase.listingTitle || 'listing removed'}`}
              </p>
              <span className="listing-appeals__meta">
                GCash ref. <strong>{purchase.referenceNumber}</strong> · {formatRelative(purchase.createdAt)}
                {purchase.reviewedAt && ` · reviewed ${formatRelative(purchase.reviewedAt)}`}
                {purchase.reviewNote && ` · Note: ${purchase.reviewNote}`}
              </span>

              {purchase.status === 'pending' && (
                <IonInput
                  className="kez-field"
                  label="Note to seller (optional)"
                  labelPlacement="stacked"
                  placeholder="e.g. Reference number not found"
                  value={notes[purchase.id] ?? ''}
                  onIonInput={(e) =>
                    setNotes((prev) => ({ ...prev, [purchase.id]: String(e.detail.value ?? '') }))
                  }
                />
              )}

              <div className="listing-appeals__actions">
                <IonButton size="small" fill="outline" onClick={() => void openProof(purchase)}>
                  <IonIcon slot="start" icon={imageOutline} />
                  View receipt
                </IonButton>
                {purchase.status === 'pending' && (
                  <>
                    <IonButton
                      size="small"
                      fill="outline"
                      color="medium"
                      disabled={busyId === purchase.id}
                      onClick={() => void review(purchase, 'rejected')}
                    >
                      <IonIcon slot="start" icon={closeCircleOutline} />
                      Reject
                    </IonButton>
                    <IonButton
                      size="small"
                      color="success"
                      disabled={busyId === purchase.id}
                      onClick={() => void review(purchase, 'approved')}
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

export default AdminPlans;
