// /api/gas-proxy.js
//
// Google Apps Script Web Apps do not reliably send back the
// Access-Control-Allow-Origin header, even for plain GET requests deployed
// with "Anyone" access — this is a long-standing Google-side limitation with
// no fix available from the script side (ContentService has no way to set
// CORS headers). The browser then blocks the response client-side even
// though the GAS execution itself succeeded (HTTP 200).
//
// Fix: proxy through this Vercel serverless function. Server-to-server HTTP
// calls are never subject to CORS, so this forwards the request to GAS and
// relays the response back to the browser with proper CORS headers attached.
//
// Usage from frontend:
//   /api/gas-proxy?app=todo&action=getData
//   /api/gas-proxy?app=checkinout&action=getAllDocs
//   POST /api/gas-proxy?app=checkinout   (body forwarded as-is)

const GAS_ENDPOINTS = {
  todo: 'https://script.google.com/macros/s/AKfycbxHuLVbrYnMS2aMEFUppdpKfwfby6Kn4lqD8MDHFwMf7BFIaUlv6NywAzTB-tH-IXs/exec',
  checkinout: 'https://script.google.com/macros/s/AKfycbzb5T7x7qBw35LwX_bufF9oDjMRQAkI2WAqukQqkH4tNjyhCy-CCuWDDmPaiwxbN6M/exec',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const appKey = req.query.app;
  const base = GAS_ENDPOINTS[appKey];
  if (!base) {
    res.status(400).json({ ok: false, error: 'Unknown or missing ?app= parameter. Use app=todo or app=checkinout.' });
    return;
  }

  try {
    // Forward all query params except our own routing param `app`
    const params = new URLSearchParams(req.query);
    params.delete('app');
    const qs = params.toString();
    const targetUrl = qs ? `${base}?${qs}` : base;

    let gasRes;
    if (req.method === 'POST') {
      // Body arrives pre-parsed as an object when Content-Type is application/json,
      // or as a raw string otherwise (matches GAS frontend's text/plain pattern).
      const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      gasRes = await fetch(targetUrl, { method: 'POST', body: bodyStr });
    } else {
      gasRes = await fetch(targetUrl, { method: 'GET' });
    }

    const text = await gasRes.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(gasRes.status).send(text);
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Proxy fetch failed: ' + err.message });
  }
}
