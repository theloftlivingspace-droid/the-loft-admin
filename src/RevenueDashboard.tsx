import { useState, useEffect, useCallback } from 'react';
import { useLang } from './LanguageContext';
import { T, FoilRule } from './theme';
import { RefreshCw } from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────
// Reuses the existing 'todo' GAS Web App (payout-income-log) — its doGet
// already exposes ?api=1 → getDashboardData(), which returns {bookings,
// ledger, summary} straight from the Bank_Ledger tab of Loft_Reservation_Master.
// The Bank_Ledger rows are the exact same `keepRows` the Apps Script's
// buildDashboardTab() uses to build the "Dashboard" sheet tab, so we
// reproduce that aggregation here client-side instead of adding a new
// GAS endpoint.
const GAS_API = '/api/gas-proxy?app=todo&api=1';

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
  }, [t]);

  useEffect(() => { load(); }, [load]);

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
            <div className="p-4 flex flex-col gap-2.5">
              {otas.map(o => {
                let tSum = 0;
                months.forEach(m => { const d = monthly[`${m}||${o}`]; if (d) tSum += d.amt; });
                const pct = grandTotal > 0 ? tSum / grandTotal : 0;
                const meta = otaMeta(o);
                return (
                  <div key={o} className="flex items-center gap-3">
                    <span className="f-thai text-xs font-bold w-16 shrink-0" style={{ color: meta.hex }}>{meta.short}</span>
                    <div className="flex-1 rounded-full overflow-hidden" style={{ height: 10, background: T.bone }}>
                      <div style={{ width: `${pct * 100}%`, height: '100%', background: meta.hex, borderRadius: 999 }} />
                    </div>
                    <span className="f-num text-xs font-bold w-12 text-right shrink-0" style={{ color: T.ink }}>{(pct * 100).toFixed(0)}%</span>
                    <span className="f-num text-xs w-20 text-right shrink-0" style={{ color: T.inkSoft }}>{fmtTHB(tSum)}</span>
                  </div>
                );
              })}
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
