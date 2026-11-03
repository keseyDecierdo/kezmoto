import React, { useMemo, useState } from 'react';
import { IonButton, IonIcon, useIonRouter } from '@ionic/react';
import { chatbubblesOutline, eyeOutline, receiptOutline } from 'ionicons/icons';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import TransactionDetailsModal from '../components/TransactionDetailsModal';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { transactionsApi } from '../services/api';
import type { Transaction, TransactionStatus } from '../types';
import { TRANSACTION_STATUS_LABEL } from '../types';
import { formatDate, formatPrice } from '../utils/format';
import { commissionApplies } from '../utils/plans';
import './Transactions.css';

type StatusFilter = 'all' | TransactionStatus;

/**
 * "My Transactions" / transaction history for a signed-in customer - every
 * deal where they are the buyer or the seller. Doubles as the customer
 * report the Phase 3 brief describes: same data, no admin-only fields, just
 * scoped to this account by the RLS-backed `listMine()` query itself.
 */
const Transactions: React.FC = () => {
  const router = useIonRouter();
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync<Transaction[]>(
    () => transactionsApi.listMine(),
    [user?.id]
  );

  const [status, setStatus] = useState<StatusFilter>('all');
  const [viewing, setViewing] = useState<Transaction | null>(null);

  const transactions = useMemo(
    () => (data ?? []).filter((tx) => status === 'all' || tx.status === status),
    [data, status]
  );

  const statusesPresent = useMemo(
    () => Array.from(new Set((data ?? []).map((tx) => tx.status))),
    [data]
  );

  const otherPartyOf = (tx: Transaction) =>
    user?.id === tx.buyer?.id ? tx.seller : tx.buyer;

  return (
    <AppPage title="Transactions" eyebrow="Buying & selling">
      {!loading && !error && (data ?? []).length > 0 && (
        <div className="kez-tile tx-list__filters" role="group" aria-label="Filter by status">
          <button
            type="button"
            className={`kez-chip${status === 'all' ? ' kez-chip--accent' : ''}`}
            onClick={() => setStatus('all')}
          >
            All
          </button>
          {statusesPresent.map((s) => (
            <button
              key={s}
              type="button"
              className={`kez-chip${status === s ? ' kez-chip--accent' : ''}`}
              onClick={() => setStatus(s)}
            >
              {TRANSACTION_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {loading && <LoadingRows rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && (data ?? []).length === 0 && (
        <EmptyState
          icon={receiptOutline}
          title="No transactions yet"
          message="When you make a price offer in a chat, request a middleman or mark a unit sold, the deal shows up here."
          actionLabel="Go to Messages"
          onAction={() => router.push('/messages', 'none', 'replace')}
        />
      )}

      {!loading && !error && (data ?? []).length > 0 && (
        <div className="kez-tile kez-tile--flush tx-table" role="table" aria-label="Your transactions">
          <div className="tx-table__head" role="row">
            <span role="columnheader">Unit</span>
            <span role="columnheader">With</span>
            <span role="columnheader">Price</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Meetup</span>
            <span role="columnheader">Updated</span>
            <span role="columnheader" className="tx-table__actions-head">Actions</span>
          </div>
          {transactions.map((tx) => {
            const other = otherPartyOf(tx);
            const buying = user?.id === tx.buyer?.id;
            return (
              <div key={tx.id} className="tx-table__row" role="row">
                <span className="tx-table__unit" role="cell">
                  {tx.listingPhoto ? (
                    <img src={tx.listingPhoto} alt="" />
                  ) : (
                    <Avatar name={other?.name ?? 'KEZMOTO'} color={other?.avatarColor ?? '#ff6a00'} size="sm" />
                  )}
                  <strong>{tx.listingTitle ?? 'Unit'}</strong>
                </span>
                <span className="tx-table__cell" role="cell" data-label="With">
                  {buying ? 'Buying from' : 'Selling to'} <b>{other?.name ?? 'someone'}</b>
                </span>
                <span className="tx-table__cell tx-table__price" role="cell" data-label="Price">
                  {tx.agreedPrice != null
                    ? formatPrice(tx.agreedPrice)
                    : tx.proposedPrice != null
                      ? `Proposed ${formatPrice(tx.proposedPrice)}`
                      : '-'}
                  {tx.agreedPrice != null && !buying && commissionApplies(tx) && (
                    <small>commission {tx.commissionStatus === 'paid' ? 'paid' : 'due'}</small>
                  )}
                </span>
                <span className="tx-table__cell" role="cell" data-label="Status">
                  <span className={`kez-chip tx-list__status tx-list__status--${tx.status}`}>
                    {TRANSACTION_STATUS_LABEL[tx.status]}
                  </span>
                </span>
                <span className="tx-table__cell tx-table__meetup" role="cell" data-label="Meetup">
                  {tx.meetupLocation || '-'}
                </span>
                <span className="tx-table__cell" role="cell" data-label="Updated">
                  {formatDate(tx.updatedAt)}
                </span>
                <span className="tx-table__actions" role="cell">
                  <IonButton size="small" className="kez-cta" onClick={() => setViewing(tx)}>
                    <IonIcon slot="start" icon={eyeOutline} />
                    View details
                  </IonButton>
                  {tx.chatId && (
                    <IonButton
                      size="small"
                      fill="outline"
                      onClick={() => router.push(`/chat/${tx.chatId}`, 'forward')}
                      aria-label={`Open chat about ${tx.listingTitle ?? 'this unit'}`}
                    >
                      <IonIcon slot="icon-only" icon={chatbubblesOutline} />
                    </IonButton>
                  )}
                </span>
              </div>
            );
          })}
          {transactions.length === 0 && <p className="tx-table__empty">No transactions with this status.</p>}
        </div>
      )}

      <TransactionDetailsModal transaction={viewing} onClose={() => setViewing(null)} />
    </AppPage>
  );
};

export default Transactions;
