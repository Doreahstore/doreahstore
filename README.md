# 💄 Doreah Beauty — Storefront

A fast, mobile-first lipstick store. Customers browse shades, fill their bag and send the order to you on **WhatsApp** in one tap. You manage everything from **admin.html** on your phone.

**Stack:** plain HTML/CSS/JS · Firebase (Firestore + Auth) · ImgBB for photos · GitHub Pages hosting. No build step.
  .
---

## ✨ What's in it

**Storefront (`index.html`)**
- Hero with slow zoom, animated text, scrolling ticker
- **Shade swatches** on every product: tap a colour and the price, photo and stock update instantly
- **Quick View** pop-up with description, shade picker, quantity and a **Share** button (links open straight to that product: `yoursite/#p-PRODUCT_ID`)
- **Search, sort and category filters** (+ an automatic "On Sale" filter)
- Automatic **sale badges** (−20%) and **Sold Out** state
- Collection cards build themselves from your categories
- **Bag drawer** with quantity controls and a **free-shipping progress bar**
- **Checkout form** (name, delivery/pickup, address, note) that writes a clean WhatsApp order with an order number. Returning customers are pre-filled.
- Every order is also saved to your **Orders** tab
- Floating WhatsApp button, social links, skeleton loading, scroll animations, SEO / link-preview tags, keyboard & screen-reader friendly

**Admin (`admin.html`)**
- Secure login with **Firebase Authentication** (email + password, with "forgot password")
- Dashboard: products, sold-out count, new orders, sales this month
- Add/edit products with description, sale price, badge, **In stock** and **Favorites** toggles
- Shades with **colour picker**, own price, own photo, own stock, reorder
- Photos are **auto-compressed on your phone** before upload (much faster)
- One-tap ★ Favorite / In stock toggles, **Duplicate** product, search
- **Orders** tab: New → Confirmed → Delivered / Cancelled
- **Collections** tab: lock a photo, upload a custom one, add a tagline ("Best Seller")

---

## 🚀 Setup (one time, ~10 minutes)

### 1. Turn on admin login
1. [Firebase Console](https://console.firebase.google.com) → your project **doreahstore**
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save**
3. **Users → Add user** → your email + a strong password. This is your admin login.

### 2. Lock down your database (important!)
1. **Build → Firestore Database → Rules**
2. Paste everything from `firestore.rules`
3. Replace `YOUR_ADMIN_EMAIL@gmail.com` with the email from step 1
4. **Publish**

> Without this, anyone who knows your project ID could edit or delete your products.

### 3. Put it on GitHub Pages
1. Upload all files to a GitHub repo (e.g. `doreah-store`)
2. Repo → **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**
3. Your site will be at `https://waldoantony.github.io/doreah-store/`
4. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain** → `waldoantony.github.io` (and your custom domain if you add one). Admin login won't work on the live site without this.

### 4. Fill in your details
Open `config.js` and set your WhatsApp number, hero photo, ticker text, free-shipping amount and social links.

---

## 🛍️ Daily use

| I want to… | Do this |
|---|---|
| Add a lipstick with 5 shades | Admin → fill in the product → **+ Add shade** for each, pick its colour (and photo if you have one) |
| Mark a shade sold out | Edit the product → untick **In stock** on that shade |
| Put something on sale | Fill in **Sale price** — the −% badge and "On Sale" filter appear automatically |
| Feature on the homepage | Tap **★ Fav** in the product list |
| Handle an order | Customer's WhatsApp message arrives → Admin → **Orders** → set to **Confirmed**, then **Delivered** |
| Share a product on TikTok/IG | Open it on the site → **Share this product** |

**Note:** an order shows up as *New* when the customer taps "Order on WhatsApp". If they never actually send the message, just set it to *Cancelled*.

---

## 🔒 Security notes
- The old admin password lived in `config.js`, which anyone can read on GitHub. It's gone — login now goes through Firebase Auth, and `firestore.rules` decides who can edit.
- The Firebase `apiKey` is meant to be public; that's normal.
- The ImgBB key is visible in `config.js`. The worst someone can do with it is upload photos to your ImgBB account. If that ever happens, generate a new key at api.imgbb.com.

---

## 📁 Files
```
index.html       storefront
style.css        storefront styles
app.js           storefront logic (products, bag, WhatsApp checkout)
admin.html       admin panel
admin.css        admin styles
admin.js         admin logic
config.js        your settings
firestore.rules  database security (paste into Firebase)
```
