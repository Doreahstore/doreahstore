/* ============================================================
   DOREAH — Storefront logic
   ============================================================ */
'use strict';

/* ---------- Settings (from config.js) ---------- */
const SHOP = Object.assign(
  { freeShippingThreshold: 50, instagram: '', tiktok: '', facebook: '', email: '' },
  typeof STORE !== 'undefined' ? STORE : {}
);
const WA_NUMBER = typeof WHATSAPP_NUMBER !== 'undefined' ? String(WHATSAPP_NUMBER).replace(/\D/g, '') : '';

/* ---------- Firebase ---------- */
let db = null;
try {
  if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined' &&
      firebaseConfig.apiKey && !/^YOUR_/.test(firebaseConfig.apiKey)) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  }
} catch (e) { console.warn('Firebase not configured yet:', e); }

/* ---------- Tiny helpers ---------- */
const $  = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n || 0).toFixed(2);
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '';
const slugify = s => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const waLink = text => `https://wa.me/${WA_NUMBER}${text ? '?text=' + encodeURIComponent(text) : ''}`;

/* ---------- Demo products (shown until Firebase has real ones) ---------- */
const DEMO_PRODUCTS = [
  { id: 'demo-trio', name: 'Doreah Trio Kit', price: 17, salePrice: null, category: 'Kits & Sets', favorite: true, badge: 'Signature Kit',
    description: 'Three best-selling shades in one kit — the perfect gift (or treat for yourself).', image: '' },
  { id: 'demo-gloss', name: 'Champagne Gloss', price: 16, salePrice: 13, category: 'Lip Glosses', favorite: true, badge: 'New In',
    description: 'High-shine, non-sticky gloss with a soft champagne shimmer.', image: '' },
  { id: 'demo-matte', name: 'Matte Lipstick', price: 18, salePrice: null, category: 'Matte Lipsticks', favorite: true, badge: '',
    description: 'Velvet-matte colour with 12-hour wear that never dries your lips.', image: '',
    variants: [
      { name: 'Bark Red', color: '#7a1f1f' },
      { name: 'Rosewood', color: '#a8545a' },
      { name: 'Berry Bold', color: '#6b1d3a', price: 20 }
    ] }
];

const state = { products: [], settings: {}, category: 'All', search: '', sort: 'new' };

/* ============================================================
   PRODUCT HELPERS
   ============================================================ */
const hasVariants = p => Array.isArray(p.variants) && p.variants.length > 0;
const getVariant  = (p, i) => hasVariants(p) ? (p.variants[i] || p.variants[0]) : null;
const findProduct = id => state.products.find(p => p.id === id);
const inStock     = (p, v) => p.inStock !== false && !(v && v.inStock === false);
const imageOf     = (p, v) => (v && v.image) || p.image || (hasVariants(p) ? (p.variants.find(x => x.image) || {}).image : '') || '';

function pricing(p, v) {
  const price = num(v && v.price) ?? num(p.price) ?? 0;
  const sale  = num(v && v.salePrice) ?? num(p.salePrice);
  return { price, sale: sale !== null && sale < price ? sale : null };
}
const unitPrice = pr => pr.sale ?? pr.price;
const onSale = p => hasVariants(p) ? p.variants.some(v => pricing(p, v).sale !== null) : pricing(p, null).sale !== null;

function priceHtml(pr) {
  return pr.sale !== null
    ? `<s>${money(pr.price)}</s><span class="sale">${money(pr.sale)}</span>`
    : `<span>${money(pr.price)}</span>`;
}
function mediaHtml(src, alt, eager) {
  return src
    ? `<img src="${esc(src)}" alt="${esc(alt)}"${eager ? '' : ' loading="lazy"'} decoding="async">`
    : `<span class="img-fallback" aria-hidden="true">D</span>`;
}
function badgeFor(p, v) {
  if (!inStock(p, v)) return { text: 'Sold Out', cls: 'out' };
  if (p.badge) return { text: p.badge, cls: '' };
  const pr = pricing(p, v);
  if (pr.sale !== null) return { text: `−${Math.round((1 - pr.sale / pr.price) * 100)}%`, cls: 'sale' };
  return null;
}
const badgeHtml = b => b ? `<span class="product-badge ${b.cls}">${esc(b.text)}</span>` : '';

