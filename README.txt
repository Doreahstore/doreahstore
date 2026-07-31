DOREAH BEAUTY — STANDALONE SITE
================================

FILES
-----
index.html   → the storefront customers see
admin.html   → your private product manager (password protected)
config.js    → the ONLY file you need to edit to go live
style.css / app.js / admin.js → the site's design and logic (no need to touch these)


STEP 1 — SET YOUR ADMIN PASSWORD
---------------------------------
Open config.js, change:
    const ADMIN_PASSWORD = "doreah2026";
to any password you want.


STEP 2 — GET A FREE IMGBB KEY (for product photos)
----------------------------------------------------
1. Go to https://api.imgbb.com/
2. Click "Get API Key" and sign up (free)
3. Copy the key into config.js:
    const IMGBB_API_KEY = "paste-it-here";


STEP 3 — SET UP FIREBASE (so your product list is shared with every visitor)
------------------------------------------------------------------------------
You already use Firebase for the restaurant app, so this will feel familiar.

1. Go to https://console.firebase.google.com and create a new project (or reuse one).
2. In the project, click the "</>" (web app) icon to register a web app.
3. Copy the firebaseConfig object it gives you into config.js, replacing the
   placeholder values (apiKey, authDomain, projectId, etc).
4. In the left sidebar, go to Build → Firestore Database → Create database.
   Choose "Start in test mode" for now (fine for a small store; ask me later
   about locking it down with security rules once you're ready to launch).
5. That's it — no need to manually create a "products" collection, the admin
   panel will create it the first time you save a product.


STEP 4 — SET YOUR WHATSAPP NUMBER
------------------------------------
Already set to +1 954 802 4675 in config.js. Change WHATSAPP_NUMBER there if needed.


VARIANTS (SHADES)
------------------
In admin.html, under a product's form, click "+ Add Variant" to add shade
options (e.g. Bark Red, Rosewood, Berry Bold). Each variant can optionally
have its own price and its own photo — leave either blank and it'll use the
product's main price/photo instead. On the storefront, a dropdown appears
on that product's card so customers pick a shade before adding to cart; the
photo and price update live as they switch shades.


HERO BACKGROUND PHOTO & TICKER STRIP
--------------------------------------
Want the lipstick photo behind your hero text, like your Shopify version?
1. Upload your photo at https://imgbb.com/ (no account needed) and copy the
   "Direct link" it gives you.
2. Paste it into config.js:
       const HERO_IMAGE_URL = "https://i.ibb.co/yourimage.jpg";
3. Refresh index.html — the photo replaces the pink gradient automatically,
   with a dark overlay so the white text stays readable.
Leave HERO_IMAGE_URL as "" to keep the plain pink gradient.

The scrolling ticker under the hero (like "FREE SHIPPING OVER $50") is also
editable in config.js under MARQUEE_TEXT — just edit that list of phrases.


HOW IT WORKS
------------
- You manage products (photo, name, price, sale price, category, and whether
  it shows in "Doreah Favorites") from admin.html.
- Photos upload to ImgBB and get stored as a link; product info is stored in
  Firestore. Every visitor to index.html reads the same live product list.
- Customers browse, add items to a cart (bottom-right cart icon), adjust
  quantities, then tap "Checkout on WhatsApp." This opens WhatsApp with a
  pre-filled message listing their items and total, sent to your number —
  there is no live chat widget, WhatsApp only opens at checkout as requested.
- The cart itself lives in the customer's own browser (standard cart
  behavior) — it's the product catalog that's shared and managed by you.


HOSTING
-------
This is a fully static site — you can host it for free on GitHub Pages
(same as boulbolet.com), Netlify, or Vercel. Just upload all the files in
this folder together.


UNTIL YOU FINISH FIREBASE SETUP
--------------------------------
The storefront will show 3 demo products so you can see the design working
right away. Once Firebase is configured and you add real products in
admin.html, those will replace the demo ones automatically.
