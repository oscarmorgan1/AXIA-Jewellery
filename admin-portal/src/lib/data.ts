import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import type { Collection, CostAssumptions, Message, Order, Product, ProductCost, Signup } from '../types';
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
