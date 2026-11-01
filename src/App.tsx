import React from 'react';
import { Navigate, Route, useLocation } from 'react-router-dom';
import { IonApp, IonRouterOutlet, IonSplitPane, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/* KEZMOTO is dark-only by design - the dark palette is always on, never a toggle. */
import '@ionic/react/css/palettes/dark.always.css';

/* Theme (tokens first, then global rules that consume them) */
import './theme/variables.css';
import './theme/global.css';

import AiChatbot from './components/AiChatbot';
import { modalEnter, modalLeave } from './lib/motion';
import RequireAuth from './components/RequireAuth';
import CustomerOnly from './components/CustomerOnly';
import SideMenu from './components/SideMenu';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MarketplaceProvider } from './context/MarketplaceContext';
import { SidebarProvider } from './context/SidebarContext';
import { useBreakpoint } from './hooks/useBreakpoint';

import RequireVerified from './components/RequireVerified';
import Auth from './pages/Auth';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ChatThreadPage from './pages/ChatThreadPage';
import Favorites from './pages/Favorites';
import FraudReview from './pages/FraudReview';
import Home from './pages/Home';
import Landing from './pages/Landing';
import AdminPlans from './pages/AdminPlans';
import Legal from './pages/Legal';
import ListingAppeals from './pages/ListingAppeals';
import Plans from './pages/Plans';
import ListingDetail from './pages/ListingDetail';
import Messages from './pages/Messages';
import Middleman from './pages/Middleman';
import MyUnits from './pages/MyUnits';
import Onboarding from './pages/Onboarding';
import Placeholder from './pages/Placeholder';
import Profile from './pages/Profile';
import PublicProfile from './pages/PublicProfile';
import Reports from './pages/Reports';
import Sellers from './pages/Sellers';
import SellerUnits from './pages/SellerUnits';
import Splash from './pages/Splash';
import TransactionDetail from './pages/TransactionDetail';
import Transactions from './pages/Transactions';
import UnitForm from './pages/UnitForm';
import ManageUsers from './pages/ManageUsers';
import UserReports from './pages/UserReports';
import Wanted from './pages/Wanted';

setupIonicReact({ modalEnter, modalLeave });

/** Marketing and auth screens never show the app chrome. */
const PUBLIC_ROUTES = ['/', '/splash', '/onboarding', '/login', '/register', '/forgot-password', '/reset-password', '/privacy', '/terms', '/refunds'];

/**
 * Split pane docks the sidebar from 1024px up for signed-in users on app
 * screens; below that (and on every public screen) the same menu is an overlay
 * drawer and the bottom tab bar carries primary navigation.
 */
