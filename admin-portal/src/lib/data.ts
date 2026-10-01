import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import type { CostAssumptions, Order, Product, ProductCost } from '../types';
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
