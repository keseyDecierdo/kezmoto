/* =========================================================================
   KEZMOTO - Authentication and profiles
   Supabase Auth owns credentials; `profiles` owns everything the app shows
   about a person. A database trigger creates the profile row on signup, so
   there is never a session without a profile behind it.
   ========================================================================= */

import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { ProfileRow } from '../lib/database.types';
import type { IdType, Sex, User } from '../types';
import { mapProfile } from './mappers';
import { aiApi } from './aiService';
import { uploadFaceCapture, uploadIdDocument } from './storageService';

export interface RegisterInput {
  firstName: string;
  middleName: string;
  lastName: string;
  /** Optional. */
  sex: Sex | '';
  /** YYYY-MM-DD. */
  birthdate: string;
  email: string;
  /** +639XXXXXXXXX */
  phone: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  /** Zone / purok / street / house no. */
  street: string;
  password: string;
}

/** Date of the Terms / Privacy Policy wording the user agreed to. */
export const TERMS_VERSION = '2026-11-01';

/** Buckets whose `<uid>/…` files are removed with the account. Payment
    receipts stay with the (anonymised) payment records. */
const PERSONAL_BUCKETS = ['listing-photos', 'listing-documents', 'id-documents', 'face-captures'];

const deleteErrorMessage = (message: string): string =>
  message.includes('KEZ_OPEN_DEAL')
    ? 'Finish or cancel your open deals first, then delete your account.'
    : /could not find the function|does not exist/i.test(message)
      ? 'Account deletion is not available yet - the site is being updated. Please contact KEZMOTO.'
      : message;

/** "Juan Santos Dela Cruz": the form the ID name check compares against. */
export const composeFullName = (first: string, middle: string, last: string): string =>
  [first, middle, last].map((part) => part.trim()).filter(Boolean).join(' ');

/** "Zone 4, Tablon, Cagayan de Oro City, Misamis Oriental". */
export const composeAddress = (parts: Pick<RegisterInput, 'street' | 'barangay' | 'city' | 'province'>): string =>
  [parts.street, parts.barangay, parts.city, parts.province].map((part) => part.trim()).filter(Boolean).join(', ');

export type RegisterResult =
  | { status: 'done'; user: User }
  | { status: 'verify'; email: string };

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

  /**
   * Every self-service signup is a Customer; Admins are promoted manually.
   * With "Confirm email" on, Supabase emails a code and returns no session:
   * the caller asks for that code (verifySignupCode) before the account works.
   */
  async register(input: RegisterInput): Promise<RegisterResult> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        // Read by the handle_new_user() trigger to fill the profile row.
        data: {
          full_name: composeFullName(input.firstName, input.middleName, input.lastName),
          phone: input.phone.trim(),
          address: composeAddress(input),
          first_name: input.firstName.trim(),
          middle_name: input.middleName.trim(),
          last_name: input.lastName.trim(),
          sex: input.sex,
          birthdate: input.birthdate,
          region: input.region,
          province: input.province,
          city: input.city,
          barangay: input.barangay,
          street: input.street.trim(),
          // Ticked "I agree to the Terms and Privacy Policy" (stamped by 0038).
          terms_version: TERMS_VERSION,
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
    // Supabase hides "already registered" behind a user with no identities.
    if (data.user.identities && data.user.identities.length === 0) {
      throw new Error('An account already uses that email address.');
    }

    // Email confirmation is on: the code in the inbox opens the session.
    if (!data.session) return { status: 'verify', email: input.email.trim() };

    return { status: 'done', user: await loadProfile(data.user.id, data.user.email ?? input.email) };
  },

  /** Step 2 of sign-up: the code from the verification email. */
  async verifySignupCode(email: string, code: string): Promise<User> {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'signup',
    });
    if (error) {
      throw new Error(
        /expired|invalid/i.test(error.message)
          ? 'That code is incorrect or has expired. Check the latest email or send a new code.'
          : error.message
      );
    }
    if (!data.user) throw new Error('Verification did not return an account.');
    return loadProfile(data.user.id, data.user.email ?? email);
  },

  async resendSignupCode(email: string): Promise<void> {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (error) throw new Error(error.message);
  },

  /** Records the user's consent before their first ID / face upload. */
  async recordBiometricConsent(): Promise<void> {
    const { error } = await supabase.rpc('record_biometric_consent');
    if (error) {
      throw new Error(
        /could not find the function|does not exist/i.test(error.message)
          ? 'Consent could not be saved yet - the site is being updated. Please try again later or contact KEZMOTO.'
          : `Could not save your consent. (${error.message})`
      );
    }
  },

  /**
   * Permanently deletes the signed-in customer's account: their uploaded
   * files first (best effort), then everything else in one database call
   * (0038 delete_my_account), then signs out.
   */
  async deleteAccount(userId: string): Promise<void> {
    // Checks only (open deals, admin, update installed) before touching files.
    const check = await supabase.rpc('delete_my_account', { p_dry_run: true });
    if (check.error) throw new Error(deleteErrorMessage(check.error.message));

    await Promise.all(
      PERSONAL_BUCKETS.map(async (bucket) => {
        try {
          const { data } = await supabase.storage.from(bucket).list(userId, { limit: 1000 });
          const paths = (data ?? []).map((file) => `${userId}/${file.name}`);
          if (paths.length) await supabase.storage.from(bucket).remove(paths);
        } catch {
          // A leftover file is not worth blocking the deletion over.
        }
      })
    );

    const { error } = await supabase.rpc('delete_my_account', { p_dry_run: false });
    if (error) throw new Error(deleteErrorMessage(error.message));
    await supabase.auth.signOut();
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },

  /**
   * Emails a password-reset link. Supabase sends it through the project's
   * custom SMTP (Brevo - see supabase/README.md); the link lands on
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
   * step 1 (idNameMatched) to already be true - the function itself also
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
   * Re-runs step 1's AI check against the ID photo already in storage -
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

  /** Same, for step 2 - recompares the selfie already in storage. */
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
