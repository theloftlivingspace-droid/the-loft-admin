// /api/gas-proxy.js — Vercel serverless proxy for Google Apps Script Web Apps
// GAS does not send CORS headers reliably; this server-side relay bypasses CORS.
//
// Routes:
//   GET  /api/gas-proxy?app=todo&action=getData
//   GET  /api/gas-proxy?app=todo&action=getAllDocs
//   GET  /api/gas-proxy?app=todo&action=setBookingDone&id=...&done=...
//   GET  /api/gas-proxy?app=todo&action=setInvoiceDone&id=...&done=...
//   GET  /api/gas-proxy?app=checkinout&action=getRoomStatus
//   GET  /api/gas-proxy?app=checkinout&action=getAllDocs
//   POST /api/gas-proxy?app=checkinout   (body forwarded as-is)

const GAS_ENDPOINTS = {
  todo:       'https://script.google.com/macros/s/AKfycbxwlKBtlw74Z52ryAK2SNV_3mNXhFzk3IoANSOqNBhfENUdO3QhfQUKovZ6_THXfeE/exec',
  checkinout: 'https://script.google.com/macros/s/AKfycbzb5T7x7qBw35LwX_bufF9oDjMRQAkI2WAqukQqkH4tNjyhCy-CCuWDDmPaiwxbN6M/exec',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const appKey = req.query.app;
  const base = GAS_ENDPOINTS[appKey];
  if (!base) {
    res.status(400).json({ ok: false, error: 'Unknown ?app= param. Use app=todo or app=checkinout.' });
    return;
  }

  try {
    const params = new URLSearchParams(req.query);
    params.delete('app');
    const qs = params.toString();
    const targetUrl = qs ? `${base}?${qs}` : base;

    let gasRes;
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString();
      gasRes = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBody,
        redirect: 'follow',
      });
    } else {
      gasRes = await fetch(targetUrl, { redirect: 'follow' });
    }

    const text = await gasRes.text();
    // Try to relay as JSON, fallback to plain text
    try {
      const json = JSON.parse(text);
      res.status(gasRes.status).json(json);
    } catch {
      res.status(gasRes.status).setHeader('Content-Type', 'text/plain').send(text);
    }
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Proxy error: ' + String(err) });
  }
}
