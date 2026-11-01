import React, { useEffect, useMemo, useState } from 'react';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonPage,
  IonSpinner,
  useIonRouter,
  useIonViewWillEnter,
} from '@ionic/react';
import {
  arrowBackOutline,
  eyeOffOutline,
  eyeOutline,
  femaleOutline,
  mailOutline,
  maleOutline,
} from 'ionicons/icons';
import BrandMark from '../components/BrandMark';
import LocationPicker from '../components/LocationPicker';
import type { LocationParts } from '../components/LocationPicker';
import PasswordStrength from '../components/PasswordStrength';
import { useAuth } from '../context/AuthContext';
import { authApi, composeAddress } from '../services/authService';
import { errorAlert } from '../lib/sweetAlert';
import { formatPhLocal, isValidPhLocal, normalizePhLocal, toE164Ph } from '../utils/phone';
import type { Sex, User } from '../types';
import './Auth.css';

type Mode = 'login' | 'register';
/** Create account: three form steps, then the emailed code. */
type Step = 1 | 2 | 3 | 'verify';

interface AuthProps {
  mode: Mode;
}

interface FormState {
  firstName: string;
  middleName: string;
  lastName: string;
  sex: Sex | '';
  birthdate: string;
  email: string;
  /** The 9 digits after the fixed "+63 9" prefix. */
  phone: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  street: string;
  password: string;
  confirm: string;
  /** "I agree to the Terms of Service and Privacy Policy" (required). */
  agree: boolean;
}

type Errors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = {
  firstName: '',
  middleName: '',
  lastName: '',
  sex: '',
  birthdate: '',
  email: '',
  phone: '',
  region: '',
  province: '',
  city: '',
  barangay: '',
  street: '',
  password: '',
  confirm: '',
  agree: false,
};

const STEP_TITLES: Record<1 | 2 | 3, string> = {
  1: 'About you',
  2: 'Contact & address',
  3: 'Set your password',
};

/** Seconds before another verification code can be requested. */
const RESEND_COOLDOWN = 60;
const MIN_AGE = 18;

/** Latest birthday allowed (today minus 18 years), as YYYY-MM-DD. */
const latestBirthdate = (): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MIN_AGE);
  return d.toISOString().slice(0, 10);
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Log in and Create account on one screen. Switching between them swaps the
 * form in place (and rewrites the address bar) instead of navigating, so the
 * photo panel on the left never reloads. Signup has no role picker: every
 * account is a Customer, and Admin accounts are provisioned outside the app.
 */
