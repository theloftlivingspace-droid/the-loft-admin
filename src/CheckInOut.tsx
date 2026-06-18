import { useState, useEffect } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────
const GAS_API = 'https://script.google.com/macros/s/AKfycbxHuLVbrYnMS2aMEFUppdpKfwfby6Kn4lqD8MDHFwMf7BFIaUlv6NywAzTB-tH-IXs/exec';
const CHECKOUT_LOG_ID = '1hP26o_5W4IuqqE9wJyMPuttoPB4m6EIRfkC4ePMzrGE';
const CHECKOUT_GID = '335713576';
const TM30_URL = 'https://tm30.immigration.go.th/tm30api/loginExternal.jsp?value=EXT&id=d0c6b56279430512156a619772ece25a';
const TM30_STORAGE_KEY = 'tm30_done';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Stay {
  room: string;
  roomNum: string;
  guest: string;
  checkin: string;
  checkout: string;
  channel: string;
  resId: string;
  note: string;
  nights: number;
  status: 'checked-in' | 'arriving-today' | 'arriving-soon' | 'checking-out-today';
  daysLeft: number;
  daysUntil: number;
}

interface CheckoutStatus {
  room: string;
  inspected: boolean;
  inspectedBy: string;
  cleanedBy: string;
  issues: string;
  date: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function roomNum(r: string): string {
  const m = r.match(/\d{3}/);
  return m ? m[0] : r;
}

function channelColor(ch: string): string {
  const c = (ch || '').toLowerCase();
  if (c.includes('airbnb')) return 'bg-rose-100 text-rose-700';
  if (c.includes('booking')) return 'bg-blue-100 text-blue-700';
  if (c.includes('trip')) return 'bg-cyan-100 text-cyan-700';
  if (c.includes('expedia')) return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-600';
}

function channelIcon(ch: string): string {
  const c = (ch || '').toLowerCase();
  if (c.includes('airbnb')) return '🏠';
  if (c.includes('booking')) return '📘';
  if (c.includes('trip')) return '✈️';
  if (c.includes('expedia')) return '🌐';
  return '📋';
}

const STATUS_CONFIG = {
  'checked-in':        { label: 'เช็คอินแล้ว',       bg: 'bg-emerald-500', text: 'text-white',        dot: 'bg-white' },
  'arriving-today':    { label: 'เข้าวันนี้',          bg: 'bg-amber-400',   text: 'text-amber-900',    dot: 'bg-amber-900' },
  'checking-out-today':{ label: 'เช็คเอาท์วันนี้',    bg: 'bg-orange-500',  text: 'text-white',        dot: 'bg-white' },
  'arriving-soon':     { label: 'เข้าเร็วๆ นี้',      bg: 'bg-sky-400',     text: 'text-white',        dot: 'bg-white' },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CheckInOut() {
  const [stays, setStays]           = useState<Stay[]>([]);
  const [coStatus, setCoStatus]     = useState<Record<string, CheckoutStatus>>({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [view, setView]             = useState<'all' | 'checkedin' | 'arrivals' | 'checkouts'>('all');
  const [lastRefresh, setLastRefresh] = useState('');
  // TM30 done — keyed by resId, persisted in localStorage
  const [tm30Done, setTm30Done] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(TM30_STORAGE_KEY) || '{}'); } catch { return {}; }
  });

