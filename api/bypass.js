// /api/bypass.js  (ESM - requires "type":"module" in package.json)
// Accepts GET (/api/bypass?url=...) or POST (JSON { url: "..." })
// Calls upstream trw.lat endpoints server-side using VORTEX_API_KEY and handles v2 polling.

export const config = {}; // placeholder if you want to add runtime config later

export default async function handler(req, res) {
  // Basic CORS — restrict to your domain in production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const key = process.env.VORTEX_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: 'Server misconfiguration: VORTEX_API_KEY missing' });

  // extract target URL
  let targetUrl = null;
  try {
    if (req.method === 'GET') {
      // req.url is a relative path like "/api/bypass?url=..."
      const base = `https://${req.headers.host || 'localhost'}`;
      const u = new URL(req.url, base);
      targetUrl = u.searchParams.get('url') || null;
    } else {
      // POST
      if (typeof req.json === 'function') {
        const body = await req.json();
        targetUrl = body && body.url ? body.url : null;
      } else {
        // fallback (rare)
        const text = await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', chunk => data += chunk);
          req.on('end', () => resolve(data));
          req.on('error', err => reject(err));
        });
        try {
          const parsed = text ? JSON.parse(text) : null;
          targetUrl = parsed && parsed.url ? parsed.url : null;
        } catch (e) {
          targetUrl = null;
        }
      }
    }
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Failed to parse request' });
  }

  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing url parameter' });
  }

  // upstream host lists
  const generalAPIs = ["work.ink", "linkvertise", "link-unlocker.com"];
  const v2APIs = ["pandadevelopment.net", "keyrblx.com", "krnl.cat"];

  let apiUrl = '';
  let useV2 = false;
  if (generalAPIs.some(d => targetUrl.includes(d))) {
    apiUrl = `https://trw.lat/api/bypass?url=${encodeURIComponent(targetUrl)}`;
  } else if (v2APIs.some(d => targetUrl.includes(d))) {
    apiUrl = `https://trw.lat/api/v2/bypass?url=${encodeURIComponent(targetUrl)}`;
    useV2 = true;
  } else {
    return res.status(400).json({ ok: false, error: 'Unsupported URL' });
  }

  try {
    const start = Date.now();

    // Call upstream (server-side) using fetch available in Node 18+ on Vercel
    const initRes = await fetch(apiUrl, { headers: { 'x-api-key': key } });
    const initText = await initRes.text().catch(()=>null);
    let initJson = null;
    try { initJson = initText ? JSON.parse(initText) : null; } catch(e) { initJson = null; }

    if (!initRes.ok) {
      return res.status(502).json({ ok: false, error: `Upstream returned ${initRes.status}`, upstream: initJson || initText });
    }

    // v2 thread flow
    if (useV2 && initJson && initJson.ThreadID) {
      const threadId = initJson.ThreadID;
      const pollUrl = `https://trw.lat/api/v2/threadcheck?id=${encodeURIComponent(threadId)}`;
      const maxAttempts = 120;
      const delayMs = 500;
      let attempts = 0;

      while (attempts < maxAttempts) {
        attempts++;
        const p = await fetch(pollUrl, { headers: { 'x-api-key': key } });
        const pt = await p.text().catch(()=>null);
        let pj = null;
        try { pj = pt ? JSON.parse(pt) : null; } catch(e) { pj = null; }

        if (p.ok && pj) {
          if (pj.status === 'Done' && pj.result) {
            const elapsed = Date.now() - start;
            return res.status(200).json({ ok: true, result: pj.result, elapsedMs: elapsed });
          }
          if (pj.status === 'Error' || pj.error) {
            return res.status(502).json({ ok: false, error: pj.error || 'Thread returned error', upstream: pj });
          }
        }

        // wait
        await new Promise(r => setTimeout(r, delayMs));
      }

      // timed out
      return res.status(504).json({ ok: false, error: 'Timed out waiting for thread result' });
    }

    // immediate result
    if (initJson && initJson.result) {
      const elapsed = Date.now() - start;
      return res.status(200).json({ ok: true, result: initJson.result, elapsedMs: elapsed });
    }

    // fallback: upstream returned some unexpected data (text or other)
    return res.status(502).json({ ok: false, error: 'Unexpected response shape from upstream', upstream: initJson || initText });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
