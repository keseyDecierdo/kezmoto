import React, { createContext, useContext, useMemo, useState } from 'react';

/**
 * Whether the desktop-docked sidebar (App.tsx's <IonSplitPane>) is
 * collapsed. Lives here rather than on Shell itself because the toggle
 * button is rendered per-page inside AppPage — a sibling of the split pane,
 * not a descendant of it. In-memory only; resets on reload by design.
 */
interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);

  const value = useMemo<SidebarContextValue>(
    () => ({ collapsed, toggle: () => setCollapsed((prev) => !prev) }),
    [collapsed]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
};

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used inside <SidebarProvider>.');
  return ctx;
}
