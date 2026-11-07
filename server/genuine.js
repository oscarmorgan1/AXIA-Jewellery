// GET /api/genuine?serial=...  The /genuine page's serial check.
//
// Piece records (Firestore `pieces/{key}`) are admins only in firestore.rules:
// they hold the supplier, notes and the order the piece went out in. This is
// the only public way in, and it answers with two fields and nothing else:
// what the product is, and when the piece was purchased. Unknown serials get
// a plain 404, and each visitor is rate limited so serials can't be guessed in bulk.
import express from 'express';
import { db } from './services.js';
import { rateLimit, clientIp } from './limit.js';

/** Same as serialKey() in admin-portal/src/lib/pieces.ts: capitals, letters and digits only. */
export const serialKey = serial => String(serial || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const tooMany = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

/** The public view of a piece record. Anything not named here never leaves the server. */
export function publicPiece(piece) {
  return {
    name: typeof piece.productName === 'string' ? piece.productName : '',
    purchasedOn: DATE.test(piece.purchasedOn || '') ? piece.purchasedOn : null,
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
      if (!snap.exists) return res.status(404).json({ error: 'Not found' });
      res.json(publicPiece(snap.data()));
    } catch (err) {
      console.error('genuine: lookup failed', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
  return router;
}
