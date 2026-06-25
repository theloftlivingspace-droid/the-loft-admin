// /api/maid-note.js — Vercel serverless: relay note to hotel-line-bot /api/send-maid-note
// Keeps LINE bot URL and admin token server-side (env vars).
//
// POST /api/maid-note
// Body: { resId, room, guest, checkin, checkout, note }

const LINE_BOT_URL   = process.env.LINE_BOT_URL   || '';  // e.g. https://hotel-line-bot.onrender.com
const LINE_BOT_TOKEN = process.env.LINE_BOT_ADMIN_TOKEN || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ ok: false, error: 'POST only' }); return; }

  if (!LINE_BOT_URL) {
    res.status(500).json({ ok: false, error: 'LINE_BOT_URL not configured' });
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();

  try {
    const r = await fetch(`${LINE_BOT_URL}/api/send-maid-note`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': LINE_BOT_TOKEN,
      },
      body,
    });
    const text = await r.text();
    try { res.status(r.status).json(JSON.parse(text)); }
    catch { res.status(r.status).send(text); }
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
