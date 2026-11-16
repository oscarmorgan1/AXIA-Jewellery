import { Plus, Trash2 } from 'lucide-react';
import type { CostAssumptions, Product, ProductCost, SetConfig, SetComponent, SetPricing } from '../types';
import { costOf, hasWidths, setRange, widthsOf } from '../lib/variants';
import { economics } from '../lib/economics';
import { aud, pct } from '../lib/format';

/**
 * The pieces in a set and how it's priced. For each piece the admin either fixes
 * the width and length, or leaves them for the buyer to pick ("Buyer picks").
 */
export default function SetEditor({ value, onChange, products, costs, assumptions, selfId }: {
  value: SetConfig; onChange: (v: SetConfig) => void; products: Product[]; costs: Map<string, ProductCost>; assumptions: CostAssumptions; selfId: string;
}) {
  const product = (id: string) => products.find(p => p.id === id);
  const choices = products.filter(p => !p.archived && !p.set && p.id !== selfId && !p.titan);
  const setPart = (i: number, patch: Partial<SetComponent>) => onChange({ ...value, components: value.components.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const setPricing = (p: SetPricing) => onChange({ ...value, pricing: p });
  const range = setRange(value, product);
  const pickers = value.components.filter(c => !c.width && hasWidths(product(c.productId))).length;

  // Cost and margin, when every piece's size is fixed (otherwise it depends on what the buyer picks).
  const fixedSizes = value.components.map(c => {
    const p = product(c.productId);
    if (!p) return null;
    const many = hasWidths(p);
    const w = many ? c.width : p.width || null;
    const lens = widthsOf(p).find(x => !many || x.width === w)?.variants || [];
    const l = c.length || (lens.length === 1 ? lens[0].length : null);
    if ((many && !w) || (!l && lens.length > 1)) return null;
    const v = lens.find(x => x.length === l) || lens[0];
    const cost = costOf(costs.get(p.id), w, l);
    return { price: v?.priceAUD || 0, cost: cost?.factoryCostAUD ?? null };
  });
  const allFixed = value.components.length > 0 && fixedSizes.every(Boolean);
  const totalCost = allFixed && fixedSizes.every(f => f!.cost != null) ? fixedSizes.reduce((a, f) => a + (f!.cost || 0), 0) : null;
  const e = allFixed && range && totalCost != null ? economics(range.from, totalCost, assumptions) : null;
  const parts = allFixed ? fixedSizes.reduce((a, f) => a + (f!.price || 0), 0) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="set-parts">
        {value.components.map((c, i) => {
          const p = product(c.productId);
          const many = hasWidths(p);
          const ws = widthsOf(p);
          const lens = [...new Set((many && c.width ? ws.filter(w => w.width === c.width) : ws).flatMap(w => (w.variants || []).map(v => v.length)).filter(Boolean))] as string[];
          return (
            <div className="set-part" key={i}>
              <label className="field">Piece {i + 1}
                <select className="select" value={c.productId} onChange={e => setPart(i, { productId: e.target.value, width: null, length: null })}>
                  <option value="">Pick a product</option>
                  {choices.map(x => <option key={x.id} value={x.id}>{x.name}{x.width ? `, ${x.width}` : ''}{x.hidden ? ' (Coming soon)' : ''}</option>)}
                </select>
              </label>
              <label className="field">Width
                <select className="select" value={c.width ?? ''} disabled={!many} onChange={e => setPart(i, { width: e.target.value || null, length: null })}>
                  {many ? <option value="">Buyer picks</option> : <option value="">{p?.width || 'One width'}</option>}
                  {many && ws.map(w => <option key={w.width} value={w.width}>{w.width}{w.hidden ? ' (Coming soon)' : ''}</option>)}
                </select>
              </label>
              <label className="field">Length
                <select className="select" value={c.length ?? ''} disabled={!lens.length || !!p?.singlePrice} onChange={e => setPart(i, { length: e.target.value || null })}>
                  {lens.length && !p?.singlePrice ? <option value="">Buyer picks</option> : <option value="">One size</option>}
                  {!p?.singlePrice && lens.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <button type="button" className="icon-btn" aria-label={`Remove piece ${i + 1}`} onClick={() => onChange({ ...value, components: value.components.filter((_, k) => k !== i) })}><Trash2 size={15} /></button>
              {p && <div className="set-part__sub">{p.hidden ? 'Coming soon on its own, sold here as part of the set. ' : ''}{(!c.width && many) || (!c.length && lens.length > 1 && !p.singlePrice) ? 'The buyer chooses on the product page.' : 'Always this size.'}</div>}
            </div>
          );
        })}
        <button type="button" className="btn btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ ...value, components: [...value.components, { productId: '', width: null, length: null }] })}><Plus size={14} /> Add a piece</button>
      </div>

      {pickers > 1 && (
        <label className="check"><input type="checkbox" checked={!!value.sharedWidth} onChange={e => onChange({ ...value, sharedWidth: e.target.checked })} />
          <span>One width for the whole set<br /><small className="muted">The buyer picks the width once, and every piece is made in it.</small></span>
        </label>
      )}

      <div className="field">Set price
        <div className="status-pick">
          <label className={`status-opt${value.pricing.mode === 'fixed' ? ' on' : ''}`}>
            <input type="radio" name="set-pricing" checked={value.pricing.mode === 'fixed'} onChange={() => setPricing({ mode: 'fixed', priceAUD: range?.from || 0 })} />
            <span><b>Fixed price</b><small>One price, whatever sizes are picked. Best when every size is fixed.</small></span>
          </label>
          <label className={`status-opt${value.pricing.mode === 'discount' ? ' on' : ''}`}>
            <input type="radio" name="set-pricing" checked={value.pricing.mode === 'discount'} onChange={() => setPricing({ mode: 'discount', amountAUD: 50 })} />
            <span><b>Pieces less an amount</b><small>The pieces’ own prices for the sizes picked, less A$ off.</small></span>
          </label>
          <label className={`status-opt${value.pricing.mode === 'percent' ? ' on' : ''}`}>
            <input type="radio" name="set-pricing" checked={value.pricing.mode === 'percent'} onChange={() => setPricing({ mode: 'percent', pct: 10 })} />
            <span><b>Pieces less a percentage</b><small>The pieces’ own prices for the sizes picked, less % off.</small></span>
          </label>
        </div>
      </div>
      <div className="form-grid">
        {value.pricing.mode === 'fixed' && <label className="field">Price (A$)<input className="input" type="number" min="0" step="1" value={value.pricing.priceAUD || ''} onChange={e => setPricing({ mode: 'fixed', priceAUD: Number(e.target.value) || 0 })} /></label>}
        {value.pricing.mode === 'discount' && <label className="field">A$ off<input className="input" type="number" min="0" step="1" value={value.pricing.amountAUD || ''} onChange={e => setPricing({ mode: 'discount', amountAUD: Number(e.target.value) || 0 })} /></label>}
        {value.pricing.mode === 'percent' && <label className="field">% off<input className="input" type="number" min="0" max="90" step="1" value={value.pricing.pct || ''} onChange={e => setPricing({ mode: 'percent', pct: Number(e.target.value) || 0 })} /></label>}
      </div>

      <dl className="kv">
        <dt>Buyers pay</dt><dd>{range ? (range.from === range.to ? aud(range.from) : `${aud(range.from)} to ${aud(range.to)}`) : 'Pick the pieces'}</dd>
        {parts != null && <><dt>Pieces bought on their own</dt><dd>{aud(parts)}</dd></>}
        {e ? <><dt>Set cost (factory)</dt><dd>{aud(totalCost, 2)}</dd><dt>Gross margin</dt><dd>{pct(e.grossMarginPct)}</dd></>
          : <><dt>Gross margin</dt><dd className="muted" style={{ fontWeight: 400 }}>{allFixed ? 'Add the pieces’ costs' : 'Depends on the sizes picked'}</dd></>}
      </dl>
      <p className="card__sub" style={{ margin: 0 }}>Returning one piece of a set refunds the set price less the full price of the piece kept.</p>
    </div>
  );
}
