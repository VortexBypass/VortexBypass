// api/recaptcha-key.js
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }
  const siteKey = process.env.RECAPTCHA_SITE_KEY || '';
  res.status(200).json({ siteKey });
};