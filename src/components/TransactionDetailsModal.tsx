import React, { useState } from 'react';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
  useIonRouter,
} from '@ionic/react';
import { chatbubblesOutline, closeOutline, locationOutline, openOutline } from 'ionicons/icons';
import { DocumentLightbox } from './DocumentViewer';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { commissionAmountFor, listingsApi } from '../services/api';
import type { Listing, Transaction, UnitDocument } from '../types';
import { TRANSACTION_STATUS_LABEL, TRANSACTION_STATUS_SEQUENCE } from '../types';
import { commissionApplies, commissionRateFor, isPro } from '../utils/plans';
import { formatDate, formatMileage, formatPrice, formatTime } from '../utils/format';
import './TransactionDetailsModal.css';

const COMMISSION_LABEL: Record<string, string> = {
  pending: 'Due',
  paid: 'Paid',
  failed: 'Not accepted - pay again',
  waived: 'Waived',
};

/** Same step logic as the chat's progress strip. */
const stepOf = (tx: Transaction): string => {
  if (tx.status === 'cancelled') return 'Cancelled';
  const status =
    tx.status === 'inspection_scheduled' || tx.status === 'inspection_done' ? 'verified' : tx.status;
  const index = TRANSACTION_STATUS_SEQUENCE.indexOf(status);
  return `Step ${Math.min(index + 1, TRANSACTION_STATUS_SEQUENCE.length)} of ${TRANSACTION_STATUS_SEQUENCE.length}`;
};

/** Everything about one deal: the unit, price, meetup and the people in it. */
const TransactionDetailsModal: React.FC<{ transaction: Transaction | null; onClose: () => void }> = ({
  transaction,
  onClose,
}) => {
  const router = useIonRouter();
  const { user } = useAuth();
  const [photo, setPhoto] = useState<number | null>(null);
  const { data: listing } = useAsync<Listing | null>(
    () =>
      transaction?.listingId ? listingsApi.getById(transaction.listingId).catch(() => null) : Promise.resolve(null),
    [transaction?.listingId]
  );

  const tx = transaction;
  const isSeller = Boolean(tx && user?.id === tx.seller?.id);
  const unit = listing && tx && listing.id === tx.listingId ? listing : null;
  const photos: UnitDocument[] = (unit?.photos ?? (tx?.listingPhoto ? [tx.listingPhoto] : [])).map((url, i, all) => ({
    id: `p-${i}`,
    label: `Photo ${i + 1} of ${all.length}`,
    imageUrl: url,
    redactions: [],
  }));
  const go = (path: string) => {
    onClose();
    router.push(path, 'forward');
  };

  return (
    <IonModal isOpen={tx != null} onDidDismiss={onClose} className="kez-modal tx-details">
      <IonHeader>
        <IonToolbar>
          <IonTitle>Transaction details</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Close">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      {tx && (
        <div className="kez-modal__body tx-details__body">
          <div className="tx-details__top">
            <div className="tx-details__media">
              {photos[0] ? (
                <button type="button" className="tx-details__cover" onClick={() => setPhoto(0)} aria-label="View photos">
                  <img src={photos[0].imageUrl} alt={tx.listingTitle ?? 'Unit'} />
                </button>
              ) : (
                <div className="tx-details__cover tx-details__cover--empty">No photo</div>
              )}
              {photos.length > 1 && (
                <div className="tx-details__thumbs">
                  {photos.slice(1, 5).map((p, i) => (
                    <button key={p.id} type="button" onClick={() => setPhoto(i + 1)} aria-label={`View photo ${i + 2}`}>
                      <img src={p.imageUrl} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="tx-details__summary">
              <h2 className="kez-display">{tx.listingTitle ?? 'Unit no longer listed'}</h2>
              <p className="tx-details__status">
                <span className={`kez-chip tx-list__status tx-list__status--${tx.status}`}>
                  {TRANSACTION_STATUS_LABEL[tx.status]}
                </span>
                <span className="kez-muted">{stepOf(tx)}</span>
              </p>

              <div className="tx-details__price">
                <small>{tx.status === 'completed' ? 'Sold for' : tx.agreedPrice != null ? 'Agreed price' : 'Proposed price'}</small>
                <strong>
                  {tx.agreedPrice != null
                    ? formatPrice(tx.agreedPrice)
                    : tx.proposedPrice != null
                      ? formatPrice(tx.proposedPrice)
                      : 'Not agreed yet'}
                </strong>
                {unit && <span className="kez-muted">Listed at {formatPrice(unit.price)}</span>}
              </div>

              <div className="tx-details__meetup">
                <IonIcon icon={locationOutline} aria-hidden="true" />
                <div>
                  <small>Agreed meetup</small>
                  <strong>{tx.meetupLocation || 'Not set yet'}</strong>
                  {tx.meetupAt && (
                    <span className="kez-muted">
                      {formatDate(tx.meetupAt)} · {formatTime(tx.meetupAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <dl className="tx-details__grid">
            <div>
              <dt>Seller</dt>
              <dd>{tx.seller?.name ?? 'Deleted account'}</dd>
            </div>
            <div>
              <dt>Buyer</dt>
              <dd>{tx.buyer?.name ?? 'Deleted account'}</dd>
            </div>
            <div>
              <dt>Middleman</dt>
              <dd>{tx.adminName ?? 'None (direct deal)'}</dd>
            </div>
            {unit && (
              <>
                <div>
                  <dt>Mileage</dt>
                  <dd>{formatMileage(unit.mileageKm)}</dd>
                </div>
                <div>
                  <dt>Unit location</dt>
                  <dd>{unit.location}</dd>
                </div>
                <div>
                  <dt>Year</dt>
                  <dd>{unit.year}</dd>
                </div>
              </>
            )}
            {isSeller && tx.agreedPrice != null && (
              <div>
                <dt>KEZMOTO commission</dt>
                <dd>
                  {commissionApplies(tx) ? (
                    <>
                      {formatPrice(commissionAmountFor(tx.agreedPrice, commissionRateFor(isPro(user))))} ·{' '}
                      {COMMISSION_LABEL[tx.commissionStatus] ?? tx.commissionStatus}
                    </>
                  ) : (
                    'None - direct deal'
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt>Started</dt>
              <dd>{formatDate(tx.createdAt)}</dd>
            </div>
            <div>
              <dt>Last update</dt>
              <dd>{formatDate(tx.updatedAt)}</dd>
            </div>
          </dl>

          {unit && (
            <dl className="tx-details__grid tx-details__condition">
              {(
                [
                  ['Engine', unit.condition.engineNoise],
                  ['Brakes', unit.condition.brakes],
                  ['Tires', unit.condition.tires],
                  ['Lights', unit.condition.lights],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || '-'}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="tx-details__actions">
            {tx.chatId && (
              <IonButton className="kez-cta" onClick={() => go(`/chat/${tx.chatId}`)}>
                <IonIcon slot="start" icon={chatbubblesOutline} />
                Open chat
              </IonButton>
            )}
            {unit && (
              <IonButton fill="outline" onClick={() => go(`/listing/${unit.id}`)}>
                <IonIcon slot="start" icon={openOutline} />
                View listing
              </IonButton>
            )}
          </div>
        </div>
      )}

      <DocumentLightbox documents={photos} index={photo} onClose={() => setPhoto(null)} onIndexChange={setPhoto} />
    </IonModal>
  );
};

export default TransactionDetailsModal;
