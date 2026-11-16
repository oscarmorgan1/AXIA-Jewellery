import { Plus, Trash2 } from 'lucide-react';
import type { CostAssumptions, Variant, VariantCost } from '../types';
import { economics } from '../lib/economics';
import { costKey, normSize, sizeLabel } from '../lib/variants';
import { pct } from '../lib/format';

interface CostProps {
  /** The width these sizes belong to (null for a one-width product). */
  width: string | null;
  costs: Record<string, VariantCost>;
  onCost: (key: string, value: VariantCost | null) => void;
  assumptions: CostAssumptions;
  stock?: Map<string, number>;
  making?: Map<string, number>;
}

const marginChip = (m: number) => (m >= 50 ? 'chip--good' : m >= 40 ? 'chip--warn' : 'chip--bad');

/** Editable size/length → price rows, with each size's private cost, margin and stock when given. */
export default function VariantsTable({ variants, onChange, cost }: { variants: Variant[]; onChange: (v: Variant[]) => void; cost?: CostProps }) {
  const set = (i: number, patch: Partial<Variant>) => onChange(variants.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  return (
    <div className="table-wrap">
      <table className="table variants-table">
        <thead><tr>
          <th>Length / size</th><th>Price (A$)</th>
          {cost && <><th title="Private: factory cost of this size">Cost (A$)</th><th>Margin</th><th title="From the piece registry: received and on no order">In stock</th></>}
          <th />
        </tr></thead>
        <tbody>
          {variants.map((v, i) => {
            const key = cost ? costKey(cost.width, v.length) : '';
            const c = cost?.costs[key];
            const e = cost && c?.factoryCostAUD != null && v.priceAUD > 0 ? economics(v.priceAUD, c.factoryCostAUD, cost.assumptions) : null;
            const size = normSize(sizeLabel(cost?.width, v.length));
            const inStock = cost?.stock?.get(size) || 0;
            const making = cost?.making?.get(size) || 0;
            return (
              <tr key={i}>
                <td><input className="input" value={v.length ?? ''} placeholder='one size, or e.g. 20"' aria-label="Length"
                  onChange={e => set(i, { length: e.target.value.trim() === '' ? null : e.target.value })} /></td>
                <td><input className="input" type="number" min="0" step="1" value={Number.isFinite(v.priceAUD) ? v.priceAUD : ''} aria-label="Price"
                  onChange={e => set(i, { priceAUD: e.target.value === '' ? NaN : Number(e.target.value) })} /></td>
                {cost && <>
                  <td>
                    <input className="input" type="number" min="0" step="0.01" aria-label={`Cost of ${size || 'this size'}`}
                      value={c?.factoryCostAUD ?? ''} placeholder="–"
                      onChange={e => cost.onCost(key, e.target.value === '' ? (c ? { ...c, factoryCostAUD: null } : null) : { ...(c || {}), factoryCostAUD: Number(e.target.value) })} />
                    {(c?.estimated || c?.factoryCostUSD != null) && (
                      <div className="variants-table__note">{c.factoryCostUSD != null ? `US$${c.factoryCostUSD}` : ''}{c.estimated ? `${c.factoryCostUSD != null ? ' · ' : ''}estimate` : ''}</div>
                    )}
                  </td>
                  <td>{e ? <span className={`chip ${marginChip(e.grossMarginPct)}`} title={`Gross profit A$${e.grossProfitAUD.toFixed(0)}`}>{pct(e.grossMarginPct)}</span> : <span className="muted">–</span>}</td>
                  <td>{inStock || making ? <span title={making ? `${making} with the maker` : undefined}>{inStock}{making ? <small className="muted"> +{making}</small> : null}</span> : <span className="muted">0</span>}</td>
                </>}
                <td style={{ width: 44 }}><button type="button" className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Remove size"
                  onClick={() => onChange(variants.filter((_, k) => k !== i))}><Trash2 size={15} /></button></td>
              </tr>
            );
          })}
          <tr><td colSpan={cost ? 6 : 3}>
            <button type="button" className="btn btn--sm" onClick={() => onChange([...variants, { length: '', priceAUD: variants.at(-1)?.priceAUD ?? 0 }])}>
              <Plus size={14} /> Add size
            </button>
          </td></tr>
        </tbody>
      </table>
    </div>
  );
}
