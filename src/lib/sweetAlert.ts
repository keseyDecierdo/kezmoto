/* =========================================================================
   KEZMOTO - Sweet Alert (vanilla, no library)

   A from-scratch replacement for the old sweetalert2 wrapper. Same public
   API as before - confirmAction() / errorAlert() - so every call site
   (SideMenu, Auth, FraudReview, ChatPanel, MyUnits, TransactionDetail)
   keeps working unmodified. Underneath, both are thin wrappers around the
   general-purpose showAlert() engine defined here.

   This file builds and animates plain DOM nodes (no JSX, no dependency) -
   it's appended straight to <body>, same mount point sweetalert2 used.
   ========================================================================= */
import { DUR_EXIT } from './motion';
import './sweetAlert.css';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface ShowAlertOptions {
  type: AlertType;
  title: string;
  text?: string;
  /** Label for the primary button. */
  confirmText: string;
  /** Presence of this option is what shows the cancel button/path. */
  cancelText?: string;
  /** Red confirm button, for a destructive action. */
  danger?: boolean;
  /** Auto-resolves `true` after this many ms, with a draining progress bar. */
  autoClose?: number;
}

/* Small draw-in icon per type - a stroke-outlined circle plus a mark, both
   animated via stroke-dasharray/stroke-dashoffset (the classic "drawing"
   technique: start fully offset, transition the offset to 0 on mount). */
const ICON_PATHS: Record<AlertType, { mark: string[]; viewBox: string }> = {
  success: { viewBox: '0 0 52 52', mark: ['M14.1 27.2l7.1 7.2 16.7-16.8'] },
  error: { viewBox: '0 0 52 52', mark: ['M16 16 L36 36', 'M36 16 L16 36'] },
  warning: { viewBox: '0 0 52 52', mark: ['M26 14 L26 30', 'M26 37 L26 38'] },
  info: { viewBox: '0 0 52 52', mark: ['M26 22 L26 38', 'M26 14 L26 15'] },
};

let activeCleanup: (() => void) | null = null;

/**
 * The general engine. Resolves `true` only if the confirm button (or an
 * autoClose timeout) fires; `false` for cancel, the X, Escape, or a
 * backdrop click.
 */
