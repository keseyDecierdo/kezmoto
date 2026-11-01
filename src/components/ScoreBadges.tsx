import React from 'react';
import { IonIcon } from '@ionic/react';
import {
  checkmarkCircleOutline,
  hourglassOutline,
  informationCircleOutline,
  pulseOutline,
  sparklesOutline,
  warningOutline,
} from 'ionicons/icons';
import type { Listing } from '../types';
import './ScoreBadges.css';

const tier = (score: number): 'good' | 'ok' | 'poor' =>
  score >= 80 ? 'good' : score >= 50 ? 'ok' : 'poor';

interface ScoreBadgesProps {
  listing: Listing;
  /** Compact renders just the two number pills - for UnitCard. Full (default) is the Listing Detail layout. */
  compact?: boolean;
}

/**
 * The real Listing Quality and Condition scores from Phase 5. Fraud
 * detection is deliberately not shown here - those flags are admin-only
 * (see fraud_flags' RLS in 0013), so neither a buyer nor the seller ever
 * sees whether, or why, a listing was flagged.
 */
const ScoreBadges: React.FC<ScoreBadgesProps> = ({ listing, compact = false }) => {
  if (compact) {
    return (
      <div className="score-badges score-badges--compact">
        {listing.listingQualityScore != null && (
          <span
            className={`score-pill score-pill--${tier(listing.listingQualityScore)}`}
            title="Listing Quality score (0–100): an AI estimate of how complete this listing's details are."
          >
            <IonIcon icon={sparklesOutline} />
            Quality {listing.listingQualityScore}%
          </span>
        )}
        {listing.conditionScore != null && (
          <span
            className={`score-pill score-pill--${tier(listing.conditionScore)}`}
            title="Condition score (0–100): an AI estimate from the seller's own photos and notes, not an inspection."
          >
            <IonIcon icon={pulseOutline} />
            Condition {listing.conditionScore}%
          </span>
        )}
      </div>
    );
  }

  return (
    <section className="scores" aria-label="AI assessments">
      <div className={`scores__card${listing.listingQualityScore == null ? ' is-pending' : ''}`}>
        <span className="scores__head">
          <span className="scores__icon">
            <IonIcon icon={sparklesOutline} />
          </span>
          <strong>Listing Quality</strong>
          {listing.listingQualityScore != null ? (
            <span className={`scores__score scores__score--${tier(listing.listingQualityScore)}`}>
              {listing.listingQualityScore}/100
            </span>
          ) : (
            <span className="scores__score scores__score--pending">
              <IonIcon icon={hourglassOutline} />
              Scoring…
            </span>
          )}
        </span>
        {listing.listingQualityBreakdown && (
          <ul className="scores__breakdown">
            {listing.listingQualityBreakdown.map((check) => (
              <li key={check.label} className={check.passed ? 'is-ok' : 'is-warn'}>
                <IonIcon icon={check.passed ? checkmarkCircleOutline : warningOutline} />
                {check.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`scores__card${listing.conditionScore == null ? ' is-pending' : ''}`}>
        <span className="scores__head">
          <span className="scores__icon">
            <IonIcon icon={pulseOutline} />
          </span>
          <strong>Condition Score</strong>
          {listing.conditionScore != null ? (
            <span className={`scores__score scores__score--${tier(listing.conditionScore)}`}>
              {listing.conditionScore}/100
            </span>
          ) : (
            <span className="scores__score scores__score--pending">
              <IonIcon icon={hourglassOutline} />
              Scoring…
            </span>
          )}
        </span>
        {listing.conditionScoreExplanation && (
          <p className="scores__explanation">{listing.conditionScoreExplanation}</p>
        )}
        <p className="scores__disclaimer">
          <IonIcon icon={informationCircleOutline} />
          Based on seller-reported information, not a physical inspection - see the KEZMOTO admin
          verification for confirmed details.
        </p>
      </div>
    </section>
  );
};

export default ScoreBadges;
