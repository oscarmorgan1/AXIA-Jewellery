import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import Logo from '../src/components/Logo';
import { useAccount } from './account';

/** The signed-in portal: AXIA mark, the tabs, and sign out. */
export default function Layout({ children }: { children: ReactNode }) {
  const { account, user, logout } = useAccount();
  const name = account?.name || user?.displayName || '';
  return (
    <div className="pt">
      <header className="pt__head">
        <a href="/" className="pt__logo" aria-label="AXIA home"><Logo height={20} /></a>
        <nav className="pt__tabs" aria-label="Your account">
          <NavLink to="/account" className="pt__tab">Account</NavLink>
        </nav>
        <span className="spacer" />
        <span className="pt__who">{name ? `Hi, ${name.split(' ')[0]}` : account?.email}</span>
        <button className="btn btn--ghost btn--sm" onClick={logout}><LogOut size={15} /> Sign out</button>
      </header>
      <main className="pt__main">{children}</main>
      <footer className="pt__foot">
        <a href="/support">Help centre</a> · <a href="/terms">Terms</a> · <a href="/terms#privacy">Privacy</a>
      </footer>
    </div>
  );
}
