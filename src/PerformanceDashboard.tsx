import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLang } from './LanguageContext';
import { T, FoilRule } from './theme';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────
// Reuses the same 'todo' GAS Web App / action RevenueDashboard.tsx calls —
// its doGet_ getRevenueDashboard reads Bank_Ledger and returns per-booking
// rows (date, ota/status, room, checkin, checkout, nights, gross...). This
// page re-slices that same ledger by night-of-stay within a chosen week
// instead of by month, to mirror Little Hotelier's own "Performance" report
// (Rooms sold / Revenue toggle + per-day bars + channel breakdown).
const GAS_API = '/api/gas-proxy?app=todo&action=getRevenueDashboard';

interface LedgerRow {
  date: string;
  ota: string;
  bookingId: string;
  guest: string;
  room: string;
  checkin: string;
  checkout: string;
  nights: number;
  gross: number;
  commission: number;
  net: number;
  status: string;
}

// Same channel buckets as RevenueDashboard's OTA_META — 'SCB' is the bank
// account, not a real OTA; in practice these are the payouts/transfers that
// never matched an OTA name, which for The Loft is overwhelmingly direct
// bookings paid by bank transfer, so it's labelled "Direct" here to match
// what the Little Hotelier report calls it. (Same underlying Bank_Ledger
// bucket as RevenueDashboard's 'SCB' row — just relabeled for this view.)
const CHANNEL_META: Record<string, { short: string; hex: string }> = {
  'Airbnb payout':          { short: 'Airbnb',   hex: '#FF5A5F' },
  'Booking.com remittance': { short: 'Booking.com', hex: '#003580' },
  'Expedia remittance':     { short: 'Expedia',  hex: '#FFB900' },
  'Trip.com settlement':    { short: 'Trip.com', hex: '#1BA0E2' },
  SCB:                      { short: 'Direct Booking', hex: '#607d8b' },
};
function channelMeta(key: string) {
  return CHANNEL_META[key] || { short: key, hex: '#607d8b' };
}
function deriveChannelKey(status: string): string {
  const m = (status || '').match(/Matched\s*-\s*(.+)$/);
  return m ? m[1].trim() : 'SCB';
}

