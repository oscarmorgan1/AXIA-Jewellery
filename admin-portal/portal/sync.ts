/* ============================================================
   AXIA, saved bag for signed-in customers (built to /portal/sync.js)
   Loaded by assets/js/axia.js only when the customer portal (/portal) has marked
   this browser as signed in (localStorage axia_account). Uses the same
   Firebase sign-in as the portal (same site, so the same session) to:
     - on the first visit after signing in, merge this browser's bag with
       the one saved in their account, so nothing added as a guest is lost;
     - after that, keep whichever copy changed last (axia_cart_at), so a
       bag emptied by checkout on one device is empty everywhere;
     - save every change (POST /api/account/cart, a little after it happens).
   If they've signed out, the flag is cleared and nothing else happens.
   ============================================================ */
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { firebaseConfig } from '../src/firebaseConfig';

interface Line { [k: string]: unknown }
interface Axia { getCart(): Line[]; setCart(lines: Line[], at: number): void }
declare global { interface Window { AXIA: Axia } }

const auth = getAuth(initializeApp(firebaseConfig));
// Same rule as the portal (src/firebase.ts): on localhost, the emulators.
if (['localhost', '127.0.0.1'].includes(location.hostname) && import.meta.env.VITE_USE_EMULATORS !== 'false') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

const get = (k: string) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k: string, v: string | null) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };

async function api<T = unknown>(path: string, user: User, body: unknown = {}): Promise<T> {
  const r = await fetch(`/api/account${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`account ${path}: ${r.status}`);
  return r.json();
}

// Same piece, same options: the same line.
const sig = (l: Line) => JSON.stringify([l.id, l.name, l.opt, l.width, l.length, l.colour, l.engraving]);

const user = await new Promise<User | null>(resolve => { const stop = onAuthStateChanged(auth, u => { stop(); resolve(u); }); });
if (!user) {
  set('axia_account', null);
  document.querySelectorAll('.nav__icon--account').forEach(a => { a.classList.remove('is-in'); a.setAttribute('aria-label', 'Sign in'); });
} else {
  const AXIA = window.AXIA;
  const localAt = Number(get('axia_cart_at')) || 0;
  const local = AXIA.getCart();
  const saved = await api<{ lines: Line[]; at: number }>('/cart/get', user);
  if (get('axia_cart_uid') !== user.uid) {
    // First time this browser syncs with this account: keep both bags.
    const seen = new Set(saved.lines.map(sig));
    const merged = saved.lines.concat(local.filter(l => !seen.has(sig(l))));
    const at = Date.now();
    AXIA.setCart(merged, at);
    await api('/cart', user, { lines: merged, at });
    set('axia_cart_uid', user.uid);
  } else if (saved.at > localAt) {
    AXIA.setCart(saved.lines, saved.at);
  } else if (localAt > saved.at) {
    await api('/cart', user, { lines: local, at: localAt });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener('axia:cart', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      api('/cart', user, { lines: AXIA.getCart(), at: Number(get('axia_cart_at')) || Date.now() }).catch(e => console.warn('bag not saved', e));
    }, 800);
  });
}

export {};
