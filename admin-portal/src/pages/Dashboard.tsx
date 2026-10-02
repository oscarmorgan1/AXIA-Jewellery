import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BadgePercent, Eye, Gem, Inbox as InboxIcon, Mail, Package, PenLine, Sparkles, UserPlus, Users } from 'lucide-react';
import StatCard from '../components/StatCard';
import CountUp from '../components/CountUp';
import Donut from '../components/Donut';
import { BarChart } from '../components/Charts';
import { sydneyDay, useAssumptions, useCollections, useCosts, useMessages, useProducts, useSignups, useVisits } from '../lib/data';
import { collectionLabel, firstImage, primaryCollection, statusOf } from '../lib/catalogue';
import { productEconomics } from '../lib/economics';
import { aud, pct } from '../lib/format';
import { siteUrl, usingEmulators } from '../firebase';

export const PALETTE = ['var(--bar-strong)', '#2A6076', '#9FD3EA', '#F3436E', '#B7BDC5', '#6E7781', '#E3DED1'];
const DAY = 86400000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function ago(d?: Date) {
  if (!d) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const { data: products } = useProducts();
  const { data: collections } = useCollections();
  const { byId: costs } = useCosts();
  const { data: assumptions } = useAssumptions();
  const { data: signups } = useSignups();
  const { data: messages } = useMessages();
  const { data: visits } = useVisits();
  const [range, setRange] = useState<'daily' | 'weekly'>('daily');
  const [metric, setMetric] = useState<'visitors' | 'signups'>('visitors');

  const s = useMemo(() => {
    const active = products.filter(p => !p.archived);
    const live = active.filter(p => statusOf(p) === 'Live');
    const econ = live.map(p => productEconomics(p, costs.get(p.id), assumptions)).filter(Boolean);
    const emails = new Set(signups.map(x => x.email.toLowerCase()));
    const weekAgo = Date.now() - 7 * DAY;
    const newThisWeek = new Set(signups.filter(x => (x.createdAt?.toDate().getTime() ?? 0) > weekAgo).map(x => x.email.toLowerCase())).size;

    // sign-ups chart
    const today = startOfDay(new Date());
    const buckets = range === 'daily'
      ? Array.from({ length: 14 }, (_, i) => { const t = today - (13 - i) * DAY; return { from: t, to: t + DAY, label: new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }).replace(' ', '\u00a0') }; })
      : Array.from({ length: 8 }, (_, i) => { const t = today - (7 - i) * 7 * DAY - 6 * DAY; return { from: t, to: t + 7 * DAY, label: new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) }; });
    // visits are keyed by Sydney day; each bucket covers the Sydney days of its span
    const daysOf = (b: { from: number; to: number }) => { const out = new Set<string>(); for (let t = b.from + DAY / 2; t < b.to; t += DAY) out.add(sydneyDay(new Date(t))); return out; };
    const uniq = (vs: typeof visits) => new Set(vs.map(v => v.vid)).size;
    const series = buckets.map(b => {
      const days = daysOf(b);
      return {
        label: range === 'daily' ? b.label.split('\u00a0')[0] : b.label,
        value: metric === 'visitors'
          ? uniq(visits.filter(v => days.has(v.day)))
          : signups.filter(x => { const t = x.createdAt?.toDate().getTime() ?? 0; return t >= b.from && t < b.to; }).length,
      };
    });
    const spanFrom = buckets[0].from, spanTo = buckets[buckets.length - 1].to;
    const spanDays = daysOf({ from: spanFrom, to: spanTo });
    const inSpan = visits.filter(v => spanDays.has(v.day));
    const spanVisitors = uniq(inSpan);
    const spanSignups = new Set(signups.filter(x => { const t = x.createdAt?.toDate().getTime() ?? 0; return t >= spanFrom && t < spanTo; }).map(x => x.email.toLowerCase())).size;
    const srcCount = new Map<string, Set<string>>();
    inSpan.forEach(v => { const k = v.ref || 'Direct or typed in'; if (!srcCount.has(k)) srcCount.set(k, new Set()); srcCount.get(k)!.add(v.vid); });
    const sources = [...srcCount.entries()].map(([label, set]) => ({ label, n: set.size })).sort((a, b) => b.n - a.n).slice(0, 4);
    const todayKey = sydneyDay(new Date());
    const week = new Set(Array.from({ length: 7 }, (_, i) => sydneyDay(new Date(Date.now() - i * DAY))));
    const visitors7 = uniq(visits.filter(v => week.has(v.day)));
    const visitorsToday = uniq(visits.filter(v => v.day === todayKey));

    // collections donut (live pieces per shop collection)
    const shopCols = collections.filter(c => c.showInShop);
    const counts = shopCols.map(c => ({ c, n: live.filter(p => (p.coll || []).includes(c.slug)).length })).filter(x => x.n > 0);
    const donut = counts.map((x, i) => ({ label: collectionLabel(x.c), value: x.n, color: PALETTE[i % PALETTE.length] }));

    // most wanted (sign-up interest by product)
    const want = new Map<string, number>();
    signups.forEach(x => { if (x.productId) want.set(x.productId, (want.get(x.productId) || 0) + 1); });
    const wanted = [...want.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([id, n]) => ({ p: products.find(p => p.id === id), id, n })).filter(x => x.p);
    const fallbackTop = live.slice().sort((a, b) => (b.fromPriceAUD || 0) - (a.fromPriceAUD || 0)).slice(0, 6);

    // activity feed
    const feed = [
      ...signups.slice(0, 8).map(x => ({ t: x.createdAt?.toDate(), icon: <UserPlus size={18} />, tone: 'ice', title: `${x.firstName} joined the waitlist`, sub: x.productName || x.email, to: `/customers?q=${encodeURIComponent(x.email)}` })),
      ...messages.slice(0, 6).map(m => ({ t: m.createdAt?.toDate(), icon: <Mail size={18} />, tone: m.status === 'done' ? '' : 'magenta', title: `${m.topic} from ${m.name}`, sub: m.message.slice(0, 70), to: '/inbox' })),
      ...products.filter(p => p.updatedAt).slice().sort((a, b) => ((b.updatedAt as { toMillis?: () => number })?.toMillis?.() ?? 0) - ((a.updatedAt as { toMillis?: () => number })?.toMillis?.() ?? 0)).slice(0, 4)
        .map(p => ({ t: (p.updatedAt as { toDate?: () => Date })?.toDate?.(), icon: <PenLine size={18} />, tone: '', title: `${p.name} updated`, sub: statusOf(p), to: `/products/${encodeURIComponent(p.id)}` })),
    ].filter(x => x.t).sort((a, b) => b.t!.getTime() - a.t!.getTime()).slice(0, 6);

    return {
      active, live, emails, newThisWeek, series, donut, wanted, fallbackTop, feed,
      spanVisitors, spanSignups, sources, visitors7, visitorsToday,
      unread: messages.filter(m => m.status !== 'done').length,
      avgGross: avg(econ.map(e => e!.grossMarginPct)),
    };
  }, [products, collections, costs, assumptions, signups, messages, visits, range, metric]);

  const hello = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{hello}</h1>
          <p className="lede" style={{ margin: 0 }}>Here’s what’s happening across AXIA.</p>
        </div>
        <span className="spacer" />
        {usingEmulators && <span className="env-badge">Local emulators</span>}
        <Link to="/products/new" className="btn btn--primary"><Sparkles size={16} /> New product</Link>
      </div>

      <div className="grid-4 stagger">
        <StatCard tone="dark" label="Visitors, last 7 days" icon={<Eye size={22} />}
          value={<CountUp value={s.visitors7} />} foot={<><b>{s.visitorsToday}</b> so far today</>} />
        <StatCard tone="ice" label="Customers" icon={<Users size={22} />}
          value={<CountUp value={s.emails.size} />} foot={<><b>+{s.newThisWeek}</b> this week</>} />
        <StatCard tone={s.unread ? 'magenta' : ''} label="Unread messages" icon={<InboxIcon size={22} />}
          value={<CountUp value={s.unread} />} foot={<Link to="/inbox" style={{ color: 'var(--accent)' }}>Open inbox</Link>} />
        <StatCard tone="good" label="Avg gross margin" icon={<BadgePercent size={22} />}
          value={<CountUp value={s.avgGross} format={n => pct(n)} />} foot={<Link to="/margins" style={{ color: 'var(--accent)' }}>See margins</Link>} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card__head">
            <div className="card__title"><Activity size={18} /><h2>Traffic</h2></div>
            <span className="spacer" />
            <div className="segmented">
              <button className={metric === 'visitors' ? 'on' : ''} onClick={() => setMetric('visitors')}>Visitors</button>
              <button className={metric === 'signups' ? 'on' : ''} onClick={() => setMetric('signups')}>Sign-ups</button>
            </div>
            <div className="segmented">
              <button className={range === 'daily' ? 'on' : ''} onClick={() => setRange('daily')}>Daily</button>
              <button className={range === 'weekly' ? 'on' : ''} onClick={() => setRange('weekly')}>Weekly</button>
            </div>
          </div>
          <div className="card__sub" style={{ marginTop: -6 }}>
            <b>{s.spanVisitors}</b> unique visitor{s.spanVisitors === 1 ? '' : 's'} and <b>{s.spanSignups}</b> new sign-up{s.spanSignups === 1 ? '' : 's'} in the last {range === 'daily' ? '14 days' : '8 weeks'}
            {s.spanVisitors > 0 && <> · <b>{Math.round((s.spanSignups / s.spanVisitors) * 1000) / 10}%</b> signed up</>}
          </div>
          <BarChart key={range + metric} data={s.series} format={n => metric === 'visitors' ? `${n} visitor${n === 1 ? '' : 's'}` : `${n} sign-up${n === 1 ? '' : 's'}`} />
          {metric === 'visitors' && s.sources.length > 0 && (
            <div className="rank" style={{ marginTop: 8 }}>
              {s.sources.map((x, i) => (
                <div className="rank__row" key={x.label}>
                  <i style={{ background: PALETTE[i % PALETTE.length] }} /><span>{x.label}</span>
                  <span>{x.n} visitor{x.n === 1 ? '' : 's'}</span><b>{Math.round((x.n / Math.max(1, s.spanVisitors)) * 100)}%</b>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card__head">
            <div className="card__title"><Package size={18} /><h2>Collections</h2></div>
            <span className="spacer" /><Link to="/collections" className="btn btn--sm">Manage</Link>
          </div>
          {s.donut.length ? (
            <>
              <Donut data={s.donut} centerLabel="Live pieces" centerValue={String(s.live.length)} />
              <div className="rank">
                {s.donut.map(d => (
                  <div className="rank__row" key={d.label}>
                    <i style={{ background: d.color }} /><span>{d.label}</span>
                    <span>{d.value} piece{d.value === 1 ? '' : 's'}</span><b>{Math.round((d.value / s.donut.reduce((a, x) => a + x.value, 0)) * 100)}%</b>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="empty">No live pieces in shop collections yet.</div>}
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)' }}>
        <div className="card">
          <div className="card__head"><div className="card__title"><Activity size={18} /><h2>Recent activity</h2></div><span className="spacer" /><Link to="/customers" className="btn btn--sm">See all</Link></div>
          {s.feed.length ? (
            <div className="feed">
              {s.feed.map((f, i) => (
                <Link key={i} to={f.to} className="feed__item">
                  <span className={`feed__icon stat__icon--${f.tone || 'x'}`}>{f.icon}</span>
                  <div className="feed__body"><b>{f.title}</b><small>{f.sub}</small></div>
                  <small style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{ago(f.t)}</small>
                </Link>
              ))}
            </div>
          ) : <div className="empty"><b>Quiet so far</b>Sign-ups, messages and edits will show here.</div>}
        </div>

        <div className="card">
          <div className="card__head">
            <div className="card__title"><Gem size={18} /><h2>{s.wanted.length ? 'Most wanted' : 'Top pieces'}</h2></div>
            <span className="spacer" /><span className="card__sub" style={{ margin: 0 }}>{s.wanted.length ? 'By waitlist interest' : 'Highest priced live pieces'}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Product</th><th>Collection</th><th className="num">From</th><th className="num">{s.wanted.length ? 'Interest' : 'Margin'}</th></tr></thead>
              <tbody className="rows-anim">
                {(s.wanted.length ? s.wanted.map(x => ({ p: x.p!, n: x.n as number | null })) : s.fallbackTop.map(p => ({ p, n: null }))).map(({ p, n }) => {
                  const img = firstImage(p);
                  const e = productEconomics(p, costs.get(p.id), assumptions);
                  return (
                    <tr key={p.id}>
                      <td><Link to={`/products/${encodeURIComponent(p.id)}`} className="prod-cell">
                        {img ? <img className="thumb" src={siteUrl(img)} alt="" loading="lazy" /> : <span className="thumb" />}
                        <div>{p.name}<small>{p.width || p.id}</small></div>
                      </Link></td>
                      <td>{collectionLabel(primaryCollection(p, collections))}</td>
                      <td className="num">{aud(p.fromPriceAUD)}</td>
                      <td className="num">{n != null ? <span className="chip chip--ice">{n} sign-up{n === 1 ? '' : 's'}</span> : e ? pct(e.grossMarginPct) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
