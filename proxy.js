// api/proxy.j
// No external dependencies — uses Node's built-in fetch.

const TRW_API_KEY = 'e256fa8b-7df7-4264-8bbd-2d142e2d0a45';

// Allowed sites
const ALLOWED_V1 = ['work.ink', 'linkvertise.com', 'link-unlocker.com'];
const ALLOWED_V2 = ['pandadevelopment.net', 'keyrblx.com', 'krnl.cat'];

function getHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function getMode(host) {
  if (ALLOWED_V1.some(d => host === d || host.endsWith('.' + d))) return 'v1';
  if (ALLOWED_V2.some(d => host === d || host.endsWith('.' + d))) return 'v2';
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET with ?url=' });
    return;
  }

  const { url } = req.query;
  if (!url) {
    res.status(400).json({ error: 'Missing ?url parameter' });
    return;
  }

  const host = getHost(url);
  const mode = getMode(host);
  if (!mode) {
    res.status(400).json({ error: 'URL not allowed' });
    return;
  }

  try {
    const endpoint =
      mode === 'v1'
        ? `https://trw.lat/api/bypass?url=${encodeURIComponent(url)}`
        : `https://trw.lat/api/v2/bypass?url=${encodeURIComponent(url)}`;

    const response = await fetch(endpoint, {
      headers: { 'x-api-key': TRW_API_KEY },
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Proxy error', details: String(err) });
  }
}
