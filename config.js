/* ============================================================
   DOREAH — CONFIG
   Everything you can change without touching the code.
   Setup steps are in README.md
   ============================================================ */

// ---- 1. FIREBASE (stores products, collection cards and orders) ----
// Firebase Console → Project Settings → General → Your apps → SDK setup.
// These values are safe to be public — security comes from firestore.rules.
const firebaseConfig = {
  apiKey: "AIzaSyBvx8IVJ2qZyvflmImv9xRWsKVVhL1g7L0",
  authDomain: "doreahstore-b6644.firebaseapp.com",
  projectId: "doreahstore-b6644",
  storageBucket: "doreahstore-b6644.firebasestorage.app",
  messagingSenderId: "911479957331",
  appId: "1:911479957331:web:b7b2bfabe9048a47b963a6"
};

// ---- 2. IMGBB (hosts your product photos) ----
// Free key at https://api.imgbb.com/
const IMGBB_API_KEY = "47782a3bb044db07229a7ee9e16ba23a";

// ---- 3. WHATSAPP (support chat button only; orders are now paid by card) ----
const WHATSAPP_NUMBER = "19548024675"; // country code + number, no + or spaces

// ---- 4. ADMIN LOGIN ----
// There is no password in this file anymore (anyone could read it on GitHub).
// The admin page now logs in with Firebase Authentication — see README.md, step 1.

// ---- 5. HERO BACKGROUND IMAGE (optional) ----
// Paste an image URL (e.g. an ImgBB "Direct link"). Leave "" for the pink gradient.
const HERO_IMAGE_URL = "https://i.ibb.co/jPBKc1m2/5001508271558429594-121.jpg";

// ---- 6. SCROLLING TICKER TEXT ----
const MARQUEE_TEXT = ["Curated Shades", "Free Shipping On Every Order", "Cruelty-Free", "Made With Love"];

// ---- 7. STORE SETTINGS ----
const STORE = {
  freeShippingThreshold: 0,    // 0 = no progress bar (shipping is already included in every price)
  instagram: "",               // full link, e.g. "https://instagram.com/doreahbeauty"
  tiktok: "",                  // e.g. "https://www.tiktok.com/@doreahbeauty"
  facebook: "",                // e.g. "https://facebook.com/doreahbeauty"
  email: ""                    // e.g. "hello@doreahbeauty.com"
};
