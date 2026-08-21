import { useState, useEffect, useMemo, useRef } from 'react';
import { useLang } from './LanguageContext';
import { T } from './theme';
import { ChevronLeft, ChevronRight, RefreshCw, CalendarDays } from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────
// Same GAS backend that powers Check-in/out — it already carries every stay
// synced in from Little Hotelier / Airbnb / Booking.com / Expedia / Trip.com,
// so the calendar reuses it rather than requiring a separate data source.
const GAS_API = '/api/gas-proxy?app=checkinout';

const CELL_W = 68;   // px per day column
const LABEL_W = 104; // px for the sticky room-label column
const ROW_H = 62;    // px per room row
const DAYS_COUNT = 21;

// ─── Physical room list (all 10 units), grouped exactly like the property
// sections shown in Little Hotelier's own calendar ───────────────────────────
const ROOM_GROUPS: { label: string; rooms: { num: string; type: string }[] }[] = [
  { label: 'The Loft Elegance Living Space', rooms: [{ num: '103', type: 'Elegance' }, { num: '204', type: 'Elegance' }] },
  { label: 'The Loft Allure Living Space',   rooms: [{ num: '203', type: 'Allure' },   { num: '205', type: 'Allure' }] },
  { label: 'The Loft Legacy Living Space',   rooms: [{ num: '113', type: 'Legacy' },   { num: '214', type: 'Legacy' }] },
  { label: 'The Loft Radiance Living Space', rooms: [{ num: '209', type: 'Radiance' }, { num: '210', type: 'Radiance' }] },
  { label: 'The Loft Retro Living Space',    rooms: [{ num: '108', type: 'Retro' }] },
  { label: 'The Loft Luxury Living Space',   rooms: [{ num: '300', type: 'Luxury' }] },
];

// ─── OTA colour accents — matches otaTheme() in BookingInvoiceTodo.tsx so a
// channel reads the same color everywhere in the app ─────────────────────────
function channelAccent(channel: string): { accent: string; tint: string; label: string } {
  const ch = (channel || '').toLowerCase();
  if (ch.includes('airbnb'))  return { accent: '#e11d48', tint: '#fff1f2', label: 'Airbnb' };
  if (ch.includes('booking')) return { accent: '#1d4ed8', tint: '#eff6ff', label: 'Booking.com' };
  if (ch.includes('expedia')) return { accent: '#b45309', tint: '#fffbeb', label: 'Expedia' };
  if (ch.includes('trip'))    return { accent: '#16a34a', tint: '#f0fdf4', label: 'Trip.com' };
  return { accent: '#6b7280', tint: '#f9fafb', label: channel || 'Other' };
}

