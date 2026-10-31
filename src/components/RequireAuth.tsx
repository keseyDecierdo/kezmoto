import React from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { LoadingState } from './StateViews';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface RequireAuthProps {
  children: React.ReactNode;
  /** Admin-only route: signed-in customers are sent back to Home. */
  admin?: boolean;
}

/**
 * Route guard for the authenticated portion of the app. Reads the restored
 * Supabase session through AuthContext, so a hard refresh on a protected
 * route waits for the session rather than bouncing to Login.
 */
const RequireAuth: React.FC<RequireAuthProps> = ({ children, admin = false }) => {
  const { isAuthenticated, isAdmin, initializing } = useAuth();

  if (initializing) {
    return (
      <IonPage>
        <IonContent className="app-page__content">
          <div className="app-page__body kez-container">
            <LoadingState label="Loading" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/home" replace />;

  return <>{children}</>;
};

export default RequireAuth;
