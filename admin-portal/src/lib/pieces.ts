import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Order, Piece, Product } from '../types';
import { orderNo } from './orders';
import { adminApi } from './api';

/**
 * Refreshes the owner's copy in the customer portal (server/sync.js) after a
 * piece changes here. Best effort: the registry write has already succeeded.
 */
const syncPortal = (key: string) => adminApi(`/pieces/${encodeURIComponent(key)}/sync`, {}).catch(e => console.warn('portal copy not updated', key, e));

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

export type PieceState = 'making' | 'stock' | 'assigned' | 'shipped';
/** Still with the supplier: ordered, not received yet. Pieces from before receivedOn existed count as received. */
export const isMaking = (p: Piece) => p.receivedOn === null && !p.shippedOn;
export const pieceState = (p: Piece): PieceState => p.shippedOn ? 'shipped' : isMaking(p) ? 'making' : p.orderId ? 'assigned' : 'stock';
export const STATE_LABEL: Record<PieceState, string> = { making: 'With maker', stock: 'In stock', assigned: 'Ready for order', shipped: 'Shipped' };
export const STATE_CHIP: Record<PieceState, string> = { making: 'chip--warn', stock: 'chip--muted', assigned: 'chip--ice', shipped: 'chip--good' };

/** When a piece being made should arrive, from its order date and the supplier's lead time. */
export function dueOn(p: Piece, leadDays?: number | null): string | null {
  if (!isMaking(p) || !leadDays || !DATE.test(p.purchasedOn)) return null;
  const [y, m, d] = p.purchasedOn.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + leadDays));
  return t.toISOString().slice(0, 10);
}

export interface PieceDraft {
  serial: string; productId: string; productName: string; size: string; colour: string;
  supplierId: string; supplier: string; supplierOrderNo: string;
  /** Supplier order date. */
  purchasedOn: string;
  /** '' while it's still being made. */
  receivedOn: string; shippedOn: string; notes: string;
}

export function draftError(d: PieceDraft): string {
  if (!serialKey(d.serial)) return 'Add the serial number.';
  if (!d.productId) return 'Pick the product.';
  if (!DATE.test(d.purchasedOn)) return 'Add the date it was ordered from the supplier.';
  if (d.receivedOn && !DATE.test(d.receivedOn)) return 'The received date doesn’t look right.';
  if (d.receivedOn && d.receivedOn < d.purchasedOn) return 'It can’t arrive before it was ordered.';
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
      ...variantFields(d), ...supplierFields(d), purchasedOn: d.purchasedOn,
      receivedOn: d.receivedOn || null, shippedOn: d.shippedOn || null, notes: d.notes.trim(),
      orderId: link ? link.order.id : null, orderNumber: link ? orderNo(link.order) : null, orderLine: link ? link.line : null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
  if (link) await syncPortal(key);
  return key;
}

/** Saves changes to a piece. The serial (its key) can't change; delete and re-add instead. */
export async function updatePiece(key: string, d: Omit<PieceDraft, 'serial'>) {
  await updateDoc(doc(db, 'pieces', key), {
    productId: d.productId, productName: d.productName, ...variantFields(d), ...supplierFields(d),
    purchasedOn: d.purchasedOn, receivedOn: d.receivedOn || null, shippedOn: d.shippedOn || null, notes: d.notes.trim(), updatedAt: serverTimestamp(),
  });
  await syncPortal(key);
}

const variantFields = (d: Pick<PieceDraft, 'size' | 'colour'>) => ({ size: d.size.trim(), colour: d.colour.trim(), variant: joinVariant(d.size.trim(), d.colour.trim()) });
const supplierFields = (d: Pick<PieceDraft, 'supplierId' | 'supplier' | 'supplierOrderNo'>) => ({ supplierId: d.supplierId || null, supplier: d.supplier.trim(), supplierOrderNo: d.supplierOrderNo.trim() });

/** The piece has arrived from the supplier. */
export function markReceived(key: string, on = today()) {
  return updateDoc(doc(db, 'pieces', key), { receivedOn: on, updatedAt: serverTimestamp() });
}

/** Ties a piece to one line of an order, or frees it (order null). */
export async function linkPiece(key: string, link: { order: Order; line: number } | null) {
  await updateDoc(doc(db, 'pieces', key), {
    orderId: link ? link.order.id : null,
    orderNumber: link ? orderNo(link.order) : null,
    orderLine: link ? link.line : null,
    ...(link ? {} : { shippedOn: null }),
    updatedAt: serverTimestamp(),
  });
  await syncPortal(key);
}

