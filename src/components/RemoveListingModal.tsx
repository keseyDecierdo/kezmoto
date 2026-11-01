import React, { useEffect, useState } from 'react';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { fraudApi } from '../services/api';
import type { Listing } from '../types';
import './RemoveListingModal.css';

interface RemoveListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing;
  onRemoved: () => void;
}

/** Admin removes a listing with a required reason - the seller is notified
    and can appeal it (see MyUnits.tsx / ListingAppeals.tsx). */
const RemoveListingModal: React.FC<RemoveListingModalProps> = ({ isOpen, onClose, listing, onRemoved }) => {
  const [present] = useIonToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
    }
  }, [isOpen]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Tell the seller why this listing is being removed.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await fraudApi.removeListing(listing.id, reason.trim());
      onClose();
      onRemoved();
      await present({
        message: 'Listing removed. The seller has been notified.',
        duration: 2400,
        color: 'success',
        position: 'top',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the listing.');
    } finally {
      setSending(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="kez-modal remove-listing-modal">
      <IonHeader>
        <IonToolbar>
          <IonTitle>Remove {listing.brand} {listing.model}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Close">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="kez-modal__body">
        <form onSubmit={submit} noValidate className="remove-listing-modal__form">
          <p className="kez-muted">
            This takes the listing off the marketplace right away. The seller sees your reason and can
            appeal it.
          </p>

          <IonTextarea
            className="kez-field"
            label="Reason"
            labelPlacement="stacked"
            placeholder="e.g. Same photos and model as another seller's active listing."
            autoGrow
            rows={3}
            maxlength={500}
            value={reason}
            onIonInput={(e) => setReason(String(e.detail.value ?? ''))}
          />

          {error && <p className="kez-form-error">{error}</p>}

          <IonButton type="submit" expand="block" color="danger" disabled={sending}>
            {sending ? <IonSpinner name="crescent" /> : 'Remove listing'}
          </IonButton>
        </form>
      </div>
    </IonModal>
  );
};

export default RemoveListingModal;
