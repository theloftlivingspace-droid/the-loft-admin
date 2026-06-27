// api/loft-pricing-data.js
// Fetches ROOMS_DATA (occ, liveADR, base, etc.) from loft-pricing/index.html

const RAW_URL =
  'https://raw.githubusercontent.com/theloftlivingspace-droid/loft-pricing/main/index.html';

function parseRoomsData(html) {
  const marker = 'ROOMS_DATA = ';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) throw new Error('ROOMS_DATA not found');

  // Find array start
  const arrStart = markerIdx + marker.length;

  // Count brackets to find correct end
  let i = arrStart, depth = 0, end = -1;
  while (i < html.length) {
    const c = html[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
    i++;
  }
  if (end === -1) throw new Error('Could not find end of ROOMS_DATA');

  let raw = html.slice(arrStart, end);

  // JS object literal → JSON
  raw = raw.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":'); // quote keys
  raw = raw.replace(/'/g, '"');                                    // single → double quotes
  raw = raw.replace(/,\s*}/g, '}');                               // trailing commas in objects
  raw = raw.replace(/,\s*]/g, ']');                               // trailing commas in arrays

  return JSON.parse(raw);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await fetch(RAW_URL);
    if (!r.ok) throw new Error(`GitHub fetch failed: ${r.status}`);
    const html = await r.text();

    const allRooms = parseRoomsData(html);

    const rooms = allRooms.map(r => ({
      id:      r.id,
      base:    r.base,
      min:     r.min,
      max:     r.max,
      occ:     r.occ,
      liveADR: r.liveADR,
      maxG:    r.maxG,
    }));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ ok: true, rooms });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
