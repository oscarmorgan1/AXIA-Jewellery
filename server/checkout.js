// POST /api/checkout  prices the bag and opens a Stripe Checkout session.
// GET  /api/checkout/session?id=cs_...  what the confirmation page shows.
import express from 'express';
import { priceCart, CartError } from './pricing.js';
import { stripe, getProduct, isShopOpen, getSiteMode, getPromotions } from './services.js';
import { rateLimit, clientIp } from './limit.js';

const tooManyQuotes = rateLimit({ windowMs: 60 * 1000, max: 30 });

export const SHIPPING = [
  { id: 'standard', name: 'Standard shipping', amountAUD: 0, min: 3, max: 6 },
  { id: 'express', name: 'Express shipping', amountAUD: 25, min: 1, max: 2 },
  { id: 'ceo', name: 'Hand Delivered by CEO', amountAUD: 1000, min: 1, max: 5 },
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

// A set line's pieces for the webhook: [[productId, width, length, retail], ...].
// Stripe metadata values hold 500 characters, plenty for a few pieces.
export const setMeta = l => (l.components ? JSON.stringify(l.components.map(c => [c.id, c.width, c.length, c.priceAUD])).slice(0, 500) : '');

export function checkoutRoutes() {
  const router = express.Router();

  // POST /api/checkout/quote  the bag priced exactly as checkout will charge it, promotions
  // included, for the checkout page's summary. Takes no payment and needs no open shop.
  router.post('/api/checkout/quote', express.json({ limit: '32kb' }), async (req, res) => {
    if (tooManyQuotes(clientIp(req))) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    try {
      const promotions = await getPromotions();
      const { lines, subtotalAUD, gift } = await priceCart(req.body && req.body.items, getProduct, { giftLength: req.body && req.body.giftLength, promotions });
      res.set('Cache-Control', 'no-store').json({
        lines: lines.map(l => ({ id: l.id, qty: l.qty, priceAUD: l.priceAUD, listPriceAUD: l.listPriceAUD || l.priceAUD, promo: l.promo ? { name: l.promo.name, pct: l.promo.pct } : null })),
        subtotalAUD, gift,
      });
    } catch (err) {
      if (err instanceof CartError) return res.status(409).json({ error: err.message });
      console.error('checkout: could not price bag', err);
      res.status(500).json({ error: 'Could not price your bag.' });
    }
  });

  router.post('/api/checkout', express.json({ limit: '32kb' }), async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Checkout isn't switched on yet. Please try again soon." });
    try {
      const mode = await getSiteMode();
      if (mode !== 'production') return res.status(503).json({ error: mode === 'offline' ? 'AXIA is offline.' : 'AXIA is unavailable for a moment. Your bag is saved, please try again soon.' });
      if (!(await isShopOpen())) return res.status(403).json({ error: "The shop isn't open yet. Your bag is saved for when it is." });
      const promotions = await getPromotions();
      const { lines, gift } = await priceCart(req.body && req.body.items, getProduct, { giftLength: req.body && req.body.giftLength, promotions });
      const used = lines.filter(l => l.promo).map(l => l.promo);
      const topPct = used.reduce((a, p) => Math.max(a, p.pct), 0);
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
              metadata: compact({ productId: l.id, width: l.width, length: l.length, colour: l.colour, engraving: l.engraving, set: setMeta(l), listPrice: l.listPriceAUD, promo: l.promo ? `${l.promo.name} (${l.promo.pct}%)`.slice(0, 120) : '' }),
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
        // Promo codes work on top of a promotion only if every promotion in this bag allows it.
        allow_promotion_codes: used.every(p => p.allowPromos),
        billing_address_collection: 'auto',
        custom_text: {
          submit: { message: 'Every piece is hand-set and made to order. Allow approximately 3-5 weeks before dispatch.' },
          ...(gift ? { shipping_address: { message: `Your free ${gift.name}${gift.length ? ' (' + gift.length + ')' : ''} ships with this order.` } } : {}),
        },
        metadata: compact({ ...(gift ? { gift: gift.id, giftName: gift.name, giftLength: gift.length } : {}), storeDiscountPct: topPct || '', promotions: [...new Set(used.map(p => p.name))].join(', ').slice(0, 450) }),
        success_url: `${origin}/checkout?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout`,
      });
      res.json({ url: session.url });
    } catch (err) {
      if (err instanceof CartError) return res.status(409).json({ error: err.message });
      console.error('checkout: could not create session', err);
      res.status(500).json({ error: 'Something went wrong starting checkout. Please try again.' });
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
