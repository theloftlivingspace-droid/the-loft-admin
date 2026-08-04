// /api/drive-file-proxy.js — Vercel serverless proxy for raw Google Drive
// file bytes (used for PDFs).
//
// Embedding `drive.google.com/file/d/<id>/preview` in an <iframe> loads
// Google's own Docs-viewer web app inside the frame — heavy enough that on
// a constrained mobile WebView (e.g. a PWA's WKWebView) it can make the
// whole page unresponsive once it finishes loading.
//
// Instead: fetch the raw PDF bytes server-side and re-serve them with
// Content-Type: application/pdf. An <iframe>/<embed> pointed at an actual
// PDF file (not a webapp URL) is rendered by the browser's own native PDF
// engine — the same one used for downloaded PDFs — which is dramatically
// lighter than Google's JS viewer and doesn't fight the page for the main
// thread.
//
//   GET /api/drive-file-proxy?id=<fileId>

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const id = req.query.id;
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing ?id= param' });
    return;
  }

  try {
    const driveRes = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, {
      redirect: 'follow',
    });
    if (!driveRes.ok) {
      res.status(driveRes.status).json({ ok: false, error: `Drive returned HTTP ${driveRes.status}` });
      return;
    }
    const buf = Buffer.from(await driveRes.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.status(200).send(buf);
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Proxy error: ' + String(err) });
  }
}
