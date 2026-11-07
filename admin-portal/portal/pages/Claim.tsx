import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import AuthShell from '../../src/components/AuthShell';
import GoogleG from '../../src/components/GoogleG';
import { CLAIMING } from '../account';
import { friendly } from './Login';
import { auth } from '../../src/firebase';
import { accountApi } from '../api';
import PasswordField from './PasswordField';

interface Invite { state: 'ready' | 'used' | 'expired' | 'has_account'; email: string; name: string; orderNumber: string; transfer?: { productName: string; fromName: string }; signup?: boolean }

/** /portal/claim?t=…  From the "Claim your AXIA account" email: set a password and go straight in. */
export default function Claim() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const nav = useNavigate();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [marketing, setMarketing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renewed, setRenewed] = useState(false);

  useEffect(() => {
    accountApi<Invite>('/invite', { token })
      .then(inv => { setInvite(inv); setName(inv.name || ''); })
      .catch(e => setLoadError((e as Error).message));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setBusy(true); setError(null);
    try {
      const res = await accountApi<{ next?: string }>('/claim', { token, password, name: name.trim(), marketing });
      if (auth.currentUser) await signOut(auth); // someone else was signed in on this browser
      await signInWithEmailAndPassword(auth, invite.email, password);
      nav(res.next === '/pieces' ? '/pieces' : '/orders', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      if ((err as { status?: number }).status === 409) setInvite({ ...invite, state: 'has_account' });
    } finally { setBusy(false); }
  }

  // Claim with the Google account for the invited address instead of a password.
  async function google() {
    if (!invite) return;
    setBusy(true); setError(null);
    const flag = (on: boolean) => { try { if (on) sessionStorage.setItem(CLAIMING, '1'); else sessionStorage.removeItem(CLAIMING); } catch { /* storage blocked */ } };
    flag(true);
    try {
      if (auth.currentUser) await signOut(auth);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ login_hint: invite.email });
      const { user } = await signInWithPopup(auth, provider);
      if ((user.email || '').toLowerCase() !== invite.email) {
        await signOut(auth);
        throw new Error(`That Google account is ${user.email}. This invite is for ${invite.email}: choose that account, or set a password below.`);
      }
      const res = await accountApi<{ next?: string }>('/claim/google', { token, name: name.trim(), marketing });
      flag(false);
      location.replace(`/portal${res.next === '/pieces' ? '/pieces' : '/orders'}`);
    } catch (err) {
      flag(false);
      const e = err as Error & { code?: string };
      setError(e.code ? friendly(e.code) : e.message);
      setBusy(false);
    }
  }

  async function renew() {
    setBusy(true); setError(null);
    try { await accountApi('/invite/renew', { token }); setRenewed(true); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const first = (invite?.name || '').split(' ')[0];

  if (loadError) {
    return (
      <AuthShell>
        <h1>Link not found</h1>
        <p className="auth__lede">{loadError}</p>
        <Link className="btn btn--primary auth__btn" to="/">Go to sign in</Link>
      </AuthShell>
    );
  }
  if (!invite) return <AuthShell><h1>One moment</h1><p className="auth__lede">Checking your link…</p></AuthShell>;

  if (invite.state === 'has_account' || invite.state === 'used') {
    return (
      <AuthShell>
        <h1>You’re all set</h1>
        <p className="auth__lede">There’s already an account for <b>{invite.email}</b>. Sign in to see it.</p>
        <Link className="btn btn--primary auth__btn" to="/">Sign in</Link>
      </AuthShell>
    );
  }
  if (invite.state === 'expired') {
    return (
      <AuthShell>
        <h1>This link has expired</h1>
        <p className="auth__lede">{renewed ? <>A new link is on its way to <b>{invite.email}</b>.</> : <>We can send a fresh one to <b>{invite.email}</b>.</>}</p>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {!renewed && <button className="btn btn--primary auth__btn" disabled={busy} onClick={renew}>{busy ? 'Sending…' : 'Send me a new link'}</button>}
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1>{first ? `Welcome, ${first}` : invite.transfer || invite.signup ? 'Create your account' : 'Claim your account'}</h1>
      <p className="auth__lede">{invite.signup ? 'Your email is confirmed. Choose how you’ll sign in to follow orders, keep your pieces and message us.' : invite.transfer ? `${invite.transfer.fromName || 'An AXIA customer'} is sending you their ${invite.transfer.productName}. Accept it with Google or a password, and keep it in your account.` : invite.orderNumber ? `Follow order #${invite.orderNumber} and keep your pieces in one place. Use Google or set a password.` : 'Follow your orders and keep your pieces in one place. Use Google or set a password.'}</p>
      <label className="check pt-check">
        <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} />
        Email me about new drops and offers
      </label>
      <button type="button" className="btn auth__btn" disabled={busy} onClick={google}>
        <GoogleG /> Continue with Google
      </button>
      <div className="auth__or" role="separator"><span>or set a password</span></div>
      <form className="auth__fields" onSubmit={submit}>
        <label className="field">Email address
          <input className="input" type="email" value={invite.email} readOnly aria-readonly="true" />
        </label>
        <label className="field">Your name
          <input className="input" autoComplete="name" placeholder="First and last name" value={name} onChange={e => setName(e.target.value)} required />
        </label>
        <div className="field">
          <label htmlFor="new-password">Choose a password</label>
          <PasswordField id="new-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" minLength={8} />
        </div>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        <button className="btn btn--primary auth__btn auth__btn--go" disabled={busy}>{busy ? 'Setting up…' : invite.transfer || invite.signup ? 'Create my account' : 'Claim my account'}</button>
      </form>
    </AuthShell>
  );
}
