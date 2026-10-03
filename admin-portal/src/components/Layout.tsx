import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowUpRight, Bell, Globe, BadgePercent, Menu, X, FolderHeart, Inbox, LayoutGrid, LogOut, Moon, Package, Receipt, Search, Settings as SettingsIcon, Timer, Users,
} from 'lucide-react';
import { useAuth } from '../auth';
import { siteUrl } from '../firebase';
import { useCollections, useMessages, useProducts, useSignups } from '../lib/data';
import Logo from './Logo';
import LogOff from './LogOff';
import { useTheme } from '../lib/theme';
import CommandPalette from './CommandPalette';

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'], [/^\/products\/new/, 'New product'], [/^\/products\//, 'Edit product'], [/^\/products/, 'Products'],
  [/^\/collections/, 'Collections'], [/^\/customers/, 'Customers'], [/^\/inbox/, 'Inbox'], [/^\/margins/, 'Margins'],
  [/^\/orders/, 'Orders'], [/^\/website/, 'Website'], [/^\/settings/, 'Settings'],
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const finishLogOff = useCallback(() => { logout(); }, [logout]);
  const cancelLogOff = useCallback(() => setLeaving(false), []);
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const { data: products } = useProducts();
  const { data: collections } = useCollections();
  const { data: signups } = useSignups();
  const { data: messages } = useMessages();
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);

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
  const customers = new Set(signups.map(s => s.email.toLowerCase())).size;
  const unread = messages.filter(m => m.status !== 'done').length;
  const title = TITLES.find(([r]) => r.test(loc.pathname))?.[1] ?? '';
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
        <NavLink to="/customers" className={link}><Users size={19} /> Customers {customers > 0 && <span className="pill">{customers}</span>}</NavLink>
        <NavLink to="/inbox" className={link}><Inbox size={19} /> Inbox {unread > 0 && <span className="pill pill--hot">{unread}</span>}</NavLink>
        <NavLink to="/orders" className={link}><Receipt size={19} /> Orders</NavLink>

        <div className="sidebar__label">Catalogue</div>
        <NavLink to="/products" className={link}><Package size={19} /> Products <span className="pill">{liveProducts}</span></NavLink>
        <NavLink to="/collections" className={link}><FolderHeart size={19} /> Collections <span className="pill">{collections.length}</span></NavLink>
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
          <button className="search-trigger" onClick={() => setPalette(true)} aria-label="Search">
            <Search size={16} /><span>Search anything</span><kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <NavLink to="/inbox" className="icon-btn" aria-label="Inbox">
            <Bell size={18} />{unread > 0 && <span className="dot">{unread}</span>}
          </NavLink>
          <div className="user-chip">
            <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
            <div><span>{name}</span><small>Admin</small></div>
          </div>
        </header>
        <div className="page" key={loc.pathname}><Outlet /></div>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} products={products} collections={collections} signups={signups} />
      {leaving && <LogOff onDone={finishLogOff} onCancel={cancelLogOff} />}
    </div>
  );
}