function swatchesHtml(p, active, limit) {
  if (!hasVariants(p)) return '';
  const list = limit ? p.variants.slice(0, limit) : p.variants;
  const extra = limit && p.variants.length > limit
    ? `<button type="button" class="swatch-more" data-action="quick-view">+${p.variants.length - limit}</button>` : '';
  return `<div class="swatches">${list.map((v, i) => {
    const c = safeColor(v.color);
    const cls = ['swatch', c ? '' : 'text', i === active ? 'active' : '', inStock(p, v) ? '' : 'is-out'].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-action="pick-variant" data-index="${i}" title="${esc(v.name)}" aria-label="${esc(v.name)}" aria-pressed="${i === active}"${c ? ` style="--sw:${c}"` : ''}>${c ? '' : esc(v.name)}</button>`;
  }).join('')}${extra}</div>`;
}

function productCard(p, i = 0) {
  const v = getVariant(p, 0);
  const ok = inStock(p, v);
  return `
  <article class="product-card reveal${ok ? '' : ' is-out'}" data-id="${esc(p.id)}" data-variant="0" style="--d:${i % 4}">
    <button type="button" class="product-img" data-action="quick-view" aria-label="Quick view: ${esc(p.name)}">
      <span data-badge>${badgeHtml(badgeFor(p, v))}</span>
      <span class="media" data-media>${mediaHtml(imageOf(p, v), p.name)}</span>
      <span class="quick-label">Quick View</span>
    </button>
    <div class="product-info">
      ${p.category ? `<span class="product-cat">${esc(p.category)}</span>` : ''}
      <h3 class="product-title">${esc(p.name)}</h3>
      <div class="product-price" data-price>${priceHtml(pricing(p, v))}</div>
      ${swatchesHtml(p, 0, 6)}
      ${v ? `<div class="variant-name" data-vname>${esc(v.name)}</div>` : ''}
    </div>
    <button type="button" class="add-to-cart-btn" data-action="add"${ok ? '' : ' disabled'}>${ok ? 'Add to Bag' : 'Sold Out'}</button>
  </article>`;
}

// Swaps price / photo / badge when a shade swatch is tapped (works in cards AND quick view)
function selectVariant(root, i) {
  const p = findProduct(root.dataset.id);
  if (!p || !hasVariants(p)) return;
  const v = getVariant(p, i);
  const ok = inStock(p, v);
  root.dataset.variant = i;
  $('[data-price]', root).innerHTML = priceHtml(pricing(p, v));
  const vn = $('[data-vname]', root); if (vn) vn.textContent = v.name;
  const b = $('[data-badge]', root); if (b) b.innerHTML = badgeHtml(badgeFor(p, v));

  const media = $('[data-media]', root);
  const src = imageOf(p, v);
  const img = $('img', media);
  if (src && img) {
    if (img.getAttribute('src') !== src) { img.style.opacity = '.35'; img.onload = () => { img.style.opacity = ''; }; img.src = src; }
  } else {
    media.innerHTML = mediaHtml(src, p.name, true);
  }
  $$('.swatch', root).forEach(s => {
    const on = Number(s.dataset.index) === i;
    s.classList.toggle('active', on);
    s.setAttribute('aria-pressed', on);
  });
  root.classList.toggle('is-out', !ok);
  const btn = $('[data-action="add"]', root);
  btn.disabled = !ok;
  btn.textContent = ok ? 'Add to Bag' : 'Sold Out';
}

/* ============================================================
   RENDERING
   ============================================================ */
const skeletons = n => Array.from({ length: n }, () =>
  `<div class="skeleton"><div class="sk sk-img"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>`).join('');

function categoryList() {
  const counts = new Map();
  state.products.forEach(p => { if (p.category) counts.set(p.category, (counts.get(p.category) || 0) + 1); });
  return [...counts.entries()];
}

function renderFavorites() {
  const wrap = $('#favorites-grid');
  let favs = state.products.filter(p => p.favorite);
  if (!favs.length) favs = state.products.slice(0, 4); // fall back to newest
  wrap.innerHTML = favs.map(productCard).join('');
  observeReveals(wrap);
}

function collectionImage(category) {
  const s = state.settings[slugify(category)];
  if (s && s.locked && s.image) return s.image;
  for (const p of state.products) {           // newest first
    if (p.category !== category) continue;
    const img = imageOf(p, getVariant(p, 0));
    if (img) return img;
  }
  return '';
}

function renderCollections() {
  const wrap = $('#collections-grid');
  const cats = categoryList();
  $('#collections').hidden = cats.length === 0;
  wrap.innerHTML = cats.map(([cat, count], i) => {
    const img = collectionImage(cat);
    const s = state.settings[slugify(cat)] || {};
    const tag = s.tagline || `${count} ${count === 1 ? 'product' : 'products'}`;
    return `
    <button type="button" class="collection-card reveal" style="--d:${i % 3}" data-action="filter" data-category="${esc(cat)}">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}
      <span class="overlay"></span>
      <span class="label">
        <span class="label-tag">${esc(tag)}</span>
        <span class="label-title">${esc(cat)}</span>
        <span class="label-cta">Shop now →</span>
      </span>
    </button>`;
  }).join('');
  observeReveals(wrap);
}

function renderChips() {
  const chips = [['All', state.products.length], ...categoryList()];
  const saleCount = state.products.filter(onSale).length;
  if (saleCount) chips.push(['On Sale', saleCount]);
  $('#category-chips').innerHTML = chips.map(([c, n]) =>
    `<button type="button" class="chip${state.category === c ? ' active' : ''}" data-action="filter" data-category="${esc(c)}" data-stay="1" aria-pressed="${state.category === c}">${esc(c)}<small>${n}</small></button>`
  ).join('');
}

function visibleProducts() {
  const words = state.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let list = state.products.filter(p => {
    if (state.category === 'On Sale') { if (!onSale(p)) return false; }
    else if (state.category !== 'All' && p.category !== state.category) return false;
    if (!words.length) return true;
    const hay = [p.name, p.category, p.description, p.badge, ...(hasVariants(p) ? p.variants.map(v => v.name) : [])]
      .join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
  const price = p => unitPrice(pricing(p, getVariant(p, 0)));
  const sorters = {
    'price-asc':  (a, b) => price(a) - price(b),
    'price-desc': (a, b) => price(b) - price(a),
    'name':       (a, b) => String(a.name).localeCompare(String(b.name))
  };
  if (sorters[state.sort]) list = [...list].sort(sorters[state.sort]);
  // Sold-out items always sink to the bottom
  return [...list].sort((a, b) => (inStock(a) ? 0 : 1) - (inStock(b) ? 0 : 1));
}

function renderProducts() {
  const wrap = $('#products-grid');
  const list = visibleProducts();
  const filtered = state.category !== 'All' || state.search.trim();
  $('#result-meta').innerHTML = filtered
    ? `Showing <strong>${list.length}</strong> of ${state.products.length} · <button type="button" class="link-btn" data-action="clear-filters">Clear filters</button>`
    : `${state.products.length} ${state.products.length === 1 ? 'product' : 'products'}`;
  wrap.innerHTML = list.length
    ? list.map(productCard).join('')
    : `<div class="empty-state"><p>Nothing matches “${esc(state.search.trim() || state.category)}” yet.</p>
       <button type="button" class="btn btn-dark" data-action="clear-filters">Show everything</button></div>`;
  observeReveals(wrap);
}

function setFilter(category, scroll) {
  state.category = category;
  renderChips();
  renderProducts();
  if (scroll) $('#shop').scrollIntoView({ behavior: 'smooth' });
}

function renderAll() {
  renderFavorites();
  renderCollections();
  renderChips();
  renderProducts();
}

/* ---------- Reveal on scroll ---------- */
const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target;
      el.classList.add('in');
      revealObserver.unobserve(el);
      setTimeout(() => el.style.removeProperty('--d'), 1100); // drop stagger so hover feels instant
    }), { rootMargin: '0px 0px -40px 0px', threshold: 0.06 })
  : null;
function observeReveals(root = document) {
  $$('.reveal:not(.in)', root).forEach(el => revealObserver ? revealObserver.observe(el) : el.classList.add('in'));
}

/* ============================================================
   QUICK VIEW
   ============================================================ */
let lastFocus = null;

function openQuickView(id, vi = 0) {
  const p = findProduct(id);
  if (!p) return;
  const v = getVariant(p, vi);
  const ok = inStock(p, v);
  const t = Number(SHOP.freeShippingThreshold) || 0;
  $('#qv-body').innerHTML = `
  <div class="qv${ok ? '' : ' is-out'}" data-id="${esc(p.id)}" data-variant="${vi}">
    <div class="qv-media">
      <span data-badge>${badgeHtml(badgeFor(p, v))}</span>
      <span class="media" data-media>${mediaHtml(imageOf(p, v), p.name, true)}</span>
    </div>
    <div class="qv-info">
      ${p.category ? `<span class="product-cat">${esc(p.category)}</span>` : ''}
      <h2 class="product-title" id="qv-title">${esc(p.name)}</h2>
      <div class="product-price" data-price>${priceHtml(pricing(p, v))}</div>
      ${p.description ? `<p class="qv-desc">${esc(p.description)}</p>` : ''}
      ${v ? `<div><div class="qv-label">Shade: <span data-vname>${esc(v.name)}</span></div>${swatchesHtml(p, vi)}</div>` : ''}
      <div class="qv-actions">
        <div class="qty">
          <button type="button" data-action="qv-qty" data-delta="-1" aria-label="Decrease quantity">−</button>
          <span data-qty>1</span>
          <button type="button" data-action="qv-qty" data-delta="1" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="add-to-cart-btn" data-action="add"${ok ? '' : ' disabled'}>${ok ? 'Add to Bag' : 'Sold Out'}</button>
      </div>
      <ul class="qv-perks">
        <li>Order in seconds on WhatsApp</li>
        ${t ? `<li>Free shipping on orders over ${money(t)}</li>` : ''}
        <li>Cruelty-free formula</li>
      </ul>
      <button type="button" class="link-btn qv-share" data-action="share">Share this product</button>
    </div>
  </div>`;
  lastFocus = document.activeElement;
  const modal = $('#quick-view');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('locked', 'modal-open');
  setTimeout(() => $('.modal-close', modal).focus({ preventScroll: true }), 60);
  history.replaceState(null, '', '#p-' + encodeURIComponent(p.id));
}

function closeModal() {
  const modal = $('#quick-view');
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (!$('#cart-drawer').classList.contains('open')) document.body.classList.remove('locked');
  history.replaceState(null, '', location.pathname + location.search);
  if (lastFocus) lastFocus.focus({ preventScroll: true });
}

async function shareProduct(root) {
  const p = findProduct(root.dataset.id);
  const url = location.origin + location.pathname + '#p-' + encodeURIComponent(p.id);
  const data = { title: `${p.name} — Doreah Beauty`, text: `Look at this ${p.name} from Doreah 💄`, url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    toast('Link copied — paste it anywhere!');
  } catch (e) { /* user cancelled */ }
}

function openFromHash() {
  const m = location.hash.match(/^#p-(.+)$/);
  if (m) openQuickView(decodeURIComponent(m[1]));
}

/* ============================================================
   CART
   ============================================================ */
const CART_KEY = 'doreah_cart';
const CUSTOMER_KEY = 'doreah_customer';

function getCart() {
  try {
    const c = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(c) ? c.filter(i => i && i.id && i.qty > 0) : [];
  } catch { return []; }
}
function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* private mode */ }
  renderCart();
}
const cartSubtotal = cart => cart.reduce((s, i) => s + i.price * i.qty, 0);

function addToCart(p, vi, qty) {
  const v = getVariant(p, vi);
  if (!inStock(p, v)) { toast('Sorry — that one is sold out.'); return false; }
  const key = v ? `${p.id}::${v.name}` : p.id;
  const cart = getCart();
  const existing = cart.find(i => i.id === key);
  if (existing) existing.qty = Math.min(99, existing.qty + qty);
  else cart.push({
    id: key, productId: p.id, name: p.name, variantName: v ? v.name : '',
    price: unitPrice(pricing(p, v)), image: imageOf(p, v), qty
  });
  saveCart(cart);
  const cc = $('#cart-count');
  cc.classList.remove('bump'); void cc.offsetWidth; cc.classList.add('bump');
  toast(`${p.name}${v ? ' — ' + v.name : ''} added`, 'View Bag', openCart);
  return true;
}

function addFromRoot(root, btn) {
  const p = findProduct(root.dataset.id);
  if (!p) return;
  const qtyEl = $('[data-qty]', root);
  const qty = qtyEl ? Number(qtyEl.textContent) || 1 : 1;
  if (!addToCart(p, Number(root.dataset.variant || 0), qty)) return;
  btn.classList.add('added');
  btn.textContent = 'Added ✓';
  setTimeout(() => { btn.classList.remove('added'); btn.textContent = 'Add to Bag'; }, 1400);
  if (root.classList.contains('qv')) setTimeout(closeModal, 350);
}

function updateQty(key, delta) {
  const cart = getCart();
  const item = cart.find(i => i.id === key);
  if (!item) return;
  item.qty = Math.min(99, item.qty + delta);
  saveCart(item.qty <= 0 ? cart.filter(i => i.id !== key) : cart);
}
function removeFromCart(key) { saveCart(getCart().filter(i => i.id !== key)); }

// Keep bag prices/photos up to date if you change them in the admin
function reconcileCart() {
  const cart = getCart();
  cart.forEach(item => {
    const p = item.productId && findProduct(item.productId);
    if (!p) return;
    let v = null;
    if (hasVariants(p)) { v = p.variants.find(x => x.name === item.variantName); if (!v) return; }
    item.price = unitPrice(pricing(p, v));
    item.name = p.name;
    item.image = imageOf(p, v) || item.image;
  });
  saveCart(cart);
}

function renderCart() {
  const cart = getCart();
  const count = cart.reduce((n, i) => n + i.qty, 0);
  const sub = cartSubtotal(cart);

  const cc = $('#cart-count');
  cc.textContent = count;
  cc.hidden = count === 0;
  $('#cart-heading-count').textContent = count ? `(${count})` : '';

  const ship = $('#ship-progress');
  const t = Number(SHOP.freeShippingThreshold) || 0;
  if (!t || !cart.length) ship.hidden = true;
  else {
    ship.hidden = false;
    const left = t - sub;
    ship.innerHTML = (left > 0
      ? `You're <strong>${money(left)}</strong> away from <strong>free shipping</strong>`
      : `🎉 You've unlocked <strong>free shipping!</strong>`) +
      `<div class="ship-bar"><span style="width:${Math.min(100, (sub / t) * 100).toFixed(1)}%"></span></div>`;
  }

  const empty = cart.length === 0;
  $('#checkout-form').hidden = empty;
  $('#cart-footer').hidden = empty;
  if (empty) {
    $('#cart-items').innerHTML = `
      <div class="cart-empty">
        <svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7V6a3 3 0 0 1 6 0v1"/></svg>
        <p>Your bag is empty</p>
        <button type="button" class="btn btn-dark" data-action="shop-now">Start shopping</button>
      </div>`;
    return;
  }
  $('#cart-items').innerHTML = cart.map(i => `
    <div class="cart-item">
      ${i.image ? `<img class="cart-item-img" src="${esc(i.image)}" alt="">` : `<span class="cart-item-img">D</span>`}
      <div class="cart-item-info">
        <div class="cart-item-top">
          <div><h5>${esc(i.name)}</h5>${i.variantName ? `<div class="variant">${esc(i.variantName)}</div>` : ''}</div>
          <span class="line-total">${money(i.price * i.qty)}</span>
        </div>
        <div class="cart-item-bottom">
          <div class="qty">
            <button type="button" data-action="qty" data-key="${esc(i.id)}" data-delta="-1" aria-label="Decrease">−</button>
            <span>${i.qty}</span>
            <button type="button" data-action="qty" data-key="${esc(i.id)}" data-delta="1" aria-label="Increase">+</button>
          </div>
          <button type="button" class="remove-item" data-action="remove" data-key="${esc(i.id)}">Remove</button>
        </div>
      </div>
    </div>`).join('');
  $('#cart-subtotal-amount').textContent = money(sub);
}

