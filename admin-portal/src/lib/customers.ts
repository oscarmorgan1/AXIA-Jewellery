import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from './api';
import { useMessages, useOrders, useSignups } from './data';
import { isSale } from './orders';
import type { CustomerRecord, Message, Order, Signup } from '../types';

/** Orders that still need something from us. */
export const OPEN_STATUSES = ['paid', 'in_progress', 'shipped'];
export const isOpen = (o: Order) => OPEN_STATUSES.includes(o.status || '');

/** One person, joined by email across orders, their customer record, waitlist sign-ups and messages. */
export interface Person {
  id: string;
  email: string;
  name: string;
  phone: string;
  instagram: string;
  address: CustomerRecord['address'];
  notes: string;
  orders: Order[];
  sales: Order[];
  open: Order[];
  spentAUD: number;
  signups: Signup[];
  messages: Message[];
  interests: string[];
  sources: string[];
  promoCodes: string[];
  emailConsent: boolean;
  smsConsent: boolean;
  first?: Date;
  last?: Date;
  record?: CustomerRecord;
}

const key = (e?: string) => (e || '').trim().toLowerCase();

export function buildPeople(records: CustomerRecord[], orders: Order[], signups: Signup[], messages: Message[]): Person[] {
  const map = new Map<string, Person>();
  const get = (email: string) => {
    let p = map.get(email);
    if (!p) {
      p = { id: email, email, name: '', phone: '', instagram: '', address: null, notes: '', orders: [], sales: [], open: [], spentAUD: 0,
        signups: [], messages: [], interests: [], sources: [], promoCodes: [], emailConsent: false, smsConsent: false };
      map.set(email, p);
    }
    return p;
  };
  const seen = (p: Person, d?: Date) => {
    if (!d) return;
    if (!p.first || d < p.first) p.first = d;
    if (!p.last || d > p.last) p.last = d;
  };
  // Oldest first, so the newest details win.
  [...signups].reverse().forEach(s => {
    const p = get(key(s.email));
    p.name = s.firstName || p.name;
    p.phone = s.mobile || p.phone;
    p.instagram = s.instagram || p.instagram;
    const want = [s.productName, s.size].filter(Boolean).join(' · ');
    if (want && !p.interests.includes(want)) p.interests.push(want);
    if (s.source && !p.sources.includes(s.source)) p.sources.push(s.source);
    p.smsConsent = !!s.smsConsent;
    p.emailConsent = p.emailConsent || !!s.emailConsent;
    p.signups.unshift(s);
    seen(p, s.createdAt?.toDate());
  });
  [...orders].reverse().forEach(o => {
    const email = key(o.customer?.email);
    if (!email) return;
    const p = get(email);
    p.name = o.customer?.name || p.name;
    p.phone = o.customer?.phone || p.phone;
    p.address = o.shipping?.address || p.address;
    p.orders.unshift(o);
    if (isSale(o)) { p.sales.unshift(o); p.spentAUD += o.totalAUD || 0; }
    if (isOpen(o)) p.open.unshift(o);
    if (o.promotionCode && !p.promoCodes.includes(o.promotionCode)) p.promoCodes.push(o.promotionCode);
    seen(p, o.createdAt?.toDate());
  });
  records.forEach(r => {
    const p = get(key(r.email));
    p.record = r;
    p.notes = r.notes || '';
    p.name = p.name || r.name || '';
    p.phone = p.phone || r.phone || '';
    p.address = p.address || r.address || null;
  });
  messages.forEach(m => {
    const p = map.get(key(m.email));
    if (p) p.messages.push(m);
  });
  return [...map.values()].sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0));
}

/** Everything a person's search should match: contact details, orders (numbers, pieces, engraving, codes) and sign-ups. */
export function personText(p: Person) {
  return [p.name, p.email, p.phone, p.instagram, p.interests.join(' '), p.promoCodes.join(' '), p.notes,
    p.address && [p.address.line1, p.address.city, p.address.postal_code].join(' '),
    ...p.orders.map(o => [o.orderNumber, o.id, ...(o.items || []).flatMap(i => [i.name, i.engraving])].join(' '))].join(' ').toLowerCase();
}

/** Customer records come from the server; orders, sign-ups and messages are live. */
export function usePeople() {
  const orders = useOrders();
  const signups = useSignups();
  const messages = useMessages();
  const [records, setRecords] = useState<CustomerRecord[]>([]);
  const [recordsError, setRecordsError] = useState<string>('');
  const reload = useCallback(() => {
    adminApi<CustomerRecord[]>('/customers').then(r => { setRecords(r); setRecordsError(''); }).catch(e => setRecordsError(e.message));
  }, []);
  // Reload when the number of orders changes, so a new order's record shows up.
  useEffect(reload, [reload, orders.data.length]);
  const people = useMemo(() => buildPeople(records, orders.data, signups.data, messages.data), [records, orders.data, signups.data, messages.data]);
  return { people, loading: orders.loading || signups.loading, error: orders.error || signups.error, recordsError, reload, signups: signups.data };
}