  function toggleTm30(resId: string) {
    setTm30Done(prev => {
      const next = { ...prev, [resId]: !prev[resId] };
      localStorage.setItem(TM30_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      // ── Sheet1 (via GAS API) ──────────────────────────────────────────────
      const res = await fetch(`${GAS_API}?action=getRoomStatus`);
      if (!res.ok) throw new Error('โหลดข้อมูลห้องไม่สำเร็จ');
      const json: { today: string; stays: Array<{ room: string; guest: string; checkin: string; checkout: string; channel: string; resId: string; note: string }> } = await res.json();
      if (!Array.isArray(json.stays)) throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');

      const tod = today();
      const soon = addDays(tod, 5);

      const list: Stay[] = [];
      for (const row of json.stays) {
        const ciStr = (row.checkin || '').substring(0, 10);
        const coStr = (row.checkout || '').substring(0, 10);
        if (!ciStr || !coStr) continue;

        const daysUntil = diffDays(tod, ciStr);
        const daysLeft  = diffDays(tod, coStr);

        // Filter: currently staying OR arriving within 5 days
        const checkedIn   = ciStr <= tod && coStr > tod;
        const arrivingToday = ciStr === tod;
        const checkingOutToday = coStr === tod && ciStr < tod;
        const arrivingSoon = ciStr > tod && ciStr <= soon;

        if (!checkedIn && !arrivingSoon && !checkingOutToday) continue;

        let status: Stay['status'] = 'checked-in';
        if (arrivingToday)       status = 'arriving-today';
        else if (checkingOutToday) status = 'checking-out-today';
        else if (arrivingSoon)   status = 'arriving-soon';

        const nights = diffDays(ciStr, coStr);

        list.push({
          room:     row.room || '',
          roomNum:  roomNum(row.room || ''),
          guest:    row.guest || '',
          checkin:  ciStr,
          checkout: coStr,
          channel:  row.channel || '',
          resId:    row.resId || '',
          note:     row.note || '',
          nights,
          status,
          daysLeft,
          daysUntil,
        });
      }

      // Sort: checking-out-today first, then arriving-today, then checked-in (by checkout asc), then arriving-soon
      const ORDER = { 'checking-out-today': 0, 'arriving-today': 1, 'checked-in': 2, 'arriving-soon': 3 };
      list.sort((a, b) => {
        const od = ORDER[a.status] - ORDER[b.status];
        if (od !== 0) return od;
        return a.checkout.localeCompare(b.checkout);
      });

      setStays(list);
      setLastRefresh(new Date().toLocaleTimeString('th-TH'));

      // ── Checkout log (Google Sheets CSV) ────────────────────────────────────
      try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${CHECKOUT_LOG_ID}/export?format=csv&gid=${CHECKOUT_GID}`;
        const cr = await fetch(csvUrl);
        if (cr.ok) {
          const csv = await cr.text();
          const rows = csv.trim().split('\n').map(r =>
            r.split(',').map(c => c.replace(/^"|"$/g, '').trim())
          );
          const h = rows[0];
          const map: Record<string, CheckoutStatus> = {};
          for (const row of rows.slice(1)) {
            const room = roomNum(row[h.indexOf('ห้อง')] || row[0] || '');
            if (!room) continue;
            map[room] = {
              room,
              inspected:   (row[h.indexOf('ตรวจสอบ')] || '').toLowerCase().includes('ผ่าน') || (row[h.indexOf('สถานะ')] || '').toLowerCase().includes('ผ่าน'),
              inspectedBy: row[h.indexOf('ผู้ตรวจ')] || '',
              cleanedBy:   row[h.indexOf('ผู้ทำความสะอาด')] || row[h.indexOf('แม่บ้าน')] || '',
              issues:      row[h.indexOf('ปัญหา')] || row[h.indexOf('หมายเหตุ')] || '',
              date:        row[h.indexOf('วันที่')] || '',
            };
          }
          setCoStatus(map);
        }
      } catch (_) { /* checkout log optional */ }

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = stays.filter(s => {
    if (view === 'checkedin')  return s.status === 'checked-in';
    if (view === 'arrivals')   return s.status === 'arriving-today' || s.status === 'arriving-soon';
    if (view === 'checkouts')  return s.status === 'checking-out-today';
    return true;
  });

  const counts = {
    checkedin:  stays.filter(s => s.status === 'checked-in').length,
    arrivals:   stays.filter(s => s.status === 'arriving-today' || s.status === 'arriving-soon').length,
    checkouts:  stays.filter(s => s.status === 'checking-out-today').length,
    today_ci:   stays.filter(s => s.status === 'arriving-today').length,
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <div className="text-center">
        <div className="text-3xl mb-3 animate-spin">⏳</div>
        <p className="text-sm">กำลังโหลดข้อมูลห้องพัก…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="text-center py-16 text-red-500">
      <div className="text-2xl mb-2">⚠️</div>
      <p className="text-sm">{error}</p>
      <button onClick={load} className="mt-3 px-4 py-2 text-xs bg-red-50 rounded-xl border border-red-200 text-red-600">ลองใหม่</button>
    </div>
  );

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-blue-950">สถานะห้องพัก</h2>
          <p className="text-xs text-gray-400">อัปเดต {lastRefresh} · วันนี้ {today()}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={TM30_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-xl bg-indigo-50 border-indigo-200 hover:bg-indigo-100 transition text-indigo-700 font-medium">
            📋 สร้าง TM30
          </a>
          <button onClick={load}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-xl hover:bg-gray-50 transition text-gray-600">
            🔄 รีเฟรช
          </button>
        </div>
      </div>

      {/* Summary KPI row */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: 'อยู่ในโรงแรม', val: counts.checkedin,  icon: '🛏️',  color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { label: 'เช็คเอาท์วันนี้', val: counts.checkouts, icon: '🧳',  color: 'bg-orange-50 border-orange-200 text-orange-700' },
          { label: 'เข้าวันนี้',   val: counts.today_ci,  icon: '📥',  color: 'bg-amber-50 border-amber-200 text-amber-700' },
          { label: 'เข้าเร็วๆ นี้', val: counts.arrivals - counts.today_ci, icon: '📅', color: 'bg-sky-50 border-sky-200 text-sky-700' },
        ].map(k => (
          <div key={k.label} className={`rounded-2xl border p-3 text-center ${k.color}`}>
            <div className="text-xl mb-0.5">{k.icon}</div>
            <div className="text-2xl font-bold">{k.val}</div>
            <div className="text-xs leading-tight mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 bg-gray-100 rounded-2xl p-1">
        {([
          { key: 'all',       label: `ทั้งหมด (${stays.length})` },
          { key: 'checkedin', label: `อยู่แล้ว (${counts.checkedin})` },
          { key: 'checkouts', label: `เช็คเอาท์วันนี้ (${counts.checkouts})` },
          { key: 'arrivals',  label: `กำลังเข้า (${counts.arrivals})` },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`flex-1 px-2 py-1.5 text-xs rounded-xl font-medium transition
              ${view === t.key ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูล</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const cfg = STATUS_CONFIG[s.status];
            const co  = coStatus[s.roomNum];
            const cardKey = s.resId || s.roomNum + s.checkin;
            // Room ready = checkout log shows "ผ่าน" for this room
            const roomReady = co?.inspected ?? null;
            return (
              <div key={cardKey}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Top bar */}
                <div className={`${cfg.bg} px-4 py-2 flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`}></span>
                    <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === 'checked-in' && (
                      <span className={`text-xs ${cfg.text} opacity-80`}>
                        เหลือ {s.daysLeft} คืน · เช็คเอาท์ {s.checkout}
                      </span>
                    )}
                    {s.status === 'arriving-soon' && (
                      <span className={`text-xs ${cfg.text} opacity-90`}>เข้าในอีก {s.daysUntil} วัน</span>
                    )}
                    {s.status === 'arriving-today' && (
                      <span className={`text-xs ${cfg.text} opacity-90`}>วันนี้!</span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="px-4 py-3 flex items-start gap-3">
                  {/* Room badge */}
                  <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-blue-50 border border-blue-100
                    flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-blue-700 leading-none">{s.roomNum}</span>
                    <span className="text-[10px] text-blue-400 mt-0.5">
                      {s.room.replace(s.roomNum, '').trim().split(' ')[0]}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800 text-sm truncate">{s.guest}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${channelColor(s.channel)}`}>
                        {channelIcon(s.channel)} {s.channel}
                      </span>
                      <span className="text-xs text-gray-400">{s.nights} คืน</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-500">
                      <span className="bg-gray-50 border rounded-lg px-2 py-0.5">
                        📅 {s.checkin}
                      </span>
                      <span className="text-gray-300">→</span>
                      <span className="bg-gray-50 border rounded-lg px-2 py-0.5">
                        {s.checkout}
                      </span>
                    </div>
                    {s.note && (
                      <p className="mt-1.5 text-xs text-gray-400 italic truncate">📝 {s.note}</p>
                    )}
                  </div>

                  {/* Right-side badges */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                    {/* Checkout status badge for checked-in / checking-out */}
                    {(s.status === 'checking-out-today' || s.status === 'checked-in') && co && (
                      <div className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium
                        ${co.inspected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                       : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        <span>{co.inspected ? '✅' : '❌'}</span>
                        <span>{co.inspected ? 'ผ่าน' : 'ยังไม่ตรวจ'}</span>
                      </div>
                    )}

                    {/* Room ready badge for arriving-today */}
                    {s.status === 'arriving-today' && (
                      <div className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium
                        ${roomReady === true  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : roomReady === false ? 'bg-red-50 text-red-600 border border-red-200'
                                              : 'bg-gray-50 text-gray-400 border border-gray-200'}`}>
                        <span>{roomReady === true ? '🟢' : roomReady === false ? '🔴' : '⚪'}</span>
                        <span>{roomReady === true ? 'พร้อม' : roomReady === false ? 'ไม่พร้อม' : 'ไม่ทราบ'}</span>
                      </div>
                    )}

                    {/* TM30 checkbox for checked-in */}
                    {s.status === 'checked-in' && (
                      <button
                        onClick={() => toggleTm30(cardKey)}
                        className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition
                          ${tm30Done[cardKey]
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-indigo-200 hover:text-indigo-400'}`}>
                        <span>{tm30Done[cardKey] ? '✅' : '☐'}</span>
                        <span>TM30</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Checkout details (for checkout-today only) */}
                {s.status === 'checking-out-today' && co && (
                  <div className="mx-4 mb-3 p-2.5 bg-gray-50 rounded-xl text-[11px] text-gray-500 space-y-0.5">
                    {co.cleanedBy && <div>🧹 ทำความสะอาด: <span className="text-gray-700">{co.cleanedBy}</span></div>}
                    {co.inspectedBy && <div>👁️ ตรวจโดย: <span className="text-gray-700">{co.inspectedBy}</span></div>}
                    {co.issues && <div>⚠️ <span className="text-amber-700">{co.issues}</span></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
