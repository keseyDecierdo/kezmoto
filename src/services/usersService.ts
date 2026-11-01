/* =========================================================================
   KEZMOTO - Public profile lookups
   Profiles are readable by everyone, so this is the one place a screen can
   ask about someone other than the signed-in user.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { ProfileRow } from '../lib/database.types';
import type { ManagedUser, User } from '../types';
import { notificationsApi } from './notificationsService';
import { mapProfile } from './mappers';
import { settle } from './simulate';

type ReportedStub = { reported_user_id: string };

export const usersApi = {
  /** Email is deliberately absent: it lives in auth.users, not in profiles. */
  async getById(id: string): Promise<User | null> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('profile_id', id)
        .maybeSingle();
      if (error) throw new Error(`Could not load that profile. (${error.message})`);
      return data ? mapProfile(data as ProfileRow) : null;
    });
  },

  /** Admin-only in practice (the screen is admin-gated); every profile is
      readable, but only an admin can change the disabled flag - see 0027. */
  async listAll(): Promise<ManagedUser[]> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load users. (${error.message})`);

      const { data: reports } = await supabase.from('user_reports').select('reported_user_id');
      const counts = new Map<string, number>();
      for (const r of (reports ?? []) as ReportedStub[]) {
        counts.set(r.reported_user_id, (counts.get(r.reported_user_id) ?? 0) + 1);
      }

      return ((data ?? []) as ProfileRow[]).map((row) => ({
        user: mapProfile(row),
        reportCount: counts.get(row.profile_id) ?? 0,
      }));
    }, []);
  },

  async setDisabled(userId: string, disabled: boolean, reason = ''): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({
        is_disabled: disabled,
        disabled_at: disabled ? new Date().toISOString() : null,
        disabled_reason: disabled ? reason.trim() || null : null,
      })
      .eq('profile_id', userId);
    if (error) throw new Error(`Could not ${disabled ? 'disable' : 'enable'} that account. (${error.message})`);

    void notificationsApi.create({
      recipientId: userId,
      type: 'account',
      title: disabled ? 'Your account was disabled' : 'Your account was re-enabled',
      body: disabled
        ? reason.trim() || 'A KEZMOTO admin disabled your account after a review.'
        : 'You can sign in and use KEZMOTO again.',
    });
  },
};