function openCart() {
  closeModal();
  $('#cart-overlay').classList.add('open');
  const d = $('#cart-drawer');
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  document.body.classList.add('locked', 'cart-open');
  setTimeout(() => $('.icon-btn', d).focus({ preventScroll: true }), 80);
}
function closeCart() {
  $('#cart-overlay').classList.remove('open');
  const d = $('#cart-drawer');
  d.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('locked', 'cart-open');
}

/* ---------- Checkout → WhatsApp ---------- */
let lastOrderUrl = '';

function setMethod(method) {
  $$('#checkout-form .segmented label').forEach(l => l.classList.toggle('on', $('input', l).checked));
  $('#address-field').hidden = method === 'Pickup';
}

// Order IDs like DB-KX4F9-7QM: time-based + random, so nobody can guess someone else's
function makeOrderId() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rnd = new Uint32Array(3);
  (window.crypto || window.msCrypto).getRandomValues(rnd);
  let t = Date.now(), time = '';
  while (t > 0) { time = abc[t % abc.length] + time; t = Math.floor(t / abc.length); }
  return 'DB-' + time.slice(-5) + '-' + Array.from(rnd, n => abc[n % abc.length]).join('');
}
const trackUrl = id => new URL('track.html?id=' + encodeURIComponent(id), location.href).href;

