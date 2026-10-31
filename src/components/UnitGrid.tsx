import React from 'react';
import type { Listing } from '../types';
import UnitCard from './UnitCard';
import './UnitGrid.css';

interface UnitGridProps {
  listings: Listing[];
  onView: (listing: Listing) => void;
  onMessage?: (listing: Listing) => void;
  onToggleFavorite?: (listing: Listing) => void;
  isFavorite?: (listing: Listing) => boolean;
  isOwnListing?: (listing: Listing) => boolean;
  onRemove?: (listing: Listing) => void;
}

/**
 * Responsive card grid, capped at 5 columns. Columns come from the grid's
 * own width (a container query), not the viewport, so the docked sidebar,
 * browser zoom or a narrow window can never squeeze it (see UnitGrid.css).
 */
const UnitGrid: React.FC<UnitGridProps> = ({
  listings,
  onView,
  onMessage,
  onToggleFavorite,
  isFavorite,
  isOwnListing,
  onRemove,
}) => (
  <div className="unit-grid-wrap">
    <div className="unit-grid">
      {listings.map((listing) => (
        <div key={listing.id} className="unit-grid__col">
          <UnitCard
            listing={listing}
            onView={onView}
            onMessage={onMessage}
            onToggleFavorite={onToggleFavorite}
            isFavorite={isFavorite?.(listing) ?? false}
            isOwnListing={isOwnListing?.(listing) ?? false}
            onRemove={onRemove}
          />
        </div>
      ))}
    </div>
  </div>
);

export default UnitGrid;
