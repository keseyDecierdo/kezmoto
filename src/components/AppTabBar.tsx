import React from 'react';
import { IonIcon, IonMenuToggle } from '@ionic/react';
import { menuOutline } from 'ionicons/icons';
import { useLocation } from 'react-router-dom';
import { useGatedNav } from '../hooks/useGatedNav';
import { PRIMARY_NAV, activeNavId } from '../navigation/navItems';
import './AppTabBar.css';

/** Saved lives in the Menu drawer on phones, so the bar fits a labelled Menu tab. */
const TAB_ITEMS = PRIMARY_NAV.filter((item) => item.id !== 'favorites');

/**
 * Primary navigation for mobile and tablet. Hidden from 1024px up, where the
 * persistent sidebar in the split pane takes over (see global.css). The last
 * tab, "Menu", opens the drawer with every other page - a labelled button
 * is far easier to find than the small ☰ in the header.
 */
const AppTabBar: React.FC = () => {
  const handleNavClick = useGatedNav();
  const { pathname } = useLocation();
  const active = activeNavId(pathname);
  const inMenu = active !== null && !TAB_ITEMS.some((item) => item.id === active);

  return (
    <nav className="kez-tabbar" aria-label="Primary">
      {TAB_ITEMS.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`kez-tabbar__btn${isActive ? ' is-active' : ''}${
              item.id === 'sell' ? ' kez-tabbar__btn--accent' : ''
            }`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => void handleNavClick(item)}
          >
            <IonIcon icon={item.icon} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
      <IonMenuToggle autoHide={false} className="kez-tabbar__menu-toggle">
        <button
          type="button"
          className={`kez-tabbar__btn${inMenu ? ' is-active' : ''}`}
          aria-label="Menu: Saved, My Units, Transactions, Profile and more"
        >
          <IonIcon icon={menuOutline} aria-hidden="true" />
          <span>Menu</span>
        </button>
      </IonMenuToggle>
    </nav>
  );
};

export default AppTabBar;
