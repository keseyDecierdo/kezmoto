import React, { useMemo, useState } from 'react';
import { useIonRouter } from '@ionic/react';
import { statsChartOutline } from 'ionicons/icons';
import AdminHero from '../components/AdminHero';
import AppPage from '../components/AppPage';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { commissionAmountFor, paymentsApi, transactionsApi } from '../services/api';
import type { Payment, Transaction, TransactionStatus } from '../types';
import { TRANSACTION_STATUS_LABEL } from '../types';
import { formatDate, formatPrice } from '../utils/format';
import './Reports.css';

type StatusFilter = 'all' | TransactionStatus;

/**
 * Admin report - every deal on the platform, filterable by status and date,
 * plus the sales/commission summary Phase 4 adds on top: total units sold,
 * total sale value, and commission actually collected (admin-confirmed GCash
 * payments only - a `pending` or `failed` submission earns KEZMOTO nothing).
 */
/** Pure so it can sit in a dependency array without upsetting exhaustive-deps. */
const inDateRange = (iso: string, from: string, to: string): boolean => {
  const created = iso.slice(0, 10);
  if (from && created < from) return false;
  if (to && created > to) return false;
  return true;
};

const Reports: React.FC = () => {
  const router = useIonRouter();
  const { data, loading, error, reload } = useAsync<Transaction[]>(() => transactionsApi.listAll(), []);
  const { data: payments } = useAsync<Payment[]>(() => paymentsApi.listAll(), []);

  const [status, setStatus] = useState<StatusFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // A deal still stuck pre-payment (inquiry, negotiating, verifying,
  // inspecting...) hasn't earned KEZMOTO anything yet, so it isn't a
  // reportable transaction here - this table starts from the point the
  // seller actually paid (or was waived) the commission.
  const paidTransactions = useMemo(
    () => (data ?? []).filter((tx) => tx.commissionStatus === 'paid' || tx.commissionStatus === 'waived'),
    [data]
  );

  const rows = useMemo(
    () =>
      paidTransactions.filter(
        (tx) => (status === 'all' || tx.status === status) && inDateRange(tx.createdAt, from, to)
      ),
    [paidTransactions, status, from, to]
  );

  const statusesPresent = useMemo(
    () => Array.from(new Set(paidTransactions.map((tx) => tx.status))),
    [paidTransactions]
  );

  const summary = useMemo(() => {
    const completed = (data ?? []).filter(
      (tx) => tx.status === 'completed' && inDateRange(tx.createdAt, from, to)
    );
    const unitsSold = completed.length;
    const salesValue = completed.reduce((sum, tx) => sum + (tx.agreedPrice ?? 0), 0);
    const commissionEarned = (payments ?? [])
      .filter(
        (p) => p.paymentType === 'commission' && p.status === 'succeeded' && inDateRange(p.createdAt, from, to)
      )
      .reduce((sum, p) => sum + p.amount, 0);
    return { unitsSold, salesValue, commissionEarned };
  }, [data, payments, from, to]);

  return (
    <AppPage title="Reports">
      <AdminHero
        title="Reports"
        description="Every deal on KEZMOTO with its agreed price and commission. Filter by status or date."
      />
      <div className="kez-stats reports__summary">
        <div className="kez-tile reports__stat">
          <small>Units sold</small>
          <strong>{summary.unitsSold}</strong>
        </div>
        <div className="kez-tile reports__stat">
          <small>Total sales value</small>
          <strong>{formatPrice(summary.salesValue)}</strong>
        </div>
        <div className="kez-tile kez-tile--accent reports__stat reports__stat--accent">
          <small>Commission earned</small>
          <strong>{formatPrice(summary.commissionEarned)}</strong>
        </div>
      </div>
      <p className="kez-muted reports__summary-note">
        Sales value counts completed deals only; commission counts admin-confirmed payments only
        - a pending or rejected submission is not revenue yet. Both respect the date filter below.
      </p>

      <div className="kez-tile reports__filters">
        <div className="reports__chiprow" role="group" aria-label="Filter by status">
          <button
            type="button"
            className={`kez-chip${status === 'all' ? ' kez-chip--accent' : ''}`}
            onClick={() => setStatus('all')}
          >
            All statuses
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

        <div className="reports__daterow">
          <label>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>

      {loading && <LoadingRows rows={5} layout="list" />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          icon={statsChartOutline}
          title="No transactions match those filters"
          message="Try a different status or date range."
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="kez-tile kez-tile--flush reports__table-wrap">
          <table className="reports__table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Buyer</th>
                <th>Seller</th>
                <th>Agreed price</th>
                <th>Commission</th>
                <th>Status</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => router.push(`/admin/transactions/${tx.id}`, 'forward')}
                >
                  <td>{tx.listingTitle ?? '-'}</td>
                  <td>{tx.buyer?.name ?? '-'}</td>
                  <td>{tx.seller?.name ?? '-'}</td>
                  <td>{tx.agreedPrice != null ? formatPrice(tx.agreedPrice) : '-'}</td>
                  <td>
                    {tx.agreedPrice != null
                      ? `${formatPrice(commissionAmountFor(tx.agreedPrice))} (${tx.commissionStatus})`
                      : '-'}
                  </td>
                  <td>
                    <span className="kez-chip">{TRANSACTION_STATUS_LABEL[tx.status]}</span>
                  </td>
                  <td>{formatDate(tx.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppPage>
  );
};

export default Reports;
