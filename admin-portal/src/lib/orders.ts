import type { Order, OrderItem } from '../types';

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting payment', paid: 'New', in_progress: 'In progress', shipped: 'Shipped',
  fulfilled: 'Fulfilled', refunded: 'Refunded', cancelled: 'Cancelled',
};

/** What an admin can move an order to, and the email each one sends. */
export const STATUS_OPTIONS: { key: string; label: string; email: string | null; hint: string }[] = [
  { key: 'paid', label: 'New', email: null, hint: 'Paid, not started yet.' },
  { key: 'in_progress', label: 'In progress', email: '“Your piece is being made”', hint: 'Being made.' },
  { key: 'shipped', label: 'Shipped', email: '“Your order is on its way”, with tracking', hint: 'Sent to the customer.' },
  { key: 'fulfilled', label: 'Fulfilled', email: '“Delivered. Wear it well.”', hint: 'Delivered.' },
  { key: 'cancelled', label: 'Cancelled', email: '“Your order has been cancelled”', hint: 'Refund the payment in Stripe separately.' },
];

export function statusClass(s?: string) {
  return s === 'fulfilled' || s === 'shipped' ? 'chip--good' : s === 'refunded' || s === 'cancelled' ? 'chip--bad' : s === 'in_progress' ? 'chip--ice' : 'chip--warn';
}

/** Orders that count as sales (paid and not cancelled or refunded). */
export const isSale = (o: Order) => !!o.status && !['pending', 'cancelled', 'refunded'].includes(o.status);

export const itemCount = (o: Order) => (o.items || []).reduce((a, i) => a + (i.qty || 1), 0);
export const hasEngraving = (o: Order) => (o.items || []).some(i => i.engraving);
export const orderNo = (o: Order) => o.orderNumber || o.id.slice(-6).toUpperCase();

export interface ProductSales { units: number; revenueAUD: number; orders: number; last?: Date; lines: { order: Order; item: OrderItem }[] }

/** Units, revenue and order lines per product id, from sale orders only. */
export function salesByProduct(orders: Order[]): Map<string, ProductSales> {
  const m = new Map<string, ProductSales>();
  for (const o of orders) {
    if (!isSale(o)) continue;
    const seen = new Set<string>();
    for (const item of o.items || []) {
      if (!item.id) continue;
      const s = m.get(item.id) || { units: 0, revenueAUD: 0, orders: 0, lines: [] };
      s.units += item.qty || 1;
      s.revenueAUD += (item.priceAUD || 0) * (item.qty || 1);
      if (!seen.has(item.id)) { s.orders += 1; seen.add(item.id); }
      const d = o.createdAt?.toDate();
      if (d && (!s.last || d > s.last)) s.last = d;
      s.lines.push({ order: o, item });
      m.set(item.id, s);
    }
  }
  return m;
}
