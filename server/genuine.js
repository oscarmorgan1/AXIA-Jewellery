// GET /api/genuine?serial=...  The /genuine page's serial check.
//
// Piece records (Firestore `pieces/{key}`) are admins only in firestore.rules:
// they hold the supplier, notes and the order the piece went out in. This is
// the only public way in, and it answers with two fields and nothing else:
// what the product is, and the date the customer bought it (their order's date,
// in Sydney time). A piece that isn't assigned to a paid order, or whose order
// was cancelled or refunded, isn't anyone's yet, so it gets the same plain 404
// as an unknown serial. Each visitor is rate limited so serials can't be guessed in bulk.
import express from 'express';
import { db } from './services.js';
import { rateLimit, clientIp } from './limit.js';

/** Same as serialKey() in admin-portal/src/lib/pieces.ts: capitals, letters and digits only. */
export const serialKey = serial => String(serial || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);

const NOT_SOLD = ['pending', 'cancelled', 'refunded'];
const sydneyDate = d => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const tooMany = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

/**
 * The public view of a piece: its product name and the customer's purchase date,
 * or null when the piece hasn't been sold. Nothing else from either record leaves the server.
 */
export function publicPiece(piece, order) {
  if (!piece || !order || NOT_SOLD.includes(order.status || 'pending')) return null;
  const placed = order.createdAt && typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : null;
  return {
    name: typeof piece.productName === 'string' ? piece.productName : '',
    purchasedOn: placed ? sydneyDate(placed) : null,
  };
}

export function genuineRoutes() {
  const router = express.Router();
  router.get('/api/genuine', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const key = serialKey(typeof req.query.serial === 'string' ? req.query.serial : '');
    if (key.length < 4) return res.status(400).json({ error: 'Enter the serial number from your card.' });
    if (tooMany(clientIp(req))) return res.status(429).json({ error: 'Too many checks from here. Please try again later.' });
    try {
      const snap = await db.collection('pieces').doc(key).get();
      const piece = snap.exists ? snap.data() : null;
      const orderId = piece && typeof piece.orderId === 'string' && piece.orderId ? piece.orderId : '';
      const order = orderId ? await db.collection('orders').doc(orderId).get() : null;
      const out = publicPiece(piece, order && order.exists ? order.data() : null);
      if (!out) return res.status(404).json({ error: 'Not found' });
      res.json(out);
    } catch (err) {
      console.error('genuine: lookup failed', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
  return router;
}
