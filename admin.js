/* ============================================================
   DOREAH — Admin panel logic
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

let editingId = null;

/* ── COLLECTION THUMBNAILS ── */
// These are the collection cards shown on the storefront homepage. Any other
// category a product uses will also show up here automatically.
const KNOWN_COLLECTIONS = ['Matte Lipsticks', 'Lip Glosses'];
let ADMIN_PRODUCTS = [];
let COLLECTION_SETTINGS_ADMIN = {};

function slugifyCategory(category) {
  return (category || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// The "auto" photo for a collection is the photo of the most recently added
// product in that category (ADMIN_PRODUCTS is already newest-first).
function computeAutoImage(category) {
  const inCategory = ADMIN_PRODUCTS.filter(p => p.category === category);
  for (const p of inCategory) {
    const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
    const img = (hasVariants && p.variants[0].image) || p.image;
    if (img) return img;
  }
  return '';
}

async function loadCollectionsAdmin() {
  const wrap = document.getElementById('collections-admin');
  if (!wrap || !db) return;

  const collSnap = await db.collection('collectionSettings').get();
  COLLECTION_SETTINGS_ADMIN = {};
  collSnap.docs.forEach(d => { COLLECTION_SETTINGS_ADMIN[d.id] = d.data(); });

  const categories = new Set(KNOWN_COLLECTIONS);
  ADMIN_PRODUCTS.forEach(p => { if (p.category) categories.add(p.category); });

  wrap.innerHTML = Array.from(categories).map(category => {
    const slug = slugifyCategory(category);
    const setting = COLLECTION_SETTINGS_ADMIN[slug];
    const isLocked = !!(setting && setting.locked && setting.image);
    const autoImage = computeAutoImage(category);
    const displayImage = isLocked ? setting.image : autoImage;

    return `
      <div class="collection-admin-row">
        <img src="${displayImage || ''}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;background:#f7e3e2;flex-shrink:0">
        <div class="collection-admin-info">
          <strong>${category}</strong><br>
          <span class="collection-status">${isLocked ? '🔒 Locked thumbnail' : '🔄 Auto — shows the latest product added'}</span>
        </div>
        <div class="collection-admin-actions">
          ${isLocked
            ? `<button type="button" onclick="unlockCollection('${slug}')">Unlock (use latest)</button>`
            : `<button type="button" onclick="lockCollectionAuto('${slug}', '${category.replace(/'/g, "\\'")}')" ${autoImage ? '' : 'disabled title="No product photo yet in this category"'}>Lock current photo</button>`
          }
          <label class="upload-lock-label">
            Upload &amp; lock a photo
            <input type="file" accept="image/*" onchange="uploadAndLockCollection(this, '${slug}', '${category.replace(/'/g, "\\'")}')">
          </label>
        </div>
      </div>
    `;
  }).join('');
}

async function lockCollectionAuto(slug, category) {
  const image = computeAutoImage(category);
  if (!image) { alert('No product photo available yet for this collection.'); return; }
  await db.collection('collectionSettings').doc(slug).set({ category, image, locked: true });
  loadCollectionsAdmin();
}

async function unlockCollection(slug) {
  await db.collection('collectionSettings').doc(slug).set({ locked: false }, { merge: true });
  loadCollectionsAdmin();
}

async function uploadAndLockCollection(input, slug, category) {
  if (!input.files || !input.files[0]) return;
  try {
    const url = await uploadImageToImgBB(input.files[0]);
    await db.collection('collectionSettings').doc(slug).set({ category, image: url, locked: true });
    loadCollectionsAdmin();
  } catch (err) {
    console.error(err);
    alert('Upload failed — check the console.');
  }
}

/* ── LOGIN GATE ── */
function checkLogin() {
  if (sessionStorage.getItem('doreah_admin_ok') === '1') {
    showAdmin();
  }
}
function login() {
  const pass = document.getElementById('login-pass').value;
  if (pass === ADMIN_PASSWORD) {
    sessionStorage.setItem('doreah_admin_ok', '1');
    showAdmin();
  } else {
    document.getElementById('login-error').textContent = 'Incorrect password.';
  }
}
function showAdmin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-screen').style.display = 'block';
  if (!firebaseReady) {
    document.getElementById('firebase-warning').style.display = 'block';
  } else {
    loadProductTable();
  }
}
function logout() {
  sessionStorage.removeItem('doreah_admin_ok');
  location.reload();
}

/* ── IMAGE UPLOAD (ImgBB) ── */
async function uploadImageToImgBB(file) {
  if (!IMGBB_API_KEY || IMGBB_API_KEY === 'YOUR_IMGBB_API_KEY') {
    alert('Add your ImgBB API key in config.js first (get a free one at api.imgbb.com).');
    throw new Error('No ImgBB key configured');
  }
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  if (!data.success) throw new Error('ImgBB upload failed');
  return data.data.url;
}

/* ── VARIANT ROWS ── */
let variantRowCount = 0;

function addVariantRow(data) {
  const id = variantRowCount++;
  const container = document.getElementById('variants-container');
  const row = document.createElement('div');
  row.className = 'variant-row';
  row.dataset.rowId = id;
  row.innerHTML = `
    <input type="text" placeholder="Shade name (e.g. Rosewood)" class="v-name" value="${data && data.name ? data.name : ''}">
    <input type="number" step="0.01" placeholder="Price" class="v-price" value="${data && data.price != null ? data.price : ''}">
    <input type="number" step="0.01" placeholder="Sale $" class="v-saleprice" value="${data && data.salePrice != null ? data.salePrice : ''}">
    <input type="file" accept="image/*" class="v-image">
    <button type="button" onclick="this.closest('.variant-row').remove()">Remove</button>
    <input type="hidden" class="v-image-current" value="${data && data.image ? data.image : ''}">
  `;
  container.appendChild(row);
}

function clearVariantRows() {
  document.getElementById('variants-container').innerHTML = '';
  variantRowCount = 0;
}

async function collectVariants() {
  const rows = document.querySelectorAll('#variants-container .variant-row');
  const variants = [];
  for (const row of rows) {
    const name = row.querySelector('.v-name').value.trim();
    if (!name) continue; // skip empty rows
    const priceRaw = row.querySelector('.v-price').value;
    const salePriceRaw = row.querySelector('.v-saleprice').value;
    const fileInput = row.querySelector('.v-image');
    let image = row.querySelector('.v-image-current').value || '';
    if (fileInput.files && fileInput.files[0]) {
      image = await uploadImageToImgBB(fileInput.files[0]);
    }
    variants.push({
      name,
      price: priceRaw ? parseFloat(priceRaw) : null,
      salePrice: salePriceRaw ? parseFloat(salePriceRaw) : null,
      image
    });
  }
  return variants;
}

/* ── PRODUCT FORM ── */
async function saveProduct(e) {
  e.preventDefault();
  if (!db) { alert('Firebase is not configured yet — see config.js.'); return; }

  const name = document.getElementById('f-name').value.trim();
  const price = parseFloat(document.getElementById('f-price').value);
  const salePriceRaw = document.getElementById('f-saleprice').value;
  const salePrice = salePriceRaw ? parseFloat(salePriceRaw) : null;
  const category = document.getElementById('f-category').value.trim();
  const badge = document.getElementById('f-badge').value.trim();
  const favorite = document.getElementById('f-favorite').checked;
  const fileInput = document.getElementById('f-image');
  const statusEl = document.getElementById('form-status');

  if (!name || isNaN(price)) {
    statusEl.textContent = 'Please enter at least a name and price.';
    return;
  }

  statusEl.textContent = 'Saving...';

  try {
    let imageUrl = document.getElementById('f-image-current').value || '';
    if (fileInput.files && fileInput.files[0]) {
      statusEl.textContent = 'Uploading photo...';
      imageUrl = await uploadImageToImgBB(fileInput.files[0]);
    }

    statusEl.textContent = 'Uploading variant photos (if any)...';
    const variants = await collectVariants();

    const productData = {
      name, price, salePrice, category, badge, favorite,
      image: imageUrl,
      variants,
      createdAt: editingId ? undefined : firebase.firestore.FieldValue.serverTimestamp()
    };
    Object.keys(productData).forEach(k => productData[k] === undefined && delete productData[k]);

    if (editingId) {
      await db.collection('products').doc(editingId).update(productData);
    } else {
      await db.collection('products').add(productData);
    }

    resetForm();
    statusEl.textContent = 'Saved!';
    loadProductTable();
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Something went wrong — check the console.';
  }
}

function resetForm() {
  editingId = null;
  document.getElementById('product-form').reset();
  document.getElementById('f-image-current').value = '';
  document.getElementById('form-title').textContent = 'Add a Product';
  document.getElementById('cancel-edit-btn').style.display = 'none';
  document.getElementById('form-status').textContent = '';
  clearVariantRows();
}

async function loadProductTable() {
  const tbody = document.getElementById('product-table-body');
  tbody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  const snap = await db.collection('products').orderBy('createdAt', 'desc').get();
  ADMIN_PRODUCTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  loadCollectionsAdmin();
  const rows = snap.docs.map(d => {
    const p = d.data();
    return `
      <tr>
        <td><img src="${p.image || ''}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;background:#f7e3e2"></td>
        <td>${p.name}${p.variants && p.variants.length ? ` <span style="color:#5e2f30;font-size:0.75rem;">(${p.variants.length} variants)</span>` : ''}</td>
        <td>${p.category || '—'}</td>
        <td>${p.salePrice ? `<s>$${p.price}</s> $${p.salePrice}` : `$${p.price}`}</td>
        <td>${p.favorite ? '★' : ''}</td>
        <td>
          <button onclick='editProduct("${d.id}")'>Edit</button>
          <button onclick='deleteProduct("${d.id}")' class="danger">Delete</button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="6">No products yet.</td></tr>`;
}

async function editProduct(id) {
  const doc = await db.collection('products').doc(id).get();
  const p = doc.data();
  editingId = id;
  document.getElementById('f-name').value = p.name || '';
  document.getElementById('f-price').value = p.price || '';
  document.getElementById('f-saleprice').value = p.salePrice || '';
  document.getElementById('f-category').value = p.category || '';
  document.getElementById('f-badge').value = p.badge || '';
  document.getElementById('f-favorite').checked = !!p.favorite;
  document.getElementById('f-image-current').value = p.image || '';
  document.getElementById('form-title').textContent = `Editing: ${p.name}`;
  document.getElementById('cancel-edit-btn').style.display = 'inline-block';

  clearVariantRows();
  if (Array.isArray(p.variants)) {
    p.variants.forEach(v => addVariantRow(v));
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  await db.collection('products').doc(id).delete();
  loadProductTable();
}

document.addEventListener('DOMContentLoaded', checkLogin);
