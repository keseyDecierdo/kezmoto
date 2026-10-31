/* =========================================================================
   KEZMOTO — one motion language for every overlay
   IonModal (via setupIonicReact) and the SweetAlert dialogs share these
   timings: a fluid, slightly springy entrance and a quick exit. The CSS
   side reads the same values from the --kez-ease-* / --kez-dur-* tokens in
   theme/variables.css — keep the two in sync.
   ========================================================================= */

import { createAnimation } from '@ionic/react';
import type { Animation } from '@ionic/react';

export const EASE_FLUID = 'cubic-bezier(0.22, 1.2, 0.36, 1)';
export const EASE_EXIT = 'cubic-bezier(0.4, 0, 1, 1)';
export const DUR_ENTER = 380;
export const DUR_EXIT = 200;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Phones get a bottom sheet (see .kez-modal in global.css); wider screens a card. */
const isSheet = (): boolean => typeof window !== 'undefined' && window.innerWidth < 600;

const parts = (baseEl: HTMLElement) => {
  const root = baseEl.shadowRoot ?? baseEl;
  return {
    backdrop: root.querySelector('ion-backdrop') as Element,
    wrapper: root.querySelector('.modal-wrapper, .modal-shadow') as Element,
  };
};

const build = (baseEl: HTMLElement, entering: boolean): Animation => {
  const { backdrop, wrapper } = parts(baseEl);
  const reduced = prefersReducedMotion();
  const duration = reduced ? 140 : entering ? DUR_ENTER : DUR_EXIT;
  const easing = reduced ? 'linear' : entering ? EASE_FLUID : EASE_EXIT;

  const hidden = reduced
    ? 'none'
    : isSheet()
      ? 'translateY(100%)'
      : 'scale(0.94) translateY(12px)';

  const backdropAnim = createAnimation()
    .addElement(backdrop)
    .fromTo('opacity', entering ? '0.01' : 'var(--backdrop-opacity)', entering ? 'var(--backdrop-opacity)' : '0')
    .beforeStyles({ 'pointer-events': 'none' })
    .afterClearStyles(['pointer-events']);

  const wrapperAnim = createAnimation()
    .addElement(wrapper)
    .keyframes(
      entering
        ? [
            { offset: 0, opacity: '0', transform: hidden },
            { offset: 1, opacity: '1', transform: 'none' },
          ]
        : [
            { offset: 0, opacity: '1', transform: 'none' },
            { offset: 1, opacity: '0', transform: hidden },
          ]
    );

  return createAnimation()
    .addElement(baseEl)
    .easing(easing)
    .duration(duration)
    .addAnimation([backdropAnim, wrapperAnim]);
};

export const modalEnter = (baseEl: HTMLElement): Animation => build(baseEl, true);
export const modalLeave = (baseEl: HTMLElement): Animation => build(baseEl, false);
