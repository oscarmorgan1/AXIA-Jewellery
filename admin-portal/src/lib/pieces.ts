import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Order, Piece } from '../types';
import { orderNo } from './orders';

/**
 * A serial as typed ("ax 0001-0042") to the record's key ("AX00010042"): capitals,
 * letters and digits only. server/genuine.js does the same, so a customer can type
 * the serial with or without spaces.
 */
export const serialKey = (serial: string) => String(serial || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);

/** The serial as it is stored and printed: capitals, single spaces. */
export const cleanSerial = (serial: string) => String(serial || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 40);

export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const shortDate = (ymd?: string | null) => {
  if (!ymd || !DATE.test(ymd)) return '–';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

export type PieceState = 'stock' | 'assigned' | 'shipped';
export const pieceState = (p: Piece): PieceState => p.shippedOn ? 'shipped' : p.orderId ? 'assigned' : 'stock';
export const STATE_LABEL: Record<PieceState, string> = { stock: 'In stock', assigned: 'Assigned', shipped: 'Shipped' };
export const STATE_CHIP: Record<PieceState, string> = { stock: 'chip--muted', assigned: 'chip--ice', shipped: 'chip--good' };

export interface PieceDraft {
  serial: string; productId: string; productName: string; variant: string; supplier: string;
  purchasedOn: string; shippedOn: string; notes: string;
}

export function draftError(d: PieceDraft): string {
  if (!serialKey(d.serial)) return 'Add the serial number.';
  if (!d.productId) return 'Pick the product.';
  if (!DATE.test(d.purchasedOn)) return 'Add the supplier purchase date.';
  if (d.shippedOn && !DATE.test(d.shippedOn)) return 'The shipped date doesn’t look right.';
  return '';
}

/**
 * Adds a piece. Fails if the serial is already in the registry, so two records can
 * never share a serial. `link` assigns it to an order line straight away.
 */
export async function createPiece(d: PieceDraft, link?: { order: Order; line: number }): Promise<string> {
  const key = serialKey(d.serial);
  const ref = doc(db, 'pieces', key);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error(`Serial ${cleanSerial(d.serial)} is already in the registry.`);
    tx.set(ref, {
      key, serial: cleanSerial(d.serial), productId: d.productId, productName: d.productName,
      variant: d.variant.trim(), supplier: d.supplier.trim(), purchasedOn: d.purchasedOn,
      shippedOn: d.shippedOn || null, notes: d.notes.trim(),
      orderId: link ? link.order.id : null, orderNumber: link ? orderNo(link.order) : null, orderLine: link ? link.line : null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
  return key;
}

/** Saves changes to a piece. The serial (its key) can't change; delete and re-add instead. */
export function updatePiece(key: string, d: Omit<PieceDraft, 'serial'>) {
  return updateDoc(doc(db, 'pieces', key), {
    productId: d.productId, productName: d.productName, variant: d.variant.trim(), supplier: d.supplier.trim(),
    purchasedOn: d.purchasedOn, shippedOn: d.shippedOn || null, notes: d.notes.trim(), updatedAt: serverTimestamp(),
  });
}

/** Ties a piece to one line of an order, or frees it (order null). */
export function linkPiece(key: string, link: { order: Order; line: number } | null) {
  return updateDoc(doc(db, 'pieces', key), {
    orderId: link ? link.order.id : null,
    orderNumber: link ? orderNo(link.order) : null,
    orderLine: link ? link.line : null,
    ...(link ? {} : { shippedOn: null }),
    updatedAt: serverTimestamp(),
  });
}

/** Each order line with the pieces assigned to it and how many it still needs. */
export function orderSlots(order: Order, pieces: Piece[]) {
  const mine = pieces.filter(p => p.orderId === order.id);
  return (order.items || []).map((item, line) => {
    const assigned = mine.filter(p => p.orderLine === line);
    return { item, line, assigned, missing: Math.max(0, (item.qty || 1) - assigned.length) };
  });
}
