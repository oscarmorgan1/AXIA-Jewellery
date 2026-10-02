import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import type { Collection, CostAssumptions, Message, Order, Product, ProductCost, Signup, Countdown, Visit } from '../types';
import { DEFAULT_ASSUMPTIONS } from './economics';

interface Live<T> { data: T; loading: boolean; error: Error | null }

function useLiveCollection<T>(name: string, map: (id: string, d: DocumentData) => T): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: true, error: null });
  useEffect(() => onSnapshot(
    collection(db, name),
    snap => setState({ data: snap.docs.map(d => map(d.id, d.data())), loading: false, error: null }),
    error => setState(s => ({ ...s, loading: false, error })),
  ), [name]);
  return state;
}

export function useProducts() {
  const s = useLiveCollection<Product>('products', (id, d) => ({ ...(d as Product), id }));
  return { ...s, data: [...s.data].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)) };
}

export function useCosts() {
  const s = useLiveCollection<ProductCost>('productCosts', (id, d) => ({ ...(d as ProductCost), id }));
  const byId = new Map(s.data.map(c => [c.id, c]));
  return { ...s, byId };
}

export function useOrders() {
  const s = useLiveCollection<Order>('orders', (id, d) => ({ ...(d as Order), id }));
  return { ...s, data: [...s.data].sort((a, b) => (b.createdAt?.toDate().getTime() ?? 0) - (a.createdAt?.toDate().getTime() ?? 0)) };
}

export function useAssumptions(): Live<CostAssumptions> {
  const [state, setState] = useState<Live<CostAssumptions>>({ data: DEFAULT_ASSUMPTIONS, loading: true, error: null });
  useEffect(() => onSnapshot(
    doc(db, 'internal', 'costAssumptions'),
    snap => setState({ data: { ...DEFAULT_ASSUMPTIONS, ...(snap.data() as Partial<CostAssumptions> | undefined) }, loading: false, error: null }),
    error => setState(s => ({ ...s, loading: false, error })),
  ), []);
  return state;
}

/** Matches DEFAULT_COUNTDOWN in assets/js/catalogue.js (what the site shows before anything is saved). */
export const DEFAULT_COUNTDOWN: Countdown = { mode: 'text', label: 'The First Drop', text: 'Dropping soon', target: '2026-11-20T19:00:00+11:00', endedText: 'Out now' };

export function useCountdown(): Live<Countdown> & { saved: boolean } {
  const [state, setState] = useState<Live<Countdown> & { saved: boolean }>({ data: DEFAULT_COUNTDOWN, loading: true, error: null, saved: false });
  useEffect(() => onSnapshot(
    doc(db, 'site', 'countdown'),
    snap => setState({ data: { ...DEFAULT_COUNTDOWN, ...(snap.data() as Partial<Countdown> | undefined) }, loading: false, error: null, saved: snap.exists() }),
    error => setState(s => ({ ...s, loading: false, error })),
  ), []);
  return state;
}

/** Sydney calendar day, YYYY-MM-DD, matching how the storefront records visits. */
export const sydneyDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

/** Unique-visitor entries for the last `days` days. */
export function useVisits(days = 120): Live<Visit[]> {
  const [state, setState] = useState<Live<Visit[]>>({ data: [], loading: true, error: null });
  useEffect(() => onSnapshot(
    query(collection(db, 'visits'), where('day', '>=', sydneyDay(new Date(Date.now() - days * 86400000)))),
    snap => setState({ data: snap.docs.map(d => ({ ...(d.data() as Visit), id: d.id })), loading: false, error: null }),
    error => setState(s => ({ ...s, loading: false, error })),
  ), [days]);
  return state;
}

const byNewest = <T extends { createdAt?: { toDate(): Date } }>(a: T, b: T) =>
  (b.createdAt?.toDate().getTime() ?? 0) - (a.createdAt?.toDate().getTime() ?? 0);

export function useCollections() {
  const s = useLiveCollection<Collection>('collections', (id, d) => ({ ...(d as Collection), slug: id }));
  const data = [...s.data].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  return { ...s, data, bySlug: new Map(data.map(c => [c.slug, c])) };
}

export function useSignups() {
  const s = useLiveCollection<Signup>('signups', (id, d) => ({ ...(d as Signup), id }));
  return { ...s, data: [...s.data].sort(byNewest) };
}

export function useMessages() {
  const s = useLiveCollection<Message>('messages', (id, d) => ({ ...(d as Message), id }));
  return { ...s, data: [...s.data].sort(byNewest) };
}
