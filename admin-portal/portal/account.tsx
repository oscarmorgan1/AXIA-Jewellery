import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../src/firebase';
import { accountApi } from './api';

/** What the customer sees of their account (accounts/{uid}, written by the server). */
export interface Account {
  email: string;
  name?: string;
  phone?: string;
  address?: { line1?: string; line2?: string | null; city?: string; state?: string; postal_code?: string; country?: string } | null;
  marketing?: { email?: boolean };
}

interface State {
  user: User | null;
  account: Account | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
}

const Ctx = createContext<State | null>(null);

/** The signed-in customer and their account, kept live from Firestore. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, u => {
    setUser(u); setAccount(null); setError(null);
    setLoading(!!u);
    if (!u) setLoading(false);
  }), []);

  useEffect(() => {
    if (!user) return;
    let stop = () => {};
    let live = true;
    // The server makes accounts/{uid} on first sign-in (e.g. Google), then we listen to it.
    accountApi('/session').then(() => {
      if (!live) return;
      stop = onSnapshot(doc(db, 'accounts', user.uid), snap => {
        setAccount(snap.exists() ? (snap.data() as Account) : null);
        setLoading(false);
      }, err => { setError(err.message); setLoading(false); });
    }).catch(err => { if (live) { setError((err as Error).message); setLoading(false); } });
    return () => { live = false; stop(); };
  }, [user]);

  return <Ctx.Provider value={{ user, account, loading, error, logout: () => signOut(auth) }}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount outside AccountProvider');
  return v;
}
