// Customer-safe copies of private records, for the customer portal (/portal).
//
// orders/{id} is admin-only (firestore.rules): it holds Stripe ids, the email
// log and who changed what. Each time an order changes, syncOrder() writes the
// part its customer may see to accounts/{uid}/orders/{id}, which only that
// customer can read, and the portal listens to it live. Customers without an
// account (no `uid` on customers/{email}) are skipped; their orders are copied
// when they claim one (syncCustomerOrders, called from ensureAccount).
//
// Pieces work the same way: pieces/{key} is admin-only (supplier, notes), and
// syncPiece() writes the owner's copy to accounts/{uid}/pieces/{key}. The owner
// is the account of the paid order the piece went out in, or whoever it was
// transferred to since (`ownerUid`, server/transfers.js). The private record
// remembers where its copy lives (`portalUid`), so a piece that is unassigned,
// moved to another order or whose order is cancelled is taken back out.
//
// Support conversations too: messages/{id} is admin-only (the Inbox), and a
// message sent from the portal carries the sender's `uid`. syncThread() writes
// their side of it to accounts/{uid}/threads/{id}: what they wrote and what the
// team replied, never who on the team replied or the Resend ids.
//
// And returns: returns/{id} (server/returns.js) is admin-read-only, and
// syncReturn() writes the buyer's copy to accounts/{uid}/returns/{id}: the
// pieces, the step it's at, the return label and the refund, never internal
// notes, who did what or Stripe ids.
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

/** Orders in these states haven't sold their pieces (same rule as /genuine, server/genuine.js). */
const NOT_SOLD = ['pending', 'cancelled', 'refunded'];
const sydneyDate = d => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

/** The owner of a piece whose holder was erased for a privacy request (server/deletes.js): nobody's portal. */
export const ERASED_OWNER = '(erased)';

/** Transferred to someone else (server/transfers.js) from the order it's still in. */
export const passedOn = piece => typeof piece.ownerUid === 'string' && !!piece.ownerUid && (piece.ownerOrderId || null) === (piece.orderId || null);

/** The fields of a piece its owner sees. Supplier, supplier order, received date and notes stay private. */
export function customerPiece(piece, order, product) {
  const placed = order && order.createdAt && typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : null;
  const img = product && ((product.images && product.images[0])
    || Object.values(product.imagesByColor || {}).find(a => a && a.length)?.[0]
    || (product.widths || []).find(w => w.image)?.image) || '';
  // Passed on from someone else: the original order (its number, date, page) is the buyer's, not theirs.
  const moved = passedOn(piece);
  const t = piece.transfer && piece.transfer.id ? piece.transfer : null;
  return {
    serial: piece.serial || '',
    productId: piece.productId || '',
    productName: piece.productName || '',
    variant: piece.variant || '',
    image: img,
    purchasedOn: moved ? null : placed ? sydneyDate(placed) : null,
    orderId: moved ? null : piece.orderId || null,
    orderNumber: moved ? '' : (order && order.orderNumber) || piece.orderNumber || '',
    shippedOn: piece.shippedOn || null,
    transferredOn: moved ? piece.transferredOn || null : null,
    // A transfer they've started and the recipient hasn't answered yet.
    transfer: t ? { id: t.id, toEmail: t.toEmail || '', expiresAt: ms(t.expiresAt) } : null,
  };
}

/** Writes, moves or removes the owner's copy of one piece. Never throws. */
export async function syncPiece(key) {
  try {
    const ref = db.collection('pieces').doc(key);
    const snap = await ref.get();
    const piece = snap.exists ? snap.data() : null;
    const order = piece && piece.orderId ? await db.collection('orders').doc(piece.orderId).get() : null;
    const o = order && order.exists ? order.data() : null;
    const sold = o && !NOT_SOLD.includes(o.status || 'pending');
    // A piece passed on (server/transfers.js) belongs to its new owner, as long as the sale stands.
    // (It only counts for the order it was passed on from: re-assigned to another order, it's that buyer's.)
    const owner = !sold ? null
      : passedOn(piece) ? (piece.ownerUid === ERASED_OWNER ? null : piece.ownerUid)
      : await uidFor(o.customer && o.customer.email);
    const before = piece && typeof piece.portalUid === 'string' ? piece.portalUid : null;
    if (before && before !== owner) await db.collection('accounts').doc(before).collection('pieces').doc(key).delete();
    if (owner) {
      const product = piece.productId ? await db.collection('products').doc(piece.productId).get() : null;
      await db.collection('accounts').doc(owner).collection('pieces').doc(key)
        .set({ ...customerPiece(piece, o, product && product.exists ? product.data() : null), syncedAt: FieldValue.serverTimestamp() });
    }
    if (snap.exists && before !== owner) await ref.update({ portalUid: owner || null });
    return !!owner;
  } catch (err) {
    console.error('sync: piece copy failed', key, err);
    return false;
  }
}

/** Every piece assigned to an order, after the order changes. */
export async function syncOrderPieces(orderId) {
  const snap = await db.collection('pieces').where('orderId', '==', orderId).select().get();
  await Promise.all(snap.docs.map(d => syncPiece(d.id)));
}

