import React from 'react';
import { IonIcon } from '@ionic/react';
import { heart, heartOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import type { Listing } from '../types';
import Avatar from './Avatar';
import { avatarColorFor } from '../services/mappers';
import { formatMileage, formatPrice, formatRelative } from '../utils/format';
import './MarketCard.css';

interface MarketCardProps {
  listing: Listing;
  onView: (listing: Listing) => void;
  onToggleFavorite: (listing: Listing) => void;
  isFavorite?: boolean;
}

/**
 * Marketplace-style listing tile for the public landing page: seller and
 * posting time on top, a square photo, then title, price and specs.
 * Signed-in screens keep using UnitCard.
 */
const MarketCard: React.FC<MarketCardProps> = ({ listing, onView, onToggleFavorite, isFavorite = false }) => {
  const title = `${listing.brand} ${listing.model}`;

  return (
    <article className="market-card">
      <div className="market-card__seller">
        <Avatar name={listing.sellerName} color={avatarColorFor(listing.sellerId)} size="sm" />
        <div className="market-card__seller-text">
          <strong>{listing.sellerName}</strong>
          <span>{formatRelative(listing.createdAt)}</span>
        </div>
      </div>

      <button
        type="button"
        className="market-card__media"
        onClick={() => onView(listing)}
        aria-label={`View ${title} ${listing.year}`}
      >
        <img src={listing.photos[0]} alt="" loading="lazy" />
        {listing.adminAssisted && (
          <span className="market-card__badge">
            <IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" />
            Assisted
          </span>
        )}
      </button>

      <button type="button" className="market-card__body" onClick={() => onView(listing)}>
        <span className="market-card__title">{title}</span>
        <span className="market-card__price">{formatPrice(listing.price)}</span>
        <span className="market-card__specs">
          {listing.year} · {formatMileage(listing.mileageKm)}
        </span>
        <span className="market-card__location">{listing.location}</span>
      </button>

      <div className="market-card__foot">
        <span className="market-card__condition">Second-hand · Available</span>
        <button
          type="button"
          className={`market-card__like${isFavorite ? ' is-active' : ''}`}
          onClick={() => onToggleFavorite(listing)}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Remove ${title} from favorites` : `Save ${title} to favorites`}
        >
          <IonIcon icon={isFavorite ? heart : heartOutline} />
        </button>
      </div>
    </article>
  );
};

export default MarketCard;
