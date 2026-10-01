/* ============================================================
   AXIA, interactions (cart · reveals · nav · configurator)
   Reuses the brand-neutral engine from earlier work.
   ============================================================ */
(function () {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const fmt = n => '$' + n.toLocaleString('en-AU');

  /* ---- Wordmark: custom peaked-serif AXIA (matches brand mark) ---- */
  // Peaked high-contrast serif traced from the AXIA mark: thin/concave left stroke, thick right, sharp apex, bracketed serifs
  // Traced from the AXIA mark: peaked A with NO crossbar, a hairline concave thin stroke + a heavy solid
  // wedge meeting at a sharp apex. The two A's are MIRRORED (A2 flipped) for the symmetric bookend.
  const A_GLYPH = '<path d="M48 2 L28 100 L16 100 Q46 55 48 2 Z"/><path d="M48 2 L60 100 L98 100 Q72 40 48 2 Z"/><path d="M10 102 V97 Q22 94 34 97 V102 Z"/><path d="M56 102 V97 Q79 94 102 97 V102 Z"/>';
  const X_GLYPH = '<path d="M6 4 L22 4 L94 102 L78 102 Z"/><path d="M82 4 L92 4 L20 102 L10 102 Z"/><path d="M2 4 H24 V9 H2 Z"/><path d="M74 4 H96 V9 H74 Z"/><path d="M6 97 H26 V102 H6 Z"/><path d="M72 97 H96 V102 H72 Z"/>';
  const I_GLYPH = '<path d="M16 4 H28 V102 H16 Z"/><path d="M4 4 H40 V10 H4 Z"/><path d="M4 96 H40 V102 H4 Z"/>';
  const WORDMARK = '<svg class="wm" viewBox="0 -2 434 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><g fill="currentColor">'
    + '<g transform="translate(0,0)">' + A_GLYPH + '</g>'
    + '<g transform="translate(128,0)">' + X_GLYPH + '</g>'
    + '<g transform="translate(264,0)">' + I_GLYPH + '</g>'
    + '<g transform="translate(432,0) scale(-1,1)">' + A_GLYPH + '</g>'
    + '</g></svg>';
  // The logo (.wm-img) is in the HTML and rendered from first paint via CSS mask, no injection, no flash.
  // Only intervene if the image asset can't load: fall back to the traced wordmark.
  (function () {
    const img = new Image();
    img.onerror = () => $$('.nav__brand').forEach(a => { a.classList.add('nav__brand--wm'); a.innerHTML = WORDMARK; });
    img.src = 'assets/img/axia-logo.png?v=20260801i';
  })();

  // Logo click: a soft press + ice glimmer, then navigate (animation only on the logo, not every page load)
  const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
  $$('.nav__brand').forEach(a => a.addEventListener('click', e => {
    if (reduceMotion || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; // let the browser handle modified clicks
    const wm = a.querySelector('.wm-img') || a.querySelector('.wm'), href = a.getAttribute('href');
    if (!wm || !href) return;
    e.preventDefault();
    wm.classList.remove('tapped'); void wm.offsetWidth; wm.classList.add('tapped');
    setTimeout(() => { location.href = href; }, 300);
  }));

  /* ---- Titanium jewellery generators (placeholder until photography) ---- */
  const tan = (p, i) => { const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)]; return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; };
  const cubanLink = (x, y, ang, w, h) => `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${ang.toFixed(1)})">
    <rect x="${(-w/2).toFixed(1)}" y="${(-h/2).toFixed(1)}" width="${w}" height="${h}" rx="${(h*0.46).toFixed(1)}" fill="url(#axmv)" stroke="#161b22" stroke-width="1.6"/>
    <rect x="${(-w/2+4).toFixed(1)}" y="${(-h/2+2).toFixed(1)}" width="${(w-8).toFixed(1)}" height="${(h*0.14).toFixed(1)}" rx="${(h*0.07).toFixed(1)}" fill="url(#axice)" opacity=".55"/>
    <rect x="${(-w/2+5).toFixed(1)}" y="${(-h/2+4).toFixed(1)}" width="${(w-10).toFixed(1)}" height="${(h*0.26).toFixed(1)}" rx="${(h*0.13).toFixed(1)}" fill="#ffffff" opacity=".3"/>
    <rect x="${(-w/2+6).toFixed(1)}" y="${(h/2-h*0.2).toFixed(1)}" width="${(w-12).toFixed(1)}" height="${(h*0.1).toFixed(1)}" rx="2" fill="url(#axice)" opacity=".6"/>
    <line x1="${(-w/2+9).toFixed(1)}" y1="0" x2="${(w/2-9).toFixed(1)}" y2="0" stroke="#20262f" stroke-width="2" opacity=".5"/>
  </g>`;
  function drape(svg, { yTop, yBot, w, h, n, iced }) {
    if (!svg) return;
    const x0 = 110, x1 = 890, cx = 500;
    const yA = x => { const u = (x - cx) / ((x1 - x0) / 2); return yTop - (yTop - yBot) * (1 - u * u); };
    const p = []; for (let x = x0; x <= x1 + 1; x += (x1 - x0) / n) p.push({ x, y: yA(x) });
    let m = ''; for (let i = 0; i < p.length; i++) m += cubanLink(p[i].x, p[i].y, tan(p, i) + (i % 2 ? 8 : -8), w, h);
    if (iced) for (let i = 1; i < p.length - 1; i++) m += `<circle cx="${p[i].x.toFixed(1)}" cy="${p[i].y.toFixed(1)}" r="${(h * 0.17).toFixed(1)}" fill="url(#axice)" stroke="#bcdbe9" stroke-width="1"/>`;
    svg.innerHTML = m;
  }
  function tennis(svg) {
    if (!svg) return;
    let m = '<path d="M120 200 Q500 470 880 200" fill="none" stroke="url(#axmv)" stroke-width="4" opacity=".4"/>';
    for (let i = 0; i <= 22; i++) { const u = i / 22, x = 120 + 760 * u, y = 200 + Math.sin(u * Math.PI) * 250; m += `<rect x="${x-13}" y="${y-13}" width="26" height="26" rx="4" transform="rotate(45 ${x} ${y})" fill="url(#axice)" stroke="#9fc4d6" stroke-width="1.5"/>`; }
    svg.innerHTML = m;
  }
  // Cross pendant fully paved in moissanite
  function cross(svg) {
    if (!svg) return;
    let m = '';
    m += '<path d="M56 44 Q150 120 150 152" fill="none" stroke="url(#axmv)" stroke-width="3.5" opacity=".5"/>';
    m += '<path d="M244 44 Q150 120 150 152" fill="none" stroke="url(#axmv)" stroke-width="3.5" opacity=".5"/>';
    m += '<circle cx="150" cy="150" r="11" fill="none" stroke="url(#axmv)" stroke-width="5"/>';
    m += '<rect x="126" y="168" width="48" height="238" rx="12" fill="url(#axmv)"/>';
    m += '<rect x="66" y="230" width="168" height="48" rx="12" fill="url(#axmv)"/>';
    const st = (x, y) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.2" fill="url(#axice)" stroke="#bcdbe9" stroke-width=".7"/>`;
    for (let y = 180; y <= 398; y += 15.5) m += st(139, y) + st(150, y) + st(161, y);
    for (const y of [240, 255, 270]) for (let x = 78; x <= 222; x += 15.5) if (x < 128 || x > 172) m += st(x, y);
    svg.innerHTML = m;
  }
  // Atlas: circle of moissanite around a custom photo (placeholder unless img supplied)
  function atlas(svg, img) {
    if (!svg) return;
    const cx = 150, cy = 228, R = 116, ri = 74, cid = 'clip_' + (svg.id || Math.round(Math.random() * 1e6));
    let m = '<path d="M62 70 Q150 100 150 108" fill="none" stroke="url(#axmv)" stroke-width="3.5" opacity=".5"/><path d="M238 70 Q150 100 150 108" fill="none" stroke="url(#axmv)" stroke-width="3.5" opacity=".5"/><circle cx="150" cy="104" r="11" fill="none" stroke="url(#axmv)" stroke-width="5"/>';
    m += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="url(#axmv)" stroke-width="24"/>';
    m += '<clipPath id="' + cid + '"><circle cx="' + cx + '" cy="' + cy + '" r="' + ri + '"/></clipPath>';
    if (img) m += '<image href="' + img + '" x="' + (cx - ri) + '" y="' + (cy - ri) + '" width="' + (ri * 2) + '" height="' + (ri * 2) + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + cid + ')"/>';
    else m += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ri + '" fill="#12161c"/><text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="12" fill="#8894a2">your photo</text>';
    for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a); m += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7" fill="url(#axice)" stroke="#cfe6f2" stroke-width=".6"/>'; }
    svg.innerHTML = m;
  }
  window.AXIA_art = { drape, tennis, cross, atlas };
  $$('[data-art="cuban"]').forEach(s => drape(s, { yTop: +s.dataset.top || 180, yBot: +s.dataset.bot || 460, w: +s.dataset.w || 74, h: +s.dataset.h || 56, n: +s.dataset.n || 20, iced: s.dataset.iced === '1' }));
  $$('[data-art="cuban-thin"]').forEach(s => drape(s, { yTop: 190, yBot: 455, w: 50, h: 38, n: 26, iced: s.dataset.iced === '1' }));
  $$('[data-art="tennis"]').forEach(tennis);
  $$('[data-art="cross"]').forEach(cross);
  $$('[data-art="atlas"]').forEach(s => atlas(s, s.dataset.img || ''));

  /* ---- Reveal on scroll ---- */
  const rev = $$('.reveal');
  if (reduce || !('IntersectionObserver' in window)) rev.forEach(e => e.classList.add('in'));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    rev.forEach(e => io.observe(e));
    // Anything already on-screen at load settles INSTANTLY (no entrance transform). The entrance
    // slide used to move hero CTAs mid-click, so a fast first click landed where the button *was*
    // (the "press twice" bug). Above-the-fold content now appears in place and is instantly clickable.
    requestAnimationFrame(() => rev.forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) {
        const t = e.style.transition; e.style.transition = 'none';
        e.classList.add('in'); io.unobserve(e);
        requestAnimationFrame(() => { e.style.transition = t; });
      }
    }));
  }

  /* ---- Nav shadow on scroll ---- */
  const nav = $('#nav');
  if (nav) { const on = () => nav.classList.toggle('is-scrolled', scrollY > 20); on(); addEventListener('scroll', on, { passive: true }); }

  /* ---- Mobile menu ---- */
  const mm = $('#mm');
  $$('[data-menu]').forEach(b => b.onclick = () => { mm.classList.add('on'); document.body.style.overflow = 'hidden'; });
  $$('[data-menu-close]').forEach(b => b.onclick = () => { mm.classList.remove('on'); document.body.style.overflow = ''; });

  /* ---- Width/size chips ---- */
  $$('[data-chips]').forEach(row => row.addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    $$('.chip', row).forEach(x => x.classList.remove('is-active'));
    c.classList.add('is-active');
    const price = c.dataset.price, host = row.closest('[data-product]');
    if (price && host) { const el = $('[data-price]', host); if (el) el.textContent = fmt(+price); const add = $('[data-add]', host); if (add) add.dataset.price = price; }
  }));

  /* ---- Cart ---- */
  const KEY = 'axia_cart';
  let cart = []; try { cart = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}
  const ov = $('#ov'), drw = $('#drw'), cc = $('#cc');
  const openC = () => { drw.classList.add('on'); ov.classList.add('on'); document.body.style.overflow = 'hidden'; };
  const closeC = () => { drw.classList.remove('on'); ov.classList.remove('on'); document.body.style.overflow = ''; };
  $$('[data-cart]').forEach(b => b.onclick = e => { e.preventDefault(); openC(); });
  $$('[data-cart-close]').forEach(b => b.onclick = closeC);
  if (ov) ov.onclick = closeC;
  addEventListener('keydown', e => { if (e.key === 'Escape') closeC(); });

  function render() {
    if (!cc) return;
    const n = cart.reduce((a, i) => a + i.q, 0);
    cc.textContent = n; cc.classList.toggle('on', n > 0);
    const b = $('#drwb'), f = $('#drwf'); if (!b) return;
    if (!cart.length) { b.innerHTML = `<div class="drw-empty"><p class="editorial">Nothing selected yet.</p><p class="small">Every piece marks a step.</p></div>`; if (f) f.style.display = 'none'; return; }
    if (f) f.style.display = '';
    const P = window.AXIA_PRODUCTS || [];
    const idFor = it => { if (it.id) return it.id; const m = P.find(p => (p.name + (p.width ? ', ' + p.width : '')) === it.name || p.name === it.name); return m ? m.id : null; };
    b.innerHTML = cart.map((it, i) => {
      const m = it.img ? `<img src="${it.img}" alt="" loading="lazy">` : `<svg viewBox="0 0 1000 620" data-art="cuban" data-top="230" data-bot="430" data-w="60" data-h="46" data-n="16"></svg>`;
      const id = idFor(it); const href = id ? `product.html?id=${encodeURIComponent(id)}` : null;
      const mHtml = href ? `<a class="ci__m" href="${href}">${m}</a>` : `<div class="ci__m">${m}</div>`;
      const nHtml = href ? `<a class="ci__n" href="${href}">${it.name}</a>` : `<div class="ci__n">${it.name}</div>`;
      return `<div class="ci">${mHtml}<div>${nHtml}<div class="ci__o">${it.opt || ''}</div><button class="ci__rm" data-rm="${i}">Remove</button></div><div class="ci__p num">${fmt(it.price)}</div></div>`;
    }).join('');
    // Free gift: a Classic Tennis Bracelet, unlocked once the bag passes A$999.
    const paid = cart.reduce((a, i) => a + i.price * i.q, 0);
    const gift = P.find(p => p.id === 'tennis-bracelet');
    if (paid > 999 && gift) {
      const gimg = (gift.images && gift.images[0]) || 'assets/img/products/tennis-bracelet-4mm/1.jpg';
      const gh = `product.html?id=${gift.id}`;
      const vars = gift.variants || [];
      const lens = vars.map(v => v.length);
      const priceFor = l => { const v = vars.find(x => x.length === l); return (v && v.priceAUD) || gift.fromPriceAUD || 129; };
      let glen = ''; try { glen = localStorage.getItem('axia_gift_len') || ''; } catch (e) {}
      if (!lens.includes(glen)) glen = lens[0] || '';
      const lenSel = lens.length ? `<label class="ci__giftlen"><span>Length</span><select aria-label="Free tennis bracelet length">${lens.map(l => `<option${l === glen ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : '';
      b.insertAdjacentHTML('beforeend', `<div class="ci ci--gift"><a class="ci__m" href="${gh}"><img src="${gimg}" alt="" loading="lazy"></a><div><a class="ci__n" href="${gh}">${gift.name}</a><div class="ci__o">Free with orders over A$999</div>${lenSel}<span class="ci__gift">Free gift</span></div><div class="ci__p num">Worth ${fmt(priceFor(glen))} · <b>Free</b></div></div>`);
      const gsel = b.querySelector('.ci__giftlen select');
      if (gsel) gsel.onchange = () => {
        try { localStorage.setItem('axia_gift_len', gsel.value); } catch (e) {}
        const s = b.querySelector('.ci--gift .ci__p s'); if (s) s.textContent = fmt(priceFor(gsel.value));
      };
    }
    $$('[data-art="cuban"]', b).forEach(s => drape(s, { yTop: 230, yBot: 430, w: 60, h: 46, n: 16 }));
    $('#ctot').textContent = fmt(paid);
    $$('[data-rm]', b).forEach(x => x.onclick = () => { cart.splice(+x.dataset.rm, 1); save(); });
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(cart)); render(); }
  render();

  const toast = $('#toast'); let tt;
  const say = m => { if (!toast) return; $('#tmsg').textContent = m; toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('on'), 3000); };

  // delegated so dynamically-rendered cards work too
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-add]'); if (!btn) return;
    e.preventDefault(); // don't follow a wrapping <a> when the add button is inside a card link
    const host = btn.closest('[data-product]');
    let opt = btn.dataset.opt || '';
    if (host) { const c = $('.chip.is-active', host); if (c) opt = c.textContent.trim(); }
    cart.push({ id: btn.dataset.id || '', name: btn.dataset.name, price: +btn.dataset.price, opt, img: btn.dataset.img || '', q: 1 });
    save(); say('Reserved'); openC();
  });

  // public API for page-level scripts (collection, product)
  window.AXIA = { openCart: openC, closeCart: closeC, toast: say, addToCart(it) { cart.push({ q: 1, ...it }); save(); say('Reserved'); openC(); } };

  /* ---- Search overlay (built from the live catalogue) ---- */
  const fmtASearch = n => 'A$' + Number(n).toLocaleString('en-AU');
  const firstPhoto = p => (p.images && p.images[0])
    || (p.imagesByColor && (Object.values(p.imagesByColor).find(a => a && a.length) || [])[0])
    || (p.widths && ((p.widths.find(w => w.image) || {}).image))
    || null;
  const buildSearchIndex = () => {
    const P = (window.AXIA_PRODUCTS || []).filter(p => !p.hidden);
    const catName = p => (p.coll && p.coll.includes('titans')) ? 'Titan'
      : p.cat === 'bracelet' ? 'Bracelet' : p.cat === 'pendant' ? 'Pendant' : 'Chain';
    const pages = [
      { n: 'The Cuban', m: 'The signature collection', h: 'cuban.html', kw: 'cuban chain bracelet signature', img: 'assets/img/products/micro-pave-cuban-chain-15mm/1.jpg' },
      { n: 'The Titans', m: '18mm · the apex', h: 'titans.html', kw: 'titan emperor requiem ascendant 18mm apex', img: 'assets/img/products/the-emperor/1.jpg' },
      { n: 'Shop all', m: 'Every piece', h: 'collection.html', kw: 'shop all collection everything browse' },
    ];
    const items = P.map(p => ({
      n: p.name + (p.width ? ', ' + p.width : ''),
      m: [catName(p), (p.singlePrice ? '' : 'From ') + fmtASearch(p.fromPriceAUD)].join(' · '),
      h: p.linkTo || ('product.html?id=' + p.id),
      art: p.art || 'cuban',
      img: firstPhoto(p),
      kw: [p.name, p.width, p.cat, p.cons, (p.col || []).join(' '), (p.coll || []).join(' ')].join(' ').toLowerCase()
    }));
    return pages.concat(items);
  };
  let SEARCH_INDEX = buildSearchIndex();
  const srch = document.createElement('div');
  srch.className = 'srch'; srch.id = 'srch'; srch.setAttribute('aria-hidden', 'true');
  srch.innerHTML = '<div class="srch__panel" role="dialog" aria-label="Search AXIA">'
    + '<div class="srch__bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
    + '<input id="srchInput" type="search" placeholder="Search AXIA" autocomplete="off" spellcheck="false">'
    + '<button class="srch__close" data-search-close aria-label="Close search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>'
    + '<div class="srch__results" id="srchResults"></div></div>';
  document.body.appendChild(srch);
  const srchInput = $('#srchInput'), srchResults = $('#srchResults');
  const MONOGRAM = '<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor"><polygon points="16,6 7,26 10,26"/><polygon points="16,6 25,26 22,26"/><rect x="9.5" y="20" width="13" height="1.7"/></g></svg>';
  const srchThumb = i => i.img
    ? `<span class="srch__thumb"><img src="${i.img}" alt="" loading="lazy"></span>`
    : i.art
    ? `<span class="srch__thumb"><svg viewBox="${i.art === 'cross' ? '0 0 300 430' : '0 0 1000 620'}" data-sg="${i.art}" aria-hidden="true"></svg></span>`
    : `<span class="srch__thumb srch__thumb--page">${MONOGRAM}</span>`;
  const srchRender = q => {
    q = (q || '').trim().toLowerCase();
    const list = q ? SEARCH_INDEX.filter(i => (i.n + ' ' + i.m + ' ' + (i.kw || '')).toLowerCase().includes(q)) : SEARCH_INDEX;
    srchResults.innerHTML = list.length
      ? list.map(i => `<a class="srch__item" href="${i.h}">${srchThumb(i)}<span class="srch__txt"><span class="srch__n">${i.n}</span><span class="srch__m">${i.m}</span></span></a>`).join('')
      : '<p class="srch__empty">No matches. Try “Cuban”, “tennis” or “Titan”.</p>';
    // render placeholder jewellery thumbnails (real photos later)
    if (window.AXIA_art) $$('#srchResults [data-sg]').forEach(el => { try {
      const g = el.dataset.sg;
      if (g === 'tennis') window.AXIA_art.tennis(el);
      else if (g === 'cross') window.AXIA_art.cross(el);
      else if (g === 'cubanBracelet') window.AXIA_art.drape(el, { yTop: 250, yBot: 380, w: 52, h: 40, n: 14, iced: true });
      else window.AXIA_art.drape(el, { yTop: 250, yBot: 380, w: 66, h: 52, n: 11, iced: true });
    } catch (e) {} });
  };
  const openSearch = () => { SEARCH_INDEX = buildSearchIndex(); srch.classList.add('on'); srch.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; srchRender(''); setTimeout(() => srchInput.focus(), 40); };
  const closeSearch = () => { srch.classList.remove('on'); srch.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; srchInput.value = ''; };
  srchInput.addEventListener('input', e => srchRender(e.target.value));
  // Enter = browse the whole catalogue filtered by the query (not jump to one item; click a result for that)
  srchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { const q = srchInput.value.trim(); location.href = q ? 'collection.html?q=' + encodeURIComponent(q) : 'collection.html'; } });
  $$('[data-search-close]').forEach(b => b.onclick = closeSearch);
  srch.addEventListener('click', e => { if (e.target === srch) closeSearch(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });
  $$('[aria-label="Search"]').forEach(b => b.onclick = e => { e.preventDefault(); openSearch(); });

  /* ---- Back button (real history if you came from in-site, else a sensible parent) ---- */
  $$('[data-back]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    let sameOrigin = false;
    try { sameOrigin = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (_) {}
    if (sameOrigin && history.length > 1) history.back();
    else location.href = b.getAttribute('data-back') || 'collection.html';
  }));

  /* ---- Account + Checkout ---- */
  // Checkout is CLOSED until the First Drop goes live. Flip to true to open checkout.html.
  const CHECKOUT_OPEN = false;
  $$('[aria-label="Account"]').forEach(b => b.onclick = e => { e.preventDefault(); say('Accounts open when the First Drop drops. Join the list to get in first.'); });
  /* Only the cart drawer's Checkout button - never a form submit (e.g. the register button also uses .btn--block). */
  $$('.btn--cart.btn--block:not([type="submit"])').forEach(b => b.onclick = e => {
    e.preventDefault();
    if (!CHECKOUT_OPEN) { say('Your bag is saved. Checkout opens when the First Drop drops.'); return; }
    if (!cart.length) { say('Your bag is empty.'); return; }
    location.href = 'checkout.html';
  });
  // Checkout closed: make every cart-drawer note say so.
  if (!CHECKOUT_OPEN) $$('.drw__note').forEach(n => { n.textContent = 'Your bag is saved. Checkout opens when the First Drop drops.'; });

  /* ---- Drop-access form ---- */
  $$('[data-drop-form]').forEach(f => f.onsubmit = e => {
    e.preventDefault();
    const v = ($('input', f).value || '').trim(), note = (f.parentElement && f.parentElement.querySelector('.form-note')) || document.querySelector('.form-note');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { if (note) { note.textContent = 'Enter a valid email.'; note.classList.remove('ok'); } return; }
    if (note) { note.textContent = "You're on the list, we'll be in touch."; note.classList.add('ok'); }
    $('input', f).value = '';
  });
})();

