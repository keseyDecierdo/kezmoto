import React, { useEffect, useState } from 'react';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonModal,
  IonRadio,
  IonRadioGroup,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { userReportsApi } from '../services/api';
import type { ChatThread, ReportReason } from '../types';
import { REPORT_REASON_LABEL } from '../types';
import './ReportUserModal.css';

interface ReportUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  thread: ChatThread;
}

const REASONS = Object.keys(REPORT_REASON_LABEL) as ReportReason[];
const EVIDENCE_MESSAGES = 10;

/** Report the other side of a chat. Goes to the admin's User Reports queue. */
const ReportUserModal: React.FC<ReportUserModalProps> = ({ isOpen, onClose, thread }) => {
  const [present] = useIonToast();
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Start clean every time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setDetails('');
      setError(null);
    }
  }, [isOpen]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason) {
      setError('Pick the reason that fits best.');
      return;
    }
    if (reason === 'other' && !details.trim()) {
      setError('Tell us a little about what happened.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const nameOf = (id: string) => thread.parties.find((p) => p.id === id)?.name ?? 'Unknown';
      const evidence = thread.messages
        .filter((m) => !m.system)
        .slice(-EVIDENCE_MESSAGES)
        .map((m) => ({
          sender: nameOf(m.senderId),
          text: m.body || (m.imageUrl ? '[photo]' : ''),
          at: m.sentAt,
        }));
      await userReportsApi.create({
        reportedUserId: thread.participant.id,
        chatId: thread.id,
        reason,
        details,
        evidence,
      });
      onClose();
      await present({
        message: 'Report sent. A KEZMOTO admin will review it.',
        duration: 2400,
        color: 'success',
        position: 'top',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your report.');
    } finally {
      setSending(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="kez-modal report-modal">
      <IonHeader>
        <IonToolbar>
          <IonTitle>Report {thread.participant.name}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Close">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="kez-modal__body">
        <form onSubmit={submit} noValidate className="report-modal__form">
          <p className="kez-muted">
            Why are you reporting this person? Only KEZMOTO admins see your report, and they are never
            told who sent it.
          </p>

          <IonRadioGroup value={reason} onIonChange={(e) => setReason(e.detail.value as ReportReason)}>
            {REASONS.map((key) => (
              <IonRadio key={key} value={key} labelPlacement="end" justify="start" className="report-modal__radio">
                {REPORT_REASON_LABEL[key]}
              </IonRadio>
            ))}
          </IonRadioGroup>

          <IonTextarea
            className="kez-field"
            label="Details (optional)"
            labelPlacement="stacked"
            placeholder="What happened?"
            autoGrow
            rows={3}
            maxlength={500}
            value={details}
            onIonInput={(e) => setDetails(String(e.detail.value ?? ''))}
          />

          {error && <p className="kez-form-error">{error}</p>}

          <IonButton type="submit" expand="block" color="danger" disabled={sending}>
            {sending ? <IonSpinner name="crescent" /> : 'Send report'}
          </IonButton>
        </form>
      </div>
    </IonModal>
  );
};

export default ReportUserModal;
