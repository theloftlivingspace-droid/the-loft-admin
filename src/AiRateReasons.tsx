import { useEffect, useMemo, useState } from 'react';
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { T } from './theme';
import { useLang } from './LanguageContext';
import { getAuthToken } from './auth';

type Factor = { key: string; label: string; mult: number };
type Row = { date: string; room: string; rate: number | null; prev: number | null; raw: number | null; base: number | null; reason: string; factors: Factor[] };

const ROOMS = ['Luxury', 'Retro', 'Allure', 'Elegance', 'Legacy', 'Radiance'];
const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.hair}`, borderRadius: 14, padding: 14 };
const sel: React.CSSProperties = { fontSize: 14, padding: '8px 10px', border: `1px solid ${T.hair}`, borderRadius: 10, background: '#fff', color: T.ink, minHeight: 40 };

const bkkToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const thb = (n: number | null) => (n == null ? '–' : '฿' + n.toLocaleString());

// เหตุผลราคาต่อวัน/ห้อง — อ่านจาก Rate_Reasons (คำอธิบายจากสูตรจริง ไม่ใช่การเดาของ AI)
export default function AiRateReasons() {
  const { lang } = useLang();
  const L = (th: string, en: string) => (lang === 'th' ? th : en);
  const [room, setRoom] = useState('');
  const [days, setDays] = useState(14);
  const key = `${room}|${days}`;
  // ผลลัพธ์เก็บคู่กับ key ของคำขอ: busy = ยังไม่มีผลของ key ปัจจุบัน (ไม่ต้อง setState แบบ synchronous ใน effect)
  const [res, setRes] = useState<{ key: string; rows: Row[] | null; err: string; updatedAt: string } | null>(null);
  const cur = res && res.key === key ? res : null;
  const rows = cur ? cur.rows : null;
  const err = cur ? cur.err : '';
  const updatedAt = cur ? cur.updatedAt : '';
  const busy = !cur;

  useEffect(() => {
    let live = true;
    const from = bkkToday();
    const qs = new URLSearchParams({ from, to: addDays(from, days - 1) });
    if (room) qs.set('room', room);
    const fail = (err: string) => { if (live) setRes({ key, rows: null, err, updatedAt: '' }); };
    fetch('/api/rate-reasons?' + qs.toString(), { headers: { Authorization: `Bearer ${getAuthToken()}` } })
      .then(async (r) => ({ r, d: await r.json().catch(() => ({} as Record<string, unknown>)) }))
      .then(({ r, d }) => {
        if (!live) return;
        if (!r.ok || d.ok === false) {
          const code = String(d.error || r.status);
          const m: Record<string, string> = {
            not_configured: L('ยังไม่ได้ตั้ง RATE_REMOTE_TOKEN ใน Vercel', 'RATE_REMOTE_TOKEN is not set in Vercel'),
            gas_unauthorized: L('token ไม่ตรงกับ REMOTE_TRIGGER_TOKEN ใน Apps Script', 'Token does not match REMOTE_TRIGGER_TOKEN in Apps Script'),
            gas_not_updated: L('Apps Script ยังไม่รู้จักคำสั่งนี้ (เวอร์ชันเก่า) — ตรวจว่า GitHub Action "Deploy to Apps Script" ของ lh-rate-automation รันสำเร็จ', 'Apps Script does not know this action yet (old version) — check that the "Deploy to Apps Script" GitHub Action in lh-rate-automation succeeded'),
            gas_not_configured: L('Apps Script ยังไม่ได้ตั้ง REMOTE_TRIGGER_TOKEN', 'Apps Script has no REMOTE_TRIGGER_TOKEN'),
            gas_unreachable: L('เชื่อมต่อ Apps Script ไม่ได้ ลองใหม่อีกครั้ง', 'Cannot reach Apps Script — try again'),
          };
          fail(m[code] || L('โหลดเหตุผลราคาไม่สำเร็จ (' + code + ')', 'Could not load rate reasons (' + code + ')'));
        } else setRes({ key, rows: d.rows as Row[], err: '', updatedAt: String(d.updatedAt || '') });
      })
      .catch(() => fail(L('โหลดเหตุผลราคาไม่สำเร็จ', 'Could not load rate reasons')));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const byDate = useMemo(() => {
    const m = new Map<string, Row[]>();
    (rows || []).forEach((r) => { const a = m.get(r.date) || []; a.push(r); m.set(r.date, a); });
    return Array.from(m.entries());
  }, [rows]);
  const dayLabel = (iso: string) => { const [y, mo, d] = iso.split('-').map(Number); return new Date(y, mo - 1, d).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };

  return (
    <div className="f-thai" style={{ display: 'grid', gap: 12, maxWidth: 820 }}>
      <div style={card}>
        <div style={{ color: T.ink, fontWeight: 700 }}>{L('เหตุผลราคา', 'Why this rate')}</div>
        <p className="text-xs mt-1" style={{ color: T.inkSoft }}>
          {L('ระบบอธิบายจากสูตรตั้งราคาจริงของคืนนั้น ไม่ได้เปลี่ยนราคา และราคาที่ชนช่วงตั้งมือจะไม่ถูกส่งเข้า LH',
            'Explained from the actual pricing formula. It never changes rates; hand-set periods are not pushed to LH.')}
        </p>
        <div className="flex gap-2 mt-2 flex-wrap">
          <select style={sel} value={room} onChange={(e) => setRoom(e.target.value)} aria-label={L('ประเภทห้อง', 'Room type')}>
            <option value="">{L('ทุกประเภทห้อง', 'All room types')}</option>
            {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select style={sel} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={L('ช่วงวัน', 'Range')}>
            {[7, 14, 30].map((n) => <option key={n} value={n}>{L(`${n} วันข้างหน้า`, `Next ${n} days`)}</option>)}
          </select>
          {busy && <Loader2 size={18} className="animate-spin" style={{ alignSelf: 'center' }} />}
        </div>
        {updatedAt && <p className="text-xs mt-2" style={{ color: T.inkSoft }}>{L('คำนวณล่าสุด', 'Last computed')}: {updatedAt.replace('T', ' ').slice(0, 16)} UTC</p>}
      </div>

      {err && <div style={{ ...card, background: T.wineTint, borderColor: T.wine, color: T.ink }} className="text-sm">{err}</div>}
      {!err && rows && rows.length === 0 && !busy && <div style={card} className="text-sm">{L('ยังไม่มีข้อมูล รอรอบคำนวณคืนถัดไป', 'No data yet — wait for the next nightly compute')}</div>}

      {byDate.map(([date, list]) => (
        <div key={date} style={card}>
          <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>{dayLabel(date)}</div>
          {list.map((r) => {
            const delta = r.prev != null && r.rate != null ? r.rate - r.prev : 0;
            return (
              <div key={r.room} style={{ borderTop: `1px solid ${T.hair}`, padding: '8px 0' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ fontWeight: 700, color: T.navy }}>{r.room}</span>
                  <span style={{ fontWeight: 700, color: T.ink }}>{thb(r.rate)}</span>
                  {delta !== 0 && (
                    <span className="text-xs flex items-center gap-1" style={{ color: delta > 0 ? T.sage : T.wine }}>
                      {delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{delta > 0 ? '+' : ''}{delta} {L('จากเดิม', 'vs prev')}
                    </span>
                  )}
                </div>
                <div className="text-sm" style={{ color: T.inkSoft, marginTop: 2 }}>{r.reason}</div>
                {r.factors.length > 0 && (
                  <div className="flex gap-1 flex-wrap" style={{ marginTop: 4 }}>
                    {r.factors.map((f) => (
                      <span key={f.key} className="text-xs" style={{ background: f.mult >= 1 ? T.sageTint : T.wineTint, color: f.mult >= 1 ? T.sage : T.wine, borderRadius: 99, padding: '1px 8px' }}>
                        {f.label} ×{f.mult}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
