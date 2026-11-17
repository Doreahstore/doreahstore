/* ============================================================
   DOREAH — Admin panel logic
   Login is handled by Firebase Authentication (email + password).
   Who may edit is enforced by firestore.rules — see README.md.
   ============================================================ */
'use strict';

let db = null, auth = null;
try {
  if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined' &&
      firebaseConfig.apiKey && !/^YOUR_/.test(firebaseConfig.apiKey)) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
  }
} catch (e) { console.warn('Firebase not configured yet:', e); }

const $  = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n || 0).toFixed(2);
const numOrNull = v => (v === '' || v === null || v === undefined || isNaN(parseFloat(v))) ? null : parseFloat(v);
const slugify = s => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const toDate = ts => ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
const fmtDate = ts => { const d = toDate(ts); return d ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'just now'; };
const serverTime = () => firebase.firestore.FieldValue.serverTimestamp();
const hasVariants = p => Array.isArray(p.variants) && p.variants.length > 0;
const imageOf = p => p.image || (hasVariants(p) ? (p.variants.find(v => v.image) || {}).image : '') || '';

const KNOWN_COLLECTIONS = ['Matte Lipsticks', 'Lip Glosses'];
const SHADE_PALETTE = ['#c4283a', '#8c1c2a', '#b5525c', '#d9777f', '#9c4a3c', '#6e1f2b', '#e0a39a', '#a83250'];
const STATUS_LABELS = {
  Delivery: { new: 'New', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' },
  Pickup:   { new: 'New', confirmed: 'Confirmed', ready: 'Ready for pickup', delivered: 'Picked up', cancelled: 'Cancelled' }
};
const CARRIERS = ['', 'USPS', 'UPS', 'FedEx', 'DHL', 'Local'];
const CARRIER_NAMES = { USPS: 'USPS', UPS: 'UPS', FedEx: 'FedEx', DHL: 'DHL', Local: 'Local delivery' };

let PRODUCTS = [], ORDERS = [], COLL = {};
let editingId = null, orderFilter = 'all', ordersLoaded = false;

/* ---------- Toast + errors ---------- */
let toastTimer;
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 5000 : 2600);
}
function errText(err) {
  if (!err) return 'Something went wrong.';
  if (err.code === 'permission-denied') return 'Permission denied — is your email listed in firestore.rules?';
  if (err.code === 'unavailable') return 'You seem to be offline. Try again.';
  return err.message || String(err);
}

/* ============================================================
   AUTH
   ============================================================ */
function authError(err) {
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/invalid-email': 'That email doesn\'t look right.',
    'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No connection. Check your internet.',
    'auth/unauthorized-domain': 'This website address isn\'t allowed yet — add it in Firebase → Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in Firebase → Authentication.'
  };
  return map[err.code] || err.message;
}

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#login-msg');
  msg.className = 'msg';
  if (!auth) { msg.textContent = 'Firebase is not configured in config.js.'; return; }
  const email = $('#login-email').value.trim();
  const pass = $('#login-pass').value;
  if (!email || !pass) { msg.textContent = 'Enter your email and password.'; return; }
  const btn = $('#login-btn');
  btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    msg.textContent = '';
  } catch (err) {
    msg.textContent = authError(err);
  } finally {
    btn.disabled = false; btn.textContent = 'Log in';
  }
});

$('#forgot-btn').addEventListener('click', async () => {
  const msg = $('#login-msg');
  const email = $('#login-email').value.trim();
  if (!email) { msg.className = 'msg'; msg.textContent = 'Type your email above first.'; return; }
  try {
    await auth.sendPasswordResetEmail(email);
    msg.className = 'msg ok';
    msg.textContent = 'Reset link sent — check your inbox (and spam).';
  } catch (err) { msg.className = 'msg'; msg.textContent = authError(err); }
});

$('#logout-btn').addEventListener('click', () => auth && auth.signOut());

function showLogin() {
  $('#admin-screen').hidden = true;
  $('#login-screen').hidden = false;
}
function showAdmin(user) {
  $('#login-screen').hidden = true;
  $('#admin-screen').hidden = false;
  $('#logout-btn').title = user.email;
  loadProducts();
  loadOrders();
}

