import { useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileUp, Play, RotateCcw, Wand2 } from 'lucide-react';
import { adminApi } from '../lib/api';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';
import { aud } from '../lib/format';

/**
 * TEMPORARY: the one-off catalogue migration (server/migrate-variants.js).
 * Merges same-name products into one product with widths, turns listed sets
 * into real sets, and imports the cost sheet. Preview first; nothing changes
 * until Apply, and an applied run can be undone. Remove this page once it's run.
 */
interface Sheet { source?: string; settings?: { usdPerAud?: number; freightUSD?: number; gstPct?: number }; rows: Record<string, unknown>[] }
interface Report {
  groups: { id: string; name: string; isNew: boolean; skipped: boolean; from: { id: string; width: string | null; status: string }[]; widths: { width: string; status: string; sizes: number }[] }[];
  sets: { id: string; name: string; action: string; status?: string }[];
  costs: { matched: number; products: string[]; unmatched: { row: string; why: string }[]; priceChanges: { product: string; size: string; from: number; to: number }[]; newSizes: { product: string; size: string; priceAUD: number; status: string }[] };
  pieces: { serial: string; from: string; to: string; size: string }[];
  reviews: number;
  notes: string[];
}
interface Preview { fingerprint: string; writes: number; report: Report }
interface Run { id: string; status: string; by: string; createdAt?: string; writes: number; summary?: { merged: string[]; sets: string[]; costs: number; priceChanges: number; newSizes: number; pieces: number } }

