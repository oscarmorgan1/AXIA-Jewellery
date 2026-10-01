import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => onIdTokenChanged(auth, async u => {
    setUser(u);
    setIsAdmin(u ? (await u.getIdTokenResult()).claims.admin === true : false);
    setLoading(false);
  }), []);

  const value: AuthState = {
    user, isAdmin, loading,
    // pick up a freshly granted admin claim without signing out
    refresh: async () => { if (auth.currentUser) await auth.currentUser.getIdToken(true); },
    logout: () => signOut(auth),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
