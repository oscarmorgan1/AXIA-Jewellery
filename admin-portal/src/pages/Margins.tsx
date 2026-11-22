import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { RotateCcw } from 'lucide-react';
import { db } from '../firebase';
import { useAssumptions, useCollections, useCosts, useOrders, useProducts, usePromotions, useStoreDiscount } from '../lib/data';
import { collectionLabel, primaryCollection, statusOf } from '../lib/catalogue';
import { economics, orderEconomics, priceForMargin, productEconomics, retailAtSize, tryPrice, type Economics } from '../lib/economics';
import { promoFor, runningPromotions, salePrice } from '../lib/promotions';
import { isSale } from '../lib/orders';
import { costKey, costOf, sizesOf } from '../lib/variants';
import type { Product, ProductCost, Promotion } from '../types';
import { aud, pct } from '../lib/format';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import { SkeletonRows } from '../components/Skeleton';

type SortKey = 'name' | 'margin' | 'contribution' | 'retail';
type Mode = 'today' | 'simulate';

const chip = (m: number, floor = 50) => (m >= floor ? 'chip--good' : m >= floor - 10 ? 'chip--warn' : 'chip--bad');
const pp = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)} pts`;
const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? 0 : Number(v));

export default function Margins() {
  const { data: products } = useProducts();
  const { byId: costs, loading, error } = useCosts();
  const { data: assumptions } = useAssumptions();
  const { data: collections } = useCollections();
  const { data: promoItems } = usePromotions();
  const { data: legacy } = useStoreDiscount();
  const { data: orders } = useOrders();
  const nav = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('today');
  const [sort, setSort] = useState<SortKey>('margin');
  const [liveOnly, setLiveOnly] = useState(false);
  const [allSizes, setAllSizes] = useState(false);

  // Simulator: what-if settings, never saved.
  const [discount, setDiscount] = useState('0');
  const [change, setChange] = useState('0');
  const [scope, setScope] = useState('all');
  const [target, setTarget] = useState('50');
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const running = useMemo(() => runningPromotions(promoItems, legacy), [promoItems, legacy]);

  // One row per product (at the size its cost was quoted for), or per size when it has costs per size.
  const rows = useMemo(() => {
    type Row = { p: Product; c?: ProductCost; e: Economics | null; key: string; size: string; retail: number | null; cost: number | null; estimated?: boolean; usd?: number | null; sizeKey?: string; promo: Promotion | null; sale: number | null; saleE: Economics | null };
    const r: Row[] = [];
    const withSale = (x: Omit<Row, 'promo' | 'sale' | 'saleE'>): Row => {
      const promo = x.retail != null && statusOf(x.p) === 'Live' ? promoFor(running, x.p, x.retail) : null;
      const sale = promo && x.retail != null ? salePrice(x.retail, promo.pct) : null;
      return { ...x, promo, sale, saleE: sale != null && x.cost != null ? economics(sale, x.cost, assumptions) : null };
    };
    for (const p of products.filter(x => !x.archived && !x.set && (!liveOnly || statusOf(x) === 'Live'))) {
      const c = costs.get(p.id);
      if (c?.variants && Object.keys(c.variants).length) {
        const sizes = sizesOf(p).filter(s => !liveOnly || !s.hidden);
        const quoted = (c.representativeSize || '').split('/').map(x => x.trim());
        const mainKey = quoted.length > 1 ? costKey(quoted[0], quoted[1]) : costKey(p.width, quoted[0] === 'one size' ? null : quoted[0]);
        const main = sizes.filter(s => s.key === mainKey);
        for (const s of (allSizes ? sizes : main.length ? main : sizes.slice(0, 1))) {
          const v = costOf(c, s.width, s.length);
          r.push(withSale({ p, c, key: `${p.id}/${s.key}`, sizeKey: s.key, size: [s.width, s.length].filter(Boolean).join(' / ') || 'one size', retail: s.priceAUD, cost: v?.factoryCostAUD ?? null, estimated: v?.estimated, usd: v?.factoryCostUSD,
            e: v?.factoryCostAUD != null ? economics(s.priceAUD, v.factoryCostAUD, assumptions) : null }));
        }
      } else {
        r.push(withSale({ p, c, key: p.id, size: c?.representativeSize || '–', retail: retailAtSize(p, c?.representativeSize), cost: c?.factoryCostAUD ?? null, estimated: c?.factoryCostEstimated, e: productEconomics(p, c, assumptions) as Economics | null }));
      }
    }
    const by: Record<SortKey, (x: typeof r[number]) => number | string> = {
      name: x => x.p.name, margin: x => (x.saleE ?? x.e)?.grossMarginPct ?? 999, contribution: x => -((x.saleE ?? x.e)?.contributionAUD ?? -1e9), retail: x => -(x.e?.retailAUD ?? 0),
    };
    return r.sort((a, b) => (by[sort](a) < by[sort](b) ? -1 : by[sort](a) > by[sort](b) ? 1 : 0));
  }, [products, costs, assumptions, sort, liveOnly, allSizes, running]);

  const priced = rows.filter(r => r.e);
  const blended = (list: { retail: number; e: Economics }[]) => {
    const net = list.reduce((a, r) => a + r.e.netRetailAUD, 0);
    return net ? (list.reduce((a, r) => a + r.e.grossProfitAUD, 0) / net) * 100 : null;
  };
  const avg = (list: Economics[], f: (e: Economics) => number) => (list.length ? list.reduce((a, e) => a + f(e), 0) / list.length : null);

  // Today: at full price, and at what buyers pay while a promotion runs.
  const nowE = priced.map(r => ({ retail: r.retail!, e: r.e! }));
  const payE = priced.map(r => ({ retail: r.sale ?? r.retail!, e: r.saleE ?? r.e! }));
  const onSale = priced.filter(r => r.promo);
  const lowest = priced.reduce<typeof priced[number] | null>((lo, r) => (!lo || (r.saleE ?? r.e)!.grossMarginPct < (lo.saleE ?? lo.e)!.grossMarginPct ? r : lo), null);

  // What orders really made, after promotions and promo codes.
  const sold = useMemo(() => {
    const byId = new Map(products.map(p => [p.id, p]));
    const list = orders.filter(isSale).map(o => orderEconomics(o, id => costs.get(id), assumptions, id => byId.get(id)));
    const costed = list.filter(x => x.grossMarginPct != null);
    const gst = 1 + (assumptions.gstPct || 0);
    const net = costed.reduce((a, x) => a + x.costedRevenueAUD / gst, 0);
    const gp = costed.reduce((a, x) => a + x.grossProfitAUD, 0);
    const off = list.reduce((a, x) => a + x.promotionOffAUD + x.couponOffAUD, 0);
    return { orders: list.length, margin: net ? (gp / net) * 100 : null, gp, off, partial: list.some(x => x.missing.length) };
  }, [orders, costs, assumptions, products]);

  // Simulator rows: the price each piece would sell at, and its margin there.
  const sim = useMemo(() => {
    const d = Math.min(90, Math.max(0, num(discount))), ch = Math.max(-90, num(change)), t = Math.min(95, Math.max(0, num(target)));
    const inScope = (p: Product) => scope === 'all' || (p.coll || []).includes(scope);
    const list = rows.map(r => {
      const hit = inScope(r.p);
      const price = r.retail == null ? null : tryPrice(r.retail, { changePct: hit ? ch : 0, discountPct: hit ? d : 0, override: overrides[r.key] });
      const e = price != null && r.cost != null ? economics(price, r.cost, assumptions) : null;
      return { ...r, hit, price, simE: e, forTarget: r.cost != null ? priceForMargin(r.cost, t, assumptions) : null };
    });
    const costed = list.filter(x => x.e && x.simE);
    const nowAvg = avg(costed.map(x => x.e!), e => e.contributionAUD);
    const simAvg = avg(costed.map(x => x.simE!), e => e.contributionAUD);
    return {
      list, target: t,
      nowMargin: blended(costed.map(x => ({ retail: x.retail!, e: x.e! }))),
      simMargin: blended(costed.map(x => ({ retail: x.price!, e: x.simE! }))),
      nowAvg, simAvg,
      // Sales needed to earn today's profit at the tried prices, as a % change in volume.
      volume: nowAvg != null && simAvg != null && simAvg > 0 ? (nowAvg / simAvg - 1) * 100 : null,
      below: costed.filter(x => x.simE!.grossMarginPct < t).length,
      losing: costed.filter(x => x.simE!.contributionAUD < 0).length,
    };
  }, [rows, discount, change, scope, target, overrides, assumptions]);

  const topPromo = running.reduce<Promotion | null>((a, p) => (!a || p.pct > a.pct ? p : a), null);
  const changed = num(discount) !== 0 || num(change) !== 0 || scope !== 'all' || Object.keys(overrides).length > 0;
  function reset() { setDiscount('0'); setChange('0'); setScope('all'); setOverrides({}); }

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

  const productCell = (p: Product) => (
    <td className="clickable" style={{ cursor: 'pointer' }} onClick={() => nav(`/products/${encodeURIComponent(p.id)}`)}>
      {p.name}{p.width ? `, ${p.width}` : ''}<div style={{ color: 'var(--muted)', fontSize: 12 }}>{collectionLabel(primaryCollection(p, collections))} · {statusOf(p)}</div>
    </td>
  );

  const head = (
    <div className="page-head">
      <h1>Margins</h1>
      <span className="spacer" />
      <div className="segmented" role="tablist" aria-label="View">
        <button role="tab" aria-selected={mode === 'today'} className={mode === 'today' ? 'on' : ''} onClick={() => setMode('today')}>Today</button>
        <button role="tab" aria-selected={mode === 'simulate'} className={mode === 'simulate' ? 'on' : ''} onClick={() => setMode('simulate')}>Price simulator</button>
      </div>
    </div>
  );

  if (mode === 'simulate') return (
    <>
      {head}
      <div className="card">
        <div className="card__head">
          <div><h2>Try a price</h2><div className="card__sub">See what a sale or a price change does to margin and profit before you run it. Nothing here changes real prices or promotions.</div></div>
          <span className="spacer" />
          {changed && <button className="btn" onClick={reset}><RotateCcw size={15} /> Reset</button>}
        </div>
        <div className="sim-controls">
          <label className="field">Discount
            <div className="sim-input"><input className="input" type="number" min="0" max="90" step="1" value={discount} onChange={e => setDiscount(e.target.value)} aria-label="Discount percent" /><span>% off</span></div>
          </label>
          <div className="field">Quick picks
            <div className="segmented sim-presets">
              {[0, 10, 20, 30, 40, 50].map(n => <button key={n} className={num(discount) === n ? 'on' : ''} onClick={() => setDiscount(String(n))}>{n ? `${n}%` : 'None'}</button>)}
              {topPromo && ![0, 10, 20, 30, 40, 50].includes(topPromo.pct) && <button className={num(discount) === topPromo.pct ? 'on' : ''} onClick={() => setDiscount(String(topPromo.pct))}>{topPromo.pct}%</button>}
            </div>
          </div>
          <label className="field">Change prices by
            <div className="sim-input"><input className="input" type="number" min="-90" step="1" value={change} onChange={e => setChange(e.target.value)} aria-label="Price change percent" /><span>% before the discount</span></div>
          </label>
          <label className="field">Apply to
            <select className="select" value={scope} onChange={e => setScope(e.target.value)}>
              <option value="all">Every piece</option>
              {collections.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">Target margin
            <div className="sim-input"><input className="input" type="number" min="0" max="95" step="1" value={target} onChange={e => setTarget(e.target.value)} aria-label="Target gross margin percent" /><span>%</span></div>
          </label>
        </div>
        {topPromo && <div className="card__sub" style={{ marginTop: 12 }}>{topPromo.name} is running now at {topPromo.pct}% off. Pick {topPromo.pct}% to see its effect.</div>}
      </div>

      <div className="grid-4">
        <StatCard label="Blended gross margin" value={pct(sim.simMargin)} foot={sim.nowMargin != null && sim.simMargin != null ? <>Full price {pct(sim.nowMargin)} · {pp(sim.simMargin - sim.nowMargin)}</> : null} />
        <StatCard label="Avg profit / sale" value={aud(sim.simAvg, 2)} foot={sim.nowAvg != null ? <>Full price {aud(sim.nowAvg, 2)}, after fees and packaging</> : null} />
        <StatCard label="Sales to earn the same" value={sim.volume == null ? (sim.simAvg != null && sim.simAvg <= 0 ? 'Loses money' : '–') : Math.abs(sim.volume) < 0.05 ? 'Same' : `${sim.volume > 0 ? '+' : '−'}${Math.abs(sim.volume).toFixed(0)}%`}
          foot={sim.volume != null && sim.volume > 0.05 ? <>more sales to make today’s profit</> : sim.volume != null && sim.volume < -0.05 ? <>fewer sales would make today’s profit</> : <>Versus full price</>} />
        <StatCard label={`Below ${sim.target}% margin`} value={String(sim.below)} foot={sim.losing ? <span style={{ color: 'var(--bad)' }}>{sim.losing} would lose money per sale</span> : <>of {sim.list.filter(x => x.simE).length} costed pieces</>} />
      </div>

      <div className="card">
        <div className="card__head">
          <div><h2>Piece by piece</h2><div className="card__sub">Type a price in “Try at” to test one piece on its own. Prices round to the whole dollar like the store.</div></div>
          <span className="spacer" />
          <label className="check"><input type="checkbox" checked={allSizes} onChange={e => setAllSizes(e.target.checked)} /> Every size</label>
          <label className="check"><input type="checkbox" checked={liveOnly} onChange={e => setLiveOnly(e.target.checked)} /> Live only</label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>Product</th><th>Size</th><th className="num">Factory cost</th><th className="num">Full price</th>
              <th className="num">Try at</th><th className="num">Margin now</th><th className="num">Margin at try</th>
              <th className="num">Profit / sale</th><th className="num">Price for {sim.target}%</th>
            </tr></thead>
            <tbody className={loading ? undefined : 'fade-in'}>
              {sim.list.map(({ p, key, size, retail, cost, e, simE, price, hit, forTarget }) => (
                <tr key={key} className={hit || overrides[key] ? undefined : 'row-muted'}>
                  {productCell(p)}
                  <td>{size}</td>
                  <td className="num">{aud(cost)}</td>
                  <td className="num">{aud(retail)}</td>
                  <td className="num">
                    <input key={`${key}-${overrides[key] ?? 'auto'}`} className="cell-input" type="number" min="1" step="1"
                      defaultValue={overrides[key] ?? ''} placeholder={price != null ? String(price) : ''}
                      aria-label={`Try a price for ${p.name} ${size}`}
                      onBlur={ev => {
                        const v = ev.target.value.trim();
                        setOverrides(o => { const n = { ...o }; if (v === '' || !(Number(v) > 0)) delete n[key]; else n[key] = Number(v); return n; });
                      }}
                      onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }} />
                  </td>
                  <td className="num">{e ? pct(e.grossMarginPct) : '–'}</td>
                  <td className="num">{simE ? <><span className={`chip ${chip(simE.grossMarginPct, sim.target)}`}>{pct(simE.grossMarginPct)}</span>{e && Math.abs(simE.grossMarginPct - e.grossMarginPct) >= 0.05 && <div className="delta">{pp(simE.grossMarginPct - e.grossMarginPct)}</div>}</> : '–'}</td>
                  <td className="num" style={simE && simE.contributionAUD < 0 ? { color: 'var(--bad)' } : undefined}>{aud(simE?.contributionAUD, 2)}</td>
                  <td className="num">{forTarget != null ? <button className="link-btn" title="Try this price" onClick={() => setOverrides(o => ({ ...o, [key]: forTarget }))}>{aud(forTarget)}</button> : '–'}</td>
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

  return (
    <>
      {head}
      {running.length > 0 && (
        <div className="notice notice--warn">
          {running.map(p => `${p.name} (${p.pct}% off)`).join(', ')} {running.length > 1 ? 'are' : 'is'} running. Margins below show what each piece makes at its sale price, next to full price.
        </div>
      )}
      <div className="grid-4">
        {running.length > 0
          ? <StatCard label="Blended margin on sale" value={pct(blended(payE))} foot={<>Full price {pct(blended(nowE))} · {onSale.length} of {priced.length} pieces on sale</>} />
          : <StatCard label="Blended gross margin" value={pct(blended(nowE))} foot={<>One of each costed piece</>} />}
        <StatCard label="Avg contribution / sale" value={aud(avg(payE.map(x => x.e), e => e.contributionAUD), 2)} foot={<>After fees ({(assumptions.paymentFeePct * 100).toFixed(1)}% + {aud(assumptions.paymentFeeFixedAUD, 2)}) and packaging</>} />
        <StatCard label="Lowest margin" value={lowest ? pct((lowest.saleE ?? lowest.e)!.grossMarginPct) : '–'} foot={lowest ? <b>{lowest.p.name}{lowest.saleE ? ' (on sale)' : ''}</b> : null} />
        <StatCard label="Margin on orders" value={pct(sold.margin)} foot={sold.orders ? <>{sold.orders} paid {sold.orders === 1 ? 'order' : 'orders'}, at prices paid{sold.off > 0 ? ` (${aud(sold.off)} in discounts)` : ''}{sold.partial ? ' · some pieces have no cost' : ''}</> : <>No paid orders yet</>} />
      </div>
      <div className="card">
        <div className="card__head">
          <div><h2>Per-product economics</h2><div className="card__sub">One row per product at its main size, or every size with “Every size”. Margins take GST off the retail price and add freight, as set in Settings. Edit a factory cost and margins update instantly. To test other prices, open the <button className="link-btn" onClick={() => setMode('simulate')}>price simulator</button>.</div></div>
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
              <th>Product</th><th>Quoted size</th><th className="num">Retail</th>
              {running.length > 0 && <th className="num">Sale price</th>}
              <th className="num">Factory cost</th>
              <th className="num">Gross profit</th><th className="num">Gross margin</th><th className="num">Contribution</th>
              <th className="num">Break-even ROAS</th><th className="num">Max ad / sale</th>
            </tr></thead>
            <tbody className={loading ? undefined : 'fade-in'}>
              {rows.map(({ p, c, e: full, saleE, sale, promo, key, size, retail, cost, estimated, usd, sizeKey }) => {
                const e = saleE ?? full;
                return (
                  <tr key={key}>
                    {productCell(p)}
                    <td>{size}</td>
                    <td className="num">{sale != null ? <s className="muted">{aud(retail)}</s> : aud(retail)}</td>
                    {running.length > 0 && <td className="num">{sale != null ? <>{aud(sale)}<div style={{ fontSize: 11, color: 'var(--muted)' }}>{promo!.pct}% · {promo!.name}</div></> : <span className="muted">–</span>}</td>}
                    <td className="num">
                      <input key={`${key}-${cost}`} className="cell-input" type="number" min="0" step="1" defaultValue={cost ?? ''}
                        aria-label={`Factory cost for ${p.name} ${size}`}
                        onBlur={ev => { if (ev.target.value !== String(cost ?? '')) saveCost(p.id, p.name, c?.representativeSize, ev.target.value, sizeKey); }}
                        onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }} />
                      {(estimated || usd != null) && <div style={{ fontSize: 11, color: estimated ? 'var(--warn)' : 'var(--muted)' }}>{usd != null ? `US$${usd}` : ''}{estimated ? `${usd != null ? ' · ' : ''}estimate` : ''}</div>}
                    </td>
                    <td className="num">{aud(e?.grossProfitAUD)}</td>
                    <td className="num">{e ? <><span className={`chip ${chip(e.grossMarginPct)}`}>{pct(e.grossMarginPct)}</span>{saleE && full && <div className="delta">Full price {pct(full.grossMarginPct)}</div>}</> : '–'}</td>
                    <td className="num">{aud(e?.contributionAUD, 2)}</td>
                    <td className="num">{e?.breakEvenRoas ? e.breakEvenRoas.toFixed(2) + '×' : '–'}</td>
                    <td className="num">{aud(e?.maxAdPerSaleAUD, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && <SkeletonRows rows={8} cols={6} />}
        </div>
        {sold.orders > 0 && <div className="card__sub" style={{ marginTop: 12 }}>Each order’s own margin, after its promotion and promo code, is on the order page. <Link to="/orders">See orders</Link></div>}
      </div>
      {toast.node}
    </>
  );
}
