// AXIA Admin service worker. Its only job is to make the portal installable
// and show a friendly page when the phone has no connection.
//
// It deliberately caches NOTHING the portal loads while signed in: no pages,
// no /api responses, no Firestore data, no images. The only thing stored is
// the static offline page below, so a shared or lost phone never holds order
// or customer data in a cache. Everything else goes straight to the network
// exactly as it would without a service worker.
const CACHE = 'axia-admin-offline-v1';
const OFFLINE = '/admin/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.add(new Request(OFFLINE, { cache: 'reload' }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('axia-admin') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  // Only page loads. Scripts, styles, images and API calls are left alone.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(async () =>
    (await caches.match(OFFLINE)) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })));
});
