// api/loft-pricing-data.js
// Fetches ROOMS_DATA (occ, liveADR, base, etc.) from loft-pricing/index.html
// so DailyPricing.tsx always uses the same numbers as the dashboard

const RAW_URL =
  'https://raw.githubusercontent.com/theloftlivingspace-droid/loft-pricing/main/index.html';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await fetch(RAW_URL);
    if (!r.ok) throw new Error(`GitHub fetch failed: ${r.status}`);
    const html = await r.text();

    // Extract ROOMS_DATA block
    const start = html.indexOf('ROOMS_DATA = [');
    if (start === -1) throw new Error('ROOMS_DATA not found');
    const end = html.indexOf('];', start) + 2;
    const raw = html.slice(start, end)
      .replace(/^ROOMS_DATA = /, '')   // strip var name
      .replace(/\r?\n/g, ' ')
      // JS object keys → quoted keys (JSON-safe)
      .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":')
      // single-quoted strings → double-quoted
      .replace(/'([^']*)'/g, '"$1"');

    const rooms = JSON.parse(raw);

    // Return only what DailyPricing needs
    const data = rooms.map(r => ({
      id:      r.id,
      base:    r.base,
      min:     r.min,
      max:     r.max,
      occ:     r.occ,
      liveADR: r.liveADR,
      maxG:    r.maxG,
    }));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ ok: true, rooms: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
