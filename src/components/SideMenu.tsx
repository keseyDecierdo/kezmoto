import React from 'react';
import { IonContent, IonFooter, IonHeader, IonIcon, IonMenu, IonMenuToggle, useIonRouter } from '@ionic/react';
import { logOutOutline } from 'ionicons/icons';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import { useGatedNav } from '../hooks/useGatedNav';
import { confirmAction } from '../lib/sweetAlert';
import { ADMIN_NAV, PRIMARY_NAV, PROFILE_NAV, SECONDARY_NAV, activeNavId, type NavItem } from '../navigation/navItems';
import Avatar from './Avatar';
import BrandMark from './BrandMark';
import './SideMenu.css';

const SAVED_NAV = PRIMARY_NAV.find((item) => item.id === 'favorites');

/**
 * One menu, three behaviours:
 *  - mobile  : overlay drawer opened from the bottom bar's Menu tab (or ☰)
 *  - tablet  : the same drawer, wider tap targets
 *  - desktop : docked permanently by <IonSplitPane when="(min-width:1024px)">
 */
const SideMenu: React.FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { user, isAdmin, logout } = useAuth();
  const router = useIonRouter();
  const { pathname } = useLocation();
  const { collapsed } = useSidebar();
  const active = activeNavId(pathname);
  const handleNavClick = useGatedNav();

  const go = (href: string) => router.push(href, 'none', 'replace');

  const renderItem = (item: NavItem) => (
    <IonMenuToggle key={item.id} autoHide={false}>
      <button
        type="button"
        className={`side-menu__item${active === item.id ? ' is-active' : ''}`}
        onClick={() => void handleNavClick(item)}
      >
        <IonIcon icon={item.icon} aria-hidden="true" />
        <span className="side-menu__label">{item.label}</span>
        {item.comingSoon && <span className="side-menu__soon">Soon</span>}
      </button>
    </IonMenuToggle>
  );

  // Signed out, or on a marketing/auth screen: the drawer is not offered.
  if (!user || disabled) {
    return <IonMenu contentId="main" disabled className="side-menu" />;
  }

  return (
    <IonMenu
      contentId="main"
      type="overlay"
      className={`side-menu${collapsed ? ' side-menu--collapsed' : ''}`}
    >
      {/* The logo stays put; only the nav lists below it scroll. */}
      <IonHeader className="side-menu__header">
        <div className="side-menu__brand">
          <BrandMark size="md" />
        </div>
      </IonHeader>

      <IonContent className="side-menu__content">

        {/* An admin's daily pages come first, so they never sit below the fold. */}
        {isAdmin && (
          <>
            <p className="side-menu__section">Admin tools</p>
            <nav className="side-menu__nav" aria-label="Admin">
              {ADMIN_NAV.map(renderItem)}
            </nav>
          </>
        )}

        <p className="side-menu__section kez-hide-mobile">Browse</p>
        <nav className="side-menu__nav kez-hide-mobile" aria-label="Primary">
          {PRIMARY_NAV.map(renderItem)}
        </nav>

        <p className="side-menu__section">Account</p>
        <nav className="side-menu__nav" aria-label="Secondary">
          {/* On phones Saved left the bottom bar for the Menu tab, so it lives here. */}
          <div className="kez-only-mobile">{SAVED_NAV && renderItem(SAVED_NAV)}</div>
          {SECONDARY_NAV.map(renderItem)}
        </nav>
      </IonContent>

      <IonFooter className="side-menu__footer">
        <IonMenuToggle autoHide={false}>
          <button type="button" className="side-menu__user" onClick={() => go('/profile')}>
            <Avatar name={user.name} color={user.avatarColor} imageUrl={user.avatarUrl} verified={user.verified} />
            <span className="side-menu__user-text">
              <strong>{user.name}</strong>
              <span>{isAdmin ? 'Admin · Middleman' : 'Customer'}</span>
            </span>
          </button>
        </IonMenuToggle>

        {renderItem(PROFILE_NAV)}

        <IonMenuToggle autoHide={false}>
          <button
            type="button"
            className="side-menu__item side-menu__item--danger"
            onClick={() => {
              void confirmAction({
                title: 'Logout?',
                text: "You'll need to log in again to access your account.",
                confirmText: 'Logout',
                danger: true,
              }).then((confirmed) => {
                if (!confirmed) return;
                logout();
              });
            }}
          >
            <IonIcon icon={logOutOutline} aria-hidden="true" />
            <span className="side-menu__label">Logout</span>
          </button>
        </IonMenuToggle>
      </IonFooter>
    </IonMenu>
  );
};

export default SideMenu;
