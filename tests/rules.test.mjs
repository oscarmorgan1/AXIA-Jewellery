// Firestore rules tests, run against the emulator: `npm run test:rules`.
// Covers the customer portal's accounts/ folder and that a customer sign-in
// can't reach the admin-only collections.
import { after, before, beforeEach, test } from 'node:test';
import fs from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, updateDoc, deleteDoc } from 'firebase/firestore';

let env;
const customer = (uid, extra = {}) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...extra }).firestore();
const admin = () => env.authenticatedContext('boss', { email: 'boss@axia.test', email_verified: true, admin: true, auth_time: 100, mfa: [100] }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-axia-rules',
    firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'accounts/ana'), { email: 'ana@example.com', name: 'Ana', marketing: { email: true } });
    await setDoc(doc(db, 'accounts/ana/orders/o1'), { orderNumber: 'AX1001', status: 'paid' });
    await setDoc(doc(db, 'accounts/ben'), { email: 'ben@example.com', name: 'Ben' });
    await setDoc(doc(db, 'orders/o1'), { customer: { email: 'ana@example.com' }, status: 'paid' });
    await setDoc(doc(db, 'pieces/AX123'), { serial: 'AX-123', orderId: 'o1' });
    await setDoc(doc(db, 'customers/ana@example.com'), { email: 'ana@example.com', notes: 'private' });
    await setDoc(doc(db, 'accountInvites/abc'), { email: 'ana@example.com' });
    await setDoc(doc(db, 'accounts/ana/threads/m1'), { subject: 'Sizing', messages: [] });
    await setDoc(doc(db, 'messages/m1'), { uid: 'ana', email: 'ana@example.com', message: 'Hi' });
    await setDoc(doc(db, 'pieceTransfers/t1'), { key: 'AX123', fromUid: 'ana', toEmail: 'ben@example.com', status: 'pending' });
    await setDoc(doc(db, 'accounts/ben/incoming/t1'), { serial: 'AX-123', fromName: 'Ana' });
    await setDoc(doc(db, 'returns/r1'), { orderId: 'o1', customerEmail: 'ana@example.com', status: 'requested', notes: 'internal' });
    await setDoc(doc(db, 'accounts/ana/returns/r1'), { number: 'R-AX1001-1', status: 'requested' });
  });
});

test('a customer reads their own account and its subfolders', async () => {
  await assertSucceeds(getDoc(doc(customer('ana'), 'accounts/ana')));
  await assertSucceeds(getDoc(doc(customer('ana'), 'accounts/ana/orders/o1')));
  await assertSucceeds(getDocs(collection(customer('ana'), 'accounts/ana/orders')));
});

test('a customer can’t read someone else’s account', async () => {
  await assertFails(getDoc(doc(customer('ana'), 'accounts/ben')));
  await assertFails(getDocs(collection(customer('ana'), 'accounts/ben/orders')));
  await assertFails(getDocs(collection(customer('ana'), 'accounts')));
});

test('an unverified or signed-out visitor can’t read an account', async () => {
  await assertFails(getDoc(doc(customer('ana', { email_verified: false }), 'accounts/ana')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'accounts/ana')));
});

test('nobody writes accounts from a browser, not even the owner', async () => {
  await assertFails(updateDoc(doc(customer('ana'), 'accounts/ana'), { name: 'Hacked' }));
  await assertFails(setDoc(doc(customer('ana'), 'accounts/ana/orders/o2'), { status: 'fulfilled' }));
  await assertFails(setDoc(doc(customer('eve'), 'accounts/eve'), { email: 'eve@example.com' }));
  await assertFails(updateDoc(doc(admin(), 'accounts/ana'), { name: 'x' }));
});

test('support: a customer reads their own conversations, never the Inbox or someone else’s', async () => {
  await assertSucceeds(getDocs(collection(customer('ana'), 'accounts/ana/threads')));
  await assertFails(getDocs(collection(customer('ben'), 'accounts/ana/threads')));
  await assertFails(getDoc(doc(customer('ana'), 'messages/m1')));
  await assertFails(setDoc(doc(customer('ana'), 'accounts/ana/threads/m2'), { subject: 'x', messages: [] }));
});

test('transfers: only the server reads pieceTransfers; the recipient reads their own offer', async () => {
  await assertFails(getDoc(doc(customer('ana'), 'pieceTransfers/t1')));
  await assertFails(getDoc(doc(customer('ben'), 'pieceTransfers/t1')));
  await assertSucceeds(getDoc(doc(customer('ben'), 'accounts/ben/incoming/t1')));
  await assertFails(getDoc(doc(customer('ana'), 'accounts/ben/incoming/t1')));
  await assertFails(setDoc(doc(customer('ben'), 'accounts/ben/incoming/t2'), { serial: 'x' }));
  await assertFails(updateDoc(doc(customer('ana'), 'pieces/AX123'), { ownerUid: 'ana' }));
});

test('returns: admins read them, nobody writes them from a browser, the buyer reads only their copy', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'returns/r1')));
  await assertSucceeds(getDocs(collection(admin(), 'returns')));
  await assertFails(setDoc(doc(admin(), 'returns/r2'), { orderId: 'o1', status: 'requested' }));
  await assertFails(updateDoc(doc(admin(), 'returns/r1'), { status: 'refunded' }));
  await assertFails(getDoc(doc(customer('ana'), 'returns/r1')));
  await assertFails(getDocs(collection(customer('ana'), 'returns')));
  await assertFails(setDoc(doc(customer('ana'), 'returns/r3'), { orderId: 'o1' }));
  await assertSucceeds(getDoc(doc(customer('ana'), 'accounts/ana/returns/r1')));
  await assertFails(getDoc(doc(customer('ben'), 'accounts/ana/returns/r1')));
  await assertFails(setDoc(doc(customer('ana'), 'accounts/ana/returns/r1'), { status: 'refunded' }));
  await assertFails(getDoc(doc(customer('ana', { admin: true, auth_time: 5 }), 'returns/r1')));
});

test('a customer can’t reach orders, pieces, customers or invites', async () => {
  const db = customer('ana');
  await assertFails(getDoc(doc(db, 'orders/o1')));
  await assertFails(getDoc(doc(db, 'pieces/AX123')));
  await assertFails(getDoc(doc(db, 'customers/ana@example.com')));
  await assertFails(getDoc(doc(db, 'accountInvites/abc')));
  await assertFails(getDocs(collection(db, 'orders')));
});

test('a verified admin can read accounts', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'accounts/ana')));
  await assertSucceeds(getDocs(collection(admin(), 'accounts')));
  await assertSucceeds(getDoc(doc(admin(), 'accounts/ana/orders/o1')));
});

test('a customer token with a forged admin claim but no code is still refused', async () => {
  const db = customer('ana', { admin: true, auth_time: 5 });
  await assertFails(getDoc(doc(db, 'orders/o1')));
});

test('orders and suppliers are deleted through the server, not the browser', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'suppliers/s1'), { name: 'Maker Co' }));
  await assertSucceeds(updateDoc(doc(admin(), 'orders/o1'), { notes: 'x' }));
  await assertFails(deleteDoc(doc(admin(), 'orders/o1')));
  await assertSucceeds(updateDoc(doc(admin(), 'suppliers/s1'), { name: 'Maker Co.' }));
  await assertFails(deleteDoc(doc(admin(), 'suppliers/s1')));
  await assertFails(getDoc(doc(admin(), 'deletedOrders/o1')));
  await assertFails(getDoc(doc(admin(), 'erasures/e1')));
});