function rememberOrder(orderId) {
  try {
    const list = JSON.parse(localStorage.getItem('doreah_my_orders') || '[]').filter(x => x.id !== orderId);
    list.unshift({ id: orderId, at: Date.now() });
    localStorage.setItem('doreah_my_orders', JSON.stringify(list.slice(0, 10)));
  } catch { /* ignore */ }
}

function checkout() {
  const cart = getCart();
  if (!cart.length) return;
  const f = $('#checkout-form').elements;
  const name = f.name.value.trim();
  const phone = f.phone.value.trim();
  const method = f.method.value || 'Delivery';
  const address = f.address.value.trim();
  const note = f.note.value.trim();
  const err = $('#checkout-error');

  if (!name) { err.textContent = 'Please add your name so we know who is ordering.'; f.name.focus(); return; }
  if (phone.replace(/\D/g, '').length < 7) { err.textContent = 'Please add your WhatsApp number so we can send you tracking updates.'; f.phone.focus(); return; }
  if (method === 'Delivery' && !address) { err.textContent = 'Please add your delivery address.'; f.address.focus(); return; }
  if (!WA_NUMBER) { err.textContent = 'WhatsApp number is missing in config.js.'; return; }
  err.textContent = '';

  try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name, phone, method, address })); } catch { /* ignore */ }

  const sub = cartSubtotal(cart);
  const t = Number(SHOP.freeShippingThreshold) || 0;
  const orderId = makeOrderId();
  const shipping = method === 'Pickup' ? 'Pickup' : (t && sub >= t ? 'Delivery — FREE shipping 🎉' : 'Delivery — shipping to confirm');

  const msg = [
    `Hi Doreah! 💄 I'd like to place an order.`,
    ``,
    `*Order ${orderId}*`,
    ...cart.map(i => `• ${i.name}${i.variantName ? ` (${i.variantName})` : ''} × ${i.qty} — ${money(i.price * i.qty)}`),
    ``,
    `*Subtotal: ${money(sub)}*`,
    shipping,
    ``,
    `*Name:* ${name}`,
    `*Phone:* ${phone}`,
    ...(method === 'Delivery' ? [`*Address:* ${address}`] : []),
    ...(note ? [`*Note:* ${note}`] : []),
    ``,
    `Track my order: ${trackUrl(orderId)}`,
    ``,
    `Can you help me finalize this order?`
  ].join('\n');

  lastOrderUrl = waLink(msg);
  const win = window.open(lastOrderUrl, '_blank');
  if (!win) location.href = lastOrderUrl;
  rememberOrder(orderId);

  // Save the order (private, for the admin) + a public tracking record (status only, no personal info)
  if (db) {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(db.collection('orders').doc(), {
      orderId, name, phone, method, note,
      address: method === 'Delivery' ? address : '',
      items: cart.map(i => ({ name: i.name, variant: i.variantName || '', qty: i.qty, price: i.price })),
      subtotal: Math.round(sub * 100) / 100,
      status: 'new',
      createdAt: now
    });
    batch.set(db.collection('tracking').doc(orderId), {
      orderId, method, status: 'new',
      items: cart.map(i => `${i.name}${i.variantName ? ' — ' + i.variantName : ''} × ${i.qty}`),
      createdAt: now
    });
    batch.commit().catch(e => console.warn('Order not logged (check firestore.rules):', e));
  }

  const box = $('#order-sent');
  box.hidden = false;
  box.innerHTML = `<strong>Order ${esc(orderId)} is ready on WhatsApp ✓</strong>
    Just hit <em>send</em> in WhatsApp and we'll confirm everything with you.
    <div class="row"><a href="${esc(trackUrl(orderId))}">Track this order</a><button type="button" data-action="resend">Open WhatsApp again</button><button type="button" data-action="clear-bag">Clear my bag</button></div>`;
  $('.cart-body').scrollTop = 0;
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer;
function toast(message, actionLabel, action) {
  const t = $('#toast');
  t.innerHTML = '<span></span>' + (actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : '');
  t.firstChild.textContent = message;
  if (actionLabel) $('button', t).onclick = () => { t.classList.remove('show'); action(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ============================================================
   EVENTS
   ============================================================ */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const root = el.closest('[data-id]');
  switch (el.dataset.action) {
    case 'add':          addFromRoot(root, el); break;
    case 'pick-variant': selectVariant(root, Number(el.dataset.index)); break;
    case 'quick-view':   openQuickView(root.dataset.id, Number(root.dataset.variant || 0)); break;
    case 'qv-qty': {
      const q = $('[data-qty]', root);
      q.textContent = Math.max(1, Math.min(20, Number(q.textContent) + Number(el.dataset.delta)));
      break;
    }
    case 'share':        shareProduct(root); break;
    case 'close-modal':  closeModal(); break;
    case 'open-cart':    openCart(); break;
    case 'close-cart':   closeCart(); break;
    case 'shop-now':     closeCart(); $('#shop').scrollIntoView({ behavior: 'smooth' }); break;
    case 'qty':          updateQty(el.dataset.key, Number(el.dataset.delta)); break;
    case 'remove':       removeFromCart(el.dataset.key); break;
    case 'checkout':     checkout(); break;
    case 'resend':       if (lastOrderUrl) window.open(lastOrderUrl, '_blank'); break;
    case 'clear-bag':    saveCart([]); $('#order-sent').hidden = true; toast('Bag cleared — thank you! 💋'); break;
    case 'filter':       setFilter(el.dataset.category, !el.dataset.stay); break;
    case 'clear-filters':
      state.search = ''; $('#search-input').value = ''; setFilter('All', false); break;
    case 'toggle-menu': {
      const nav = $('#site-nav');
      const open = nav.classList.toggle('open');
      el.setAttribute('aria-expanded', open);
      break;
    }
    case 'focus-search':
      $('#shop').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => $('#search-input').focus({ preventScroll: true }), 450);
      break;
  }
});

