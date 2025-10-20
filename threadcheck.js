// api/threadcheck.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const TRW_API_KEY = process.env.TRW_API_KEY || 'e256fa8b-7df7-4264-8bbd-2d142e2d0a45';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  let body;
  try {
    body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body);
  } catch (e) {
    body = {};
  }
  const { id } = body || {};
  if (!id) {
    res.status(400).json({ error: 'Missing id parameter' });
    return;
  }

  try {
    const url = `https://trw.lat/api/v2/threadcheck?id=${encodeURIComponent(id)}`;
    const apiRes = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': TRW_API_KEY,
        'Accept': 'application/json'
      }
    });
    const text = await apiRes.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = { raw: text }; }
    res.status(apiRes.status).json(parsed);
  } catch (err) {
    console.error('ThreadCheck error', err);
    res.status(500).json({ error: 'ThreadCheck error', details: String(err) });
  }
};