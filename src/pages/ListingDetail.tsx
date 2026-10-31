import React, { useEffect, useRef } from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { useIonRouter, useIonToast } from '@ionic/react';
import { useParams } from 'react-router-dom';
import {
  calendarOutline,
  chatbubbleEllipsesOutline,
  documentTextOutline,
  heart,
  heartOutline,
  locationOutline,
  personCircleOutline,
  pricetagOutline,
  shieldCheckmarkOutline,
  speedometerOutline,
} from 'ionicons/icons';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import PhotoGallery from '../components/PhotoGallery';
import ScoreBadges from '../components/ScoreBadges';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_ENQUIRY, useMarketplace } from '../context/MarketplaceContext';
import { listingsApi } from '../services/api';
import type { Listing, UnitDocument } from '../types';
import { formatDate, formatMileage, formatPrice } from '../utils/format';
import './ListingDetail.css';

const STATUS_COPY: Record<Listing['status'], { label: string; className: string }> = {
  active: { label: 'Available', className: 'kez-chip--success' },
  pending: { label: 'Reserved', className: 'kez-chip--warning' },
  sold: { label: 'Sold', className: '' },
  draft: { label: 'Draft', className: '' },
};

/** Read-only document preview with the seller's redactions burned on top. */
const RedactedDocument: React.FC<{ document: UnitDocument }> = ({ document }) => (
  <figure className="detail__doc">
    <div className="detail__doc-frame">
      <img src={document.imageUrl} alt={document.label} />
      {document.redactions.map((box) => (
        <span
          key={box.id}
          className="detail__doc-redaction"
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
          }}
        />
      ))}
    </div>
    <figcaption>
      <IonIcon icon={documentTextOutline} />
      {document.label}
    </figcaption>
  </figure>
);

