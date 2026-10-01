import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useAssumptions, useCosts, useProducts } from '../lib/data';
import { collectionOf, firstImage, statusOf, type Status } from '../lib/catalogue';
import { productEconomics } from '../lib/economics';
import { aud, pct, timeAgo } from '../lib/format';
import { siteUrl } from '../firebase';

const STATUS_CHIP: Record<Status, string> = { Live: 'chip--good', 'Coming soon': 'chip--warn', Redirect: 'chip--muted', Archived: 'chip--bad' };
type Filter = 'all' | 'live' | 'soon' | 'archived';

export default function Products() {
  const { data: products, loading, error } = useProducts();
  const { byId: costs } = useCosts();
  const { data: assumptions } = useAssumptions();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [coll, setColl] = useState('');
  const q = params.get('q') || '';

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter(p => {
      const st = statusOf(p);
      if (filter === 'all' && st === 'Archived') return false;
      if (filter === 'live' && st !== 'Live') return false;
      if (filter === 'soon' && st !== 'Coming soon') return false;
      if (filter === 'archived' && st !== 'Archived') return false;
      if (coll && collectionOf(p) !== coll) return false;
      if (s && !`${p.name} ${p.id} ${p.width || ''} ${(p.col || []).join(' ')} ${p.badge || ''}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [products, filter, coll, q]);

  return (
    <>
      <div className="page-head">
        <h1>Store</h1>
        <span className="spacer" />
        <Link to="/products/new" className="btn btn--primary"><Plus size={16} /> Add product</Link>
      </div>
      <div className="card">
        <div className="card__head">
          <div className="segmented">
            {([['all', 'All'], ['live', 'Live'], ['soon', 'Coming soon'], ['archived', 'Archived']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <select className="select" style={{ width: 170, borderRadius: 999 }} value={coll} onChange={e => setColl(e.target.value)} aria-label="Collection">
            <option value="">All collections</option>
            {['Cuban', 'Tennis', 'Titans', 'Pendants', 'Sets'].map(c => <option key={c}>{c}</option>)}
          </select>
          <span className="spacer" />
          <div className="search"><Search size={16} />
            <input placeholder="Search" value={q} onChange={e => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} />
          </div>
        </div>
        {error && <div className="notice notice--error">{error.message}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>Product</th><th>Collection</th><th>Status</th><th>Colours</th><th>Sizes</th>
              <th className="num">From</th><th className="num">Gross margin</th><th>Updated</th>
            </tr></thead>
            <tbody>
              {shown.map(p => {
                const st = statusOf(p);
                const e = productEconomics(p, costs.get(p.id), assumptions);
                const sizes = (p.widths?.reduce((a, w) => a + (w.variants?.length || 0), 0)) || p.variants?.length || 0;
                const img = firstImage(p);
                return (
                  <tr key={p.id} className="clickable" onClick={() => nav(`/products/${encodeURIComponent(p.id)}`)}>
                    <td><div className="prod-cell">
                      {img ? <img className="thumb" src={siteUrl(img)} alt="" loading="lazy" /> : <span className="thumb" />}
                      <div>{p.name}{p.width ? `, ${p.width}` : ''}<small>{p.id}{p.badge ? ` · ${p.badge}` : ''}</small></div>
                    </div></td>
                    <td>{collectionOf(p)}</td>
                    <td><span className={`chip ${STATUS_CHIP[st]}`}>{st}</span></td>
                    <td>{(p.col || []).join(', ') || '–'}</td>
                    <td>{sizes || '–'}</td>
                    <td className="num">{aud(p.fromPriceAUD)}</td>
                    <td className="num">{e ? <span className={`chip ${e.grossMarginPct >= 50 ? 'chip--good' : e.grossMarginPct >= 40 ? 'chip--warn' : 'chip--bad'}`}>{pct(e.grossMarginPct)}</span> : '–'}</td>
                    <td>{timeAgo(p.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && !shown.length && <div className="empty"><b>No products match</b>Try a different filter or search.</div>}
          {loading && <div className="empty">Loading…</div>}
        </div>
      </div>
    </>
  );
}
