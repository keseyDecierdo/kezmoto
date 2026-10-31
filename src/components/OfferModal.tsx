import React, { useEffect, useState } from 'react';
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
import { closeOutline } from 'ionicons/icons';
import { formatPrice } from '../utils/format';
import { offerDelta } from '../utils/offers';
import './OfferModal.css';

interface OfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** "Make an offer", "Counter offer", "Sold for how much?" */
  title: string;
  /** One line under the title explaining what happens next. */
  hint: string;
  confirmLabel: string;
  /** The unit's listed price, for the comparison line. */
  listedPrice: number | null;
  /** Prefilled amount (e.g. the agreed price when marking sold). */
  initialPrice?: number | null;
  onSubmit: (price: number) => Promise<void>;
}

/** A single peso amount, shared by offers, counter-offers and "sold for". */
const OfferModal: React.FC<OfferModalProps> = ({
  isOpen,
  onClose,
  title,
  hint,
  confirmLabel,
  listedPrice,
  initialPrice,
  onSubmit,
}) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValue(initialPrice != null ? String(initialPrice) : '');
      setError(null);
    }
  }, [isOpen, initialPrice]);

  const price = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(price) && price > 0;
  const delta = valid && listedPrice ? offerDelta(price, listedPrice) : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) {
      setError('Enter an amount in pesos, e.g. 40000.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(Math.round(price));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="kez-modal offer-modal">
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
        <form onSubmit={submit} noValidate className="offer-modal__form">
          <p className="kez-muted">{hint}</p>

          {listedPrice != null && (
            <p className="offer-modal__listed">
              Listed price <strong>{formatPrice(listedPrice)}</strong>
            </p>
          )}

          <IonInput
            className="kez-field offer-modal__amount"
            type="number"
            inputmode="numeric"
            label="Amount (₱)"
            labelPlacement="stacked"
            placeholder="40000"
            min="1"
            value={value}
            onIonInput={(e) => setValue(String(e.detail.value ?? ''))}
          />

          {delta && delta.amount > 0 && (
            <p className={`offer-modal__delta${delta.below ? '' : ' is-above'}`}>
              {formatPrice(delta.amount)} {delta.below ? 'below' : 'above'} the listed price ({delta.percent}%)
            </p>
          )}

          {error && <p className="kez-form-error">{error}</p>}

          <IonButton type="submit" expand="block" className="kez-cta" disabled={saving}>
            {saving ? <IonSpinner name="crescent" /> : confirmLabel}
          </IonButton>
        </form>
      </div>
    </IonModal>
  );
};

export default OfferModal;
