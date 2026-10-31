import React from 'react';
import { IonContent, IonIcon, IonPage, useIonRouter } from '@ionic/react';
import { arrowBackOutline } from 'ionicons/icons';
import BrandMark from './BrandMark';
import '../pages/Auth.css';

interface AuthShellProps {
  title: string;
  subtitle: string;
  /** Where "Back" goes. */
  backHref?: string;
  children: React.ReactNode;
}

/**
 * The Log in / Register look (photo panel on desktop, centred logo on
 * phones) for the other account screens: Forgot password and Reset password.
 */
const AuthShell: React.FC<AuthShellProps> = ({ title, subtitle, backHref = '/login', children }) => {
  const router = useIonRouter();

  return (
    <IonPage className="auth">
      <IonContent fullscreen>
        <div className="auth__layout">
          <aside className="auth__aside">
            <div className="auth__aside-glow" aria-hidden="true" />
            <div className="auth__aside-inner">
              <BrandMark size="lg" />
              <p className="auth__aside-copy">
                Buy and sell second-hand motorcycles directly — with an admin middleman available
                whenever a deal needs one.
              </p>
            </div>
          </aside>

          <section className="auth__panel">
            <button type="button" className="auth__back" onClick={() => router.push(backHref, 'back')}>
              <IonIcon icon={arrowBackOutline} />
              Back
            </button>

            <div className="auth__brand-mobile">
              <BrandMark size="md" />
            </div>

            <header className="auth__head">
              <h1 className="kez-display">{title}</h1>
              <p className="kez-muted">{subtitle}</p>
            </header>

            {children}
          </section>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AuthShell;
