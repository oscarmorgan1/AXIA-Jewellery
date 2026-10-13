// POST /api/checkout  prices the bag and opens a Stripe Checkout session.
// GET  /api/checkout/session?id=cs_...  what the confirmation page shows.
import express from 'express';
import { priceCart, CartError } from './pricing.js';
import { stripe, getProduct, isShopOpen } from './services.js';

export const SHIPPING = [
  { id: 'standard', name: 'Standard shipping', amountAUD: 0, min: 3, max: 6 },
  { id: 'express', name: 'Express shipping', amountAUD: 25, min: 1, max: 2 },
];

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

// Short order number shown to customers and in the portal (#ABC123).
export const orderNumber = sessionId => sessionId.slice(-6).toUpperCase();

function siteOrigin(req) {
  const host = req.get('x-forwarded-host') || req.get('host');
  return (process.env.PUBLIC_SITE_URL || `${req.protocol}://${host}`).replace(/\/$/, '');
}

// Stripe metadata can't hold empty values, so leave those keys out.
const compact = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

// A short, safe label for what failed (no keys or customer data), shown in the
// browser console so a failed checkout can be diagnosed without the server logs.
function errorReason(err) {
  if (!err) return 'unknown';
  if (err.type && String(err.type).startsWith('Stripe')) return ['stripe', err.type, err.code, err.param].filter(Boolean).join(':');
  return [err.name || 'Error', err.code].filter(x => x != null && x !== '').join(':'); // e.g. Error:7 is Firestore PERMISSION_DENIED
}

// Stripe's own message (it masks keys itself). On an authentication failure, also
// a masked view of the key this server was given (start, end and length only), so
// it can be compared with the one in the Stripe dashboard.
function errorDetail(err) {
  if (!err || !err.type || !String(err.type).startsWith('Stripe')) return {};
  const out = { detail: err.message };
  if (err.type === 'StripeAuthenticationError') {
    const k = process.env.STRIPE_SECRET_KEY || '';
    const t = k.trim();
    out.keySeen = t ? `${t.slice(0, 12)}…${t.slice(-6)} (${t.length} chars${t.length !== k.length ? ', had spaces/newlines' : ''})` : 'none';
  }
  return out;
}

export function checkoutRoutes() {
  const router = express.Router();

  router.post('/api/checkout', express.json({ limit: '32kb' }), async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Checkout isn't switched on yet. Please try again soon." });
    try {
      if (!(await isShopOpen())) return res.status(403).json({ error: "The shop isn't open yet. Your bag is saved for when it is." });
      const { lines, gift } = await priceCart(req.body && req.body.items, getProduct, { giftLength: req.body && req.body.giftLength });
      const origin = siteOrigin(req);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        currency: 'aud',
        line_items: lines.map(l => ({
          quantity: l.qty,
          price_data: {
            currency: 'aud',
            unit_amount: Math.round(l.priceAUD * 100),
            product_data: {
              name: l.name,
              ...(l.options ? { description: l.options } : {}),
              ...(l.image && origin.startsWith('https://') ? { images: [`${origin}/${encodeURI(l.image)}`] } : {}),
              metadata: compact({ productId: l.id, width: l.width, length: l.length, colour: l.colour, engraving: l.engraving }),
            },
          },
        })),
        shipping_address_collection: { allowed_countries: ['AU'] },
        shipping_options: SHIPPING.map(s => ({
          shipping_rate_data: {
            type: 'fixed_amount',
            display_name: s.name,
            fixed_amount: { amount: s.amountAUD * 100, currency: 'aud' },
            delivery_estimate: { minimum: { unit: 'business_day', value: s.min }, maximum: { unit: 'business_day', value: s.max } },
            metadata: { id: s.id },
          },
        })),
        phone_number_collection: { enabled: true },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        custom_text: {
          submit: { message: 'Every piece is hand-set and made to order. Allow approximately 3-5 weeks before dispatch.' },
          ...(gift ? { shipping_address: { message: `Your free ${gift.name}${gift.length ? ' (' + gift.length + ')' : ''} ships with this order.` } } : {}),
        },
        metadata: gift ? compact({ gift: gift.id, giftName: gift.name, giftLength: gift.length }) : {},
        success_url: `${origin}/checkout?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout`,
      });
      res.json({ url: session.url });
    } catch (err) {
      if (err instanceof CartError) return res.status(409).json({ error: err.message });
      console.error('checkout: could not create session', err);
      res.status(500).json({ error: 'Something went wrong starting checkout. Please try again.', reason: errorReason(err), ...errorDetail(err) });
    }
  });

  // The confirmation page reads the session straight from Stripe, so it works
  // even if the webhook hasn't landed yet. Session ids are long and random,
  // and this only returns what the buyer just entered themselves.
  router.get('/api/checkout/session', async (req, res) => {
    const id = String(req.query.id || '');
    if (!stripe || !SESSION_ID.test(id)) return res.status(404).json({ error: 'Not found' });
    try {
      const s = await stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] });
      res.set('Cache-Control', 'no-store').json({
        orderNumber: orderNumber(s.id),
        paid: s.payment_status === 'paid' || s.payment_status === 'no_payment_required',
        status: s.status,
        email: (s.customer_details && s.customer_details.email) || '',
        items: (s.line_items ? s.line_items.data : []).map(li => ({ name: li.description, qty: li.quantity, amountAUD: li.amount_total / 100 })),
        gift: s.metadata && s.metadata.giftName ? { name: s.metadata.giftName, length: s.metadata.giftLength || '' } : null,
        shippingAUD: ((s.total_details && s.total_details.amount_shipping) || 0) / 100,
        discountAUD: ((s.total_details && s.total_details.amount_discount) || 0) / 100,
        totalAUD: (s.amount_total || 0) / 100,
      });
    } catch (err) {
      if (err && err.statusCode === 404) return res.status(404).json({ error: 'Not found' });
      console.error('checkout: could not read session', err);
      res.status(500).json({ error: 'Could not load your order.' });
    }
  });

  return router;
}