const Auth: React.FC<AuthProps> = ({ mode: routeMode }) => {
  const router = useIonRouter();
  const { login, register, verifySignup } = useAuth();
  const [mode, setMode] = useState<Mode>(routeMode);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  // Show / hide state lives here (not in Ionic's own toggle) so a re-render
  // while typing can't flip the field back to hidden.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const maxBirthdate = useMemo(latestBirthdate, []);

  // A cached page re-entered from elsewhere starts in the mode of its route.
  useIonViewWillEnter(() => {
    setMode(routeMode);
    setStep(1);
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const isRegister = mode === 'register';
  const set = (key: keyof FormState) => (event: CustomEvent) =>
    setForm((prev) => ({ ...prev, [key]: String((event.target as HTMLInputElement).value ?? '') }));
  const setValue = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const setLocation = (parts: LocationParts) => setForm((prev) => ({ ...prev, ...parts }));

  const switchMode = (next: Mode) => {
    setMode(next);
    setStep(1);
    setErrors({});
    // Keep React Router's history state so Back still behaves.
    window.history.replaceState(window.history.state, '', next === 'register' ? '/register' : '/login');
  };

  const finish = (next: User) => {
    // A customer who hasn't finished the 2-step identity check goes straight
    // to Profile & Settings to do it; everyone else lands on Home.
    const needsIdCheck = next.role === 'customer' && !next.verified;
    router.push(needsIdCheck ? '/profile?verify=1' : '/home', 'root', 'replace');
  };

  /** Checks only the fields on the given register step (or the login form). */
  const validate = (which: Step | 'login'): boolean => {
    const next: Errors = {};
    if (which === 'login') {
      if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
      if (form.password.length < 6) next.password = 'Use at least 6 characters.';
    } else if (which === 1) {
      if (form.firstName.trim().length < 2) next.firstName = 'Enter your first name.';
      if (form.lastName.trim().length < 2) next.lastName = 'Enter your last name.';
      if (!form.birthdate) next.birthdate = 'Enter your birthday.';
      else if (form.birthdate > maxBirthdate) next.birthdate = `You must be at least ${MIN_AGE} to use KEZMOTO.`;
    } else if (which === 2) {
      if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
      if (!isValidPhLocal(form.phone)) next.phone = 'Enter the 9 digits after +63 9.';
      if (!form.city || !form.barangay) next.barangay = 'Pick your region, province, city and barangay.';
      if (form.street.trim().length < 2) next.street = 'Enter your zone, purok or street.';
    } else if (which === 3) {
      if (form.password.length < 6) next.password = 'Use at least 6 characters.';
      if (form.confirm !== form.password) next.confirm = 'Passwords do not match.';
      if (!form.agree) next.agree = 'Tick the box to agree to the Terms and Privacy Policy.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate('login')) return;
    setSubmitting(true);
    try {
      finish(await login(form.email.trim(), form.password));
    } catch (err) {
      await errorAlert({
        title: 'Could not log in',
        text: err instanceof Error ? err.message : 'Something went wrong. Try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  /** Continue on steps 1–2; Create account on step 3. */
  const submitRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step === 'verify' || !validate(step)) return;
    if (step < 3) {
      setStep((step + 1) as Step);
      return;
    }

    setSubmitting(true);
    try {
      const result = await register({
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim(),
        lastName: form.lastName.trim(),
        sex: form.sex,
        birthdate: form.birthdate,
        email: form.email.trim(),
        phone: toE164Ph(form.phone),
        region: form.region,
        province: form.province,
        city: form.city,
        barangay: form.barangay,
        street: form.street.trim(),
        password: form.password,
      });
      if (result.status === 'done') {
        finish(result.user);
      } else {
        setPendingEmail(result.email);
        setCode('');
        setCodeError(null);
        setCooldown(RESEND_COOLDOWN);
        setStep('verify');
      }
    } catch (err) {
      await errorAlert({
        title: 'Could not create your account',
        text: err instanceof Error ? err.message : 'Something went wrong. Try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6,8}$/.test(code)) {
      setCodeError('Enter the code from the email.');
      return;
    }
    setCodeError(null);
    setSubmitting(true);
    try {
      finish(await verifySignup(pendingEmail, code));
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Could not verify the code. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    try {
      await authApi.resendSignupCode(pendingEmail);
      setCooldown(RESEND_COOLDOWN);
      setCodeError(null);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Could not send a new code. Try again.');
    }
  };

  const fieldError = (key: keyof FormState) =>
    errors[key] ? <p className="kez-form-error">{errors[key]}</p> : null;

  const passwordEye = (shown: boolean, toggle: () => void) => (
    <IonButton
      slot="end"
      fill="clear"
      className="auth__eye"
      onClick={toggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
    >
      <IonIcon slot="icon-only" icon={shown ? eyeOffOutline : eyeOutline} />
    </IonButton>
  );

  /* ------------------------------------------------------------ Log in */
  const renderLogin = () => (
    <>
      <header className="auth__head">
        <h1 className="kez-display">Welcome back</h1>
        <p className="kez-muted">Log in to manage your listings, messages and saved units.</p>
      </header>

      <form className="auth__form" onSubmit={submitLogin} noValidate>
        <div className="auth__field auth__field--full">
          <IonInput
            className="kez-field"
            type="email"
            label="Email address"
            labelPlacement="stacked"
            placeholder="name@example.com"
            value={form.email}
            onIonInput={set('email')}
            autocomplete="email"
          />
          {fieldError('email')}
        </div>

        <div className="auth__field auth__field--full">
          <IonInput
            className="kez-field"
            type={showPassword ? 'text' : 'password'}
            label="Password"
            labelPlacement="stacked"
            placeholder="Enter your password"
            value={form.password}
            onIonInput={set('password')}
            autocomplete="current-password"
          >
            {passwordEye(showPassword, () => setShowPassword((v) => !v))}
          </IonInput>
          {fieldError('password')}
          <button
            type="button"
            className="auth__forgot"
            onClick={() => router.push('/forgot-password', 'forward')}
          >
            Forgot password?
          </button>
        </div>

        <IonButton type="submit" expand="block" className="kez-cta auth__submit" disabled={submitting}>
          {submitting ? <IonSpinner name="crescent" /> : 'Log in'}
        </IonButton>
      </form>

      <p className="auth__switch">
        New to KEZMOTO?{' '}
        <button type="button" onClick={() => switchMode('register')}>
          Create an account
        </button>
      </p>
    </>
  );

  /* ---------------------------------------------- Create account, step 1–3 */
  const formStep = step === 'verify' ? 3 : step;

  const renderRegister = () => (
    <>
      <header className="auth__head">
        <h1 className="kez-display">Create your account</h1>
        <p className="kez-muted">
          Step {formStep} of 3 · {STEP_TITLES[formStep]}
        </p>
        <div className="auth__progress" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= formStep ? 'is-done' : ''} />
          ))}
        </div>
      </header>

      <form className="auth__form auth__form--register" onSubmit={submitRegister} noValidate>
        {/* All three steps stay mounted (so the address picker keeps its
            picks); only the active one shows, and showing replays the
            fade-in. */}
        <div className="auth__step" hidden={step !== 1}>
          <div className="auth__field">
            <IonInput
              className="kez-field"
              label="First name"
              labelPlacement="stacked"
              placeholder="e.g. Juan"
              value={form.firstName}
              onIonInput={set('firstName')}
              autocomplete="given-name"
            />
            {fieldError('firstName')}
          </div>
          <div className="auth__field">
            <IonInput
              className="kez-field"
              label="Last name"
              labelPlacement="stacked"
              placeholder="e.g. Dela Cruz"
              value={form.lastName}
              onIonInput={set('lastName')}
              autocomplete="family-name"
            />
            {fieldError('lastName')}
          </div>
          <div className="auth__field auth__field--full">
            <IonInput
              className="kez-field"
              label="Middle name (optional)"
              labelPlacement="stacked"
              placeholder="Leave blank if none"
              value={form.middleName}
              onIonInput={set('middleName')}
              autocomplete="additional-name"
            />
            <p className="auth__hint">Use your name exactly as it appears on your valid ID.</p>
          </div>

          <div className="auth__field">
            {/* Optional: tap the selected one again to clear it. */}
            <div className="auth__sex" role="radiogroup" aria-label="Sex (optional)">
              {(
                [
                  ['male', 'Male', maleOutline],
                  ['female', 'Female', femaleOutline],
                ] as const
              ).map(([value, label, icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.sex === value}
                  className={`auth__sex-option${form.sex === value ? ' is-selected' : ''}`}
                  onClick={() => setValue('sex', form.sex === value ? '' : value)}
                >
                  <IonIcon icon={icon} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <p className="auth__hint">Sex is optional.</p>
          </div>
          <div className="auth__field">
            <label className="kez-field auth__native">
              <span>Birthday</span>
              <input
                type="date"
                max={maxBirthdate}
                min="1900-01-01"
                value={form.birthdate}
                onChange={(e) => setValue('birthdate', e.target.value)}
                autoComplete="bday"
              />
            </label>
            {fieldError('birthdate')}
          </div>
        </div>

        <div className="auth__step" hidden={step !== 2}>
          <div className="auth__field auth__field--full">
            <IonInput
              className="kez-field"
              type="email"
              label="Email address"
              labelPlacement="stacked"
              placeholder="name@example.com"
              value={form.email}
              onIonInput={set('email')}
              autocomplete="email"
            />
            {fieldError('email')}
          </div>
          <div className="auth__field auth__field--full">
            <IonInput
              className="kez-field auth__phone"
              type="tel"
              inputmode="numeric"
              label="Mobile number"
              labelPlacement="stacked"
              placeholder="XX XXX XXXX"
              maxlength={11}
              value={formatPhLocal(form.phone)}
              onIonInput={(e) => setValue('phone', normalizePhLocal(String(e.detail.value ?? '')))}
              autocomplete="tel-national"
            >
              <span slot="start" className="auth__prefix" aria-hidden="true">
                +63 9
              </span>
            </IonInput>
            {fieldError('phone')}
          </div>
          <div className="auth__field auth__field--full auth__location">
            <LocationPicker
              value={form.city ? composeAddress(form) : undefined}
              onChange={() => undefined}
              onPartsChange={setLocation}
              barangayPlaceholder="Select barangay…"
            />
            {fieldError('barangay')}
          </div>
          <div className="auth__field auth__field--full">
            <IonInput
              className="kez-field"
              label="Zone / Purok / Street"
              labelPlacement="stacked"
              placeholder="e.g. Zone 4, or house no. & street"
              value={form.street}
              onIonInput={set('street')}
              autocomplete="address-line1"
            />
            {fieldError('street')}
          </div>
        </div>

        <div className="auth__step" hidden={step !== 3}>
          <div className="auth__field auth__field--full">
            <IonInput
              className="kez-field"
              type={showPassword ? 'text' : 'password'}
              label="Password"
              labelPlacement="stacked"
              placeholder="At least 6 characters"
              value={form.password}
              onIonInput={set('password')}
              autocomplete="new-password"
            >
              {passwordEye(showPassword, () => setShowPassword((v) => !v))}
            </IonInput>
            {fieldError('password')}
          </div>
          <div className="auth__field auth__field--full">
            <IonInput
              className="kez-field"
              type={showConfirm ? 'text' : 'password'}
              label="Confirm password"
              labelPlacement="stacked"
              placeholder="Re-enter your password"
              value={form.confirm}
              onIonInput={set('confirm')}
              autocomplete="new-password"
            >
              {passwordEye(showConfirm, () => setShowConfirm((v) => !v))}
            </IonInput>
            {fieldError('confirm')}
          </div>
          <div className="auth__strength">
            <PasswordStrength password={form.password} />
          </div>
          <div className="auth__field auth__field--full">
            <label className="auth__agree">
              <input
                type="checkbox"
                checked={form.agree}
                onChange={(e) => setValue('agree', e.target.checked)}
              />
              <span>
                I am 18 or older and I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" rel="noopener">
                  Privacy Policy
                </a>
                .
              </span>
            </label>
            {fieldError('agree')}
          </div>
          {form.city && (
            <p className="auth__hint auth__summary">
              Creating an account for <strong>{form.email.trim()}</strong> ·{' '}
              {composeAddress(form)}
            </p>
          )}
        </div>

        <div className="auth__actions">
          {step !== 1 && (
            <IonButton
              type="button"
              fill="outline"
              className="auth__prev"
              onClick={() => {
                setErrors({});
                setStep((s) => (s === 'verify' || s === 1 ? s : ((s - 1) as Step)));
              }}
            >
              Back
            </IonButton>
          )}
          <IonButton type="submit" expand="block" className="kez-cta auth__submit" disabled={submitting}>
            {submitting ? <IonSpinner name="crescent" /> : step === 3 ? 'Create account' : 'Continue'}
          </IonButton>
        </div>
      </form>

      <p className="auth__switch">
        Already have an account?{' '}
        <button type="button" onClick={() => switchMode('login')}>
          Log in
        </button>
      </p>
    </>
  );

  /* ------------------------------------------------------- Email code */
  const renderVerify = () => (
    <>
      <header className="auth__head">
        <h1 className="kez-display">Verify your email</h1>
        <p className="kez-muted">
          We sent a verification code to <strong className="auth__email">{pendingEmail}</strong>. Enter it
          below to activate your account.
        </p>
      </header>

      <form className="auth__form" onSubmit={submitCode} noValidate>
        <IonInput
          className="kez-field auth__code"
          label="Verification code"
          labelPlacement="stacked"
          placeholder="••••••"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength={8}
          value={code}
          onIonInput={(e) => setCode(String(e.detail.value ?? '').replace(/\D/g, '').slice(0, 8))}
        />
        {codeError && <p className="kez-form-error">{codeError}</p>}

        <p className="auth__notice">
          <IonIcon icon={mailOutline} aria-hidden="true" />
          Can&apos;t find it? Check your spam or promotions folder. The code expires in 1 hour.
        </p>

        <IonButton type="submit" expand="block" className="kez-cta auth__submit" disabled={submitting}>
          {submitting ? <IonSpinner name="crescent" /> : 'Verify & create account'}
        </IonButton>
      </form>

      <p className="auth__switch auth__switch--split">
        <button type="button" onClick={() => void resend()} disabled={cooldown > 0}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
        <button type="button" onClick={() => setStep(2)}>
          Use a different email
        </button>
      </p>
    </>
  );

  // Log in, Create account and the code step each animate in; the register
  // steps animate inside renderRegister instead (they stay mounted).
  const swapKey = !isRegister ? 'login' : step === 'verify' ? 'verify' : 'register';

  return (
    <IonPage className={`auth${isRegister ? ' auth--register' : ''}`}>
      <IonContent fullscreen>
        <div className="auth__layout">
          {/* Photo panel (desktop). Outside the swapped area, so it never reloads. */}
          <aside className="auth__aside">
            <div className="auth__aside-glow" aria-hidden="true" />
            <div className="auth__aside-inner">
              <p className="auth__aside-title">
                Buy. Sell. <span>Ride.</span>
              </p>
              <p className="auth__aside-copy">
                Buy and sell second-hand motorcycles directly — and request a KEZMOTO admin as
                middleman when you want help with a deal.
              </p>
            </div>
          </aside>

          <section className="auth__panel">
            <button type="button" className="auth__back" onClick={() => router.push('/', 'back')}>
              <IonIcon icon={arrowBackOutline} />
              Back
            </button>

            <div className="auth__brand">
              <BrandMark size="md" />
            </div>

            <div key={swapKey} className="auth__swap">
              {!isRegister ? renderLogin() : step === 'verify' ? renderVerify() : renderRegister()}
            </div>
          </section>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Auth;
