import { useState, type FormEvent } from 'react';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { Eye, EyeOff } from 'lucide-react';
import AuthShell from '../components/AuthShell';
import { auth, usingEmulators } from '../firebase';

const friendly = (code: string) => ({
  'auth/invalid-credential': 'That email and password don’t match an account.',
  'auth/user-not-found': 'No account with that email.',
  'auth/wrong-password': 'Wrong password.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/popup-closed-by-user': 'Google sign-in was closed.',
  'auth/operation-not-allowed': 'This sign-in method isn’t enabled in Firebase Authentication yet.',
} as Record<string, string>)[code] || 'Sign-in failed. Please try again.';

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); } catch (e) { setError(friendly((e as { code?: string }).code || '')); } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); run(() => signInWithEmailAndPassword(auth, email.trim(), password)); };
  const reset = () => {
    if (!email.trim()) { setInfo(null); setError('Enter your email above, then tap Forgot password.'); return; }
    run(async () => { await sendPasswordResetEmail(auth, email.trim()); setInfo('Password reset email sent.'); });
  };

  return (
    <AuthShell>
      <h1>Welcome back</h1>
      <p className="auth__lede">Sign in to run the AXIA store.</p>
      {usingEmulators && <span className="env-badge">Local emulators</span>}
      <button type="button" className="btn auth__btn" disabled={busy} onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
        <GoogleG /> Continue with Google
      </button>
      <div className="auth__or" role="separator"><span>or</span></div>
      <form className="auth__fields" onSubmit={submit}>
        <label className="field">Email address
          <input className="input" type="email" autoComplete="email" placeholder="you@axiajewellery.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <div className="field">
          <span className="auth__label-row">
            <label htmlFor="password">Password</label>
            <button type="button" className="link-btn" onClick={reset} disabled={busy}>Forgot password?</button>
          </span>
          <span className="auth__pw">
            <input id="password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password"
              value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="auth__eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(s => !s)}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </div>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {info && <div className="notice notice--ok">{info}</div>}
        <button className="btn btn--primary auth__btn auth__btn--go" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
      </form>
    </AuthShell>
  );
}
