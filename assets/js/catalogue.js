/* ============================================================
   AXIA, catalogue loader
   Loads the live product catalogue from Firestore ("products" and
   "collections", edited in the admin portal at /admin) into
   window.AXIA_PRODUCTS and window.AXIA_COLLECTIONS, then runs the
   page's scripts. Also provides window.AXIA_DB.add() so the public
   forms can save sign-ups and messages to Firestore.

   Page scripts that read the catalogue are marked
   <script type="text/axia-deferred"> and run here, in document order,
   once the catalogue is ready, so they behave exactly as they did when
   products.js was a plain synchronous include.

   If Firestore can't be reached, assets/data/products.js (a snapshot,
   refreshed with `npm run export:products`) is used instead.

   Source override for testing: ?catalogue=static | emulator | live
   ============================================================ */
(function () {
  'use strict';
  var PROJECT = 'axia-jewellery';
  var API_KEY = 'AIzaSyAXFXM3znoKUCD2ZPFfB8saBwV9r4eKItA'; // public web key; access is enforced by Firestore rules
  var FALLBACK = 'assets/data/products.js?v=20260930a';
  var CACHE_KEY = 'axia_catalogue_v2', CACHE_TTL = 60 * 1000, TIMEOUT = 4000;

  var q = new URLSearchParams(location.search).get('catalogue');
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var source = q || (local ? 'emulator' : 'live');
  var base = source === 'emulator'
    ? 'http://' + (location.hostname === 'localhost' ? 'localhost' : '127.0.0.1') + ':8080/v1'
    : 'https://firestore.googleapis.com/v1';

  /* Shop tabs used if the collections can't be loaded (matches the seed). */
  var DEFAULT_COLLECTIONS = [
    { slug: 'sets', name: 'Sets', intro: 'Matched pieces, bought together for less.', showInShop: true, sort: 10 },
    { slug: 'cuban', name: 'The Cuban', tab: 'Cuban', intro: 'The foundation of AXIA. Hand-set, made to be worn every day.', showInShop: true, sort: 20 },
    { slug: 'tennis', name: 'Tennis', intro: 'Clean lines, wall to wall brilliance. Hand-set in 925 silver.', showInShop: true, sort: 30 },
    { slug: 'pendants', name: 'Pendants', intro: 'The cross, on its own or on a chain.', showInShop: true, sort: 40 },
    { slug: 'titans', name: 'The Titans', intro: '18mm. The apex of AXIA.', showInShop: false, sort: 50 }
  ];

  /* Firestore REST values -> plain JSON */
  function val(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
    if ('mapValue' in v) return obj(v.mapValue.fields || {});
    return null;
  }
  function obj(fields) { var o = {}; for (var k in fields) o[k] = val(fields[k]); return o; }

  function tidy(list) {
    return list.filter(function (p) { return p && p.id && !p.archived; })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
      .map(function (p) { delete p.sort; delete p.archived; delete p.updatedAt; return p; });
  }

  function docsUrl(path) {
    return base + '/projects/' + PROJECT + '/databases/(default)/documents/' + path;
  }
  function keyParam(sep) { return source === 'live' ? sep + 'key=' + API_KEY : ''; }

  function listAll(name, signal) {
    var all = [];
    function page(token) {
      var url = docsUrl(name) + '?pageSize=300' + keyParam('&') + (token ? '&pageToken=' + encodeURIComponent(token) : '');
      return fetch(url, { signal: signal }).then(function (r) {
        if (!r.ok) throw new Error('Firestore ' + name + ' ' + r.status);
        return r.json();
      }).then(function (j) {
        (j.documents || []).forEach(function (d) { all.push(obj(d.fields || {})); });
        return j.nextPageToken ? page(j.nextPageToken) : all;
      });
    }
    return page();
  }

  function fetchFirestore() {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var signal = ctrl ? ctrl.signal : undefined;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
    var cols = listAll('collections', signal).catch(function () { return []; });
    return Promise.all([listAll('products', signal), cols]).then(function (r) {
      clearTimeout(timer);
      if (!r[0].length) throw new Error('Firestore catalogue is empty');
      return { p: tidy(r[0]), c: tidyCollections(r[1]) };
    }, function (e) { clearTimeout(timer); throw e; });
  }

  function tidyCollections(list) {
    list = (list || []).filter(function (c) { return c && c.slug && c.name; });
    if (!list.length) return DEFAULT_COLLECTIONS.slice();
    return list.sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
      .map(function (c) { delete c.updatedAt; return c; });
  }

  function loadFallback() {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = FALLBACK;
      s.onload = s.onerror = function () { resolve({ p: window.AXIA_PRODUCTS || [], c: DEFAULT_COLLECTIONS.slice() }); };
      document.head.appendChild(s);
    });
  }

  function readCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (c && c.src === source && Date.now() - c.t < CACHE_TTL && Array.isArray(c.p) && Array.isArray(c.c)) return { p: c.p, c: c.c };
    } catch (e) {}
    return null;
  }
  function writeCache(d) { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), src: source, p: d.p, c: d.c })); } catch (e) {} }

  var cached = source === 'static' ? null : readCache();
  var catalogue = cached ? Promise.resolve(cached)
    : source === 'static' ? loadFallback()
    : fetchFirestore().then(function (p) { writeCache(p); return p; }, function (e) {
        if (window.console) console.warn('[AXIA] Live catalogue unavailable, using the bundled snapshot.', e);
        return loadFallback();
      });

  var domReady = document.readyState === 'loading'
    ? new Promise(function (r) { document.addEventListener('DOMContentLoaded', r, { once: true }); })
    : Promise.resolve();

  /* Re-create each deferred <script> so the browser executes it, one at a time, in order. */
  function runDeferred() {
    var list = Array.prototype.slice.call(document.querySelectorAll('script[type="text/axia-deferred"]'));
    return list.reduce(function (chain, old) {
      return chain.then(function () {
        return new Promise(function (resolve) {
          var s = document.createElement('script');
          for (var i = 0; i < old.attributes.length; i++) {
            var a = old.attributes[i]; if (a.name !== 'type') s.setAttribute(a.name, a.value);
          }
          if (old.src) { s.async = false; s.onload = s.onerror = function () { resolve(); }; }
          else s.textContent = old.textContent;
          old.parentNode.replaceChild(s, old);
          if (!old.src) resolve();
        });
      });
    }, Promise.resolve());
  }

  /* ---- Public form writes (sign-ups, support messages) ----
     Creates one document with a random id; createdAt is stamped by the server.
     Security rules only allow creating entries with the expected fields. */
  function enc(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    return { stringValue: String(v) };
  }
  function randomId() {
    var a = new Uint8Array(15), abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = '';
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) out += abc[a[i] % abc.length];
    return out + Date.now().toString(36);
  }
  window.AXIA_DB = {
    add: function (collection, data) {
      var fields = {};
      Object.keys(data).forEach(function (k) { if (data[k] !== undefined) fields[k] = enc(data[k]); });
      var name = 'projects/' + PROJECT + '/databases/(default)/documents/' + collection + '/' + randomId();
      var body = { writes: [{
        update: { name: name, fields: fields },
        currentDocument: { exists: false },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]
      }] };
      var wbase = source === 'static' ? 'https://firestore.googleapis.com/v1' : base;
      var wkey = source === 'emulator' ? '' : '?key=' + API_KEY;
      return fetch(wbase + '/projects/' + PROJECT + '/databases/(default)/documents:commit' + wkey, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('Save failed (' + r.status + '): ' + t.slice(0, 200)); });
        return true;
      });
    }
  };

  window.AXIA_SOURCE = source;
  window.AXIA_READY = Promise.all([catalogue, domReady]).then(function (r) {
    window.AXIA_PRODUCTS = r[0].p;
    window.AXIA_COLLECTIONS = r[0].c;
    return runDeferred();
  }).then(function () {
    document.dispatchEvent(new CustomEvent('axia:catalogue', { detail: { products: window.AXIA_PRODUCTS, collections: window.AXIA_COLLECTIONS, source: source } }));
    return window.AXIA_PRODUCTS;
  });
})();
