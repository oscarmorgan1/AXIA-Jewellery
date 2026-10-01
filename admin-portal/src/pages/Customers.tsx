import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Mail, MessageSquare, Phone, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useMessages, useSignups } from '../lib/data';
import StatCard from '../components/StatCard';
import CountUp from '../components/CountUp';
import Drawer from '../components/Drawer';
import { useToast } from '../components/Toast';
import type { Signup } from '../types';

interface Customer {
  email: string;
  name: string;
  mobile: string;
  instagram: string;
  interests: string[];
  sources: string[];
  smsConsent: boolean;
  emailConsent: boolean;
  first?: Date;
  last?: Date;
  entries: Signup[];
}

const fmtDate = (d?: Date) => (d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const SOURCE: Record<string, string> = { landing: 'Waitlist page', 'first-drop': 'First Drop page', other: 'Other' };
const initials = (n: string) => n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();

function csv(rows: Customer[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Name', 'Email', 'Mobile', 'Instagram', 'Interested in', 'Email consent', 'SMS consent', 'Sources', 'First signed up', 'Last signed up', 'Sign-ups'];
  const body = rows.map(c => [c.name, c.email, c.mobile, c.instagram, c.interests.join('; '), c.emailConsent ? 'Yes' : 'No', c.smsConsent ? 'Yes' : 'No',
    c.sources.map(s => SOURCE[s] || s).join('; '), c.first?.toISOString() ?? '', c.last?.toISOString() ?? '', c.entries.length].map(esc).join(','));
  return [head.map(esc).join(','), ...body].join('\n');
}

export default function Customers() {
  const { data: signups, loading, error } = useSignups();
  const { data: messages } = useMessages();
  const [params, setParams] = useSearchParams();
  const [smsOnly, setSmsOnly] = useState(false);
  const [open, setOpen] = useState<Customer | null>(null);
  const toast = useToast();
  const q = params.get('q') || '';

  const customers = useMemo(() => {
    const map = new Map<string, Customer>();
    // oldest first so the latest entry wins for contact details
    [...signups].reverse().forEach(s => {
      const key = s.email.toLowerCase();
      const c = map.get(key) || { email: key, name: '', mobile: '', instagram: '', interests: [], sources: [], smsConsent: false, emailConsent: false, entries: [] } as Customer;
      const t = s.createdAt?.toDate();
      c.name = s.firstName || c.name;
      c.mobile = s.mobile || c.mobile;
      c.instagram = s.instagram || c.instagram;
      const want = [s.productName, s.size].filter(Boolean).join(' · ');
      if (want && !c.interests.includes(want)) c.interests.push(want);
      if (s.source && !c.sources.includes(s.source)) c.sources.push(s.source);
      c.smsConsent = !!s.smsConsent;
      c.emailConsent = c.emailConsent || !!s.emailConsent;
      if (t && (!c.first || t < c.first)) c.first = t;
      if (t && (!c.last || t > c.last)) c.last = t;
      c.entries.unshift(s);
      map.set(key, c);
    });
    return [...map.values()].sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0));
  }, [signups]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return customers.filter(c => (!smsOnly || c.smsConsent)
      && (!s || `${c.name} ${c.email} ${c.mobile} ${c.instagram} ${c.interests.join(' ')}`.toLowerCase().includes(s)));
  }, [customers, q, smsOnly]);

  const weekAgo = Date.now() - 7 * 86400000;
  const newWeek = customers.filter(c => (c.first?.getTime() ?? 0) > weekAgo).length;
  const sms = customers.filter(c => c.smsConsent).length;

  function exportCsv() {
    const blob = new Blob([csv(shown)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `axia-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function remove(c: Customer) {
    if (!confirm(`Delete ${c.name || c.email} and all ${c.entries.length} of their sign-ups? Use this for privacy deletion requests. It can’t be undone.`)) return;
    const b = writeBatch(db);
    c.entries.forEach(e => b.delete(doc(db, 'signups', e.id)));
    await b.commit();
    setOpen(null);
    toast.show('Customer deleted');
  }

  const theirMessages = open ? messages.filter(m => m.email.toLowerCase() === open.email) : [];

  return (
    <>
      <div className="page-head">
        <div><h1>Customers</h1><p className="lede" style={{ margin: 0 }}>Everyone who joined the waitlist on the site. Sign-ups land here straight away.</p></div>
        <span className="spacer" />
        <button className="btn" onClick={exportCsv} disabled={!shown.length}><Download size={16} /> Export CSV</button>
      </div>

      <div className="grid-3 stagger">
        <StatCard tone="dark" label="Customers" icon={<Users size={22} />} value={<CountUp value={customers.length} />} foot={<>{signups.length} sign-ups in total</>} />
        <StatCard tone="ice" label="New this week" icon={<UserPlus size={22} />} value={<CountUp value={newWeek} />} foot="First signed up in the last 7 days" />
        <StatCard tone="good" label="Happy to get texts" icon={<Phone size={22} />} value={<CountUp value={sms} />} foot={customers.length ? `${Math.round((sms / customers.length) * 100)}% opted in to SMS` : 'No sign-ups yet'} />
      </div>

      <div className="card">
        <div className="card__head">
          <div className="search"><Search size={16} />
            <input placeholder="Search name, email, piece…" value={q} onChange={e => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} />
          </div>
          <label className="check"><input type="checkbox" checked={smsOnly} onChange={e => setSmsOnly(e.target.checked)} /> SMS opt-in only</label>
          <span className="spacer" />
          <span className="sub" style={{ margin: 0 }}>{shown.length} of {customers.length}</span>
        </div>
        {error && <div className="notice notice--error">{error.message}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Customer</th><th>Mobile</th><th>Interested in</th><th>Came from</th><th>Consent</th><th className="num">Joined</th></tr></thead>
            <tbody className="rows-anim">
              {shown.map(c => (
                <tr key={c.email} className="clickable" onClick={() => setOpen(c)}>
                  <td><div className="prod-cell">
                    <span className="avatar">{initials(c.name || c.email)}</span>
                    <div>{c.name || '–'}<small>{c.email}</small></div>
                  </div></td>
                  <td>{c.mobile || '–'}</td>
                  <td style={{ maxWidth: 260 }}>{c.interests[0] || '–'}{c.interests.length > 1 && <span className="sub">+{c.interests.length - 1} more</span>}</td>
                  <td>{c.sources.map(s => SOURCE[s] || s).join(', ') || '–'}</td>
                  <td><div className="tags" style={{ gap: 4 }}>
                    {c.emailConsent && <span className="chip chip--ice">Email</span>}
                    {c.smsConsent && <span className="chip chip--good">SMS</span>}
                  </div></td>
                  <td className="num">{fmtDate(c.first)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div style={{ padding: 22, display: 'grid', gap: 10 }}>{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 44 }} />)}</div>}
          {!loading && !shown.length && <div className="empty"><Users size={28} /><b>{customers.length ? 'No one matches' : 'No sign-ups yet'}</b>{customers.length ? 'Try a different search.' : 'When someone joins the waitlist on the site, they’ll appear here.'}</div>}
        </div>
      </div>

      {open && (
        <Drawer title={open.name || open.email} onClose={() => setOpen(null)}
          footer={<>
            <button className="btn btn--danger" onClick={() => remove(open)}><Trash2 size={15} /> Delete</button>
            <span style={{ flex: 1 }} />
            <a className="btn btn--primary" href={`mailto:${open.email}`}><Mail size={15} /> Write to them</a>
          </>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 20 }}>{initials(open.name || open.email)}</span>
            <div><b style={{ fontSize: 17 }}>{open.name}</b><div className="sub">Customer since {fmtDate(open.first)}</div></div>
          </div>
          <dl className="kv">
            <dt>Email</dt><dd>{open.email}</dd>
            <dt>Mobile</dt><dd>{open.mobile || '–'}</dd>
            <dt>Instagram</dt><dd>{open.instagram || '–'}</dd>
            <dt>Email consent</dt><dd>{open.emailConsent ? 'Yes' : 'No'}</dd>
            <dt>SMS consent</dt><dd>{open.smsConsent ? 'Yes' : 'No'}</dd>
          </dl>
          <div className="field">Sign-ups ({open.entries.length})
            <div className="feed">
              {open.entries.map(e => (
                <div className="feed__item" key={e.id}>
                  <span className="feed__icon stat__icon--ice"><UserPlus size={17} /></span>
                  <div className="feed__body"><b>{[e.productName, e.size].filter(Boolean).join(' · ') || 'General interest'}</b><small>{SOURCE[e.source || ''] || e.source} · {e.createdAt?.toDate().toLocaleString('en-AU') ?? ''}</small></div>
                </div>
              ))}
            </div>
          </div>
          {theirMessages.length > 0 && (
            <div className="field">Messages ({theirMessages.length})
              <div className="feed">
                {theirMessages.map(m => (
                  <div className="feed__item" key={m.id} style={{ alignItems: 'flex-start' }}>
                    <span className="feed__icon"><MessageSquare size={17} /></span>
                    <div className="feed__body"><b>{m.topic}{m.order ? ` · ${m.order}` : ''}</b><small style={{ whiteSpace: 'pre-wrap' }}>{m.message}</small></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Drawer>
      )}
      {toast.node}
    </>
  );
}
