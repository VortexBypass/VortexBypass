// /api/key-check.js  (ESM)
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // Basic CORS (adjust for production)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  console.log('[key-check] endpoint hit');

  const configured = !!process.env.VORTEX_API_KEY;
  return res.status(200).json({ ok: true, configured });
}
