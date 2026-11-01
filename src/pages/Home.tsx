import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  IonButton,
  IonIcon,
  IonSearchbar,
  useIonRouter,
  useIonToast,
  useIonViewWillEnter,
} from '@ionic/react';
import {
  addCircleOutline,
  addOutline,
  checkmarkCircleOutline,
  cubeOutline,
  optionsOutline,
  pricetagOutline,
  shieldCheckmarkOutline,
  timeOutline,
} from 'ionicons/icons';
import AppPage from '../components/AppPage';
import UnitGrid from '../components/UnitGrid';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_ENQUIRY, useMarketplace } from '../context/MarketplaceContext';
import { listingsApi } from '../services/api';
import type { Listing } from '../types';
import { searchListings } from '../utils/budgetSearch';
import { formatPrice, greetingFor } from '../utils/format';
import './Home.css';

type StatusFilter = 'all' | 'active' | 'pending' | 'sold';

/** Units posted within this window may still be waiting on their AI scores. */
const SCORING_WINDOW_MS = 10 * 60 * 1000;

const awaitingScores = (listing: Listing): boolean =>
  (listing.listingQualityScore == null || listing.conditionScore == null) &&
  Date.now() - new Date(listing.createdAt).getTime() < SCORING_WINDOW_MS;

/**
 * The portal both roles land on after login. Admin sees the same card grid -
 * there is no separate dashboard - plus a middleman banner.
 */
