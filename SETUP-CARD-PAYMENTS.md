# Doreah — card payments setup (Stripe + Firebase)

How it works now: the customer fills the bag form and taps **Pay by card** → a Firebase Cloud Function re-prices the bag from your products (the browser's prices are never trusted) → the customer pays on Stripe's secure page → Stripe tells your webhook → the order shows up in admin as **New + Paid ✓** and the tracking page updates. Unfinished checkouts delete themselves after ~1 hour.

You do this once. Use Stripe **test mode** first, then switch to live.

## 1. Stripe account
1. Create an account at https://stripe.com and finish business/bank details (needed to go live; test mode works right away).
2. Dashboard → **Developers → API keys** → copy the **Secret key** (`sk_test_...`). Never put it in `config.js` or GitHub.
3. Dashboard → **Settings → Emails** → turn on **Successful payments** so customers get a receipt (this is also where they see their order number).

## 2. Firebase: upgrade to Blaze
Cloud Functions need the pay-as-you-go **Blaze** plan (Firebase Console → bottom-left "Upgrade"). A store this size stays inside the free allowance. Add a budget alert (e.g. $5) when it asks.

## 3. Install tools and log in (on your computer)
```
npm install -g firebase-tools
firebase login
cd your-project-folder
firebase use doreahstore-b6644
cd functions && npm install && cd ..
```

## 4. Tell the functions your website address
Create a file `functions/.env` containing your live site (no trailing slash):
```
SITE_URL=https://YOURNAME.github.io/YOURREPO
```
(`.env` is in `.gitignore`, so it won't go to GitHub.)

## 5. Secrets, first deploy, webhook
```
firebase functions:secrets:set STRIPE_SECRET_KEY        # paste sk_test_...
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET    # type: placeholder (for now)
firebase deploy --only functions
```
The deploy prints a URL for **stripeWebhook** (looks like `https://stripewebhook-xxxx-uc.a.run.app`). Then:
1. Stripe Dashboard → **Developers → Webhooks → Add endpoint** → paste that URL.
2. Select these events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`.
3. Open the endpoint and copy its **Signing secret** (`whsec_...`), then:
```
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET    # paste whsec_...
firebase deploy --only functions
```

## 6. Lock down the database rules
1. Open `firestore.rules` and replace `YOUR_ADMIN_EMAIL@gmail.com` with the email you log into admin with.
2. `firebase deploy --only firestore:rules`

Orders can now only be created by the server, so nobody can fake an order or a price from the browser.

## 7. Publish the website files
Push the updated files to GitHub (`index.html`, `app.js`, `style.css`, `track.html`, `track.js`, `admin.html`, `admin.js`, `admin.css`, `config.js`). Do **not** upload `functions/.env`.

## 8. Test it
1. Add something to the bag → **Pay by card**.
2. Use test card `4242 4242 4242 4242`, any future date, any CVC.
3. You land on the tracking page ("Payment received"); admin → Orders shows the order as **New · Paid ✓**.
4. Close the Stripe page without paying → the bag is still there, and the unpaid order clears itself in about an hour.

## Going live
1. Stripe: switch off test mode, copy the live `sk_live_...` key.
2. Create a **new live webhook endpoint** (same URL, same 3 events) and copy its new `whsec_...`.
3. Run both `firebase functions:secrets:set` commands again with the live values, then `firebase deploy --only functions`.
4. Do one real small purchase, then refund it from the Stripe Dashboard.

## Good to know
- **Fees:** Stripe takes about 2.9% + 30¢ per card payment. Shipping is included in your prices, so the amount charged is exactly the bag total.
- **Minimum order:** Stripe cannot charge under 50¢.
- **Apple Pay / Google Pay** appear automatically on Stripe's page when the customer's device supports them.
- **Sales tax:** if you need to collect Florida sales tax, ask your accountant; Stripe Tax can add it later.
- **Refunds / disputes:** handled in the Stripe Dashboard (Payments).
- **Admin "Send update"** still opens WhatsApp with the customer's phone number so you can send them tracking; the floating chat button on the site is now just a support link.
- **Optional hardening:** turn on Firebase App Check (reCAPTCHA) to stop bots from hammering the checkout function.
