import { useState, type FormEvent } from 'react';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); } catch (e) { setError(friendly((e as { code?: string }).code || '')); } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); run(() => signInWithEmailAndPassword(auth, email.trim(), password)); };

  return (
    <div className="login">
      <div className="login__art">
        <div className="login__wm">AXIA</div>
        <div>
          <h2>Every piece, in your hands.</h2>
          <p>Products, collections, customers and margins for the AXIA store, all in one place.</p>
        </div>
        <p style={{ fontSize: 12 }}>Staff only</p>
      </div>
      <div className="login__panel">
        <form className="card" onSubmit={submit}>
          <h1>Welcome back</h1>
          <p>Sign in with an admin account to manage the store.</p>
          {usingEmulators && <span className="env-badge" style={{ alignSelf: 'flex-start' }}>Local emulators</span>}
          <label className="field">Email<input className="input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label className="field">Password<input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
          {error && <div className="notice notice--error">{error}</div>}
          {info && <div className="notice notice--ok">{info}</div>}
          <button className="btn btn--primary" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="btn" disabled={busy} style={{ justifyContent: 'center' }}
            onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>Continue with Google</button>
          <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: 'center' }} disabled={busy || !email}
            onClick={() => run(async () => { await sendPasswordResetEmail(auth, email.trim()); setInfo('Password reset email sent.'); })}>
            Forgot password?
          </button>
        </form>
      </div>
    </div>
  );
}
