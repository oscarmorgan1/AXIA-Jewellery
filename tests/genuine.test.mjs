// What the public /genuine check may show about a piece: `node --test tests/genuine.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'; // services.js needs a project; nothing is read here
const { publicPiece } = await import('../server/genuine.js');
const placed = { toDate: () => new Date('2026-10-14T02:00:00Z') };

const piece = {
  serial: 'AX 2611 0042', productId: 'cuban-bracelet', productName: 'Iced Cuban Bracelet', variant: '10mm, 8 inch',
  supplier: 'Private Co', supplierOrderNo: 'S-99', purchasedOn: '2026-09-01', notes: 'private note',
  orderId: 'o1', orderNumber: 'AX1042', portalUid: 'uid-buyer',
};

test('a sold piece shows its product, purchase date and one owner, nothing private', () => {
  const out = publicPiece(piece, { status: 'paid', createdAt: placed, customer: { email: 'a@b.c' } });
  assert.deepEqual(out, {
    name: 'Iced Cuban Bracelet', variant: '10mm, 8 inch', productId: 'cuban-bracelet',
    purchasedOn: '2026-10-14', owners: 1, ownerSince: null,
  });
  const json = JSON.stringify(out);
  for (const secret of ['Private Co', 'S-99', '2026-09-01', 'private note', 'AX1042', 'uid-buyer', 'a@b.c', 'o1']) {
    assert.ok(!json.includes(secret), `leaked ${secret}`);
  }
});

test('a transferred piece counts its owners and the day it changed hands, never who', () => {
  const out = publicPiece({
    ...piece, ownerUid: 'uid-new', ownerEmail: 'new@b.c', ownerOrderId: 'o1', transferredOn: '2026-11-03',
    owners: [{ uid: 'uid-buyer', email: 'a@b.c', via: 'order' }, { uid: 'uid-new', email: 'new@b.c', via: 'transfer' }],
  }, { status: 'shipped', createdAt: placed });
  assert.equal(out.owners, 2);
  assert.equal(out.ownerSince, '2026-11-03');
  assert.ok(!JSON.stringify(out).includes('new@b.c') && !JSON.stringify(out).includes('uid-new'));
});

test('an owner history left over from an earlier order is ignored', () => {
  const out = publicPiece({ ...piece, orderId: 'o2', ownerUid: 'uid-new', ownerOrderId: 'o1', transferredOn: '2026-11-03', owners: [{}, {}] },
    { status: 'paid', createdAt: placed });
  assert.equal(out.owners, 1);
  assert.equal(out.ownerSince, null);
});

test('an unsold, cancelled or refunded piece is nobody\'s yet', () => {
  for (const status of ['pending', 'cancelled', 'refunded', undefined]) {
    assert.equal(publicPiece(piece, { status, createdAt: placed }), null);
  }
  assert.equal(publicPiece(piece, null), null);
});
