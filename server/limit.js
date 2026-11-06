// In-memory rate limits for the public forms (sign-up, support, visits), keyed
// by the visitor's IP from clientIp() below.
//
// Each server instance counts on its own; with up to 4 instances the real
// ceiling is a few times `max`, which is fine for stopping scripts.

export function rateLimit({ windowMs, max, maxKeys = 5000 }) {
  const hits = new Map();
  return function tooMany(key) {
    const now = Date.now();
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    if (hits.size > maxKeys) {
      for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= windowMs) hits.delete(k);
      if (hits.size > maxKeys) hits.clear();
    }
    return list.length > max;
  };
}

/**
 * The visitor's IP, for rate limiting. X-Forwarded-For can't be used as is:
 * its left-most entries are whatever the visitor sent, and on App Hosting the
 * CDN and load balancer hops in front of the server vary, so no fixed count of
 * trusted hops is reliable. App Hosting (which sets FIREBASE_CONFIG) passes the
 * real client in `x-fah-client-ip`; elsewhere (local runs) the socket address
 * is used. TRUST_PROXY_HOPS=n switches to counting n hops from the right instead.
 */
let warned = false;
export function clientIp(req) {
  const hops = Number(process.env.TRUST_PROXY_HOPS);
  if (Number.isInteger(hops) && hops > 0) {
    const chain = String(req.get('x-forwarded-for') || '').split(',').map(s => s.trim()).filter(Boolean);
    return chain[chain.length - hops] || req.socket.remoteAddress || '';
  }
  if (process.env.FIREBASE_CONFIG) {
    const ip = String(req.get('x-fah-client-ip') || '').trim();
    if (ip) return ip;
    if (!warned) { warned = true; console.error('limit: no x-fah-client-ip header on App Hosting; rate limits fall back to the connection address'); }
  }
  return req.socket.remoteAddress || '';
}