// Close mobile menu after tapping a link
$$('#site-nav a').forEach(a => a.addEventListener('click', () => {
  $('#site-nav').classList.remove('open');
  $('.menu-toggle').setAttribute('aria-expanded', 'false');
}));

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeModal();
  closeCart();
  $('#site-nav').classList.remove('open');
});

let searchTimer;
$('#search-input').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value; renderProducts(); }, 160);
});
$('#sort-select').addEventListener('change', e => { state.sort = e.target.value; renderProducts(); });

$('#checkout-form').addEventListener('submit', e => { e.preventDefault(); checkout(); });
$('#checkout-form').addEventListener('change', e => { if (e.target.name === 'method') setMethod(e.target.value); });

const header = $('#site-header');
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10), { passive: true });
addEventListener('hashchange', openFromHash);

/* ============================================================
   STATIC BITS (hero, ticker, footer)
   ============================================================ */
const ICONS = {
  instagram: '<svg viewBox="0 0 24 24"><path d="M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM12 3.6c2.7 0 3 0 4.1.1 2.7.1 4 1.4 4.1 4.1.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c-.1 2.7-1.4 4-4.1 4.1-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-2.7-.1-4-1.4-4.1-4.1C3.7 15 3.6 14.7 3.6 12s0-3 .1-4.1c.1-2.7 1.4-4 4.1-4.1C9 3.7 9.3 3.6 12 3.6ZM12 2c-2.7 0-3.1 0-4.2.1C4.2 2.3 2.3 4.2 2.1 7.8 2 8.9 2 9.3 2 12s0 3.1.1 4.2c.2 3.6 2.1 5.5 5.7 5.7 1.1.1 1.5.1 4.2.1s3.1 0 4.2-.1c3.6-.2 5.5-2.1 5.7-5.7.1-1.1.1-1.5.1-4.2s0-3.1-.1-4.2c-.2-3.6-2.1-5.5-5.7-5.7C15.1 2 14.7 2 12 2Z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24"><path d="M16.6 2h-3.3v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .8.1V9.2a6.2 6.2 0 1 0 5.4 6.2V8.6a7.9 7.9 0 0 0 4.4 1.4V6.7a4.4 4.4 0 0 1-4.4-4.7Z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24"><path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.2h2.8V22h3.4Z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.57 15.24L2 22l4.9-1.39A10 10 0 1 0 12 2Zm4.6 13.9c-.2.6-1.2 1.1-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.1.1.3 0 .5l-.3.4-.4.5c-.1.1-.3.3-.1.5.1.3.6 1.1 1.4 1.8 1 .9 1.8 1.1 2.1 1.3.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.1.1.6-.1 1.2Z"/></svg>'
};

