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

/**
 * Orders mentioned in free text such as an inquiry: "#XYZQWE", "xyzqwe", "AXIA-XYZQWE",
 * "order no. xyz qwe" or a full Stripe session id. Everything but letters and digits
 * is stripped and the result compared with each order's 6-character number.
 */
export function findOrderRefs(texts: (string | undefined)[], orders: Order[]): Order[] {
  const byNo = new Map(orders.map(o => [orderNo(o).toUpperCase(), o]));
  const found = new Map<string, Order>();
  const take = (cand: string) => {
    const c = cand.toUpperCase();
    const o = byNo.get(c) || (c.length > 6 ? byNo.get(c.slice(-6)) : undefined);
    if (o) found.set(o.id, o);
  };
  for (const t of texts) {
    if (!t) continue;
    // whole field squashed together ("xyz qwe", "#XYZ-QWE"), then word by word
    if (t.length <= 40) take(t.replace(/[^A-Za-z0-9]/g, '').replace(/^(AXIA|ORDER|NO)+/i, ''));
    const words = t.split(/[^A-Za-z0-9]+/).filter(Boolean);
    words.forEach((w, i) => {
      if (w.length >= 6) take(w.replace(/^(AXIA|ORDER|NO)+/i, ''));
      // a number typed with a space or dash in it ("XYZ QWE", "XY-ZQ-WE")
      const two = w + (words[i + 1] || ''), three = two + (words[i + 2] || '');
      if (two.length === 6) take(two);
      else if (three.length === 6) take(three);
    });
    for (const o of orders) if (t.includes(o.id)) found.set(o.id, o);
  }
  return [...found.values()];
}
