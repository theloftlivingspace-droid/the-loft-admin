const SB_URL = 'https://vshrmwfyanwwocftnccu.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzaHJtd2Z5YW53d29jZnRuY2N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTgyMTksImV4cCI6MjA5MzUzNDIxOX0.H8zKjDtCnRxzLcV2k-NsSIqJe0k_JkS-_zTtBaHCaGo';
const SB_HDR = { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'resolution=merge-duplicates' };

export default async function handler(req, res) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/settings?key=eq.stock_data&select=value`, { headers: SB_HDR });
    if (!r.ok) return res.status(502).json({ step: 'get', status: r.status, body: await r.text() });
    const rows = await r.json();

    if (!rows?.[0]?.value) {
      return res.status(200).json({ ok: true, note: 'no stock_data row in Supabase yet — hardcoded default (minQty:1) already applies, nothing to fix' });
    }

    const data = JSON.parse(rows[0].value);
    const idx = data.findIndex((item) => item.id === 24);
    if (idx === -1) {
      return res.status(200).json({ ok: true, note: 'id 24 not found in saved stock_data', data });
    }

    const before = { ...data[idx] };
    data[idx].minQty = 1;

    const w = await fetch(`${SB_URL}/rest/v1/settings`, {
      method: 'POST', headers: SB_HDR,
      body: JSON.stringify({ key: 'stock_data', value: JSON.stringify(data) }),
    });
    if (!w.ok) return res.status(502).json({ step: 'post', status: w.status, body: await w.text() });

    return res.status(200).json({ ok: true, before, after: data[idx] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
