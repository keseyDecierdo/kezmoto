import React from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { alertCircleOutline, refreshOutline } from 'ionicons/icons';
import './StateViews.css';

/* -------------------------------------------------------------------------
   The three states every data-driven screen must render, styled once for the
   dark theme so no screen invents its own.
   ------------------------------------------------------------------------- */

type LoadingVariant = 'cards' | 'page' | 'detail' | 'profile';

interface LoadingStateProps {
  /** Number of skeleton unit cards to draw (implies variant="cards"). */
  cards?: number;
  /** Which page shape to mimic while loading; defaults to a generic bento page. */
  variant?: LoadingVariant;
  label?: string;
}

const Bone: React.FC<{ className?: string; w?: string; h?: number }> = ({ className = '', w, h }) => (
  <div
    className={`kez-skeleton ${className}`}
    style={{ ...(w ? { width: w } : {}), ...(h ? { height: h } : {}) }}
  />
);

const Lines: React.FC<{ widths: string[] }> = ({ widths }) => (
  <>
    {widths.map((w, i) => (
      <Bone key={i} className="kez-skeleton--line" w={w} />
    ))}
  </>
);

/**
 * Skeletons shaped like the real bento layouts, so the page doesn't jump
 * when data arrives. Modals, the sidebar and the AI assistant never use
 * these — only page content.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({ cards, variant, label = 'Loading' }) => {
  const kind: LoadingVariant = cards ? 'cards' : (variant ?? 'page');
  const a11y = { role: 'status', 'aria-live': 'polite' as const, 'aria-label': `${label}…` };

  if (kind === 'cards') {
    return (
      <div className="kez-skeleton-grid" {...a11y}>
        {Array.from({ length: cards ?? 6 }).map((_, i) => (
          <div className="kez-skeleton-card" key={i}>
            <Bone className="kez-skeleton--media" />
            <div className="kez-skeleton-card__body">
              <Lines widths={['62%', '38%', '84%']} />
              <Bone className="kez-skeleton--button" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'detail') {
    return (
      <div className="kez-bento" {...a11y}>
        <div className="kez-tile kez-tile--w3 kez-tile--h2 kez-skeleton-tile">
          <Bone className="kez-skeleton--gallery" />
        </div>
        <div className="kez-tile kez-tile--h2 kez-skeleton-tile">
          <Lines widths={['40%']} />
          <Bone className="kez-skeleton--line" w="70%" h={28} />
          <Lines widths={['85%', '60%']} />
          <Bone className="kez-skeleton--button" />
        </div>
        <div className="kez-tile kez-tile--w2 kez-skeleton-tile">
          <Lines widths={['30%', '90%', '75%', '82%']} />
        </div>
        <div className="kez-tile kez-tile--w2 kez-skeleton-tile">
          <Lines widths={['36%', '88%', '70%', '64%']} />
        </div>
      </div>
    );
  }

  if (kind === 'profile') {
    return (
      <div className="kez-bento" {...a11y}>
        <div className="kez-tile kez-skeleton-tile kez-skeleton-tile--center">
          <Bone className="kez-skeleton--avatar-lg" />
          <Lines widths={['60%', '40%']} />
          <Lines widths={['80%', '70%', '75%']} />
        </div>
        <div className="kez-tile kez-tile--w2 kez-skeleton-tile">
          <Lines widths={['30%', '70%']} />
          <div className="kez-skeleton-fields">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} className="kez-skeleton--field" />
            ))}
          </div>
        </div>
        <div className="kez-tile kez-skeleton-tile">
          <Lines widths={['55%', '90%', '80%']} />
          <Bone className="kez-skeleton--field" />
          <Bone className="kez-skeleton--field" />
        </div>
      </div>
    );
  }

  // 'page': hero bar, a stat strip and two content tiles.
  return (
    <div className="kez-bento" {...a11y}>
      <div className="kez-tile kez-tile--full kez-skeleton-hero">
        <Bone className="kez-skeleton--line kez-skeleton--on-dark" w="18%" />
        <Bone className="kez-skeleton--line kez-skeleton--on-dark" w="42%" h={26} />
        <Bone className="kez-skeleton--line kez-skeleton--on-dark" w="56%" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="kez-tile kez-skeleton-tile" key={i}>
          <Lines widths={['46%']} />
          <Bone className="kez-skeleton--line" w="30%" h={26} />
        </div>
      ))}
      <div className="kez-tile kez-tile--w2 kez-skeleton-tile">
        <Lines widths={['34%', '92%', '80%', '86%']} />
      </div>
      <div className="kez-tile kez-tile--w2 kez-skeleton-tile">
        <Lines widths={['28%', '88%', '74%', '60%']} />
      </div>
    </div>
  );
};

/**
 * Skeletons for list screens. "cards" (default) matches the bento card
 * grids (transactions, sellers, admin queues); "list" keeps stacked rows
 * for the Messages inbox.
 */
export const LoadingRows: React.FC<{ rows?: number; layout?: 'cards' | 'list' }> = ({
  rows = 5,
  layout = 'cards',
}) => {
  if (layout === 'list') {
    return (
      <div className="kez-stack" role="status" aria-live="polite" aria-label="Loading…">
        {Array.from({ length: rows }).map((_, i) => (
          <div className="kez-skeleton-row" key={i}>
            <Bone className="kez-skeleton--avatar" />
            <div className="kez-skeleton-row__body">
              <Lines widths={['44%', '72%']} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="kez-bento kez-bento--cards" role="status" aria-live="polite" aria-label="Loading…">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="kez-tile kez-skeleton-tile" key={i}>
          <div className="kez-skeleton-row__head">
            <Bone className="kez-skeleton--avatar" />
            <div className="kez-skeleton-row__body">
              <Lines widths={['52%', '34%']} />
            </div>
          </div>
          <Lines widths={['88%', '64%']} />
          <Bone className="kez-skeleton--button" />
        </div>
      ))}
    </div>
  );
};

/** Alternating message bubbles while a conversation loads. */
export const LoadingChat: React.FC = () => (
  <div className="kez-skeleton-chat" role="status" aria-live="polite" aria-label="Loading messages…">
    {['58%', '42%', '66%', '36%'].map((w, i) => (
      <Bone key={i} className={`kez-skeleton--bubble${i % 2 ? ' is-mine' : ''}`} w={w} />
    ))}
  </div>
);

interface EmptyStateProps {
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}) => (
  <div className="kez-state">
    <span className="kez-state__icon">
      <IonIcon icon={icon} />
    </span>
    <div className="kez-state__body">
      <h3 className="kez-display">{title}</h3>
      <p className="kez-muted kez-state__message">{message}</p>
      {actionLabel && onAction && (
        <IonButton className="kez-cta" onClick={onAction}>
          {actionLabel}
        </IonButton>
      )}
    </div>
  </div>
);

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => (
  <div className="kez-state kez-state--error" role="alert">
    <span className="kez-state__icon kez-state__icon--danger">
      <IonIcon icon={alertCircleOutline} />
    </span>
    <div className="kez-state__body">
      <h3 className="kez-display">Something went wrong</h3>
      <p className="kez-muted kez-state__message">{message}</p>
      {onRetry && (
        <IonButton fill="outline" color="primary" onClick={onRetry}>
          <IonIcon slot="start" icon={refreshOutline} />
          Try again
        </IonButton>
      )}
    </div>
  </div>
);
