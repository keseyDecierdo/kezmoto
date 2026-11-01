import {
  addCircleOutline,
  arrowUndoOutline,
  bookmarkOutline,
  chatbubblesOutline,
  flagOutline,
  gridOutline,
  heartOutline,
  megaphoneOutline,
  peopleOutline,
  personCircleOutline,
  receiptOutline,
  shieldCheckmarkOutline,
  shieldOutline,
  diamondOutline,
  statsChartOutline,
  storefrontOutline,
} from 'ionicons/icons';
import type { UserRole } from '../types';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  /** Restricts the item to one role; omitted means "everyone". */
  role?: UserRole;
  /** Phase 2+ screens are shown but marked as not yet available. */
  comingSoon?: boolean;
}

/** Bottom tab bar on mobile/tablet, top of the sidebar on desktop. */
export const PRIMARY_NAV: NavItem[] = [
  { id: 'home', label: 'Home', href: '/home', icon: gridOutline },
  { id: 'wanted', label: 'Wanted', href: '/wanted', icon: megaphoneOutline },
  { id: 'sell', label: 'Sell', href: '/units/new', icon: addCircleOutline },
  { id: 'messages', label: 'Messages', href: '/messages', icon: chatbubblesOutline },
  { id: 'favorites', label: 'Saved', href: '/favorites', icon: heartOutline },
];

/**
 * Secondary destinations: menu drawer on mobile, lower sidebar on desktop.
 * The AI Assistant (Phase 5) is a floating chatbot on Home/Listing Detail,
 * not a page of its own — no nav entry for it.
 */
export const SECONDARY_NAV: NavItem[] = [
  { id: 'my-units', label: 'My Units', href: '/units', icon: bookmarkOutline },
  { id: 'sellers', label: 'Sellers', href: '/sellers', icon: storefrontOutline },
  { id: 'transactions', label: 'Transactions', href: '/transactions', icon: receiptOutline },
  // Customers only: admins already have unlimited listings and review the
  // payments on Plan Payments instead.
  { id: 'plans', label: 'KEZMOTO Pro', href: '/plans', icon: diamondOutline, role: 'customer' },
];

/** Pinned to the sidebar footer, just above Logout. */
export const PROFILE_NAV: NavItem = {
  id: 'profile',
  label: 'Profile & Settings',
  href: '/profile',
  icon: personCircleOutline,
};

/**
 * Admin-only tools. Middleman Requests and Reports are wired up (Phase 3).
 * Verification is reached per-deal from a transaction (Middleman Requests →
 * a transaction's Verification tab), not its own list screen, so there's no
 * sidebar entry for it — the old /admin/verification placeholder route is
 * left in App.tsx in case anything still links to it directly.
 */
export const ADMIN_NAV: NavItem[] = [
  {
    id: 'middleman',
    label: 'Middleman Requests',
    href: '/admin/middleman',
    icon: shieldCheckmarkOutline,
    role: 'admin',
  },
  {
    id: 'appeals',
    label: 'Listing Appeals',
    href: '/admin/appeals',
    icon: arrowUndoOutline,
    role: 'admin',
  },
  {
    id: 'user-reports',
    label: 'User Reports',
    href: '/admin/user-reports',
    icon: flagOutline,
    role: 'admin',
  },
  {
    id: 'users',
    label: 'Manage Users',
    href: '/admin/users',
    icon: peopleOutline,
    role: 'admin',
  },
  {
    id: 'plan-payments',
    label: 'Plan Payments',
    href: '/admin/plans',
    icon: diamondOutline,
    role: 'admin',
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/admin/reports',
    icon: statsChartOutline,
    role: 'admin',
  },
  {
    id: 'fraud',
    label: 'Fraud Flag Review',
    href: '/admin/fraud',
    icon: shieldOutline,
    role: 'admin',
  },
];

/** Matches a pathname to the nav item that should read as selected. */
export const activeNavId = (pathname: string): string | null => {
  // Your own profile is exactly /profile; /profile/<id> is someone else's,
  // usually reached from Sellers.
  if (pathname === PROFILE_NAV.href) return PROFILE_NAV.id;
  if (pathname.startsWith(`${PROFILE_NAV.href}/`)) return 'sellers';
  const all = [...PRIMARY_NAV, ...SECONDARY_NAV, ...ADMIN_NAV];
  // Longest href first so /units/new does not match /units.
  const match = [...all]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (match) return match.id;
  if (pathname.startsWith('/listing')) return 'home';
  if (pathname.startsWith('/chat')) return 'messages';
  if (pathname.startsWith('/admin/transactions')) return 'middleman';
  return null;
};