/* pre-launch: sticky mobile "Join the First Drop" bar.
   Skipped on the PDP (its own sticky Add-to-Bag) and on the First Drop page itself. */
(function () {
  var page = (location.pathname.split('/').pop() || 'store').replace(/\.html$/, '');
  if (page === 'first-drop' || page === 'product' || page === 'cuban') return;
  var bar = document.createElement('a');
  bar.href = 'first-drop.html';
  bar.className = 'fdbar';
  bar.setAttribute('aria-label', 'Join the First Drop');
  bar.innerHTML = '<span>Enter to win a 15mm Micro Pavé Chain</span><span class="fdbar__arw" aria-hidden="true">&rarr;</span>';
  document.body.appendChild(bar);
  document.body.classList.add('has-fdbar');
})();

/* sitewide giveaway strip, pinned as the topmost bar so it never scrolls away.
   Skipped on the First Drop page, and on any page that already has one. */
/* Sticky countdown banner, site-wide. Takes the give-strip's pinned top slot so the nav/announce
   offsets (var(--give-h)) already account for it. Skipped where a page has its own countdown
   (first-drop hero, cuban's ccd, the landing's big bar). KEEP TARGET in sync with those pages. */
(function () {
  try {
    var page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    if (page === 'first-drop' || page === 'cuban' || page === 'index' || page === '' || page === 'about' || page === 'support' || page === 'product' || page === 'collection') return;
    if (document.querySelector('.give-strip, .cdbar')) return;
    var TARGET = new Date('2026-11-20T19:00:00+11:00').getTime(); /* PLACEHOLDER launch date - keep in sync with index/store/first-drop/cuban */
    if (!TARGET) return;
    var a = document.createElement('a');
    a.className = 'give-strip cdbar'; a.href = 'first-drop.html';
    /* LAUNCH TIMER NOT LIVE YET: the bar reads "Dropping soon" instead of a countdown.
       To go live, restore the <b id="scd-d">.. timer markup and the tick() loop below. */
    var LIVE = false;
    if (LIVE) {
      a.innerHTML = '<span class="cdbar__eye">The First Drop lands in</span><span class="cdbar__t"><b id="scd-d">--</b><i>d</i> <b id="scd-h">--</b><i>h</i> <b id="scd-m">--</b><i>m</i> <b id="scd-s">--</b><i>s</i></span><span class="cdbar__cta">Register &rarr;</span>';
    } else {
      a.innerHTML = '<span class="cdbar__eye">The First Drop</span><span class="cdbar__t">Dropping soon</span><span class="cdbar__cta">Register &rarr;</span>';
    }
    /* order: AXIA nav on top, announce carousel in the middle, countdown underneath */
    var ann = document.querySelector('.announce');
    if (ann && ann.parentNode) ann.parentNode.insertBefore(a, ann.nextSibling);
    else document.body.insertBefore(a, document.body.firstChild);
    document.documentElement.classList.add('has-cdbar');
    if (LIVE) {
      var d = a.querySelector('#scd-d'), h = a.querySelector('#scd-h'), m = a.querySelector('#scd-m'), s = a.querySelector('#scd-s');
      var p = function(n){ return (n<10?'0':'')+n; };
      var tick = function(){ var diff=TARGET-Date.now(); if(diff<0)diff=0; var t=Math.floor(diff/1000); d.textContent=p(Math.floor(t/86400)); h.textContent=p(Math.floor(t%86400/3600)); m.textContent=p(Math.floor(t%3600/60)); s.textContent=p(t%60); };
      tick(); setInterval(tick, 1000);
    }
  } catch (e) {}
})();

