import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  /** This sign-in has passed the emailed code, so the rules let it read and write. */
  verified: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Re-render with the signed-in user's latest profile (display name, photo) after an update. */
  profileChanged: () => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  // updateProfile edits the same User object in place, so bump this to re-render readers of it
  const [, setProfileTick] = useState(0);

  useEffect(() => onIdTokenChanged(auth, async u => {
    setUser(u);
    const claims = u ? (await u.getIdTokenResult()).claims : {};
    const admin = claims.admin === true;
    setIsAdmin(admin);
    // Mirrors the rules: the server adds this sign-in's auth_time to `mfa` once the code checks out.
    setVerified(admin && Array.isArray(claims.mfa) && claims.mfa.includes(Number(claims.auth_time)));
    // The storefront shares this origin in production: don't count admins as visitors.
    if (admin) try { localStorage.setItem('axia_no_track', '1'); } catch { /* storage blocked */ }
    setLoading(false);
  }), []);

  const value: AuthState = {
    user, isAdmin, verified, loading,
    // pick up a freshly granted admin claim (or a just-verified code) without signing out
    refresh: async () => { if (auth.currentUser) await auth.currentUser.getIdToken(true); },
    profileChanged: () => setProfileTick(t => t + 1),
    logout: () => signOut(auth),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
