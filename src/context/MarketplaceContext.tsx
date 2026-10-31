import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { chatsApi, favoritesApi } from '../services/api';
import { useAuth } from './AuthContext';
import type { ChatThread, Listing, WantedPost } from '../types';

/** Pre-filled body used when a buyer taps "Send Message" on a unit card. */
export const DEFAULT_ENQUIRY = 'Is this unit still available?';

interface MarketplaceContextValue {
  favoriteIds: string[];
  isFavorite: (listingId: string) => boolean;
  toggleFavorite: (listingId: string) => Promise<void>;
  /** Bumped whenever listings/threads change so screens can re-fetch. */
  revision: number;
  invalidate: () => void;
  /** Finds or creates the thread for a unit and returns it. */
  startThreadForListing: (listing: Listing) => Promise<ChatThread>;
  /** Finds or creates the thread for reaching out about a Wanted post. */
  startThreadForWantedPost: (post: WantedPost) => Promise<ChatThread>;
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export const MarketplaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);

  // Favorites belong to an account, so they are loaded per signed-in user and
  // cleared on sign-out rather than fetched once on boot.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setFavoriteIds([]);
      return () => {
        cancelled = true;
      };
    }
    favoritesApi
      .list()
      .then((ids) => {
        if (!cancelled) setFavoriteIds(ids);
      })
      .catch(() => {
        if (!cancelled) setFavoriteIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const invalidate = useCallback(() => setRevision((r) => r + 1), []);

  const toggleFavorite = useCallback(async (listingId: string) => {
    // Optimistic: the star reacts immediately, then reconciles with the row.
    setFavoriteIds((prev) =>
      prev.includes(listingId) ? prev.filter((id) => id !== listingId) : [listingId, ...prev]
    );
    try {
      setFavoriteIds(await favoritesApi.toggle(listingId));
    } catch {
      // The write failed; re-read so the star matches what is actually stored.
      setFavoriteIds(await favoritesApi.list().catch(() => []));
    }
  }, []);

  const isFavorite = useCallback(
    (listingId: string) => favoriteIds.includes(listingId),
    [favoriteIds]
  );

  const startThreadForListing = useCallback(
    async (listing: Listing) => {
      const thread = await chatsApi.openThreadForListing(listing);
      invalidate();
      return thread;
    },
    [invalidate]
  );

  const startThreadForWantedPost = useCallback(
    async (post: WantedPost) => {
      const thread = await chatsApi.openThreadForWantedPost(post);
      invalidate();
      return thread;
    },
    [invalidate]
  );

  const value = useMemo<MarketplaceContextValue>(
    () => ({
      favoriteIds,
      isFavorite,
      toggleFavorite,
      revision,
      invalidate,
      startThreadForListing,
      startThreadForWantedPost,
    }),
    [
      favoriteIds,
      isFavorite,
      toggleFavorite,
      revision,
      invalidate,
      startThreadForListing,
      startThreadForWantedPost,
    ]
  );

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
};

export function useMarketplace(): MarketplaceContextValue {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) throw new Error('useMarketplace must be used inside <MarketplaceProvider>.');
  return ctx;
}