const Home: React.FC = () => {
  const router = useIonRouter();
  const [present] = useIonToast();
  const { user, isAdmin } = useAuth();
  const { isFavorite, toggleFavorite, startThreadForListing, revision } = useMarketplace();
  const { data, loading, error, reload } = useAsync<Listing[]>(() => listingsApi.list(), [revision]);

  // Ionic keeps Home mounted while the user is on a unit's detail page, so
  // coming back would otherwise show the rows as they were first fetched -
  // before the AI scores landed. Refresh quietly on every return (the first
  // enter is skipped; useAsync already loads on mount) and re-arm the poll.
  const [pollKey, setPollKey] = useState(0);
  const enteredOnce = useRef(false);
  useIonViewWillEnter(() => {
    if (!enteredOnce.current) {
      enteredOnce.current = true;
      return;
    }
    reload({ silent: true });
    setPollKey((k) => k + 1);
  });

  // Same idea as ListingDetail: the quality/condition scores arrive a few
  // seconds after a unit is posted, so poll quietly while any recently posted
  // unit is still unscored. Older unscored units don't keep it running.
  const listingsRef = useRef(data);
  listingsRef.current = data;

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 18; // ~90s at 5s each - matches ListingDetail's budget
    const timer = window.setInterval(() => {
      attempts += 1;
      const current = listingsRef.current;
      if ((current && !current.some(awaitingScores)) || attempts >= maxAttempts) {
        window.clearInterval(timer);
        return;
      }
      reload({ silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [revision, pollKey, reload]);

  // Re-checked every minute so the greeting flips (morning → afternoon →
  // evening) without a reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const greeting = greetingFor(now);

  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  // Brands are matched case-insensitively ("Yamaha" and "yamaha" are one
  // chip); the first spelling seen is the one shown.
  const brands = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const l of data ?? []) {
      const name = l.brand.trim();
      if (!byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
    }
    return ['all', ...[...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
  }, [data]);

  const { listings, budget } = useMemo(() => {
    const filtered = (data ?? []).filter(
      (listing) =>
        (brand === 'all' || listing.brand.trim().toLowerCase() === brand.toLowerCase()) &&
        (status === 'all' || listing.status === status)
    );
    return searchListings(filtered, query);
  }, [data, query, brand, status]);

  const openUnit = (listing: Listing) => router.push(`/listing/${listing.id}`, 'forward');

  const messageSeller = async (listing: Listing) => {
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

  const filtersActive = query.trim() !== '' || brand !== 'all' || status !== 'all';

  const stats = useMemo(() => {
    const all = data ?? [];
    const count = (s: Listing['status']) => all.filter((l) => l.status === s).length;
    return [
      { label: 'Units listed', value: all.length, icon: cubeOutline },
      { label: 'Available', value: count('active'), icon: checkmarkCircleOutline },
      { label: 'Reserved', value: count('pending'), icon: timeOutline },
      { label: 'Sold', value: count('sold'), icon: pricetagOutline },
    ];
  }, [data]);

  return (
    <AppPage
      title="KEZMOTO"
      actions={
        <IonButton onClick={() => router.push('/units/new', 'forward')} aria-label="List a unit">
          <IonIcon slot="icon-only" icon={addCircleOutline} />
        </IonButton>
      }
    >
      <div className="kez-bento home__bento">
        <header className="kez-tile kez-tile--hero kez-tile--full home__head">
          <div className="home__head-copy">
            <p className="kez-eyebrow">{isAdmin ? 'Admin portal' : 'Marketplace'}</p>
            <h1 className="kez-display home__greeting">
              {!user ? 'Browse units' : `${greeting}, ${isAdmin ? 'Admin' : user.name.split(' ')[0]}`}
            </h1>
            <p className="kez-muted">
              {isAdmin
                ? 'The same portal your customers see - plus the middleman tools in the menu.'
                : 'Every unit here is posted by the person who owns it.'}
            </p>
          </div>
          <IonButton className="kez-cta home__sell" onClick={() => router.push('/units/new', 'forward')}>
            <IonIcon slot="start" icon={addOutline} />
            List a unit
          </IonButton>
        </header>

        <div className="kez-tile--full kez-stats" aria-label="Marketplace at a glance">
          {stats.map((stat) => (
            <div key={stat.label} className="kez-tile kez-stat home__stat">
              <span className="kez-stat__label">{stat.label}</span>
              {loading && !data ? (
                <span className="kez-skeleton kez-skeleton--line kez-stat__skeleton" aria-hidden="true" />
              ) : (
                <span className="kez-stat__value">{stat.value}</span>
              )}
              <span className="kez-stat__icon" aria-hidden="true">
                <IonIcon icon={stat.icon} />
              </span>
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="kez-tile kez-tile--warning kez-tile--full home__admin-banner">
            <IonIcon icon={shieldCheckmarkOutline} />
            <div>
              <strong>Signed in as platform admin.</strong>
              <span> Middleman queue, verification and reports arrive in a later phase.</span>
            </div>
          </div>
        )}

        <div className="kez-tile kez-tile--full home__filters">
          <IonSearchbar
            className="home__search"
            value={query}
            placeholder="Search brand, model, city or budget (e.g. 45000)"
            onIonInput={(e) => setQuery(String(e.detail.value ?? ''))}
            debounce={120}
          />

          <div className="home__chiprow" role="group" aria-label="Filter by brand">
            <span className="home__chiplabel">
              <IonIcon icon={optionsOutline} />
            </span>
            {brands.map((item) => (
              <button
                key={item}
                type="button"
                className={`kez-chip${brand === item ? ' kez-chip--accent' : ''}`}
                onClick={() => setBrand(item)}
              >
                {item === 'all' ? 'All brands' : item}
              </button>
            ))}
          </div>

          <div className="home__chiprow" role="group" aria-label="Filter by status">
            {(['all', 'active', 'pending', 'sold'] as StatusFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`kez-chip${status === item ? ' kez-chip--accent' : ''}`}
                onClick={() => setStatus(item)}
              >
                {item === 'all' ? 'Any status' : item === 'active' ? 'Available' : item === 'pending' ? 'Reserved' : 'Sold'}
              </button>
            ))}
          </div>
        </div>

        <section className="kez-tile kez-tile--plain kez-tile--full home__results">
          {loading && <LoadingState cards={6} label="Loading units" />}

          {!loading && error && <ErrorState message={error} onRetry={reload} />}

          {!loading && !error && listings.length === 0 && (
            <EmptyState
              icon={addCircleOutline}
              title={filtersActive ? 'No units match those filters' : 'No units listed yet'}
              message={
                filtersActive
                  ? 'Try a different brand, status or search term.'
                  : 'Once sellers start posting, their units show up here. You can be the first.'
              }
              actionLabel={filtersActive ? 'Clear filters' : 'List a unit'}
              onAction={
                filtersActive
                  ? () => {
                      setQuery('');
                      setBrand('all');
                      setStatus('all');
                    }
                  : () => router.push('/units/new', 'forward')
              }
            />
          )}

          {!loading && !error && listings.length > 0 && (
            <>
              <p className="home__count kez-muted">
                {listings.length} unit{listings.length === 1 ? '' : 's'}
                {budget !== null && ` · closest to ${formatPrice(budget)}`}
              </p>
              <UnitGrid
                listings={listings}
                onView={openUnit}
                onMessage={messageSeller}
                onToggleFavorite={(listing) => void toggleFavorite(listing.id)}
                isFavorite={(listing) => isFavorite(listing.id)}
                isOwnListing={(listing) => listing.sellerId === user?.id}
              />
            </>
          )}
        </section>
      </div>
    </AppPage>
  );
};

export default Home;
