// api/bypass.js  (ESM - requires "type": "module" in package.json)
export default async function handler(req, res) {
  // Basic CORS — lock this down in production to your site origin
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

  // get url from query param (GET) or body (POST)
  let targetUrl = null;
  try {
    if (req.method === 'GET') {
      const q = new URL(req.url, `http://${req.headers.host}`);
      targetUrl = q.searchParams.get('url') || null;
    } else {
      // POST - parse JSON body (Edge and Node runtimes differ; use req.json() when available)
      if (typeof req.json === 'function') {
        const body = await req.json();
        targetUrl = body && body.url ? body.url : null;
      } else {
        // fallback: read raw body
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

    // Upstream GET (server-side) with key
    const initRes = await fetch(apiUrl, { headers: { 'x-api-key': key } });
    const initText = await initRes.text().catch(()=>null);
    let initJson = null;
    try { initJson = initText ? JSON.parse(initText) : null; } catch(e) { initJson = null; }

    if (!initRes.ok) {
      return res.status(502).json({ ok: false, error: `Upstream returned ${initRes.status}`, upstream: initJson || initText });
    }

    // If v2 thread flow, poll server-side
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
        // wait before next poll
        await new Promise(r => setTimeout(r, delayMs));
      }

      // timed out
      return res.status(504).json({ ok: false, error: 'Timed out waiting for thread result' });
    }

    // immediate result path
    if (initJson && initJson.result) {
      const elapsed = Date.now() - start;
      return res.status(200).json({ ok: true, result: initJson.result, elapsedMs: elapsed });
    }

    // fallback: unexpected shape
    return res.status(502).json({ ok: false, error: 'Unexpected response shape from upstream', upstream: initJson || initText });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
