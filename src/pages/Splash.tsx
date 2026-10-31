import React, { useEffect } from 'react';
import { IonContent, IonPage, useIonRouter } from '@ionic/react';
import BrandMark from '../components/BrandMark';
import './Splash.css';

/**
 * Boot screen. On web the landing page is the entry point, so this route is
 * what the Capacitor shell will open first; it hands off to onboarding.
 */
const Splash: React.FC = () => {
  const router = useIonRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => router.push('/onboarding', 'forward', 'replace'), 1800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <IonPage className="splash">
      <IonContent fullscreen>
        <div className="splash__inner">
          <div className="splash__glow" aria-hidden="true" />
          <img className="splash__bike" src="/mock/hero-bike.svg" alt="" aria-hidden="true" />
          <BrandMark size="lg" className="splash__brand" />
          <div className="splash__bar" aria-hidden="true">
            <span />
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Splash;
