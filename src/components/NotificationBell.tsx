import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon, useIonRouter } from '@ionic/react';
import { checkmarkDoneOutline, notificationsOutline } from 'ionicons/icons';
import { useAuth } from '../context/AuthContext';
import { notificationsApi, type AppNotification } from '../services/api';
import { formatRelative } from '../utils/format';
import './NotificationBell.css';

/**
 * Floating bell + panel, mounted once in AppPage's header so it's on every
 * authenticated screen. Loads recent notifications on open, then stays live
 * via the same realtime-subscribe pattern chat threads and transactions use.
 *
 * The panel is portalled to <body> rather than rendered inline: it lives
 * inside IonToolbar/IonButtons, and Ionic's toolbar clips overflowing
 * absolutely-positioned content to its own (56px-tall) box — confirmed live,
 * the panel had a correct on-screen rect but was unclickable/invisible,
 * painted behind the page. A portal sidesteps that clipping entirely; its
 * position is computed from the trigger button's rect instead of CSS
 * relative-to-parent positioning.
 */
const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const router = useIonRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = items.filter((item) => !item.read).length;

  // Keyed on the id, not the user object — `user` gets a new reference on
  // every profile update (any edit, an avatar upload), which would tear
  // down and recreate the realtime channel each time. Confirmed live: that
  // raced against the channel's own async removal and crashed the app
  // ("cannot add postgres_changes callbacks... after subscribe()").
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    void notificationsApi.list().then((list) => {
      setItems(list);
      setLoaded(true);
    });
    return notificationsApi.subscribeToNotifications(userId, (notification) => {
      setItems((prev) => [notification, ...prev]);
    });
  }, [userId]);

  // Close on an outside click — the portalled panel is no longer a DOM
  // descendant of wrapRef, so it's checked separately.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const toggle = () => {
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen((prev) => !prev);
  };

  const openItem = (item: AppNotification) => {
    setOpen(false);
    if (!item.read) {
      setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)));
      void notificationsApi.markRead(item.id);
    }
    if (item.link) router.push(item.link, 'forward');
  };

  const markAllRead = () => {
    setItems((prev) => prev.map((entry) => ({ ...entry, read: true })));
    void notificationsApi.markAllRead();
  };

  if (!user) return null;

  return (
    <div className="notification-bell" ref={wrapRef}>
      <button
        type="button"
        className="notification-bell__trigger"
        onClick={toggle}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <IonIcon icon={notificationsOutline} />
        {unreadCount > 0 && (
          <span className="notification-bell__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="notification-bell__panel"
            style={{ top: panelPos.top, right: panelPos.right }}
            role="dialog"
            aria-label="Notifications"
          >
            <header className="notification-bell__head">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead}>
                  <IonIcon icon={checkmarkDoneOutline} />
                  Mark all read
                </button>
              )}
            </header>

            <div className="notification-bell__list">
              {!loaded && <p className="notification-bell__empty">Loading…</p>}
              {loaded && items.length === 0 && (
                <p className="notification-bell__empty">Nothing yet — new messages and updates land here.</p>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`notification-bell__item${item.read ? '' : ' is-unread'}`}
                  onClick={() => openItem(item)}
                >
                  <strong>{item.title}</strong>
                  {item.body && <span>{item.body}</span>}
                  <time>{formatRelative(item.createdAt)}</time>
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default NotificationBell;
