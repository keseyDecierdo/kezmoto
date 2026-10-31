import { useIonRouter } from '@ionic/react';
import { useAuth } from '../context/AuthContext';
import { showAlert } from '../lib/sweetAlert';
import { listingsApi } from '../services/api';
import type { NavItem } from '../navigation/navItems';

/** Intercepts taps on "Sell" / "My Units" to explain why they're blocked,
 *  instead of letting the user bounce off a route guard or an empty page. */
export function useGatedNav() {
  const router = useIonRouter();
  const { user, isAdmin } = useAuth();

  return async (item: NavItem) => {
    if (user && !isAdmin) {
      if (item.id === 'sell' && !user.verified) {
        await showAlert({
          type: 'warning',
          title: 'Verification required',
          text: 'You need to verify yourself first before selling a motorcycle unit.',
          confirmText: 'OK',
        });
        return;
      }
      if (item.id === 'my-units') {
        try {
          const listings = await listingsApi.listBySeller(user.id);
          if (listings.length === 0) {
            await showAlert({
              type: 'warning',
              title: 'No units yet',
              text: 'You need to sell a motorcycle first before this page is available.',
              confirmText: 'OK',
            });
            return;
          }
        } catch {
          // Transient load error — don't block navigation over it.
        }
      }
    }
    router.push(item.href, 'none', 'replace');
  };
}