function renderStatic() {
  // Hero image
  if (typeof HERO_IMAGE_URL !== 'undefined' && HERO_IMAGE_URL) {
    const img = new Image();
    img.onload = () => {
      $('#hero-bg').style.backgroundImage = `url("${HERO_IMAGE_URL.replace(/"/g, '%22')}")`;
      $('#hero').classList.add('has-image');
    };
    img.src = HERO_IMAGE_URL;
  }

  // Ticker — repeated so it loops seamlessly on any screen width
  const items = (typeof MARQUEE_TEXT !== 'undefined' && MARQUEE_TEXT.length) ? MARQUEE_TEXT : ['Confidence in every shade'];
  const once = items.map(t => `<span>${esc(t)}</span><span class="dot">✦</span>`).join('');
  const half = once.repeat(Math.max(2, Math.ceil(8 / items.length)));
  $('#marquee-track').innerHTML = half + half;

  // WhatsApp links
  const hello = waLink("Hi Doreah! 💄 I have a question.");
  $('#wa-float').href = hello;
  $('#footer-wa').href = hello;
  if (!WA_NUMBER) $('#wa-float').hidden = true;

  // Email + socials
  if (SHOP.email) { $('#footer-email-li').hidden = false; $('#footer-email').href = 'mailto:' + SHOP.email; }
  const socials = [['instagram', SHOP.instagram], ['tiktok', SHOP.tiktok], ['facebook', SHOP.facebook], ['whatsapp', WA_NUMBER ? hello : '']]
    .filter(([, url]) => url);
  $('#socials').innerHTML = socials.map(([k, url]) =>
    `<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="${k}">${ICONS[k]}</a>`).join('');

  $('#year').textContent = new Date().getFullYear();

  // Remember returning customers
  try {
    const c = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || 'null');
    if (c) {
      const f = $('#checkout-form').elements;
      f.name.value = c.name || '';
      f.phone.value = c.phone || '';
      f.address.value = c.address || '';
      if (c.method === 'Pickup') { f.method.value = 'Pickup'; setMethod('Pickup'); }
    }
  } catch { /* ignore */ }
}

/* ============================================================
   LOAD
   ============================================================ */
async function loadProducts() {
  $('#favorites-grid').innerHTML = skeletons(4);
  $('#products-grid').innerHTML = skeletons(8);
  let products = [];
  if (db) {
    try {
      const [snap, coll] = await Promise.all([
        db.collection('products').orderBy('createdAt', 'desc').get(),
        db.collection('collectionSettings').get().catch(() => null)
      ]);
      products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (coll) coll.docs.forEach(d => { state.settings[d.id] = d.data(); });
    } catch (e) {
      console.warn('Could not load products from Firebase, showing demo products:', e);
    }
  }
  state.products = products.length ? products : DEMO_PRODUCTS;
  renderAll();
  reconcileCart();
  openFromHash();
}

document.addEventListener('DOMContentLoaded', () => {
  renderStatic();
  renderCart();
  observeReveals();
  loadProducts();
});