if (auth) auth.onAuthStateChanged(user => user ? showAdmin(user) : showLogin());
else $('#login-msg').textContent = 'Firebase is not configured in config.js yet.';

/* ============================================================
   TABS + STATS
   ============================================================ */
$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
  $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  if (tab.dataset.tab === 'orders' && !ordersLoaded) loadOrders();
}));

function renderStats() {
  const out = PRODUCTS.filter(p => p.inStock === false).length;
  const newOrders = ORDERS.filter(o => o.status === 'new').length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthValue = ORDERS
    .filter(o => o.status !== 'cancelled' && (toDate(o.createdAt) || new Date()) >= monthStart)
    .reduce((s, o) => s + (Number(o.subtotal) || 0), 0);
  $('#stats').innerHTML = `
    <div class="stat"><span>Products</span><strong>${PRODUCTS.length}</strong></div>
    <div class="stat"><span>Sold out</span><strong>${out}</strong></div>
    <div class="stat${newOrders ? ' hot' : ''}"><span>New orders</span><strong>${newOrders}</strong></div>
    <div class="stat"><span>This month</span><strong>${money(monthValue)}</strong></div>`;
  const badge = $('#orders-badge');
  badge.textContent = newOrders;
  badge.hidden = !newOrders;
}

/* ============================================================
   IMAGES (compressed on the phone, then uploaded to ImgBB)
   ============================================================ */
async function compressImage(file, maxSize = 1400, quality = 0.85) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 500 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

async function uploadImage(file) {
  if (typeof IMGBB_API_KEY === 'undefined' || !IMGBB_API_KEY || /^YOUR_/.test(IMGBB_API_KEY)) {
    throw new Error('Add your ImgBB API key in config.js first (free at api.imgbb.com).');
  }
  const small = await compressImage(file);
  const form = new FormData();
  form.append('image', small, 'photo.jpg');
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(IMGBB_API_KEY)}`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!data.success) throw new Error('Photo upload failed' + (data.error && data.error.message ? ': ' + data.error.message : '.'));
  return data.data.display_url || data.data.url;
}

/* ============================================================
   PRODUCTS — list
   ============================================================ */
async function loadProducts() {
  try {
    const [snap, coll] = await Promise.all([
      db.collection('products').orderBy('createdAt', 'desc').get(),
      db.collection('collectionSettings').get()
    ]);
    PRODUCTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    COLL = {};
    coll.docs.forEach(d => { COLL[d.id] = d.data(); });
  } catch (err) {
    $('#product-list').innerHTML = `<p class="empty">Couldn't load products: ${esc(errText(err))}</p>`;
    return;
  }
  renderProductList();
  renderCollectionsAdmin();
  renderStats();
  const cats = new Set(KNOWN_COLLECTIONS);
  PRODUCTS.forEach(p => p.category && cats.add(p.category));
  $('#category-list').innerHTML = [...cats].map(c => `<option value="${esc(c)}">`).join('');
}

function priceLabel(p) {
  return p.salePrice ? `<s>${money(p.price)}</s> ${money(p.salePrice)}` : money(p.price);
}

