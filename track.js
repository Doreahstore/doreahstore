/* ============================================================
   DOREAH — Order tracking page (track.html?id=DB-XXXXX-XXX)
   Reads the public "tracking" record only — never names, phones or addresses.
   ============================================================ */
'use strict';

let db = null;
try {
  if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined' &&
      firebaseConfig.apiKey && !/^YOUR_/.test(firebaseConfig.apiKey)) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  }
} catch (e) { console.warn('Firebase not configured yet:', e); }

const $ = (s, root = document) => root.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WA_NUMBER = typeof WHATSAPP_NUMBER !== 'undefined' ? String(WHATSAPP_NUMBER).replace(/\D/g, '') : '';
const waLink = text => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
const toDate = ts => ts && ts.toDate ? ts.toDate() : null;
const fmt = ts => { const d = toDate(ts); return d ? d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; };

const urlParams = new URLSearchParams(location.search);
let justPaid = urlParams.get('paid') === '1';   // arrived straight from Stripe

function rememberOrder(orderId) {
  try {
    const list = JSON.parse(localStorage.getItem('doreah_my_orders') || '[]').filter(x => x.id !== orderId);
    list.unshift({ id: orderId, at: Date.now() });
    localStorage.setItem('doreah_my_orders', JSON.stringify(list.slice(0, 10)));
  } catch { /* ignore */ }
}