interface RawStay {
  room: string; guest: string; checkin: string; checkout: string;
  channel: string; resId: string; note?: string;
  checkedInAt?: string; checkedOutAt?: string;
}
interface CalStay {
  roomNum: string; guest: string; checkin: string; checkout: string;
  channel: string; resId: string; nights: number;
}

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function today(): string { return toLocalDate(new Date()); }
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}
function diffDays(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}
function roomNum(r: string): string {
  const m = (r || '').match(/\d{3}/);
  return m ? m[0] : (r || '');
}
const WD_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarView() {
  const { t, lang } = useLang();
  const [stays, setStays] = useState<CalStay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [detail, setDetail] = useState<CalStay | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${GAS_API}&action=getRoomStatus&_ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(t('cal_load_failed'));
      const json: { stays: RawStay[] } = await res.json();
      if (!Array.isArray(json.stays)) throw new Error(t('cal_load_failed'));

      const list: CalStay[] = [];
      for (const row of json.stays) {
        // Cancelled rows arrive as a raw room string like "203 ยกเลิก" rather
        // than being filtered server-side — skip them here (same pattern as
        // CheckInOut.tsx) so cancelled bookings never draw a bar.
        if (/ยกเลิก|cancel/i.test(row.room || '')) continue;
        const ci = (row.checkin || '').substring(0, 10);
        const co = (row.checkout || '').substring(0, 10);
        if (!ci || !co) continue;
        const nights = diffDays(ci, co);
        if (nights <= 0) continue;
        list.push({
          roomNum: roomNum(row.room || ''),
          guest: row.guest || '',
          checkin: ci,
          checkout: co,
          channel: row.channel || '',
          resId: row.resId || '',
          nights,
        });
      }
      setStays(list);
      setLastRefresh(new Date().toLocaleTimeString('en-GB'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('cal_load_failed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < DAYS_COUNT; i++) arr.push(addDays(startDate, i));
    return arr;
  }, [startDate]);

  const stayByRoom = useMemo(() => {
    const map: Record<string, CalStay[]> = {};
    for (const s of stays) {
      if (!map[s.roomNum]) map[s.roomNum] = [];
      map[s.roomNum].push(s);
    }
    return map;
  }, [stays]);

  const totalW = LABEL_W + DAYS_COUNT * CELL_W;
  const todayIdx = diffDays(startDate, today());

  return (
    <div>
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <CalendarDays size={18} color={T.navy} />
          <h2 className="f-thai font-bold text-base" style={{ color: T.ink }}>{t('cal_title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="press focus-ring flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs f-thai disabled:opacity-50"
            style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {t('cal_refresh')}
          </button>
          {lastRefresh && !loading && (
            <span className="f-num text-[11px]" style={{ color: T.inkSoft }}>{t('cal_updated')} {lastRefresh}</span>
          )}
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setStartDate(d => addDays(d, -7))}
          className="press focus-ring flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, border: `1px solid ${T.hairGold}` }}>
          <ChevronLeft size={16} color={T.navy} />
        </button>
        <button onClick={() => setStartDate(today())}
          className="press focus-ring f-thai px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: T.navyTint, color: T.navy }}>
          {t('cal_today')}
        </button>
        <button onClick={() => setStartDate(d => addDays(d, 7))}
          className="press focus-ring flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, border: `1px solid ${T.hairGold}` }}>
          <ChevronRight size={16} color={T.navy} />
        </button>
        <input type="date" value={startDate} onChange={e => e.target.value && setStartDate(e.target.value)}
          className="focus-ring rounded-lg px-2 py-1.5 text-xs f-num"
          style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} />
        <span className="f-num text-xs ml-auto hidden sm:inline" style={{ color: T.inkSoft }}>
          {startDate} → {addDays(startDate, DAYS_COUNT - 1)}
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mb-3">
        {['Airbnb', 'Booking.com', 'Expedia', 'Trip.com', 'Other'].map(ch => {
          const c = channelAccent(ch === 'Other' ? '' : ch);
          return (
            <div key={ch} className="flex items-center gap-1">
              <span style={{ width: 9, height: 9, borderRadius: 3, background: c.accent, display: 'inline-block' }} />
              <span className="f-thai text-[11px]" style={{ color: T.inkSoft }}>{c.label}</span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 mb-3 f-thai text-sm" style={{ background: T.wineTint, color: T.wine }}>
          ⚠️ {error}
        </div>
      )}

      {loading && stays.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full animate-spin" style={{ border: `4px solid ${T.hairGold}`, borderTopColor: T.brass }} />
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="rounded-2xl loft-scroll"
          style={{ border: `1px solid ${T.hair}`, background: T.card, overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}
        >
          <div style={{ width: totalW, minWidth: totalW }}>
            {/* Header row: sticky top */}
            <div className="flex" style={{ position: 'sticky', top: 0, zIndex: 20, background: T.card }}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W, position: 'sticky', left: 0, zIndex: 30, background: T.card, borderBottom: `1px solid ${T.hair}`, borderRight: `1px solid ${T.hair}` }} />
              {days.map((d, i) => {
                const dt = new Date(d + 'T00:00:00');
                const isToday = d === today();
                const wd = lang === 'th' ? WD_TH[dt.getDay()] : WD_EN[dt.getDay()];
                return (
                  <div key={d} style={{
                    width: CELL_W, minWidth: CELL_W, textAlign: 'center', padding: '6px 0',
                    borderBottom: `1px solid ${T.hair}`, borderRight: i === days.length - 1 ? 'none' : `1px solid ${T.hair}`,
                    background: isToday ? T.brassPale : T.card,
                  }}>
                    <div className="f-thai text-[10px]" style={{ color: isToday ? T.brassDeep : T.inkSoft, fontWeight: isToday ? 700 : 400 }}>{wd}</div>
                    <div className="f-num text-sm" style={{ color: isToday ? T.brassDeep : T.ink, fontWeight: isToday ? 800 : 600 }}>{dt.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Room groups */}
            {ROOM_GROUPS.map(group => (
              <div key={group.label}>
                <div className="f-thai text-xs font-bold px-3 py-1.5" style={{ background: T.navyTint, color: T.navy }}>
                  {group.label}
                </div>
                {group.rooms.map(room => {
                  const roomStays = stayByRoom[room.num] || [];
                  return (
                    <div key={room.num} className="flex" style={{ height: ROW_H, borderBottom: `1px solid ${T.hair}` }}>
                      <div style={{
                        width: LABEL_W, minWidth: LABEL_W, position: 'sticky', left: 0, zIndex: 10, background: T.card,
                        borderRight: `1px solid ${T.hair}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 10px',
                      }}>
                        <div className="f-num text-sm font-bold" style={{ color: T.ink }}>{room.num}</div>
                        <div className="f-thai text-[10px]" style={{ color: T.inkSoft }}>{room.type}</div>
                      </div>
                      <div style={{
                        width: DAYS_COUNT * CELL_W, minWidth: DAYS_COUNT * CELL_W, position: 'relative',
                        backgroundImage: `repeating-linear-gradient(to right, transparent, transparent ${CELL_W - 1}px, ${T.hair} ${CELL_W - 1}px, ${T.hair} ${CELL_W}px)`,
                      }}>
                        {todayIdx >= 0 && todayIdx < DAYS_COUNT && (
                          <div style={{ position: 'absolute', left: todayIdx * CELL_W, top: 0, bottom: 0, width: CELL_W, background: T.brassPale, opacity: 0.35 }} />
                        )}
                        {roomStays.map(s => {
                          const sIdx = diffDays(startDate, s.checkin);
                          const eIdx = sIdx + s.nights;
                          if (eIdx <= 0 || sIdx >= DAYS_COUNT) return null;
                          const clipL = Math.max(0, sIdx);
                          const clipR = Math.min(DAYS_COUNT, eIdx);
                          const c = channelAccent(s.channel);
                          return (
                            <button
                              key={s.resId + s.checkin}
                              onClick={() => setDetail(s)}
                              className="press focus-ring text-left"
                              style={{
                                position: 'absolute', top: 5, bottom: 5,
                                left: clipL * CELL_W + 3, width: (clipR - clipL) * CELL_W - 6,
                                background: c.tint, borderLeft: `4px solid ${c.accent}`,
                                borderTop: `1px solid ${c.accent}44`, borderRight: `1px solid ${c.accent}44`, borderBottom: `1px solid ${c.accent}44`,
                                borderRadius: 6, padding: '3px 7px', overflow: 'hidden', cursor: 'pointer',
                              }}
                              title={`${s.guest} · ${s.checkin} → ${s.checkout}`}
                            >
                              <div className="f-thai text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: T.ink }}>
                                {s.guest || t('cal_no_name')}
                              </div>
                              <div className="f-num text-[10px] whitespace-nowrap" style={{ color: T.inkSoft }}>
                                🌙 {s.nights}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="rounded-2xl w-full max-w-sm p-5" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.4)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: channelAccent(detail.channel).accent, display: 'inline-block' }} />
              <p className="f-thai font-bold text-sm" style={{ color: T.ink }}>{t('cal_room_word')} {detail.roomNum}</p>
            </div>
            <p className="f-thai text-sm font-semibold mb-1" style={{ color: T.ink }}>{detail.guest || t('cal_no_name')}</p>
            <p className="f-num text-xs mb-1" style={{ color: T.inkSoft }}>{detail.checkin} → {detail.checkout} · {detail.nights} {t('cal_nights')}</p>
            <p className="f-thai text-xs mb-1" style={{ color: T.inkSoft }}>{t('cal_channel')}: {channelAccent(detail.channel).label}</p>
            {detail.resId && <p className="f-num text-[11px] mb-3" style={{ color: T.inkSoft }}>{t('cal_res_id')}: {detail.resId}</p>}
            <button onClick={() => setDetail(null)}
              className="press f-thai w-full rounded-lg py-2 text-sm font-bold"
              style={{ background: T.brass, color: T.navyDeep }}>
              {t('cal_close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
