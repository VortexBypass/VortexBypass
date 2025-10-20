// api/proxy.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const TRW_API_KEY = process.env.TRW_API_KEY || 'e256fa8b-7df7-4264-8bbd-2d142e2d0a45';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '';
const RECAPTCHA_MIN_SCORE = parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5');
const ALLOW_SUBDOMAINS = (String(process.env.ALLOW_SUBDOMAINS || 'true').toLowerCase() === 'true');

// Allowed base domains
const ALLOWED_V1 = ['work.ink','linkvertise.com','link-unlocker.com'];
const ALLOWED_V2 = ['pandadevelopment.net','keyrblx.com','krnl.cat'];

// Optional per-domain allowed path regexes (strings)
const ALLOWED_PATHS = {
  // Example: only allow specific paths on a domain:
  // 'keyrblx.com': ['^/s/.*', '^/dl/.*']
  // Leave empty or remove entries to allow any path for that domain.
};

function getHostname(u) {
  try {
    const url = new URL(u);
    return url.hostname.replace(/^www\./,'').toLowerCase();
  } catch (e) {
    return null;
  }
}

function hostnameMatchesDomain(hostname, domain) {
  if (!hostname || !domain) return false;
  if (hostname === domain) return true;
  if (ALLOW_SUBDOMAINS && hostname.endsWith('.' + domain)) return true;
  return false;
}

function allowedModeForHostname(host, pathname) {
  if (!host) return null;
  for (const d of ALLOWED_V1) {
    if (hostnameMatchesDomain(host, d)) {
      // check allowed path if any configured
      const paths = ALLOWED_PATHS[d];
      if (paths && paths.length) {
        const match = paths.some(rx => new RegExp(rx).test(pathname));
        if (!match) return null;
      }
      return 'v1';
    }
  }
  for (const d of ALLOWED_V2) {
    if (hostnameMatchesDomain(host, d)) {
      const paths = ALLOWED_PATHS[d];
      if (paths && paths.length) {
        const match = paths.some(rx => new RegExp(rx).test(pathname));
        if (!match) return null;
      }
      return 'v2';
    }
  }
  return null;
}

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
  const { url, recaptchaToken } = body || {};
  if (!url) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  const host = getHostname(url);
  let pathname = '/';
  try { pathname = new URL(url).pathname || '/'; } catch(e){}

  const mode = allowedModeForHostname(host, pathname);
  if (!mode) {
    res.status(400).json({ error: 'URL not allowed by whitelist or path rules' });
    return;
  }

  // If RECAPTCHA_SECRET provided, require a token and verify
  if (RECAPTCHA_SECRET) {
    if (!recaptchaToken) {
      res.status(400).json({ error: 'Missing recaptcha token' });
      return;
    }
    try {
      const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(RECAPTCHA_SECRET)}&response=${encodeURIComponent(recaptchaToken)}`
      });
      const verifyJson = await verifyRes.json();
      if (!verifyJson.success) {
        res.status(403).json({ error: 'Recaptcha verification failed', details: verifyJson });
        return;
      }
      // If score present (v3), check threshold
      if (typeof verifyJson.score === 'number') {
        if (verifyJson.score < RECAPTCHA_MIN_SCORE) {
          res.status(403).json({ error: 'Recaptcha score too low', score: verifyJson.score });
          return;
        }
      }
      // Optional: if action is present, ensure it matches 'bypass'
      if (verifyJson.action && verifyJson.action !== 'bypass') {
        // not necessarily fatal — but reject to be strict
        res.status(403).json({ error: 'Recaptcha action mismatch', action: verifyJson.action });
        return;
      }
    } catch (e) {
      console.error('Recaptcha verify error', e);
      res.status(500).json({ error: 'Recaptcha verification error' });
      return;
    }
  } else {
    console.warn('RECAPTCHA_SECRET not configured — skipping recaptcha validation.');
  }

  try {
    let targetUrl;
    if (mode === 'v1') {
      targetUrl = `https://trw.lat/api/bypass?url=${encodeURIComponent(url)}`;
    } else {
      targetUrl = `https://trw.lat/api/v2/bypass?url=${encodeURIComponent(url)}`;
    }

    const apiRes = await fetch(targetUrl, {
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
    console.error('Proxy error', err);
    res.status(500).json({ error: 'Proxy error', details: String(err) });
  }
};
