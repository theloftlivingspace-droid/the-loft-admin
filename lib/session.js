// lib/session.js — tiny signed-token helper (HMAC-SHA256, no dependencies).
// Token format: base64url(payloadJSON) + "." + base64url(signature)
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sig(data, secret) {
  return createHmac('sha256', secret).update(data).digest();
}

export function signToken(payload, secret, ttlSeconds = 12 * 60 * 60) {
  if (!secret) throw new Error('SESSION_SECRET not configured');
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${body}.${b64u(sig(body, secret))}`;
}

// Returns the payload object, or null if the token is missing/invalid/expired.
export function verifyToken(token, secret) {
  if (!token || !secret || typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = sig(body, secret);
  let given;
  try { given = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
