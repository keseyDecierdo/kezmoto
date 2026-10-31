import React from 'react';
import './PasswordStrength.css';

const LEVELS = [
  { label: 'Too short', tone: 'poor' },
  { label: 'Weak', tone: 'poor' },
  { label: 'Fair', tone: 'ok' },
  { label: 'Good', tone: 'good' },
  { label: 'Strong', tone: 'strong' },
] as const;

/** 0–4. Under 6 characters is always 0 — the form's own minimum. */
const passwordScore =(password: string): number => {
  if (password.length < 6) return 0;
  let score = 1;
  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  else if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 0.5;
  return Math.min(4, Math.floor(score));
};

/**
 * Four-segment strength meter under a password field. Advisory only — the
 * form still enforces just its 6-character minimum.
 */
const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
  if (!password) return null;
  const score = passwordScore(password);
  const level = LEVELS[score];

  return (
    <div className={`pw-strength pw-strength--${level.tone}`} aria-live="polite">
      <div className="pw-strength__bars" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={step <= Math.max(score, 1) ? 'is-on' : ''} />
        ))}
      </div>
      <span className="pw-strength__label">
        Password strength: <strong>{level.label}</strong>
      </span>
    </div>
  );
};

export default PasswordStrength;
