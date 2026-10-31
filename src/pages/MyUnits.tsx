import React, { useState } from 'react';
import { IonButton, IonIcon, useIonRouter, useIonToast } from '@ionic/react';
import { addCircleOutline, arrowUndoOutline, createOutline, eyeOutline, trashOutline } from 'ionicons/icons';
import AppealListingModal from '../components/AppealListingModal';
import AppPage from '../components/AppPage';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useMarketplace } from '../context/MarketplaceContext';
import { confirmAction } from '../lib/sweetAlert';
import { listingsApi } from '../services/api';
import type { Listing } from '../types';
import { formatDate, formatPrice } from '../utils/format';
import './MyUnits.css';

/** "Manage" half of the Add/Manage flow — the units this account has posted. */
const MyUnits: React.FC = () => {
  const router = useIonRouter();
  const { user } = useAuth();
  const { revision, invalidate } = useMarketplace();
  const [present] = useIonToast();
  const [appealing, setAppealing] = useState<Listing | null>(null);

  const { data, loading, error, reload } = useAsync<Listing[]>(
    () => (user ? listingsApi.listBySeller(user.id) : Promise.resolve([])),
    [user?.id, revision]
  );

  // Removed units are excluded from listBySeller above on purpose — shown
  // separately here so the seller can still see why and appeal it.
  const { data: removedData, reload: reloadRemoved } = useAsync<Listing[]>(
    () => (user ? listingsApi.listRemovedBySeller(user.id) : Promise.resolve([])),
    [user?.id, revision]
  );
  const removed = removedData ?? [];

  const remove = (listing: Listing) =>
    confirmAction({
      title: 'Remove this unit?',
      text: `${listing.brand} ${listing.model} will no longer appear in the marketplace.`,
      confirmText: 'Remove',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      void listingsApi.remove(listing.id).then(() => {
        invalidate();
        reload();
        void present({ message: 'Unit removed.', duration: 1800, position: 'top' });
      });
    });

  return (
    <AppPage
      title="My Units"
      eyebrow="Manage"
      actions={
        <IonButton onClick={() => router.push('/units/new', 'forward')} aria-label="List a unit">
          <IonIcon slot="icon-only" icon={addCircleOutline} />
        </IonButton>
      }
    >
      {loading && <LoadingRows rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && (data ?? []).length === 0 && (
        <EmptyState
          icon={addCircleOutline}
          title="You have not listed a unit yet"
          message="Post your motorcycle with photos, documents and condition notes — it takes about five minutes."
          actionLabel="List a unit"
          onAction={() => router.push('/units/new', 'forward')}
        />
      )}

      {!loading && !error && (data ?? []).length > 0 && (
        <>
          <div className="kez-stats my-units__stats" aria-label="Your units at a glance">
            {[
              ['Listed', (data ?? []).length],
              ['Available', (data ?? []).filter((l) => l.status === 'active').length],
              ['Reserved', (data ?? []).filter((l) => l.status === 'pending').length],
              ['Sold', (data ?? []).filter((l) => l.status === 'sold').length],
            ].map(([label, value]) => (
              <div key={label} className="kez-tile kez-stat">
                <span className="kez-stat__label">{label}</span>
                <span className="kez-stat__value">{value}</span>
              </div>
            ))}
          </div>
          <div className="kez-bento kez-bento--cards my-units">
            {(data ?? []).map((listing) => (
              <article className="kez-tile kez-tile--flush my-units__row" key={listing.id}>
                <img src={listing.photos[0]} alt="" className="my-units__thumb" />

                <div className="my-units__info">
                  <h3 className="kez-display">
                    {listing.brand} {listing.model}
                  </h3>
                  <p className="kez-muted">
                    {listing.year} · {listing.location} · posted {formatDate(listing.createdAt)}
                  </p>
                  <div className="my-units__tags">
                    <span className={`kez-chip kez-chip--${listing.status === 'active' ? 'success' : listing.status === 'pending' ? 'warning' : ''}`}>
                      {listing.status === 'active'
                        ? 'Available'
                        : listing.status === 'pending'
                          ? 'Reserved'
                          : 'Sold'}
                    </span>
                    {listing.adminAssisted && <span className="kez-chip kez-chip--accent">Assisted</span>}
                    <span className="kez-chip">{listing.photos.length} photos</span>
                  </div>
                </div>

                <p className="my-units__price">{formatPrice(listing.price)}</p>

                <div className="my-units__actions">
                  <IonButton
                    size="small"
                    fill="clear"
                    color="primary"
                    onClick={() => router.push(`/listing/${listing.id}`, 'forward')}
                  >
                    <IonIcon slot="start" icon={eyeOutline} />
                    View
                  </IonButton>
                  <IonButton
                    size="small"
                    fill="clear"
                    color="primary"
                    onClick={() => router.push(`/units/${listing.id}/edit`, 'forward')}
                  >
                    <IonIcon slot="start" icon={createOutline} />
                    Edit
                  </IonButton>
                  <IonButton size="small" fill="clear" color="danger" onClick={() => remove(listing)}>
                    <IonIcon slot="start" icon={trashOutline} />
                    Remove
                  </IonButton>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {removed.length > 0 && (
        <>
          <h2 className="kez-display my-units__removed-head">Removed</h2>
          <div className="kez-bento kez-bento--cards my-units my-units--removed">
            {removed.map((listing) => (
              <article className="kez-tile kez-tile--flush my-units__row" key={listing.id}>
                <img src={listing.photos[0]} alt="" className="my-units__thumb" />

                <div className="my-units__info">
                  <h3 className="kez-display">
                    {listing.brand} {listing.model}
                  </h3>
                  <p className="kez-muted">
                    {listing.year} · {listing.location} · posted {formatDate(listing.createdAt)}
                  </p>
                  <div className="my-units__tags">
                    <span className="kez-chip kez-chip--danger">Removed</span>
                  </div>
                </div>

                <div className="my-units__actions">
                  <IonButton size="small" fill="outline" onClick={() => setAppealing(listing)}>
                    <IonIcon slot="start" icon={arrowUndoOutline} />
                    Appeal
                  </IonButton>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {appealing && (
        <AppealListingModal
          isOpen
          listing={appealing}
          onClose={() => setAppealing(null)}
          onFiled={reloadRemoved}
        />
      )}
    </AppPage>
  );
};

export default MyUnits;
