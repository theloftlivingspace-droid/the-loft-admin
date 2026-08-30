// /api/translate.js — Vercel serverless: auto-translate TH<->EN using Claude.
// Keeps ANTHROPIC_API_KEY server-side (set it in Vercel project env vars).
//
// POST /api/translate
// Body: { text, targetLang: 'th'|'en', sourceLang?: 'th'|'en'|'auto', context?: string }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function detectLang(text) {
  return /[\u0E00-\u0E7F]/.test(text) ? 'th' : 'en';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'POST only' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { text, sourceLang = 'auto', targetLang, context } = body || {};

  if (!text || !String(text).trim()) { res.status(200).json({ translated: '' }); return; }
  if (!['th', 'en'].includes(targetLang)) {
    res.status(400).json({ error: 'targetLang must be "th" or "en"' });
    return;
  }

  const resolvedSource = sourceLang === 'auto' ? detectLang(text) : sourceLang;
  if (resolvedSource === targetLang) {
    res.status(200).json({ translated: text, sourceLang: resolvedSource, skipped: true });
    return;
  }

  const langName = l => (l === 'th' ? 'Thai' : 'English');
  const systemPrompt = [
    `You are a translation engine for a boutique short-term rental / hotel admin system in Thailand.`,
    `Translate the given text from ${langName(resolvedSource)} to ${langName(targetLang)}.`,
    context ? `Context: ${context}.` : '',
    `Rules:`,
    `- Return ONLY the translated text, nothing else — no quotes, no explanation.`,
    `- Preserve proper nouns, room numbers, license plates, and codes exactly.`,
    `- Keep tone concise, appropriate for hotel/admin records, not literary.`,
    `- If input is a code/number only, return it unchanged.`,
  ].filter(Boolean).join('\n');

  try {
    const r = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: String(text) }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: 'Translation upstream error', detail });
      return;
    }

    const data = await r.json();
    const translated = (data.content ?? [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    res.status(200).json({ translated, sourceLang: resolvedSource, targetLang });
  } catch (err) {
    res.status(500).json({ error: 'Translation failed', detail: String(err) });
  }
}
