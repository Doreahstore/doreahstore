/* ============================================================
   DOREAH — Cloud Functions
   createCheckout : called by the storefront. Re-prices the bag from Firestore
                    (the browser is never trusted), saves the order as
                    "awaiting_payment", and returns a Stripe Checkout URL.
   stripeWebhook  : Stripe calls this when the card is charged. Marks the order
                    Paid + New, or cleans up if the checkout expired.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Stripe = require('stripe');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
// Full address of your live website, no trailing slash. Example: https://yourname.github.io/doreah
const SITE_URL = defineString('SITE_URL');

/* ---------- Pricing (mirrors app.js so totals always match) ---------- */
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

// Order IDs like DB-KX4F9-7QM (same shape as before so track.html keeps working)
function makeOrderId() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let t = Date.now(), time = '';
  while (t > 0) { time = abc[t % abc.length] + time; t = Math.floor(t / abc.length); }
  const rnd = crypto.randomBytes(3);
  return 'DB-' + time.slice(-5) + '-' + Array.from(rnd, n => abc[n % abc.length]).join('');
}

/* ============================================================
   createCheckout
   ============================================================ */
exports.createCheckout = onCall({ secrets: [STRIPE_SECRET_KEY], maxInstances: 10 }, async request => {
  const d = request.data || {};
  const name = clean(d.name, 80);
  const phone = clean(d.phone, 25);
  const method = d.method === 'Pickup' ? 'Pickup' : 'Delivery';
  const address = method === 'Delivery' ? clean(d.address, 300) : '';
  const note = clean(d.note, 500);

  if (!name) throw new HttpsError('invalid-argument', 'Please add your name.');
  if (phone.replace(/\D/g, '').length < 7) throw new HttpsError('invalid-argument', 'Please add a valid phone number.');
  if (method === 'Delivery' && !address) throw new HttpsError('invalid-argument', 'Please add your delivery address.');
  if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > 50) {
    throw new HttpsError('invalid-argument', 'Your bag is empty.');
  }

  // Load every product once, from Firestore
  const ids = [...new Set(d.items.map(i => String(i.productId || '')))].filter(Boolean);
  if (!ids.length || ids.some(id => id.includes('/'))) throw new HttpsError('invalid-argument', 'Invalid bag.');
  const snaps = await db.getAll(...ids.map(id => db.collection('products').doc(id)));
  const products = new Map(snaps.filter(s => s.exists).map(s => [s.id, s.data()]));

  const lines = [];      // for the order record
  const stripeLines = []; // for Stripe
  let subtotal = 0;
  for (const raw of d.items) {
    const p = products.get(String(raw.productId));
    if (!p) throw new HttpsError('failed-precondition', 'An item in your bag is no longer available. Please refresh the page.');
    const qty = Math.floor(Number(raw.qty));
    if (!(qty >= 1 && qty <= 99)) throw new HttpsError('invalid-argument', 'Invalid quantity.');

    let v = null;
    if (hasVariants(p)) {
      v = p.variants.find(x => x.name === raw.variantName);
      if (!v) throw new HttpsError('failed-precondition', `The shade "${clean(raw.variantName, 40)}" is no longer available. Please refresh the page.`);
    }
    if (!inStock(p, v)) throw new HttpsError('failed-precondition', `${p.name}${v ? ' — ' + v.name : ''} is sold out. Please remove it from your bag.`);

    const price = unitPrice(p, v);
    if (!(price > 0)) throw new HttpsError('failed-precondition', `${p.name} has no price set.`);
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
  if (subtotal < 50) throw new HttpsError('failed-precondition', 'Order total is too low to process.');

  // Save the order first (unpaid) so the webhook can find it
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

  const site = String(SITE_URL.value() || '').replace(/\/+$/, '');
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: stripeLines,
      client_reference_id: orderId,
      metadata: { orderId },
      payment_intent_data: { description: `Doreah order ${orderId}`, metadata: { orderId } },
      success_url: `${site}/track.html?id=${encodeURIComponent(orderId)}&paid=1`,
      cancel_url: `${site}/index.html?canceled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60 // Stripe minimum is 30 min
    });
    await orderRef.update({ stripeSessionId: session.id });
    return { url: session.url, orderId };
  } catch (err) {
    console.error('Stripe error', err);
    await Promise.all([orderRef.delete(), trackRef.delete()]).catch(() => {});
    throw new HttpsError('internal', 'Could not start card checkout. Please try again in a moment.');
  }
});

/* ============================================================
   stripeWebhook
   ============================================================ */
exports.stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only');

  const stripe = new Stripe(STRIPE_SECRET_KEY.value());
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET.value());
  } catch (err) {
    console.warn('Bad webhook signature');
    return res.status(400).send('Invalid signature');
  }

  const session = event.data.object;
  const orderId = session.metadata && session.metadata.orderId;
  if (!orderId) return res.status(200).send('ignored');

  const found = await db.collection('orders').where('orderId', '==', orderId).limit(1).get();
  if (found.empty) return res.status(200).send('order not found');
  const orderRef = found.docs[0].ref;
  const order = found.docs[0].data();
  const trackRef = db.collection('tracking').doc(orderId);

  try {
    if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')
        && session.payment_status === 'paid') {
      if (order.paymentStatus === 'paid') return res.status(200).send('already paid');
      if (session.amount_total !== cents(order.subtotal)) {
        console.error(`Amount mismatch on ${orderId}: stripe ${session.amount_total} vs order ${cents(order.subtotal)}`);
      }
      await orderRef.update({
        paymentStatus: 'paid',
        status: 'new',
        paidAt: FieldValue.serverTimestamp(),
        email: (session.customer_details && session.customer_details.email) || '',
        amountPaid: (session.amount_total || 0) / 100,
        paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : ''
      });
      await trackRef.set({ status: 'new', paid: true, times: { new: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else if (event.type === 'checkout.session.expired') {
      // Abandoned checkout: remove the unpaid placeholder so it never clutters admin
      if (order.paymentStatus !== 'paid') await Promise.all([orderRef.delete(), trackRef.delete()]);
    }
    return res.status(200).send('ok');
  } catch (err) {
    console.error('Webhook handler failed', err);
    return res.status(500).send('error'); // Stripe will retry
  }
});
