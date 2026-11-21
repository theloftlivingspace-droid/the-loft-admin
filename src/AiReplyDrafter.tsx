import { useState } from 'react';
import { Copy, Loader2, ShieldAlert, Sparkles } from 'lucide-react';
import { T } from './theme';
import { useLang } from './LanguageContext';
import { getAuthToken } from './auth';

type Result = { lang: string; reply: string; confidence: number; escalate: boolean; reason: string; staffTodo?: string[] };

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.hair}`, borderRadius: 14, padding: 16 };
const field: React.CSSProperties = { fontSize: 15, padding: '10px 12px', border: `1px solid ${T.hair}`, borderRadius: 10, background: '#fff', color: T.ink, width: '100%' };

// AI ร่างคำตอบแขก — "AI เสนอ คนอนุมัติ": ไม่ส่งถึงแขกเอง ต้องคัดลอกไปตอบเองหลังตรวจ
export default function AiReplyDrafter() {
  const { lang } = useLang();
  const L = (th: string, en: string) => (lang === 'th' ? th : en);
  const [message, setMessage] = useState('');
  const [room, setRoom] = useState('');
  const [schedule, setSchedule] = useState<'unknown' | 'free' | 'next_guest'>('unknown');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!message.trim() || busy) return;
    setBusy(true); setErr(''); setRes(null); setCopied(false);
    try {
      const r = await fetch('/api/ai-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ message, context: { room: room.trim(), schedule } }),
      });
      const d = await r.json().catch(() => ({} as Record<string, unknown>));
      if (!r.ok || d.ok === false) {
        const code = String(d.error || r.status);
        throw new Error(code === 'daily_limit' ? L('ใช้โควตา AI วันนี้ครบแล้ว', 'Daily AI quota reached') : code === 'not_configured' ? L('ยังไม่ได้ตั้งค่าคีย์ AI บนเซิร์ฟเวอร์ (ANTHROPIC_API_KEY) — แจ้งผู้ดูแลระบบ', 'AI key is not configured on the server (ANTHROPIC_API_KEY) — contact the administrator') : code === 'ai_unavailable' ? L('AI ใช้งานไม่ได้ชั่วคราว ให้ตอบเอง', 'AI is temporarily unavailable — please reply manually') : code);
      }
      setRes(d as unknown as Result); setDraft(String(d.reply || ''));
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(draft); setCopied(true); } catch { setErr(L('คัดลอกไม่สำเร็จ', 'Copy failed')); }
  }

  return (
    <div className="f-thai" style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
      <div style={card}>
        <div className="flex items-center gap-2" style={{ color: T.ink, fontWeight: 700 }}><Sparkles size={18} color={T.brassDeep} />{L('AI ร่างคำตอบแขก', 'AI guest reply draft')}</div>
        <p className="text-xs mt-1" style={{ color: T.inkSoft }}>
          {L('วางข้อความของแขก (ไทย/อังกฤษ/จีน) AI จะร่างคำตอบจากกฎที่พัก ไม่ส่งถึงแขกเอง และเรื่องร้องเรียน/คืนเงิน/ความปลอดภัยจะส่งต่อให้คนตอบ',
            'Paste a guest message (Thai/English/Chinese). The AI drafts a reply from the house rules and never sends it. Complaints, refunds and safety issues are routed to a human.')}
        </p>
        <textarea style={{ ...field, marginTop: 10, minHeight: 110 }} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000}
          placeholder={L('ข้อความจากแขก… (อย่าใส่ชื่อ/เลขพาสปอร์ต)', 'Guest message… (no names or passport numbers)')} />
        <div className="flex gap-2 mt-2 items-center flex-wrap">
          <input style={{ ...field, width: 140 }} value={room} onChange={(e) => setRoom(e.target.value)} maxLength={20} placeholder={L('ห้อง (ไม่บังคับ)', 'Room (optional)')} />
          <select style={{ ...field, width: 'auto', minWidth: 190 }} value={schedule} onChange={(e) => setSchedule(e.target.value as typeof schedule)} aria-label={L('สถานะห้อง', 'Room schedule')}>
            <option value="unknown">{L('ยังไม่ทราบตารางห้อง (ทีมตรวจ)', 'Schedule unknown (team checks)')}</option>
            <option value="free">{L('ไม่มีแขกเข้าห้องนี้ต่อ', 'No guest arriving after')}</option>
            <option value="next_guest">{L('มีแขกเข้าห้องนี้ต่อ', 'Another guest arriving')}</option>
          </select>
          <button onClick={run} disabled={busy || !message.trim()} className="press focus-ring"
            style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, background: T.navy, color: '#fff', fontWeight: 700, opacity: busy || !message.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} color={T.brass} />}{L('ร่างคำตอบ', 'Draft reply')}
          </button>
        </div>
        {err && <div className="text-sm mt-2" style={{ color: T.wine }}>{err}</div>}
      </div>

      {res && res.escalate && (
        <div style={{ ...card, background: T.wineTint, borderColor: T.wine }}>
          <div className="flex items-center gap-2" style={{ color: T.wine, fontWeight: 700 }}><ShieldAlert size={18} />{L('ส่งต่อให้คนตอบเอง', 'Needs a human reply')}</div>
          <p className="text-sm mt-1" style={{ color: T.ink }}>{res.reason}</p>
          <p className="text-xs mt-1" style={{ color: T.inkSoft }}>{L('AI ไม่ร่างคำตอบให้ในกรณีนี้', 'The AI does not draft a reply for this case.')}</p>
        </div>
      )}

      {res && !res.escalate && (
        <div style={card}>
          <div className="flex items-center gap-2 text-xs" style={{ color: T.inkSoft }}>
            <span style={{ background: T.sageTint, color: T.sage, borderRadius: 99, padding: '1px 10px', fontWeight: 700 }}>{L('ความมั่นใจ', 'Confidence')} {res.confidence}%</span>
            <span>{L('ภาษา', 'Language')}: {res.lang}</span>
          </div>
          <textarea style={{ ...field, marginTop: 8, minHeight: 130 }} value={draft} onChange={(e) => { setDraft(e.target.value); setCopied(false); }} />
          {res.reason && <p className="text-xs mt-1" style={{ color: T.inkSoft }}>{L('ที่มา', 'Basis')}: {res.reason}</p>}
          {res.staffTodo && res.staffTodo.length > 0 && (
            <div style={{ marginTop: 10, background: T.navyTint, borderRadius: 10, padding: '8px 12px' }}>
              <div className="text-xs" style={{ color: T.inkSoft, fontWeight: 700 }}>{L('ทีมต้องทำ', 'Team to-do')}</div>
              <ul className="text-sm" style={{ margin: '4px 0 0', paddingLeft: 18, color: T.ink }}>{res.staffTodo.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button onClick={copy} className="press focus-ring" style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, background: T.brass, color: T.ink, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Copy size={16} />{copied ? L('คัดลอกแล้ว', 'Copied') : L('ตรวจแล้ว คัดลอก', 'Reviewed — copy')}
            </button>
          </div>
        </div>
      )}
      <p className="text-xs" style={{ color: T.inkSoft }}>{L('ระบบบันทึกเฉพาะเมตาดาต้าการใช้งาน (ไม่เก็บข้อความและชื่อแขก)', 'Only usage metadata is logged (no guest text or names).')}</p>
    </div>
  );
}
