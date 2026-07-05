// /api/drive-image-proxy.js — Vercel serverless proxy for Google Drive thumbnails.
//
// The <img> tag can hotlink drive.google.com/thumbnail directly (no CORS
// needed for display), but client-side OCR needs to read raw pixel data via
// canvas/fetch, which requires a CORS-enabled response — Drive's endpoint
// doesn't send Access-Control-Allow-Origin. This relay fetches the image
// server-side (no CORS restriction applies server-to-server) and re-serves
// the bytes with permissive CORS headers.
//
//   GET /api/drive-image-proxy?id=<fileId>&sz=w1600

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const id = req.query.id;
  const sz = req.query.sz || 'w1600';
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing ?id= param' });
    return;
  }

  try {
    const driveRes = await fetch(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=${encodeURIComponent(sz)}`, {
      redirect: 'follow',
    });
    if (!driveRes.ok) {
      res.status(driveRes.status).json({ ok: false, error: `Drive returned HTTP ${driveRes.status}` });
      return;
    }
    const contentType = driveRes.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await driveRes.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.status(200).send(buf);
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Proxy error: ' + String(err) });
  }
}