/* ---- Adaptive chrome: on mixed pages (dark hero + white body, or alternating
   sections) the sticky bars take the tone of whatever section sits directly behind
   them, dark over dark, light over light, and fade between the two, so the chrome
   is always flush with the page and never zebra-stripes it. ---- */
(function () {
  try {
    var body = document.body;
    if (!body || !body.classList.contains('chrome-adaptive')) return;
    var nav = document.querySelector('.nav');
    if (!nav) return;
    /* luminance of a single colour string, or null if it's (near-)transparent */
    function lum(str) {
      var m = str && str.match(/rgba?\(([^)]+)\)/);
      if (m) { var p = m[1].split(',').map(parseFloat); if (p.length >= 4 && p[3] < 0.35) return null; return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]; }
      var h = str && str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (h) { var s = h[1]; if (s.length === 3) s = s[0]+s[0]+s[1]+s[1]+s[2]+s[2]; var r = parseInt(s.slice(0,2),16), g = parseInt(s.slice(2,4),16), b = parseInt(s.slice(4,6),16); return 0.2126*r + 0.7152*g + 0.0722*b; }
      return null;
    }
    /* tone of an element's OWN background: true=dark, false=light, null=none.
       Reads solid colours first, then averages a gradient's opaque colour stops, so
       gradient heroes count too, but always the element's own paint, never an overlay
       on top of it, so intros/modals can't mislead us. */
    function tone(el) {
      var cs = getComputedStyle(el);
      var L = lum(cs.backgroundColor);
      if (L !== null) return L < 110;
      var img = cs.backgroundImage;
      if (img && img.indexOf('gradient') >= 0) {
        var cols = img.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi) || [];
        var sum = 0, n = 0;
        cols.forEach(function (c) { var v = lum(c); if (v !== null) { sum += v; n++; } });
        if (n > 0) return (sum / n) < 110;
      }
      return null;
    }
    var bands = [], bodyDark = false;
    function collect() {
      bands = [];
      bodyDark = tone(body) === true; /* the page ground, when sections are transparent */
      Array.prototype.forEach.call(
        document.querySelectorAll('section, footer, [data-band-dark], [data-band-light]'),
        function (el) {
          if (el.offsetHeight <= 40) return;
          var t = el.hasAttribute('data-band-dark') ? true
                : el.hasAttribute('data-band-light') ? false
                : tone(el);
          if (t !== null) bands.push({ el: el, dark: t });
        }
      );
    }
    var ticking = false;
    function apply() {
      ticking = false;
      /* the chrome's lower edge = the bottom of its lowest bar (nav, announce, or countdown) */
      var y = 0;
      [nav, document.querySelector('.announce'), document.querySelector('.cdbar')].forEach(function (b) {
        if (b) { var bb = b.getBoundingClientRect().bottom; if (bb > y) y = bb; }
      });
      y += 3;
      var chosen = null;
      bands.forEach(function (b) { var r = b.el.getBoundingClientRect(); if (r.top <= y && r.bottom > y) chosen = b; });
      var dark = chosen ? chosen.dark : bodyDark;
      body.classList.toggle('chrome-dark', dark);
      body.classList.toggle('chrome-light', !dark);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(apply); } }
    collect(); apply();
    addEventListener('load', function () { collect(); apply(); });
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', function () { collect(); onScroll(); }, { passive: true });
  } catch (e) {}
})();

