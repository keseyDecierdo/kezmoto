import React, { useEffect, useRef } from 'react';
import { IonButton, IonIcon, useIonRouter, useIonToast, useIonViewWillEnter } from '@ionic/react';
import {
  chatbubblesOutline,
  hourglassOutline,
  personOutline,
  pricetagOutline,
  refreshOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import AdminHero from '../components/AdminHero';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { transactionsApi } from '../services/api';
import type { Transaction } from '../types';
import { TRANSACTION_STATUS_LABEL } from '../types';
import { formatPrice, formatRelative } from '../utils/format';
import './Middleman.css';

/** How often the open queue re-checks for new requests. */
const POLL_MS = 15_000;

/** "Agreed ₱2,500" / "Offer ₱3,000 pending" / "No price yet". */
const priceLine = (tx: Transaction): { text: string; agreed: boolean } => {
  if (tx.agreedPrice != null) return { text: `Agreed ${formatPrice(tx.agreedPrice)}`, agreed: true };
  if (tx.proposedPrice != null) return { text: `Offer ${formatPrice(tx.proposedPrice)} pending`, agreed: false };
  return { text: 'No price agreed yet', agreed: false };
};

/**
 * Admin queue: unclaimed middleman requests, plus deals already assigned to
 * this admin that are not yet resolved. Joining hands the admin a seat in
 * the chat (Phase 2's ChatPanel, reused as-is) and opens the transaction.
 */
const Middleman: React.FC = () => {
  const router = useIonRouter();
  const { user } = useAuth();
  const [present] = useIonToast();
  const { data, loading, error, reload } = useAsync<Transaction[]>(
    () => transactionsApi.listMiddlemanQueue(),
    []
  );

  // Ionic keeps this page mounted in the background, so a request made
  // after it was first opened would never appear. Refresh quietly on every
  // return (the first enter is skipped; useAsync already loaded) and poll
  // while the page is open.
  const enteredOnce = useRef(false);
  useIonViewWillEnter(() => {
    if (!enteredOnce.current) {
      enteredOnce.current = true;
      return;
    }
    reload({ silent: true });
  });

  useEffect(() => {
    const timer = window.setInterval(() => reload({ silent: true }), POLL_MS);
    return () => window.clearInterval(timer);
  }, [reload]);

  const join = async (tx: Transaction) => {
    try {
      await transactionsApi.joinAsMiddleman(tx.id);
      if (tx.chatId) router.push(`/chat/${tx.chatId}`, 'forward');
      else reload();
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not join this transaction.',
        duration: 2600,
        color: 'danger',
        position: 'top',
      });
    }
  };

  const queue = data ?? [];
  const unclaimed = queue.filter((tx) => !tx.adminId).length;
  const mineCount = queue.filter((tx) => tx.adminId === user?.id).length;
  const priced = queue.filter((tx) => tx.agreedPrice != null).length;

  return (
    <AppPage title="Middleman Requests">
      <AdminHero
        title="Middleman Requests"
        description="Buyers and sellers who asked for a KEZMOTO admin. Join a deal to enter its chat and guide the hand-off."
        loading={loading && !data}
        action={
          <IonButton fill="outline" className="admin-hero__refresh" onClick={() => reload({ silent: true })}>
            <IonIcon slot="start" icon={refreshOutline} />
            Refresh
          </IonButton>
        }
        stats={[
          { label: 'Waiting for a middleman', value: unclaimed, icon: hourglassOutline },
          { label: 'Assigned to me', value: mineCount, icon: personOutline },
          { label: 'Price agreed', value: priced, icon: pricetagOutline },
        ]}
      />

      {loading && !data && <LoadingRows rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!error && data && queue.length === 0 && (
        <EmptyState
          icon={shieldCheckmarkOutline}
          title="No open requests"
          message="Deals a buyer or seller has asked a middleman to join will show up here."
        />
      )}

      {!error && queue.length > 0 && (
        <div className="kez-bento kez-bento--cards middleman-list">
          {queue.map((tx) => {
            const mine = tx.adminId === user?.id;
            const price = priceLine(tx);
            return (
              <article
                className={`kez-tile middleman-list__row${tx.adminId ? '' : ' is-unclaimed'}`}
                key={tx.id}
              >
                <div className="middleman-list__parties">
                  <Avatar name={tx.buyer?.name ?? '?'} color={tx.buyer?.avatarColor ?? '#ff6a00'} size="sm" />
                  <Avatar name={tx.seller?.name ?? '?'} color={tx.seller?.avatarColor ?? '#0a0a0a'} size="sm" />
                </div>

                <div className="middleman-list__info">
                  <h3 className="kez-display">{tx.listingTitle ?? 'Unit'}</h3>
                  <p className="kez-muted">
                    {tx.buyer?.name ?? 'Buyer'} ↔ {tx.seller?.name ?? 'Seller'} · requested{' '}
                    {formatRelative(tx.createdAt)}
                  </p>
                  <p className={`middleman-list__price${price.agreed ? ' is-agreed' : ''}`}>
                    <IonIcon icon={pricetagOutline} aria-hidden="true" />
                    {price.text}
                  </p>
                  <span className={`kez-chip middleman-list__status${mine ? ' kez-chip--accent' : ''}`}>
                    {tx.adminId ? TRANSACTION_STATUS_LABEL[tx.status] : 'Waiting for a middleman'}
                  </span>
                </div>

                <div className="middleman-list__actions">
                  {mine ? (
                    <IonButton
                      size="small"
                      fill="outline"
                      color="primary"
                      onClick={() => tx.chatId && router.push(`/chat/${tx.chatId}`, 'forward')}
                    >
                      <IonIcon slot="start" icon={chatbubblesOutline} />
                      Open chat
                    </IonButton>
                  ) : (
                    <IonButton size="small" className="kez-cta" onClick={() => void join(tx)}>
                      <IonIcon slot="start" icon={shieldCheckmarkOutline} />
                      Join as middleman
                    </IonButton>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppPage>
  );
};

export default Middleman;
