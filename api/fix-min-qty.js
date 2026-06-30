// /api/fix-min-qty.js — TEMP one-off endpoint.
// Patches minQty for ถุงขยะ and roller to 2 in Supabase settings.stock_data.
// DELETE THIS FILE after running once.

const SB_URL = 'https://vshrmwfyanwwocftnccu.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzaHJtd2Z5YW53d29jZnRuY2N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTgyMTksImV4cCI6MjA5MzUzNDIxOX0.H8zKjDtCnRxzLcV2k-NsSIqJe0k_JkS-_zTtBaHCaGo';
const SB_HDR = { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'resolution=merge-duplicates' };

export default async function handler(req, res) {
  try {
    const getRes = await fetch(`${SB_URL}/rest/v1/settings?key=eq.stock_data&select=value`, { headers: SB_HDR });
    const rows = await getRes.json();
    if (!rows?.[0]?.value) {
      res.status(404).json({ ok: false, error: 'No stock_data found in Supabase settings table' });
      return;
    }

    const stockData = JSON.parse(rows[0].value);
    let patched = 0;
    const updated = stockData.map(item => {
      if (item.name === 'ถุงขยะ' || item.name === 'roller') {
        patched++;
        return { ...item, minQty: 2 };
      }
      return item;
    });

    await fetch(`${SB_URL}/rest/v1/settings`, {
      method: 'POST',
      headers: SB_HDR,
      body: JSON.stringify({ key: 'stock_data', value: JSON.stringify(updated) }),
    });

    res.status(200).json({ ok: true, patched, updated: updated.filter(i => i.name === 'ถุงขยะ' || i.name === 'roller') });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}
