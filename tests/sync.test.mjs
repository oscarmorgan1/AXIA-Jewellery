// What a customer's portal copy of an order may contain: `node --test tests/sync.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'; // services.js needs a project; nothing is read here
const { customerOrder } = await import('../server/sync.js');
const ts = ms => ({ toMillis: () => ms });

test('customerOrder keeps what the customer needs and drops the private fields', () => {
  const out = customerOrder({
    orderNumber: 'AX1', status: 'shipped', createdAt: ts(1000), notes: 'private', customer: { email: 'a@b.c', phone: '1' },
    items: [{ id: 'p', name: 'Cuban', qty: 2, priceAUD: 10, options: 'Silver · Engraved: “AB”', engraving: 'AB', image: 'assets/x.jpg' }],
    subtotalAUD: 20, totalAUD: 20, shipping: { name: 'A', method: 'Express', amountAUD: 0, address: { line1: '1 St', city: 'X' } },
    tracking: { carrier: 'AusPost', number: '9', url: 'javascript:alert(1)' },
    statusHistory: [
      { status: 'paid', at: ts(1000), by: 'stripe' },
      { status: 'in_progress', at: ts(2000), by: 'admin@axia', note: 'emailed note', emailed: true },
      { status: 'shipped', at: ts(3000), by: 'admin@axia', note: 'internal', emailed: false },
    ],
    emails: [{ type: 'confirmation' }], stripe: { sessionId: 'cs', paymentIntent: 'pi', receiptUrl: 'https://pay.stripe.com/r' },
  });
  const json = JSON.stringify(out);
  for (const secret of ['private', 'internal', 'admin@axia', '"pi"', 'confirmation', 'a@b.c', 'javascript:']) {
    assert.ok(!json.includes(secret), `leaked ${secret}`);
  }
  assert.equal(out.items[0].options, 'Silver');
  assert.equal(out.tracking.url, '');
  assert.deepEqual(out.timeline.map(t => t.note || null), [null, 'emailed note', null]);
  assert.equal(out.receiptUrl, 'https://pay.stripe.com/r');
  assert.equal(out.placedAt, 1000);
});

test('customerPiece shows the serial and purchase date, never the supplier side', async () => {
  const { customerPiece } = await import('../server/sync.js');
  const out = customerPiece(
    { serial: 'AXIA1', productId: 'p', productName: 'Cuban', variant: '10mm', supplier: 'Maker Co', supplierOrderNo: 'SO-1', receivedOn: '2026-01-02', notes: 'private', orderId: 'o1', shippedOn: '2026-01-05' },
    { orderNumber: 'AX1', createdAt: { toDate: () => new Date('2026-01-01T13:30:00Z') }, stripe: { paymentIntent: 'pi' } },
    { images: ['assets/img/x.jpg'], factoryCostAUD: 50 },
  );
  assert.deepEqual(out, { serial: 'AXIA1', productId: 'p', productName: 'Cuban', variant: '10mm', image: 'assets/img/x.jpg', purchasedOn: '2026-01-02', orderId: 'o1', orderNumber: 'AX1', shippedOn: '2026-01-05', transferredOn: null, transfer: null });
});

test('customerThread shows their messages and the team’s replies in order, without who replied', async () => {
  const { customerThread } = await import('../server/sync.js');
  const out = customerThread({
    uid: 'u1', email: 'a@b.c', topic: 'Sizing', subject: 'Sizing', order: '', message: 'What size?', createdAt: ts(1000),
    customerReplies: [{ body: 'Also, engraving?', at: ts(3000) }],
    replies: [{ type: 'reply', body: 'A 20 inch suits most.', by: 'admin@axia', resendId: 're_1', status: 'sent', sentAt: ts(2000) }],
    customerReadAt: ts(1500),
  });
  assert.deepEqual(out.messages.map(m => [m.from, m.at]), [['you', 1000], ['axia', 2000], ['you', 3000]]);
  assert.equal(out.state, 'open');
  assert.equal(out.unread, true);
  assert.equal(out.lastAt, 3000);
  const json = JSON.stringify(out);
  for (const secret of ['admin@axia', 're_1', 'a@b.c']) assert.ok(!json.includes(secret), `leaked ${secret}`);
  assert.equal(customerThread({ message: 'x', createdAt: ts(1), replies: [{ body: 'y', sentAt: ts(2) }], customerReadAt: ts(5) }).unread, false);
});

