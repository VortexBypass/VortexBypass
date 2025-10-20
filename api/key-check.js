// api/key-check.js (ESM)
export default function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // Basic CORS — restrict in production to your domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Check if VORTEX_API_KEY is set
  const configured = !!process.env.VORTEX_API_KEY;
  return res.status(200).json({ ok: true, configured });
}
