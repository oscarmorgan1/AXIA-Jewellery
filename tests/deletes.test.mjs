// Admin deletes (server/deletes.js) against the emulators: `npm run test:deletes`.
// Checks that deleting an order or erasing a customer leaves nothing pointing at them.
import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
delete process.env.RESEND_API_KEY;
delete process.env.STRIPE_SECRET_KEY;

const { db } = await import('../server/services.js');
const { getAuth } = await import('firebase-admin/auth');
const { Timestamp } = await import('firebase-admin/firestore');
const { deleteOrder, eraseCustomer, deleteSupplier, deletePromo, wasDeleted } = await import('../server/deletes.js');

const at = ms => Timestamp.fromMillis(ms);
const exists = async path => (await db.doc(path).get()).exists;
let uid;

async function clear() {
  for (const c of await db.listCollections()) await db.recursiveDelete(c);
  const users = await getAuth().listUsers();
  await Promise.all(users.users.map(u => getAuth().deleteUser(u.uid)));
}

before(clear);
beforeEach(async () => {
  await clear();
  uid = (await getAuth().createUser({ email: 'ana@example.com', emailVerified: true })).uid;
  const w = (path, data) => db.doc(path).set(data);
  await Promise.all([
    w('orders/o1', { orderNumber: 'AX1001', status: 'shipped', customerId: 'ana@example.com', customer: { email: 'ana@example.com', name: 'Ana' }, createdAt: at(1000), stripe: { livemode: false }, promotionCodeId: 'promo_used' }),
    w('orders/o2', { orderNumber: 'AX1002', status: 'paid', customerId: 'ana@example.com', customer: { email: 'ana@example.com', name: 'Ana' }, createdAt: at(2000) }),
    w('orders/o3', { orderNumber: 'AX1003', status: 'paid', customerId: 'ben@example.com', customer: { email: 'ben@example.com', name: 'Ben' }, createdAt: at(3000) }),
    w('customers/ana@example.com', { email: 'ana@example.com', uid, orderIds: ['o1', 'o2'], firstOrderAt: at(1000), lastOrderAt: at(2000), emails: [{ type: 'status:shipped', orderId: 'o1' }, { type: 'message' }], notes: '' }),
    w('customers/ben@example.com', { email: 'ben@example.com', orderIds: ['o3'], firstOrderAt: at(3000), lastOrderAt: at(3000), emails: [], notes: '' }),
    w(`accounts/${uid}`, { email: 'ana@example.com', name: 'Ana' }),
    w(`accounts/${uid}/orders/o1`, { orderNumber: 'AX1001' }),
    w(`accounts/${uid}/orders/o2`, { orderNumber: 'AX1002' }),
    w(`accounts/${uid}/pieces/P1`, { serial: 'P1' }),
    w(`accounts/${uid}/saved/cart`, { items: [] }),
    w('pieces/P1', { key: 'P1', serial: 'P1', productId: 'p', productName: 'Cuban', orderId: 'o1', orderNumber: 'AX1001', orderLine: 0, shippedOn: '2026-01-02', portalUid: uid, supplierId: 'sup1' }),
    // Ana received P2 from Ben's order (o3) by transfer.
    w('pieces/P2', { key: 'P2', serial: 'P2', productId: 'p', productName: 'Cuban', orderId: 'o3', ownerUid: uid, ownerEmail: 'ana@example.com', ownerOrderId: 'o3', portalUid: uid,
      owners: [{ uid: 'ben', email: 'ben@example.com', via: 'order', at: null }, { uid, email: 'ana@example.com', via: 'transfer', at: null }] }),
    w(`accounts/${uid}/pieces/P2`, { serial: 'P2' }),
    w('pieceTransfers/t1', { key: 'P2', fromUid: 'ben', fromEmail: 'ben@example.com', toEmail: 'ana@example.com', toUid: uid, status: 'accepted' }),
    w('messages/m1', { email: 'ana@example.com', uid, orderId: 'o1', order: 'AX1001', message: 'Where is it?', createdAt: at(1500) }),
    w('messages/m2', { email: 'ana@example.com', message: 'Contact form', createdAt: at(1600) }),
    w(`accounts/${uid}/threads/m1`, { subject: 'Order' }),
    w('signups/s1', { email: 'ana@example.com', firstName: 'Ana' }),
    w('accountInvites/i1', { email: 'ana@example.com', orderId: 'o1', usedAt: null }),
    w('suppliers/sup1', { name: 'Maker Co' }),
    w('suppliers/sup2', { name: 'Unused Co' }),
    w('promoCodes/promo_used', { code: 'USED10', stripe: {} }),
    w('promoCodes/promo_new', { code: 'NEW10', stripe: {} }),
  ]);
});

