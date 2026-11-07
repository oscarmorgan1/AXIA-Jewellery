import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import AuthShell from '../../src/components/AuthShell';
import GoogleG from '../../src/components/GoogleG';
import { auth, usingEmulators } from '../../src/firebase';
import { accountApi } from '../api';
import PasswordField from './PasswordField';

export const friendly = (code: string) => ({
  'auth/invalid-credential': 'That email and password don’t match an account.',
  'auth/user-not-found': 'No account with that email.',
  'auth/wrong-password': 'Wrong password.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/popup-closed-by-user': 'Google sign-in was closed.',
  'auth/user-disabled': 'This account has been turned off. Contact us and we’ll help.',
} as Record<string, string>)[code] || 'Sign-in failed. Please try again.';

/** /portal sign-in: the admin login's design, for customers (no emailed code step). */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, message?: (e: Error & { code?: string }) => string) => {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); } catch (e) {
      const err = e as Error & { code?: string };
      setError(message ? message(err) : friendly(err.code || ''));
    } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); run(() => signInWithEmailAndPassword(auth, email.trim(), password)); };
  const reset = () => {
    if (!email.trim()) { setInfo(null); setError('Enter your email above, then tap Forgot password.'); return; }
    run(async () => {
      await accountApi('/password-reset', { email: email.trim() });
      setInfo('If there’s an account for that email, a reset link is on its way.');
    }, e => e.message);
  };

  return (
    <AuthShell>
      <h1>Welcome back</h1>
      <p className="auth__lede">Sign in to follow your orders and pieces.</p>
      {usingEmulators && <span className="env-badge">Local emulators</span>}
      <button type="button" className="btn auth__btn" disabled={busy} onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
        <GoogleG /> Continue with Google
      </button>
      <div className="auth__or" role="separator"><span>or</span></div>
      <form className="auth__fields" onSubmit={submit}>
        <label className="field">Email address
          <input className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <div className="field">
          <span className="auth__label-row">
            <label htmlFor="password">Password</label>
            <button type="button" className="link-btn" onClick={reset} disabled={busy}>Forgot password?</button>
          </span>
          <PasswordField id="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Enter your password" />
        </div>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {info && <div className="notice notice--ok">{info}</div>}
        <button className="btn btn--primary auth__btn auth__btn--go" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
      </form>
      <p className="auth__hint">New here? <Link to="/signup">Create an account</Link></p>
    </AuthShell>
  );
}
