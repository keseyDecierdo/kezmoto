import React, { useEffect, useRef, useState } from 'react';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { closeOutline, hourglassOutline, imageOutline } from 'ionicons/icons';
import { KEZMOTO_GCASH_NAME, KEZMOTO_GCASH_NUMBER } from '../lib/gcash';
import type { PlanKind } from '../lib/database.types';
import { plansApi } from '../services/api';
import { BOOST_DAYS, PLAN_DETAILS, PLAN_PRICES, isProKind } from '../utils/plans';
import { formatPrice } from '../utils/format';
import './PurchaseModal.css';

interface PurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  kind: PlanKind;
  /** Boosts only: which listing, and its title for the summary. */
  listingId?: string;
  listingTitle?: string;
  /** Called once the payment proof is submitted. */
  onSubmitted?: () => void;
}

/**
 * Pay for KEZMOTO Pro or a Boost the same way as the commission: send GCash,
 * then submit the reference number and a screenshot for an admin to approve.
 */
const PurchaseModal: React.FC<PurchaseModalProps> = ({
  isOpen,
  onClose,
  kind,
  listingId,
  listingTitle,
  onSubmitted,
}) => {
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setReference('');
      setFile(null);
      setError(null);
      setDone(false);
    }
  }, [isOpen]);

  const price = PLAN_PRICES[kind];
  const title = kind === 'pro_year' ? 'Get KEZMOTO Pro · 1 year' : kind === 'pro' ? 'Get KEZMOTO Pro' : 'Boost this listing';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reference.trim().length < 6) {
      setError('Enter the GCash reference number from your receipt.');
      return;
    }
    if (!file) {
      setError('Attach a screenshot of the GCash receipt.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await plansApi.submitPurchase({ kind, listingId, referenceNumber: reference, proofFile: file });
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="kez-modal purchase-modal">
      <IonHeader>
        <IonToolbar>
          <IonTitle>{title}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Close">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <div className="kez-modal__body">
        {done ? (
          <div className="purchase-modal__done">
            <IonIcon icon={hourglassOutline} aria-hidden="true" />
            <h3 className="kez-display">Payment sent for review</h3>
            <p className="kez-muted">
              A KEZMOTO admin will check your GCash receipt, usually within the day. You&apos;ll get a
              notification once {isProKind(kind) ? 'Pro is active' : 'your listing is Featured'}.
            </p>
            <IonButton expand="block" className="kez-cta" onClick={onClose}>
              Done
            </IonButton>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="purchase-modal__form">
            <div className="purchase-modal__summary">
              <span>
                {isProKind(kind)
                  ? `Pro for ${kind === 'pro_year' ? '1 year' : `${PLAN_DETAILS[kind].days} days`} · unlimited listings, 3% commission, ${PLAN_DETAILS[kind].boosts} free boosts`
                  : `Featured at the top for ${BOOST_DAYS} days${listingTitle ? ` · ${listingTitle}` : ''}`}
              </span>
              <strong>{formatPrice(price)}</strong>
            </div>

            <ol className="purchase-modal__steps">
              <li>
                Send <strong>{formatPrice(price)}</strong> via GCash to <strong>{KEZMOTO_GCASH_NUMBER}</strong> (
                {KEZMOTO_GCASH_NAME}).
              </li>
              <li>Enter the reference number and attach the receipt screenshot below.</li>
            </ol>

            <IonInput
              className="kez-field"
              label="GCash reference number"
              labelPlacement="stacked"
              placeholder="e.g. 1012 345 678901"
              inputmode="numeric"
              value={reference}
              onIonInput={(e) => setReference(String(e.detail.value ?? ''))}
            />

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button type="button" className="purchase-modal__file" onClick={() => fileInput.current?.click()}>
              <IonIcon icon={imageOutline} aria-hidden="true" />
              <span>{file ? file.name : 'Attach GCash receipt screenshot'}</span>
            </button>

            {error && <p className="kez-form-error">{error}</p>}

            <p className="purchase-modal__terms">
              Activated after an admin confirms the payment. Refunds follow the{' '}
              <a href="/refunds" target="_blank" rel="noopener">
                Refund Policy
              </a>
              .
            </p>

            <IonButton type="submit" expand="block" className="kez-cta" disabled={saving}>
              {saving ? <IonSpinner name="crescent" /> : `Submit ${formatPrice(price)} payment`}
            </IonButton>
          </form>
        )}
      </div>
    </IonModal>
  );
};

export default PurchaseModal;
