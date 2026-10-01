import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { siteUrl } from '../firebase';
import { firstImage } from '../lib/catalogue';
import type { Collection, Product, Signup } from '../types';

interface Item { group: string; label: string; hint?: string; img?: string; to: string }

const PAGES: Item[] = [
  { group: 'Go to', label: 'Dashboard', to: '/' },
  { group: 'Go to', label: 'Products', to: '/products' },
  { group: 'Go to', label: 'Add a product', to: '/products/new' },
  { group: 'Go to', label: 'Collections', to: '/collections' },
  { group: 'Go to', label: 'Customers', to: '/customers' },
  { group: 'Go to', label: 'Inbox', to: '/inbox' },
  { group: 'Go to', label: 'Margins', to: '/margins' },
  { group: 'Go to', label: 'Orders', to: '/orders' },
  { group: 'Go to', label: 'Settings', to: '/settings' },
];

/** ⌘K / Ctrl+K quick finder for pages, products, collections and customers. */
export default function CommandPalette({ open, onClose, products, collections, signups }: {
  open: boolean; onClose: () => void; products: Product[]; collections: Collection[]; signups: Signup[];
}) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (t: string) => !s || t.toLowerCase().includes(s);
    const emails = new Map<string, Signup>();
    signups.forEach(x => { if (!emails.has(x.email)) emails.set(x.email, x); });
    return [
      ...PAGES.filter(p => match(p.label)),
      ...products.filter(p => match(`${p.name} ${p.width || ''} ${p.id}`)).slice(0, s ? 8 : 4)
        .map(p => ({ group: 'Products', label: p.name + (p.width ? `, ${p.width}` : ''), hint: p.archived ? 'Archived' : p.hidden ? 'Coming soon' : 'Live', img: firstImage(p), to: `/products/${encodeURIComponent(p.id)}` })),
      ...collections.filter(c => match(c.name + ' ' + c.slug)).slice(0, s ? 6 : 3)
        .map(c => ({ group: 'Collections', label: c.name, hint: c.showInShop ? 'In shop' : 'Hidden', to: `/collections?edit=${encodeURIComponent(c.slug)}` })),
      ...(s ? [...emails.values()].filter(x => match(`${x.firstName} ${x.email}`)).slice(0, 6)
        .map(x => ({ group: 'Customers', label: `${x.firstName} · ${x.email}`, to: `/customers?q=${encodeURIComponent(x.email)}` })) : []),
    ] as Item[];
  }, [q, products, collections, signups]);

  useEffect(() => { setSel(0); }, [q]);
  if (!open) return null;

  const go = (it?: Item) => { if (!it) return; onClose(); nav(it.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[sel]); }
    else if (e.key === 'Escape') onClose();
  };

  let last = '';
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="palette" role="dialog" aria-label="Search">
        <div className="palette__input"><Search size={18} />
          <input ref={input} autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search products, collections, customers, pages…" />
          <kbd style={{ fontSize: 11, color: 'var(--faint)' }}>esc</kbd>
        </div>
        <div className="palette__list">
          {!items.length && <div className="empty">Nothing matches “{q}”.</div>}
          {items.map((it, i) => {
            const head = it.group !== last ? <div className="palette__group">{it.group}</div> : null;
            last = it.group;
            return (
              <div key={it.group + it.to + i}>
                {head}
                <div className={`palette__item${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => go(it)}>
                  {it.img && <img src={siteUrl(it.img)} alt="" />}
                  <span>{it.label}</span>
                  <small>{i === sel ? <CornerDownLeft size={14} /> : it.hint}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
