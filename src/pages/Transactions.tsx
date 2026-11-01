import React, { useMemo, useState } from 'react';
import { IonIcon, useIonRouter } from '@ionic/react';
import { receiptOutline } from 'ionicons/icons';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { transactionsApi } from '../services/api';
import type { Transaction, TransactionStatus } from '../types';
import { TRANSACTION_STATUS_LABEL } from '../types';
import { formatDate, formatPrice } from '../utils/format';
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
          message="Once you request a middleman on a chat, the deal shows up here with its status."
          actionLabel="Go to Messages"
          onAction={() => router.push('/messages', 'none', 'replace')}
        />
      )}

      {!loading && !error && (data ?? []).length > 0 && (
        <div className="kez-bento kez-bento--cards tx-list">
          {transactions.map((tx) => {
            const other = otherPartyOf(tx);
            return (
              <button
                key={tx.id}
                type="button"
                className="kez-tile kez-tile--interactive tx-list__row"
                onClick={() => tx.chatId && router.push(`/chat/${tx.chatId}`, 'forward')}
              >
                <Avatar name={other?.name ?? 'KEZMOTO'} color={other?.avatarColor ?? '#ff6a00'} />
                <span className="tx-list__body">
                  <span className="tx-list__top">
                    <strong>{tx.listingTitle ?? 'Unit'}</strong>
                    <span className={`kez-chip tx-list__status tx-list__status--${tx.status}`}>
                      {TRANSACTION_STATUS_LABEL[tx.status]}
                    </span>
                  </span>
                  <em>
                    {user?.id === tx.buyer?.id ? 'Buying from' : 'Selling to'} {other?.name ?? 'someone'}
                  </em>
                  <span className="tx-list__meta">
                    {tx.agreedPrice != null
                      ? `Agreed ${formatPrice(tx.agreedPrice)}`
                      : tx.proposedPrice != null
                        ? `Proposed ${formatPrice(tx.proposedPrice)}`
                        : 'No price yet'}
                    {' · '}
                    {formatDate(tx.updatedAt)}
                    {tx.agreedPrice != null && user?.id === tx.seller?.id && (
                      <>
                        {' · commission '}
                        {tx.commissionStatus === 'paid' ? 'paid' : 'due'}
                      </>
                    )}
                  </span>
                </span>
                <IonIcon icon={receiptOutline} className="tx-list__icon" />
              </button>
            );
          })}
        </div>
      )}
    </AppPage>
  );
};

export default Transactions;
