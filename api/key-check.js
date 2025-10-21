// api/key-check.js (temporary debug, safe — does NOT show the key)
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // CORS for testing only
  res.setHeader('Access-Control-Allow-Origin', '*');

  const configured = !!process.env.VORTEX_API_KEY;
  // VERCEL_ENV can be "production", "preview", or "development" (when running on Vercel)
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';

  // Also show which build/deployment stage the function thinks it's in
  return res.status(200).json({ ok: true, configured, env });
}
