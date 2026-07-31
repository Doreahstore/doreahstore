/* ============================================================
   DOREAH — CONFIG
   Fill these in before you launch. Instructions are in README.txt
   ============================================================ */

// ---- 1. FIREBASE (stores your product list: name, price, category) ----
// Get this from: Firebase Console → Project Settings → General → Your apps → SDK setup
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ---- 2. IMGBB (stores your product photos, gives back a URL) ----
// Get a free key at: https://api.imgbb.com/  (click "Get API Key")
const IMGBB_API_KEY = "47782a3bb044db07229a7ee9e16ba23a";

// ---- 3. WHATSAPP ----
const WHATSAPP_NUMBER = "19548024675"; // no + or spaces

// ---- 4. ADMIN PASSWORD ----
// Simple gate for the admin page. Change this to something only you know.
const ADMIN_PASSWORD = "doreah2026";

// ---- 5. HERO BACKGROUND IMAGE (optional) ----
// Paste an image URL here to use a photo behind the hero text instead of the
// pink gradient (like your Shopify hero). Easiest way to get a URL: upload
// your photo at https://imgbb.com/ (no account needed for a one-off image)
// and paste the "Direct link" it gives you.
// Leave this as "" to keep the plain pink gradient background.
const HERO_IMAGE_URL = "";

// ---- 6. SCROLLING TICKER TEXT (optional) ----
// Shown as a scrolling strip under the hero, like your Shopify site.
const MARQUEE_TEXT = ["CURATED SHADES", "FREE SHIPPING OVER $50", "CRUELTY-FREE", "MADE WITH LOVE"];
