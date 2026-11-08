import { Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowUpRight, Bell, ChevronDown, UserRound, Globe, BadgePercent, Menu, X, FolderHeart, Inbox, LayoutGrid, LogOut, Megaphone, Moon, Package, Gem, Factory, Clapperboard, Receipt, Search, Settings as SettingsIcon, Undo2, TicketPercent, Timer, Users,
} from 'lucide-react';
import { useAuth } from '../auth';
import { siteUrl } from '../firebase';
import { useCollections, useMessages, useOrders, useProducts, useReturns, useShop, useSignups } from '../lib/data';
import Logo from './Logo';
import LogOff from './LogOff';
import { useTheme } from '../lib/theme';
import CommandPalette from './CommandPalette';
import AccountDrawer, { Avatar } from './AccountDrawer';
import { useToast } from './Toast';
import { SkeletonPage } from './Skeleton';

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'], [/^\/products\/new/, 'New product'], [/^\/products\//, 'Edit product'], [/^\/products/, 'Products'],
  [/^\/collections/, 'Collections'], [/^\/customers\//, 'Customer'], [/^\/customers/, 'Customers'], [/^\/inbox/, 'Inbox'], [/^\/margins/, 'Margins'],
  [/^\/orders\//, 'Order'], [/^\/orders/, 'Orders'], [/^\/returns\//, 'Return'], [/^\/returns/, 'Returns'], [/^\/promos/, 'Promo codes'], [/^\/marketing\//, 'Email'], [/^\/marketing/, 'Marketing'], [/^\/website/, 'Website'], [/^\/settings/, 'Settings'],
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const finishLogOff = useCallback(() => { logout(); }, [logout]);
  const cancelLogOff = useCallback(() => setLeaving(false), []);
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const { data: products, loading: productsLoading } = useProducts();
  const { data: collections, loading: collectionsLoading } = useCollections();
  const { data: signups } = useSignups();
  const shop = useShop();
  const { data: messages } = useMessages();
  const { data: orders } = useOrders();
  const { data: returns } = useReturns();
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const [account, setAccount] = useState(false);
  const toast = useToast();

  // mobile menu: close on navigation and Esc, and stop the page scrolling behind it
  useEffect(() => { setMenu(false); }, [loc.pathname]);
  useEffect(() => {
    if (!menu) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [menu]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
      else if (e.key === '/' && !/input|textarea|select/i.test((e.target as HTMLElement).tagName)) { e.preventDefault(); setPalette(true); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  const liveProducts = products.filter(p => !p.archived).length;
  const customers = new Set([...signups.map(s => s.email.toLowerCase()), ...orders.map(o => (o.customer?.email || '').toLowerCase()).filter(Boolean)]).size;
  const openOrders = orders.filter(o => o.status === 'paid' || o.status === 'in_progress').length;
  const unread = messages.filter(m => m.status !== 'done').length;
  const returnRequests = returns.filter(r => r.status === 'requested').length;
  const title = TITLES.find(([r]) => r.test(loc.pathname))?.[1] ?? '';
  // Each page's name in the browser tab, so open tabs and history are easy to tell apart.
  useEffect(() => { document.title = title ? `${title} · AXIA Admin` : 'AXIA Admin'; }, [title]);
  const name = user?.displayName || user?.email?.split('@')[0] || 'Admin';
  const link = ({ isActive }: { isActive: boolean }) => 'nav-link' + (isActive ? ' active' : '');
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="shell">
      <div className={`scrim${menu ? ' scrim--on' : ''}`} onClick={() => setMenu(false)} aria-hidden="true" />
      <aside className={`sidebar${menu ? ' sidebar--open' : ''}`} id="admin-menu">
        <div className="brand-row">
          <NavLink to="/" className="brand">
            <Logo height={21} />
            <span className="brand__sub">Admin</span>
          </NavLink>
          <button className="icon-btn menu-close" onClick={() => setMenu(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <div className="sidebar__label">Main</div>
        <NavLink to="/" end className={link}><LayoutGrid size={19} /> Dashboard</NavLink>
        <NavLink to="/customers" className={link}><Users size={19} /> Customers {customers > 0 && <span className="pill fade-in">{customers}</span>}</NavLink>
        <NavLink to="/inbox" className={link}><Inbox size={19} /> Inbox {unread > 0 && <span className="pill pill--hot fade-in">{unread}</span>}</NavLink>
        <NavLink to="/orders" className={link}><Receipt size={19} /> Orders {openOrders > 0 && <span className="pill pill--hot fade-in">{openOrders}</span>}</NavLink>
        <NavLink to="/returns" className={link}><Undo2 size={19} /> Returns {returnRequests > 0 && <span className="pill pill--hot fade-in">{returnRequests}</span>}</NavLink>
        <NavLink to="/promos" className={link}><TicketPercent size={19} /> Promo codes</NavLink>
        <NavLink to="/marketing" className={link}><Megaphone size={19} /> Marketing</NavLink>

        <div className="sidebar__label">Catalogue</div>
        <NavLink to="/products" className={link}><Package size={19} /> Products {!productsLoading && <span className="pill fade-in">{liveProducts}</span>}</NavLink>
        <NavLink to="/pieces" className={link}><Gem size={19} /> Pieces</NavLink>
        <NavLink to="/suppliers" className={link}><Factory size={19} /> Suppliers</NavLink>
        <NavLink to="/collections" className={link}><FolderHeart size={19} /> Collections {!collectionsLoading && <span className="pill fade-in">{collections.length}</span>}</NavLink>
        <NavLink to="/reviews" className={link}><Clapperboard size={19} /> Reviews</NavLink>
        <NavLink to="/margins" className={link}><BadgePercent size={19} /> Margins</NavLink>

        <div className="sidebar__label">General</div>
        <NavLink to="/website" className={link}><Timer size={19} /> Website</NavLink>
        <NavLink to="/settings" className={link}><SettingsIcon size={19} /> Settings</NavLink>
        <button className="nav-link" onClick={() => { setMenu(false); setLeaving(true); }}><LogOut size={19} /> Log off</button>

        <div className="sidebar__foot">
          <div className="theme-row"><Moon size={19} /> Dark mode
            <button className="switch" role="switch" aria-checked={theme === 'dark'} aria-label="Dark mode" onClick={toggle} />
          </div>
          <a className="live-site" href={siteUrl('/')} target="_blank" rel="noreferrer"><Globe size={17} /> View live site <ArrowUpRight size={15} /></a>
        </div>
      </aside>

      <div className="main">
        <header className="header">
          <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu} aria-controls="admin-menu"><Menu size={19} /></button>
          <NavLink to="/" className="header__logo" aria-label="Dashboard"><Logo height={17} /></NavLink>
          <div className="header__title">AXIA / <b>{title}</b></div>
          <span className="spacer" />
          {shop.loading ? <span className="skeleton skeleton--chip" aria-hidden="true" /> : <NavLink to="/settings" className={`chip header__shop ${shop.data.open ? 'chip--good' : 'chip--warn'}`} title="Open or close the shop" data-short={shop.data.open ? 'Open' : 'Closed'} aria-label={shop.data.open ? 'Shop open' : 'Shop closed'}><span className="header__shop-text">{shop.data.open ? 'Shop open' : 'Shop closed'}</span></NavLink>}
          <button className="search-trigger" onClick={() => setPalette(true)} aria-label="Search">
            <Search size={16} /><span>Search anything</span><kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <NavLink to="/inbox" className="icon-btn" aria-label="Inbox">
            <Bell size={18} />{unread > 0 && <span className="dot">{unread}</span>}
          </NavLink>
          <AccountMenu name={name} email={user?.email ?? ''} photo={user?.photoURL} onManage={() => setAccount(true)} onLogOff={() => setLeaving(true)} />
        </header>
        <div className="page" key={loc.pathname}><Suspense fallback={<SkeletonPage />}><Outlet /></Suspense></div>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} products={products} collections={collections} signups={signups} orders={orders} messages={messages} />
      {account && <AccountDrawer onClose={() => setAccount(false)} onSaved={m => { setAccount(false); toast.show(m); }} />}
      {toast.node}
      {leaving && <LogOff onDone={finishLogOff} onCancel={cancelLogOff} />}
    </div>
  );
}

/** The avatar in the top bar opens this: who's signed in, "Manage your account" and Log off. */
function AccountMenu({ name, email, photo, onManage, onLogOff }: {
  name: string; email: string; photo?: string | null; onManage: () => void; onLogOff: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); wrap.current?.querySelector('button')?.focus(); } };
    addEventListener('pointerdown', away);
    addEventListener('keydown', key);
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', key); };
  }, [open]);

  const keys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };
  const pickItem = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div className="menu user-menu" ref={wrap}>
      <button className="user-chip" aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${name}`} onClick={() => setOpen(v => !v)}>
        <Avatar name={name} photo={photo} />
        <div><span>{name}</span><small>Admin</small></div>
        <ChevronDown size={14} className="user-chip__caret" />
      </button>
      {open && (
        <div className="menu__list" role="menu" aria-label="Account" onKeyDown={keys}>
          <div className="user-menu__who">
            <Avatar name={name} photo={photo} size={40} />
            <div><b>{name}</b><small>{email}</small></div>
          </div>
          <div className="menu__rule" role="separator" />
          <button role="menuitem" onClick={pickItem(onManage)}><UserRound size={16} /><span>Manage your account<small>Display name, photo and sign-in</small></span></button>
          <button role="menuitem" onClick={pickItem(onLogOff)}><LogOut size={16} /><span>Log off</span></button>
        </div>
      )}
    </div>
  );
}
