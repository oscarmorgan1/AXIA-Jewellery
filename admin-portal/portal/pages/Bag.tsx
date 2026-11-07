import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ShoppingBag, X } from 'lucide-react';
import { db, siteUrl } from '../../src/firebase';
import { useAccount } from '../account';
import { accountApi } from '../api';

/** A bag line as the storefront keeps it (assets/js/axia.js). */
interface Line { id: string; name: string; price: number; opt: string; img: string; width: string; length: string; colour: string; engraving: string; q: number }

const aud = (n: number) => 'A$' + n.toLocaleString('en-AU', { maximumFractionDigits: 2 });
const thumb = (src: string) => { const m = /^\/?(assets\/img\/[^?#]+)\.(jpe?g|png)$/i.exec(src); return siteUrl(m ? `${m[1]}-600.webp` : src); };

/** Puts the saved bag in this browser's bag, so the storefront and checkout show it. */
function keepHere(lines: Line[], at: number, uid: string) {
  try {
    localStorage.setItem('axia_cart', JSON.stringify(lines));
    localStorage.setItem('axia_cart_at', String(at));
    localStorage.setItem('axia_cart_uid', uid);
  } catch { /* storage blocked */ }
}

/** /portal/bag: the bag saved to their account from any device, live. */
export default function Bag() {
  const { user } = useAccount();
  const [bag, setBag] = useState<{ lines: Line[]; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { document.title = 'Saved bag · AXIA'; }, []);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'accounts', user.uid, 'saved', 'cart'),
      s => setBag(s.exists() ? { lines: (s.get('lines') || []) as Line[], at: Number(s.get('at')) || 0 } : { lines: [], at: 0 }),
      e => setError(e.message));
  }, [user]);

  async function remove(i: number) {
    if (!bag || !user) return;
    const lines = bag.lines.filter((_, n) => n !== i);
    const at = Date.now();
    try { await accountApi('/cart', { lines, at }); keepHere(lines, at, user.uid); } catch (e) { setError((e as Error).message); }
  }
  function go(href: string) {
    if (bag && user) keepHere(bag.lines, bag.at || Date.now(), user.uid);
    location.href = href;
  }

  const total = (bag?.lines || []).reduce((a, l) => a + l.price * (l.q || 1), 0);
  return (
    <div className="page pt-page">
      <div className="page-head"><h1>Saved bag</h1><p className="lede">What’s in your bag follows you to any device you sign in on.</p></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {bag === null ? <div className="card"><div className="skeleton" style={{ height: 80 }} /></div>
        : !bag.lines.length ? (
          <div className="card empty">
            <ShoppingBag size={28} />
            <b>Your bag is empty</b>
            <p>Pieces you add while signed in are saved here.</p>
            <a className="btn btn--primary" href="/">Shop AXIA</a>
          </div>
        ) : (
          <div className="card">
            <ul className="pt-bag">
              {bag.lines.map((l, i) => (
                <li key={i} className="pt-bag__line">
                  {l.img ? <img src={thumb(l.img)} alt="" onError={e => { e.currentTarget.src = siteUrl(l.img); }} /> : <span className="pt-bag__ph" />}
                  <div className="pt-bag__body">
                    <a href={l.id ? `/product?id=${encodeURIComponent(l.id)}` : '/'}><b>{l.name}</b></a>
                    {l.opt && <small>{l.opt}</small>}
                    {l.engraving && <small>Engraving: “{l.engraving}”</small>}
                  </div>
                  <span className="pt-bag__price">{aud(l.price * (l.q || 1))}</span>
                  <button className="icon-btn" aria-label={`Remove ${l.name}`} onClick={() => remove(i)}><X size={16} /></button>
                </li>
              ))}
            </ul>
            <div className="pt-bag__foot">
              <span>Subtotal <b>{aud(total)}</b></span>
              <span className="spacer" />
              <button className="btn" onClick={() => go('/')}>Keep shopping</button>
              <button className="btn btn--primary" onClick={() => go('/checkout')}>Check out</button>
            </div>
          </div>
        )}
    </div>
  );
}