const CARRIERS = {
  USPS:  { name: 'USPS',  url: n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}` },
  UPS:   { name: 'UPS',   url: n => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}` },
  FedEx: { name: 'FedEx', url: n => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}` },
  DHL:   { name: 'DHL',   url: n => `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(n)}` },
  Local: { name: 'Local delivery', url: null }
};

function steps(method) {
  return method === 'Pickup'
    ? [['new', 'Payment received', 'Thank you! Your payment went through and your order is in.'],
       ['confirmed', 'Confirmed', 'We\'re getting your goodies ready.'],
       ['ready', 'Ready for pickup', 'Your order is packed and waiting for you!'],
       ['delivered', 'Picked up', 'Enjoy your new shades 💄']]
    : [['new', 'Payment received', 'Thank you! Your payment went through and your order is in.'],
       ['confirmed', 'Confirmed', 'We\'re packing your order.'],
       ['shipped', 'Shipped', 'Your package is on its way.'],
       ['delivered', 'Delivered', 'Enjoy your new shades 💄']];
}

const HEADLINES = {
  new: ['Payment received', 'Thank you! We\'re getting your order ready.'],
  awaiting_payment: ['Waiting for payment', 'Finish paying on the secure checkout page. If you already paid, this updates in a few seconds.'],
  confirmed: ['Order confirmed', 'We\'re preparing your order with love.'],
  shipped: ['On its way!', 'Your package has left our hands.'],
  ready: ['Ready for pickup!', 'Come grab your order whenever you\'re ready.'],
  delivered: ['Delivered', 'Thank you for shopping with Doreah 💋'],
  cancelled: ['Order cancelled', 'This order was cancelled. Questions? Message us.']
};

function renderTracking(t) {
  if (justPaid && t.paid) {
    justPaid = false;
    try { localStorage.removeItem('doreah_cart'); } catch { /* ignore */ }
    rememberOrder(t.orderId);
    toast('Payment received — thank you! 💋');
  }
  const list = steps(t.method);
  const noTimeline = t.status === 'cancelled' || t.status === 'awaiting_payment';
  const current = Math.max(0, list.findIndex(s => s[0] === t.status));
  const times = t.times || {};
  let [title, sub] = HEADLINES[t.status] || HEADLINES.new;
  if (justPaid && t.status === 'awaiting_payment') [title, sub] = ['Confirming your payment…', 'This takes a few seconds. The page updates by itself.'];
  const carrier = CARRIERS[t.carrier];
  const showShip = t.method !== 'Pickup' && (t.trackingNumber || carrier);

  $('#track-result').innerHTML = `
  <article class="track-card status-${esc(t.status)}">
    <div class="track-top">
      <div>
        <span class="track-id">Order ${esc(t.orderId)}</span>
        <h2 class="track-title">${esc(title)}</h2>
        <p class="track-sub">${esc(sub)}</p>
      </div>
      <div class="track-pills">${t.paid ? '<span class="track-pill paid">Paid ✓</span>' : ''}<span class="track-pill">${esc(t.method === 'Pickup' ? 'Pickup' : 'Delivery')}</span></div>
    </div>

    ${noTimeline ? '' : `
    <div class="track-bar"><span style="width:${(current / (list.length - 1)) * 100}%"></span></div>
    <ol class="timeline">
      ${list.map(([key, label, desc], i) => {
        const when = key === 'new' ? (times.new || t.createdAt) : times[key];
        const state = i < current ? 'done' : i === current ? (t.status === 'delivered' ? 'done' : 'current') : 'todo';
        return `<li class="${state}">
          <span class="dot">${state === 'done' ? '✓' : ''}</span>
          <div><strong>${esc(label)}</strong>${state !== 'todo' ? `<p>${esc(desc)}</p>` : ''}${when && state !== 'todo' ? `<time>${esc(fmt(when))}</time>` : ''}</div>
        </li>`;
      }).join('')}
    </ol>`}

    ${showShip ? `
    <div class="ship-box">
      <div>
        <span class="ship-label">${esc(carrier ? carrier.name : 'Carrier')}</span>
        ${t.trackingNumber ? `<div class="ship-number">${esc(t.trackingNumber)} <button type="button" class="link-btn" id="copy-tn">Copy</button></div>` : '<div class="ship-number muted">Tracking number coming soon</div>'}
      </div>
      ${carrier && carrier.url && t.trackingNumber ? `<a class="btn btn-dark" href="${esc(carrier.url(t.trackingNumber))}" target="_blank" rel="noopener">Track on ${esc(carrier.name)} ↗</a>` : ''}
    </div>` : ''}

    ${Array.isArray(t.items) && t.items.length ? `
    <details class="track-items"><summary>What's in this order (${t.items.length})</summary>
      <ul>${t.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    </details>` : ''}

    <a class="track-help" href="${esc(waLink(`Hi Doreah! I have a question about my order ${t.orderId}.`))}" target="_blank" rel="noopener">💬 Questions about this order? Message us</a>
  </article>`;

  const copy = $('#copy-tn');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(t.trackingNumber); toast('Tracking number copied'); } catch { /* ignore */ }
  };
}

let unsubscribe = null;
function track(rawId) {
  const id = String(rawId || '').trim().toUpperCase().replace(/\s+/g, '');
  const out = $('#track-result');
  if (!id) { out.innerHTML = ''; return; }
  $('#track-input').value = id;
  history.replaceState(null, '', '?id=' + encodeURIComponent(id));
  if (!/^DB-[A-Z0-9-]{3,16}$/.test(id)) {
    out.innerHTML = `<div class="track-empty">That doesn't look like a Doreah order number. It starts with <strong>DB-</strong> — check your receipt or confirmation page.</div>`;
    return;
  }
  if (!db) { out.innerHTML = `<div class="track-empty">Tracking isn't available right now. Please message us on WhatsApp.</div>`; return; }

  out.innerHTML = `<div class="track-card"><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>`;
  if (unsubscribe) unsubscribe();
  // Live: the page updates by itself the moment you change the status in admin
  unsubscribe = db.collection('tracking').doc(id).onSnapshot(snap => {
    if (!snap.exists) {
      out.innerHTML = `<div class="track-empty">We couldn't find order <strong>${esc(id)}</strong>.<br>If you just ordered, give it a minute — or <a href="${esc(waLink(`Hi Doreah! I can't find my order ${id}.`))}" target="_blank" rel="noopener">message us on WhatsApp</a>.</div>`;
      return;
    }
    renderTracking(snap.data());
  }, () => {
    out.innerHTML = `<div class="track-empty">Couldn't load tracking. Check your connection and try again.</div>`;
  });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.innerHTML = '<span></span>';
  t.firstChild.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function renderRecent() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('doreah_my_orders') || '[]'); } catch { /* ignore */ }
  if (!list.length) return;
  const box = $('#recent-orders');
  box.hidden = false;
  box.innerHTML = `<span>Your recent orders:</span>` +
    list.map(o => `<button type="button" class="chip" data-id="${esc(o.id)}">${esc(o.id)}</button>`).join('');
  box.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) track(b.dataset.id); });
}

$('#track-form').addEventListener('submit', e => { e.preventDefault(); track($('#track-input').value); });
$('#wa-float').href = waLink('Hi Doreah! 💄 I have a question about my order.');
if (!WA_NUMBER) $('#wa-float').hidden = true;

renderRecent();
const startId = new URLSearchParams(location.search).get('id');
if (startId) track(startId);
else {
  try {
    const last = JSON.parse(localStorage.getItem('doreah_my_orders') || '[]')[0];
    if (last) track(last.id);
  } catch { /* ignore */ }
}
