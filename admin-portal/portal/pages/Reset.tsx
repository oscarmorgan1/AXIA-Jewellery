import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, signInWithEmailAndPassword, signOut, verifyPasswordResetCode } from 'firebase/auth';
import AuthShell from '../../src/components/AuthShell';
import { auth } from '../../src/firebase';
import PasswordField from './PasswordField';

/** /portal/reset?oobCode=…  From the "Reset your AXIA password" email. */
export default function Reset() {
  const [params] = useSearchParams();
  const code = params.get('oobCode') || '';
  const nav = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    verifyPasswordResetCode(auth, code).then(setEmail).catch(() => setBad(true));
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    setBusy(true); setError(null);
    try {
      await confirmPasswordReset(auth, code, password);
      if (auth.currentUser) await signOut(auth);
      await signInWithEmailAndPassword(auth, email!, password);
      nav('/account', { replace: true });
    } catch (err) {
      const c = (err as { code?: string }).code || '';
      setError(c === 'auth/weak-password' ? 'Choose a longer password.' : c === 'auth/expired-action-code' || c === 'auth/invalid-action-code'
        ? 'This link has expired. Ask for a new one from the sign-in page.' : 'That didn’t work. Please try again.');
    } finally { setBusy(false); }
  }

  if (bad) {
    return (
      <AuthShell>
        <h1>This link has expired</h1>
        <p className="auth__lede">Reset links work for one hour and only once. Ask for a new one from the sign-in page.</p>
        <Link className="btn btn--primary auth__btn" to="/">Go to sign in</Link>
      </AuthShell>
    );
  }
  if (email === null) return <AuthShell><h1>One moment</h1><p className="auth__lede">Checking your link…</p></AuthShell>;
  return (
    <AuthShell>
      <h1>Choose a new password</h1>
      <p className="auth__lede">For <b>{email}</b>.</p>
      <form className="auth__fields" onSubmit={submit}>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <PasswordField id="new-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" minLength={8} />
        </div>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        <button className="btn btn--primary auth__btn auth__btn--go" disabled={busy}>{busy ? 'Saving…' : 'Save and sign in'}</button>
      </form>
    </AuthShell>
  );
}