test('deleting an order needs its number typed back', async () => {
  await assert.rejects(deleteOrder('o1', { confirm: 'AX1002' }), /AX1001/);
  assert.ok(await exists('orders/o1'));
});

test('deleting an order removes every reference and frees its pieces', async () => {
  const r = await deleteOrder('o1', { confirm: '#ax1001', by: 'admin' });
  assert.equal(r.pieces, 1);
  assert.ok(!(await exists('orders/o1')));
  assert.ok(!(await exists(`accounts/${uid}/orders/o1`)));
  assert.ok(await exists(`accounts/${uid}/orders/o2`));
  assert.ok(!(await exists(`accounts/${uid}/pieces/P1`)));
  assert.ok(!(await exists('accountInvites/i1')));
  const p = (await db.doc('pieces/P1').get()).data();
  assert.equal(p.orderId, null);
  assert.equal(p.shippedOn, null);
  assert.equal(p.serial, 'P1'); // the piece itself stays
  const m = (await db.doc('messages/m1').get()).data();
  assert.equal(m.orderId, null);
  const c = (await db.doc('customers/ana@example.com').get()).data();
  assert.deepEqual(c.orderIds, ['o2']);
  assert.equal(c.firstOrderAt.toMillis(), 2000);
  assert.deepEqual(c.emails.map(e => e.type), ['message']);
  assert.ok(await wasDeleted('o1'));
});

test('a customer record made only by a deleted test order goes with it', async () => {
  await deleteOrder('o3', { confirm: 'AX1003' });
  assert.ok(!(await exists('customers/ben@example.com')));
});

test('erasing a customer removes everything tied to their email', async () => {
  await assert.rejects(eraseCustomer('ana@example.com', { confirm: 'ana' }), /Type their email/);
  const r = await eraseCustomer('Ana@Example.com', { confirm: 'ana@example.com', by: 'admin' });
  assert.equal(r.orders, 2);
  for (const path of ['orders/o1', 'orders/o2', 'customers/ana@example.com', `accounts/${uid}`, `accounts/${uid}/saved/cart`, `accounts/${uid}/threads/m1`,
    `accounts/${uid}/pieces/P2`, 'messages/m1', 'messages/m2', 'signups/s1', 'accountInvites/i1', 'pieceTransfers/t1']) {
    assert.ok(!(await exists(path)), `${path} still there`);
  }
  await assert.rejects(getAuth().getUser(uid), /no user record/i);
  // Ben's order and the piece stay; Ana's name is out of its history and nobody's portal holds it.
  assert.ok(await exists('orders/o3'));
  const p2 = (await db.doc('pieces/P2').get()).data();
  assert.equal(p2.ownerEmail, '');
  assert.ok(!JSON.stringify(p2).includes('ana@example.com'));
  assert.equal(p2.portalUid, null);
  assert.ok(!JSON.stringify((await db.doc('pieces/P1').get()).data()).includes('ana@example.com'));
  const log = await db.collection('erasures').get();
  assert.equal(log.size, 1);
  assert.ok(!JSON.stringify(log.docs[0].data()).includes('ana@'));
});

test('an admin can’t be erased', async () => {
  await getAuth().setCustomUserClaims(uid, { admin: true });
  await assert.rejects(eraseCustomer('ana@example.com', { confirm: 'ana@example.com' }), /admin/);
});

test('suppliers and promo codes in use can’t be deleted', async () => {
  await assert.rejects(deleteSupplier('sup1'), /P1/);
  await deleteSupplier('sup2');
  assert.ok(!(await exists('suppliers/sup2')));
  await assert.rejects(deletePromo('promo_used'), /AX1001/);
  await deletePromo('promo_new');
  assert.ok(!(await exists('promoCodes/promo_new')));
});
