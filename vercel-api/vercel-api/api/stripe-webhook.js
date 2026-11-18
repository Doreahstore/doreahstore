/* ============================================================
   POST /api/stripe-webhook
   Stripe calls this when the card is charged. Marks the order
   Paid + New, or cleans up if the checkout expired.
   Needs the RAW body to verify Stripe's signature, so bodyParser
   is turned off below — do not remove that config export.
   ============================================================ */
const Stripe = require('stripe');
const { db, FieldValue } = require('./_firebase');

module.exports.config = { api: { bodyParser: false } };

const cents = n => Math.round(n * 100);

function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only');

  const rawBody = await buffer(req);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
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
      if (order.paymentStatus !== 'paid') await Promise.all([orderRef.delete(), trackRef.delete()]);
    }
    return res.status(200).send('ok');
  } catch (err) {
    console.error('Webhook handler failed', err);
    return res.status(500).send('error'); // Stripe will retry
  }
};
