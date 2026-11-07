import { useEffect, useState, type FormEvent } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { Check } from 'lucide-react';
import { useAccount, type Account } from '../account';
import { accountApi } from '../api';
import PasswordField from './PasswordField';

type Address = NonNullable<Account['address']>;
const EMPTY: Address = { line1: '', line2: '', city: '', state: '', postal_code: '', country: 'AU' };

function Saved({ show }: { show: boolean }) {
  return show ? <span className="pt-saved" role="status"><Check size={15} /> Saved</span> : null;
}

/** Saves the whole profile (the API takes name, phone and address together). */
function useProfileSave(account: Account) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async (patch: Partial<Account>) => {
    setBusy(true); setError(null); setSaved(false);
    try { await accountApi('/profile', { name: account.name || '', phone: account.phone || '', address: account.address || null, ...patch }); setSaved(true); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return { busy, error, saved, setSaved, save };
}

/** Name, email and phone. */
function Details({ account }: { account: Account }) {
  const [name, setName] = useState(account.name || '');
  const [phone, setPhone] = useState(account.phone || '');
  const { busy, error, saved, setSaved, save } = useProfileSave(account);
  const submit = (e: FormEvent) => { e.preventDefault(); save({ name, phone }); };
  return (
    <form className="card" onSubmit={submit}>
      <div className="card__head"><div><h2>Your details</h2><p className="card__sub">Used for your orders and when we contact you.</p></div></div>
      <div className="form-grid">
        <label className="field full">Name<input className="input" autoComplete="name" value={name} onChange={e => { setName(e.target.value); setSaved(false); }} required /></label>
        <label className="field">Email<input className="input" value={account.email} readOnly aria-readonly="true" /></label>
        <label className="field">Phone<input className="input" type="tel" autoComplete="tel" value={phone} onChange={e => { setPhone(e.target.value); setSaved(false); }} placeholder="Optional" /></label>
      </div>
      <p className="card__sub">Your email can’t be changed here yet. <a href="/support#contact">Contact us</a> and we’ll update it.</p>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <div className="pt-actions"><Saved show={saved} /><button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button></div>
    </form>
  );
}

/** Shipping address. */
function AddressCard({ account }: { account: Account }) {
  const [addr, setAddr] = useState<Address>({ ...EMPTY, ...(account.address || {}) });
  const { busy, error, saved, setSaved, save } = useProfileSave(account);
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => { setAddr(a => ({ ...a, [k]: e.target.value })); setSaved(false); };
  const submit = (e: FormEvent) => { e.preventDefault(); save({ address: addr }); };
  return (
    <form className="card" onSubmit={submit}>
      <div className="card__head"><div><h2>Shipping address</h2><p className="card__sub">Where we send your pieces. You can still change it at checkout.</p></div></div>
      <div className="form-grid">
        <label className="field full">Address<input className="input" autoComplete="address-line1" value={addr.line1 || ''} onChange={set('line1')} /></label>
        <label className="field full">Apartment, unit (optional)<input className="input" autoComplete="address-line2" value={addr.line2 || ''} onChange={set('line2')} /></label>
        <label className="field">Suburb or city<input className="input" autoComplete="address-level2" value={addr.city || ''} onChange={set('city')} /></label>
        <label className="field">State<input className="input" autoComplete="address-level1" value={addr.state || ''} onChange={set('state')} /></label>
        <label className="field">Postcode<input className="input" autoComplete="postal-code" inputMode="numeric" value={addr.postal_code || ''} onChange={set('postal_code')} /></label>
        <label className="field">Country<input className="input" autoComplete="country" value={addr.country || ''} onChange={set('country')} maxLength={2} /></label>
      </div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <div className="pt-actions"><Saved show={saved} /><button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button></div>
    </form>
  );
}

/** News and offers on or off. Order and support emails always arrive. */
function Marketing({ account }: { account: Account }) {
  const on = account.marketing?.email === true;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true); setError(null);
    try { await accountApi('/marketing', { email: !on }); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="card">
      <div className="card__head"><div><h2>Emails</h2><p className="card__sub">Order updates and replies from us always reach you.</p></div></div>
      <div className="pt-row">
        <div><b>New drops and offers</b><p className="card__sub">First word on new pieces, restocks and member offers. A few emails a month at most.</p></div>
        <button type="button" className="switch" role="switch" aria-checked={on} aria-label="New drops and offers" disabled={busy} onClick={toggle} />
      </div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
    </div>
  );
}

/** Change password (password accounts), or a note for Google sign-ins. */
function Password() {
  const { user } = useAccount();
  const hasPassword = !!user?.providerData.some(p => p.providerId === 'password');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!user || !user.email) return;
    if (next.length < 8) { setError('Use at least 8 characters.'); return; }
    setBusy(true); setError(null); setSaved(false);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      setCurrent(''); setNext(''); setSaved(true);
    } catch (err) {
      const c = (err as { code?: string }).code || '';
      setError(c === 'auth/invalid-credential' || c === 'auth/wrong-password' ? 'Your current password isn’t right.'
        : c === 'auth/too-many-requests' ? 'Too many attempts. Try again in a few minutes.' : 'That didn’t work. Please try again.');
    } finally { setBusy(false); }
  }

  if (!hasPassword) {
    return (
      <div className="card">
        <div className="card__head"><div><h2>Signing in</h2><p className="card__sub">You sign in with Google, so there’s no AXIA password to manage.</p></div></div>
      </div>
    );
  }
  return (
    <form className="card" onSubmit={save}>
      <div className="card__head"><div><h2>Password</h2><p className="card__sub">Change the password you sign in with.</p></div></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="cur-pw">Current password</label>
          <PasswordField id="cur-pw" value={current} onChange={v => { setCurrent(v); setSaved(false); }} autoComplete="current-password" placeholder="Current password" /></div>
        <div className="field"><label htmlFor="new-pw">New password</label>
          <PasswordField id="new-pw" value={next} onChange={v => { setNext(v); setSaved(false); }} autoComplete="new-password" placeholder="At least 8 characters" minLength={8} /></div>
      </div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <div className="pt-actions"><Saved show={saved} /><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button></div>
    </form>
  );
}

function Page({ title, lede, children }: { title: string; lede: string; children: (a: Account) => React.ReactNode }) {
  const { account } = useAccount();
  useEffect(() => { document.title = `${title} · AXIA`; }, [title]);
  if (!account) return null;
  return (
    <div className="page pt-page">
      <div className="page-head"><h1>{title}</h1><p className="lede">{lede}</p></div>
      {children(account)}
    </div>
  );
}

export const DetailsPage = () => <Page title="Details" lede="Your name and how to reach you.">{a => <Details key={a.email} account={a} />}</Page>;
export const AddressPage = () => <Page title="Address" lede="Where your pieces are sent.">{a => <AddressCard key={a.email} account={a} />}</Page>;
export const EmailsPage = () => <Page title="Emails" lede="Choose what we send you.">{a => <Marketing account={a} />}</Page>;
export const SecurityPage = () => <Page title="Sign-in" lede="How you sign in to your account.">{() => <Password />}</Page>;
