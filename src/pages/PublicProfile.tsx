import React, { useEffect } from 'react';
import { IonButton, IonIcon, useIonRouter } from '@ionic/react';
import { useParams } from 'react-router-dom';
import { bookmarkOutline, calendarOutline, logoFacebook, shieldCheckmarkOutline } from 'ionicons/icons';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../services/api';
import type { User } from '../types';
import { formatDate } from '../utils/format';
import './PublicProfile.css';
import ProBadge from '../components/ProBadge';

/**
 * Read-only "who am I dealing with" card - reached from a seller's name on
 * a listing, a chat counterparty, or an assigned middleman. Deliberately
 * shows only what builds trust without exposing anything sensitive: name,
 * role, the ID-verified badge, member-since, bio and an optional Facebook
 * link. It never shows the raw ID photo or `idVerificationNote` (that note
 * can name the *other* person on a mismatched ID and is owner-only -
 * Profile.tsx is the only screen that renders it).
 */
const PublicProfile: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const router = useIonRouter();
  const { user: viewer } = useAuth();
  const { data: profile, loading, error, reload } = useAsync<User | null>(
    () => usersApi.getById(id),
    [id]
  );

  const isSelf = viewer?.id === id;

  useEffect(() => {
    if (isSelf) router.push('/profile', 'root', 'replace');
  }, [isSelf, router]);

  if (isSelf) return null;

  return (
    <AppPage title={profile?.name ?? 'Profile'} backHref="/home">
      {loading && <LoadingState variant="profile" label="Loading profile" />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && !profile && (
        <ErrorState message="That profile could not be found." onRetry={reload} />
      )}

      {!loading && !error && profile && (
        <div className="kez-bento public-profile__bento">
          <section className="kez-tile kez-tile--w2 public-profile">
            <Avatar
              name={profile.name}
              color={profile.avatarColor}
              imageUrl={profile.avatarUrl}
              size="lg"
              verified={profile.verified}
            />
            <h1 className="kez-display">
              {profile.name}
              <ProBadge proUntil={profile.proUntil} />
            </h1>

            <div className="public-profile__chips">
              <span className={`kez-chip ${profile.role === 'admin' ? 'kez-chip--warning' : 'kez-chip--accent'}`}>
                {profile.role === 'admin' ? 'Admin · Middleman' : 'Customer'}
              </span>
              <span className={`kez-chip ${profile.verified ? 'kez-chip--success' : ''}`}>
                <IonIcon icon={shieldCheckmarkOutline} />
                {profile.verified ? 'ID Verified' : 'Not ID verified'}
              </span>
            </div>

            <ul className="public-profile__facts">
              <li>
                <IonIcon icon={calendarOutline} />
                Member since {formatDate(profile.memberSince)}
              </li>
              {profile.facebook && (
                <li>
                  <IonIcon icon={logoFacebook} />
                  <a href={profile.facebook} target="_blank" rel="noreferrer">
                    Facebook profile
                  </a>
                </li>
              )}
            </ul>

            <IonButton
              fill="outline"
              className="public-profile__units"
              onClick={() => router.push(`/sellers/${profile.id}/units`, 'forward')}
            >
              <IonIcon slot="start" icon={bookmarkOutline} />
              View units
            </IonButton>

          </section>

          <section className="kez-tile kez-tile--w2 public-profile__bio">
            <h2 className="kez-display">About</h2>
            <p className="kez-body">
              {profile.bio || `${profile.name} has not written a bio yet.`}
            </p>
          </section>
        </div>
      )}
    </AppPage>
  );
};

export default PublicProfile;
