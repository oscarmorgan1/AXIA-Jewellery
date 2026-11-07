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
  assert.deepEqual(out, { serial: 'AXIA1', productId: 'p', productName: 'Cuban', variant: '10mm', image: 'assets/img/x.jpg', purchasedOn: '2026-01-02', orderId: 'o1', orderNumber: 'AX1', shippedOn: '2026-01-05' });
});
