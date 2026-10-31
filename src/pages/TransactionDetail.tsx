import React, { useEffect, useState } from 'react';
import {
  IonButton,
  IonCheckbox,
  IonIcon,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import { checkmarkCircleOutline, closeCircleOutline, informationCircleOutline } from 'ionicons/icons';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import { ErrorState, LoadingRows, LoadingState } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { confirmAction } from '../lib/sweetAlert';
import {
  commissionAmountFor,
  paymentsApi,
  transactionsApi,
  verificationApi,
} from '../services/api';
import type {
  Payment,
  Transaction,
  TransactionStatus,
  VerificationChecklist,
} from '../types';
import { TRANSACTION_STATUS_LABEL, TRANSACTION_STATUS_SEQUENCE } from '../types';
import { formatDate, formatPrice, formatRelative } from '../utils/format';
import './TransactionDetail.css';

type Tab = 'overview' | 'verification';

const ALL_STATUSES: TransactionStatus[] = [...TRANSACTION_STATUS_SEQUENCE, 'cancelled'];

const EMPTY_CHECKLIST = {
  orCrReviewed: false,
  modelYearConfirmed: false,
  mileagePlausible: false,
  conditionMatchesListing: false,
  ownershipMatchesSeller: false,
  adminNotes: '',
};

/** <ion-input type="datetime-local"> wants "YYYY-MM-DDTHH:mm", not the full ISO timestamp the row stores. */
const toDatetimeLocal = (iso: string | null) => (iso ? iso.slice(0, 16) : '');

/**
 * The admin's working screen for one assisted deal: overview + status
 * control, and the verification checklist. Reached from
 * the Middleman queue once a transaction is claimed.
 */
const TransactionDetail: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const router = useIonRouter();
  const [tab, setTab] = useState<Tab>('overview');

  const { data: transaction, loading, error, reload } = useAsync<Transaction>(
    () => transactionsApi.getById(id),
    [id]
  );

  return (
    <AppPage title="Transaction" backHref="/admin/middleman">
      {loading && <LoadingState label="Loading transaction" />}
      {!loading && (error || !transaction) && (
        <ErrorState message={error ?? 'That transaction could not be found.'} onRetry={reload} />
      )}

      {!loading && transaction && (
        <>
          <div className="kez-tile kez-tile--hero tx-detail__hero">
            <header className="tx-detail__head">
              <div>
                <h1 className="kez-display">{transaction.listingTitle ?? 'Unit'}</h1>
                <p className="kez-muted">
                  {transaction.buyer?.name ?? 'Buyer'} ↔ {transaction.seller?.name ?? 'Seller'}
                </p>
              </div>
              <span className="kez-chip kez-chip--accent">{TRANSACTION_STATUS_LABEL[transaction.status]}</span>
            </header>

            <nav className="tx-detail__tabs" aria-label="Sections">
              {(
                [
                  ['overview', 'Overview'],
                  ['verification', 'Verification'],
                ] as const
              ).map(([id_, label]) => (
                <button
                  key={id_}
                  type="button"
                  className={`tx-detail__tab${tab === id_ ? ' is-active' : ''}`}
                  onClick={() => setTab(id_)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {tab === 'overview' && (
            <OverviewTab transaction={transaction} onChanged={reload} onOpenListing={() => transaction.listingId && router.push(`/listing/${transaction.listingId}`, 'forward')} />
          )}
          {tab === 'verification' && <VerificationTab transaction={transaction} onChanged={reload} />}
        </>
      )}
    </AppPage>
  );
};

/* ------------------------------------------------------------- Overview */
const OverviewTab: React.FC<{
  transaction: Transaction;
  onChanged: () => void;
  onOpenListing: () => void;
}> = ({ transaction, onChanged, onOpenListing }) => {
  const [present] = useIonToast();
  const [status, setStatus] = useState<TransactionStatus>(transaction.status);
  const [agreedPrice, setAgreedPrice] = useState(transaction.agreedPrice?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  const [meetupAt, setMeetupAt] = useState(toDatetimeLocal(transaction.meetupAt));
  const [meetupLocation, setMeetupLocation] = useState(transaction.meetupLocation ?? '');
  const [schedulingMeetup, setSchedulingMeetup] = useState(false);

  useEffect(() => {
    setStatus(transaction.status);
    setAgreedPrice(transaction.agreedPrice?.toString() ?? '');
    setMeetupAt(toDatetimeLocal(transaction.meetupAt));
    setMeetupLocation(transaction.meetupLocation ?? '');
  }, [transaction.id, transaction.status, transaction.agreedPrice, transaction.meetupAt, transaction.meetupLocation]);

  const save = async () => {
    setSaving(true);
    try {
      await transactionsApi.updateStatus(
        transaction.id,
        status,
        agreedPrice.trim() ? Number(agreedPrice) : undefined
      );
      onChanged();
      await present({ message: 'Transaction updated.', duration: 1800, color: 'success', position: 'top' });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not update the transaction.',
        duration: 2600,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setSaving(false);
    }
  };

  const scheduleMeetup = async () => {
    if (!meetupAt.trim() || !meetupLocation.trim()) {
      await present({ message: 'Set both a date/time and a place.', duration: 2000, color: 'danger', position: 'top' });
      return;
    }
    setSchedulingMeetup(true);
    try {
      await transactionsApi.scheduleMeetup(transaction.id, new Date(meetupAt).toISOString(), meetupLocation.trim());
      onChanged();
      await present({ message: 'Meetup scheduled.', duration: 1800, color: 'success', position: 'top' });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not schedule the meetup.',
        duration: 2600,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setSchedulingMeetup(false);
    }
  };

  return (
    <div className="kez-bento kez-bento--start tx-detail__overview">
      <section className="kez-tile kez-tile--w2 tx-detail__section">
        <h2 className="kez-display tx-detail__tile-title">Deal</h2>
        <div className="tx-detail__parties">
          <div className="tx-detail__party">
            <Avatar name={transaction.buyer?.name ?? '?'} color={transaction.buyer?.avatarColor ?? '#ff6a00'} />
            <div>
              <small>Buyer</small>
              <strong>{transaction.buyer?.name ?? 'Unknown'}</strong>
            </div>
          </div>
          <div className="tx-detail__party">
            <Avatar name={transaction.seller?.name ?? '?'} color={transaction.seller?.avatarColor ?? '#0a0a0a'} />
            <div>
              <small>Seller</small>
              <strong>{transaction.seller?.name ?? 'Unknown'}</strong>
            </div>
          </div>
        </div>

        <button type="button" className="tx-detail__listing" onClick={onOpenListing}>
          {transaction.listingPhoto && <img src={transaction.listingPhoto} alt="" />}
          <span>
            <small>Unit</small>
            <strong>{transaction.listingTitle ?? 'View listing'}</strong>
          </span>
        </button>

        <div className="tx-detail__row">
          <p className="kez-muted">Pending offer</p>
          <p className="tx-detail__price">
            {transaction.proposedPrice != null ? formatPrice(transaction.proposedPrice) : '—'}
          </p>
        </div>
        <div className="tx-detail__row">
          <p className="kez-muted">Agreed by buyer and seller</p>
          <p className="tx-detail__price">
            {transaction.agreedPrice != null ? formatPrice(transaction.agreedPrice) : 'Not yet'}
          </p>
        </div>

        <IonInput
          className="kez-field"
          type="number"
          label="Agreed price (PHP)"
          labelPlacement="stacked"
          placeholder="e.g. 90000"
          value={agreedPrice}
          onIonInput={(e) => setAgreedPrice(String(e.detail.value ?? ''))}
        />

        <IonSelect
          className="kez-field"
          label="Status"
          labelPlacement="stacked"
          interface="popover"
          value={status}
          onIonChange={(e) => setStatus(e.detail.value as TransactionStatus)}
        >
          {ALL_STATUSES.map((s) => (
            <IonSelectOption key={s} value={s}>
              {TRANSACTION_STATUS_LABEL[s]}
            </IonSelectOption>
          ))}
        </IonSelect>

        <IonButton className="kez-cta" disabled={saving} onClick={() => void save()}>
          {saving ? <IonSpinner name="crescent" /> : 'Save'}
        </IonButton>

        <p className="tx-detail__timestamps kez-muted">
          Opened {formatDate(transaction.createdAt)} · updated {formatRelative(transaction.updatedAt)}
        </p>
      </section>

      <section className="kez-tile kez-tile--w2 tx-detail__section">
        <h2 className="kez-display tx-detail__tile-title">Meetup &amp; commission</h2>
        <div className="tx-detail__meetup">
          <IonInput
            className="kez-field"
            type="datetime-local"
            label="Date & time"
            labelPlacement="stacked"
            value={meetupAt}
            onIonInput={(e) => setMeetupAt(String(e.detail.value ?? ''))}
          />
          <IonInput
            className="kez-field"
            label="Location"
            labelPlacement="stacked"
            placeholder="e.g. SM City Cebu, north entrance"
            value={meetupLocation}
            onIonInput={(e) => setMeetupLocation(String(e.detail.value ?? ''))}
          />
          <IonButton
            fill="outline"
            color="primary"
            size="small"
            disabled={schedulingMeetup}
            onClick={() => void scheduleMeetup()}
          >
            {schedulingMeetup ? <IonSpinner name="crescent" /> : 'Schedule meetup'}
          </IonButton>
        </div>

        {transaction.agreedPrice != null ? (
          <CommissionPanel transaction={transaction} onChanged={onChanged} />
        ) : (
          <p className="kez-muted">The commission appears here once an agreed price is saved.</p>
        )}
      </section>
    </div>
  );
};

/* -------------------------------------------------------- Commission --
   Manual GCash review: the seller's submitted reference number + proof
   screenshot, with Confirm/Reject. This — not anything editable on the
   Overview form above — is what actually moves commission_status; see
   sync_commission_status in 0009_payments_schema.sql. */
const CommissionPanel: React.FC<{ transaction: Transaction; onChanged: () => void }> = ({
  transaction,
  onChanged,
}) => {
  const [present] = useIonToast();
  const { data: payments, loading, reload } = useAsync<Payment[]>(
    () => paymentsApi.listByTransactionId(transaction.id),
    [transaction.id]
  );
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  // Most recent submission is what needs reviewing (or explains the current status).
  const latest = (payments ?? [])[0] ?? null;

  useEffect(() => {
    if (!latest) {
      setProofUrl(null);
      return;
    }
    let ignore = false;
    paymentsApi.proofUrlFor(latest).then((url) => {
      if (!ignore) setProofUrl(url);
    });
    return () => {
      ignore = true;
    };
  }, [latest]);

  const review = async (outcome: 'succeeded' | 'failed') => {
    if (!latest) return;
    const confirmed = await confirmAction({
      title: outcome === 'succeeded' ? 'Confirm this payment?' : 'Reject this payment?',
      text:
        outcome === 'succeeded'
          ? 'This marks the commission as paid — make sure the reference number and screenshot check out.'
          : 'The seller will need to resubmit proof of payment.',
      confirmText: outcome === 'succeeded' ? 'Confirm payment' : 'Reject',
      danger: outcome === 'failed',
    });
    if (!confirmed) return;
    setReviewing(true);
    try {
      await paymentsApi.confirmPayment(latest.id, outcome);
      reload();
      onChanged();
      await present({
        message: outcome === 'succeeded' ? 'Payment confirmed.' : 'Payment rejected.',
        duration: 2000,
        color: outcome === 'succeeded' ? 'success' : 'medium',
        position: 'top',
      });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not update the payment.',
        duration: 2600,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setReviewing(false);
    }
  };

  if (loading) return null;

  return (
    <div className="kez-tile kez-tile--soft tx-detail__commission">
      <p className="kez-eyebrow">Commission — seller pays via GCash</p>
      <div className="tx-detail__row">
        <p className="kez-muted">Amount owed</p>
        <p className="tx-detail__price">{formatPrice(commissionAmountFor(transaction.agreedPrice ?? 0))}</p>
      </div>

      {!latest && <p className="kez-muted">No submission yet.</p>}

      {latest && (
        <>
          <span
            className={`kez-chip ${
              latest.status === 'succeeded'
                ? 'kez-chip--success'
                : latest.status === 'failed'
                  ? 'kez-chip--danger'
                  : 'kez-chip--warning'
            }`}
          >
            {latest.status === 'succeeded' ? 'Confirmed paid' : latest.status === 'failed' ? 'Rejected' : 'Awaiting review'}
          </span>

          <div className="tx-detail__row">
            <p className="kez-muted">Reference number</p>
            <p>{latest.referenceNumber || '—'}</p>
          </div>
          <div className="tx-detail__row">
            <p className="kez-muted">Amount submitted</p>
            <p>{formatPrice(latest.amount)}</p>
          </div>

          {proofUrl && (
            <a href={proofUrl} target="_blank" rel="noreferrer" className="tx-detail__proof-link">
              <img src={proofUrl} alt="Payment proof" />
            </a>
          )}

          {latest.status === 'pending' && (
            <div className="tx-detail__commission-actions">
              <IonButton
                size="small"
                className="kez-cta"
                disabled={reviewing}
                onClick={() => void review('succeeded')}
              >
                <IonIcon slot="start" icon={checkmarkCircleOutline} />
                Confirm payment
              </IonButton>
              <IonButton
                size="small"
                fill="outline"
                color="danger"
                disabled={reviewing}
                onClick={() => void review('failed')}
              >
                <IonIcon slot="start" icon={closeCircleOutline} />
                Reject
              </IonButton>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* --------------------------------------------------------- Verification */
const VerificationTab: React.FC<{ transaction: Transaction; onChanged: () => void }> = ({
  transaction,
  onChanged,
}) => {
  const [present] = useIonToast();
  const { data, loading, reload } = useAsync<VerificationChecklist | null>(
    () => verificationApi.getByTransactionId(transaction.id),
    [transaction.id]
  );

  const [form, setForm] = useState(EMPTY_CHECKLIST);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        orCrReviewed: data.orCrReviewed,
        modelYearConfirmed: data.modelYearConfirmed,
        mileagePlausible: data.mileagePlausible,
        conditionMatchesListing: data.conditionMatchesListing,
        ownershipMatchesSeller: data.ownershipMatchesSeller,
        adminNotes: data.adminNotes,
      });
    }
  }, [data]);

  const set = (key: keyof typeof form) => (value: boolean | string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await verificationApi.save(transaction.id, form);
      reload();
      onChanged();
      await present({
        message: 'Verification checklist saved.',
        duration: 2000,
        color: 'success',
        position: 'top',
      });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not save the checklist.',
        duration: 2600,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingRows rows={3} layout="list" />;

  const checks: [keyof typeof form, string][] = [
    ['orCrReviewed', 'OR/CR reviewed'],
    ['modelYearConfirmed', 'Model and year confirmed'],
    ['mileagePlausible', 'Mileage is plausible'],
    ['conditionMatchesListing', 'Condition matches the listing'],
    ['ownershipMatchesSeller', 'Ownership matches the seller'],
  ];

  return (
    <section className="kez-tile tx-detail__section">
      <div className="tx-detail__disclaimer">
        <IonIcon icon={informationCircleOutline} />
        Verified by KEZMOTO admin; official verification should still be done through LTO.
      </div>

      <div className="tx-detail__checklist">
        {checks.map(([key, label]) => (
          <label key={key} className="tx-detail__check">
            <IonCheckbox
              checked={form[key] as boolean}
              onIonChange={(e) => set(key)(e.detail.checked)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <IonTextarea
        className="kez-field"
        label="Admin notes"
        labelPlacement="stacked"
        autoGrow
        rows={3}
        placeholder="Anything worth flagging for this deal"
        value={form.adminNotes}
        onIonInput={(e) => set('adminNotes')(String(e.detail.value ?? ''))}
      />

      {data?.verifiedAt && (
        <p className="kez-muted tx-detail__timestamps">
          Last reviewed {formatRelative(data.verifiedAt)}
        </p>
      )}

      <IonButton className="kez-cta" disabled={saving} onClick={() => void save()}>
        {saving ? <IonSpinner name="crescent" /> : 'Save checklist'}
      </IonButton>
    </section>
  );
};

export default TransactionDetail;