const ListingDetail: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const router = useIonRouter();
  const [present] = useIonToast();
  const { isAuthenticated, user } = useAuth();
  const { isFavorite, toggleFavorite, startThreadForListing } = useMarketplace();
  const { data: listing, loading, error, reload } = useAsync<Listing>(
    () => listingsApi.getById(id),
    [id]
  );

  // The AI quality/condition scores land a few seconds (sometimes longer)
  // after the unit is first posted (see UnitForm.submit()) — poll quietly
  // until both are in so the "Scoring…" pills resolve on their own, instead
  // of staying stuck until the seller happens to refresh. Reads the latest
  // listing off a ref rather than depending on it directly, so the interval
  // is set up once per listing instead of re-arming on every poll tick.
  const listingRef = useRef(listing);
  listingRef.current = listing;

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 18; // ~90s at 5s each — past the Edge Functions' worst-case retry budget
    const timer = window.setInterval(() => {
      attempts += 1;
      const current = listingRef.current;
      if (current && current.listingQualityScore != null && current.conditionScore != null) {
        window.clearInterval(timer);
        return;
      }
      if (attempts >= maxAttempts) {
        window.clearInterval(timer);
        return;
      }
      reload({ silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [id, reload]);

  const messageSeller = async () => {
    if (!listing) return;
    if (!isAuthenticated) {
      router.push('/login', 'forward');
      return;
    }
    try {
      const thread = await startThreadForListing(listing);
      router.push(`/chat/${thread.id}?prefill=${encodeURIComponent(DEFAULT_ENQUIRY)}`, 'forward');
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not open that conversation.',
        duration: 2400,
        color: 'danger',
        position: 'top',
      });
    }
  };

  const title = listing ? `${listing.brand} ${listing.model}` : 'Unit details';
  const favorite = listing ? isFavorite(listing.id) : false;
  const isOwnListing = listing?.sellerId === user?.id;

  return (
    <AppPage
      title={title}
      backHref="/home"
      hideTabs={!isAuthenticated}
      actions={
        listing && isAuthenticated ? (
          <IonButton
            onClick={() => void toggleFavorite(listing.id)}
            aria-label={favorite ? 'Remove from favorites' : 'Save to favorites'}
          >
            <IonIcon slot="icon-only" icon={favorite ? heart : heartOutline} color={favorite ? 'danger' : undefined} />
          </IonButton>
        ) : undefined
      }
      footer={
        listing && !isOwnListing ? (
          <div className="detail__stickybar kez-hide-desktop">
            <div className="detail__stickybar-price">
              <span>Asking price</span>
              <strong>{formatPrice(listing.price)}</strong>
            </div>
            <IonButton className="kez-cta" onClick={messageSeller}>
              <IonIcon slot="start" icon={chatbubbleEllipsesOutline} />
              Message Seller
            </IonButton>
          </div>
        ) : undefined
      }
    >
      {loading && <LoadingState variant="detail" label="Loading unit" />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && listing && (
        <div className="kez-bento detail">
          <div className="kez-tile kez-tile--flush kez-tile--w3 kez-tile--h2 detail__gallery">
            <PhotoGallery photos={listing.photos} alt={`${title} ${listing.year}`} />
          </div>

          {/* Summary tile beside the gallery — tablet/desktop only */}
          <aside className="kez-tile kez-tile--h2 detail__aside kez-hide-mobile">
            <div className="detail__summary">
              <p className="detail__summary-label">Asking price</p>
              <p className="detail__price">{formatPrice(listing.price)}</p>

              <ul className="detail__summary-meta">
                <li>
                  <IonIcon icon={locationOutline} />
                  {listing.location}
                </li>
                <li>
                  <IonIcon icon={speedometerOutline} />
                  {formatMileage(listing.mileageKm)}
                </li>
              </ul>

              <button
                type="button"
                className="detail__seller"
                onClick={() => router.push(`/profile/${listing.sellerId}`, 'forward')}
              >
                <Avatar name={listing.sellerName} />
                <div>
                  <strong>{listing.sellerName}</strong>
                  <span>Seller · View profile</span>
                </div>
              </button>

              {!isOwnListing && (
                <IonButton expand="block" className="kez-cta" onClick={messageSeller}>
                  <IonIcon slot="start" icon={chatbubbleEllipsesOutline} />
                  Message Seller
                </IonButton>
              )}

              {isAuthenticated && (
                <IonButton
                  expand="block"
                  fill="outline"
                  color={favorite ? 'danger' : 'primary'}
                  onClick={() => void toggleFavorite(listing.id)}
                >
                  <IonIcon slot="start" icon={favorite ? heart : heartOutline} />
                  {favorite ? 'Saved' : 'Save to favorites'}
                </IonButton>
              )}

              {!isOwnListing && (
                <p className="detail__summary-note">
                  Tapping message opens a thread pre-filled with “{DEFAULT_ENQUIRY}”.
                </p>
              )}
            </div>
          </aside>

          <section className="kez-tile kez-tile--w2 detail__intro">
            <div className="detail__chips">
              <span className={`kez-chip ${STATUS_COPY[listing.status].className}`}>
                {STATUS_COPY[listing.status].label}
              </span>
              {listing.adminAssisted && (
                <span className="kez-chip kez-chip--accent">
                  <IonIcon icon={shieldCheckmarkOutline} />
                  Admin-assisted deal
                </span>
              )}
              <span className="kez-chip">
                <IonIcon icon={calendarOutline} />
                Posted {formatDate(listing.createdAt)}
              </span>
            </div>

            <h1 className="kez-display detail__title">
              {title} <span>{listing.year}</span>
            </h1>
            <p className="detail__price kez-hide-desktop">{formatPrice(listing.price)}</p>
            <p className="kez-body">{listing.description}</p>
          </section>

          <section className="kez-tile kez-tile--w2 detail__section">
            <h2 className="kez-display">Specifications</h2>
            <dl className="detail__specs">
              <div>
                <dt><IonIcon icon={pricetagOutline} /> Brand</dt>
                <dd>{listing.brand}</dd>
              </div>
              <div>
                <dt><IonIcon icon={pricetagOutline} /> Model</dt>
                <dd>{listing.model}</dd>
              </div>
              <div>
                <dt><IonIcon icon={calendarOutline} /> Year model</dt>
                <dd>{listing.year}</dd>
              </div>
              <div>
                <dt><IonIcon icon={speedometerOutline} /> Mileage</dt>
                <dd>{formatMileage(listing.mileageKm)}</dd>
              </div>
              <div>
                <dt><IonIcon icon={locationOutline} /> Location</dt>
                <dd>{listing.location}</dd>
              </div>
              <div>
                <dt><IonIcon icon={personCircleOutline} /> Seller</dt>
                <dd>
                  <button
                    type="button"
                    className="detail__seller-link"
                    onClick={() => router.push(`/profile/${listing.sellerId}`, 'forward')}
                  >
                    {listing.sellerName}
                  </button>
                </dd>
              </div>
            </dl>
          </section>

          <section className="kez-tile kez-tile--w2 detail__section">
            <h2 className="kez-display">Condition</h2>
            <div className="detail__condition">
              {[
                ['Engine noise', listing.condition.engineNoise],
                ['Brakes', listing.condition.brakes],
                ['Tires', listing.condition.tires],
                ['Lights', listing.condition.lights],
              ].map(([label, value]) => (
                <div className="detail__condition-item" key={label}>
                  <span className="detail__condition-label">{label}</span>
                  <p className="kez-body">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="kez-tile kez-tile--w2 detail__section">
            <h2 className="kez-display">Reason for sale</h2>
            <p className="kez-body">{listing.reasonForSale}</p>
          </section>

          <section className="kez-tile kez-tile--w2 detail__section">
            <h2 className="kez-display">Documents</h2>
            <p className="kez-muted detail__doc-note">
              Shown as uploaded by the seller. Private details are blacked out with the redaction
              tool before posting.
            </p>
            <div className="detail__docs">
              {listing.documents.map((document) => (
                <RedactedDocument key={document.id} document={document} />
              ))}
            </div>
          </section>

          <section className="kez-tile kez-tile--w2 detail__section">
            <h2 className="kez-display">AI assessment</h2>
            <p className="kez-muted detail__doc-note">
              Automated, not a physical inspection — see the condition score's own note below.
            </p>
            <ScoreBadges listing={listing} />
          </section>
        </div>
      )}
    </AppPage>
  );
};

export default ListingDetail;
