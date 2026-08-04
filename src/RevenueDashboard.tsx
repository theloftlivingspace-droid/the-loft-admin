import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLang } from './LanguageContext';
import { T, FoilRule } from './theme';
import { RefreshCw } from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────
// Reuses the existing 'todo' GAS Web App — the same one BookingInvoiceTodo.tsx
// calls (loft-booking-invoice-todo repo, deployed via GitHub Actions). Its
// doGet_ has a getRevenueDashboard action that reads the Bank_Ledger tab of
// Loft_Reservation_Master (same spreadsheet payout-income-log's
// rebuildBankLedger()/buildDashboardTab() write to — any script with access
// can read it, no cross-project call needed) and returns the raw ledger rows;
// we reproduce buildDashboardTab()'s month/OTA/room aggregation client-side.
const GAS_API = '/api/gas-proxy?app=todo&action=getRevenueDashboard';
// Same 'todo' GAS Web App, action=getData — the payload BookingInvoiceTodo.tsx
// reads pendingMatch from (⏳ Pending Match tab). We reuse it here to source the
// "expected" forecast segment: money already received (SCB) but not yet matched
// to a booking/OTA, i.e. getPendingMatchPayouts_() in loft-booking-invoice-todo.
const PENDING_API = '/api/gas-proxy?app=todo&action=getData';

// pendingMatch.ota values come from the payout sheet's 'OTA' column (see
// getPendingMatchPayouts_ in loft-booking-invoice-todo/Code.gs) — short raw
// names, not the "Matched - X" ledger status strings. Map to OTA_META short.
const PENDING_OTA_MAP: Record<string, string> = {
  'Airbnb': 'Airbnb',
  'Booking.com': 'Booking',
  'Expedia': 'Expedia',
  'Trip.com': 'Trip.com',
};

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

// Same short names / colors as OTA_META in Code.gs → buildDashboardTab()
const OTA_META: Record<string, { short: string; hex: string; light: string }> = {
  'Airbnb payout':          { short: 'Airbnb',   hex: '#FF5A5F', light: '#fff0f0' },
  'Booking.com remittance': { short: 'Booking',  hex: '#003580', light: '#e8f0ff' },
  'Expedia remittance':     { short: 'Expedia',  hex: '#FFB900', light: '#fffbe6' },
  'Trip.com settlement':    { short: 'Trip.com', hex: '#1BA0E2', light: '#e6f7ff' },
  SCB:                      { short: 'SCB',      hex: '#607d8b', light: '#f5f5f5' },
};

function otaMeta(key: string) {
  return OTA_META[key] || { short: key, hex: '#607d8b', light: '#f5f5f5' };
}

