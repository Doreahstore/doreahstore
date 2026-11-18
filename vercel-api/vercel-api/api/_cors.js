/* Allows your storefront's domain to call these functions from the browser. */
function cors(req, res) {
  const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
  res.setHeader('Access-Control-Allow-Origin', site || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true; // caller should stop here
  }
  return false;
}

module.exports = { cors };
