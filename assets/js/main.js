/* =============================================================
   MAISON ADAMAS - interaction layer
   ============================================================= */
(function () {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const fmt = (n) => '$' + n.toLocaleString('en-US');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Nav: solid on scroll ---------- */
  const nav = $('.nav');
  if (nav) {
    const forced = nav.classList.contains('is-forced');
    const onScroll = () => {
      if (forced) return;
      nav.classList.toggle('is-solid', window.scrollY > 40);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  const mMenu = $('.mobile-menu');
  $$('[data-menu-open]').forEach(b => b.addEventListener('click', () => { mMenu && mMenu.classList.add('open'); document.body.style.overflow = 'hidden'; }));
  $$('[data-menu-close]').forEach(b => b.addEventListener('click', () => { mMenu && mMenu.classList.remove('open'); document.body.style.overflow = ''; }));

  /* ---------- Reveal on scroll ---------- */
  const revealEls = $$('.reveal');
  if (revealEls.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      revealEls.forEach(el => el.classList.add('in'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      revealEls.forEach(el => io.observe(el));
    }
  }

  /* ---------- Accordions ---------- */
  $$('.acc__head').forEach(head => {
    head.addEventListener('click', () => {
      const item = head.closest('.acc__item');
      const panel = $('.acc__panel', item);
      const open = item.classList.toggle('open');
      head.setAttribute('aria-expanded', open);
      panel.style.maxHeight = open ? panel.scrollHeight + 'px' : 0;
    });
  });

  /* ---------- Filter bar (collections) ---------- */
  $$('.filter-bar').forEach(bar => {
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      $$('button', bar).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.filter;
      $$('[data-cat]').forEach(card => {
        const show = cat === 'all' || card.dataset.cat === cat;
        card.style.display = show ? '' : 'none';
      });
    });
  });

  /* ---------- Product configurator (PDP) ---------- */
  $$('.opt-row').forEach(row => {
    row.addEventListener('click', (e) => {
      const opt = e.target.closest('.opt'); if (!opt) return;
      $$('.opt', row).forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const group = row.closest('.opt-group');
      const val = $('.opt-group__label .val', group);
      if (val) val.textContent = opt.dataset.value || opt.textContent.trim();
    });
  });

  /* ---------- Toast ---------- */
  const toast = $('#toast');
  let toastTimer;
  function showToast(msg) {
    if (!toast) return;
    $('.toast__msg', toast).textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  /* ---------- Cart (localStorage) ---------- */
  const CART_KEY = 'adamas_cart';
  const loadCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } };
  const saveCart = (c) => localStorage.setItem(CART_KEY, JSON.stringify(c));
  let cart = loadCart();

  const drawer = $('#cart-drawer');
  const overlay = $('#overlay');
  const countEl = $('.cart-count');

  function openDrawer() { drawer && drawer.classList.add('open'); overlay && overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeDrawer() { drawer && drawer.classList.remove('open'); overlay && overlay.classList.remove('open'); document.body.style.overflow = ''; }

  $$('[data-cart-open]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); }));
  $$('[data-cart-close]').forEach(b => b.addEventListener('click', closeDrawer));
  overlay && overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  function cartCount() { return cart.reduce((n, i) => n + i.qty, 0); }
  function cartTotal() { return cart.reduce((n, i) => n + i.price * i.qty, 0); }

  function renderCount() {
    if (!countEl) return;
    const n = cartCount();
    countEl.textContent = n;
    countEl.classList.toggle('show', n > 0);
  }

  function renderCart() {
    const body = $('#cart-body');
    const foot = $('#cart-foot');
    if (!body) { renderCount(); return; }
    if (!cart.length) {
      body.innerHTML = `<div class="drawer__empty">
          <div class="art" data-art="box"></div>
          <p>Your selection is empty</p>
          <span>Every piece begins a legacy.</span>
        </div>`;
      $$('[data-art]', body).forEach(el => window.AdamasArt && window.AdamasArt.render(el));
      if (foot) foot.style.display = 'none';
      renderCount();
      return;
    }
    body.innerHTML = cart.map((it, i) => `
      <div class="cart-item">
        <div class="cart-item__media"><div class="art" data-art="${it.art}"></div></div>
        <div>
          <div class="cart-item__name">${it.name}</div>
          <div class="cart-item__opt">${it.opts || ''}</div>
          <div class="cart-item__qty">
            <button data-dec="${i}" aria-label="Decrease quantity">&minus;</button>
            <span>${it.qty}</span>
            <button data-inc="${i}" aria-label="Increase quantity">+</button>
          </div>
          <button class="cart-item__remove" data-rm="${i}">Remove</button>
        </div>
        <div class="cart-item__price">${fmt(it.price * it.qty)}</div>
      </div>`).join('');
    $$('[data-art]', body).forEach(el => window.AdamasArt && window.AdamasArt.render(el));
    if (foot) { foot.style.display = ''; $('#cart-total', foot).textContent = fmt(cartTotal()); }
    renderCount();
  }

  function addToCart(item) {
    const key = item.name + '|' + (item.opts || '');
    const existing = cart.find(i => (i.name + '|' + (i.opts || '')) === key);
    if (existing) existing.qty += item.qty || 1;
    else cart.push({ ...item, qty: item.qty || 1 });
    saveCart(cart); renderCart();
  }

  // qty +/- and remove (delegated)
  $('#cart-body') && $('#cart-body').addEventListener('click', (e) => {
    const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]'), rm = e.target.closest('[data-rm]');
    if (inc) { cart[+inc.dataset.inc].qty++; }
    else if (dec) { const i = +dec.dataset.dec; cart[i].qty--; if (cart[i].qty < 1) cart.splice(i, 1); }
    else if (rm) { cart.splice(+rm.dataset.rm, 1); }
    else return;
    saveCart(cart); renderCart();
  });

  // Add-to-bag buttons
  $$('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const price = +btn.dataset.price;
      const art = btn.dataset.cartArt || btn.dataset.art || 'gem';
      let opts = btn.dataset.opts || '';
      // If on a PDP, gather selected options
      const info = btn.closest('.pdp__info') || btn.closest('[data-product]');
      if (info) {
        const chosen = $$('.opt-group', info).map(g => {
          const a = $('.opt.active', g);
          return a ? (a.dataset.value || a.textContent.trim()) : null;
        }).filter(Boolean);
        if (chosen.length) opts = chosen.join(' · ');
      }
      addToCart({ name, price, art, opts });
      showToast('Added to your selection');
      openDrawer();
    });
  });

  /* ---------- Newsletter ---------- */
  $$('.circle__form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('input', form);
      const note = $('.circle__note');
      const val = (input.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
        if (note) { note.textContent = 'Please enter a valid email address.'; note.classList.remove('ok'); }
        input.focus();
        return;
      }
      if (note) { note.textContent = 'Welcome to the Circle. Watch your inbox.'; note.classList.add('ok'); }
      input.value = '';
    });
  });

  /* ---------- init ---------- */
  renderCart();
})();