function fmtTHB(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// hex + alpha → rgba string, used to shade month segments light (old) → dark (new)
function hexAlpha(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface PendingMatchItem {
  ota: string; guest: string; room: string;
  detectedDate: string; checkin: string; checkout: string;
  net: string | number; status: string; note: string;
}

interface Agg {
  months: string[];
  otas: string[];
  monthly: Record<string, { amt: number; count: number }>; // key: `${month}||${ota}`
  monthTotals: Record<string, number>;
  monthTxn: Record<string, number>;
  grandTotal: number;
  roomMap: Record<string, number>;
  txnCount: number;
}

function aggregate(ledger: LedgerRow[]): Agg {
  const monthly: Record<string, { amt: number; count: number }> = {};
  const months: string[] = [];
  const otas: string[] = [];
  const roomMap: Record<string, number> = {};

  ledger.forEach(row => {
    const status = row.status || '';
    const m = status.match(/Matched\s*-\s*(.+)$/);
    const ota = m ? m[1].trim() : 'SCB';
    const amt = Number(row.net) || 0;
    const d = new Date(row.date);
    const mKey = isNaN(d.getTime())
      ? 'Unknown'
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const key = `${mKey}||${ota}`;
    if (!monthly[key]) monthly[key] = { amt: 0, count: 0 };
    monthly[key].amt += amt;
    monthly[key].count += 1;
    if (!months.includes(mKey)) months.push(mKey);
    if (!otas.includes(ota)) otas.push(ota);

    const room = (row.room || '').trim();
    const rooms = room.split(',').map(r => r.trim()).filter(r => r && r !== '?');
    rooms.forEach(rm => {
      roomMap[rm] = (roomMap[rm] || 0) + amt / rooms.length;
    });
  });

  months.sort();
  otas.sort();

  const monthTotals: Record<string, number> = {};
  const monthTxn: Record<string, number> = {};
  months.forEach(m => {
    let t = 0, txn = 0;
    otas.forEach(o => {
      const d = monthly[`${m}||${o}`];
      if (d) { t += d.amt; txn += d.count; }
    });
    monthTotals[m] = t;
    monthTxn[m] = txn;
  });
  const grandTotal = months.reduce((s, m) => s + monthTotals[m], 0);

  return { months, otas, monthly, monthTotals, monthTxn, grandTotal, roomMap, txnCount: ledger.length };
}

export default function RevenueDashboard() {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [agg, setAgg] = useState<Agg | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [pendingMatch, setPendingMatch] = useState<PendingMatchItem[]>([]);
  const [hoverSeg, setHoverSeg] = useState<string | null>(null);

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
      if (j && j.ok === false) {
        throw new Error(j.error || 'GAS returned ok:false');
      }
      const ledger: LedgerRow[] = j.ledger || [];
      setAgg(aggregate(ledger));
      setUpdatedAt(new Date());
    } catch (err) {
      setError(t('rev_load_error'));
      setErrorDetail(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }

    // Forecast source (⏳ Pending Match) — money in but not yet matched to a
    // booking/OTA. Fetched separately so a failure here never blocks the
    // main ledger view; forecast segments just fall back to 0.
    try {
      const pr = await fetch(`${PENDING_API}&_ts=${Date.now()}`, { cache: 'no-store' });
      const pj = await pr.json();
      setPendingMatch(Array.isArray(pj?.pendingMatch) ? pj.pendingMatch : []);
    } catch {
      setPendingMatch([]);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // Sum pendingMatch.net by OTA short name (Airbnb / Booking / Expedia / Trip.com)
  const forecastByOta = useMemo(() => {
    const out: Record<string, number> = {};
    pendingMatch.forEach(p => {
      const short = PENDING_OTA_MAP[(p.ota || '').trim()];
      if (!short) return; // unmapped OTA (e.g. SCB-only rows) — not an OTA forecast
      const net = typeof p.net === 'number' ? p.net : parseFloat(String(p.net).replace(/[,\s]/g, '')) || 0;
      out[short] = (out[short] || 0) + net;
    });
    return out;
  }, [pendingMatch]);

  if (loading && !agg) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="rounded-full animate-spin" style={{ width: 28, height: 28, border: `3px solid ${T.hairGold}`, borderTopColor: T.brass }} />
      </div>
    );
  }

  if (error && !agg) {
    return (
      <div className="rounded-2xl px-5 py-6 text-center" style={{ background: T.wineTint, border: `1px solid ${T.wine}30` }}>
        <p className="f-thai text-sm font-semibold mb-2" style={{ color: T.wine }}>{error}</p>
        {errorDetail && (
          <p className="f-num text-[10px] mb-3 break-all opacity-70" style={{ color: T.wine }}>{errorDetail}</p>
        )}
        <button onClick={load} className="press focus-ring f-thai px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: T.navy, color: '#fff' }}>
          {t('rev_retry')}
        </button>
      </div>
    );
  }

  if (!agg) return null;
  const { months, otas, monthly, monthTotals, monthTxn, grandTotal, roomMap, txnCount } = agg;
  const curMonth = months[months.length - 1] || '';
  const roomList = Object.keys(roomMap).sort((a, b) => roomMap[b] - roomMap[a]);

  const kpiCards = [
    { icon: '💰', label: t('rev_kpi_total'), value: fmtTHB(grandTotal), bg: T.sageTint, fg: T.sage },
    { icon: '📅', label: t('rev_kpi_months'), value: String(months.length), bg: T.navyTint, fg: T.navy },
    { icon: '🏦', label: t('rev_kpi_txn'), value: String(txnCount), bg: T.brassPale, fg: T.brassDeep },
    { icon: '📈', label: curMonth ? `${t('rev_kpi_latest')} ${curMonth}` : t('rev_kpi_latest'), value: fmtTHB(curMonth ? monthTotals[curMonth] : 0), bg: '#F3E7F5', fg: '#6A1B7A' },
  ];

  return (
    <div>
      {/* Title + refresh */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="f-display text-xl font-semibold" style={{ color: T.brassDeep }}>{t('rev_title')}</h2>
          {updatedAt && (
            <p className="f-thai text-xs mt-0.5" style={{ color: T.inkSoft }}>
              {t('rev_updated')} {updatedAt.toLocaleString(t('rev_updated') === 'Updated' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button onClick={load} disabled={loading} className="press focus-ring flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold f-thai disabled:opacity-50" style={{ background: T.navyTint, color: T.navy }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('rev_refresh')}
        </button>
      </div>

      {months.length === 0 ? (
        <div className="rounded-2xl px-5 py-10 text-center" style={{ background: T.navyTint, border: `1px solid ${T.hairGold}` }}>
          <p className="f-thai text-sm" style={{ color: T.inkSoft }}>{t('rev_no_data')}</p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {kpiCards.map((k, i) => (
              <div key={i} className="rounded-2xl px-4 py-3.5" style={{ background: k.bg }}>
                <p className="f-thai text-xs font-semibold mb-1.5" style={{ color: k.fg, opacity: 0.85 }}>{k.icon} {k.label}</p>
                <p className="f-num text-xl font-bold" style={{ color: k.fg }}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Monthly x OTA table */}
          <div className="rounded-3xl overflow-hidden mb-6" style={{ border: `1px solid ${T.hairGold}` }}>
            <div className="px-4 py-2.5" style={{ background: '#263238' }}>
              <p className="f-thai text-xs font-bold" style={{ color: '#eceff1' }}>{t('rev_table_title')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs f-num">
                <thead>
                  <tr style={{ background: '#37474f' }}>
                    <th className="f-thai px-3 py-2 text-left font-bold" style={{ color: '#fff' }}>{t('rev_col_month')}</th>
                    {otas.map(o => {
                      const meta = otaMeta(o);
                      return <th key={o} className="px-3 py-2 text-center font-bold" style={{ color: '#fff', background: meta.hex }}>{meta.short}</th>;
                    })}
                    <th className="px-3 py-2 text-center font-bold" style={{ color: '#fff' }}>{t('rev_col_total')}</th>
                    <th className="px-3 py-2 text-center font-bold text-[10px]" style={{ color: '#aaa' }}>txn</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, mi) => (
                    <tr key={m} style={{ background: mi % 2 === 0 ? '#f8f9fa' : '#fff' }}>
                      <td className="f-thai px-3 py-2 font-bold" style={{ color: T.ink }}>{m}</td>
                      {otas.map(o => {
                        const d = monthly[`${m}||${o}`];
                        const meta = otaMeta(o);
                        return (
                          <td key={o} className="px-3 py-2 text-right" style={{ background: d ? meta.light : undefined, color: d ? T.ink : '#ccc' }}>
                            {d ? fmtTHB(d.amt) : '—'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-bold" style={{ background: '#e8f5e9', color: T.sage }}>{fmtTHB(monthTotals[m])}</td>
                      <td className="px-3 py-2 text-center text-[10px]" style={{ color: '#888' }}>{monthTxn[m]}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#1b5e20' }}>
                    <td className="f-thai px-3 py-2 font-bold" style={{ color: '#fff' }}>💰 {t('rev_grand_total')}</td>
                    {otas.map(o => {
                      let tSum = 0;
                      months.forEach(m => { const d = monthly[`${m}||${o}`]; if (d) tSum += d.amt; });
                      return <td key={o} className="px-3 py-2 text-right font-bold" style={{ background: '#c8e6c9', color: T.ink }}>{tSum > 0 ? fmtTHB(tSum) : '—'}</td>;
                    })}
                    <td className="px-3 py-2 text-right font-bold" style={{ background: '#a5d6a7', color: T.ink }}>{fmtTHB(grandTotal)}</td>
                    <td className="px-3 py-2 text-center text-[10px]" style={{ color: '#888', background: '#c8e6c9' }}>{txnCount}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* OTA share */}
          <div className="rounded-3xl overflow-hidden mb-6" style={{ border: `1px solid ${T.hairGold}` }}>
            <div className="px-4 py-2.5" style={{ background: '#263238' }}>
              <p className="f-thai text-xs font-bold" style={{ color: '#eceff1' }}>{t('rev_ota_share')}</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {(() => {
                // Row max includes each OTA's own forecast tail, so bar length
                // reflects "actual so far + expected" — same as the other rows.
                const rowMax = Math.max(1, ...otas.map(oo => {
                  let s = 0; months.forEach(m => { const d = monthly[`${m}||${oo}`]; if (d) s += d.amt; });
                  return s + (forecastByOta[otaMeta(oo).short] || 0);
                }));
                return otas.map(o => {
                  const meta = otaMeta(o);
                  let tSum = 0;
                  months.forEach(m => { const d = monthly[`${m}||${o}`]; if (d) tSum += d.amt; });
                  const forecast = forecastByOta[meta.short] || 0;
                  const rowTotal = tSum + forecast;
                  const pct = grandTotal > 0 ? tSum / grandTotal : 0;
                  const barPct = (rowTotal / rowMax) * 100;

                  const segs = months
                    .map(m => ({ key: m, label: m, amt: monthly[`${m}||${o}`]?.amt || 0, forecast: false }))
                    .filter(s => s.amt > 0);
                  if (forecast > 0) segs.push({ key: 'forecast', label: t('rev_forecast'), amt: forecast, forecast: true });

                  return (
                    <div key={o} className="flex items-center gap-3">
                      <span className="f-thai text-xs font-bold w-16 shrink-0" style={{ color: meta.hex }}>{meta.short}</span>
                      <div className="flex-1 relative" style={{ height: 10, background: T.bone, borderRadius: 999 }}>
                        <div className="flex h-full" style={{ width: `${barPct}%`, borderRadius: 999, overflow: 'visible' }}>
                          {segs.map((s, si) => {
                            const segKey = `${o}-${s.key}`;
                            const alpha = s.forecast ? 1 : 0.32 + (0.68 * si) / Math.max(1, months.filter(m => (monthly[`${m}||${o}`]?.amt || 0) > 0).length - 1);
                            return (
                              <div
                                key={s.key}
                                role="button"
                                tabIndex={0}
                                className="h-full relative cursor-pointer focus-ring"
                                style={{
                                  width: `${(s.amt / rowTotal) * 100}%`,
                                  background: s.forecast
                                    ? 'repeating-linear-gradient(135deg, #c7c9cc 0, #c7c9cc 4px, #dcdedf 4px, #dcdedf 8px)'
                                    : hexAlpha(meta.hex, alpha),
                                  borderTopLeftRadius: si === 0 ? 999 : 0,
                                  borderBottomLeftRadius: si === 0 ? 999 : 0,
                                  borderTopRightRadius: si === segs.length - 1 ? 999 : 0,
                                  borderBottomRightRadius: si === segs.length - 1 ? 999 : 0,
                                }}
                                onMouseEnter={() => setHoverSeg(segKey)}
                                onMouseLeave={() => setHoverSeg(null)}
                                onClick={() => setHoverSeg(hoverSeg === segKey ? null : segKey)}
                              >
                                {hoverSeg === segKey && (
                                  <div
                                    className="f-num absolute bottom-full mb-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap z-10"
                                    style={{
                                      background: T.ink, color: '#fff',
                                      left: si === 0 ? 0 : si === segs.length - 1 ? 'auto' : '50%',
                                      right: si === segs.length - 1 ? 0 : 'auto',
                                      transform: si === 0 || si === segs.length - 1 ? 'none' : 'translateX(-50%)',
                                    }}
                                  >
                                    {s.label} · {fmtTHB(s.amt)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <span className="f-num text-xs font-bold w-12 text-right shrink-0" style={{ color: T.ink }}>{(pct * 100).toFixed(0)}%</span>
                      <span className="f-num text-xs w-20 text-right shrink-0" style={{ color: T.inkSoft }}>{fmtTHB(tSum)}</span>
                    </div>
                  );
                });
              })()}
              <div className="flex items-center gap-4 mt-1 pl-16">
                <span className="f-thai text-[10px] flex items-center gap-1.5" style={{ color: T.inkSoft }}>
                  <span style={{ width: 20, height: 8, borderRadius: 2, background: 'linear-gradient(90deg, rgba(96,125,139,0.32), rgba(96,125,139,1))' }} />
                  {t('rev_month_shade')}
                </span>
                <span className="f-thai text-[10px] flex items-center gap-1.5" style={{ color: T.inkSoft }}>
                  <span style={{ width: 14, height: 8, borderRadius: 2, background: 'repeating-linear-gradient(135deg, #c7c9cc 0, #c7c9cc 4px, #dcdedf 4px, #dcdedf 8px)' }} />
                  {t('rev_forecast')}
                </span>
              </div>
            </div>
          </div>

          {/* MoM growth */}
          {months.length >= 2 && (
            <div className="rounded-3xl overflow-hidden mb-6" style={{ border: `1px solid ${T.hairGold}` }}>
              <div className="px-4 py-2.5" style={{ background: '#263238' }}>
                <p className="f-thai text-xs font-bold" style={{ color: '#eceff1' }}>{t('rev_mom_growth')}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs f-num">
                  <thead>
                    <tr style={{ background: '#37474f' }}>
                      <th className="f-thai px-3 py-2 text-left font-bold" style={{ color: '#fff' }}>{t('rev_col_month')}</th>
                      <th className="px-3 py-2 text-right font-bold" style={{ color: '#fff' }}>{t('rev_col_total')}</th>
                      <th className="px-3 py-2 text-right font-bold" style={{ color: '#fff' }}>{t('rev_col_change')}</th>
                      <th className="px-3 py-2 text-center font-bold" style={{ color: '#fff' }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m, mi) => {
                      const cur = monthTotals[m];
                      const prev = mi > 0 ? monthTotals[months[mi - 1]] : null;
                      const delta = prev != null ? cur - prev : null;
                      const pct = prev && prev > 0 ? (delta! / prev) * 100 : null;
                      const isUp = delta == null || delta >= 0;
                      const bg = delta == null ? '#f8f9fa' : (isUp ? '#e8f5e9' : '#ffebee');
                      const fc = isUp ? '#1b5e20' : '#b71c1c';
                      return (
                        <tr key={m} style={{ background: bg }}>
                          <td className="f-thai px-3 py-2" style={{ color: T.ink }}>{m}</td>
                          <td className="px-3 py-2 text-right" style={{ color: T.ink }}>{fmtTHB(cur)}</td>
                          <td className="px-3 py-2 text-right font-bold" style={{ color: delta == null ? '#ccc' : fc }}>{delta != null ? `${delta >= 0 ? '+' : ''}${fmtTHB(delta)}` : '—'}</td>
                          <td className="px-3 py-2 text-center font-bold" style={{ color: pct == null ? '#ccc' : fc }}>{pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top rooms */}
          {roomList.length > 0 && (
            <div className="rounded-3xl overflow-hidden mb-6" style={{ border: `1px solid ${T.hairGold}` }}>
              <div className="px-4 py-2.5" style={{ background: '#263238' }}>
                <p className="f-thai text-xs font-bold" style={{ color: '#eceff1' }}>{t('rev_top_rooms')}</p>
              </div>
              <div className="p-4 flex flex-col gap-2">
                {roomList.map(rm => {
                  const amt = roomMap[rm];
                  const pct = grandTotal > 0 ? (amt / grandTotal) * 100 : 0;
                  return (
                    <div key={rm} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: T.paper }}>
                      <span className="f-thai text-xs font-bold" style={{ color: T.ink }}>{t('rev_room_prefix')} {rm}</span>
                      <div className="flex items-center gap-3">
                        <span className="f-num text-xs" style={{ color: T.inkSoft }}>{pct.toFixed(1)}%</span>
                        <span className="f-num text-sm font-bold" style={{ color: T.sage }}>{fmtTHB(amt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <FoilRule />
        </>
      )}
    </div>
  );
}
