import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Eye, EyeOff, FolderPlus, Search, Trash2 } from 'lucide-react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, siteUrl } from '../firebase';
import { useCollections, useProducts } from '../lib/data';
import { firstImage, slugify, statusOf } from '../lib/catalogue';
import Drawer from '../components/Drawer';
import ImageList from '../components/ImageList';
import { useToast } from '../components/Toast';
import type { Collection, Product } from '../types';

type Draft = Collection & { members: Set<string>; isNew: boolean };

export default function Collections() {
  const { data: collections, loading } = useCollections();
  const { data: products } = useProducts();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const membersOf = (slug: string) => new Set(products.filter(p => (p.coll || []).includes(slug)).map(p => p.id));

  const open = (c?: Collection) => {
    setError(null); setQ('');
    setDraft(c
      ? { ...c, members: membersOf(c.slug), isNew: false }
      : { slug: '', name: '', tab: '', intro: '', showInShop: false, sort: Math.max(0, ...collections.map(x => x.sort ?? 0)) + 10, members: new Set(), isNew: true });
  };

  // deep link from search: /collections?edit=slug
  useEffect(() => {
    const slug = params.get('edit');
    const c = slug && collections.find(x => x.slug === slug);
    if (c && products.length) { open(c); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, collections, products.length]);

  const close = () => setDraft(null);
  const slug = draft ? (draft.isNew ? slugify(draft.slug || draft.name) : draft.slug) : '';

  async function save() {
    if (!draft) return;
    setError(null);
    if (!draft.name.trim()) return setError('Give the collection a name.');
    if (!slug) return setError('The name needs letters or numbers.');
    if (draft.isNew && collections.some(c => c.slug === slug)) return setError(`There’s already a collection called “${slug}”.`);
    setSaving(true);
    try {
      const b = writeBatch(db);
      b.set(doc(db, 'collections', slug), {
        slug, name: draft.name.trim(), tab: (draft.tab || '').trim(), intro: (draft.intro || '').trim(), image: draft.image || '',
        showInShop: !!draft.showInShop, sort: draft.sort ?? 0, updatedAt: serverTimestamp(),
      });
      let changed = 0;
      products.forEach(p => {
        const has = (p.coll || []).includes(slug), want = draft.members.has(p.id);
        if (has === want) return;
        changed++;
        b.update(doc(db, 'products', p.id), {
          coll: want ? [...(p.coll || []), slug] : (p.coll || []).filter(x => x !== slug), updatedAt: serverTimestamp(),
        });
      });
      await b.commit();
      toast.show(`${draft.name} saved${changed ? `, ${changed} product${changed === 1 ? '' : 's'} updated` : ''}`);
      close();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  async function remove() {
    if (!draft || draft.isNew) return;
    const n = draft.members.size;
    if (!confirm(`Delete “${draft.name}”? ${n ? `It will be removed from ${n} product${n === 1 ? '' : 's'}. ` : ''}The products themselves stay.`)) return;
    const b = writeBatch(db);
    b.delete(doc(db, 'collections', draft.slug));
    products.filter(p => (p.coll || []).includes(draft.slug)).forEach(p =>
      b.update(doc(db, 'products', p.id), { coll: (p.coll || []).filter(x => x !== draft.slug), updatedAt: serverTimestamp() }));
    try { await b.commit(); } catch (e) { return setError((e as Error).message); }
    toast.show(`${draft.name} deleted`);
    close();
  }

  async function move(i: number, d: number) {
    const a = collections[i], c = collections[i + d];
    if (!a || !c) return;
    const b = writeBatch(db);
    b.update(doc(db, 'collections', a.slug), { sort: c.sort ?? 0 });
    b.update(doc(db, 'collections', c.slug), { sort: a.sort ?? 0 });
    try { await b.commit(); } catch (e) { toast.show(`Couldn’t save: ${(e as Error).message}`); }
  }

  async function toggleShop(c: Collection) {
    const b = writeBatch(db);
    b.update(doc(db, 'collections', c.slug), { showInShop: !c.showInShop, updatedAt: serverTimestamp() });
    try { await b.commit(); } catch (e) { return toast.show(`Couldn’t save: ${(e as Error).message}`); }
    toast.show(`${c.name} ${c.showInShop ? 'hidden from' : 'added to'} the shop tabs`);
  }

  const cover = (c: Collection) => c.image || firstImage(products.find(p => (p.coll || []).includes(c.slug) && firstImage(p)) || ({} as Product));
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter(p => !p.archived && (!s || `${p.name} ${p.width || ''} ${p.id}`.toLowerCase().includes(s)));
  }, [products, q]);

  return (
    <>
      <div className="page-head">
        <div><h1>Collections</h1><p className="lede" style={{ margin: 0 }}>Group pieces once and reuse them. Collections marked “In shop” become tabs on Shop All, in this order.</p></div>
        <span className="spacer" />
        <button className="btn btn--primary" onClick={() => open()}><FolderPlus size={16} /> New collection</button>
      </div>

      <div className="grid-3">
        {loading && [0, 1, 2].map(i => <div key={i} className="card"><div className="skeleton" style={{ height: 150 }} /></div>)}
        {collections.map((c, i) => {
          const n = products.filter(p => (p.coll || []).includes(c.slug) && !p.archived).length;
          const live = products.filter(p => (p.coll || []).includes(c.slug) && statusOf(p) === 'Live').length;
          const img = cover(c);
          return (
            <div key={c.slug} className="card card--hover" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', animation: `rise .5s cubic-bezier(.2,.8,.2,1) ${i * 40}ms both` }} onClick={() => open(c)}>
              <div style={{ height: 150, background: 'var(--obsidian)', position: 'relative', overflow: 'hidden' }}>
                {img && <img src={siteUrl(img)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: .9 }} />}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 40%, rgba(17,19,21,.75))' }} />
                <div style={{ position: 'absolute', left: 18, bottom: 14, color: '#F4F1EA' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 12.5, opacity: .8 }}>{n} piece{n === 1 ? '' : 's'} · {live} live</div>
                </div>
                <span className="chip chip--onimg" style={{ position: 'absolute', top: 12, left: 12, opacity: c.showInShop ? 1 : .75 }}>{c.showInShop ? 'In shop' : 'Hidden'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                <span className="sub" style={{ margin: '0 0 0 6px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.intro || `/${c.slug}`}</span>
                <button className="btn btn--ghost btn--sm" title={c.showInShop ? 'Hide from shop tabs' : 'Show as a shop tab'} onClick={() => toggleShop(c)}>{c.showInShop ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                <button className="btn btn--ghost btn--sm" title="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                <button className="btn btn--ghost btn--sm" title="Move later" disabled={i === collections.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {!loading && !collections.length && <div className="card empty"><b>No collections yet</b>Create one to group pieces for the shop.</div>}

      {draft && (
        <Drawer title={draft.isNew ? 'New collection' : draft.name} onClose={close}
          footer={<>
            {!draft.isNew && <button className="btn btn--danger" onClick={remove}><Trash2 size={15} /> Delete</button>}
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn btn--primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save collection'}</button>
          </>}>
          {error && <div className="notice notice--error">{error}</div>}
          <label className="field">Name<input className="input" value={draft.name} autoFocus placeholder="e.g. Gifts under A$500" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
          <div className="form-grid">
            <label className="field">Link name<input className="input" value={slug} disabled={!draft.isNew} onChange={e => setDraft({ ...draft, slug: e.target.value })} /></label>
            <label className="field">Shop tab label<input className="input" value={draft.tab || ''} placeholder={draft.name.replace(/^The /, '') || 'Same as name'} onChange={e => setDraft({ ...draft, tab: e.target.value })} /></label>
          </div>
          <label className="field">Intro line<textarea className="textarea" style={{ minHeight: 70 }} value={draft.intro || ''} placeholder="Shown under the title when this tab is open" onChange={e => setDraft({ ...draft, intro: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={!!draft.showInShop} onChange={e => setDraft({ ...draft, showInShop: e.target.checked })} /> Show as a tab on Shop All</label>
          {slug && <div className="sub">Shop link: <a href={siteUrl(`collection.html?cat=${slug}`)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>collection.html?cat={slug}</a></div>}
          <div className="field">Cover photo (optional, defaults to the first piece)
            <ImageList productId={`collections/${slug || 'new'}`} images={draft.image ? [draft.image] : []} onError={setError}
              onChange={imgs => setDraft({ ...draft, image: imgs[imgs.length - 1] || '' })} />
          </div>

          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Pieces in this collection <span className="chip chip--ice chip--plain">{draft.members.size}</span></div>
            <div className="search"><Search size={15} /><input style={{ width: '100%' }} placeholder="Find a piece" value={q} onChange={e => setQ(e.target.value)} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 340, overflowY: 'auto', marginTop: 6 }}>
              {shown.map(p => {
                const on = draft.members.has(p.id); const img = firstImage(p);
                return (
                  <label key={p.id} className="feed__item check" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} onChange={() => {
                      const m = new Set(draft.members); if (on) m.delete(p.id); else m.add(p.id); setDraft({ ...draft, members: m });
                    }} />
                    {img ? <img className="thumb" style={{ width: 36, height: 36 }} src={siteUrl(img)} alt="" loading="lazy" /> : <span className="thumb" style={{ width: 36, height: 36 }} />}
                    <span style={{ flex: 1 }}>{p.name}{p.width ? `, ${p.width}` : ''}<small className="sub">{statusOf(p)}</small></span>
                  </label>
                );
              })}
            </div>
          </div>
        </Drawer>
      )}
      {toast.node}
    </>
  );
}
