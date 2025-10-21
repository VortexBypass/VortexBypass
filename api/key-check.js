// /api/key-check.js  (CommonJS - good for Vercel Functions)
module.exports = (req, res) => {
  // Only allow GET
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // Quick CORS for testing (tighten in production to your domain)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Helpful log (visible in Vercel deployment logs)
  console.log('[key-check] request received');

  const configured = Boolean(process.env.VORTEX_API_KEY && process.env.VORTEX_API_KEY.length > 0);

  return res.status(200).json({ ok: true, configured });
};
