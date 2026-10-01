import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAssumptions, useCollections, useCosts, useProducts } from '../lib/data';
import { collectionLabel, primaryCollection, statusOf } from '../lib/catalogue';
import { productEconomics, retailAtSize, type Economics } from '../lib/economics';
import { aud, pct } from '../lib/format';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import { BadgePercent, TrendingDown, Wallet } from 'lucide-react';

type SortKey = 'name' | 'margin' | 'contribution' | 'retail';

export default function Margins() {
  const { data: products } = useProducts();
  const { byId: costs, loading, error } = useCosts();
  const { data: assumptions } = useAssumptions();
  const { data: collections } = useCollections();
  const nav = useNavigate();
  const toast = useToast();
  const [sort, setSort] = useState<SortKey>('margin');
  const [liveOnly, setLiveOnly] = useState(false);

  const rows = useMemo(() => {
    const r = products.filter(p => !p.archived && (!liveOnly || statusOf(p) === 'Live')).map(p => {
      const c = costs.get(p.id);
      return { p, c, e: productEconomics(p, c, assumptions) as Economics | null };
    });
    const by: Record<SortKey, (x: typeof r[number]) => number | string> = {
      name: x => x.p.name, margin: x => x.e?.grossMarginPct ?? 999, contribution: x => -(x.e?.contributionAUD ?? -1e9), retail: x => -(x.e?.retailAUD ?? 0),
    };
    return r.sort((a, b) => (by[sort](a) < by[sort](b) ? -1 : by[sort](a) > by[sort](b) ? 1 : 0));
  }, [products, costs, assumptions, sort, liveOnly]);

  const priced = rows.filter(r => r.e);
  const totRetail = priced.reduce((a, r) => a + r.e!.retailAUD, 0);
  const totGp = priced.reduce((a, r) => a + r.e!.grossProfitAUD, 0);
  const lowest = priced.reduce<typeof priced[number] | null>((lo, r) => (!lo || r.e!.grossMarginPct < lo.e!.grossMarginPct ? r : lo), null);

  async function saveCost(id: string, name: string, size: string | null | undefined, value: string) {
    const n = value.trim() === '' ? null : Number(value);
    if (n != null && (Number.isNaN(n) || n < 0)) return toast.show('Enter a valid cost');
    await setDoc(doc(db, 'productCosts', id), { id, name, factoryCostAUD: n, representativeSize: size ?? null, updatedAt: serverTimestamp() }, { merge: true });
    toast.show('Factory cost saved');
  }

  return (
    <>
      <div className="page-head"><h1>Margins</h1></div>
      <div className="grid-3 stagger">
        <StatCard label="Blended gross margin" value={pct(totRetail ? (totGp / totRetail) * 100 : null)} tone="good" icon={<BadgePercent size={20} />} foot={<>One of each costed piece</>} />
        <StatCard label="Avg contribution / sale" value={aud(priced.length ? priced.reduce((a, r) => a + r.e!.contributionAUD, 0) / priced.length : null)} tone="ice" icon={<Wallet size={20} />} foot={<>After fees ({(assumptions.paymentFeePct * 100).toFixed(1)}% + {aud(assumptions.paymentFeeFixedAUD, 2)}) and packaging</>} />
        <StatCard label="Lowest margin" value={lowest ? pct(lowest.e!.grossMarginPct) : '–'} tone="magenta" icon={<TrendingDown size={20} />} foot={lowest ? <b>{lowest.p.name}</b> : null} />
      </div>
      <div className="card">
        <div className="private-note"><Lock size={14} /> Private. Factory costs live in an admin-only collection and are never sent to the storefront.</div>
        <div className="card__head">
          <div><h2>Per-product economics</h2><div className="card__sub">Retail is taken at the size the factory quoted. Edit a factory cost and margins update instantly.</div></div>
          <span className="spacer" />
          <label className="check"><input type="checkbox" checked={liveOnly} onChange={e => setLiveOnly(e.target.checked)} /> Live only</label>
          <select className="select" style={{ width: 190, borderRadius: 999 }} value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort by">
            <option value="margin">Sort: lowest margin</option><option value="contribution">Sort: most contribution</option>
            <option value="retail">Sort: highest price</option><option value="name">Sort: name</option>
          </select>
        </div>
        {error && <div className="notice notice--error">{error.message}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>Product</th><th>Quoted size</th><th className="num">Retail</th><th className="num">Factory cost</th>
              <th className="num">Gross profit</th><th className="num">Gross margin</th><th className="num">Contribution</th>
              <th className="num">Break-even ROAS</th><th className="num">Max ad / sale</th>
            </tr></thead>
            <tbody className="rows-anim">
              {rows.map(({ p, c, e }) => (
                <tr key={p.id}>
                  <td className="clickable" style={{ cursor: 'pointer' }} onClick={() => nav(`/products/${encodeURIComponent(p.id)}`)}>
                    {p.name}{p.width ? `, ${p.width}` : ''}<div style={{ color: 'var(--muted)', fontSize: 12 }}>{collectionLabel(primaryCollection(p, collections))} · {statusOf(p)}</div>
                  </td>
                  <td>{c?.representativeSize || '–'}</td>
                  <td className="num">{aud(retailAtSize(p, c?.representativeSize))}</td>
                  <td className="num">
                    <input key={`${p.id}-${c?.factoryCostAUD}`} className="cell-input" type="number" min="0" step="1" defaultValue={c?.factoryCostAUD ?? ''}
                      aria-label={`Factory cost for ${p.name}`}
                      onBlur={ev => { if (ev.target.value !== String(c?.factoryCostAUD ?? '')) saveCost(p.id, p.name, c?.representativeSize, ev.target.value); }}
                      onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }} />
                    {c?.factoryCostEstimated && <div style={{ fontSize: 11, color: 'var(--warn)' }}>estimate</div>}
                  </td>
                  <td className="num">{aud(e?.grossProfitAUD)}</td>
                  <td className="num">{e ? <span className={`chip ${e.grossMarginPct >= 50 ? 'chip--good' : e.grossMarginPct >= 40 ? 'chip--warn' : 'chip--bad'}`}>{pct(e.grossMarginPct)}</span> : '–'}</td>
                  <td className="num">{aud(e?.contributionAUD, 2)}</td>
                  <td className="num">{e?.breakEvenRoas ? e.breakEvenRoas.toFixed(2) + '×' : '–'}</td>
                  <td className="num">{aud(e?.maxAdPerSaleAUD, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="empty">Loading…</div>}
        </div>
      </div>
      {toast.node}
    </>
  );
}
