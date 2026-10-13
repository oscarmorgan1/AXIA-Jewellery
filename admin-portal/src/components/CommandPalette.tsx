import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { siteUrl } from '../firebase';
import { firstImage } from '../lib/catalogue';
import { adminApi } from '../lib/api';
import { STATUS_LABEL, orderNo } from '../lib/orders';
import { aud } from '../lib/format';
import type { Collection, Message, Order, Product, PromoCode, Signup } from '../types';

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
  { group: 'Go to', label: 'Promo codes', to: '/promos' },
  { group: 'Go to', label: 'Website countdown', to: '/website' },
  { group: 'Go to', label: 'Settings', to: '/settings' },
];

/** ⌘K / Ctrl+K search across pages, orders, customers, products, collections, messages and promo codes. */
export default function CommandPalette({ open, onClose, products, collections, signups, orders, messages }: {
  open: boolean; onClose: () => void; products: Product[]; collections: Collection[]; signups: Signup[]; orders: Order[]; messages: Message[];
}) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const [promos, setPromos] = useState<PromoCode[]>([]);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);
  // Promo codes live behind the server API; fetch them when the palette opens.
  useEffect(() => { if (open) adminApi<PromoCode[]>('/promos').then(setPromos).catch(() => {}); }, [open]);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (t: string) => !s || t.toLowerCase().includes(s);
    // One entry per person, from orders and waitlist sign-ups.
    const people = new Map<string, { name: string; email: string; text: string; orders: number }>();
    const person = (email: string, name: string, text: string, order: boolean) => {
      const k = email.toLowerCase();
      const p = people.get(k) || { name: '', email: k, text: '', orders: 0 };
      p.name = p.name || name; p.text += ' ' + text; if (order) p.orders++;
      people.set(k, p);
    };
    orders.forEach(o => o.customer?.email && person(o.customer.email, o.customer.name || '', `${o.customer.phone || ''} ${o.shipping?.address?.city || ''}`, true));
    signups.forEach(x => person(x.email, x.firstName, `${x.mobile || ''} ${x.instagram || ''}`, false));
    const orderText = (o: Order) => [orderNo(o), o.id, o.customer?.name, o.customer?.email, o.customer?.phone, o.promotionCode, o.tracking?.number,
      STATUS_LABEL[o.status || ''], ...(o.items || []).flatMap(i => [i.name, i.engraving])].join(' ');
    return [
      ...PAGES.filter(p => match(p.label)).slice(0, s ? 4 : PAGES.length),
      ...(s ? orders.filter(o => match(orderText(o) + ' #' + orderNo(o))).slice(0, 6)
        .map(o => ({ group: 'Orders', label: `#${orderNo(o)} · ${o.customer?.name || o.customer?.email || ''}`, hint: `${STATUS_LABEL[o.status || ''] || o.status} · ${aud(o.totalAUD)}`, to: `/orders/${encodeURIComponent(o.id)}` })) : []),
      ...(s ? [...people.values()].filter(p => match(`${p.name} ${p.email} ${p.text}`)).slice(0, 6)
        .map(p => ({ group: 'Customers', label: p.name ? `${p.name} · ${p.email}` : p.email, hint: p.orders ? `${p.orders} order${p.orders > 1 ? 's' : ''}` : 'Waitlist', to: `/customers/${encodeURIComponent(p.email)}` })) : []),
      ...products.filter(p => match(`${p.name} ${p.width || ''} ${p.id} ${(p.col || []).join(' ')}`)).slice(0, s ? 8 : 4)
        .map(p => ({ group: 'Products', label: p.name + (p.width ? `, ${p.width}` : ''), hint: p.archived ? 'Archived' : p.hidden ? 'Coming soon' : 'Live', img: firstImage(p), to: `/products/${encodeURIComponent(p.id)}` })),
      ...collections.filter(c => match(c.name + ' ' + c.slug)).slice(0, s ? 6 : 3)
        .map(c => ({ group: 'Collections', label: c.name, hint: c.showInShop ? 'In shop' : 'Hidden', to: `/collections?edit=${encodeURIComponent(c.slug)}` })),
      ...(s ? promos.filter(p => match(`${p.code} ${p.affiliate?.name || ''} ${p.affiliate?.email || ''}`)).slice(0, 5)
        .map(p => ({ group: 'Promo codes', label: p.code, hint: `${p.percentOff}% off${p.affiliate ? ` · ${p.affiliate.name}` : ''}`, to: '/promos' })) : []),
      ...(s ? messages.filter(m => match(`${m.name} ${m.email} ${m.topic} ${m.order || ''} ${m.message}`)).slice(0, 5)
        .map(m => ({ group: 'Messages', label: `${m.topic} from ${m.name}`, hint: m.status === 'done' ? 'Done' : 'New', to: '/inbox' })) : []),
    ] as Item[];
  }, [q, products, collections, signups, orders, messages, promos]);

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
          <input ref={input} autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search orders, customers, engraving, products, codes…" />
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
