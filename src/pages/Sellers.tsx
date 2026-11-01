import React, { useMemo, useState } from 'react';
import { IonButton, IonIcon, IonSearchbar, useIonRouter, useIonToast } from '@ionic/react';
import { bookmarkOutline, chatbubbleEllipsesOutline, peopleOutline } from 'ionicons/icons';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { chatsApi, listingsApi, usersApi } from '../services/api';
import type { ManagedUser } from '../types';
import { formatDate } from '../utils/format';
import './Sellers.css';

/** Every customer who has posted at least one unit, with View Units for
    everyone and an extra general-outreach Message button for admins -
    a separate page from Manage Users, which keeps its own Disable/Enable
    focus untouched. */
const Sellers: React.FC = () => {
  const router = useIonRouter();
  const [present] = useIonToast();
  const { isAdmin } = useAuth();
  const { data, loading: usersLoading, error, reload } = useAsync<ManagedUser[]>(() => usersApi.listAll(), []);
  const { data: sellerIds, loading: sellerIdsLoading } = useAsync<string[]>(
    () => listingsApi.listSellerIdsWithUnits(),
    []
  );
  const loading = usersLoading || sellerIdsLoading;
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const withUnits = new Set(sellerIds ?? []);
    return (data ?? []).filter(({ user }) => {
      if (user.role === 'admin') return false;
      if (!withUnits.has(user.id)) return false;
      if (!needle) return true;
      return [user.name, user.phone, user.location].join(' ').toLowerCase().includes(needle);
    });
  }, [data, sellerIds, query]);

  const message = async (sellerId: string) => {
    setBusyId(sellerId);
    try {
      const thread = await chatsApi.openAdminThreadWithSeller(sellerId);
      router.push(`/chat/${thread.id}`, 'forward');
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not open that conversation.',
        duration: 2400,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppPage title="Sellers" eyebrow={isAdmin ? 'Admin' : undefined}>
      <IonSearchbar
        className="kez-tile sellers__search"
        value={query}
        placeholder="Search name, phone or location"
        onIonInput={(e) => setQuery(String(e.detail.value ?? ''))}
        debounce={120}
      />

      {loading && <LoadingRows rows={5} />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          icon={peopleOutline}
          title="No sellers found"
          message={query ? 'Try a different search.' : 'No customer has posted a unit yet.'}
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <ul className="kez-bento kez-bento--cards sellers">
          {rows.map(({ user }) => (
            <li key={user.id} className="kez-tile sellers__row">
              <button
                type="button"
                className="sellers__who"
                onClick={() => router.push(`/profile/${user.id}`, 'forward')}
              >
                <Avatar name={user.name} color={user.avatarColor} imageUrl={user.avatarUrl} size="sm" />
                <div>
                  <strong>{user.name}</strong>
                  <span className="kez-muted">joined {formatDate(user.memberSince)}</span>
                </div>
              </button>

              <div className="sellers__actions">
                {isAdmin && (
                  <IonButton
                    size="small"
                    fill="outline"
                    disabled={busyId === user.id}
                    onClick={() => void message(user.id)}
                  >
                    <IonIcon slot="start" icon={chatbubbleEllipsesOutline} />
                    Message
                  </IonButton>
                )}
                <IonButton size="small" onClick={() => router.push(`/sellers/${user.id}/units`, 'forward')}>
                  <IonIcon slot="start" icon={bookmarkOutline} />
                  View Units
                </IonButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppPage>
  );
};

export default Sellers;
