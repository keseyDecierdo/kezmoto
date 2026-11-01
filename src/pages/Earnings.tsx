import React, { useMemo, useState } from 'react';
import { IonButton, IonIcon, useIonRouter, useIonViewWillEnter } from '@ionic/react';
import {
  cashOutline,
  diamondOutline,
  downloadOutline,
  flashOutline,
  hourglassOutline,
  receiptOutline,
} from 'ionicons/icons';
import AdminHero from '../components/AdminHero';
import AppPage from '../components/AppPage';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { paymentsApi, plansApi, transactionsApi } from '../services/api';
import {
  SOURCE_LABEL,
  buildLedger,
  groupOf,
  inRange,
  monthlyTotals,
  periodRange,
  summarize,
  toCsv,
} from '../utils/earnings';
import type { EarningGroup, EarningRow, MonthTotal, Period } from '../utils/earnings';
import { formatDate, formatPrice } from '../utils/format';
import './Earnings.css';

/** Byte-order mark so Excel opens the peso sign and names correctly. */
const BOM = String.fromCharCode(0xfeff);

const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
];

type SourceFilter = 'all' | EarningGroup;
const SOURCES: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'commission', label: 'Commission' },
  { id: 'subscription', label: 'Pro' },
  { id: 'boost', label: 'Boost' },
];

/* Fixed order: Commission, Pro, Boost (validated for colour-blind and
   contrast on both themes; see the --earn-* tokens in Earnings.css). */
const SERIES: { key: EarningGroup; label: string }[] = [
  { key: 'commission', label: 'Commission' },
  { key: 'subscription', label: 'Pro' },
  { key: 'boost', label: 'Boost' },
];

const SOURCE_ICON = { commission: receiptOutline, pro: diamondOutline, pro_year: diamondOutline, boost: flashOutline };

const monthLabel = (ym: string, withYear = false) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

