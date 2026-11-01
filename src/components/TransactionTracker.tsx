import React, { useEffect, useRef, useState } from 'react';
import { IonButton, IonIcon, IonInput, IonSpinner, IonTextarea, useIonToast } from '@ionic/react';
import {
  cardOutline,
  checkmarkCircle,
  chevronDownOutline,
  chevronUpOutline,
  closeCircleOutline,
  cloudUploadOutline,
  ellipseOutline,
  starOutline,
  timeOutline,
} from 'ionicons/icons';
import { useAuth } from '../context/AuthContext';
import { KEZMOTO_GCASH_NAME, KEZMOTO_GCASH_NUMBER } from '../lib/gcash';
import { commissionRateFor, isPro } from '../utils/plans';
import { commissionAmountFor, paymentsApi, reviewsApi } from '../services/api';
import type { Payment, Transaction } from '../types';
import { TRANSACTION_STATUS_LABEL, TRANSACTION_STATUS_SEQUENCE } from '../types';
import { formatPrice } from '../utils/format';
import './TransactionTracker.css';

/** Where the seller sends the commission. One constant — update here if it ever changes. */

const COMMISSION_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed — try again',
  waived: 'Waived',
};

interface TransactionTrackerProps {
  transaction: Transaction;
  /** Refetches the transaction — passed so a submitted review can flip the prompt off. */
  onReviewed?: () => void;
}

/**
 * Read-only status stepper for buyers and sellers. Admin-only fields
 * (verification notes) never reach this component — the
 * transaction row itself is all a customer's RLS session can see.
 */
