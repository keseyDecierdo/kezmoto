import React from 'react';
import { IonContent, IonIcon, IonPage, useIonRouter } from '@ionic/react';
import { arrowBackOutline } from 'ionicons/icons';
import BrandMark from '../components/BrandMark';
import { LEGAL_UPDATED, PRIVACY, REFUNDS, TERMS } from './legalContent';
import type { LegalDoc } from './legalContent';
import './Legal.css';

const DOCS: Record<'privacy' | 'terms' | 'refunds', LegalDoc> = {
  privacy: PRIVACY,
  terms: TERMS,
  refunds: REFUNDS,
};

const LINKS = [
  { id: 'privacy', label: 'Privacy Policy', href: '/privacy' },
  { id: 'terms', label: 'Terms of Service', href: '/terms' },
  { id: 'refunds', label: 'Refund Policy', href: '/refunds' },
] as const;

/** Privacy Policy, Terms of Service and Refund Policy: public, readable pages. */
const Legal: React.FC<{ doc: keyof typeof DOCS }> = ({ doc }) => {
  const router = useIonRouter();
  const content = DOCS[doc];

  return (
    <IonPage className="legal">
      <IonContent>
        <div className="legal__wrap">
          <header className="legal__top">
            <button
              type="button"
              className="legal__back"
              onClick={() => (window.history.length > 1 ? window.history.back() : router.push('/', 'root'))}
            >
              <IonIcon icon={arrowBackOutline} aria-hidden="true" />
              Back
            </button>
            <a href="/" className="legal__brand" aria-label="KEZMOTO home">
              <BrandMark size="sm" />
            </a>
          </header>

          <nav className="legal__tabs" aria-label="Legal documents">
            {LINKS.map((link) => (
              <a key={link.id} href={link.href} className={link.id === doc ? 'is-active' : ''}>
                {link.label}
              </a>
            ))}
          </nav>

          <article className="legal__doc">
            <h1 className="kez-display">{content.title}</h1>
            <p className="legal__updated">Last updated {LEGAL_UPDATED}</p>
            <p className="legal__intro">{content.intro}</p>

            {content.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.body}
              </section>
            ))}
          </article>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Legal;
