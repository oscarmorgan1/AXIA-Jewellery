import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAssumptions, useCollections, useCosts, useProducts } from '../lib/data';
import { collectionLabel, primaryCollection, statusOf } from '../lib/catalogue';
import { economics, productEconomics, retailAtSize, type Economics } from '../lib/economics';
import { costKey, costOf, sizesOf } from '../lib/variants';
import type { Product, ProductCost } from '../types';
import { aud, pct } from '../lib/format';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import { SkeletonRows } from '../components/Skeleton';

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
  const [allSizes, setAllSizes] = useState(false);

  // One row per product (at the size its cost was quoted for), or per size when it has costs per size.
  const rows = useMemo(() => {
    type Row = { p: Product; c?: ProductCost; e: Economics | null; key: string; size: string; retail: number | null; cost: number | null; estimated?: boolean; usd?: number | null; sizeKey?: string };
    const r: Row[] = [];
    for (const p of products.filter(x => !x.archived && !x.set && (!liveOnly || statusOf(x) === 'Live'))) {
      const c = costs.get(p.id);
      if (c?.variants && Object.keys(c.variants).length) {
        const sizes = sizesOf(p).filter(s => !liveOnly || !s.hidden);
        const quoted = (c.representativeSize || '').split('/').map(x => x.trim());
        const mainKey = quoted.length > 1 ? costKey(quoted[0], quoted[1]) : costKey(p.width, quoted[0] === 'one size' ? null : quoted[0]);
        const main = sizes.filter(s => s.key === mainKey);
        for (const s of (allSizes ? sizes : main.length ? main : sizes.slice(0, 1))) {
          const v = costOf(c, s.width, s.length);
          r.push({ p, c, key: `${p.id}/${s.key}`, sizeKey: s.key, size: [s.width, s.length].filter(Boolean).join(' / ') || 'one size', retail: s.priceAUD, cost: v?.factoryCostAUD ?? null, estimated: v?.estimated, usd: v?.factoryCostUSD,
            e: v?.factoryCostAUD != null ? economics(s.priceAUD, v.factoryCostAUD, assumptions) : null });
        }
      } else {
        r.push({ p, c, key: p.id, size: c?.representativeSize || '–', retail: retailAtSize(p, c?.representativeSize), cost: c?.factoryCostAUD ?? null, estimated: c?.factoryCostEstimated, e: productEconomics(p, c, assumptions) as Economics | null });
      }
    }
    const by: Record<SortKey, (x: typeof r[number]) => number | string> = {
      name: x => x.p.name, margin: x => x.e?.grossMarginPct ?? 999, contribution: x => -(x.e?.contributionAUD ?? -1e9), retail: x => -(x.e?.retailAUD ?? 0),
    };
    return r.sort((a, b) => (by[sort](a) < by[sort](b) ? -1 : by[sort](a) > by[sort](b) ? 1 : 0));
  }, [products, costs, assumptions, sort, liveOnly, allSizes]);

  const priced = rows.filter(r => r.e);
  const totRetail = priced.reduce((a, r) => a + r.e!.retailAUD, 0);
  const totGp = priced.reduce((a, r) => a + r.e!.grossProfitAUD, 0);
  const lowest = priced.reduce<typeof priced[number] | null>((lo, r) => (!lo || r.e!.grossMarginPct < lo.e!.grossMarginPct ? r : lo), null);

  async function saveCost(id: string, name: string, size: string | null | undefined, value: string, sizeKey?: string) {
    const n = value.trim() === '' ? null : Number(value);
    if (n != null && (Number.isNaN(n) || n < 0)) return toast.show('Enter a valid cost');
    const was = sizeKey ? costs.get(id)?.variants?.[sizeKey] : undefined;
    const data = sizeKey
      ? { id, name, variants: { [sizeKey]: { ...(was || {}), factoryCostAUD: n } }, updatedAt: serverTimestamp() }
      : { id, name, factoryCostAUD: n, representativeSize: size ?? null, updatedAt: serverTimestamp() };
    try { await setDoc(doc(db, 'productCosts', id), data, { merge: true }); }
    catch (e) { return toast.show(`Couldn’t save: ${(e as Error).message}`); }
    toast.show('Factory cost saved');
  }

  return (
    <>
      <div className="page-head"><h1>Margins</h1></div>
      <div className="grid-3">
        <StatCard label="Blended gross margin" value={pct(totRetail ? (totGp / totRetail) * 100 : null)} foot={<>One of each costed piece</>} />
        <StatCard label="Avg contribution / sale" value={aud(priced.length ? priced.reduce((a, r) => a + r.e!.contributionAUD, 0) / priced.length : null)} foot={<>After fees ({(assumptions.paymentFeePct * 100).toFixed(1)}% + {aud(assumptions.paymentFeeFixedAUD, 2)}) and packaging</>} />
        <StatCard label="Lowest margin" value={lowest ? pct(lowest.e!.grossMarginPct) : '–'} foot={lowest ? <b>{lowest.p.name}</b> : null} />
      </div>
      <div className="card">
        <div className="card__head">
          <div><h2>Per-product economics</h2><div className="card__sub">One row per product at its main size, or every size with “Every size”. Margins take GST off the retail price and add freight, as set in Settings. Edit a factory cost and margins update instantly.</div></div>
          <span className="spacer" />
          <label className="check"><input type="checkbox" checked={allSizes} onChange={e => setAllSizes(e.target.checked)} /> Every size</label>
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
            <tbody className={loading ? undefined : 'fade-in'}>
              {rows.map(({ p, c, e, key, size, retail, cost, estimated, usd, sizeKey }) => (
                <tr key={key}>
                  <td className="clickable" style={{ cursor: 'pointer' }} onClick={() => nav(`/products/${encodeURIComponent(p.id)}`)}>
                    {p.name}{p.width ? `, ${p.width}` : ''}<div style={{ color: 'var(--muted)', fontSize: 12 }}>{collectionLabel(primaryCollection(p, collections))} · {statusOf(p)}</div>
                  </td>
                  <td>{size}</td>
                  <td className="num">{aud(retail)}</td>
                  <td className="num">
                    <input key={`${key}-${cost}`} className="cell-input" type="number" min="0" step="1" defaultValue={cost ?? ''}
                      aria-label={`Factory cost for ${p.name} ${size}`}
                      onBlur={ev => { if (ev.target.value !== String(cost ?? '')) saveCost(p.id, p.name, c?.representativeSize, ev.target.value, sizeKey); }}
                      onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }} />
                    {(estimated || usd != null) && <div style={{ fontSize: 11, color: estimated ? 'var(--warn)' : 'var(--muted)' }}>{usd != null ? `US$${usd}` : ''}{estimated ? `${usd != null ? ' · ' : ''}estimate` : ''}</div>}
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
          {loading && <SkeletonRows rows={8} cols={6} />}
        </div>
      </div>
      {toast.node}
    </>
  );
}
