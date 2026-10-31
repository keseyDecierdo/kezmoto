import React from 'react';
import { IonIcon } from '@ionic/react';
import './AdminHero.css';

export interface AdminStat {
  label: string;
  value: React.ReactNode;
  icon?: string;
}

interface AdminHeroProps {
  title: string;
  /** One plain sentence on what this page is for. */
  description: string;
  /** Optional button(s) on the right of the hero. */
  action?: React.ReactNode;
  stats?: AdminStat[];
  /** Show skeleton bars instead of the stat values while data loads. */
  loading?: boolean;
}

/**
 * The header every admin page shares: the same black hero tile and stat
 * strip the customer Home uses, so admin screens feel like the same app.
 */
const AdminHero: React.FC<AdminHeroProps> = ({ title, description, action, stats, loading = false }) => (
  <div className="kez-bento admin-hero">
    <header className="kez-tile kez-tile--hero kez-tile--full admin-hero__head">
      <div className="admin-hero__copy">
        <p className="kez-eyebrow">Admin</p>
        <h1 className="kez-display admin-hero__title">{title}</h1>
        <p className="kez-muted">{description}</p>
      </div>
      {action && <div className="admin-hero__action">{action}</div>}
    </header>

    {stats && stats.length > 0 && (
      <div className="kez-tile--full kez-stats" aria-label={`${title} at a glance`}>
        {stats.map((stat) => (
          <div key={stat.label} className="kez-tile kez-stat admin-hero__stat">
            <span className="kez-stat__label">{stat.label}</span>
            {loading ? (
              <span className="kez-skeleton kez-skeleton--line kez-stat__skeleton" aria-hidden="true" />
            ) : (
              <span className="kez-stat__value">{stat.value}</span>
            )}
            {stat.icon && (
              <span className="kez-stat__icon" aria-hidden="true">
                <IonIcon icon={stat.icon} />
              </span>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

export default AdminHero;
