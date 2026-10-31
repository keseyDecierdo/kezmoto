import React from 'react';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { menuOutline } from 'ionicons/icons';
import { useSidebar } from '../context/SidebarContext';
import AppTabBar from './AppTabBar';
import NotificationBell from './NotificationBell';
import './AppPage.css';

interface AppPageProps {
  title: string;
  /** Small uppercase label above the title in the page body. */
  eyebrow?: string;
  /** Shows a back button instead of the menu button. */
  backHref?: string;
  /** Toolbar buttons rendered at the end slot. */
  actions?: React.ReactNode;
  /** Sticky element between the content and the tab bar (e.g. chat composer). */
  footer?: React.ReactNode;
  /** Hide the bottom tab bar (auth screens, chat thread on mobile). */
  hideTabs?: boolean;
  /** Skip the max-width container — used by edge-to-edge layouts. */
  bleed?: boolean;
  /** Removes content padding entirely (split panes manage their own). */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Every authenticated screen renders through this shell so the header, the
 * responsive container width and the mobile tab bar stay consistent.
 */
const AppPage: React.FC<AppPageProps> = ({
  title,
  eyebrow,
  backHref,
  actions,
  footer,
  hideTabs = false,
  bleed = false,
  flush = false,
  className,
  children,
}) => {
  const { toggle } = useSidebar();

  return (
    <IonPage className={`app-page ${className ?? ''}`}>
      <IonHeader className="app-page__header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton
              className="kez-only-desktop app-page__sidebar-toggle"
              onClick={toggle}
              aria-label="Toggle sidebar"
            >
              <IonIcon slot="icon-only" icon={menuOutline} />
            </IonButton>
            {backHref ? (
              <IonBackButton defaultHref={backHref} text="" />
            ) : (
              <IonMenuButton className="kez-hide-desktop" />
            )}
          </IonButtons>
          <IonTitle>{title}</IonTitle>
          <IonButtons slot="end">
            <NotificationBell />
            {actions}
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className={`app-page__content${flush ? ' app-page__content--flush' : ''}`}>
        {flush ? (
          children
        ) : (
          <div className={bleed ? 'app-page__body' : 'app-page__body kez-container'}>
            {eyebrow && <p className="kez-eyebrow app-page__eyebrow">{eyebrow}</p>}
            {children}
          </div>
        )}
      </IonContent>

      {footer}
      {!hideTabs && <AppTabBar />}
    </IonPage>
  );
};

export default AppPage;
