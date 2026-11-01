import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Customer-only screens (e.g. KEZMOTO Pro): an admin is sent to their own page instead. */
const CustomerOnly: React.FC<{ redirectTo: string; children: React.ReactNode }> = ({ redirectTo, children }) => {
  const { isAdmin } = useAuth();
  return isAdmin ? <Navigate to={redirectTo} replace /> : <>{children}</>;
};

export default CustomerOnly;
