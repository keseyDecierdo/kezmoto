/* =========================================================================
   KEZMOTO — Authentication and profiles
   Supabase Auth owns credentials; `profiles` owns everything the app shows
   about a person. A database trigger creates the profile row on signup, so
   there is never a session without a profile behind it.
   ========================================================================= */

import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { ProfileRow } from '../lib/database.types';
import type { IdType, User } from '../types';
import { mapProfile } from './mappers';
import { aiApi } from './aiService';
import { uploadFaceCapture, uploadIdDocument } from './storageService';

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  location: string;
  password: string;
}

const loadProfile = async (userId: string, email: string): Promise<User> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('profile_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load your profile. (${error.message})`);
  if (!data) throw new Error('Your account has no profile yet. Sign out and sign in again.');
  if ((data as ProfileRow).is_disabled) {
    // Supabase Auth would otherwise keep the session alive after a disabled
    // account's credentials check out.
    await supabase.auth.signOut();
    throw new Error('This account has been disabled. Contact KEZMOTO support if you think this is a mistake.');
  }
  return mapProfile(data as ProfileRow, email);
};

export const authApi = {
  /** The signed-in user, or null. Called on boot and on every auth change. */
  async currentUser(session?: Session | null): Promise<User | null> {
    const active = session ?? (await supabase.auth.getSession()).data.session;
    if (!active?.user) return null;
    return loadProfile(active.user.id, active.user.email ?? '');
  },

  async login(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      throw new Error(
        error.message === 'Invalid login credentials'
          ? 'That email and password combination does not match an account.'
          : error.message
      );
    }
    if (!data.user) throw new Error('Sign in did not return an account.');
    return loadProfile(data.user.id, data.user.email ?? email);
  },

  /** Every self-service signup is a Customer; Admins are promoted manually. */
  async register(input: RegisterInput): Promise<User> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        // Read by the handle_new_user() trigger to fill the profile row.
        data: {
          full_name: input.name.trim(),
          phone: input.phone.trim(),
          address: input.location.trim(),
        },
      },
    });

    if (error) {
      throw new Error(
        error.message.toLowerCase().includes('already registered')
          ? 'An account already uses that email address.'
          : error.message
      );
    }
    if (!data.user) throw new Error('Sign up did not return an account.');

    // Email confirmation is on: there is no session to continue with yet.
    if (!data.session) {
      throw new Error(
        'Account created. Check your inbox to confirm the email address, then log in.'
      );
    }

    return loadProfile(data.user.id, data.user.email ?? input.email);
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },

  /**
   * Emails a password-reset link. Supabase sends it through the project's
   * custom SMTP (Brevo — see supabase/README.md); the link lands on
   * /reset-password. Callers show the same message whether or not the
   * email exists, so this never reveals who has an account.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  },

  /** Sets a new password for the recovery session opened by the email link. */
  async updatePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },

  async updateProfile(user: User, patch: Partial<User>): Promise<User> {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...(patch.name !== undefined ? { full_name: patch.name } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.location !== undefined ? { address: patch.location } : {}),
        ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        ...(patch.facebook !== undefined ? { facebook_url: patch.facebook || null } : {}),
        ...(patch.avatarUrl !== undefined ? { profile_photo_url: patch.avatarUrl || null } : {}),
      })
      .eq('profile_id', user.id)
      .select('*')
      .single();

    if (error) throw new Error(`Could not save your profile. (${error.message})`);
    return mapProfile(data as ProfileRow, user.email);
  },

  /**
   * Step 1 of 2. Uploads a valid-ID photo and has the verify-id Edge
   * Function read the printed name off it, matching against the caller's
   * own profile name. Always returns the freshly-reloaded profile
   * (idNameMatched/idVerificationNote reflect the outcome either way)
   * alongside the raw match result, so the caller can show the specific
   * "doesn't match" prompt without having to re-derive it from the note
   * string. `verified` only flips true once step 2 (submitFaceCapture)
   * also passes.
   */
  async submitIdVerification(
    user: User,
    file: File,
    idType: IdType
  ): Promise<{ user: User; matched: boolean; extractedName: string }> {
    const path = await uploadIdDocument(user.id, file);
    const result = await aiApi.verifyId(path, idType);
    const updated = await loadProfile(user.id, user.email);
    return { user: updated, ...result };
  },

  /**
   * Step 2 of 2. Uploads a live-selfie capture and has the face-match Edge
   * Function compare it against the ID photo already on file. Requires
   * step 1 (idNameMatched) to already be true — the function itself also
   * checks this server-side, so a stale client state can't bypass it.
   * Always returns the freshly-reloaded profile.
   */
  async submitFaceCapture(
    user: User,
    file: File
  ): Promise<{ user: User; matched: boolean; confidence: number }> {
    const path = await uploadFaceCapture(user.id, file);
    const result = await aiApi.faceMatch(path);
    const updated = await loadProfile(user.id, user.email);
    return { user: updated, ...result };
  },

  /**
   * Re-runs step 1's AI check against the ID photo already in storage —
   * for when the check itself failed (Gemini busy, network blip) rather
   * than the name genuinely not matching. Re-checking the same path leaves
   * any passed step 2 intact; only a *different* photo resets it (see
   * verify-id's isNewDocument branch).
   */
  async retryIdVerification(
    user: User,
    idType: IdType
  ): Promise<{ user: User; matched: boolean; extractedName: string }> {
    if (!user.idDocumentUrl) throw new Error('Upload a valid ID first.');
    const result = await aiApi.verifyId(user.idDocumentUrl, idType);
    const updated = await loadProfile(user.id, user.email);
    return { user: updated, ...result };
  },

  /** Same, for step 2 — recompares the selfie already in storage. */
  async retryFaceCapture(
    user: User
  ): Promise<{ user: User; matched: boolean; confidence: number }> {
    if (!user.faceCaptureUrl) throw new Error('Capture a selfie first.');
    const result = await aiApi.faceMatch(user.faceCaptureUrl);
    const updated = await loadProfile(user.id, user.email);
    return { user: updated, ...result };
  },

  /** Session changes (sign in, sign out, token refresh, another tab). */
  onAuthChange(handler: (session: Session | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => handler(session));
    return () => data.subscription.unsubscribe();
  },
};