function renderProductList() {
  const q = $('#product-search').value.trim().toLowerCase();
  const list = PRODUCTS.filter(p => !q || `${p.name} ${p.category || ''}`.toLowerCase().includes(q));
  $('#product-count').textContent = `(${PRODUCTS.length})`;
  if (!PRODUCTS.length) {
    $('#product-list').innerHTML = `<p class="empty">No products yet — add your first one with the form. Until then the store shows demo products.</p>`;
    return;
  }
  $('#product-list').innerHTML = list.map(p => {
    const img = imageOf(p);
    const out = p.inStock === false;
    const dots = hasVariants(p)
      ? `<div class="p-dots">${p.variants.slice(0, 10).map(v => `<i style="background:${/^#[0-9a-f]{3,8}$/i.test(v.color || '') ? v.color : '#ddd'}" title="${esc(v.name)}"></i>`).join('')}</div>` : '';
    return `
    <div class="p-row${out ? ' out' : ''}" data-id="${esc(p.id)}">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="ph">D</span>`}
      <div class="p-main">
        <strong>${esc(p.name)}</strong>
        <span class="muted">${esc(p.category || 'No category')} · ${priceLabel(p)}${hasVariants(p) ? ` · ${p.variants.length} shades` : ''}</span>
        ${dots}
      </div>
      <div class="p-actions">
        <button type="button" class="pill fav${p.favorite ? ' on' : ''}" data-act="fav" title="Show in Favorites">★ Fav</button>
        <button type="button" class="pill stock${out ? '' : ' on'}" data-act="stock">${out ? 'Sold out' : 'In stock'}</button>
        <button type="button" class="btn ghost sm" data-act="edit">Edit</button>
        <button type="button" class="btn ghost sm" data-act="dup">Duplicate</button>
        <button type="button" class="btn danger sm" data-act="del">Delete</button>
      </div>
    </div>`;
  }).join('') || `<p class="empty">No products match “${esc(q)}”.</p>`;
}
$('#product-search').addEventListener('input', renderProductList);

$('#product-list').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  try {
    switch (btn.dataset.act) {
      case 'fav':
        await db.collection('products').doc(id).update({ favorite: !p.favorite });
        p.favorite = !p.favorite;
        toast(p.favorite ? '★ Added to Favorites' : 'Removed from Favorites');
        break;
      case 'stock': {
        const nowIn = p.inStock === false;
        await db.collection('products').doc(id).update({ inStock: nowIn });
        p.inStock = nowIn;
        toast(nowIn ? 'Back in stock' : 'Marked sold out');
        break;
      }
      case 'edit': startEdit(p); return;
      case 'dup': {
        const { id: _, createdAt, updatedAt, ...copy } = p;
        await db.collection('products').add({ ...copy, name: p.name + ' (copy)', createdAt: serverTime() });
        toast('Duplicated — edit the copy');
        await loadProducts();
        return;
      }
      case 'del':
        if (!confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
        await db.collection('products').doc(id).delete();
        PRODUCTS = PRODUCTS.filter(x => x.id !== id);
        if (editingId === id) resetForm();
        toast('Deleted');
        renderCollectionsAdmin();
        break;
    }
    renderProductList();
    renderStats();
  } catch (err) { toast(errText(err), true); }
});

/* ============================================================
   PRODUCTS — form
   ============================================================ */
function setMainPreview(src) {
  const img = $('#f-image-preview');
  img.hidden = !src;
  if (src) img.src = src; else img.removeAttribute('src');
  $('#photo-empty').hidden = !!src;
  $('#photo-remove').hidden = !src;
}
$('#f-image').addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) setMainPreview(URL.createObjectURL(f));
});
$('#photo-remove').addEventListener('click', () => {
  $('#f-image').value = '';
  $('#f-image-current').value = '';
  setMainPreview('');
});

let variantCount = 0;
function addVariantRow(data = {}) {
  const row = document.createElement('div');
  row.className = 'variant-row';
  row.innerHTML = `
    <input type="color" class="v-color" title="Swatch colour" aria-label="Swatch colour">
    <input class="v-name" placeholder="Shade name (e.g. Rosewood)" maxlength="40">
    <input type="number" step="0.01" min="0" inputmode="decimal" class="v-price" placeholder="Price">
    <input type="number" step="0.01" min="0" inputmode="decimal" class="v-saleprice" placeholder="Sale">
    <div class="v-bottom">
      <label class="v-photo"><span class="ph">📷</span><img hidden alt=""><input type="file" accept="image/*" class="v-image" aria-label="Shade photo"> Photo</label>
      <label class="v-stock"><input type="checkbox" class="v-instock"> In stock</label>
      <div class="v-tools">
        <button type="button" data-v="up" title="Move up" aria-label="Move up">↑</button>
        <button type="button" data-v="remove" title="Remove" aria-label="Remove shade">✕</button>
      </div>
    </div>
    <input type="hidden" class="v-image-current">`;
  // Values are set as properties (never as HTML) so names can't break the page
  $('.v-color', row).value = /^#[0-9a-f]{6}$/i.test(data.color || '') ? data.color : SHADE_PALETTE[variantCount % SHADE_PALETTE.length];
  $('.v-name', row).value = data.name || '';
  $('.v-price', row).value = data.price ?? '';
  $('.v-saleprice', row).value = data.salePrice ?? '';
  $('.v-instock', row).checked = data.inStock !== false;
  $('.v-image-current', row).value = data.image || '';
  if (data.image) showVariantThumb(row, data.image);
  variantCount++;
  $('#variants-container').appendChild(row);
  return row;
}
function showVariantThumb(row, src) {
  const img = $('.v-photo img', row);
  img.src = src; img.hidden = false;
  $('.v-photo .ph', row).hidden = true;
}
$('#add-variant-btn').addEventListener('click', () => $('.v-name', addVariantRow()).focus());
$('#variants-container').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  const row = b.closest('.variant-row');
  if (b.dataset.v === 'remove') row.remove();
  if (b.dataset.v === 'up' && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
});
$('#variants-container').addEventListener('change', e => {
  if (e.target.classList.contains('v-image') && e.target.files[0]) {
    showVariantThumb(e.target.closest('.variant-row'), URL.createObjectURL(e.target.files[0]));
  }
});

async function collectVariants(setStatus) {
  const rows = $$('#variants-container .variant-row');
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = $('.v-name', row).value.trim();
    if (!name) continue;
    let image = $('.v-image-current', row).value || '';
    const file = $('.v-image', row).files[0];
    if (file) { setStatus(`Uploading shade photo ${i + 1}…`); image = await uploadImage(file); }
    out.push({
      name,
      color: $('.v-color', row).value,
      price: numOrNull($('.v-price', row).value),
      salePrice: numOrNull($('.v-saleprice', row).value),
      image,
      inStock: $('.v-instock', row).checked
    });
  }
  return out;
}

function startEdit(p) {
  resetForm();
  editingId = p.id;
  $('#f-name').value = p.name || '';
  $('#f-category').value = p.category || '';
  $('#f-price').value = p.price ?? '';
  $('#f-saleprice').value = p.salePrice ?? '';
  $('#f-badge').value = p.badge || '';
  $('#f-description').value = p.description || '';
  $('#f-favorite').checked = !!p.favorite;
  $('#f-instock').checked = p.inStock !== false;
  $('#f-image-current').value = p.image || '';
  setMainPreview(p.image || '');
  if (hasVariants(p)) p.variants.forEach(v => addVariantRow(v));
  $('#form-title').textContent = `Editing: ${p.name}`;
  $('#cancel-edit-btn').hidden = false;
  $('#save-btn').textContent = 'Save changes';
  $('#product-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  editingId = null;
  $('#product-form').reset();
  $('#f-image-current').value = '';
  $('#f-instock').checked = true;
  setMainPreview('');
  $('#variants-container').innerHTML = '';
  variantCount = 0;
  $('#form-title').textContent = 'Add a product';
  $('#cancel-edit-btn').hidden = true;
  $('#save-btn').textContent = 'Save product';
  $('#form-status').textContent = '';
}
$('#cancel-edit-btn').addEventListener('click', resetForm);

$('#product-form').addEventListener('submit', async e => {
  e.preventDefault();
  const status = $('#form-status');
  const setStatus = t => { status.className = 'msg'; status.textContent = t; };
  const name = $('#f-name').value.trim();
  const price = numOrNull($('#f-price').value);
  const salePrice = numOrNull($('#f-saleprice').value);

  if (!name) { setStatus('Please enter a product name.'); $('#f-name').focus(); return; }
  if (price === null) { setStatus('Please enter a price.'); $('#f-price').focus(); return; }
  if (salePrice !== null && salePrice >= price) { setStatus('Sale price must be lower than the price.'); $('#f-saleprice').focus(); return; }

  const btn = $('#save-btn');
  btn.disabled = true;
  try {
    let image = $('#f-image-current').value || '';
    const file = $('#f-image').files[0];
    if (file) { setStatus('Uploading photo…'); image = await uploadImage(file); }
    const variants = await collectVariants(setStatus);
    setStatus('Saving…');

    const data = {
      name, price, salePrice,
      category: $('#f-category').value.trim(),
      badge: $('#f-badge').value.trim(),
      description: $('#f-description').value.trim(),
      favorite: $('#f-favorite').checked,
      inStock: $('#f-instock').checked,
      image, variants,
      updatedAt: serverTime()
    };
    if (editingId) await db.collection('products').doc(editingId).update(data);
    else await db.collection('products').add({ ...data, createdAt: serverTime() });

    toast(editingId ? 'Changes saved ✓' : 'Product added ✓');
    resetForm();
    await loadProducts();
  } catch (err) {
    console.error(err);
    setStatus(errText(err));
  } finally {
    btn.disabled = false;
  }
});

/* ============================================================
   ORDERS
   ============================================================ */
async function loadOrders() {
  try {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(300).get();
    ORDERS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    ordersLoaded = true;
  } catch (err) {
    $('#orders-list').innerHTML = `<p class="empty">Couldn't load orders: ${esc(errText(err))}</p>`;
    return;
  }
  renderOrders();
  renderStats();
}

