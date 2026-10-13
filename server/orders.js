// Shared helpers for order documents (orders/{sessionId}).
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/** One line of the order's email log: what was sent, to whom, and Resend's email id. */
export function emailEntry(type, to, subject, sent) {
  return { type, to, subject, resendId: (sent && sent.id) || null, status: sent ? 'sent' : 'skipped', sentAt: Timestamp.now() };
}

/** One line of the order's status history. */
export function historyEntry(status, by, extra = {}) {
  return { status, at: Timestamp.now(), by, ...extra };
}

export const push = entry => FieldValue.arrayUnion(entry);

/** Customer records are keyed by lower-cased email, so one person is one record. */
export const customerId = email => String(email || '').trim().toLowerCase();

/**
 * Creates or updates the customer for an order: latest name, phone and address,
 * first and last order dates, and the order id. Safe to repeat for the same order.
 */
export async function upsertCustomer(db, orderId, order, placedAt = Timestamp.now()) {
  const id = customerId(order.customer && order.customer.email);
  if (!id || id.includes('/')) return null;
  const ref = db.collection('customers').doc(id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : {};
    const first = prev.firstOrderAt && prev.firstOrderAt.toMillis() <= placedAt.toMillis() ? prev.firstOrderAt : placedAt;
    const newer = !prev.lastOrderAt || prev.lastOrderAt.toMillis() <= placedAt.toMillis();
    const c = order.customer || {};
    tx.set(ref, {
      email: id,
      name: (newer && c.name) || prev.name || c.name || '',
      phone: (newer && c.phone) || prev.phone || c.phone || '',
      address: (newer && order.shipping && order.shipping.address) || prev.address || null,
      orderIds: FieldValue.arrayUnion(orderId),
      firstOrderAt: first,
      lastOrderAt: newer ? placedAt : prev.lastOrderAt,
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp(), notes: '' }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return id;
}