const Shell: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const showChrome = isAuthenticated && !PUBLIC_ROUTES.includes(pathname);
  // Gives the AI Assistant listing context when it's mounted while the
  // buyer is looking at that specific unit - see the global mount below.
  const listingIdFromPath = pathname.match(/^\/listing\/([^/]+)/)?.[1];
  // The chat composer's own Send button sits in the exact same bottom-right
  // corner as the AI assistant bubble whenever a conversation is open - the
  // full thread route always has one, and Messages only shows its split
  // view (with an embedded composer) from tablet width up; on phone width
  // it's list-only, nothing to clear. See the global mount below.
  const breakpoint = useBreakpoint();
  // On desktop the chat column and the Messages split both keep a lane
  // free for the button (ChatThreadPage.css / Messages.css), so it stays in
  // its normal corner there and is only lifted on phones and tablets.
  const chatComposerVisible =
    breakpoint !== 'desktop' &&
    (pathname.startsWith('/chat/') || (pathname === '/messages' && breakpoint !== 'mobile'));

  return (
    <>
    <IonSplitPane contentId="main" when="(min-width: 1024px)" disabled={!showChrome}>
      <SideMenu disabled={!showChrome} />

      <IonRouterOutlet id="main">
        {/* ---------------- Public ---------------- */}
        <Route path="/" element={<Landing />} />
        <Route path="/splash" element={<Splash />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<Legal doc="privacy" />} />
        <Route path="/terms" element={<Legal doc="terms" />} />
        <Route path="/refunds" element={<Legal doc="refunds" />} />
        <Route path="/listing/:id" element={<ListingDetail />} />

        {/* ---------------- Customer & Admin ---------------- */}
        <Route
          path="/home"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        <Route
          path="/units"
          element={
            <RequireAuth>
              <MyUnits />
            </RequireAuth>
          }
        />
        <Route
          path="/units/new"
          element={
            <RequireAuth>
              <RequireVerified>
                <UnitForm />
              </RequireVerified>
            </RequireAuth>
          }
        />
        <Route
          path="/units/:id/edit"
          element={
            <RequireAuth>
              <UnitForm />
            </RequireAuth>
          }
        />
        <Route
          path="/wanted"
          element={
            <RequireAuth>
              <Wanted />
            </RequireAuth>
          }
        />
        <Route
          path="/messages"
          element={
            <RequireAuth>
              <Messages />
            </RequireAuth>
          }
        />
        <Route
          path="/chat/:id"
          element={
            <RequireAuth>
              <ChatThreadPage />
            </RequireAuth>
          }
        />
        <Route
          path="/favorites"
          element={
            <RequireAuth>
              <Favorites />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/profile/:id"
          element={
            <RequireAuth>
              <PublicProfile />
            </RequireAuth>
          }
        />
        <Route
          path="/transactions"
          element={
            <RequireAuth>
              <Transactions />
            </RequireAuth>
          }
        />
        <Route
          path="/sellers"
          element={
            <RequireAuth>
              <Sellers />
            </RequireAuth>
          }
        />
        <Route
          path="/sellers/:id/units"
          element={
            <RequireAuth>
              <SellerUnits />
            </RequireAuth>
          }
        />

        {/* AI Assistant is the floating chatbot mounted globally below, once per session - no standalone route. */}

        {/* ------- Out of Phase 1 scope: routes only, no logic ------- */}
        <Route
          path="/admin/plans"
          element={
            <RequireAuth admin>
              <AdminPlans />
            </RequireAuth>
          }
        />
        <Route
          path="/plans"
          element={
            <RequireAuth>
              <CustomerOnly redirectTo="/admin/plans">
                <Plans />
              </CustomerOnly>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/middleman"
          element={
            <RequireAuth admin>
              <Middleman />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/transactions/:id"
          element={
            <RequireAuth admin>
              <TransactionDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/verification"
          element={
            <RequireAuth admin>
              <Placeholder
                title="Verification Checklist"
                summary="Reached per-deal now: open a transaction from Middleman Requests, then use its Verification tab."
              />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/user-reports"
          element={
            <RequireAuth admin>
              <UserReports />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAuth admin>
              <ManageUsers />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/appeals"
          element={
            <RequireAuth admin>
              <ListingAppeals />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <RequireAuth admin>
              <Reports />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/fraud"
          element={
            <RequireAuth admin>
              <FraudReview />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
    </IonRouterOutlet>
    </IonSplitPane>

    {/* Global, persists across navigation instead of remounting per-page -
        listingIdFromPath keeps the listing-aware context on that one route. */}
    {/* Hidden while messaging a person on a phone: two chat boxes on one
        small screen confuse more than they help. */}
    {isAuthenticated && !(pathname.startsWith('/chat/') && breakpoint === 'mobile') && (
      <AiChatbot listingId={listingIdFromPath} raised={chatComposerVisible} />
    )}
    </>
  );
};

const App: React.FC = () => (
  <IonApp>
    <AuthProvider>
      <MarketplaceProvider>
        <SidebarProvider>
          <IonReactRouter>
            <Shell />
          </IonReactRouter>
        </SidebarProvider>
      </MarketplaceProvider>
    </AuthProvider>
  </IonApp>
);

export default App;