export function showAlert(opts: ShowAlertOptions): Promise<boolean> {
  // Only one alert at a time - if something is already open, tear it down
  // first rather than stacking (nothing in the app fires these concurrently).
  activeCleanup?.();

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'kez-alert-backdrop';

    const popup = document.createElement('div');
    popup.className = `kez-alert kez-alert--${opts.type}`;
    popup.setAttribute('role', 'alertdialog');
    popup.setAttribute('aria-modal', 'true');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'kez-alert__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 5 19 19M19 5 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
    closeBtn.addEventListener('click', () => finish(false));

    const iconWrap = document.createElement('div');
    iconWrap.className = 'kez-alert__icon';
    const { mark, viewBox } = ICON_PATHS[opts.type];
    iconWrap.innerHTML = `
      <svg viewBox="${viewBox}" class="kez-alert__icon-svg">
        <circle class="kez-alert__icon-circle" cx="26" cy="26" r="23" fill="none" stroke-width="3" />
        ${mark.map((d) => `<path class="kez-alert__icon-mark" d="${d}" fill="none" stroke-width="3.4" stroke-linecap="round" />`).join('')}
      </svg>`;

    const title = document.createElement('h2');
    title.className = 'kez-alert__title';
    title.textContent = opts.title;

    const body = document.createElement('div');
    body.className = 'kez-alert__body';
    body.appendChild(iconWrap);
    body.appendChild(title);
    if (opts.text) {
      const text = document.createElement('p');
      text.className = 'kez-alert__text';
      text.textContent = opts.text;
      body.appendChild(text);
    }

    const actions = document.createElement('div');
    actions.className = 'kez-alert__actions';

    if (opts.cancelText) {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'kez-alert__btn kez-alert__btn--cancel';
      cancelBtn.textContent = opts.cancelText;
      cancelBtn.addEventListener('click', () => finish(false));
      actions.appendChild(cancelBtn);
    }

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `kez-alert__btn kez-alert__btn--confirm${opts.danger ? ' kez-alert__btn--danger' : ''}`;
    confirmBtn.textContent = opts.confirmText;
    confirmBtn.addEventListener('click', () => finish(true));
    actions.appendChild(confirmBtn);

    let progressEl: HTMLDivElement | null = null;
    if (opts.autoClose) {
      const progress = document.createElement('div');
      progress.className = 'kez-alert__progress';
      progressEl = document.createElement('div');
      progressEl.className = 'kez-alert__progress-bar';
      progress.appendChild(progressEl);
      popup.appendChild(progress);
    }

    popup.appendChild(closeBtn);
    popup.appendChild(body);
    popup.appendChild(actions);
    backdrop.appendChild(popup);
    document.body.appendChild(backdrop);

    // Backdrop click (not a click that bubbled from inside the popup) cancels.
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(false);
    });

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };
    document.addEventListener('keydown', onKeydown);

    let autoCloseTimer: number | undefined;
    if (opts.autoClose && progressEl) {
      progressEl.style.transitionDuration = `${opts.autoClose}ms`;
      autoCloseTimer = window.setTimeout(() => finish(true), opts.autoClose);
    }

    function cleanup() {
      document.removeEventListener('keydown', onKeydown);
      if (autoCloseTimer) window.clearTimeout(autoCloseTimer);
      backdrop.classList.add('kez-alert-backdrop--leaving');
      window.setTimeout(() => backdrop.remove(), DUR_EXIT);
      if (activeCleanup === cleanup) activeCleanup = null;
    }
    activeCleanup = cleanup;

    // Kick off entrance + icon draw-in on the next frame so the initial
    // (pre-transition) state actually paints first.
    requestAnimationFrame(() => {
      backdrop.classList.add('kez-alert-backdrop--visible');
      popup.classList.add('kez-alert--visible');
      if (progressEl && opts.autoClose) progressEl.classList.add('kez-alert__progress-bar--draining');
      // Draw-in: set the real stroke length as the dash length, then flip
      // to offset 0 so the transition actually animates a draw rather than
      // a snap. Circle first, marks with a slight stagger.
      const circle = iconWrap.querySelector<SVGCircleElement>('.kez-alert__icon-circle');
      if (circle) {
        const len = circle.getTotalLength();
        circle.style.strokeDasharray = `${len}`;
        circle.style.strokeDashoffset = `${len}`;
        requestAnimationFrame(() => {
          circle.style.strokeDashoffset = '0';
        });
      }
      iconWrap.querySelectorAll<SVGPathElement>('.kez-alert__icon-mark').forEach((path, i) => {
        const len = path.getTotalLength();
        path.style.strokeDasharray = `${len}`;
        path.style.strokeDashoffset = `${len}`;
        window.setTimeout(() => {
          path.style.strokeDashoffset = '0';
        }, 220 + i * 90);
      });
      if (opts.type === 'error') {
        window.setTimeout(() => popup.classList.add('kez-alert--shake'), 260);
      }
    });

    // Destructive confirms focus Cancel by default so a stray Enter key
    // doesn't fire the dangerous action; everything else focuses Confirm.
    const cancelBtn = actions.querySelector<HTMLButtonElement>('.kez-alert__btn--cancel');
    (opts.danger && cancelBtn ? cancelBtn : confirmBtn).focus();
  });
}

export interface ConfirmActionOptions {
  title: string;
  text?: string;
  confirmText: string;
  cancelText?: string;
  /** Red confirm button, for a destructive action. */
  danger?: boolean;
}

/** Resolves true only if the user picked the confirm button. */
export async function confirmAction(opts: ConfirmActionOptions): Promise<boolean> {
  return showAlert({
    type: 'warning',
    title: opts.title,
    text: opts.text,
    confirmText: opts.confirmText,
    cancelText: opts.cancelText ?? 'Cancel',
    danger: opts.danger,
  });
}

export interface ErrorAlertOptions {
  title: string;
  text?: string;
}

export async function errorAlert(opts: ErrorAlertOptions): Promise<void> {
  await showAlert({
    type: 'error',
    title: opts.title,
    text: opts.text,
    confirmText: 'OK',
  });
}
