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
import { listingAppealsApi } from '../services/api';
import type { Listing } from '../types';
import './AppealListingModal.css';

interface AppealListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing;
  onFiled: () => void;
}

/** Seller appeals a removed listing - goes to the admin's Listing Appeals queue. */
const AppealListingModal: React.FC<AppealListingModalProps> = ({ isOpen, onClose, listing, onFiled }) => {
  const [present] = useIonToast();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setError(null);
    }
  }, [isOpen]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      setError('Tell us why this listing should be reinstated.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await listingAppealsApi.fileAppeal(listing.id, null, message.trim());
      onClose();
      onFiled();
      await present({
        message: 'Appeal sent. A KEZMOTO admin will review it.',
        duration: 2400,
        color: 'success',
        position: 'top',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your appeal.');
    } finally {
      setSending(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="kez-modal appeal-listing-modal">
      <IonHeader>
        <IonToolbar>
          <IonTitle>Appeal {listing.brand} {listing.model}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Close">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="kez-modal__body">
        <form onSubmit={submit} noValidate className="appeal-listing-modal__form">
          <p className="kez-muted">
            A KEZMOTO admin removed this listing. Explain why it should go back up - if approved, it
            becomes available again right away.
          </p>

          <IonTextarea
            className="kez-field"
            label="Your appeal"
            labelPlacement="stacked"
            placeholder="What happened, and why should this listing be reinstated?"
            autoGrow
            rows={4}
            maxlength={800}
            value={message}
            onIonInput={(e) => setMessage(String(e.detail.value ?? ''))}
          />

          {error && <p className="kez-form-error">{error}</p>}

          <IonButton type="submit" expand="block" disabled={sending}>
            {sending ? <IonSpinner name="crescent" /> : 'Send appeal'}
          </IonButton>
        </form>
      </div>
    </IonModal>
  );
};

export default AppealListingModal;
