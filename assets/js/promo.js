/* ============================================================
   AXIA, promotion banners and the giveaway countdown.
   Loaded by catalogue.js once the catalogue is ready, only when a promotion
   with a banner is running or a giveaway end date is set (Admin > Promotions,
   Admin > Website > Giveaway). Draws:
     - the home page banner into [data-promo-slot="home"];
     - a slim bar under the menu on shop pages (after .announce), when the
       page has no home slot;
     - the giveaway countdown into [data-giveaway-slot] (the giveaway page and
       the home page). Once it closes, the "closed" text shows instead and the
       mobile "Enter to win" bar is taken away.
   Prices themselves are done by AXIA_SALE in catalogue.js.
   ============================================================ */
(function () {
  'use strict';
  var site = window.AXIA_SITE || {};
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var THEMES = ['obsidian', 'ice', 'bone', 'magenta', 'rose', 'gold', 'emerald'];
  function parts(end) {
    var t = Math.max(0, Math.floor((end - Date.now()) / 1000));
    return { t: t, d: pad(Math.floor(t / 86400)), h: pad(Math.floor(t % 86400 / 3600)), m: pad(Math.floor(t % 3600 / 60)), s: pad(t % 60) };
  }
  var GRID = '<div class="sbn__cd" role="timer"><div><b data-k="d">--</b><span>Days</span></div><div><b data-k="h">--</b><span>Hrs</span></div><div><b data-k="m">--</b><span>Min</span></div><div><b data-k="s">--</b><span>Sec</span></div></div>';
  var timers = [];
  function tick() {
    for (var i = timers.length - 1; i >= 0; i--) {
      var x = timers[i], p = parts(x.end);
      if (p.t <= 0) { timers.splice(i, 1); x.done(); continue; }
      var b = x.el.querySelectorAll('[data-k]');
      for (var j = 0; j < b.length; j++) b[j].textContent = p[b[j].getAttribute('data-k')];
      if (x.text) x.text.textContent = p.d + 'd ' + p.h + 'h ' + p.m + 'm ' + p.s + 's';
    }
    if (!timers.length && iv) { clearInterval(iv); iv = null; }
  }
  var iv = null;
  function count(el, end, done, text) {
    timers.push({ el: el, end: end, done: done, text: text });
    tick();
    if (!iv && timers.length) iv = setInterval(tick, 1000);
  }
  var href = function (h) { return /^(\/|#|https:\/\/|[a-z0-9-]+(\?|#|$))/i.test(h || '') ? h : ''; };
  var img = function (s) { return String(s || '').replace(/["'()\\\s]/g, encodeURIComponent); };

  /* ---- Promotions ---- */
  var promos = (window.AXIA_SALE ? window.AXIA_SALE.promos() : []).filter(function (p) { return p.banner; });
  promos.sort(function (a, b) { return b.pct - a.pct; });
  var home = document.querySelector('[data-promo-slot="home"]');

  function banner(p) {
    var b = p.banner, theme = THEMES.indexOf(b.theme) >= 0 ? b.theme : 'obsidian';
    var photo = b.style === 'photo' && b.image;
    var end = Date.parse(p.endsAt);
    var el = document.createElement('section');
    el.className = 'sbn ' + (photo ? 'sbn--photo' : 'sbn--' + theme);
    el.setAttribute('aria-label', b.eyebrow || p.name || 'Sale');
    if (photo) el.style.backgroundImage = 'url("' + img(b.image) + '")';
    var link = href(b.ctaHref);
    el.innerHTML = '<div class="sbn__in">'
      + '<span class="sbn__eye">' + esc(b.eyebrow || p.name) + '</span>'
      + '<h2 class="sbn__h">' + esc(b.headline || (p.pct + '% off')) + '</h2>'
      + (b.text ? '<p class="sbn__p">' + esc(b.text) + '</p>' : '')
      + (b.showCountdown && end > Date.now() ? '<span class="sbn__cdl">Ends in</span>' + GRID : '')
      + (b.ctaLabel && link ? '<div><a class="sbn__cta" href="' + esc(link) + '">' + esc(b.ctaLabel) + '</a></div>' : '')
      + '</div>';
    if (b.showCountdown && end > Date.now()) count(el, end, function () { el.remove(); });
    return el;
  }

  if (home) {
    promos.filter(function (p) { return p.banner.show; }).slice(0, 2).forEach(function (p) { home.appendChild(banner(p)); });
  } else {
    var s = promos.filter(function (p) { return p.banner.strip; })[0];
    var page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    if (s && page !== 'checkout' && page !== 'sale') {
      var b = s.banner, theme = THEMES.indexOf(b.theme) >= 0 ? b.theme : 'obsidian';
      var a = document.createElement(href(b.ctaHref) ? 'a' : 'div');
      a.className = 'sbn sbn-strip sbn--' + (b.style === 'photo' ? 'obsidian' : theme);
      if (a.tagName === 'A') a.href = href(b.ctaHref);
      var end = Date.parse(s.endsAt), timed = b.showCountdown && end > Date.now();
      a.innerHTML = '<span><b>' + esc(b.eyebrow || s.name) + '</b> ' + esc(b.headline || (s.pct + '% off')) + '</span>'
        + (timed ? '<span class="sbn-strip__t">Ends in <span data-t></span></span>' : '')
        + (b.ctaLabel && a.tagName === 'A' ? '<span class="sbn-strip__go">' + esc(b.ctaLabel) + '</span>' : '');
      var ann = document.querySelector('.announce');
      if (ann && ann.parentNode) ann.parentNode.insertBefore(a, ann.nextSibling);
      else { var nav = document.querySelector('.nav'); if (nav && nav.parentNode) nav.parentNode.insertBefore(a, nav.nextSibling); else document.body.insertBefore(a, document.body.firstChild); }
      if (timed) count(a, end, function () { a.remove(); }, a.querySelector('[data-t]'));
    }
  }

  /* ---- Giveaway ---- */
  var g = site.giveaway, slots = [].slice.call(document.querySelectorAll('[data-giveaway-slot]'));
  if (g && g.endsAt) {
    var fb = document.querySelector('.fdbar span');
    if (fb && g.title && Date.parse(g.endsAt) > Date.now()) fb.textContent = g.title;
    if (g.show === false) slots = [];
    var gEnd = Date.parse(g.endsAt);
    if (!isNaN(gEnd)) {
      var closed = function () {
        var bar = document.querySelector('.fdbar');
        if (bar) { bar.remove(); document.body.classList.remove('has-fdbar'); }
      };
      slots.forEach(function (slot) {
        var inline = slot.getAttribute('data-giveaway-slot') === 'inline';
        var go = slot.getAttribute('data-giveaway-link');
        var el = document.createElement('div');
        el.className = 'give-cd' + (inline ? ' give-cd--inline' : '');
        function done() {
          el.innerHTML = '<span class="give-cd__eye">' + esc(g.label) + '</span><p class="give-cd__done">' + esc(g.endedText) + '</p>';
        }
        if (gEnd > Date.now()) {
          el.innerHTML = '<span class="give-cd__eye">' + esc(g.label) + (g.valueAUD ? ' · valued at A$' + Number(g.valueAUD).toLocaleString('en-AU') : '') + '</span>'
            + (inline ? '' : '<h2 class="give-cd__h">Entries close in</h2>') + GRID
            + (go ? '<div><a class="give-cd__go" href="' + esc(go) + '">Enter free</a></div>' : '');
          count(el, gEnd, function () { done(); closed(); });
        } else { done(); closed(); }
        slot.appendChild(el);
      });
    }
  }
})();