/* Make autoplay videos actually start on mobile (iOS needs muted + playsinline, and often a play() nudge). */
(function () {
  var vids = document.querySelectorAll('video[autoplay]');
  if (!vids.length) return;
  function kick(v) { try { v.muted = true; v.defaultMuted = true; v.setAttribute('muted', ''); v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  vids.forEach(function (v) { kick(v); v.addEventListener('loadedmetadata', function () { kick(v); }, { once: true }); v.addEventListener('canplay', function () { kick(v); }, { once: true }); });
  var once = function () { vids.forEach(kick); };
  ['touchstart', 'pointerdown', 'click', 'scroll'].forEach(function (ev) { addEventListener(ev, once, { once: true, passive: true }); });
})();

/* ---- First Access coupon modal: one well-timed popup on the shop (NOT the landing or the register page) ----
   Trigger = 45% scroll depth OR 18s on page, whichever first. Shown at most once per session; a dismiss
   suppresses it for 4 days, registering for 60. Offers 15% off (issued on registration; no code shown). */
(function () {
  var page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  // Skip the landing (root/index), the register page itself, checkout and legal pages.
  if (page === '' || page === 'index' || page === 'first-drop' || page === 'checkout' || page === 'terms') return;
  var KEY = 'axia_promo';
  function suppressed() {
    try { if (sessionStorage.getItem('axia_promo_s')) return true; } catch (e) {}
    try { return Date.now() < (+localStorage.getItem(KEY) || 0); } catch (e) { return false; }
  }
  function suppress(days) { try { localStorage.setItem(KEY, Date.now() + days * 864e5); } catch (e) {} }
  if (suppressed() || document.querySelector('.promo')) return;

  var m = document.createElement('div');
  m.className = 'promo'; m.id = 'axiaPromo';
  m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'promoTitle');
  m.hidden = true;
  m.innerHTML =
    '<div class="promo__ov" data-promo-close></div>' +
    '<div class="promo__card">' +
      '<button class="promo__x" type="button" data-promo-close aria-label="Close">×</button>' +
      '<span class="promo__eye">First Drop · First Access</span>' +
      '<h3 class="promo__h" id="promoTitle">Secure your spot</h3>' +
      '<p class="promo__p">Register for First Access and get in before the First Drop opens to the public.</p>' +
      '<div class="promo__coupon"><span class="promo__off">15% off</span><span class="promo__coupontxt">your first order<br><b>when you register</b></span></div>' +
      '<div class="promo__btns">' +
        '<a class="promo__reg" href="first-drop.html">Register &amp; enter the draw</a>' +
        '<button class="promo__no" type="button" data-promo-close data-promo-dismiss>No thanks, I’ll pay full price</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);

  var fired = false, prevFocus = null;
  function open() {
    if (fired || suppressed()) return; fired = true;
    try { sessionStorage.setItem('axia_promo_s', '1'); } catch (e) {} // once shown, don't re-open this session (even across pages)
    prevFocus = document.activeElement;
    m.hidden = false; document.body.classList.add('promo-open');
    var r = m.querySelector('.promo__reg'); if (r) r.focus();
  }
  function close(days) {
    try { sessionStorage.setItem('axia_promo_s', '1'); } catch (e) {}
    if (days) suppress(days);
    m.hidden = true; document.body.classList.remove('promo-open');
    if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} }
  }
  m.addEventListener('click', function (e) {
    var t = e.target.closest('[data-promo-close]');
    if (t) close(t.hasAttribute('data-promo-dismiss') ? 4 : 0);
  });
  m.querySelector('.promo__reg').addEventListener('click', function () { close(60); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && !m.hidden) close(0); });

  var timer = setTimeout(open, 18000);
  function onScroll() {
    var h = document.documentElement.scrollHeight - innerHeight;
    if (h > 200 && (pageYOffset / h) > 0.45) { clearTimeout(timer); removeEventListener('scroll', onScroll); open(); }
  }
  addEventListener('scroll', onScroll, { passive: true });
})();
