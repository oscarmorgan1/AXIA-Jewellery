import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../src/firebase';
import { useAccount } from './account';

/** A customer's copy of one of their returns (accounts/{uid}/returns/{id}, written by server/sync.js). */
export interface MyReturn {
  id: string;
  number: string;
  orderId: string | null;
  orderNumber: string;
  status: 'requested' | 'label_created' | 'received' | 'refunded' | 'replacement_sent' | 'closed' | 'declined' | 'withdrawn' | string;
  /** The end goal: money back, or a replacement (`wanted` says what they asked for). */
  outcome: 'refund' | 'exchange';
  wanted: string;
  replacement: { carrier: string; number: string; url: string; pieces: { serial: string; productName: string; variant: string }[] } | null;
  reason: string;
  note: string;
  full: boolean;
  items: { key: string | null; serial: string; productName: string; variant: string }[];
  label: { carrier: string; number: string; url: string } | null;
  refund: { amountAUD: number; at: number | null } | null;
  timeline: { status: string; at: number | null; note?: string }[];
  createdAt: number | null;
  /** Where to send it, once the label is ready (for the return slip). */
  returnTo: string;
}

/** The tracker a customer sees for each end goal, in order. */
export const STEPS = {
  refund: [
    { key: 'requested', label: 'Requested' },
    { key: 'label_created', label: 'Label created' },
    { key: 'received', label: 'Received' },
    { key: 'refunded', label: 'Refunded' },
    { key: 'closed', label: 'Cancelled' },
  ],
  exchange: [
    { key: 'requested', label: 'Requested' },
    { key: 'label_created', label: 'Label created' },
    { key: 'received', label: 'Received' },
    { key: 'replacement_sent', label: 'Replacement sent' },
    { key: 'closed', label: 'Exchanged' },
  ],
};
export const stepsFor = (r: MyReturn) => STEPS[r.outcome === 'exchange' ? 'exchange' : 'refund'];

/** Customers can start a return for this many days after the piece shipped (server/returns.js). */
export const RETURN_DAYS = 30;
/** Whether a piece shipped on `shippedOn` (YYYY-MM-DD) can still be returned. Same cut-off as the server. */
export function canStillReturn(shippedOn: string | null, now = Date.now()) {
  if (!shippedOn || !/^\d{4}-\d{2}-\d{2}$/.test(shippedOn)) return false;
  const [y, m, d] = shippedOn.split('-').map(Number);
  return now < Date.UTC(y, m - 1, d + RETURN_DAYS + 1) - 10 * 60 * 60 * 1000;
}

export const RETURN_STATUS: Record<string, { label: string; chip: string }> = {
  requested: { label: 'Return requested', chip: 'chip--warn' },
  label_created: { label: 'Return label ready', chip: 'chip--ice' },
  received: { label: 'Return received', chip: 'chip--ice' },
  refunded: { label: 'Refunded', chip: 'chip--good' },
  replacement_sent: { label: 'Replacement on its way', chip: 'chip--good' },
  closed: { label: 'Return complete', chip: 'chip--good' },
  declined: { label: 'Return declined', chip: 'chip--muted' },
  withdrawn: { label: 'Return withdrawn', chip: 'chip--muted' },
};

/** The chip for a return: an exchange says so instead of "Return". */
export function statusChip(ret: Pick<MyReturn, 'status' | 'outcome'>) {
  const st = RETURN_STATUS[ret.status] || { label: ret.status, chip: 'chip--muted' };
  return ret.outcome === 'exchange' ? { ...st, label: st.label.replace(/^Return/, 'Exchange') } : st;
}

export const OPEN_RETURN = ['requested', 'label_created', 'received', 'refunded', 'replacement_sent'];
export const isOpenReturn = (r: MyReturn) => OPEN_RETURN.includes(r.status);

/** Reasons a customer can pick (same keys as server/returns.js). */
export const REASONS = [
  { key: 'fit', label: 'It doesn’t fit' },
  { key: 'mind', label: 'Changed my mind' },
  { key: 'faulty', label: 'Faulty or damaged' },
  { key: 'other', label: 'Something else' },
];

/** The furthest tracker step a return reached. */
export function returnStep(r: MyReturn) {
  const steps = stepsFor(r);
  const at = steps.findIndex(s => s.key === r.status);
  if (at >= 0) return at;
  return Math.max(0, ...r.timeline.map(t => steps.findIndex(s => s.key === t.status)));
}

/** All their returns, newest first, live. */
export function useMyReturns() {
  const { user } = useAccount();
  const [returns, setReturns] = useState<MyReturn[] | null>(null);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'accounts', user.uid, 'returns'), s => {
      const list = s.docs.map(d => ({ ...(d.data() as Omit<MyReturn, 'id'>), id: d.id }));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setReturns(list);
    }, () => setReturns([]));
  }, [user]);
  return returns;
}