/** Each order line with the pieces assigned to it and how many it still needs. */
export function orderSlots(order: Order, pieces: Piece[]) {
  const mine = pieces.filter(p => p.orderId === order.id);
  return (order.items || []).map((item, line) => {
    const assigned = mine.filter(p => p.orderLine === line);
    return { item, line, assigned, missing: Math.max(0, (item.qty || 1) - assigned.length) };
  });
}

export type PieceStage = 'none' | 'partial' | 'making' | 'ready';
/**
 * Where an order's pieces are, for orders not shipped yet: none assigned, some
 * assigned, all assigned but some still with the maker, or all in hand.
 */
export function orderPieceStage(order: Order, pieces: Piece[]) {
  const slots = orderSlots(order, pieces);
  const assigned = slots.flatMap(s => s.assigned);
  const missing = slots.reduce((a, s) => a + s.missing, 0);
  const making = assigned.filter(isMaking).length;
  const stage: PieceStage = !assigned.length ? 'none' : missing ? 'partial' : making ? 'making' : 'ready';
  return { stage, assigned: assigned.length, missing, making, total: assigned.length + missing };
}

export function stageLabel(s: ReturnType<typeof orderPieceStage>): { text: string; chip: string } {
  if (s.stage === 'none') return { text: 'No pieces ordered', chip: 'chip--muted' };
  if (s.stage === 'ready') return { text: 'Pieces ready', chip: 'chip--good' };
  if (s.stage === 'making') return { text: s.making === s.total ? 'Pieces ordered' : `${s.making} of ${s.total} with maker`, chip: 'chip--warn' };
  return { text: `${s.assigned} of ${s.total} pieces ordered`, chip: 'chip--warn' };
}

// ---- Product and size pickers. The catalogue keeps some sizes as separate
// product documents with the same name (one per width), so the piece form
// lists each name once and offers the sizes and colours of all of them.

export interface SizeOption { productId: string; label: string }

/** One entry per product name, in catalogue order, with every document of that name. */
export function productGroups(products: Product[]) {
  const m = new Map<string, Product[]>();
  for (const p of products) {
    const k = p.name.trim();
    m.set(k, [...(m.get(k) || []), p]);
  }
  return [...m.entries()].map(([name, docs]) => ({ name, docs }));
}

/** Width and length combinations across a product's documents, each tied to the document it lives on. */
export function sizeOptions(docs: Product[]): SizeOption[] {
  const out: SizeOption[] = [];
  const seen = new Set<string>();
  const add = (productId: string, parts: (string | null | undefined)[]) => {
    const label = parts.filter(Boolean).join(' · ');
    if (!label || seen.has(label)) return;
    seen.add(label); out.push({ productId, label });
  };
  for (const p of docs) {
    if (p.widths?.length) {
      for (const w of p.widths) {
        const lens = (w.variants || []).map(v => v.length).filter(Boolean);
        if (lens.length) lens.forEach(l => add(p.id, [w.width, l])); else add(p.id, [w.width]);
      }
    } else {
      const lens = (p.variants || []).map(v => v.length).filter(Boolean);
      if (lens.length) lens.forEach(l => add(p.id, [p.width, l])); else add(p.id, [p.width]);
    }
  }
  return out;
}

export const colourOptions = (docs: Product[]) => [...new Set(docs.flatMap(p => p.col || []))];

/** "12mm · 20in" + "White gold" → the variant text stored on the piece. */
export const joinVariant = (size: string, colour: string) => [size, colour].filter(Boolean).join(' · ');

/**
 * New serial: AXIA plus 6 letters and digits, 10 characters in all. Leaves out
 * 0, O, 1 and I so a serial read off a card can't be mistyped. Never repeats
 * one already in `taken` (registry keys).
 */
const SERIAL_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newSerial(taken: Set<string>): string {
  for (;;) {
    const r = crypto.getRandomValues(new Uint32Array(6));
    let s = 'AXIA';
    // at least one letter and one digit, so it reads as a mix
    for (const n of r) s += SERIAL_CHARS[n % SERIAL_CHARS.length];
    const tail = s.slice(4);
    if (!/[A-Z]/.test(tail) || !/[0-9]/.test(tail)) continue;
    if (!taken.has(s)) return s;
  }
}
