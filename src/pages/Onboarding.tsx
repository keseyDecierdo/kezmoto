import React, { useState } from 'react';
import { IonButton, IonContent, IonIcon, IonPage, useIonRouter } from '@ionic/react';
import { arrowForwardOutline } from 'ionicons/icons';
import './Onboarding.css';

const SLIDES = [
  {
    id: 'browse',
    eyebrow: 'Step one',
    title: 'Browse real units',
    body: 'Every listing is posted by the person who owns the motorcycle, with photos, mileage, condition notes and the reason it is being sold.',
    art: '/mock/bike-01.svg',
  },
  {
    id: 'list',
    eyebrow: 'Step two',
    title: 'List yours in minutes',
    body: 'Five photos, two documents, condition notes and your price. Black out anything private on the OR/CR before it goes live.',
    art: '/mock/bike-03.svg',
  },
  {
    id: 'assist',
    eyebrow: 'Step three',
    title: 'Bring in a middleman',
    body: 'Not comfortable meeting a stranger with cash? Request a KEZMOTO admin to handle the hand-off for either side of the deal.',
    art: '/mock/bike-06.svg',
  },
];

const Onboarding: React.FC = () => {
  const router = useIonRouter();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  return (
    <IonPage className="onboarding">
      <IonContent fullscreen>
        <div className="onboarding__inner">
          <button type="button" className="onboarding__skip" onClick={() => router.push('/register', 'forward')}>
            Skip
          </button>

          <div className="onboarding__art">
            <img src={slide.art} alt="" aria-hidden="true" />
          </div>

          <div className="onboarding__copy">
            <p className="kez-eyebrow">{slide.eyebrow}</p>
            <h1 className="kez-display">{slide.title}</h1>
            <p className="kez-body">{slide.body}</p>
          </div>

          <div className="onboarding__dots" aria-hidden="true">
            {SLIDES.map((s, i) => (
              <span key={s.id} className={i === index ? 'is-active' : undefined} />
            ))}
          </div>

          <div className="onboarding__actions">
            {isLast ? (
              <>
                <IonButton expand="block" className="kez-cta" onClick={() => router.push('/register', 'forward')}>
                  Create an account
                </IonButton>
                <IonButton expand="block" fill="clear" color="light" onClick={() => router.push('/login', 'forward')}>
                  I already have an account
                </IonButton>
              </>
            ) : (
              <>
                <IonButton expand="block" className="kez-cta" onClick={() => setIndex(index + 1)}>
                  Next
                  <IonIcon slot="end" icon={arrowForwardOutline} />
                </IonButton>
                <IonButton expand="block" fill="clear" color="medium" onClick={() => router.push('/', 'back')}>
                  Back to home
                </IonButton>
              </>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Onboarding;
