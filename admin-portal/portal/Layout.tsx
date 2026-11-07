import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Gem, LogOut, Mail, MapPin, MessageSquare, Package, ShieldCheck, ShoppingBag, UserRound } from 'lucide-react';
import Logo from '../src/components/Logo';
import { useAccount } from './account';
import { useMyThreads } from './support';
import { useIncoming } from './pieces';

/** Portal sections, in sidebar order. */
export const TABS = [
  { to: '/orders', label: 'Orders', icon: Package },
  { to: '/pieces', label: 'Pieces', icon: Gem },
  { to: '/support', label: 'Support', icon: MessageSquare },
  { to: '/bag', label: 'Saved bag', icon: ShoppingBag },
  { to: '/details', label: 'Details', icon: UserRound },
  { to: '/address', label: 'Address', icon: MapPin },
  { to: '/emails', label: 'Emails', icon: Mail },
  { to: '/security', label: 'Sign-in', icon: ShieldCheck },
];

/** The signed-in portal: a sidebar of sections (a scrolling tab row on phones), and sign out. */
export default function Layout({ children }: { children: ReactNode }) {
  const { account, user, logout } = useAccount();
  const name = account?.name || user?.displayName || '';
  const unread = (useMyThreads().threads || []).filter(t => t.unread).length;
  const incoming = (useIncoming() || []).length;
  const badge: Record<string, number> = { '/support': unread, '/pieces': incoming };
  return (
    <div className="pt">
      <header className="pt__head">
        <a href="/" className="pt__logo" aria-label="AXIA home"><Logo height={20} /></a>
        <span className="spacer" />
        <a className="btn btn--ghost btn--sm" href="/">Shop</a>
        <button className="btn btn--ghost btn--sm" onClick={logout}><LogOut size={15} /> Sign out</button>
      </header>
      <div className="pt__body">
        <aside className="pt__side">
          <div className="pt__me">
            <span className="avatar">{(name || account?.email || '?').slice(0, 1).toUpperCase()}</span>
            <span><b>{name || 'Your account'}</b><small>{account?.email}</small></span>
          </div>
          <nav className="pt__nav" aria-label="Your account">
            {TABS.map(t => (
              <NavLink key={t.to} to={t.to} className="nav-link pt__link"><t.icon size={17} /> {t.label}
                {badge[t.to] > 0 && <span className="pt__badge" aria-label={t.to === '/pieces' ? `${badge[t.to]} waiting for you` : `${badge[t.to]} unread`}>{badge[t.to]}</span>}</NavLink>
            ))}
          </nav>
        </aside>
        <main className="pt__main">{children}</main>
      </div>
      <footer className="pt__foot">
        <a href="/support">Help centre</a> · <a href="/terms">Terms</a> · <a href="/terms#privacy">Privacy</a>
      </footer>
    </div>
  );
}
