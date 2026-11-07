import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import AuthShell from '../../src/components/AuthShell';
import { auth } from '../../src/firebase';
import { accountApi } from '../api';
import PasswordField from './PasswordField';

interface Invite { state: 'ready' | 'used' | 'expired' | 'has_account'; email: string; name: string; orderNumber: string }

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
      await accountApi('/claim', { token, password, name: name.trim(), marketing });
      if (auth.currentUser) await signOut(auth); // someone else was signed in on this browser
      await signInWithEmailAndPassword(auth, invite.email, password);
      nav('/account', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      if ((err as { status?: number }).status === 409) setInvite({ ...invite, state: 'has_account' });
    } finally { setBusy(false); }
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
      <h1>{first ? `Welcome, ${first}` : 'Claim your account'}</h1>
      <p className="auth__lede">{invite.orderNumber ? `Set a password to follow order #${invite.orderNumber} and keep your pieces in one place.` : 'Set a password to follow your orders and keep your pieces in one place.'}</p>
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
        <label className="check pt-check">
          <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} />
          Email me about new drops and offers
        </label>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        <button className="btn btn--primary auth__btn auth__btn--go" disabled={busy}>{busy ? 'Setting up…' : 'Claim my account'}</button>
      </form>
    </AuthShell>
  );
}
