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
//   GET  /api/gas-proxy?app=rate&action=pushRates&token=...       (queue pushRatesToLH now)
//   GET  /api/gas-proxy?app=rate&action=computeAndPush&token=...  (queue computeTargetRates + push now)

const GAS_ENDPOINTS = {
  todo:       'https://script.google.com/macros/s/AKfycbxHuLVbrYnMS2aMEFUppdpKfwfby6Kn4lqD8MDHFwMf7BFIaUlv6NywAzTB-tH-IXs/exec',
  checkinout: 'https://script.google.com/macros/s/AKfycbzb5T7x7qBw35LwX_bufF9oDjMRQAkI2WAqukQqkH4tNjyhCy-CCuWDDmPaiwxbN6M/exec',
  // Same Web App deployment as lh-rate-automation's SessionSync doPost (rate-push doGet lives there too).
  rate:       'https://script.google.com/macros/s/AKfycbx_z1v7FEqmthTKfZPoLsyqdIc4NJENXpfsZ315dDLzdIHwznSsOQqnG1UxkyqhOCk/exec',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const appKey = req.query.app;
  const base = GAS_ENDPOINTS[appKey];
  if (!base) {
    res.status(400).json({ ok: false, error: 'Unknown ?app= param. Use app=todo or app=checkinout.' });
    return;
  }

  const isPost = req.method === 'POST';
  try {
    const params = new URLSearchParams(req.query);
    params.delete('app');
    const qs = params.toString();
    const targetUrl = qs ? `${base}?${qs}` : base;

    // GAS occasionally stalls (cold start, quota throttling, Google-side
    // hiccups) with no response at all. Without a timeout this fetch can
    // hang until Vercel's own function timeout kills it, which is slow and
    // returns an opaque platform error instead of something the client can
    // show the user. Fail fast with a clear message instead.
    // 20s (was 9s) — 9s was tuned to stay under Vercel's *default* 10s
    // function limit, but that made this fire before a merely-slow (not
    // actually broken) GAS cold start had a chance to finish, which is what
    // was producing spurious "failed to load" errors. maxDuration is raised
    // to 25s in vercel.json so this still resolves — with our own clean JSON
    // error — before Vercel would kill the function itself.
    //
    // GET requests are read-only (getRoomStatus, getAllDocs, ...), so on a
    // timeout it's safe to retry once more within the same invocation —
    // same class of transient flake as GAS_TODO_URL (see push-badge.js /
    // bot.js styleSheet1 retry), just surfacing as a hang here instead of
    // an HTML error page. Split the 25s maxDuration budget into two GET
    // attempts (9s, then 13s) instead of one 20s attempt, so a cold-start
    // hiccup on try 1 doesn't have to sink the whole request. POST is left
    // as a single 20s attempt — it mutates check-in/out state, so retrying
    // a call that may have actually succeeded server-side risks a double
    // action.
    let rawBody = null;
    if (isPost) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      rawBody = Buffer.concat(chunks).toString();
    }

    async function attemptFetch(timeoutMs) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        if (isPost) {
          return await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: rawBody,
            redirect: 'follow',
            signal: controller.signal,
          });
        }
        return await fetch(targetUrl, { redirect: 'follow', cache: 'no-store', signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const attemptTimeouts = isPost ? [20000] : [9000, 13000];
    let gasRes;
    let lastErr;
    for (let i = 0; i < attemptTimeouts.length; i++) {
      try {
        gasRes = await attemptFetch(attemptTimeouts[i]);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (e && e.name === 'AbortError' && i < attemptTimeouts.length - 1) {
          continue; // retry once more (GET only)
        }
        throw e;
      }
    }
    if (lastErr) throw lastErr;

    const text = await gasRes.text();
    // Try to relay as JSON, fallback to plain text
    try {
      const json = JSON.parse(text);
      res.status(gasRes.status).json(json);
    } catch {
      res.status(gasRes.status).setHeader('Content-Type', 'text/plain').send(text);
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const msg = isPost
        ? 'GAS backend timed out (no response within 20s).'
        : 'GAS backend timed out (no response after 2 attempts, ~22s total).';
      res.status(504).json({ ok: false, error: msg });
    } else {
      res.status(502).json({ ok: false, error: 'Proxy error: ' + String(err) });
    }
  }
}
