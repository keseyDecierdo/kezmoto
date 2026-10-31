import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Wrap inside RequireAuth for screens that need a finished identity check
 * (valid ID + face scan). Unverified customers are sent to Profile & Settings
 * to complete it; admins are exempt. The database enforces the same rule on
 * listing inserts (0028), so this is the friendly half, not the only one.
 */
const RequireVerified: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin } = useAuth();
  if (user && !isAdmin && !user.verified) return <Navigate to="/profile?verify=1" replace />;
  return <>{children}</>;
};

export default RequireVerified;