/** Last 12 months of earned money, stacked by source, with a hover/focus tooltip. */
const MonthlyChart: React.FC<{ months: MonthTotal[]; visible: EarningGroup[] }> = ({ months, visible }) => {
  const [active, setActive] = useState<number | null>(null);
  const series = SERIES.filter((s) => visible.includes(s.key));
  const valueOf = (m: MonthTotal) => series.reduce((sum, s) => sum + m[s.key], 0);
  const max = Math.max(...months.map(valueOf), 1);
  const shown = active != null ? months[active] : null;
  const empty = months.every((m) => valueOf(m) === 0);

  return (
    <div className="earn-chart">
      <div className="earn-chart__legend" aria-hidden="true">
        {series.map((s) => (
          <span key={s.key}>
            <i className={`earn-swatch earn-swatch--${s.key}`} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="earn-chart__plot" onMouseLeave={() => setActive(null)}>
        {empty ? (
          <span className="earn-chart__empty">Nothing earned in the last 12 months yet.</span>
        ) : (
          <span className="earn-chart__max">{formatPrice(max)}</span>
        )}
        {months.map((m, i) => {
          const total = valueOf(m);
          return (
            <button
              key={m.month}
              type="button"
              className={`earn-chart__col${active === i ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${monthLabel(m.month, true)}: ${formatPrice(total)} earned${series
                .map((s) => `, ${s.label} ${formatPrice(m[s.key])}`)
                .join('')}`}
            >
              <span className="earn-chart__bar" style={{ height: `${(total / max) * 100}%` }}>
                {series
                  .filter((s) => m[s.key] > 0)
                  .map((s) => (
                    <span
                      key={s.key}
                      className={`earn-chart__seg earn-swatch--${s.key}`}
                      style={{ flexGrow: m[s.key] }}
                    />
                  ))}
              </span>
              <span className="earn-chart__month">{monthLabel(m.month)}</span>
            </button>
          );
        })}

        {shown && !empty && (
          <div
            className="earn-chart__tip"
            role="status"
            style={{ left: `${((active as number) + 0.5) * (100 / months.length)}%` }}
          >
            <strong>{monthLabel(shown.month, true)}</strong>
            <span className="earn-chart__tip-total">{formatPrice(valueOf(shown))}</span>
            {series.map((s) => (
              <span key={s.key} className="earn-chart__tip-row">
                <i className={`earn-swatch earn-swatch--${s.key}`} />
                {s.label}
                <b>{formatPrice(shown[s.key])}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Admin: everything KEZMOTO has earned - the commission from each completed
 * sale plus KEZMOTO Pro and Boost purchases - with totals, a 12-month chart,
 * a ledger and a CSV export. Revenue only; expenses are not tracked.
 */
const Earnings: React.FC = () => {
  const router = useIonRouter();
  const [period, setPeriod] = useState<Period>('month');
  const [source, setSource] = useState<SourceFilter>('all');

  const { data, loading, error, reload } = useAsync(
    async () => {
      const [payments, transactions, purchases] = await Promise.all([
        paymentsApi.listAll(),
        transactionsApi.listAll(),
        plansApi.listAll().catch(() => []), // before migration 0036, plans don't exist yet
      ]);
      return buildLedger(payments, transactions, purchases);
    },
    []
  );
  useIonViewWillEnter(() => reload({ silent: true }));

  const ledger = useMemo(() => data ?? [], [data]);
  const range = periodRange(period);
  const bySource = (row: EarningRow) => source === 'all' || groupOf(row.source) === source;
  const rows = ledger.filter((row) => inRange(row.date, range.from, range.to) && bySource(row));
  const summary = summarize(ledger.filter((row) => inRange(row.date, range.from, range.to)));
  const months = useMemo(() => monthlyTotals(ledger), [ledger]);
  const visibleSeries = source === 'all' ? SERIES.map((s) => s.key) : [source];

  const exportCsv = () => {
    const blob = new Blob([`${BOM}${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kezmoto-earnings-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppPage title="Earnings">
      <AdminHero
        title="Earnings"
        description="What KEZMOTO earned from each sale's commission and from KEZMOTO Pro and Boost payments. Revenue before expenses."
        loading={loading && !data}
        action={
          <IonButton size="small" fill="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <IonIcon slot="start" icon={downloadOutline} />
            Export CSV
          </IonButton>
        }
        stats={[
          { label: 'Total earned', value: formatPrice(summary.total), icon: cashOutline },
          { label: 'Commission', value: formatPrice(summary.commission), icon: receiptOutline },
          { label: 'Pro subscriptions', value: formatPrice(summary.subscription), icon: diamondOutline },
          { label: 'Boosts', value: formatPrice(summary.boost), icon: flashOutline },
          { label: 'Waiting for approval', value: formatPrice(summary.waiting), icon: hourglassOutline },
        ]}
      />

      <div className="kez-tile earnings__filters">
        <div role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`kez-chip${period === p.id ? ' kez-chip--accent' : ''}`}
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Source">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`kez-chip${source === s.id ? ' kez-chip--accent' : ''}`}
              aria-pressed={source === s.id}
              onClick={() => setSource(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <LoadingRows rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!error && data && (
        <div className="kez-bento earnings">
          <section className="kez-tile kez-tile--full earnings__chart-tile">
            <header className="earnings__tile-head">
              <h2 className="kez-display">Last 12 months</h2>
              <span className="kez-muted">Earned per month · tap a bar for details</span>
            </header>
            <MonthlyChart months={months} visible={visibleSeries} />
          </section>

          <section className="kez-tile kez-tile--full earnings__ledger-tile">
            <header className="earnings__tile-head">
              <h2 className="kez-display">Every payment</h2>
              <span className="kez-muted">
                {rows.length} {rows.length === 1 ? 'payment' : 'payments'} · {PERIODS.find((p) => p.id === period)?.label}
              </span>
            </header>

            {rows.length === 0 ? (
              <EmptyState
                icon={cashOutline}
                title="No earnings in this period"
                message="Commission appears once an admin confirms a seller's GCash payment; Pro and Boosts once Plan Payments are approved."
              />
            ) : (
              <ul className="earnings__ledger">
                {rows.map((row) => (
                  <li key={`${row.source}-${row.id}`}>
                    <button type="button" className="earnings__row" onClick={() => router.push(row.link, 'forward')}>
                      <span className="earnings__date">{formatDate(row.date)}</span>
                      <span className={`earnings__source earnings__source--${groupOf(row.source)}`}>
                        <IonIcon icon={SOURCE_ICON[row.source]} aria-hidden="true" />
                        {SOURCE_LABEL[row.source]}
                      </span>
                      <span className="earnings__who">
                        <strong>{row.who}</strong>
                        <span>{row.detail}</span>
                      </span>
                      <span className="earnings__basis">
                        {row.salePrice != null &&
                          `${formatPrice(row.salePrice)} sale${row.rate != null ? ` · ${Math.round(row.rate * 1000) / 10}%` : ''}`}
                      </span>
                      <span className="earnings__amount">
                        {formatPrice(row.amount)}
                        {row.status === 'waiting' && <em className="kez-chip kez-chip--warning">Waiting</em>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppPage>
  );
};

export default Earnings;
