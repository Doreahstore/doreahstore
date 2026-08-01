/* ============================================================
   DOREAH — Storefront logic
   ============================================================ */

let firebaseReady = false;
try {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY') {
    firebase.initializeApp(firebaseConfig);
    firebaseReady = true;
  }
} catch (e) {
  console.warn('Firebase not configured yet:', e);
}

const db = firebaseReady ? firebase.firestore() : null;

// Fallback demo products shown until Firebase is configured / has real products
const DEMO_PRODUCTS = [
  { id: 'demo1', name: 'Doreah Trio Kit', price: 17, salePrice: null, category: 'Kits & Sets', favorite: true, badge: 'Signature Kit', image: 'data:image/jpeg;base64,' + '' },
  { id: 'demo2', name: 'Champagne Gloss', price: 16, salePrice: 13, category: 'Lip Glosses', favorite: true, badge: 'New In', image: '' },
  {
    id: 'demo3', name: 'Matte Lipstick', price: 18, salePrice: null, category: 'Matte Lipsticks', favorite: true, badge: '', image: '',
    variants: [
      { name: 'Bark Red', price: null, salePrice: null, image: '' },
      { name: 'Rosewood', price: null, salePrice: null, image: '' },
      { name: 'Berry Bold', price: 20, salePrice: null, image: '' }
    ]
  }
];

let PRODUCTS = [];
let COLLECTION_SETTINGS = {}; // slug -> { category, image, locked }

function slugifyCategory(category) {
  return (category || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function loadProducts() {
  if (db) {
    try {
      const snap = await db.collection('products').orderBy('createdAt', 'desc').get();
      PRODUCTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (PRODUCTS.length === 0) PRODUCTS = DEMO_PRODUCTS;
    } catch (e) {
      console.warn('Could not load products from Firebase, showing demo products:', e);
      PRODUCTS = DEMO_PRODUCTS;
    }
    try {
      const collSnap = await db.collection('collectionSettings').get();
      COLLECTION_SETTINGS = {};
      collSnap.docs.forEach(d => { COLLECTION_SETTINGS[d.id] = d.data(); });
    } catch (e) {
      console.warn('Could not load collection settings:', e);
    }
  } else {
    PRODUCTS = DEMO_PRODUCTS;
  }
  renderFavorites();
  renderProducts();
  renderCollectionThumbnails();
}

// Returns the image URL to use for a collection card: the locked/pinned
// image if one is set, otherwise the photo of the most recently added
// product in that category (falls back to null if none has a photo).
function getCollectionImage(category) {
  const slug = slugifyCategory(category);
  const setting = COLLECTION_SETTINGS[slug];
  if (setting && setting.locked && setting.image) {
    return setting.image;
  }
  const inCategory = PRODUCTS.filter(p => p.category === category);
  for (const p of inCategory) { // PRODUCTS is already ordered newest-first
    const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
    const img = (hasVariants && p.variants[0].image) || p.image;
    if (img) return img;
  }
  return null;
}

function renderCollectionThumbnails() {
  document.querySelectorAll('.collection-card[data-category]').forEach(card => {
    const category = card.dataset.category;
    const image = getCollectionImage(category);
    if (image) {
      card.style.backgroundImage = `url('${image}')`;
      card.classList.add('has-photo');
    } else {
      card.style.backgroundImage = '';
      card.classList.remove('has-photo');
    }
  });
}

function money(n) {
  return '$' + Number(n).toFixed(2);
}

function priceHtml(p) {
  if (p.salePrice) {
    return `<s>${money(p.price)}</s> <span class="sale">${money(p.salePrice)}</span>`;
  }
  return money(p.price);
}

// Resolves the effective price/salePrice for a given variant, falling back to the product's own price
function resolveVariant(product, variant) {
  return {
    price: (variant && variant.price != null && variant.price !== '') ? variant.price : product.price,
    salePrice: (variant && variant.salePrice != null && variant.salePrice !== '') ? variant.salePrice : product.salePrice
  };
}

function productCard(p) {
  const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
  const firstVariant = hasVariants ? p.variants[0] : null;
  const displayImage = (firstVariant && firstVariant.image) || p.image;
  const displayPricing = hasVariants ? resolveVariant(p, firstVariant) : { price: p.price, salePrice: p.salePrice };

  const img = displayImage
    ? `<img src="${displayImage}" alt="${p.name}">`
    : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:2.2rem;color:rgba(46,31,26,0.15)">D</div>`;

  const variantSelect = hasVariants ? `
    <select class="variant-select" id="variant-select-${p.id}" onchange="onVariantChange('${p.id}')" style="width:calc(100% - 2rem);margin:0 1rem 0.7rem;padding:0.5rem;border:1px solid rgba(196,40,58,0.25);border-radius:6px;font-family:var(--font-body);font-size:0.8rem;">
      ${p.variants.map((v, i) => `<option value="${i}">${v.name}</option>`).join('')}
    </select>
  ` : '';

  const addToCartAttr = hasVariants ? `addToCart('${p.id}', 0)` : `addToCart('${p.id}')`;

  return `
    <div class="product-card">
      ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
      <div class="product-img" style="position:relative">${img}</div>
      <div class="product-info">
        <div class="product-title">${p.name}</div>
        <div class="product-price">${priceHtml(displayPricing)}</div>
      </div>
      ${variantSelect}
      <button class="add-to-cart-btn" onclick="${addToCartAttr}">Add to Cart</button>
    </div>
  `;
}

function onVariantChange(productId) {
  const select = document.getElementById('variant-select-' + productId);
  const idx = parseInt(select.value, 10);
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product || !product.variants || !product.variants[idx]) return;
  const variant = product.variants[idx];
  const card = select.closest('.product-card');

  card.querySelector('.product-price').innerHTML = priceHtml(resolveVariant(product, variant));

  const imgEl = card.querySelector('.product-img img');
  if (imgEl && variant.image) imgEl.src = variant.image;

  card.querySelector('.add-to-cart-btn').setAttribute('onclick', `addToCart('${productId}', ${idx})`);
}

function renderFavorites() {
  const wrap = document.getElementById('favorites-grid');
  if (!wrap) return;
  const favs = PRODUCTS.filter(p => p.favorite);
  wrap.innerHTML = favs.length
    ? favs.map(productCard).join('')
    : `<p class="empty-note">No favorites picked yet — mark products as favorites in the admin panel.</p>`;
}

function renderProducts(filterCategory) {
  const wrap = document.getElementById('products-grid');
  if (!wrap) return;
  const list = filterCategory ? PRODUCTS.filter(p => p.category === filterCategory) : PRODUCTS;
  wrap.innerHTML = list.length
    ? list.map(productCard).join('')
    : `<p class="empty-note">No products yet — add some in the admin panel.</p>`;
}

function filterByCollection(category) {
  document.getElementById('all-products').scrollIntoView({ behavior: 'smooth' });
  renderProducts(category);
}

/* ── CART ── */
function getCart() {
  return JSON.parse(localStorage.getItem('doreah_cart') || '[]');
}
function saveCart(cart) {
  localStorage.setItem('doreah_cart', JSON.stringify(cart));
  renderCartCount();
  renderCartDrawer();
}

function addToCart(productId, variantIndex) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  let variant = null;
  const hasVariant = variantIndex !== undefined && variantIndex !== null && product.variants && product.variants[variantIndex];
  if (hasVariant) variant = product.variants[variantIndex];

  const cartId = hasVariant ? `${productId}::${variantIndex}` : productId;
  const name = hasVariant ? `${product.name} — ${variant.name}` : product.name;
  const pricing = hasVariant ? resolveVariant(product, variant) : { price: product.price, salePrice: product.salePrice };
  const price = pricing.salePrice || pricing.price;
  const image = (hasVariant && variant.image) || product.image;

  const cart = getCart();
  const existing = cart.find(i => i.id === cartId);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: cartId, name, price, image, qty: 1 });
  }
  saveCart(cart);
  openCart();
}

