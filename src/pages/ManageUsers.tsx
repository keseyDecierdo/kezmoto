import React, { useMemo, useState } from 'react';
import { IonButton, IonIcon, IonSearchbar, useIonRouter, useIonToast } from '@ionic/react';
import {
  ban,
  banOutline,
  checkmarkCircleOutline,
  peopleOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import AdminHero from '../components/AdminHero';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { confirmAction } from '../lib/sweetAlert';
import { usersApi } from '../services/api';
import type { ManagedUser } from '../types';
import { formatDate } from '../utils/format';
import './ManageUsers.css';

type StatusFilter = 'all' | 'active' | 'disabled';

/** Admin-only: every account, with the disable / enable switch. */
const ManageUsers: React.FC = () => {
  const router = useIonRouter();
  const [present] = useIonToast();
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useAsync<ManagedUser[]>(() => usersApi.listAll(), []);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data ?? []).filter(({ user }) => {
      if (status === 'active' && user.isDisabled) return false;
      if (status === 'disabled' && !user.isDisabled) return false;
      if (!needle) return true;
      return [user.name, user.phone, user.location].join(' ').toLowerCase().includes(needle);
    });
  }, [data, query, status]);

  const toast = (message: string, color: 'success' | 'danger') =>
    present({ message, duration: 2200, color, position: 'top' });

  const toggle = async ({ user }: ManagedUser) => {
    const disabling = !user.isDisabled;
    if (disabling) {
      const confirmed = await confirmAction({
        title: `Disable ${user.name}?`,
        text: 'They will be signed out and unable to sign in or post until you enable the account again.',
        confirmText: 'Disable account',
        danger: true,
      });
      if (!confirmed) return;
    }
    setBusyId(user.id);
    try {
      await usersApi.setDisabled(user.id, disabling, disabling ? 'Disabled by a KEZMOTO admin.' : '');
      reload();
      await toast(disabling ? 'Account disabled.' : 'Account enabled.', 'success');
    } catch (err) {
      await toast(err instanceof Error ? err.message : 'Could not update that account.', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppPage title="Manage Users">
      <AdminHero
        title="Manage Users"
        description="Every account on KEZMOTO. Disable an account to block it from logging in; enable it again any time."
        loading={loading && !data}
        stats={[
          { label: 'All accounts', value: (data ?? []).length, icon: peopleOutline },
          { label: 'Active', value: (data ?? []).filter((r) => !r.user.isDisabled).length, icon: checkmarkCircleOutline },
          { label: 'Disabled', value: (data ?? []).filter((r) => r.user.isDisabled).length, icon: ban },
          { label: 'ID verified', value: (data ?? []).filter((r) => r.user.verified).length, icon: shieldCheckmarkOutline },
        ]}
      />
      <IonSearchbar
        className="kez-tile manage-users__search"
        value={query}
        placeholder="Search name, phone or location"
        onIonInput={(e) => setQuery(String(e.detail.value ?? ''))}
        debounce={120}
      />
      <div className="kez-tile manage-users__filters" role="group" aria-label="Filter by status">
        {(['all', 'active', 'disabled'] as StatusFilter[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`kez-chip${status === item ? ' kez-chip--accent' : ''}`}
            onClick={() => setStatus(item)}
          >
            {item === 'all' ? 'All accounts' : item === 'active' ? 'Active' : 'Disabled'}
          </button>
        ))}
      </div>

      {loading && <LoadingRows rows={5} />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && rows.length === 0 && (
        <EmptyState icon={peopleOutline} title="No users found" message="Try a different search or filter." />
      )}

      {!loading && !error && rows.length > 0 && (
        <ul className="kez-bento kez-bento--cards manage-users">
          {rows.map((row) => {
            const { user, reportCount } = row;
            const isAdminAccount = user.role === 'admin';
            return (
              <li key={user.id} className="kez-tile manage-users__row">
                <button
                  type="button"
                  className="manage-users__who"
                  onClick={() => router.push(`/profile/${user.id}`, 'forward')}
                >
                  <Avatar name={user.name} color={user.avatarColor} imageUrl={user.avatarUrl} size="sm" />
                  <div>
                    <strong>{user.name}</strong>
                    <span className="kez-muted">
                      {isAdminAccount ? 'KEZMOTO admin' : 'Customer'} · joined {formatDate(user.memberSince)}
                    </span>
                  </div>
                </button>

                <div className="manage-users__chips">
                  {user.verified && <span className="kez-chip kez-chip--success">Verified</span>}
                  {reportCount > 0 && (
                    <span className="kez-chip kez-chip--warning">
                      {reportCount} report{reportCount === 1 ? '' : 's'}
                    </span>
                  )}
                  <span className={`kez-chip ${user.isDisabled ? 'kez-chip--danger' : 'kez-chip--success'}`}>
                    {user.isDisabled ? 'Disabled' : 'Active'}
                  </span>
                </div>

                {!isAdminAccount && user.id !== me?.id && (
                  <IonButton
                    size="small"
                    color={user.isDisabled ? 'primary' : 'danger'}
                    fill={user.isDisabled ? 'solid' : 'outline'}
                    disabled={busyId === user.id}
                    onClick={() => void toggle(row)}
                  >
                    <IonIcon slot="start" icon={user.isDisabled ? checkmarkCircleOutline : banOutline} />
                    {user.isDisabled ? 'Enable' : 'Disable'}
                  </IonButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AppPage>
  );
};

export default ManageUsers;
