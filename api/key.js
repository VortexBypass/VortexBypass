// api/key.js
export default function handler(req, res) {
  // Allow only GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const key = process.env.VORTEX_API_KEY || null;

  // CORS headers (adjust if you want to restrict)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (!key) {
    return res.status(500).json({ error: 'VORTEX_API_KEY not set' });
  }

  return res.status(200).json({ key });
}
