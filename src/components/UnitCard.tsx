import React from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import {
  chatbubbleEllipsesOutline,
  heart,
  heartOutline,
  locationOutline,
  shieldCheckmarkOutline,
  speedometerOutline,
  trashOutline,
} from 'ionicons/icons';
import type { Listing } from '../types';
import ScoreBadges from './ScoreBadges';
import { formatMileage, formatPrice } from '../utils/format';
import './UnitCard.css';

interface UnitCardProps {
  listing: Listing;
  onView: (listing: Listing) => void;
  /** Omitted on the public landing page, where messaging requires an account. */
  onMessage?: (listing: Listing) => void;
  onToggleFavorite?: (listing: Listing) => void;
  isFavorite?: boolean;
  /** True when the signed-in viewer posted this listing themselves —
      hides Send Message (you can't message yourself), leaving just View
      Details. */
  isOwnListing?: boolean;
  /** Admin-only — adds a third, danger-styled "Remove" action. Omitted
      everywhere a non-admin can see this card. */
  onRemove?: (listing: Listing) => void;
  /** Compact drops the action row (used inside dense side panels). */
  compact?: boolean;
}

const STATUS_LABEL: Record<Listing['status'], string> = {
  active: 'Available',
  pending: 'Reserved',
  sold: 'Sold',
  draft: 'Draft',
};

/**
 * The single unit card used by Home, the landing preview and Favorites.
 * Nothing else should render a unit tile — extend this instead.
 */
const UnitCard: React.FC<UnitCardProps> = ({
  listing,
  onView,
  onMessage,
  onToggleFavorite,
  isFavorite = false,
  isOwnListing = false,
  onRemove,
  compact = false,
}) => {
  const title = `${listing.brand} ${listing.model}`;

  return (
    <article className={`unit-card${compact ? ' unit-card--compact' : ''}`}>
      <button
        type="button"
        className="unit-card__media"
        onClick={() => onView(listing)}
        aria-label={`View details for ${title} ${listing.year}`}
      >
        <img src={listing.photos[0]} alt={`${title} ${listing.year}`} loading="lazy" />
        <span className={`unit-card__status unit-card__status--${listing.status}`}>
          {STATUS_LABEL[listing.status]}
        </span>
        {listing.adminAssisted && (
          <span className="unit-card__assist" title="Seller accepts admin-assisted deals">
            <IonIcon icon={shieldCheckmarkOutline} />
            Assisted
          </span>
        )}
      </button>

      {onToggleFavorite && (
        <button
          type="button"
          className={`unit-card__fav${isFavorite ? ' is-active' : ''}`}
          onClick={() => onToggleFavorite(listing)}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Remove ${title} from favorites` : `Save ${title} to favorites`}
        >
          <IonIcon icon={isFavorite ? heart : heartOutline} />
        </button>
      )}

      <div className="unit-card__body">
        <div className="unit-card__heading">
          <h3 className="kez-display unit-card__title">{title}</h3>
          <span className="unit-card__year">{listing.year}</span>
        </div>

        <p className="unit-card__price">{formatPrice(listing.price)}</p>

        <ul className="unit-card__meta">
          <li>
            <IonIcon icon={locationOutline} />
            {listing.location}
          </li>
          <li>
            <IonIcon icon={speedometerOutline} />
            {formatMileage(listing.mileageKm)}
          </li>
        </ul>

        {(listing.listingQualityScore != null || listing.conditionScore != null) && (
          <div className="unit-card__scores">
            <ScoreBadges listing={listing} compact />
          </div>
        )}

        {!compact && (
          <div className="unit-card__actions">
            <IonButton
              className="kez-cta"
              size="small"
              expand="block"
              onClick={() => onView(listing)}
            >
              View Details
            </IonButton>
            {onMessage && !isOwnListing && (
              <IonButton
                size="small"
                expand="block"
                fill="outline"
                color="primary"
                onClick={() => onMessage(listing)}
              >
                <IonIcon slot="start" icon={chatbubbleEllipsesOutline} />
                Send Message
              </IonButton>
            )}
            {onRemove && (
              <IonButton
                size="small"
                expand="block"
                fill="outline"
                color="danger"
                onClick={() => onRemove(listing)}
              >
                <IonIcon slot="start" icon={trashOutline} />
                Remove
              </IonButton>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

export default UnitCard;
