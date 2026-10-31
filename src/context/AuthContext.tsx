import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authApi } from '../services/api';
import type { RegisterInput, RegisterResult } from '../services/authService';
import type { IdType, User } from '../types';

interface AuthContextValue {
  user: User | null;
  /** True while the stored Supabase session is being restored on boot. */
  initializing: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  /** Finishes sign-up with the code from the verification email. */
  verifySignup: (email: string, code: string) => Promise<User>;
  logout: () => void;
  updateProfile: (patch: Partial<User>) => Promise<User>;
  submitIdVerification: (file: File, idType: IdType) => Promise<{ matched: boolean; extractedName: string }>;
  submitFaceCapture: (file: File) => Promise<{ matched: boolean; confidence: number }>;
  /** Re-run a verification step's AI check against the photo already
      stored — for a failed check, not a genuine mismatch. */
  retryIdVerification: (idType: IdType) => Promise<{ matched: boolean; extractedName: string }>;
  retryFaceCapture: () => Promise<{ matched: boolean; confidence: number }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  /* Session restore plus a live subscription: signing in or out in another
     tab, and Supabase's own token refresh, both land here. */
  useEffect(() => {
    let active = true;

    const apply = async (session?: Session | null) => {
      try {
        const next = await authApi.currentUser(session);
        if (active) setUser(next);
      } catch {
        if (active) setUser(null); // session without a readable profile — start signed out
      } finally {
        if (active) setInitializing(false);
      }
    };

    void apply();

    // Deferred: Supabase holds its auth lock while this callback runs, and the
    // profile fetch inside apply() needs that lock to build its auth header.
    const unsubscribe = authApi.onAuthChange((session) => {
      setTimeout(() => void apply(session), 0);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await authApi.login(email, password);
    setUser(next);
    return next;
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      const result = await authApi.register(input);
      if (result.status === 'done') setUser(result.user);
      return result;
    },
    []
  );

  const verifySignup = useCallback(async (email: string, code: string) => {
    const next = await authApi.verifySignupCode(email, code);
    setUser(next);
    return next;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    void authApi.logout();
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<User>) => {
      if (!user) throw new Error('You need to be signed in to update your profile.');
      const next = await authApi.updateProfile(user, patch);
      setUser(next);
      return next;
    },
    [user]
  );

  const submitIdVerification = useCallback(
    async (file: File, idType: IdType) => {
      if (!user) throw new Error('You need to be signed in to upload a valid ID.');
      const { user: next, matched, extractedName } = await authApi.submitIdVerification(user, file, idType);
      setUser(next);
      return { matched, extractedName };
    },
    [user]
  );

  const submitFaceCapture = useCallback(
    async (file: File) => {
      if (!user) throw new Error('You need to be signed in to verify your face.');
      const { user: next, matched, confidence } = await authApi.submitFaceCapture(user, file);
      setUser(next);
      return { matched, confidence };
    },
    [user]
  );

  const retryIdVerification = useCallback(
    async (idType: IdType) => {
      if (!user) throw new Error('You need to be signed in to verify your ID.');
      const { user: next, matched, extractedName } = await authApi.retryIdVerification(user, idType);
      setUser(next);
      return { matched, extractedName };
    },
    [user]
  );

  const retryFaceCapture = useCallback(async () => {
    if (!user) throw new Error('You need to be signed in to verify your face.');
    const { user: next, matched, confidence } = await authApi.retryFaceCapture(user);
    setUser(next);
    return { matched, confidence };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      login,
      register,
      verifySignup,
      logout,
      updateProfile,
      submitIdVerification,
      submitFaceCapture,
      retryIdVerification,
      retryFaceCapture,
    }),
    [
      user,
      initializing,
      login,
      register,
      verifySignup,
      logout,
      updateProfile,
      submitIdVerification,
      submitFaceCapture,
      retryIdVerification,
      retryFaceCapture,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