function updateQty(id, delta) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  const updated = item.qty <= 0 ? cart.filter(i => i.id !== id) : cart;
  saveCart(updated);
}

function removeFromCart(id) {
  saveCart(getCart().filter(i => i.id !== id));
}

function cartSubtotal() {
  return getCart().reduce((sum, i) => sum + i.price * i.qty, 0);
}

function renderCartCount() {
  const el = document.getElementById('cart-count');
  if (!el) return;
  const count = getCart().reduce((n, i) => n + i.qty, 0);
  el.textContent = count;
  el.style.display = count > 0 ? 'flex' : 'none';
}

function renderCartDrawer() {
  const wrap = document.getElementById('cart-items');
  const footer = document.getElementById('cart-footer');
  if (!wrap) return;
  const cart = getCart();
  if (cart.length === 0) {
    wrap.innerHTML = `<div class="cart-empty">Your cart is empty.<br>Add something you love.</div>`;
    footer.style.display = 'none';
    return;
  }
  footer.style.display = 'block';
  wrap.innerHTML = cart.map(i => `
    <div class="cart-item">
      <img src="${i.image || ''}" alt="${i.name}">
      <div class="cart-item-info">
        <h5>${i.name}</h5>
        <div class="price">${money(i.price)} each</div>
        <div class="qty-row">
          <button onclick="updateQty('${i.id}', -1)">−</button>
          <span>${i.qty}</span>
          <button onclick="updateQty('${i.id}', 1)">+</button>
        </div>
        <button class="remove-item" onclick="removeFromCart('${i.id}')">Remove</button>
      </div>
    </div>
  `).join('');
  document.getElementById('cart-subtotal-amount').textContent = money(cartSubtotal());
}

function openCart() {
  document.getElementById('cart-overlay').classList.add('open');
  document.getElementById('cart-drawer').classList.add('open');
}
function closeCart() {
  document.getElementById('cart-overlay').classList.remove('open');
  document.getElementById('cart-drawer').classList.remove('open');
}

function checkoutWhatsApp() {
  const cart = getCart();
  if (cart.length === 0) return;
  let msg = `Hi Doreah! I'd like to order:\n\n`;
  cart.forEach(i => {
    msg += `• ${i.name} x${i.qty} — ${money(i.price * i.qty)}\n`;
  });
  msg += `\nTotal: ${money(cartSubtotal())}\n\nCan you help me finalize this order?`;
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function renderHeroAndMarquee() {
  const hero = document.getElementById('hero-section');
  if (hero && typeof HERO_IMAGE_URL !== 'undefined' && HERO_IMAGE_URL) {
    hero.style.backgroundImage = `url('${HERO_IMAGE_URL}')`;
    hero.classList.add('has-image');
  }

  const track = document.getElementById('marquee-track');
  if (track && typeof MARQUEE_TEXT !== 'undefined' && MARQUEE_TEXT.length) {
    const items = MARQUEE_TEXT.map(t => `<span>${t}</span><span class="dot">•</span>`).join('');
    // repeat twice so the scroll loop looks continuous
    track.innerHTML = items + items;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  renderCartCount();
  renderCartDrawer();
  renderHeroAndMarquee();
});
