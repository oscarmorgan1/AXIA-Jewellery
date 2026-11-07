import type { Order, Piece, Return, ReturnStatus } from '../types';

/** The tracker, in order. Closed is the final step: the order is cancelled (or back where it was, for a partial return). */
export const RETURN_STEPS: { key: ReturnStatus; label: string }[] = [
  { key: 'requested', label: 'Return started' },
  { key: 'label_created', label: 'Label created' },
  { key: 'received', label: 'Product received' },
  { key: 'refunded', label: 'Payment refunded' },
  { key: 'closed', label: 'Cancelled' },
];

export const RETURN_LABEL: Record<string, string> = {
  requested: 'Requested', label_created: 'Label created', received: 'Received', refunded: 'Refunded',
  closed: 'Closed', declined: 'Declined', withdrawn: 'Withdrawn',
};

export const OPEN_RETURN: ReturnStatus[] = ['requested', 'label_created', 'received', 'refunded'];
export const isOpen = (r: Return) => OPEN_RETURN.includes(r.status);

export function returnChip(s: string) {
  return s === 'closed' ? 'chip--good' : s === 'declined' || s === 'withdrawn' ? 'chip--muted' : s === 'requested' ? 'chip--warn' : 'chip--ice';
}

/** Reasons offered when the team opens a return (same as the portal's, server/returns.js). */
export const REASONS: { key: string; label: string }[] = [
  { key: 'fit', label: 'It doesn’t fit' },
  { key: 'mind', label: 'Changed my mind' },
  { key: 'faulty', label: 'Faulty or damaged' },
  { key: 'other', label: 'Something else' },
];

/** Order statuses a return can start from. */
export const RETURNABLE = ['shipped', 'fulfilled'];

/** The tracker step a return is at. Declined or withdrawn: the furthest step it reached first. */
export function stepIndex(r: Return) {
  const at = RETURN_STEPS.findIndex(s => s.key === r.status);
  if (at >= 0) return at;
  return Math.max(0, ...(r.history || []).map(h => RETURN_STEPS.findIndex(s => s.key === h.status)));
}

/** When a step happened (its latest entry in the return's history). */
export function stepAt(r: Return, key: string) {
  const hits = (r.history || []).filter(h => h.status === key && h.at);
  return hits.length ? hits[hits.length - 1].at!.toDate() : null;
}

/** One pick-able unit of an order: a registry piece, or a unit without a serial. */
export interface ReturnUnit { id: string; line: number; key: string | null; serial: string; name: string; variant: string; engraving: string; busy: string }

/** Every unit of an order that could go into a return, line by line. */
export function returnUnits(order: Order, pieces: Piece[]): ReturnUnit[] {
  const out: ReturnUnit[] = [];
  (order.items || []).forEach((item, line) => {
    const variant = [item.width, item.length, item.colour].filter(Boolean).join(' · ') || item.options || '';
    const assigned = pieces.filter(p => p.orderId === order.id && p.orderLine === line);
    const back = Number(order.returnedQty?.[String(line)]) || 0;
    assigned.forEach(p => out.push({
      id: p.key, line, key: p.key, serial: p.serial, name: item.name, variant: p.variant || variant, engraving: item.engraving || '',
      busy: p.returnId ? 'Already in a return' : p.transfer?.id ? 'Transfer waiting' : '',
    }));
    const left = Math.max(0, (item.qty || 1) - assigned.length - back);
    for (let n = 0; n < left; n++) out.push({ id: `${line}-${n}`, line, key: null, serial: '', name: item.name, variant, engraving: item.engraving || '', busy: '' });
  });
  return out;
}

/**
 * What to refund for a return: the whole order (with shipping) when everything
 * comes back, otherwise the returned lines less their share of any discount.
 * Never more than is left unrefunded.
 */
/** Refunded so far: what Stripe reports, or what returns have recorded, whichever is more (as server/returns.js). */
export const refundedSoFar = (o: Order) => Math.max(o.stripe?.refundedAUD || 0, o.returnsRefundedAUD || 0);
export const leftToRefund = (o: Order) => Math.max(0, Math.round(((o.totalAUD || 0) - refundedSoFar(o)) * 100) / 100);

export function suggestedRefund(order: Order, r: Return) {
  const left = leftToRefund(order);
  let amount: number;
  if (r.full) amount = left;
  else {
    const lines = r.items.reduce((a, i) => a + (order.items?.[i.line]?.priceAUD || 0), 0);
    const share = order.subtotalAUD ? 1 - (order.discountAUD || 0) / order.subtotalAUD : 1;
    amount = lines * share;
  }
  return Math.round(Math.min(amount, left) * 100) / 100;
}
