# Doreah — card checkout on Vercel (no Firebase Blaze needed)

This replaces the two Firebase Cloud Functions with the same two functions
running free on Vercel. Firestore, Hosting, and Auth stay exactly as they
were — only the two payment functions moved.

## 1. Get a Firebase "service account" key
These functions still read/write your Firestore database, just from Vercel
instead of from Firebase. For that they need admin credentials:

1. Firebase Console → ⚙️ **Project Settings** → **Service accounts** tab
2. Click **Generate new private key** → a `.json` file downloads
3. Keep this file safe — it gives full access to your Firebase project.
   Never put it in GitHub.

## 2. Create the Vercel project
1. Create a free account at https://vercel.com (sign in with GitHub is easiest)
2. Push this `vercel-api` folder to its own new GitHub repo (keep it separate
   from your storefront repo, or in a subfolder — either works)
3. In Vercel: **Add New → Project** → import that repo

## 3. Add the environment variables
In Vercel: your project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | your Stripe secret key (`sk_test_...` or later `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | type a placeholder for now, e.g. `placeholder` — you'll replace it in step 5 |
| `SITE_URL` | your live storefront URL, no trailing slash, e.g. `https://yourname.github.io/doreah` |
| `FIREBASE_SERVICE_ACCOUNT` | open the `.json` file from step 1, copy its **entire contents**, and paste as one line |

Click **Deploy**. Vercel gives you a URL like `https://doreah-checkout-api.vercel.app`.

## 4. Point your storefront at the new API
In your storefront's `config.js`, set:
```
const CHECKOUT_API_URL = "https://doreah-checkout-api.vercel.app/api/create-checkout";
```
(use your actual Vercel URL). Push that change to GitHub Pages.

## 5. Connect the Stripe webhook
1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://doreah-checkout-api.vercel.app/api/stripe-webhook`
3. Select events: `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`
4. Open the endpoint → copy its **Signing secret** (`whsec_...`)
5. Back in Vercel env vars, replace the `STRIPE_WEBHOOK_SECRET` placeholder
   with this value, then redeploy (Vercel → Deployments → ⋯ → Redeploy)

## 6. Test it
1. On your live storefront, add something to the bag → **Pay by card**
2. Use test card `4242 4242 4242 4242`, any future date, any CVC
3. You should land on the tracking page; admin → Orders shows **New · Paid ✓**

## Going live
1. Stripe: switch off test mode, copy the live `sk_live_...` key
2. Update `STRIPE_SECRET_KEY` in Vercel to the live key
3. Create a **new live webhook endpoint** (same URL, same 3 events), copy
   its new `whsec_...` into `STRIPE_WEBHOOK_SECRET`
4. Redeploy, then do one small real purchase and refund it from Stripe

## What stayed the same
- Firestore (products, orders, tracking) — still free, untouched
- Firebase Hosting / your GitHub Pages site — untouched
- Firebase Auth for admin login — untouched
- `firestore.rules` — still lock this down with your admin email, same as before

## What you no longer need
- Upgrading to Firebase Blaze
- The `functions/` folder in your old project (kept only for reference)
- `firebase-functions-compat.js` script tag (already removed from `index.html`)
