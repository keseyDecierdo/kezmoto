import React, { useState } from 'react';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonPage,
  IonSpinner,
  useIonRouter,
} from '@ionic/react';
import { arrowBackOutline, eyeOffOutline, eyeOutline } from 'ionicons/icons';
import BrandMark from '../components/BrandMark';
import PasswordStrength from '../components/PasswordStrength';
import { useAuth } from '../context/AuthContext';
import { errorAlert } from '../lib/sweetAlert';
import './Auth.css';

type Mode = 'login' | 'register';

interface AuthProps {
  mode: Mode;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  location: string;
  password: string;
  confirm: string;
}

const EMPTY: FormState = { name: '', email: '', phone: '', location: '', password: '', confirm: '' };

/**
 * One form flow for both modes. Signup has no role picker: every account is a
 * Customer, and Admin accounts are provisioned outside the app.
 */
const Auth: React.FC<AuthProps> = ({ mode }) => {
  const router = useIonRouter();
  const { login, register } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  // Show / hide state lives here (not in Ionic's own toggle) so a re-render
  // while typing can't flip the field back to hidden.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const isRegister = mode === 'register';
  const set = (key: keyof FormState) => (event: CustomEvent) =>
    setForm((prev) => ({ ...prev, [key]: String((event.target as HTMLInputElement).value ?? '') }));

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.password.length < 6) next.password = 'Password must be at least 6 characters.';
    if (isRegister) {
      if (form.name.trim().length < 2) next.name = 'Tell us what to call you.';
      if (form.phone.trim().length < 7) next.phone = 'Enter a contact number buyers can reach.';
      if (form.location.trim().length < 2) next.location = 'Enter your city or municipality.';
      if (form.confirm !== form.password) next.confirm = 'Passwords do not match.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const next = isRegister
        ? await register({
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            location: form.location.trim(),
            password: form.password,
          })
        : await login(form.email.trim(), form.password);
      // A customer who hasn't finished the 2-step identity check goes straight
      // to Profile & Settings to do it; everyone else lands on Home.
      const needsVerification = next.role === 'customer' && !next.verified;
      router.push(needsVerification ? '/profile?verify=1' : '/home', 'root', 'replace');
    } catch (err) {
      await errorAlert({
        title: isRegister ? 'Could not create your account' : 'Could not sign in',
        text: err instanceof Error ? err.message : 'Something went wrong. Try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IonPage className={`auth${isRegister ? ' auth--register' : ''}`}>
      <IonContent fullscreen>
        <div className="auth__layout">
          {/* Brand panel — collapses to a compact header below 1024px */}
          <aside className="auth__aside">
            <div className="auth__aside-glow" aria-hidden="true" />
            <div className="auth__aside-inner">
              <BrandMark size="lg" />
              <p className="auth__aside-copy">
                Buy and sell second-hand motorcycles directly — with an admin middleman available
                whenever a deal needs one.
              </p>
            </div>
          </aside>

          <section className="auth__panel">
            <button type="button" className="auth__back" onClick={() => router.push('/', 'back')}>
              <IonIcon icon={arrowBackOutline} />
              Back
            </button>

            <div className="auth__brand-mobile">
              <BrandMark size="md" />
            </div>

            <header className="auth__head">
              <h1 className="kez-display">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
              <p className="kez-muted">
                {isRegister
                  ? 'One account for both sides — buy units, sell units, or do both.'
                  : 'Sign in to browse units, message sellers and manage your listings.'}
              </p>
            </header>

            <form
              className={`auth__form${isRegister ? ' auth__form--register' : ''}`}
              onSubmit={submit}
              noValidate
            >
              {isRegister && (
                <div className="auth__field auth__field--pair">
                  <IonInput
                    className="kez-field"
                    label="Full name"
                    labelPlacement="stacked"
                    placeholder="Juan Dela Cruz"
                    value={form.name}
                    onIonInput={set('name')}
                    autocomplete="name"
                  />
                  {errors.name && <p className="kez-form-error">{errors.name}</p>}
                </div>
              )}

              <div className={`auth__field${isRegister ? ' auth__field--pair' : ''}`}>
                <IonInput
                  className="kez-field"
                  type="email"
                  label="Email"
                  labelPlacement="stacked"
                  placeholder="you@example.com"
                  value={form.email}
                  onIonInput={set('email')}
                  autocomplete="email"
                />
                {errors.email && <p className="kez-form-error">{errors.email}</p>}
              </div>

              {isRegister && (
                <>
                  <div className="auth__field">
                    <IonInput
                      className="kez-field"
                      type="tel"
                      label="Mobile number"
                      labelPlacement="stacked"
                      placeholder="09XX XXX XXXX"
                      value={form.phone}
                      onIonInput={set('phone')}
                      autocomplete="tel"
                    />
                    {errors.phone && <p className="kez-form-error">{errors.phone}</p>}
                  </div>

                  <div className="auth__field">
                    <IonInput
                      className="kez-field"
                      label="City / Municipality"
                      labelPlacement="stacked"
                      placeholder="Cebu City, Cebu"
                      value={form.location}
                      onIonInput={set('location')}
                      autocomplete="address-level2"
                    />
                    {errors.location && <p className="kez-form-error">{errors.location}</p>}
                  </div>
                </>
              )}

              <div className={`auth__field${isRegister ? '' : ' auth__field--pair'}`}>
                <IonInput
                  className="kez-field"
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  labelPlacement="stacked"
                  placeholder={isRegister ? '6+ characters' : 'At least 6 characters'}
                  value={form.password}
                  onIonInput={set('password')}
                  autocomplete={isRegister ? 'new-password' : 'current-password'}
                >
                  <IonButton
                    slot="end"
                    fill="clear"
                    className="auth__eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <IonIcon slot="icon-only" icon={showPassword ? eyeOffOutline : eyeOutline} />
                  </IonButton>
                </IonInput>
                {errors.password && <p className="kez-form-error">{errors.password}</p>}
                {!isRegister && (
                  <button
                    type="button"
                    className="auth__forgot"
                    onClick={() => router.push('/forgot-password', 'forward')}
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {isRegister && (
                <>
                  <div className="auth__field">
                    <IonInput
                      className="kez-field"
                      type={showConfirm ? 'text' : 'password'}
                      label="Confirm password"
                      labelPlacement="stacked"
                      placeholder="Re-type it"
                      value={form.confirm}
                      onIonInput={set('confirm')}
                      autocomplete="new-password"
                    >
                      <IonButton
                        slot="end"
                        fill="clear"
                        className="auth__eye"
                        onClick={() => setShowConfirm((v) => !v)}
                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      >
                        <IonIcon slot="icon-only" icon={showConfirm ? eyeOffOutline : eyeOutline} />
                      </IonButton>
                    </IonInput>
                    {errors.confirm && <p className="kez-form-error">{errors.confirm}</p>}
                  </div>

                  <div className="auth__strength">
                    <PasswordStrength password={form.password} />
                  </div>
                </>
              )}

              <IonButton
                type="submit"
                expand="block"
                className="kez-cta auth__submit"
                disabled={submitting}
              >
                {submitting ? <IonSpinner name="crescent" /> : isRegister ? 'Create account' : 'Log in'}
              </IonButton>
            </form>

            <p className="auth__switch">
              {isRegister ? 'Already have an account?' : 'New to KEZMOTO?'}{' '}
              <button
                type="button"
                onClick={() => router.push(isRegister ? '/login' : '/register', 'none', 'replace')}
              >
                {isRegister ? 'Log in' : 'Create an account'}
              </button>
            </p>

            {!isRegister && (
              <p className="auth__fineprint">
                Accounts are Customer accounts. Admin access is provisioned by KEZMOTO.
              </p>
            )}
          </section>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Auth;
