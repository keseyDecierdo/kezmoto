import React from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { checkmarkCircle, pricetagOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import type { Transaction } from '../types';
import { formatPrice } from '../utils/format';
import type { OfferState } from '../utils/offers';
import './OfferBar.css';

interface OfferBarProps {
  state: OfferState;
  transaction: Transaction | null;
  listedPrice: number | null;
  /** The other side of the chat, for "Kinny offered…". */
  otherName: string;
  busy: boolean;
  onOffer: () => void;
  onCounter: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
}

/**
 * The price negotiation strip under a chat's unit: listed price, the
 * pending offer (whoever made it), and the agreed price once accepted.
 */
const OfferBar: React.FC<OfferBarProps> = ({
  state,
  transaction,
  listedPrice,
  otherName,
  busy,
  onOffer,
  onCounter,
  onAccept,
  onDecline,
  onWithdraw,
}) => {
  const offer = transaction?.proposedPrice ?? null;
  const agreed = transaction?.agreedPrice ?? null;

  return (
    <div className={`offer-bar${state === 'theirs' ? ' is-pending' : ''}`} aria-live="polite">
      <div className="offer-bar__prices">
        {listedPrice != null && (
          <span className="offer-bar__listed">
            Listed <strong>{formatPrice(listedPrice)}</strong>
          </span>
        )}
        {agreed != null && (
          <span className="offer-bar__agreed">
            <IonIcon icon={checkmarkCircle} aria-hidden="true" />
            Agreed <strong>{formatPrice(agreed)}</strong>
          </span>
        )}
      </div>

      <div className="offer-bar__status">
        {state === 'locked' && (
          <p>
            <IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" />
            The KEZMOTO middleman sets the final price for this deal.
          </p>
        )}

        {state === 'none' && (
          <>
            <p>{agreed != null ? 'Want to change the price?' : 'Not happy with the listed price?'}</p>
            <IonButton size="small" className="kez-cta" disabled={busy} onClick={onOffer}>
              <IonIcon slot="start" icon={pricetagOutline} />
              Make an offer
            </IonButton>
          </>
        )}

        {state === 'mine' && offer != null && (
          <>
            <p>
              You offered <strong>{formatPrice(offer)}</strong> · waiting for {otherName}
            </p>
            <div className="offer-bar__actions">
              <IonButton size="small" fill="outline" disabled={busy} onClick={onOffer}>
                Change offer
              </IonButton>
              <IonButton size="small" fill="clear" color="medium" disabled={busy} onClick={onWithdraw}>
                Withdraw
              </IonButton>
            </div>
          </>
        )}

        {state === 'theirs' && offer != null && (
          <>
            <p>
              <strong>{otherName}</strong> offered <strong className="offer-bar__amount">{formatPrice(offer)}</strong>
            </p>
            <div className="offer-bar__actions">
              <IonButton size="small" className="kez-cta" disabled={busy} onClick={onAccept}>
                Accept
              </IonButton>
              <IonButton size="small" fill="outline" disabled={busy} onClick={onCounter}>
                Counter
              </IonButton>
              <IonButton size="small" fill="clear" color="danger" disabled={busy} onClick={onDecline}>
                Decline
              </IonButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OfferBar;
