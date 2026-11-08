// POST /api/stripe/webhook  Stripe tells us about paid checkouts and refunds.
// Paid orders are written to Firestore `orders/{sessionId}` (admins only, see
// firestore.rules) and the buyer gets a confirmation email through Resend.
//
// Stripe retries anything that doesn't get a 2xx, so every step is safe to
// repeat: the order document is keyed by the session id and the email is only
// marked sent once Resend accepts it.
import express from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, stripe } from './services.js';
import { orderNumber } from './checkout.js';
import { confirmationEmail, sendEmail } from './email.js';
import { emailEntry, historyEntry, push, upsertCustomer, customerId } from './orders.js';
import { sendAccountInvite } from './account.js';
import { syncOrder } from './sync.js';
import { wasDeleted } from './deletes.js';

const cents = n => (n || 0) / 100;

async function buildOrder(sessionId) {
  const s = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items.data.price.product', 'shipping_cost.shipping_rate', 'discounts.promotion_code'],
  });
  const cd = s.customer_details || {};
  const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
  const rate = s.shipping_cost && s.shipping_cost.shipping_rate;
  const promoObj = (s.discounts || []).map(d => d.promotion_code).find(pc => pc && typeof pc === 'object') || null;
  const items = (s.line_items ? s.line_items.data : []).map(li => {
    const product = (li.price && typeof li.price.product === 'object' && li.price.product) || {};
    const m = product.metadata || {};
    return {
      id: m.productId || '',
      name: product.name || li.description,
      options: product.description || '',
      width: m.width || '', length: m.length || '', colour: m.colour || '', engraving: m.engraving || '',
      qty: li.quantity || 1,
      priceAUD: cents(li.price && li.price.unit_amount),
      image: (product.images || [])[0] || '',
    };
  });
  const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
  return {
    orderNumber: orderNumber(s.id),
    status: paid ? 'paid' : 'pending',
    customer: { name: cd.name || ship.name || '', email: cd.email || '', phone: cd.phone || '' },
    shipping: {
      name: ship.name || '',
      address: ship.address || null,
      method: (rate && typeof rate === 'object' && rate.display_name) || '',
      amountAUD: cents(s.total_details && s.total_details.amount_shipping),
    },
    items,
    gift: s.metadata && s.metadata.gift ? { id: s.metadata.gift, name: s.metadata.giftName || '', length: s.metadata.giftLength || '' } : null,
    subtotalAUD: cents(s.amount_subtotal),
    discountAUD: cents(s.total_details && s.total_details.amount_discount),
    promotionCode: (promoObj && promoObj.code) || '',
    promotionCodeId: (promoObj && promoObj.id) || '',
    totalAUD: cents(s.amount_total),
    currency: (s.currency || 'aud').toUpperCase(),
    stripe: {
      sessionId: s.id,
      paymentIntent: typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent && s.payment_intent.id) || '',
      livemode: !!s.livemode,
    },
  };
}

async function recordCheckout(sessionId, siteUrl) {
  // Deleted in the admin portal (usually a test order): a re-sent event mustn't bring it back.
  if (await wasDeleted(sessionId)) return;
  const order = await buildOrder(sessionId);
  const ref = db.collection('orders').doc(sessionId);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.create({
      ...order, customerId: customerId(order.customer.email), siteUrl, emails: [], statusHistory: [historyEntry(order.status, 'stripe')],
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    // A later event (e.g. a delayed payment clearing) only moves the status forward.
    const prev = existing.data().status;
    if (prev === 'pending' && order.status === 'paid') {
      await ref.update({ status: 'paid', statusHistory: push(historyEntry('paid', 'stripe')), updatedAt: FieldValue.serverTimestamp() });
    }
  }
  // Every order creates or updates its customer record (repeat events are harmless).
  await upsertCustomer(db, sessionId, order, (existing.exists && existing.data().createdAt) || Timestamp.now());
  const sent = existing.exists && existing.data().emailSentAt;
  if (order.status === 'paid' && !sent && order.customer.email) {
    const mail = confirmationEmail(order, siteUrl);
    const result = await sendEmail({ to: order.customer.email, ...mail, idempotencyKey: `order-confirmation/${sessionId}` });
    if (result) {
      await ref.update({ emailSentAt: FieldValue.serverTimestamp(), emails: push(emailEntry('confirmation', order.customer.email, mail.subject, result)) });
    }
  }
  await syncOrder(sessionId); // their portal copy, if they have an account
  // Then, in its own email, an invite to claim a portal account (only if they don't have one).
  if (order.status === 'paid' && order.customer.email && !(existing.exists && existing.data().accountInvite)) {
    try {
      const invite = await sendAccountInvite({ email: order.customer.email, name: order.customer.name, orderId: sessionId, orderNumber: order.orderNumber, siteUrl });
      await ref.update({
        accountInvite: { status: invite.status, at: FieldValue.serverTimestamp() },
        ...(invite.subject ? { emails: push(emailEntry('account-invite', customerId(order.customer.email), invite.subject, invite.sent)) } : {}),
      });
    } catch (err) {
      console.error('webhook: account invite failed', sessionId, err); // never fail the webhook over it
    }
  }
}

async function setStatusByPaymentIntent(paymentIntent, status, extra = {}) {
  if (!paymentIntent) return;
  const snap = await db.collection('orders').where('stripe.paymentIntent', '==', paymentIntent).limit(1).get();
  if (!snap.empty) {
    // An order with a return open keeps `in_return`: the return's own tracker
    // records the refund, then closes it (server/returns.js).
    const keep = snap.docs[0].get('status') === 'in_return';
    await snap.docs[0].ref.update({
      ...extra,
      ...(keep ? {} : { status, statusHistory: push(historyEntry(status, 'stripe')) }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await syncOrder(snap.docs[0].id);
  }
}

export function webhookRoutes() {
  const router = express.Router();
  router.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const secret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    if (!stripe || !secret) return res.status(503).send('Stripe is not configured');
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), secret);
    } catch (err) {
      return res.status(400).send(`Webhook signature check failed: ${err.message}`);
    }
    const host = req.get('x-forwarded-host') || req.get('host');
    const siteUrl = (process.env.PUBLIC_SITE_URL || `https://${host}`).replace(/\/$/, '');
    try {
      const obj = event.data.object;
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
          await recordCheckout(obj.id, siteUrl);
          break;
        case 'checkout.session.async_payment_failed': {
          const ref = db.collection('orders').doc(obj.id);
          if ((await ref.get()).exists) {
            await ref.update({ status: 'cancelled', statusHistory: push(historyEntry('cancelled', 'stripe')), updatedAt: FieldValue.serverTimestamp() });
            await syncOrder(obj.id);
          }
          break;
        }
        case 'charge.refunded': {
          const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent && obj.payment_intent.id;
          const refundedAUD = Math.round(Number(obj.amount_refunded) || 0) / 100; // what Stripe has refunded so far, partial or full
          if (obj.refunded) await setStatusByPaymentIntent(pi, 'refunded', { 'stripe.refundedAUD': refundedAUD });
          else if (pi) {
            const snap = await db.collection('orders').where('stripe.paymentIntent', '==', pi).limit(1).get();
            if (!snap.empty) await snap.docs[0].ref.update({ 'stripe.refundedAUD': refundedAUD, updatedAt: FieldValue.serverTimestamp() });
          }
          break;
        }
        default:
          break; // not an event we act on
      }
      res.json({ received: true });
    } catch (err) {
      console.error(`webhook: ${event.type} ${event.id} failed`, err);
      res.status(500).send('Webhook handler failed'); // Stripe will retry
    }
  });
  return router;
}
