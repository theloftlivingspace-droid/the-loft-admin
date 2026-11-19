// lib/requireSession.js — ตรวจ session token (Bearer) ใน Vercel function
// คืน payload ของผู้ใช้ถ้าผ่าน; ถ้าไม่ผ่านจะตอบ 401/403/500 ให้เองและคืน null (ผู้เรียกแค่ return)
import { verifyToken } from './session.js';

export function requireSession(req, res, opts = {}) {
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) { res.status(500).json({ ok: false, error: 'server_not_configured' }); return null; }
  const auth = String((req.headers && req.headers.authorization) || '');
  const user = verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', secret);
  if (!user) { res.status(401).json({ ok: false, error: 'unauthorized' }); return null; }
  if (opts.roles && !opts.roles.includes(user.role)) { res.status(403).json({ ok: false, error: 'forbidden' }); return null; }
  return user;
}
