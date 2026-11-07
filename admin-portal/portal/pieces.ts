import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../src/firebase';
import { useAccount } from './account';

/** A customer's copy of one of their pieces (accounts/{uid}/pieces/{key}, written by server/sync.js). */
export interface MyPiece {
  key: string;
  serial: string;
  productId: string;
  productName: string;
  variant: string;
  image: string;
  purchasedOn: string | null;
  orderId: string | null;
  orderNumber: string;
  shippedOn: string | null;
}

/** All their pieces, newest purchase first, live. */
export function useMyPieces() {
  const { user } = useAccount();
  const [pieces, setPieces] = useState<MyPiece[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'accounts', user.uid, 'pieces'), s => {
      const list = s.docs.map(d => ({ ...(d.data() as Omit<MyPiece, 'key'>), key: d.id }));
      list.sort((a, b) => (b.purchasedOn || '').localeCompare(a.purchasedOn || '') || a.serial.localeCompare(b.serial));
      setPieces(list);
    }, e => setError(e.message));
  }, [user]);
  return { pieces, error };
}

/** "2026-10-28" → "28 Oct 2026". */
export const ymd = (s: string | null) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};