const TransactionTracker: React.FC<TransactionTrackerProps> = ({ transaction, onReviewed }) => {
  const { user } = useAuth();
  // The seller pays; KEZMOTO Pro sellers get the lower rate.
  const commissionRate = commissionRateFor(user?.id === transaction.seller?.id && isPro(user));
  const [present] = useIonToast();
  // Collapsed by default — this sits above the message scroller inside
  // ChatPanel, and left open it was tall enough to push the conversation
  // out of view. A tap reveals the full stepper/commission/review panel;
  // the same control collapses it again.
  const [expanded, setExpanded] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justReviewed, setJustReviewed] = useState(false);

  const [myPayment, setMyPayment] = useState<Payment | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  // Skip the prompt if this side already reviewed the deal in an earlier visit.
  useEffect(() => {
    if (transaction.status !== 'completed') return;
    let ignore = false;
    reviewsApi
      .getMine(transaction.id)
      .then((review) => {
        if (!ignore && review) setJustReviewed(true);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [transaction.id, transaction.status]);

  const cancelled = transaction.status === 'cancelled';
  const currentIndex = TRANSACTION_STATUS_SEQUENCE.indexOf(transaction.status);

  const isParticipant = user?.id === transaction.buyer?.id || user?.id === transaction.seller?.id;
  const otherParty = isParticipant
    ? user?.id === transaction.buyer?.id
      ? transaction.seller
      : transaction.buyer
    : null;

  // Seller pays the commission in this build (see 0009_payments_schema.sql).
  const owesCommission =
    user?.id === transaction.seller?.id &&
    transaction.commissionStatus !== 'paid' &&
    transaction.commissionStatus !== 'waived';

  // Load this seller's own latest commission submission, so a pending one
  // shows "awaiting confirmation" instead of the form, and a failed one
  // (rejected by the admin) lets them try again.
  useEffect(() => {
    if (!owesCommission) return;
    let ignore = false;
    paymentsApi
      .listByTransactionId(transaction.id)
      .then((payments) => {
        if (ignore) return;
        const mine = payments.find((p) => p.payerId === user?.id) ?? null;
        setMyPayment(mine);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [transaction.id, transaction.commissionStatus, owesCommission, user?.id]);

  const pickProof = (event: React.ChangeEvent<HTMLInputElement>) => {
    setProofFile(event.target.files?.[0] ?? null);
  };

  const submitPayment = async () => {
    if (!referenceNumber.trim()) {
      await present({ message: 'Enter the GCash reference number.', duration: 2000, color: 'danger', position: 'top' });
      return;
    }
    if (!proofFile) {
      await present({ message: 'Attach a screenshot of the payment.', duration: 2000, color: 'danger', position: 'top' });
      return;
    }
    if (transaction.agreedPrice == null) return;

    setSubmittingPayment(true);
    try {
      const payment = await paymentsApi.submitCommissionPayment({
        transactionId: transaction.id,
        agreedPrice: transaction.agreedPrice,
        referenceNumber,
        proofFile,
        rate: commissionRate,
      });
      setMyPayment(payment);
      setReferenceNumber('');
      setProofFile(null);
      await present({
        message: 'Payment submitted — an admin will confirm it shortly.',
        duration: 2600,
        color: 'success',
        position: 'top',
      });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not submit the payment.',
        duration: 2800,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setSubmittingPayment(false);
    }
  };

  const submitReview = async () => {
    if (!otherParty) return;
    setSubmitting(true);
    try {
      await reviewsApi.create({
        transactionId: transaction.id,
        revieweeId: otherParty.id,
        rating,
        comment: comment.trim(),
      });
      setJustReviewed(true);
      onReviewed?.();
      await present({ message: 'Review submitted.', duration: 2000, color: 'success', position: 'top' });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not submit your review.',
        duration: 2600,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`tx-tracker${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="tx-tracker__head"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <div>
          <p className="kez-eyebrow">Transaction status</p>
          <h3 className="kez-display">
            {cancelled ? 'Cancelled' : TRANSACTION_STATUS_LABEL[transaction.status]}
          </h3>
        </div>
        <div className="tx-tracker__head-right">
          {(transaction.proposedPrice != null || transaction.agreedPrice != null) && (
            <div className="tx-tracker__prices">
              {transaction.proposedPrice != null && (
                <span>
                  <small>Proposed</small>
                  {formatPrice(transaction.proposedPrice)}
                </span>
              )}
              {transaction.agreedPrice != null && (
                <span className="is-agreed">
                  <small>Agreed</small>
                  {formatPrice(transaction.agreedPrice)}
                </span>
              )}
            </div>
          )}
          <IonIcon
            icon={expanded ? chevronUpOutline : chevronDownOutline}
            className="tx-tracker__chevron"
            aria-label={expanded ? 'Collapse transaction status' : 'Expand transaction status'}
          />
        </div>
      </button>

      {expanded && (
        <div className="tx-tracker__body">
          {cancelled ? (
            <p className="kez-muted tx-tracker__cancelled">
              <IonIcon icon={closeCircleOutline} />
              This deal was cancelled.
            </p>
          ) : (
            <ol className="tx-tracker__steps" aria-label="Transaction progress">
              {TRANSACTION_STATUS_SEQUENCE.map((status, index) => {
                const state =
                  index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
                return (
                  <li key={status} className={`tx-tracker__step is-${state}`}>
                    <IonIcon icon={state === 'done' ? checkmarkCircle : ellipseOutline} />
                    <span>{TRANSACTION_STATUS_LABEL[status]}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {!cancelled && transaction.agreedPrice != null && (
            <div className="tx-tracker__commission">
              <span>
                <small>KEZMOTO commission (seller · {Math.round(commissionRate * 100)}%{commissionRate < 0.05 ? ' Pro' : ''})</small>
                <strong>{formatPrice(commissionAmountFor(transaction.agreedPrice, commissionRate))}</strong>
              </span>
              <span
                className={`kez-chip ${transaction.commissionStatus === 'paid'
                    ? 'kez-chip--success'
                    : transaction.commissionStatus === 'failed'
                      ? 'kez-chip--danger'
                      : 'kez-chip--warning'
                  }`}
              >
                {COMMISSION_STATUS_LABEL[transaction.commissionStatus]}
              </span>
            </div>
          )}

          {owesCommission && transaction.agreedPrice != null && (
            <div className="tx-tracker__pay-commission">
              {myPayment?.status === 'pending' ? (
                <p className="kez-muted tx-tracker__pending-note">
                  <IonIcon icon={timeOutline} />
                  Submitted {formatPrice(myPayment.amount)} · ref {myPayment.referenceNumber} — waiting
                  for an admin to confirm it.
                </p>
              ) : (
                <>
                  {myPayment?.status === 'failed' && (
                    <p className="kez-muted tx-tracker__pending-note is-failed">
                      Your last submission was rejected. Double-check the reference number and try again.
                    </p>
                  )}
                  <p className="kez-muted tx-tracker__gcash-note">
                    Send {formatPrice(commissionAmountFor(transaction.agreedPrice, commissionRate))} via GCash to{' '}
                    <strong>{KEZMOTO_GCASH_NUMBER}</strong> ({KEZMOTO_GCASH_NAME}), then submit the
                    reference number and a screenshot below.
                  </p>
                  <IonInput
                    className="kez-field"
                    label="GCash reference number"
                    labelPlacement="stacked"
                    placeholder="e.g. 1234567890123"
                    value={referenceNumber}
                    onIonInput={(e) => setReferenceNumber(String(e.detail.value ?? ''))}
                  />
                  <input
                    ref={proofInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={pickProof}
                  />
                  <button
                    type="button"
                    className="tx-tracker__proof-picker"
                    onClick={() => proofInputRef.current?.click()}
                  >
                    <IonIcon icon={cloudUploadOutline} />
                    {proofFile ? proofFile.name : 'Attach payment screenshot'}
                  </button>
                  <IonButton
                    className="kez-cta"
                    size="small"
                    disabled={submittingPayment}
                    onClick={() => void submitPayment()}
                  >
                    {submittingPayment ? (
                      <IonSpinner name="crescent" />
                    ) : (
                      <>
                        <IonIcon slot="start" icon={cardOutline} />
                        Submit payment
                      </>
                    )}
                  </IonButton>
                </>
              )}
            </div>
          )}

          {transaction.status === 'completed' && !justReviewed && otherParty && (
            <div className="tx-tracker__review">
              <p className="kez-eyebrow">
                <IonIcon icon={starOutline} /> Rate {otherParty.name}
              </p>
              <div className="tx-tracker__stars" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    className={value <= rating ? 'is-filled' : undefined}
                    onClick={() => setRating(value)}
                  >
                    <IonIcon icon={starOutline} />
                  </button>
                ))}
              </div>
              <IonTextarea
                className="kez-field"
                placeholder="How did the deal go? (optional)"
                autoGrow
                rows={2}
                value={comment}
                onIonInput={(e) => setComment(String(e.detail.value ?? ''))}
              />
              <IonButton className="kez-cta" size="small" disabled={submitting} onClick={() => void submitReview()}>
                Submit review
              </IonButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionTracker;
