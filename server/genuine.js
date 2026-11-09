// GET /api/genuine?serial=...  The /genuine page's serial check.
//
// Piece records (Firestore `pieces/{key}`) are admins only in firestore.rules:
// they hold the supplier, notes and the order the piece went out in. This is
// the only public way in, and it answers with what proves the piece is one of
// one and nothing else: what the product is (name, variant, product id for its
// photo), the date the customer bought it (their order's date, in Sydney time),
// and how many owners it has had, with the date the current one took it over
// when it was transferred. Never who owns it, never the order, never the supplier. A piece that isn't assigned to a paid order, or whose order
// was cancelled or refunded, isn't anyone's yet, so it gets the same plain 404
// as an unknown serial. Each visitor is rate limited so serials can't be guessed in bulk.
import express from 'express';
import { db } from './services.js';
import { rateLimit, clientIp } from './limit.js';
import { passedOn } from './sync.js';

/** Same as serialKey() in admin-portal/src/lib/pieces.ts: capitals, letters and digits only. */
export const serialKey = serial => String(serial || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);

const NOT_SOLD = ['pending', 'cancelled', 'refunded'];
const sydneyDate = d => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '');
const tooMany = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

/**
 * The public view of a piece, or null when it hasn't been sold. `owners` counts
 * everyone who has held it (1 until it's transferred from the order it's in), and
 * `ownerSince` is the day the current owner took it over, only once it has been passed on.
 * Nothing else from either record leaves the server.
 */
export function publicPiece(piece, order) {
  if (!piece || !order || NOT_SOLD.includes(order.status || 'pending')) return null;
  const placed = order.createdAt && typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : null;
  const history = passedOn(piece) && Array.isArray(piece.owners) ? piece.owners.length : 0;
  const owners = Math.max(1, history);
  return {
    name: text(piece.productName),
    variant: text(piece.variant),
    productId: text(piece.productId, 80),
    purchasedOn: placed ? sydneyDate(placed) : null,
    owners,
    ownerSince: owners > 1 && DAY.test(piece.transferredOn || '') ? piece.transferredOn : null,
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