test('a piece passed on hides the original buyer’s order, and a pending transfer shows to the sender', async () => {
  const { customerPiece } = await import('../server/sync.js');
  const order = { orderNumber: 'AX1', createdAt: { toDate: () => new Date('2026-01-01T13:30:00Z') } };
  const moved = customerPiece({ serial: 'AXIA1', productName: 'Cuban', orderId: 'o1', orderNumber: 'AX1', ownerUid: 'u2', ownerEmail: 'b@c.d', ownerOrderId: 'o1', transferredOn: '2026-03-01',
    owners: [{ uid: 'u1', email: 'a@b.c' }, { uid: 'u2', email: 'b@c.d' }], shippedOn: '2026-01-05' }, order, null);
  assert.equal(moved.orderId, null); assert.equal(moved.orderNumber, ''); assert.equal(moved.purchasedOn, null);
  assert.equal(moved.transferredOn, '2026-03-01');
  assert.ok(!JSON.stringify(moved).includes('a@b.c'), 'leaked the previous owner');
  const pending = customerPiece({ serial: 'AXIA2', transfer: { id: 't1', toEmail: 'b@c.d', expiresAt: ts(5000) } }, order, null);
  assert.deepEqual(pending.transfer, { id: 't1', toEmail: 'b@c.d', expiresAt: 5000 });
});

test('a transfer offer shows the sender’s name and note, never their email', async () => {
  const { incomingOffer } = await import('../server/transfers.js');
  const out = incomingOffer({ key: 'AXIA1', serial: 'AXIA1', productName: 'Cuban', fromName: 'Mia Hart', fromEmail: 'mia@x.com', fromUid: 'u1', note: 'Happy birthday', createdAt: ts(1), expiresAt: ts(2) },
    { serial: 'AXIA1', supplier: 'Maker Co', notes: 'private' }, { images: ['assets/a.jpg'] });
  assert.equal(out.fromName, 'Mia Hart'); assert.equal(out.image, 'assets/a.jpg'); assert.equal(out.expiresAt, 2);
  const json = JSON.stringify(out);
  for (const secret of ['mia@x.com', 'u1', 'Maker Co', 'private']) assert.ok(!json.includes(secret), `leaked ${secret}`);
});

test('a return’s portal copy shows the steps, label and refund, never notes, staff or Stripe ids', async () => {
  const { customerReturn } = await import('../server/sync.js');
  const out = customerReturn({
    number: 'R-AX1-1', orderId: 'o1', orderNumber: 'AX1', status: 'label_created', reason: 'It doesn’t fit', customerNote: 'Too long',
    notes: 'internal: check clasp', createdBy: 'admin@axia', customer: { email: 'a@b.c' },
    items: [{ line: 0, key: 'AXIA1', serial: 'AXIA1', productName: 'Cuban', variant: '8mm · 20in' }],
    label: { carrier: 'AusPost', number: 'RT1', url: 'javascript:alert(1)' },
    refund: { amountAUD: 120, via: 'stripe', stripeRefundId: 're_secret', at: ts(9), by: 'admin@axia' },
    history: [
      { status: 'requested', at: ts(1), by: 'a@b.c' },
      { status: 'label_created', at: ts(2), by: 'admin@axia', note: 'emailed note', emailed: true },
      { status: 'label_created', at: ts(3), by: 'admin@axia', note: 'internal step note', emailed: false },
    ],
    emails: [{ type: 'return:requested' }], createdAt: ts(1),
  }, { returnTo: 'AXIA Returns' });
  assert.equal(out.status, 'label_created'); assert.equal(out.note, 'Too long'); assert.equal(out.returnTo, 'AXIA Returns');
  assert.deepEqual(out.label, { carrier: 'AusPost', number: 'RT1', url: '' });
  assert.deepEqual(out.refund, { amountAUD: 120, at: 9 });
  assert.equal(out.timeline[1].note, 'emailed note');
  const json = JSON.stringify(out);
  for (const secret of ['internal', 'admin@axia', 're_secret', 'a@b.c', 'javascript:', 'return:requested']) assert.ok(!json.includes(secret), `leaked ${secret}`);
});