const trackLink = id => new URL('track.html?id=' + encodeURIComponent(id), location.href).href;

// US numbers typed without the country code get a 1 in front
function waPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length === 10 ? '1' + d : d;
}

function customerMessage(o) {
  const first = String(o.name || '').split(' ')[0] || 'there';
  const id = o.orderId || o.id;
  const link = trackLink(id);
  const carrier = CARRIER_NAMES[o.carrier];
  switch (o.status) {
    case 'confirmed': return `Hi ${first}! ✅ Your Doreah order ${id} is confirmed. We're getting it ready now.\n\nTrack it anytime: ${link}`;
    case 'shipped': return `Great news ${first}! 📦 Your Doreah order ${id} has shipped${carrier ? ` with ${carrier}` : ''}.` +
      (o.trackingNumber ? `\nTracking number: ${o.trackingNumber}` : '') + `\n\nFollow your package here: ${link}`;
    case 'ready': return `Hi ${first}! 🛍️ Your Doreah order ${id} is packed and ready for pickup.\n\nDetails: ${link}`;
    case 'delivered': return `Hi ${first}! 💄 Your order ${id} was ${o.method === 'Pickup' ? 'picked up' : 'delivered'}. Thank you for shopping with Doreah! We'd love to see your look — tag us 💋`;
    case 'cancelled': return `Hi ${first}, your Doreah order ${id} has been cancelled. Reply here if you have any questions.`;
    default: return `Hi ${first}! We received your Doreah order ${id} 💄 We'll confirm it shortly.\n\nTrack it here: ${link}`;
  }
}

