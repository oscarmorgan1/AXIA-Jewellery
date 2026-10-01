import { Plus, Trash2 } from 'lucide-react';
import type { Variant } from '../types';

/** Editable size/length → price rows. */
export default function VariantsTable({ variants, onChange }: { variants: Variant[]; onChange: (v: Variant[]) => void }) {
  const set = (i: number, patch: Partial<Variant>) => onChange(variants.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  return (
    <table className="table variants-table">
      <thead><tr><th>Length / size</th><th>Price (A$)</th><th /></tr></thead>
      <tbody>
        {variants.map((v, i) => (
          <tr key={i}>
            <td><input className="input" value={v.length ?? ''} placeholder='one size, or e.g. 20"' aria-label="Length"
              onChange={e => set(i, { length: e.target.value.trim() === '' ? null : e.target.value })} /></td>
            <td><input className="input" type="number" min="0" step="1" value={Number.isFinite(v.priceAUD) ? v.priceAUD : ''} aria-label="Price"
              onChange={e => set(i, { priceAUD: e.target.value === '' ? NaN : Number(e.target.value) })} /></td>
            <td style={{ width: 44 }}><button type="button" className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Remove size"
              onClick={() => onChange(variants.filter((_, k) => k !== i))}><Trash2 size={15} /></button></td>
          </tr>
        ))}
        <tr><td colSpan={3}>
          <button type="button" className="btn btn--sm" onClick={() => onChange([...variants, { length: '', priceAUD: variants.at(-1)?.priceAUD ?? 0 }])}>
            <Plus size={14} /> Add size
          </button>
        </td></tr>
      </tbody>
    </table>
  );
}
