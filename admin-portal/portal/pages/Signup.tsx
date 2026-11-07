import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import AuthShell from '../../src/components/AuthShell';
import GoogleG from '../../src/components/GoogleG';
import { auth } from '../../src/firebase';
import { accountApi } from '../api';
import { friendly } from './Login';

/**
 * /portal/signup: an account without an order. Google signs them straight in
 * (the server makes the account on first sign-in). With email, we send a link
 * to confirm the address, where they choose a password (/portal/claim).
 */
export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState('');

  async function google() {
    setBusy(true); setError(null);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } // the portal opens once signed in
    catch (e) { setError(friendly((e as { code?: string }).code || '')); setBusy(false); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await accountApi('/signup', { email: email.trim(), name: name.trim() }); setSent(email.trim()); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <AuthShell>
        <h1>Check your email</h1>
        <p className="auth__lede">We’ve sent a link to <b>{sent}</b>. Open it to confirm your email and choose a password. It works for 30 days.</p>
        <p className="auth__hint">Already have an account? <Link to="/">Sign in</Link> instead.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <h1>Create your account</h1>
      <p className="auth__lede">Save your bag, follow orders, keep your pieces and message us, all in one place.</p>
      <button type="button" className="btn auth__btn" disabled={busy} onClick={google}>
        <GoogleG /> Continue with Google
      </button>
      <div className="auth__or" role="separator"><span>or</span></div>
      <form className="auth__fields" onSubmit={submit}>
        <label className="field">Your name
          <input className="input" autoComplete="name" placeholder="First and last name" value={name} onChange={e => setName(e.target.value)} required />
        </label>
        <label className="field">Email address
          <input className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        <button className="btn btn--primary auth__btn auth__btn--go" disabled={busy}>{busy ? 'Sending…' : 'Continue with email'}</button>
      </form>
      <p className="auth__hint">Already have an account? <Link to="/">Sign in</Link></p>
    </AuthShell>
  );
}
