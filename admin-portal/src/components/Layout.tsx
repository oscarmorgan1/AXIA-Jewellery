import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import {
  BadgePercent, ExternalLink, HelpCircle, LayoutGrid, LogOut, Package, PlusCircle, Receipt, Search, Settings as SettingsIcon,
} from 'lucide-react';
import { useAuth } from '../auth';
import { siteUrl } from '../firebase';
import { useProducts } from '../lib/data';

export default function Layout() {
  const { user, logout } = useAuth();
  const { data: products } = useProducts();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const active = products.filter(p => !p.archived).length;
  const initial = (user?.displayName || user?.email || '?').slice(0, 1).toUpperCase();

  const onSearch = (e: FormEvent) => { e.preventDefault(); nav(`/products?q=${encodeURIComponent(q)}`); };
  const link = ({ isActive }: { isActive: boolean }) => 'nav-link' + (isActive ? ' active' : '');

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand__mark">A</span>
          AXIA Admin
        </NavLink>
        <form className="topbar__search" onSubmit={onSearch}>
          <Search size={18} />
          <input placeholder="Search product" value={q} onChange={e => setQ(e.target.value)} aria-label="Search products" />
        </form>
        <a className="icon-btn" href={siteUrl('index.html')} target="_blank" rel="noreferrer" title="Open storefront"><ExternalLink size={18} /></a>
        <a className="icon-btn" href="https://console.firebase.google.com/project/axia-jewellery/overview" target="_blank" rel="noreferrer" title="Firebase console"><HelpCircle size={18} /></a>
        <div className="user-chip">
          <span className="avatar">{initial}</span>
          <div><span>{user?.displayName || user?.email}</span><small>Admin</small></div>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar__label">Menu</div>
        <NavLink to="/" end className={link}><LayoutGrid size={20} /> Dashboard</NavLink>
        <NavLink to="/margins" className={link}><BadgePercent size={20} /> Margins</NavLink>
        <NavLink to="/orders" className={link}><Receipt size={20} /> Orders</NavLink>

        <div className="sidebar__label">Products</div>
        <NavLink to="/products" end className={link}><Package size={20} /> Store <span className="pill">{active}</span></NavLink>
        <NavLink to="/products/new" className={link}><PlusCircle size={20} /> Add product</NavLink>

        <div className="sidebar__label">General</div>
        <NavLink to="/settings" className={link}><SettingsIcon size={20} /> Settings</NavLink>
        <button className="nav-link nav-link--logout" onClick={logout}><LogOut size={20} /> Log out</button>
      </aside>

      <main className="main"><Outlet /></main>
    </div>
  );
}