export default function Migration() {
  const toast = useToast();
  const confirm = useConfirm();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [applyPrices, setApplyPrices] = useState(true);
  const [addSizes, setAddSizes] = useState(false);
  const [skip, setSkip] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const body = () => ({ sheet, applyPrices, addSizes, skip });
  const loadRuns = () => adminApi<{ runs: Run[] }>('/migrations').then(r => setRuns(r.runs)).catch(e => setError(e.message));
  useEffect(() => { loadRuns(); }, []);
  // Any change to the options means the preview no longer matches.
  useEffect(() => { setPreview(null); }, [sheet, applyPrices, addSizes, skip]);

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as Sheet;
      if (!Array.isArray(data.rows)) throw new Error('This file has no rows.');
      setSheet(data); setError('');
    } catch (err) { setError(`That file couldn’t be read: ${(err as Error).message}`); }
  }

  async function run(kind: 'preview' | 'apply') {
    setBusy(kind); setError('');
    try {
      if (kind === 'preview') setPreview(await adminApi<Preview>('/migrations/variants/preview', body()));
      else {
        if (!preview) return;
        if (!(await confirm({ title: 'Apply the migration?', tone: 'danger', word: 'MIGRATE', confirmLabel: 'Apply',
          body: `This makes ${preview.writes} changes to the live catalogue, exactly as previewed. A copy of everything it changes is kept, so it can be undone from this page.` }))) return;
        const r = await adminApi<{ runId: string; writes: number }>('/migrations/variants/apply', { ...body(), fingerprint: preview.fingerprint });
        toast.show(`Done: ${r.writes} changes made`);
        setPreview(null);
        loadRuns();
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  async function undo(r: Run) {
    if (!(await confirm({ title: 'Undo this migration?', tone: 'danger', word: 'UNDO', confirmLabel: 'Undo',
      body: 'Every document it changed goes back to how it was before it ran. Edits made since then to those products, costs or pieces are lost.' }))) return;
    setBusy('undo'); setError('');
    try { const out = await adminApi<{ restored: number }>(`/migrations/${encodeURIComponent(r.id)}/undo`, {}); toast.show(`Undone: ${out.restored} documents restored`); loadRuns(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  const rep = preview?.report;
  const toggleSkip = (id: string) => setSkip(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  return (
    <>
      <div className="page-head"><h1>Catalogue migration</h1><span className="chip chip--warn">Temporary</span></div>
      <p className="card__sub" style={{ marginTop: -8 }}>
        Merges products that are the same piece in different widths into one product with a width and length grid, turns sets that list their pieces into real sets, and imports the cost sheet.
        Preview changes nothing. Old product pages, past orders and saved bags keep working.
      </p>
      {error && <div className="notice notice--error">{error}</div>}

      <div className="grid-2">
        <div className="card">
          <div className="card__head"><div><h2>1. Cost sheet</h2><div className="card__sub">The costs file from the project thread (axia-costs.json, made from your spreadsheet).</div></div></div>
          <label className="btn" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}><FileUp size={16} /> {sheet ? 'Choose another file' : 'Choose file'}
            <input type="file" accept=".json,application/json" hidden onChange={pickFile} />
          </label>
          {sheet ? (
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>Rows</dt><dd>{sheet.rows.length}</dd>
              {sheet.settings?.usdPerAud != null && <><dt>US$ per A$1</dt><dd>{sheet.settings.usdPerAud}</dd></>}
              {sheet.settings?.freightUSD != null && <><dt>Freight per piece</dt><dd>US${sheet.settings.freightUSD}</dd></>}
              {sheet.settings?.gstPct != null && <><dt>GST</dt><dd>{Math.round(sheet.settings.gstPct * 100)}%</dd></>}
            </dl>
          ) : <p className="card__sub">Optional: without it, only the merge and the sets run.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <label className="check"><input type="checkbox" checked={applyPrices} disabled={!sheet} onChange={e => setApplyPrices(e.target.checked)} />
              <span>Change retail prices to the sheet’s<br /><small className="muted">Untick to import only the costs and keep today’s prices.</small></span></label>
            <label className="check"><input type="checkbox" checked={addSizes} disabled={!sheet} onChange={e => setAddSizes(e.target.checked)} />
              <span>Also add sizes the sheet has and the site doesn’t sell<br /><small className="muted">New widths start as Coming soon. New lengths in a live width go on sale.</small></span></label>
          </div>
        </div>

        <div className="card">
          <div className="card__head"><div><h2>2. Preview, then apply</h2><div className="card__sub">Apply only makes the changes shown in the preview, and stops if anything changed since.</div></div></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => run('preview')} disabled={!!busy}><Wand2 size={16} /> {busy === 'preview' ? 'Working…' : 'Preview'}</button>
            <button className="btn btn--primary" onClick={() => run('apply')} disabled={!preview || !preview.writes || !!busy}><Play size={16} /> {busy === 'apply' ? 'Applying…' : preview ? `Apply ${preview.writes} changes` : 'Apply'}</button>
          </div>
          {runs.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="card__sub" style={{ marginBottom: 8 }}>Runs</div>
              <ul className="mig-list">
                {runs.map(r => (
                  <li key={r.id}>
                    <b>{r.createdAt ? new Date(r.createdAt).toLocaleString('en-AU') : r.id}</b> <span className={`chip ${r.status === 'applied' ? 'chip--good' : 'chip--muted'}`}>{r.status}</span>
                    <br /><small>{r.writes} changes by {r.by}{r.summary ? `: ${r.summary.merged.length} merged, ${r.summary.sets.length} sets, ${r.summary.costs} costs, ${r.summary.priceChanges} prices, ${r.summary.newSizes} new sizes, ${r.summary.pieces} pieces` : ''}</small>
                    {r.status === 'applied' && <div><button className="btn btn--sm btn--danger" style={{ marginTop: 6 }} onClick={() => undo(r)} disabled={!!busy}><RotateCcw size={14} /> Undo</button></div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {rep && (
        <>
          <div className="card">
            <div className="card__head"><div><h2>Products merged</h2><div className="card__sub">Untick one to leave it as it is.</div></div></div>
            {!rep.groups.length && <p className="card__sub">Nothing to merge.</p>}
            <ul className="mig-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
              {rep.groups.map(g => (
                <li key={g.id}>
                  <label className="check"><input type="checkbox" checked={!skip.includes(g.id)} onChange={() => toggleSkip(g.id)} />
                    <span><b>{g.name}</b> → <span className="mono">{g.id}</span>{g.isNew ? ' (new)' : ''}<br />
                      <small>From {g.from.map(f => `${f.id} (${f.width || 'no width'}, ${f.status})`).join(', ')}</small>
                      {!g.skipped && <span className="mig-widths">{g.widths.map(w => <span key={w.width} className={`chip ${w.status === 'Live' ? 'chip--good' : 'chip--warn'} chip--plain`}>{w.width} · {w.sizes} sizes{w.status === 'Live' ? '' : ' · Coming soon'}</span>)}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {rep.notes.map(n => <p key={n} className="card__sub">{n}</p>)}
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card__head"><h2>Sets</h2></div>
              <ul className="mig-list">{rep.sets.map(s => <li key={s.id}><Link to={`/products/${encodeURIComponent(s.id)}`}>{s.name}</Link>{s.status ? <small> · {s.status}</small> : null}<br /><small>{s.action}</small></li>)}</ul>
            </div>
            <div className="card">
              <div className="card__head"><h2>Moved with their product</h2></div>
              <dl className="kv">
                <dt>Registry pieces</dt><dd>{rep.pieces.length}</dd>
                <dt>Review videos</dt><dd>{rep.reviews}</dd>
                <dt>Past orders</dt><dd style={{ fontWeight: 400 }}>Unchanged (old ids link to the merged product)</dd>
              </dl>
              {rep.pieces.length > 0 && <ul className="mig-list" style={{ marginTop: 10 }}>{rep.pieces.slice(0, 30).map(p => <li key={p.serial}><span className="mono">{p.serial}</span> <small>{p.from} → {p.to}, {p.size}</small></li>)}</ul>}
            </div>
          </div>

          {sheet && (
            <div className="card">
              <div className="card__head"><div><h2>Costs</h2><div className="card__sub">{rep.costs.matched} sizes costed across {rep.costs.products.length} products.</div></div></div>
              {rep.costs.priceChanges.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table className="table"><thead><tr><th>Price change</th><th>Size</th><th className="num">Now</th><th className="num">New</th></tr></thead>
                    <tbody>{rep.costs.priceChanges.map((c, i) => <tr key={i}><td>{c.product}</td><td>{c.size}</td><td className="num">{aud(c.from)}</td><td className="num">{aud(c.to)}</td></tr>)}</tbody></table>
                </div>
              )}
              {rep.costs.newSizes.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table className="table"><thead><tr><th>New size</th><th>Size</th><th className="num">Price</th><th>Status</th></tr></thead>
                    <tbody>{rep.costs.newSizes.map((c, i) => <tr key={i}><td>{c.product}</td><td>{c.size}</td><td className="num">{aud(c.priceAUD)}</td><td>{c.status}</td></tr>)}</tbody></table>
                </div>
              )}
              {rep.costs.unmatched.length > 0 && (
                <>
                  <div className="card__sub" style={{ marginBottom: 6 }}>Not imported ({rep.costs.unmatched.length})</div>
                  <ul className="mig-list">{rep.costs.unmatched.map((u, i) => <li key={i}>{u.row} <small>· {u.why}</small></li>)}</ul>
                </>
              )}
            </div>
          )}
        </>
      )}
      {toast.node}
    </>
  );
}
