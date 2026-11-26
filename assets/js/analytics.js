/* AXIA analytics: Google Analytics 4, Microsoft Clarity and the Meta Pixel, storefront only.
   The server adds this script (server/analytics.js) with the IDs it has:
     data-ga="G-..."  data-clarity="..."  data-meta="..."  data-consent="notice" | "opt-in"
   notice: they run unless the visitor declines. opt-in: nothing runs until they tap OK.
   The choice is kept in localStorage (axia_consent: yes | no) and can be changed
   from the privacy page ([data-consent-open]).

   Never runs for admins (the portal sets axia_no_track), bots, or a browser
   sending Global Privacy Control. Clarity is told to hide every form field and
   the authenticity results, and GA only sees an allow-listed query string, so a
   serial or anything typed in a form never leaves the page. The Meta Pixel runs
   with autoConfig off (no automatic button, form or page-content collection),
   and only sends the shop events pages queue for it:
     (window.axiaPx = window.axiaPx || []).push(['AddToCart', {value: 129, currency: 'AUD'}]);
   Queued events wait until the pixel starts, and are dropped if it never does. */
(function () {
  'use strict';
  var me = document.currentScript;
  if (!me) return;
  var GA = me.getAttribute('data-ga') || '';
  var CLARITY = me.getAttribute('data-clarity') || '';
  var META = me.getAttribute('data-meta') || '';
  var MODE = me.getAttribute('data-consent') === 'opt-in' ? 'opt-in' : 'notice';
  var KEY = 'axia_consent';
  var started = false;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var excluded = !!get('axia_no_track') || navigator.webdriver ||
    /bot|crawl|spider|slurp|lighthouse|headless|preview/i.test(navigator.userAgent) ||
    navigator.globalPrivacyControl === true;

  /* Only these query parameters reach GA: which product or category, and campaign tags. */
  var KEEP = ['id', 'cat', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  function cleanUrl() {
    var u = new URL(location.href), out = new URLSearchParams();
    u.searchParams.forEach(function (v, k) { if (KEEP.indexOf(k) !== -1) out.append(k, v); });
    var q = out.toString();
    return u.origin + u.pathname + (q ? '?' + q : '');
  }

  function add(src) {
    var s = document.createElement('script');
    s.async = true; s.src = src;
    if (me.nonce) s.nonce = me.nonce;
    document.head.appendChild(s);
  }

  /* Clarity masks fields in Balanced mode already; this makes sure, on every
     form and anything marked data-private, including ones added later. */
  var PRIVATE = 'form, input, textarea, select, [data-private]';
  function mask(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches(PRIVATE)) root.setAttribute('data-clarity-mask', 'True');
    root.querySelectorAll(PRIVATE).forEach(function (el) { el.setAttribute('data-clarity-mask', 'True'); });
  }

  /* Meta events from the page: [name, params, {eventID}] */
  function send(e) {
    if (!e || !e[0] || !window.fbq) return;
    if (e[2] && e[2].eventID) window.fbq('track', e[0], e[1] || {}, { eventID: String(e[2].eventID) });
    else window.fbq('track', e[0], e[1] || {});
  }

  function start() {
    if (excluded) return;
    if (started) { /* turned back on after a decline on this page */
      if (GA) window['ga-disable-' + GA] = false;
      if (META && window.fbq) { window.fbq('consent', 'grant'); window.axiaPx = { push: send }; }
      return;
    }
    started = true;
    if (GA) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', GA, {
        page_location: cleanUrl(),
        page_referrer: document.referrer ? document.referrer.split('?')[0] : '',
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
      add('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA));
    }
    if (CLARITY) {
      mask(document.documentElement);
      new MutationObserver(function (list) {
        list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) mask(n); }); });
      }).observe(document.documentElement, { childList: true, subtree: true });
      window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
      add('https://www.clarity.ms/tag/' + encodeURIComponent(CLARITY));
    }
    if (META) {
      /* Meta's own base code, loaded with this page's nonce instead of inline. */
      var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!window._fbq) window._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      window.fbq('set', 'autoConfig', false, META);
      window.fbq('init', META);
      window.fbq('track', 'PageView');
      add('https://connect.facebook.net/en_US/fbevents.js');
      var q = window.axiaPx || [];
      window.axiaPx = { push: send };
      if (q.forEach) q.forEach(send);
    }
  }

  /* Turning it off: stop sending now, and clear the tools' cookies. */
  function stop() {
    if (GA) window['ga-disable-' + GA] = true;
    if (CLARITY && window.clarity) { try { window.clarity('consent', false); } catch (e) {} }
    if (META && window.fbq) { try { window.fbq('consent', 'revoke'); } catch (e) {} }
    window.axiaPx = { push: function () {} };
    var host = location.hostname.split('.').slice(-2).join('.');
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (/^(_ga|_gid|_gat|_clck|_clsk|CLID|MUID|_fbp|_fbc)/.test(name)) {
        ['', '; domain=' + location.hostname, '; domain=.' + host].forEach(function (d) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
        });
      }
    });
  }

  /* ---- The notice ---- */
  var CSS = '' +
    '.axc{position:fixed;z-index:9000;left:max(16px,env(safe-area-inset-left));bottom:max(16px,env(safe-area-inset-bottom));' +
    'width:min(400px,calc(100vw - 32px));background:var(--obsidian,#111315);color:var(--on-dark-2,#AEB4BC);' +
    'border:1px solid var(--line-dark-strong,rgba(244,241,234,.26));border-radius:4px;padding:16px 18px 14px;' +
    'font:400 13px/1.55 var(--font-sans,system-ui,sans-serif);box-shadow:0 18px 40px rgba(0,0,0,.28);' +
    'opacity:0;transform:translateY(8px);transition:opacity .3s ease,transform .3s ease;--focus:var(--ice,#C7EAF7)}' +
    '.axc.on{opacity:1;transform:none}' +
    '.axc p{margin:0 0 12px;color:inherit;font-size:13px;letter-spacing:0;text-transform:none}' +
    '.axc a{color:var(--ice,#C7EAF7);text-decoration:underline;text-underline-offset:.18em}' +
    '.axc__row{display:flex;gap:8px;justify-content:flex-end}' +
    '.axc button{font:600 11px/1 var(--font-sans,system-ui,sans-serif);letter-spacing:.14em;text-transform:uppercase;' +
    'padding:11px 16px;border-radius:2px;cursor:pointer;border:1px solid var(--line-dark-strong,rgba(244,241,234,.26));' +
    'background:transparent;color:var(--on-dark,#F4F1EA)}' +
    '.axc button:hover{border-color:var(--on-dark,#F4F1EA)}' +
    '.axc button.axc__ok{background:var(--bone,#F4F1EA);color:var(--obsidian,#111315);border-color:var(--bone,#F4F1EA)}' +
    '.axc button:focus-visible{outline:2px solid var(--ice,#C7EAF7);outline-offset:2px}' +
    '@media (prefers-reduced-motion:reduce){.axc{transition:none}}';

  function tools() {
    var t = [];
    if (GA) t.push('Google Analytics');
    if (CLARITY) t.push('Microsoft Clarity');
    if (META) t.push('the Meta Pixel');
    return t.length > 1 ? t.slice(0, -1).join(', ') + ' and ' + t[t.length - 1] : t.join('');
  }

  var box = null;
  function notice() {
    if (box) return;
    if (!document.getElementById('axc-css')) {
      var st = document.createElement('style');
      st.id = 'axc-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    box = document.createElement('div');
    box.className = 'axc';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Analytics choice');
    box.innerHTML = '<p>We use ' + tools() + ' to provide a better experience for our customers' + (META ? ' and to measure our ads' : '') + '. Find out more in our <a href="/privacy#analytics">privacy policy</a>.</p>' +
      '<div class="axc__row"><button type="button" class="axc__no">Decline</button><button type="button" class="axc__ok">OK</button></div>';
    box.querySelector('.axc__ok').addEventListener('click', function () { choose('yes'); });
    box.querySelector('.axc__no').addEventListener('click', function () { choose('no'); });
    document.body.appendChild(box);
    requestAnimationFrame(function () { requestAnimationFrame(function () { box && box.classList.add('on'); }); });
  }
  function close() {
    if (!box) return;
    var b = box; box = null;
    b.classList.remove('on');
    setTimeout(function () { b.remove(); }, 320);
  }

  function choose(v) {
    set(KEY, v);
    close();
    if (v === 'yes') start(); else stop();
    status();
  }

  /* The privacy page's "Analytics choice" control. */
  function status() {
    document.querySelectorAll('[data-consent-status]').forEach(function (el) {
      var c = get(KEY);
      el.textContent = excluded ? 'Off in this browser' + (navigator.globalPrivacyControl === true ? ' (Global Privacy Control is on)' : '') + '.'
        : c === 'no' ? 'Off. You declined analytics.'
        : c === 'yes' || MODE === 'notice' ? 'On.' : 'Off until you choose.';
    });
  }

  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  ready(function () {
    document.querySelectorAll('[data-consent-open]').forEach(function (el) {
      el.hidden = false;
      el.addEventListener('click', function (e) { e.preventDefault(); notice(); });
    });
    document.querySelectorAll('[data-consent-tools]').forEach(function (el) { el.textContent = tools(); });
    status();
    if (excluded) return;
    var c = get(KEY);
    if (c === 'no') return;
    if (c === 'yes' || MODE === 'notice') start();
    if (!c) setTimeout(notice, 1200);
  });
})();