/** Writes (or refreshes) the customer's copy of one order. Never throws: the portal copy must not break an order flow. */
export async function syncOrder(orderId, { uid } = {}) {
  try {
    const snap = await db.collection('orders').doc(orderId).get();
    if (!snap.exists) return false;
    const o = snap.data();
    const owner = uid || await uidFor(o.customer && o.customer.email);
    if (!owner) { await syncOrderPieces(orderId); return false; }
    await db.collection('accounts').doc(owner).collection('orders').doc(orderId)
      .set({ ...customerOrder(o), syncedAt: FieldValue.serverTimestamp() });
    await syncOrderPieces(orderId);
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
  const returns = await db.collection('returns').where('customerEmail', '==', id).select().get();
  await Promise.all(returns.docs.map(d => syncReturn(d.id, { uid })));
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

/** Their side of a support conversation, oldest message first. */
export function customerThread(m) {
  const msgs = [
    { from: 'you', body: m.message || '', at: ms(m.createdAt) },
    ...(m.customerReplies || []).map(r => ({ from: 'you', body: r.body || '', at: ms(r.at) })),
    ...(m.replies || []).filter(r => r.body).map(r => ({ from: 'axia', body: r.body, at: ms(r.sentAt) })),
  ].sort((a, b) => (a.at || 0) - (b.at || 0));
  const last = msgs[msgs.length - 1];
  const lastAxia = [...msgs].reverse().find(x => x.from === 'axia');
  const readAt = ms(m.customerReadAt) || 0;
  return {
    subject: m.subject || m.topic || 'Message',
    topic: m.topic || 'Support',
    orderNumber: m.order || '',
    orderId: m.orderId || null,
    messages: msgs,
    lastAt: (last && last.at) || null,
    // Waiting on the team until the newest message is theirs.
    state: last && last.from === 'axia' ? 'replied' : 'open',
    // Closed from the admin Inbox. Their next message reopens it.
    closedAt: ms(m.closedAt),
    unread: !!(lastAxia && (lastAxia.at || 0) > readAt),
  };
}

/** Writes the customer's copy of one portal conversation. Never throws. */
export async function syncThread(messageId) {
  try {
    const snap = await db.collection('messages').doc(messageId).get();
    if (!snap.exists) return false;
    const m = snap.data();
    if (typeof m.uid !== 'string' || !m.uid) return false;
    await db.collection('accounts').doc(m.uid).collection('threads').doc(messageId)
      .set({ ...customerThread(m), syncedAt: FieldValue.serverTimestamp() });
    return true;
  } catch (err) {
    console.error('sync: thread copy failed', messageId, err);
    return false;
  }
}

const httpsOnly = u => (/^https:\/\//.test(u || '') ? u : '');

/** The buyer's side of a return. Internal notes, who did what and Stripe ids stay private. */
export function customerReturn(r, { returnTo = '' } = {}) {
  const label = r.label && (r.label.number || r.label.url)
    ? { carrier: r.label.carrier || '', number: r.label.number || '', url: httpsOnly(r.label.url) }
    : null;
  return {
    number: r.number || '',
    orderId: r.orderId || null,
    orderNumber: r.orderNumber || '',
    status: r.status || 'requested',
    reason: r.reason || '',
    note: r.customerNote || '',
    full: !!r.full,
    items: (r.items || []).map(i => ({ key: i.key || null, serial: i.serial || '', productName: i.productName || '', variant: i.variant || '' })),
    label,
    // The end goal: a refund, or an exchange for what they asked for.
    outcome: r.outcome === 'exchange' ? 'exchange' : 'refund',
    wanted: (r.outcome === 'exchange' && r.exchange && r.exchange.wanted) || '',
    refund: r.refund ? { amountAUD: Number(r.refund.amountAUD) || 0, at: ms(r.refund.at) } : null,
    replacement: r.replacement && (r.replacement.number || r.replacement.url) ? {
      carrier: r.replacement.carrier || '', number: r.replacement.number || '', url: httpsOnly(r.replacement.url),
      pieces: (r.replacement.pieces || []).map(p => ({ serial: p.serial || '', productName: p.productName || '', variant: p.variant || '' })),
    } : null,
    // Each step and when. A note is shown only if it went to them by email.
    timeline: (r.history || []).map(h => ({ status: h.status, at: ms(h.at), ...(h.emailed && h.note ? { note: h.note } : {}) })),
    createdAt: ms(r.createdAt),
    // Where the parcel goes, for the return slip they print.
    returnTo: r.status === 'label_created' ? returnTo : '',
  };
}

/** The address returns go to (internal/returns, edited under Returns in admin). */
export async function returnAddress() {
  const snap = await db.collection('internal').doc('returns').get();
  return (snap.exists && typeof snap.get('address') === 'string' && snap.get('address').trim()) || '';
}

/** Writes the buyer's copy of one return, if they have an account. Never throws. */
export async function syncReturn(id, { uid } = {}) {
  try {
    const snap = await db.collection('returns').doc(id).get();
    if (!snap.exists) return false;
    const r = snap.data();
    const owner = uid || await uidFor(r.customerEmail);
    if (!owner) return false;
    await db.collection('accounts').doc(owner).collection('returns').doc(id)
      .set({ ...customerReturn(r, { returnTo: await returnAddress() }), syncedAt: FieldValue.serverTimestamp() });
    return true;
  } catch (err) {
    console.error('sync: return copy failed', id, err);
    return false;
  }
}
