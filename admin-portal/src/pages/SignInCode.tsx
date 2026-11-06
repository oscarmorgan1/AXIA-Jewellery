import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../auth';
import { auth, usingEmulators } from '../firebase';

interface SendResult { sent?: boolean; verified?: boolean; email?: string; retryIn?: number; local?: boolean }

async function call<T>(path: string, body: unknown = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in again');
  const res = await fetch(`/api/auth/code/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/**
 * Second step of signing in: a 6-digit code emailed to the admin's address.
 * Sends one as soon as it opens; the server won't send a second within 45s.
 */
export default function SignInCode() {
  const { user, refresh, logout } = useAuth();
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [local, setLocal] = useState(false);
  const [wait, setWait] = useState(0);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  const send = useCallback(async (again: boolean) => {
    setSending(true); setError(null); setInfo(null);
    try {
      const r = await call<SendResult>('send');
      if (r.verified) return void await refresh();
      setSentTo(r.email || null);
      setLocal(!!r.local);
      setWait(r.retryIn || 0);
      if (again && r.sent) setInfo('New code sent. Older codes no longer work.');
      input.current?.focus();
    } catch (e) { setError((e as Error).message); } finally { setSending(false); }
  }, [refresh]);

  useEffect(() => { if (!started.current) { started.current = true; send(false); } }, [send]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value: string) => {
    if (checking) return;
    setChecking(true); setError(null); setInfo(null);
    try {
      await call('verify', { code: value });
      await refresh(); // the new token carries the verified sign-in, and the portal opens
    } catch (e) {
      setError((e as Error).message);
      setCode('');
      input.current?.focus();
    } finally { setChecking(false); }
  };

  const change = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) verify(digits);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (code.length === 6) verify(code); };

  return (
    <AuthShell foot={<>Signed in as <b>{user?.email}</b>. Not you? <button type="button" className="link-btn" onClick={logout}>Use a different account</button></>}>
      <h1>Check your email</h1>
      <p className="auth__lede">
        {sentTo ? <>We sent a 6-digit code to <b className="code-email">{sentTo}</b>. It works for 10 minutes.</>
          : sending ? 'Sending a code to your email…' : 'We couldn’t send a code yet.'}
      </p>
      {usingEmulators && <span className="env-badge">Local emulators</span>}
      {local && <div className="notice notice--warn">Email isn’t set up locally: the code is printed in the <code>npm run serve</code> terminal.</div>}
      <form className="auth__fields" onSubmit={submit}>
        <label className="field">Sign-in code
          <input ref={input} className="input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
            maxLength={6} placeholder="000000" value={code} onChange={e => change(e.target.value)} disabled={checking} autoFocus />
        </label>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {info && <div className="notice notice--ok">{info}</div>}
        <button className="btn btn--primary auth__btn auth__btn--go" disabled={checking || code.length !== 6}>
          {checking ? 'Checking…' : 'Verify and continue'}
        </button>
        <button type="button" className="btn auth__btn" disabled={sending || wait > 0} onClick={() => send(true)}>
          {sending ? 'Sending…' : wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
        </button>
      </form>
      <p className="auth__hint">No email? Check your spam or promotions folder.</p>
    </AuthShell>
  );
}
