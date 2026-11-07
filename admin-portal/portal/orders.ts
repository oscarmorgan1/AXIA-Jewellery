import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../src/firebase';
import { useAccount } from './account';

/** A customer's copy of an order (accounts/{uid}/orders/{id}, written by server/sync.js). */
export interface MyOrder {
  id: string;
  orderNumber: string;
  status: string;
  placedAt: number | null;
  items: { id: string; name: string; qty: number; priceAUD: number; options: string; engraving: string; image: string }[];
  gift: { name: string; length: string } | null;
  subtotalAUD: number;
  discountAUD: number;
  promotionCode: string;
  totalAUD: number;
  shipping: { name: string; method: string; amountAUD: number; address: { line1: string; line2: string; city: string; state: string; postal_code: string; country: string } | null };
  tracking: { carrier: string; number: string; url: string } | null;
  timeline: { status: string; at: number | null; note?: string }[];
  receiptUrl: string;
}

/** The steps a customer sees, in order (same as the emails, server/email.js). */
export const STAGES = [
  { key: 'paid', label: 'Ordered' },
  { key: 'in_progress', label: 'Being made' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'fulfilled', label: 'Delivered' },
];

export const STATUS: Record<string, { label: string; chip: string }> = {
  pending: { label: 'Awaiting payment', chip: 'chip--warn' },
  paid: { label: 'Ordered', chip: 'chip--ice' },
  in_progress: { label: 'Being made', chip: 'chip--ice' },
  shipped: { label: 'Shipped', chip: 'chip--warn' },
  fulfilled: { label: 'Delivered', chip: 'chip--good' },
  cancelled: { label: 'Cancelled', chip: 'chip--muted' },
  refunded: { label: 'Refunded', chip: 'chip--muted' },
};
export const statusOf = (s: string) => STATUS[s] || { label: s, chip: 'chip--muted' };

export const aud = (n: number) => 'A$' + Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
export const day = (t: number | null) => (t ? new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** All their orders, newest first, live. */
export function useMyOrders() {
  const { user } = useAccount();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'accounts', user.uid, 'orders'), orderBy('placedAt', 'desc')),
      s => setOrders(s.docs.map(d => ({ ...(d.data() as Omit<MyOrder, 'id'>), id: d.id }))),
      e => setError(e.message));
  }, [user]);
  return { orders, error };
}

/** One order, live (undefined while loading, null if it isn't theirs or doesn't exist). */
export function useMyOrder(id: string) {
  const { user } = useAccount();
  const [order, setOrder] = useState<MyOrder | null | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'accounts', user.uid, 'orders', id),
      s => setOrder(s.exists() ? { ...(s.data() as Omit<MyOrder, 'id'>), id: s.id } : null),
      () => setOrder(null));
  }, [user, id]);
  return order;
}
