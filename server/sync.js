// Customer-safe copies of private records, for the customer portal (/portal).
//
// orders/{id} is admin-only (firestore.rules): it holds Stripe ids, the email
// log and who changed what. Each time an order changes, syncOrder() writes the
// part its customer may see to accounts/{uid}/orders/{id}, which only that
// customer can read, and the portal listens to it live. Customers without an
// account (no `uid` on customers/{email}) are skipped; their orders are copied
// when they claim one (syncCustomerOrders, called from ensureAccount).
import { FieldValue } from 'firebase-admin/firestore';
import { db, stripe } from './services.js';
import { customerId } from './orders.js';

const ms = t => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);

/** The fields of an order its customer sees. Nothing else leaves orders/{id}. */
export function customerOrder(o) {
  const a = (o.shipping && o.shipping.address) || null;
  const tracking = o.tracking && (o.tracking.number || o.tracking.url || o.tracking.carrier)
    ? { carrier: o.tracking.carrier || '', number: o.tracking.number || '', url: /^https:\/\//.test(o.tracking.url || '') ? o.tracking.url : '' }
    : null;
  return {
    orderNumber: o.orderNumber || '',
    status: o.status || 'pending',
    placedAt: ms(o.createdAt),
    items: (o.items || []).map(i => ({
      id: i.id || '', name: i.name || '', qty: i.qty || 1, priceAUD: Number(i.priceAUD) || 0,
      options: (i.options || '').replace(/ · Engraved: “.*”$/, ''), engraving: i.engraving || '', image: i.image || '',
    })),
    gift: o.gift ? { name: o.gift.name || '', length: o.gift.length || '' } : null,
    subtotalAUD: Number(o.subtotalAUD) || 0,
    discountAUD: Number(o.discountAUD) || 0,
    promotionCode: o.promotionCode || '',
    totalAUD: Number(o.totalAUD) || 0,
    shipping: {
      name: (o.shipping && o.shipping.name) || '', method: (o.shipping && o.shipping.method) || '',
      amountAUD: Number(o.shipping && o.shipping.amountAUD) || 0,
      address: a ? { line1: a.line1 || '', line2: a.line2 || '', city: a.city || '', state: a.state || '', postal_code: a.postal_code || '', country: a.country || '' } : null,
    },
    tracking,
    // Each step and when. A note is shown only if it went to them by email.
    timeline: (o.statusHistory || []).map(h => ({
      status: h.status, at: ms(h.at), ...(h.emailed && h.note ? { note: h.note } : {}),
    })),
    receiptUrl: (o.stripe && /^https:\/\//.test(o.stripe.receiptUrl || '') && o.stripe.receiptUrl) || '',
  };
}

/** The account uid for a customer email, or null. */
export async function uidFor(email) {
  const id = customerId(email);
  if (!id || id.includes('/')) return null;
  const snap = await db.collection('customers').doc(id).get();
  const uid = snap.exists && snap.get('uid');
  return typeof uid === 'string' && uid ? uid : null;
}

/** Writes (or refreshes) the customer's copy of one order. Never throws: the portal copy must not break an order flow. */
export async function syncOrder(orderId, { uid } = {}) {
  try {
    const snap = await db.collection('orders').doc(orderId).get();
    if (!snap.exists) return false;
    const o = snap.data();
    const owner = uid || await uidFor(o.customer && o.customer.email);
    if (!owner) return false;
    await db.collection('accounts').doc(owner).collection('orders').doc(orderId)
      .set({ ...customerOrder(o), syncedAt: FieldValue.serverTimestamp() });
    return true;
  } catch (err) {
    console.error('sync: order copy failed', orderId, err);
    return false;
  }
}

/** Copies every order placed with this email into the account (on claim or first sign-in). */
export async function syncCustomerOrders(uid, email) {
  const id = customerId(email);
  // Orders carry customerId; the customer record's orderIds also covers older ones.
  const [byField, cust] = await Promise.all([
    db.collection('orders').where('customerId', '==', id).select().get(),
    db.collection('customers').doc(id).get(),
  ]);
  const ids = new Set([...byField.docs.map(d => d.id), ...((cust.exists && cust.get('orderIds')) || [])]);
  await Promise.all([...ids].map(o => syncOrder(o, { uid })));
  return ids.size;
}

/**
 * The Stripe receipt link for an order's payment. Looked up from the charge the
 * first time and saved on the order (stripe.receiptUrl, stripe.card).
 * Returns { url, card } or throws an Error with a `status`.
 */
export async function stripeReceipt(ref) {
  const fail = (status, message) => Object.assign(new Error(message), { status });
  const snap = await ref.get();
  if (!snap.exists) throw fail(404, 'Order not found');
  const s = snap.get('stripe') || {};
  if (s.receiptUrl) return { url: s.receiptUrl, card: s.card || null };
  if (!s.paymentIntent) throw fail(404, 'This order has no Stripe payment yet');
  if (!stripe) throw fail(503, 'Stripe is not configured');
  const pi = await stripe.paymentIntents.retrieve(s.paymentIntent, { expand: ['latest_charge'] });
  const charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  if (!charge || !charge.receipt_url) throw fail(404, 'Stripe has no receipt for this payment yet');
  const c = charge.payment_method_details && charge.payment_method_details.card;
  const card = c ? { brand: c.brand || '', last4: c.last4 || '' } : null;
  await ref.update({ 'stripe.receiptUrl': charge.receipt_url, 'stripe.card': card });
  await syncOrder(ref.id);
  return { url: charge.receipt_url, card };
}
