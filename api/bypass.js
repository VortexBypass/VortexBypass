// /api/bypass.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  const API_KEY = process.env.VORTEX_API_KEY;

  try {
    // Determine which API endpoint to use
    let apiUrl = '';
    const generalAPIs = ["work.ink", "linkvertise", "link-unlocker.com"];
    const v2APIs = ["pandadevelopment.net", "keyrblx.com", "krnl.cat"];
    
    if (generalAPIs.some(d => url.includes(d))) {
      apiUrl = `https://trw.lat/api/bypass?url=${encodeURIComponent(url)}`;
    } else if (v2APIs.some(d => url.includes(d))) {
      apiUrl = `https://trw.lat/api/v2/bypass?url=${encodeURIComponent(url)}`;
    } else {
      return res.status(400).json({ error: 'Unsupported URL' });
    }

    const response = await fetch(apiUrl, {
      headers: { "x-api-key": API_KEY }
    });
    
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
