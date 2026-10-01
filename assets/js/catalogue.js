/* ============================================================
   AXIA, catalogue loader
   Loads the live product catalogue from Firestore (collection
   "products", edited in the admin portal at /admin) into
   window.AXIA_PRODUCTS, then runs the page's scripts.

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
  var CACHE_KEY = 'axia_catalogue_v1', CACHE_TTL = 60 * 1000, TIMEOUT = 4000;

  var q = new URLSearchParams(location.search).get('catalogue');
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var source = q || (local ? 'emulator' : 'live');
  var base = source === 'emulator'
    ? 'http://' + (location.hostname === 'localhost' ? 'localhost' : '127.0.0.1') + ':8080/v1'
    : 'https://firestore.googleapis.com/v1';

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

  function fetchFirestore() {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
    var all = [];
    function page(token) {
      var url = base + '/projects/' + PROJECT + '/databases/(default)/documents/products?pageSize=300'
        + (source === 'live' ? '&key=' + API_KEY : '') + (token ? '&pageToken=' + encodeURIComponent(token) : '');
      return fetch(url, { signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
        if (!r.ok) throw new Error('Firestore ' + r.status);
        return r.json();
      }).then(function (j) {
        (j.documents || []).forEach(function (d) { all.push(obj(d.fields || {})); });
        return j.nextPageToken ? page(j.nextPageToken) : all;
      });
    }
    return page().then(function (list) {
      clearTimeout(timer);
      if (!list.length) throw new Error('Firestore catalogue is empty');
      return tidy(list);
    }, function (e) { clearTimeout(timer); throw e; });
  }

  function loadFallback() {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = FALLBACK;
      s.onload = s.onerror = function () { resolve(window.AXIA_PRODUCTS || []); };
      document.head.appendChild(s);
    });
  }

  function readCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (c && c.src === source && Date.now() - c.t < CACHE_TTL && Array.isArray(c.p)) return c.p;
    } catch (e) {}
    return null;
  }
  function writeCache(p) { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), src: source, p: p })); } catch (e) {} }

  var cached = source === 'static' ? null : readCache();
  var products = cached ? Promise.resolve(cached)
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

  window.AXIA_SOURCE = source;
  window.AXIA_READY = Promise.all([products, domReady]).then(function (r) {
    window.AXIA_PRODUCTS = r[0];
    return runDeferred();
  }).then(function () {
    document.dispatchEvent(new CustomEvent('axia:catalogue', { detail: { products: window.AXIA_PRODUCTS, source: source } }));
    return window.AXIA_PRODUCTS;
  });
})();
