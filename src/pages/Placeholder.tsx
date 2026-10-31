import React from 'react';
import { IonButton, IonIcon, useIonRouter } from '@ionic/react';
import { constructOutline } from 'ionicons/icons';
import AppPage from '../components/AppPage';
import './Placeholder.css';

interface PlaceholderProps {
  title: string;
  /** What this screen will do once its phase lands. */
  summary: string;
  phase?: string;
}

/**
 * Route container for screens that are deliberately out of Phase 1 scope
 * (AI chatbot, scoring, middleman queue, verification, reports). They exist so
 * navigation can be tested end to end without implying the feature is built.
 */
const Placeholder: React.FC<PlaceholderProps> = ({ title, summary, phase = 'a later phase' }) => {
  const router = useIonRouter();

  return (
    <AppPage title={title} eyebrow="Not in this build">
      <div className="kez-tile placeholder">
        <span className="placeholder__icon">
          <IonIcon icon={constructOutline} />
        </span>
        <h1 className="kez-display">{title}</h1>
        <p className="kez-body">{summary}</p>
        <p className="kez-muted">Planned for {phase}. Phase 1 ships the navigation only.</p>
        <IonButton className="kez-cta" onClick={() => router.push('/home', 'none', 'replace')}>
          Back to home
        </IonButton>
      </div>
    </AppPage>
  );
};

export default Placeholder;
