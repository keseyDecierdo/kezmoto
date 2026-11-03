import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useMarketplace } from './MarketplaceContext';
import { chatsApi } from '../services/api';
import { isArchivedThread } from '../utils/archive';

/** How many messages the signed-in customer hasn't read, across active chats. */
const UnreadContext = createContext<number>(0);

/** Fallback refresh in case a live update is missed. */
const POLL_MS = 60_000;

/**
 * One shared unread counter for the sidebar and the phone tab bar. Uses the
 * same numbers as the Messages list (unreadCount per thread, archived chats
 * left out). Customers only: an admin's read position isn't tracked, so their
 * count could never clear.
 */
export const UnreadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin } = useAuth();
  const { revision } = useMarketplace();
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  const enabled = Boolean(user) && !isAdmin;
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const [threads, archived] = await Promise.all([chatsApi.listThreads(), chatsApi.listArchived()]);
      setCount(
        threads
          .filter((t) => !isArchivedThread(t, archived.get(t.id)))
          .reduce((sum, t) => sum + t.unreadCount, 0)
      );
    } catch {
      // Keep the last count; the next refresh will try again.
    }
  }, [enabled]);

  // Sign-in, any page change (opening a chat marks it read) and data changes.
  useEffect(() => {
    void refresh();
  }, [refresh, pathname, revision, user?.id]);

  // Live: a new message anywhere the viewer can see, debounced; plus a slow poll.
  useEffect(() => {
    if (!enabled) return;
    const schedule = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void refresh(), 1000);
    };
    const unsubscribe = chatsApi.subscribeToAllMessages(schedule);
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [enabled, refresh]);

  return <UnreadContext.Provider value={count}>{children}</UnreadContext.Provider>;
};

export const useUnreadCount = (): number => useContext(UnreadContext);
