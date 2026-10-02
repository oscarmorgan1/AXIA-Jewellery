import { useState } from 'react';
import { useAuth } from '../auth';

export default function NotAuthorised() {
  const { user, refresh, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  return (
    <div className="loading-screen">
      <div className="card" style={{ width: 'min(440px, calc(100vw - 32px))', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1>No admin access</h1>
        <p>You’re signed in as <b>{user?.email}</b>, but this account isn’t an AXIA admin yet.</p>
        <p>The owner can grant access from the repo with:</p>
        <pre className="textarea textarea--code" style={{ minHeight: 0, whiteSpace: 'pre-wrap' }}>npm run set-admin -- {user?.email} --prod</pre>
        <button className="btn btn--primary" style={{ justifyContent: 'center' }} disabled={checking}
          onClick={async () => { setChecking(true); await refresh(); setChecking(false); }}>
          {checking ? 'Checking…' : 'I’ve been granted access, check again'}
        </button>
        <button className="btn" style={{ justifyContent: 'center' }} onClick={logout}>Log off</button>
      </div>
    </div>
  );
}
