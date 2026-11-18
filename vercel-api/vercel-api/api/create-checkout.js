/* ============================================================
   POST /api/create-checkout
   Re-prices the bag from Firestore (the browser is never trusted),
   saves the order as "awaiting_payment", and returns a Stripe
   Checkout URL. Same logic as the old Firebase createCheckout.
   ============================================================ */
const crypto = require('crypto');
const Stripe = require('stripe');
const { db, FieldValue } = require('./_firebase');
const { cors } = require('./_cors');

const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const hasVariants = p => Array.isArray(p.variants) && p.variants.length > 0;
function unitPrice(p, v) {
  const price = num(v && v.price) ?? num(p.price) ?? 0;
  const sale = num(v && v.salePrice) ?? num(p.salePrice);
  return sale !== null && sale < price ? sale : price;
}
const inStock = (p, v) => p.inStock !== false && !(v && v.inStock === false);
const cents = n => Math.round(n * 100);
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

function makeOrderId() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let t = Date.now(), time = '';
  while (t > 0) { time = abc[t % abc.length] + time; t = Math.floor(t / abc.length); }
  const rnd = crypto.randomBytes(3);
  return 'DB-' + time.slice(-5) + '-' + Array.from(rnd, n => abc[n % abc.length]).join('');
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const d = req.body || {};
  const name = clean(d.name, 80);
  const phone = clean(d.phone, 25);
  const method = d.method === 'Pickup' ? 'Pickup' : 'Delivery';
  const address = method === 'Delivery' ? clean(d.address, 300) : '';
  const note = clean(d.note, 500);

  const fail = (status, message) => res.status(status).json({ error: message });

  if (!name) return fail(400, 'Please add your name.');
  if (phone.replace(/\D/g, '').length < 7) return fail(400, 'Please add a valid phone number.');
  if (method === 'Delivery' && !address) return fail(400, 'Please add your delivery address.');
  if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > 50) {
    return fail(400, 'Your bag is empty.');
  }

  try {
    const ids = [...new Set(d.items.map(i => String(i.productId || '')))].filter(Boolean);
    if (!ids.length || ids.some(id => id.includes('/'))) return fail(400, 'Invalid bag.');
    const snaps = await db.getAll(...ids.map(id => db.collection('products').doc(id)));
    const products = new Map(snaps.filter(s => s.exists).map(s => [s.id, s.data()]));

    const lines = [];
    const stripeLines = [];
    let subtotal = 0;
    for (const raw of d.items) {
      const p = products.get(String(raw.productId));
      if (!p) return fail(409, 'An item in your bag is no longer available. Please refresh the page.');
      const qty = Math.floor(Number(raw.qty));
      if (!(qty >= 1 && qty <= 99)) return fail(400, 'Invalid quantity.');

      let v = null;
      if (hasVariants(p)) {
        v = p.variants.find(x => x.name === raw.variantName);
        if (!v) return fail(409, `The shade "${clean(raw.variantName, 40)}" is no longer available. Please refresh the page.`);
      }
      if (!inStock(p, v)) return fail(409, `${p.name}${v ? ' — ' + v.name : ''} is sold out. Please remove it from your bag.`);

      const price = unitPrice(p, v);
      if (!(price > 0)) return fail(409, `${p.name} has no price set.`);
      subtotal += cents(price) * qty;

      const image = (v && v.image) || p.image || '';
      lines.push({ name: p.name, variant: v ? v.name : '', qty, price });
      stripeLines.push({
        quantity: qty,
        price_data: {
          currency: 'usd',
          unit_amount: cents(price),
          product_data: {
            name: `${p.name}${v ? ' — ' + v.name : ''}`.slice(0, 250),
            ...(/^https:\/\//.test(image) ? { images: [image] } : {})
          }
        }
      });
    }
    if (subtotal < 50) return fail(409, 'Order total is too low to process.');

    const orderId = makeOrderId();
    const orderRef = db.collection('orders').doc();
    const trackRef = db.collection('tracking').doc(orderId);
    const itemStrings = lines.map(i => `${i.name}${i.variant ? ' — ' + i.variant : ''} × ${i.qty}`);
    const batch = db.batch();
    batch.set(orderRef, {
      orderId, name, phone, method, note, address,
      items: lines,
      subtotal: subtotal / 100,
      status: 'awaiting_payment',
      paymentStatus: 'unpaid',
      createdAt: FieldValue.serverTimestamp()
    });
    batch.set(trackRef, {
      orderId, method, status: 'awaiting_payment', paid: false,
      items: itemStrings,
      createdAt: FieldValue.serverTimestamp()
    });
    await batch.commit();

    const site = String(process.env.SITE_URL || '').replace(/\/+$/, '');
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: stripeLines,
        client_reference_id: orderId,
        metadata: { orderId },
        payment_intent_data: { description: `Doreah order ${orderId}`, metadata: { orderId } },
        success_url: `${site}/track.html?id=${encodeURIComponent(orderId)}&paid=1`,
        cancel_url: `${site}/index.html?canceled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60
      });
      await orderRef.update({ stripeSessionId: session.id });
      return res.status(200).json({ url: session.url, orderId });
    } catch (err) {
      console.error('Stripe error', err);
      await Promise.all([orderRef.delete(), trackRef.delete()]).catch(() => {});
      return fail(500, 'Could not start card checkout. Please try again in a moment.');
    }
  } catch (err) {
    console.error('createCheckout failed', err);
    return fail(500, 'Something went wrong. Please try again in a moment.');
  }
};
