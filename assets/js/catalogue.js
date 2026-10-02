/* ============================================================
   AXIA, catalogue loader
   Loads the live product catalogue from Firestore ("products" and
   "collections", edited in the admin portal at /admin) into
   window.AXIA_PRODUCTS and window.AXIA_COLLECTIONS, then runs the
   page's scripts. Also loads the site settings edited in the portal
   (the launch countdown, from site/countdown) into window.AXIA_SITE,
   with window.AXIA_CD.run() to drive the countdown on any page, and
   provides window.AXIA_DB.add() so the public forms can save sign-ups
   and messages to Firestore. Counts unique daily visitors (see trackVisit).

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
  var CACHE_KEY = 'axia_catalogue_v3', CACHE_TTL = 60 * 1000, TIMEOUT = 9000;

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

  /* Countdown used until the portal's settings load, or if they can't be
     (mode: 'timer' counts down to target, 'text' shows text, 'off' hides it). */
  var DEFAULT_COUNTDOWN = { mode: 'text', label: 'The First Drop', text: 'Dropping soon', target: '2026-11-20T19:00:00+11:00', endedText: 'Out now' };

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

  function getDoc(path, signal) {
    return fetch(docsUrl(path) + keyParam('?'), { signal: signal }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('Firestore ' + path + ' ' + r.status);
      return r.json().then(function (d) { return obj(d.fields || {}); });
    });
  }

  function fetchFirestore() {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var signal = ctrl ? ctrl.signal : undefined;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
    var cols = listAll('collections', signal).catch(function () { return []; });
    var cd = getDoc('site/countdown', signal).catch(function () { return null; });
    return Promise.all([listAll('products', signal), cols, cd]).then(function (r) {
      clearTimeout(timer);
      if (!r[0].length) throw new Error('Firestore catalogue is empty');
      return { p: tidy(r[0]), c: tidyCollections(r[1]), s: { countdown: r[2] } };
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
      s.onload = s.onerror = function () { resolve({ p: window.AXIA_PRODUCTS || [], c: DEFAULT_COLLECTIONS.slice(), s: {} }); };
      document.head.appendChild(s);
    });
  }

  function readCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (c && c.src === source && Date.now() - c.t < CACHE_TTL && Array.isArray(c.p) && Array.isArray(c.c)) return { p: c.p, c: c.c, s: c.s || {} };
    } catch (e) {}
    return null;
  }
  function writeCache(d) { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), src: source, p: d.p, c: d.c, s: d.s })); } catch (e) {} }

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
    add: function (collection, data, id) {
      var fields = {};
      Object.keys(data).forEach(function (k) { if (data[k] !== undefined) fields[k] = enc(data[k]); });
      var name = 'projects/' + PROJECT + '/databases/(default)/documents/' + collection + '/' + (id || randomId());
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

  /* ---- Launch countdown (Admin > Settings > Countdown) ----
     AXIA_CD.run(cb) calls cb(state) straight away and, for a running timer,
     every second after. state.mode is 'timer' (with d, h, m, s as two-digit
     strings), 'text' (show state.text), or 'off' (hide the countdown).
     When a timer reaches zero it switches to 'text' with the "ended" text. */
  function countdownSettings() {
    var c = (window.AXIA_SITE && window.AXIA_SITE.countdown) || {}, out = {};
    for (var k in DEFAULT_COUNTDOWN) out[k] = (c[k] !== undefined && c[k] !== null && c[k] !== '') ? c[k] : DEFAULT_COUNTDOWN[k];
    if (c.mode) out.mode = c.mode;
    return out;
  }
  window.AXIA_CD = {
    settings: countdownSettings,
    run: function (cb) {
      var c = countdownSettings(), target = Date.parse(c.target), iv = null;
      var base = { label: c.label, href: 'first-drop' };
      function emit(extra) { var o = {}; for (var k in base) o[k] = base[k]; for (k in extra) o[k] = extra[k]; try { cb(o); } catch (e) { if (window.console) console.error(e); } }
      if (c.mode === 'off') return emit({ mode: 'off' });
      if (c.mode !== 'timer' || isNaN(target)) return emit({ mode: 'text', text: c.text });
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      function step() {
        var diff = target - Date.now();
        if (diff <= 0) { if (iv) clearInterval(iv); return emit({ mode: 'text', text: c.endedText, ended: true }); }
        var t = Math.floor(diff / 1000);
        emit({ mode: 'timer', d: pad(Math.floor(t / 86400)), h: pad(Math.floor(t % 86400 / 3600)), m: pad(Math.floor(t % 3600 / 60)), s: pad(t % 60) });
      }
      step();
      if (target - Date.now() > 0) iv = setInterval(step, 1000);
    }
  };

  /* ---- Unique visitors ----
     Each browser gets a random anonymous id (no cookies, nothing personal) and
     is counted once per day (Sydney time) in "visits/{day}_{id}", which only
     admins can read. Skipped for bots, for admins (the portal sets
     axia_no_track on sign-in) and when ?catalogue=static is forced. */
  function trackVisit() {
    try {
      if (source === 'static' || navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|headless|preview/i.test(navigator.userAgent)) return;
      var ls = window.localStorage;
      if (ls.getItem('axia_no_track')) return;
      var day = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || ls.getItem('axia_vday') === day) return;
      var vid = ls.getItem('axia_vid');
      if (!/^[A-Za-z0-9]{12,32}$/.test(vid || '')) { vid = randomId().slice(0, 20); ls.setItem('axia_vid', vid); }
      ls.setItem('axia_vday', day);
      var ref = '';
      try { var r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) ref = r.host.replace(/^www\./, '').slice(0, 100); } catch (e) {}
      var w = Math.min(screen.width, screen.height), touch = matchMedia('(pointer: coarse)').matches;
      window.AXIA_DB.add('visits', {
        day: day, vid: vid, page: (location.pathname || '/').slice(0, 200), ref: ref,
        device: !touch ? 'desktop' : w < 600 ? 'mobile' : 'tablet'
      }, day + '_' + vid).catch(function () {});
    } catch (e) {}
  }
  if ('requestIdleCallback' in window) requestIdleCallback(trackVisit, { timeout: 4000 }); else setTimeout(trackVisit, 1500);

  window.AXIA_SOURCE = source;
  window.AXIA_READY = Promise.all([catalogue, domReady]).then(function (r) {
    window.AXIA_PRODUCTS = r[0].p;
    window.AXIA_COLLECTIONS = r[0].c;
    window.AXIA_SITE = r[0].s || {};
    return runDeferred();
  }).then(function () {
    document.dispatchEvent(new CustomEvent('axia:catalogue', { detail: { products: window.AXIA_PRODUCTS, collections: window.AXIA_COLLECTIONS, source: source } }));
    return window.AXIA_PRODUCTS;
  });
})();
