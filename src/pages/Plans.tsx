import React, { useState } from 'react';
import { IonButton, IonIcon, useIonRouter, useIonViewWillEnter } from '@ionic/react';
import {
  checkmarkCircle,
  diamond,
  flashOutline,
  hourglassOutline,
  closeCircleOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import AppPage from '../components/AppPage';
import PurchaseModal from '../components/PurchaseModal';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { listingsApi, plansApi } from '../services/api';
import type { PlanPurchase } from '../services/plansService';
import {
  BOOST_DAYS,
  FREE_LISTING_LIMIT,
  PLAN_PRICES,
  PRO_BOOSTS,
  PRO_DAYS,
  daysLeft,
  isPro,
} from '../utils/plans';
import { formatDate, formatPrice } from '../utils/format';
import './Plans.css';

const FREE_FEATURES = [
  'Browse, save and buy units',
  'Chat, price offers and Wanted posts',
  'Admin middleman and AI assistant',
  `Up to ${FREE_LISTING_LIMIT} active listings`,
  '5% commission when you sell',
];

const PRO_FEATURES = [
  'Everything in Free',
  'Unlimited active listings',
  'Lower 3% commission when you sell',
  'PRO badge on your profile and units',
  `${PRO_BOOSTS} free Boosts with every purchase`,
];

const STATUS_ICON = { pending: hourglassOutline, approved: checkmarkCircleOutline, rejected: closeCircleOutline };
const STATUS_LABEL = { pending: 'Waiting for admin', approved: 'Approved', rejected: 'Not approved' };

/** KEZMOTO Pro: Free vs Pro, your status, and how to pay. */
const Plans: React.FC = () => {
  const router = useIonRouter();
  const { user, refreshUser } = useAuth();
  const [buying, setBuying] = useState(false);

  const purchases = useAsync<PlanPurchase[]>(() => plansApi.listMine(), [user?.id]);
  const listings = useAsync(
    () => (user ? listingsApi.listBySeller(user.id) : Promise.resolve([])),
    [user?.id]
  );

  // An admin may have approved a purchase since the last visit.
  useIonViewWillEnter(() => {
    void refreshUser();
    purchases.reload();
  });

  const pro = isPro(user);
  const open = (listings.data ?? []).filter((l) => l.status === 'active' || l.status === 'pending').length;
  const pending = (purchases.data ?? []).some((p) => p.status === 'pending' && p.kind === 'pro');

  return (
    <AppPage title="KEZMOTO Pro" eyebrow="Plans">
      <div className="kez-bento plans">
        <section className="kez-tile plans__plan">
          <p className="kez-eyebrow">Free</p>
          <p className="plans__price">
            ₱0 <small>forever</small>
          </p>
          <p className="kez-muted">Everything you need to buy and sell.</p>
          <ul className="plans__features">
            {FREE_FEATURES.map((f) => (
              <li key={f}>
                <IonIcon icon={checkmarkCircle} aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </section>

        <section className="kez-tile kez-tile--accent plans__plan plans__plan--pro">
          <p className="kez-eyebrow">
            <IonIcon icon={diamond} aria-hidden="true" /> KEZMOTO Pro
          </p>
          <p className="plans__price">
            {formatPrice(PLAN_PRICES.pro)} <small>/ {PRO_DAYS} days</small>
          </p>
          <p>For sellers with more than a few units.</p>
          <ul className="plans__features">
            {PRO_FEATURES.map((f) => (
              <li key={f}>
                <IonIcon icon={checkmarkCircle} aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
          <IonButton expand="block" className="plans__buy" onClick={() => setBuying(true)} disabled={pending}>
            {pending ? 'Payment under review' : pro ? 'Extend Pro 30 days' : `Get Pro · ${formatPrice(PLAN_PRICES.pro)}`}
          </IonButton>
        </section>

        <section className="kez-tile plans__status">
          <p className="kez-eyebrow">Your plan</p>
          {pro && user ? (
            <p className="plans__now">
              <strong>Pro</strong> until {formatDate(user.proUntil)} · {daysLeft(user.proUntil)} days left
            </p>
          ) : (
            <p className="plans__now">
              <strong>Free</strong> · {Math.min(open, FREE_LISTING_LIMIT)} of {FREE_LISTING_LIMIT} listings used
            </p>
          )}

          <div className="plans__boost">
            <IonIcon icon={flashOutline} aria-hidden="true" />
            <div>
              <strong>
                {user?.boostCredits ?? 0} free boost{user?.boostCredits === 1 ? '' : 's'}
              </strong>
              <span className="kez-muted">
                A Boost puts one unit at the top of Home for {BOOST_DAYS} days ({formatPrice(PLAN_PRICES.boost)}).
              </span>
            </div>
            <IonButton size="small" fill="outline" onClick={() => router.push('/units', 'forward')}>
              Boost a unit
            </IonButton>
          </div>

          {(purchases.data ?? []).length > 0 && (
            <ul className="plans__history" aria-label="Recent payments">
              {(purchases.data ?? []).slice(0, 3).map((p) => (
                <li key={p.id} className={`is-${p.status}`}>
                  <IonIcon icon={STATUS_ICON[p.status]} aria-hidden="true" />
                  <span>
                    {p.kind === 'pro' ? 'Pro' : `Boost${p.listingTitle ? ` · ${p.listingTitle}` : ''}`} ·{' '}
                    {formatPrice(p.amount)} · {formatDate(p.createdAt)}
                  </span>
                  <strong>{STATUS_LABEL[p.status]}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <PurchaseModal
        isOpen={buying}
        kind="pro"
        onClose={() => setBuying(false)}
        onSubmitted={purchases.reload}
      />
    </AppPage>
  );
};

export default Plans;
