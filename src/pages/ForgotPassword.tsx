import React, { useEffect, useState } from 'react';
import { IonButton, IonIcon, IonInput, IonSpinner, useIonRouter } from '@ionic/react';
import { mailOutline } from 'ionicons/icons';
import AuthShell from '../components/AuthShell';
import { authApi } from '../services/authService';

/** Seconds before another reset email can be requested. */
const COOLDOWN = 60;

/**
 * "Forgot password?": asks for the account email and has Supabase send a
 * reset link (through the Brevo SMTP configured in Supabase). The result
 * message is the same whether or not the email has an account.
 */
const ForgotPassword: React.FC = () => {
  const router = useIonRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter the email address you use to log in.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await authApi.requestPasswordReset(email.trim());
      setSent(true);
      setCooldown(COOLDOWN);
    } catch (err) {
      // Rate limits and SMTP problems are worth showing; "no such user" never
      // reaches here (Supabase answers success either way).
      setError(err instanceof Error ? err.message : 'Could not send the reset link. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send you a link to set a new password."
    >
      <form className="auth__form" onSubmit={submit} noValidate>
        <IonInput
          className="kez-field"
          type="email"
          label="Email"
          labelPlacement="stacked"
          placeholder="you@example.com"
          autocomplete="email"
          value={email}
          onIonInput={(e) => setEmail(String(e.detail.value ?? ''))}
        />
        {error && <p className="kez-form-error">{error}</p>}

        {sent && (
          <p className="auth__notice" role="status">
            <IonIcon icon={mailOutline} aria-hidden="true" />
            If an account uses this email, a reset link is on its way. Check your inbox and spam
            folder.
          </p>
        )}

        <IonButton
          type="submit"
          expand="block"
          className="kez-cta auth__submit"
          disabled={sending || cooldown > 0}
        >
          {sending ? (
            <IonSpinner name="crescent" />
          ) : cooldown > 0 ? (
            `Send again in ${cooldown}s`
          ) : sent ? (
            'Send the link again'
          ) : (
            'Send reset link'
          )}
        </IonButton>
      </form>

      <p className="auth__switch">
        Remembered it?{' '}
        <button type="button" onClick={() => router.push('/login', 'back')}>
          Log in
        </button>
      </p>
    </AuthShell>
  );
};

export default ForgotPassword;
