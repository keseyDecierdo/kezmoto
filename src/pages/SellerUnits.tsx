import React, { useState } from 'react';
import { useIonRouter, useIonToast } from '@ionic/react';
import { useParams } from 'react-router-dom';
import AppPage from '../components/AppPage';
import RemoveListingModal from '../components/RemoveListingModal';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import UnitGrid from '../components/UnitGrid';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { chatsApi, listingsApi, usersApi } from '../services/api';
import { bookmarkOutline } from 'ionicons/icons';
import type { Listing, User } from '../types';

/** One seller's posted units, as the same cards Home uses. Everyone gets
    View Details + Send Message (a customer gets the normal buyer flow;
    an admin gets an admin-safe outreach thread, never a fake buyer). Remove
    is admin-only. */
const SellerUnits: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const router = useIonRouter();
  const [present] = useIonToast();
  const { isAdmin, user: viewer } = useAuth();
  const { data: seller } = useAsync<User | null>(() => usersApi.getById(id), [id]);
  const { data, loading, error, reload } = useAsync<Listing[]>(() => listingsApi.listBySeller(id), [id]);
  const [removing, setRemoving] = useState<Listing | null>(null);

  const onView = (listing: Listing) => router.push(`/listing/${listing.id}`, 'forward');

  const onMessage = async (listing: Listing) => {
    try {
      const thread = isAdmin
        ? await chatsApi.openAdminThreadWithSeller(id, listing.id)
        : await chatsApi.openThreadForListing(listing);
      router.push(`/chat/${thread.id}`, 'forward');
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
    <AppPage
      title={seller ? `${seller.name}'s Units` : 'Units'}
      backHref="/sellers"
      eyebrow={isAdmin ? 'Admin' : undefined}
    >
      {loading && <LoadingState cards={5} label="Loading units" />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && (data ?? []).length === 0 && (
        <EmptyState icon={bookmarkOutline} title="No units posted" message="This seller has no active listings." />
      )}

      {!loading && !error && (data ?? []).length > 0 && (
        <UnitGrid
          listings={data ?? []}
          onView={onView}
          onMessage={onMessage}
          onRemove={isAdmin ? setRemoving : undefined}
          isOwnListing={(listing) => !isAdmin && listing.sellerId === viewer?.id}
        />
      )}

      {removing && (
        <RemoveListingModal
          isOpen
          listing={removing}
          onClose={() => setRemoving(null)}
          onRemoved={reload}
        />
      )}
    </AppPage>
  );
};

export default SellerUnits;
