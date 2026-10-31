import React, { useMemo } from 'react';
import { useIonRouter, useIonToast } from '@ionic/react';
import { heartOutline } from 'ionicons/icons';
import AppPage from '../components/AppPage';
import UnitGrid from '../components/UnitGrid';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { DEFAULT_ENQUIRY, useMarketplace } from '../context/MarketplaceContext';
import { listingsApi } from '../services/api';
import type { Listing } from '../types';

/** Saved units. The heart on any unit card writes to the same store. */
const Favorites: React.FC = () => {
  const router = useIonRouter();
  const [present] = useIonToast();
  const { favoriteIds, isFavorite, toggleFavorite, startThreadForListing, revision } = useMarketplace();
  const { data, loading, error, reload } = useAsync<Listing[]>(() => listingsApi.list(), [revision]);

  const saved = useMemo(
    () => (data ?? []).filter((listing) => favoriteIds.includes(listing.id)),
    [data, favoriteIds]
  );

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

  return (
    <AppPage title="Saved" eyebrow="Saved units">
      {loading && <LoadingState cards={3} label="Loading saved units" />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && saved.length === 0 && (
        <EmptyState
          icon={heartOutline}
          title="Nothing saved yet"
          message="Tap the heart on any unit to keep it here for later comparison."
          actionLabel="Browse units"
          onAction={() => router.push('/home', 'none', 'replace')}
        />
      )}

      {!loading && !error && saved.length > 0 && (
        <UnitGrid
          listings={saved}
          onView={(listing) => router.push(`/listing/${listing.id}`, 'forward')}
          onMessage={messageSeller}
          onToggleFavorite={(listing) => void toggleFavorite(listing.id)}
          isFavorite={(listing) => isFavorite(listing.id)}
        />
      )}
    </AppPage>
  );
};

export default Favorites;