function fmtTHB(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function fmtInt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ── Local-date helpers (no timezone shifting — same pattern as CalendarView) ──
function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseYMD(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Defensive fallback: Bank_Ledger's checkin/checkout used to come through
  // as a raw Apps Script String(dateCell) — i.e. Date.toString() form like
  // "Mon Aug 31 2026 00:00:00 GMT+0700 (...)" — rather than YYYY-MM-DD.
  // The backend now normalizes this (formatCellDate_), but keep this
  // fallback so a stale/uncached response still parses instead of
  // silently dropping every row.
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}
// Round up to a "nice" axis max (1/2/5/10 × 10^n), same idea LH's chart uses.
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

type Metric = 'rooms' | 'revenue';

interface DayAgg { dateStr: string; dow: string; dnum: string; rooms: number; revenue: number }
interface ChannelAgg { key: string; short: string; hex: string; rooms: number; revenue: number }

export default function PerformanceDashboard() {
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [metric, setMetric] = useState<Metric>('revenue');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrorDetail('');
    try {
      const r = await fetch(`${GAS_API}&_ts=${Date.now()}`, { cache: 'no-store' });
      const raw = await r.text();
      let j: any;
      try {
        j = JSON.parse(raw);
      } catch {
        throw new Error(`HTTP ${r.status} — non-JSON response: ${raw.slice(0, 200)}`);
      }
      if (j && j.ok === false) throw new Error(j.error || 'GAS returned ok:false');
      setRows(Array.isArray(j.ledger) ? j.ledger : []);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(t('perf_load_error'));
      setErrorDetail(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekDayStrs = useMemo(() => weekDays.map(toLocalDate), [weekDays]);

  const { days, channels, avg } = useMemo(() => {
    const dayIndex: Record<string, number> = {};
    weekDayStrs.forEach((s, i) => { dayIndex[s] = i; });

    const dayAgg: DayAgg[] = weekDays.map(d => ({
      dateStr: toLocalDate(d),
      dow: d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { weekday: 'short' }),
      dnum: String(d.getDate()) + (d.getDate() === 1 || (d.getMonth() !== weekDays[0].getMonth()) ? ` ${d.toLocaleDateString('en-US', { month: 'short' })}` : ''),
      rooms: 0,
      revenue: 0,
    }));
    const channelMap: Record<string, ChannelAgg> = {};

    rows.forEach(row => {
      const ci = parseYMD(row.checkin);
      const co = parseYMD(row.checkout);
      if (!ci || !co) return;
      const nights = row.nights > 0 ? row.nights : Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000));
      const revPerNight = (Number(row.gross) || 0) / nights;
      const roomList = (row.room || '').split(',').map(s => s.trim()).filter(s => s && s !== '?');
      const roomCount = roomList.length || 1;
      const chKey = deriveChannelKey(row.status);
      const meta = channelMeta(chKey);

      for (let i = 0; i < nights; i++) {
        const nightStr = toLocalDate(addDays(ci, i));
        const idx = dayIndex[nightStr];
        if (idx === undefined) continue;
        dayAgg[idx].rooms += roomCount;
        dayAgg[idx].revenue += revPerNight;
        if (!channelMap[chKey]) channelMap[chKey] = { key: chKey, short: meta.short, hex: meta.hex, rooms: 0, revenue: 0 };
        channelMap[chKey].rooms += roomCount;
        channelMap[chKey].revenue += revPerNight;
      }
    });

    const chArr = Object.values(channelMap).sort((a, b) => b[metric] - a[metric]);
    const totalRooms = dayAgg.reduce((s, d) => s + d.rooms, 0);
    const totalRevenue = dayAgg.reduce((s, d) => s + d.revenue, 0);
    return {
      days: dayAgg,
      channels: chArr,
      avg: { rooms: totalRooms / 7, revenue: totalRevenue / 7 },
    };
  }, [rows, weekDays, weekDayStrs, lang, metric]);

  const rangeLabel = `${weekDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} - ${weekDays[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const chartMax = niceMax(Math.max(...days.map(d => d[metric]), 1) * 1.05);
  const avgVal = avg[metric];
  const avgPct = Math.min(100, (avgVal / chartMax) * 100);

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="rounded-full animate-spin" style={{ width: 28, height: 28, border: `3px solid ${T.hairGold}`, borderTopColor: T.brass }} />
      </div>
    );
  }

  if (error && rows.length === 0) {
    return (
      <div className="rounded-2xl px-5 py-6 text-center" style={{ background: T.wineTint, border: `1px solid ${T.wine}30` }}>
        <p className="f-thai text-sm font-semibold mb-2" style={{ color: T.wine }}>{error}</p>
        {errorDetail && (
          <p className="f-num text-[10px] mb-3 break-all opacity-70" style={{ color: T.wine }}>{errorDetail}</p>
        )}
        <button onClick={load} className="press focus-ring f-thai px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: T.navy, color: '#fff' }}>
          {t('perf_retry')}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Title + refresh */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="f-display text-xl font-semibold" style={{ color: T.brassDeep }}>{t('perf_title')}</h2>
          {updatedAt && (
            <p className="f-thai text-xs mt-0.5" style={{ color: T.inkSoft }}>
              {t('perf_updated')} {updatedAt.toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button onClick={load} disabled={loading} className="press focus-ring flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold f-thai disabled:opacity-50" style={{ background: T.navyTint, color: T.navy }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('perf_refresh')}
        </button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button onClick={() => setWeekStart(w => addDays(w, -7))} className="press focus-ring flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: T.card, border: `1px solid ${T.hairGold}` }}>
          <ChevronLeft size={16} color={T.navy} />
        </button>
        <button onClick={() => setWeekStart(mondayOf(new Date()))} className="press focus-ring f-thai text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: T.navyTint, color: T.navy }}>
          {t('perf_this_week')}
        </button>
        <button onClick={() => setWeekStart(w => addDays(w, 7))} className="press focus-ring flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: T.card, border: `1px solid ${T.hairGold}` }}>
          <ChevronRight size={16} color={T.navy} />
        </button>
      </div>

      {/* Performance card */}
      <div className="rounded-3xl overflow-hidden mb-6" style={{ border: `1px solid ${T.hairGold}` }}>
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#263238' }}>
          <p className="f-thai text-xs font-bold" style={{ color: '#eceff1' }}>{t('perf_section_title')}</p>
        </div>
        <div className="p-4">
          {/* Metric toggle */}
          <div className="flex rounded-full p-1 mb-4" style={{ background: T.bone }}>
            {(['rooms', 'revenue'] as Metric[]).map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className="press focus-ring flex-1 f-thai text-xs font-bold py-2 rounded-full"
                style={{ background: metric === m ? T.navy : 'transparent', color: metric === m ? '#fff' : T.inkSoft }}
              >
                {m === 'rooms' ? t('perf_metric_rooms') : t('perf_metric_revenue')}
              </button>
            ))}
          </div>

          {/* Average stat */}
          <p className="f-thai eyebrow text-[10px] font-bold mb-1" style={{ color: T.inkSoft }}>{t('perf_average')}</p>
          <p className="f-num text-3xl font-bold mb-0.5" style={{ color: T.ink }}>
            {metric === 'revenue' ? fmtTHB(avgVal) : avgVal.toFixed(2)}
            {metric === 'revenue' && <span className="f-thai text-base font-semibold ml-1.5" style={{ color: T.inkSoft }}>THB</span>}
            {metric === 'rooms' && <span className="f-thai text-base font-semibold ml-1.5" style={{ color: T.inkSoft }}>{t('perf_rooms_unit')}</span>}
          </p>
          <p className="f-num text-xs mb-5" style={{ color: T.inkSoft }}>{rangeLabel}</p>

          {/* Bar chart */}
          <div className="flex items-end gap-2 relative" style={{ height: 180 }}>
            {/* Average dashed line */}
            <div
              className="absolute left-0 right-0 flex items-center"
              style={{ bottom: `${avgPct}%`, borderTop: `1.5px dashed ${T.brassDeep}` }}
            >
              <span className="f-num text-[9px] font-bold px-1" style={{ background: T.card, color: T.brassDeep, marginLeft: -2 }}>avg</span>
            </div>
            {days.map(d => {
              const val = d[metric];
              const pct = Math.max(2, (val / chartMax) * 100);
              const isToday = d.dateStr === toLocalDate(new Date());
              return (
                <div key={d.dateStr} className="flex-1 flex flex-col items-center justify-end h-full relative group">
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: `${pct}%`,
                      background: isToday ? T.brass : `${T.navy}CC`,
                      minHeight: 3,
                    }}
                    title={metric === 'revenue' ? fmtTHB(val) : fmtInt(val)}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-1.5">
            {days.map(d => (
              <div key={d.dateStr} className="flex-1 text-center">
                <p className="f-num text-[10px] font-semibold" style={{ color: T.inkSoft }}>{d.dnum}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Channel breakdown */}
      <div className="rounded-3xl overflow-hidden mb-6" style={{ border: `1px solid ${T.hairGold}` }}>
        <div className="px-4 py-2.5" style={{ background: '#263238' }}>
          <p className="f-thai text-xs font-bold" style={{ color: '#eceff1' }}>{t('perf_channel_breakdown')}</p>
        </div>
        {channels.length === 0 ? (
          <p className="f-thai text-sm text-center py-8" style={{ color: T.inkSoft }}>{t('perf_no_data')}</p>
        ) : (
          <div className="p-4 flex flex-col gap-3">
            {(() => {
              const rowMax = Math.max(1, ...channels.map(c => c[metric]));
              return channels.map(c => {
                const val = c[metric];
                const barPct = (val / rowMax) * 100;
                return (
                  <div key={c.key} className="flex items-center gap-3">
                    <span className="f-thai text-xs font-bold w-28 shrink-0" style={{ color: c.hex }}>{c.short}</span>
                    <div className="flex-1" style={{ height: 10, background: T.bone, borderRadius: 999 }}>
                      <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 999, background: c.hex }} />
                    </div>
                    <span className="f-num text-xs font-bold w-24 text-right shrink-0" style={{ color: T.ink }}>
                      {metric === 'revenue' ? fmtTHB(val) : fmtInt(val)}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
      <FoilRule />
    </div>
  );
}
