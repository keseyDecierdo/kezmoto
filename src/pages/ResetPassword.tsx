import React, { useEffect, useState } from 'react';
import { IonButton, IonIcon, IonInput, IonSpinner, useIonRouter } from '@ionic/react';
import { eyeOffOutline, eyeOutline, timeOutline } from 'ionicons/icons';
import AuthShell from '../components/AuthShell';
import { LoadingRows } from '../components/StateViews';
import PasswordStrength from '../components/PasswordStrength';
import { supabase } from '../lib/supabaseClient';
import { showAlert } from '../lib/sweetAlert';
import { authApi } from '../services/authService';

type LinkState = 'checking' | 'ready' | 'expired';

/** Supabase puts link errors (expired / already used) in the URL hash or query. */
const linkErrorInUrl = (): boolean => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search);
  return params.has('error') || params.has('error_code');
};

/**
 * Landing page of the reset email. The client (detectSessionInUrl) turns
 * the link into a short recovery session; once it exists, the user sets a
 * new password here. A missing, used or expired link offers a fresh one.
 */
const ResetPassword: React.FC = () => {
  const router = useIonRouter();
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (linkErrorInUrl()) {
      setLinkState('expired');
      return;
    }
    let settled = false;
    const markReady = () => {
      settled = true;
      setLinkState('ready');
    };
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) markReady();
    });
    void supabase.auth.getSession().then(({ data: current }) => {
      if (current.session) markReady();
    });
    // No session after a few seconds: the link was missing, used or expired.
    const timer = window.setTimeout(() => {
      if (!settled) setLinkState('expired');
    }, 4000);
    return () => {
      window.clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await authApi.updatePassword(password);
      await showAlert({
        type: 'success',
        title: 'Password updated',
        text: 'You can now use your new password to log in.',
        confirmText: 'Continue',
      });
      router.push('/home', 'root', 'replace');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (linkState === 'expired') {
    return (
      <AuthShell
        title="This link has expired"
        subtitle="Reset links work once and only for a short time. Request a new one and use the latest email."
      >
        <p className="auth__notice">
          <IonIcon icon={timeOutline} aria-hidden="true" />
          For your security, old or already-used links stop working.
        </p>
        <IonButton
          expand="block"
          className="kez-cta auth__submit"
          onClick={() => router.push('/forgot-password', 'forward', 'replace')}
        >
          Send me a new link
        </IonButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a password you haven't used here before.">
      {linkState === 'checking' ? (
        <LoadingRows rows={2} layout="list" />
      ) : (
        <form className="auth__form" onSubmit={submit} noValidate>
          <IonInput
            className="kez-field"
            type={show ? 'text' : 'password'}
            label="New password"
            labelPlacement="stacked"
            placeholder="At least 6 characters"
            autocomplete="new-password"
            value={password}
            onIonInput={(e) => setPassword(String(e.detail.value ?? ''))}
          >
            <IonButton
              slot="end"
              fill="clear"
              className="auth__eye"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              <IonIcon slot="icon-only" icon={show ? eyeOffOutline : eyeOutline} />
            </IonButton>
          </IonInput>
          <PasswordStrength password={password} />

          <IonInput
            className="kez-field"
            type={show ? 'text' : 'password'}
            label="Confirm new password"
            labelPlacement="stacked"
            placeholder="Re-type it"
            autocomplete="new-password"
            value={confirm}
            onIonInput={(e) => setConfirm(String(e.detail.value ?? ''))}
          />

          {error && <p className="kez-form-error">{error}</p>}

          <IonButton type="submit" expand="block" className="kez-cta auth__submit" disabled={saving}>
            {saving ? <IonSpinner name="crescent" /> : 'Save new password'}
          </IonButton>
        </form>
      )}
    </AuthShell>
  );
};

export default ResetPassword;