function renderOrders() {
  const list = ORDERS.filter(o => orderFilter === 'all' || o.status === orderFilter ||
    (orderFilter === 'shipped' && o.status === 'ready'));
  $('#orders-list').innerHTML = list.length ? list.map(o => {
    const labels = STATUS_LABELS[o.method === 'Pickup' ? 'Pickup' : 'Delivery'];
    const isDelivery = o.method !== 'Pickup';
    return `
    <div class="order status-${esc(o.status)}" data-id="${esc(o.id)}">
      <div class="order-head">
        <div><strong>${esc(o.orderId || o.id)}</strong><span class="muted">${esc(fmtDate(o.createdAt))}</span></div>
        <select data-act="status" aria-label="Order status">
          ${Object.entries(labels).map(([k, label]) => `<option value="${k}"${o.status === k ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <ul class="order-items">
        ${(o.items || []).map(i => `<li><span>${esc(i.name)}${i.variant ? ` <em>(${esc(i.variant)})</em>` : ''} × ${Number(i.qty) || 0}</span><span>${money((Number(i.price) || 0) * (Number(i.qty) || 0))}</span></li>`).join('')}
      </ul>
      <div class="order-foot">
        <div>
          <strong>${esc(o.name)}</strong> · ${esc(o.method)}${o.phone ? ` · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : ''}
          ${o.address ? `<br><span class="muted">${esc(o.address)}</span>` : ''}
          ${o.note ? `<br><span class="note">“${esc(o.note)}”</span>` : ''}
        </div>
        <div class="order-total">${money(o.subtotal)}</div>
      </div>
      ${isDelivery ? `
      <div class="ship-row">
        <select class="carrier" aria-label="Carrier">
          ${CARRIERS.map(c => `<option value="${c}"${(o.carrier || '') === c ? ' selected' : ''}>${c ? CARRIER_NAMES[c] : 'Carrier…'}</option>`).join('')}
        </select>
        <input class="tracking-no" placeholder="Tracking number" maxlength="40" aria-label="Tracking number">
        <button type="button" class="btn ghost sm" data-act="save-ship">Save</button>
      </div>` : ''}
      <div class="order-actions">
        <button type="button" class="btn sm wa" data-act="notify">💬 Send update</button>
        <button type="button" class="btn ghost sm" data-act="copy-link">Copy tracking link</button>
        <button type="button" class="btn danger sm" data-act="del-order">Delete</button>
      </div>
    </div>`;
  }).join('')
    : `<p class="empty">${orderFilter === 'all' ? 'No orders yet. They appear here when customers tap “Order on WhatsApp”.' : 'No orders with this status.'}</p>`;
  // Fill tracking numbers as values (safe from HTML injection)
  $$('#orders-list .order').forEach(el => {
    const o = ORDERS.find(x => x.id === el.dataset.id);
    const tn = $('.tracking-no', el);
    if (tn) tn.value = o.trackingNumber || '';
  });
}

// Keeps the public tracking record (status only, no personal info) in sync with the order
async function syncTracking(o, extra = {}) {
  const id = o.orderId || o.id;
  const data = {
    orderId: id, method: o.method || 'Delivery', status: o.status,
    carrier: o.carrier || '', trackingNumber: o.trackingNumber || '',
    items: (o.items || []).map(i => `${i.name}${i.variant ? ' — ' + i.variant : ''} × ${i.qty}`),
    updatedAt: serverTime(),
    ...extra
  };
  await db.collection('tracking').doc(id).set(data, { merge: true });
}

function sendUpdate(o) {
  const phone = waPhone(o.phone);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(customerMessage(o))}`;
  window.open(url, '_blank');
  if (!phone) toast('No phone saved for this order — pick the customer in WhatsApp.');
}

$('#order-filter').addEventListener('click', e => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  orderFilter = b.dataset.filter;
  $$('#order-filter button').forEach(x => x.classList.toggle('on', x === b));
  renderOrders();
});
$('#refresh-orders').addEventListener('click', () => { loadOrders(); toast('Orders refreshed'); });

$('#orders-list').addEventListener('change', async e => {
  if (e.target.dataset.act !== 'status') return;
  const id = e.target.closest('[data-id]').dataset.id;
  const o = ORDERS.find(x => x.id === id);
  const prev = o.status;
  const status = e.target.value;
  try {
    await db.collection('orders').doc(id).update({ status });
    o.status = status;
    await syncTracking(o, { times: { [status]: serverTime() } });
    renderOrders(); renderStats();
    const label = STATUS_LABELS[o.method === 'Pickup' ? 'Pickup' : 'Delivery'][status];
    if (status !== 'new' && confirm(`Marked “${label}”.\n\nSend the customer a WhatsApp update now?`)) sendUpdate(o);
  } catch (err) { toast(errText(err), true); o.status = prev; e.target.value = prev; }
});

$('#orders-list').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.tagName === 'SELECT') return;
  const card = btn.closest('[data-id]');
  const o = ORDERS.find(x => x.id === card.dataset.id);
  try {
    switch (btn.dataset.act) {
      case 'save-ship': {
        const carrier = $('.carrier', card).value;
        const trackingNumber = $('.tracking-no', card).value.trim();
        await db.collection('orders').doc(o.id).update({ carrier, trackingNumber });
        Object.assign(o, { carrier, trackingNumber });
        await syncTracking(o);
        if (trackingNumber && (o.status === 'new' || o.status === 'confirmed') &&
            confirm('Tracking saved ✓\n\nMark this order as “Shipped” too?')) {
          await db.collection('orders').doc(o.id).update({ status: 'shipped' });
          o.status = 'shipped';
          await syncTracking(o, { times: { shipped: serverTime() } });
          renderOrders(); renderStats();
          if (confirm('Send the customer their tracking on WhatsApp now?')) sendUpdate(o);
        } else toast('Tracking saved ✓');
        break;
      }
      case 'notify': sendUpdate(o); break;
      case 'copy-link':
        await navigator.clipboard.writeText(trackLink(o.orderId || o.id));
        toast('Tracking link copied');
        break;
      case 'del-order':
        if (!confirm('Delete this order record? The customer\'s tracking link will stop working.')) return;
        await db.collection('orders').doc(o.id).delete();
        await db.collection('tracking').doc(o.orderId || o.id).delete().catch(() => {});
        ORDERS = ORDERS.filter(x => x.id !== o.id);
        renderOrders(); renderStats();
        toast('Order deleted');
        break;
    }
  } catch (err) { toast(errText(err), true); }
});

/* ============================================================
   COLLECTIONS
   ============================================================ */
function autoImage(category) {
  for (const p of PRODUCTS) if (p.category === category) {
    const img = (hasVariants(p) && p.variants[0].image) || imageOf(p);
    if (img) return img;
  }
  return '';
}

function renderCollectionsAdmin() {
  const cats = new Set(KNOWN_COLLECTIONS);
  PRODUCTS.forEach(p => p.category && cats.add(p.category));
  $('#collections-admin').innerHTML = [...cats].map(cat => {
    const slug = slugify(cat);
    const s = COLL[slug] || {};
    const locked = !!(s.locked && s.image);
    const auto = autoImage(cat);
    const img = locked ? s.image : auto;
    const count = PRODUCTS.filter(p => p.category === cat).length;
    return `
    <div class="coll-row" data-slug="${esc(slug)}" data-cat="${esc(cat)}">
      ${img ? `<img src="${esc(img)}" alt="">` : `<span class="ph"></span>`}
      <div class="coll-info">
        <strong>${esc(cat)}</strong>
        <span class="muted">${count} products · ${locked ? '🔒 Locked photo' : '🔄 Auto (newest product)'}${count ? '' : ' · hidden on store until it has products'}</span>
        <div class="coll-tag">
          <input class="tagline" maxlength="30" placeholder="Tagline (e.g. Best Seller)" aria-label="Tagline">
          <button type="button" class="btn ghost sm" data-act="tagline">Save</button>
        </div>
      </div>
      <div class="coll-actions">
        ${locked
          ? `<button type="button" class="btn ghost sm" data-act="unlock">Unlock (use newest)</button>`
          : `<button type="button" class="btn ghost sm" data-act="lock"${auto ? '' : ' disabled title="No product photo yet"'}>Lock current photo</button>`}
        <label class="btn sm upload-lock">Upload &amp; lock<input type="file" accept="image/*" data-act="upload"></label>
      </div>
    </div>`;
  }).join('');
  // Set tagline values safely
  $$('#collections-admin .coll-row').forEach(row => {
    $('.tagline', row).value = (COLL[row.dataset.slug] || {}).tagline || '';
  });
}

async function saveCollection(slug, data) {
  await db.collection('collectionSettings').doc(slug).set(data, { merge: true });
  COLL[slug] = { ...(COLL[slug] || {}), ...data };
  renderCollectionsAdmin();
}

$('#collections-admin').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const row = b.closest('.coll-row');
  const { slug, cat } = row.dataset;
  try {
    if (b.dataset.act === 'lock') { await saveCollection(slug, { category: cat, image: autoImage(cat), locked: true }); toast('Photo locked 🔒'); }
    if (b.dataset.act === 'unlock') { await saveCollection(slug, { locked: false }); toast('Back to auto'); }
    if (b.dataset.act === 'tagline') { await saveCollection(slug, { category: cat, tagline: $('.tagline', row).value.trim() }); toast('Tagline saved'); }
  } catch (err) { toast(errText(err), true); }
});
$('#collections-admin').addEventListener('change', async e => {
  if (e.target.dataset.act !== 'upload' || !e.target.files[0]) return;
  const row = e.target.closest('.coll-row');
  try {
    toast('Uploading…');
    const url = await uploadImage(e.target.files[0]);
    await saveCollection(row.dataset.slug, { category: row.dataset.cat, image: url, locked: true });
    toast('Photo uploaded & locked 🔒');
  } catch (err) { toast(errText(err), true); }
});
