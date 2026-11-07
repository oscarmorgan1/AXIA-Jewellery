import { useState, type FormEvent } from 'react';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { Eye, EyeOff } from 'lucide-react';
import AuthShell from '../components/AuthShell';
import GoogleG from '../components/GoogleG';
import { auth, usingEmulators } from '../firebase';

const friendly = (code: string) => ({
  'auth/invalid-credential': 'That email and password don’t match an account.',
  'auth/user-not-found': 'No account with that email.',
  'auth/wrong-password': 'Wrong password.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/popup-closed-by-user': 'Google sign-in was closed.',
  'auth/operation-not-allowed': 'This sign-in method isn’t enabled in Firebase Authentication yet.',
} as Record<string, string>)[code] || 'Sign-in failed. Please try again.';

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
