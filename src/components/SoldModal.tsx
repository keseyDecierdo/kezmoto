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

export interface SoldDetails {
  price: number;
  meetupLocation: string;
  /** ISO time, or null when not given. */
  meetupAt: string | null;
}

interface SoldModalProps {
  isOpen: boolean;
  onClose: () => void;
  buyerName: string;
  listedPrice: number | null;
  initialPrice?: number | null;
  initialLocation?: string | null;
  onSubmit: (details: SoldDetails) => Promise<void>;
}

/**
 * "Mark as sold" for a deal without a middleman: the seller records the
 * final price and where the hand-off happens, as agreed with the buyer.
 */
const SoldModal: React.FC<SoldModalProps> = ({
  isOpen,
  onClose,
  buyerName,
  listedPrice,
  initialPrice,
  initialLocation,
  onSubmit,
}) => {
  const [price, setPrice] = useState('');
  const [place, setPlace] = useState('');
  const [when, setWhen] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPrice(initialPrice != null ? String(initialPrice) : '');
      setPlace(initialLocation ?? '');
      setWhen('');
      setError(null);
    }
  }, [isOpen, initialPrice, initialLocation]);

  const amount = Number(price);
  const validPrice = price.trim() !== '' && Number.isFinite(amount) && amount > 0;
  const delta = validPrice && listedPrice ? offerDelta(amount, listedPrice) : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validPrice) {
      setError('Enter the final price in pesos, e.g. 40000.');
      return;
    }
    if (place.trim().length < 3) {
      setError(`Enter where you and ${buyerName} agreed to meet.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        price: Math.round(amount),
        meetupLocation: place.trim(),
        meetupAt: when ? new Date(when).toISOString() : null,
      });
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
          <IonTitle>Mark as sold</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Close">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="kez-modal__body">
        <form onSubmit={submit} noValidate className="offer-modal__form">
          <p className="kez-muted">
            Record what you and {buyerName} agreed. Direct deals have no KEZMOTO commission.
          </p>

          {listedPrice != null && (
            <p className="offer-modal__listed">
              Listed price <strong>{formatPrice(listedPrice)}</strong>
            </p>
          )}

          <IonInput
            className="kez-field offer-modal__amount"
            type="number"
            inputmode="numeric"
            label="Final agreed price (₱)"
            labelPlacement="stacked"
            placeholder="40000"
            min="1"
            value={price}
            onIonInput={(e) => setPrice(String(e.detail.value ?? ''))}
          />
          {delta && delta.amount > 0 && (
            <p className={`offer-modal__delta${delta.below ? '' : ' is-above'}`}>
              {formatPrice(delta.amount)} {delta.below ? 'below' : 'above'} the listed price ({delta.percent}%)
            </p>
          )}

          <IonInput
            className="kez-field offer-modal__amount"
            label="Agreed meetup place"
            labelPlacement="stacked"
            placeholder="e.g. SM CDO Downtown, main entrance"
            value={place}
            onIonInput={(e) => setPlace(String(e.detail.value ?? ''))}
          />

          <label className="kez-field sold-modal__when">
            <span>Meetup date and time (optional)</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>

          {error && <p className="kez-form-error">{error}</p>}

          <IonButton type="submit" expand="block" className="kez-cta" disabled={saving}>
            {saving ? <IonSpinner name="crescent" /> : 'Mark as sold'}
          </IonButton>
        </form>
      </div>
    </IonModal>
  );
};

export default SoldModal;
