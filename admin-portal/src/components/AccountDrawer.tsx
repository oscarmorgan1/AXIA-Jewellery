import { useRef, useState, type FormEvent } from 'react';
import { sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Camera, KeyRound, Mail, Trash2 } from 'lucide-react';
import { auth, storage } from '../firebase';
import { useAuth } from '../auth';
import Drawer from './Drawer';
import GoogleG from './GoogleG';

const MAX_PHOTO = 5 * 1024 * 1024;

/** The signed-in admin's initial, or their photo when they have one. */
export function Avatar({ name, photo, size = 28 }: { name: string; photo?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size > 40 ? size * 0.4 : undefined }} aria-hidden="true">
      {photo && !broken ? <img src={photo} alt="" onError={() => setBroken(true)} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const when = (s?: string) => s ? new Date(s).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–';

/**
 * "Manage your account": the admin's own Firebase Auth profile. The display name and photo are
 * what the header shows. Passwords change through Firebase's reset email rather than in place,
 * because re-entering a password here would start a new sign-in and ask for the emailed code again.
 */
export default function AccountDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const { user, profileChanged } = useAuth();
  const [name, setName] = useState(user?.displayName ?? '');
  const [photo, setPhoto] = useState<string | null>(user?.photoURL ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  if (!user) return null;

  const providers = user.providerData.map(p => p.providerId);
  const hasPassword = providers.includes('password');
  const hasGoogle = providers.includes('google.com');
  const trimmed = name.trim();
  const dirty = trimmed !== (user.displayName ?? '') || photo !== (user.photoURL ?? null);
  const shownName = trimmed || user.email?.split('@')[0] || 'Admin';
  // our own uploads live at admins/{uid}/; a Google photo is left alone in storage
  const ownPhoto = (url?: string | null) => !!url && url.includes(encodeURIComponent(`admins/${user.uid}/`));

  function choose(f?: File) {
    setError('');
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('Choose an image file (JPG, PNG or WebP).');
    if (f.size > MAX_PHOTO) return setError('That photo is over 5 MB. Choose a smaller one.');
    setFile(f);
    setPhoto(URL.createObjectURL(f));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!user || !dirty || busy) return;
    if (trimmed.length > 60) return setError('Keep the name to 60 characters or fewer.');
    setBusy(true); setError('');
    const before = user.photoURL;
    try {
      let photoURL = photo;
      if (file) {
        const r = ref(storage, `admins/${user.uid}/avatar-${Date.now()}`);
        await uploadBytes(r, file, { contentType: file.type, cacheControl: 'public, max-age=31536000' });
        photoURL = await getDownloadURL(r);
      }
      await updateProfile(user, { displayName: trimmed || null, photoURL: photoURL || null });
      // tidy the photo it replaced, if it was one we uploaded
      if (before !== photoURL && ownPhoto(before)) deleteObject(ref(storage, before!)).catch(() => { /* already gone */ });
      profileChanged();
      onSaved('Account updated.');
    } catch (err) {
      setError(`Couldn’t save: ${(err as Error).message}`);
      setBusy(false);
    }
  }

  async function sendReset() {
    if (!user?.email) return;
    setBusy(true); setError('');
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
    } catch (err) {
      setError(`Couldn’t send the email: ${(err as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <Drawer title="Manage your account" onClose={onClose} footer={<>
      <span className="spacer" style={{ flex: 1 }} />
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn--primary" form="account-form" type="submit" disabled={!dirty || busy}>{busy && dirty ? 'Saving…' : 'Save changes'}</button>
    </>}>
      <form id="account-form" className="account" onSubmit={save}>
        <div className="account__id">
          <Avatar name={shownName} photo={photo} size={64} />
          <div>
            <b>{shownName}</b>
            <small>{user.email}</small>
            <div className="account__photo-btns">
              <button type="button" className="btn btn--sm" onClick={() => pick.current?.click()} disabled={busy}><Camera size={14} /> {photo ? 'Change photo' : 'Add photo'}</button>
              {photo && <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setPhoto(null); setFile(null); }} disabled={busy}><Trash2 size={14} /> Remove</button>}
            </div>
            <input ref={pick} type="file" accept="image/*" hidden onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>

        <label className="field">Display name
          <input className="input" value={name} maxLength={60} placeholder={user.email?.split('@')[0]} autoComplete="name"
            onChange={e => setName(e.target.value)} disabled={busy} />
          <small className="account__hint">Shown in the top bar of this portal. Leave it empty to use the start of your email.</small>
        </label>

        <label className="field">Email
          <input className="input" value={user.email ?? ''} disabled />
          <small className="account__hint">The email you sign in with and where your sign-in codes go. It can’t be changed here.</small>
        </label>

        {error && <div className="notice notice--error" role="alert">{error}</div>}
      </form>

      <div className="account__section">
        <h3>Sign-in</h3>
        <ul className="account__methods">
          {hasGoogle && <li><GoogleG /> <span>Google<small>Continue with Google on the sign-in page</small></span></li>}
          {hasPassword && <li><KeyRound size={18} /> <span>Email and password<small>{user.email}</small></span></li>}
          {!hasGoogle && !hasPassword && <li><Mail size={18} /> <span>Email<small>{user.email}</small></span></li>}
        </ul>
        {user.email && (resetSent
          ? <div className="notice notice--ok" role="status">We’ve emailed {user.email} a link to {hasPassword ? 'choose a new password' : 'set a password'}.</div>
          : <button type="button" className="btn" onClick={sendReset} disabled={busy}><KeyRound size={16} /> {hasPassword ? 'Email me a password reset link' : 'Email me a link to set a password'}</button>)}
        <dl className="account__meta">
          <div><dt>Last signed in</dt><dd>{when(user.metadata.lastSignInTime)}</dd></div>
          <div><dt>Account created</dt><dd>{when(user.metadata.creationTime)}</dd></div>
        </dl>
      </div>
    </Drawer>
  );
}
