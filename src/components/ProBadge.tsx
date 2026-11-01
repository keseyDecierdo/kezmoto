import React from 'react';
import { IonIcon } from '@ionic/react';
import { diamond } from 'ionicons/icons';
import { isPro } from '../utils/plans';

/** "PRO" next to a seller's name while their KEZMOTO Pro is active. */
const ProBadge: React.FC<{ proUntil?: string }> = ({ proUntil }) =>
  isPro({ proUntil }) ? (
    <span className="kez-pro-badge" title="KEZMOTO Pro seller">
      <IonIcon icon={diamond} aria-hidden="true" />
      PRO
    </span>
  ) : null;

export default ProBadge;
