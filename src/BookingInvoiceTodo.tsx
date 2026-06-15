import { useState, useEffect, useCallback } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────
const GAS_API = 'https://script.google.com/macros/s/AKfycbxHuLVbrYnMS2aMEFUppdpKfwfby6Kn4lqD8MDHFwMf7BFIaUlv6NywAzTB-tH-IXs/exec';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BookingRaw {
  resId: string; room: string; guest: string;
  checkin: string; checkout: string; channel: string; note: string;
  firstSeen?: string; isNewToday?: boolean; done?: boolean;
  matchKeys?: string[];
}
interface InvoiceRaw {
  invoiceKey?: string; bookingId: string; room: string; guest: string;
  checkin: string; checkout: string; nights: string | number; net: string | number;
  groupNet?: string | number; isSplitFromMulti?: boolean;
  splitIndex?: number; splitTotal?: number;
  ota: string; status: string; detectedDate?: string; detectedToday?: boolean;
  done?: boolean; matchKeys?: string[];
  // old GAS format
  date?: string;
}

interface BookingItem extends BookingRaw { matchKeys: string[]; isNewToday: boolean; done: boolean; }
interface InvoiceItem extends InvoiceRaw { matchKeys: string[]; invoiceKey: string; detectedToday: boolean; done: boolean; detectedDate: string; }

interface DashboardData {
  today: string;
  booking: BookingItem[];
  invoice: InvoiceItem[];
}

// ─── Frontend Matching ────────────────────────────────────────────────────────
function normName(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function nameTokenPrefixes(fullName: string): string[] {
  return fullName.replace(/,/g, ' ').split(/\s+/)
    .filter(t => t.length > 1)
    .map(t => 'n6:' + normName(t).substring(0, 6))
    .filter(k => k.length > 4);
}

function normDate(s: string): string {
  if (!s) return '';
  if (/T\d\d:\d\d/.test(s)) {
    // UTC ISO → Bangkok (+7)
    const d = new Date(s);
    const bkk = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    return bkk.toISOString().substring(0, 10);
  }
  return String(s).substring(0, 10);
}

function extractRoomNum(r: string): string {
  const m = String(r || '').match(/(\d{3})/);
  return m ? m[1] : '';
}

function buildBookingKeys(b: BookingRaw): string[] {
  const keys: string[] = [];
  // 1. Airbnb conf from resId: ABB-HMXXXXXX-YYYYMMDD
  const confM = b.resId.match(/ABB-([A-Za-z0-9]{6,})-\d{8}/i);
  if (confM) {
    const c = confM[1].toUpperCase();
    if (/^HM/.test(c)) keys.push('conf:' + c);
  }
  // 2. checkin + room
  const ci = normDate(b.checkin);
  const rm = extractRoomNum(b.room);
  if (ci && rm) keys.push('cr:' + ci + ':' + rm);
  // 3. name token prefixes (handles "Last, First" order)
  nameTokenPrefixes(b.guest).forEach(p => keys.push(p));
  // 4. full norm name
  const nn = normName(b.guest.replace(/,/g, ' '));
  if (nn.length >= 4) keys.push('n:' + nn);
  return keys;
}

function buildInvoiceKeys(inv: InvoiceRaw): string[] {
  const keys: string[] = [];
  // 1. conf codes from bookingId or guest field
  const bid = inv.bookingId || inv.invoiceKey || '';
  // Airbnb: conf codes appear in bookingId or as HM... codes in guest
  const confMatches = bid.match(/HM[A-Z0-9]{6,}/g) || [];
  confMatches.forEach(c => keys.push('conf:' + c));
  // Also check guest field for HM codes
  const guestConfs = (inv.guest || '').match(/HM[A-Z0-9]{6,}/g) || [];
  guestConfs.forEach(c => keys.push('conf:' + c));
  // 2. checkin + each room (multi-room rows have comma-separated rooms)
  const ci = normDate(inv.checkin);
  const rooms = String(inv.room || '').split(',');
  rooms.forEach(r => {
    const rm = extractRoomNum(r);
    if (ci && rm) keys.push('cr:' + ci + ':' + rm);
  });
  // 3. name token prefixes for each guest
  const guests = String(inv.guest || '').split(',');
  guests.forEach(g => nameTokenPrefixes(g.trim()).forEach(p => keys.push(p)));
  // 4. full norm name
  guests.forEach(g => {
    const nn = normName(g);
    if (nn.length >= 4) keys.push('n:' + nn);
  });
  return keys;
}

function enrichData(raw: { today?: string; booking?: BookingRaw[]; invoice?: InvoiceRaw[]; bookings?: BookingRaw[]; ledger?: InvoiceRaw[] }): DashboardData {
  const today = raw.today || new Date().toISOString().substring(0, 10);
  const bookingsRaw: BookingRaw[] = Array.isArray(raw.booking) ? raw.booking : Array.isArray(raw.bookings) ? raw.bookings : [];
  const invoicesRaw: InvoiceRaw[] = Array.isArray(raw.invoice) ? raw.invoice : Array.isArray(raw.ledger) ? raw.ledger : [];

  const booking: BookingItem[] = bookingsRaw.map(b => ({
    ...b,
    done: b.done ?? false,
    isNewToday: b.isNewToday ?? false,
    matchKeys: b.matchKeys?.length ? b.matchKeys : buildBookingKeys(b),
  }));

  // Deduplicate invoices by bookingId, split multi-room
  const seen = new Set<string>();
  const invoice: InvoiceItem[] = [];
  invoicesRaw.forEach(inv => {
    const bid = inv.bookingId || inv.invoiceKey || '';
    if (!bid || seen.has(bid)) return;
    seen.add(bid);
    const rooms = String(inv.room || '').split(',').map(r => r.trim()).filter(Boolean);
    const guests = String(inv.guest || '').split(',').map(g => g.trim()).filter(Boolean);
    const detectedDate = normDate(inv.detectedDate || inv.date || today);
    const detectedToday = detectedDate === today || inv.detectedToday === true;
    if (rooms.length > 1) {
      rooms.forEach((room, i) => {
        const iKey = bid + ':' + i;
        const partial: InvoiceItem = {
          ...inv,
          invoiceKey: iKey,
          room,
          guest: guests[i] || inv.guest,
          detectedDate,
          detectedToday,
          done: inv.done ?? false,
          isSplitFromMulti: true,
          splitIndex: i + 1,
          splitTotal: rooms.length,
          matchKeys: [],
        };
        partial.matchKeys = buildInvoiceKeys(partial);
        invoice.push(partial);
      });
    } else {
      const item: InvoiceItem = {
        ...inv,
        invoiceKey: bid,
        detectedDate,
        detectedToday,
        done: inv.done ?? false,
        isSplitFromMulti: inv.isSplitFromMulti ?? false,
        matchKeys: [],
      };
      item.matchKeys = buildInvoiceKeys(item);
      invoice.push(item);
    }
  });

  return { today, booking, invoice };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildKeySet(items: { matchKeys: string[] }[]): Set<string> {
  const s = new Set<string>();
  items.forEach(x => x.matchKeys.forEach(k => s.add(k)));
  return s;
}
function hasMatch(item: { matchKeys: string[] }, keySet: Set<string>): boolean {
  return item.matchKeys.some(k => keySet.has(k));
}
function jumpKey(item: { matchKeys: string[] }): string {
  return item.matchKeys.find(k => k.startsWith('n:')) || item.matchKeys[0] || '';
}
function formatNum(n: string | number | undefined): string {
  const v = parseFloat(String(n ?? '').replace(/,/g, ''));
  if (isNaN(v)) return String(n ?? '');
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function copyToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else { fallbackCopy(text); }
}
function fallbackCopy(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BookingInvoiceTodo() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'booking' | 'invoice'>('booking');
  const [showDoneBooking, setShowDoneBooking] = useState(true);
  const [showDoneInvoice, setShowDoneInvoice] = useState(true);
  const [toast, setToast] = useState('');
  const [highlighted, setHighlighted] = useState<string>('');
  const [togglingId, setTogglingId] = useState<string>('');

  const showToast = useCallback((msg: string) => {
    setToast(msg); setTimeout(() => setToast(''), 2500);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${GAS_API}?action=getData`);
      const json = await res.json();
      setData(enrichData(json));
    } catch (e) {
      setError('โหลดข้อมูลไม่สำเร็จ: ' + String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleBookingDone = async (resId: string, done: boolean) => {
    if (!data) return;
    setTogglingId(resId);
    setData(d => d ? { ...d, booking: d.booking.map(x => x.resId === resId ? { ...x, done } : x) } : d);
    try { await fetch(`${GAS_API}?action=setBookingDone&id=${encodeURIComponent(resId)}&done=${done}`); }
    catch { setData(d => d ? { ...d, booking: d.booking.map(x => x.resId === resId ? { ...x, done: !done } : x) } : d); showToast('บันทึกไม่สำเร็จ'); }
    setTogglingId('');
  };

  const toggleInvoiceDone = async (invoiceKey: string, done: boolean) => {
    if (!data) return;
    setTogglingId(invoiceKey);
    setData(d => d ? { ...d, invoice: d.invoice.map(x => x.invoiceKey === invoiceKey ? { ...x, done } : x) } : d);
    try { await fetch(`${GAS_API}?action=setInvoiceDone&id=${encodeURIComponent(invoiceKey)}&done=${done}`); }
    catch { setData(d => d ? { ...d, invoice: d.invoice.map(x => x.invoiceKey === invoiceKey ? { ...x, done: !done } : x) } : d); showToast('บันทึกไม่สำเร็จ'); }
    setTogglingId('');
  };

  const jumpTo = (tab: 'booking' | 'invoice', key: string) => {
    setActiveTab(tab);
    setTimeout(() => {
      setHighlighted(key);
      const el = document.querySelector(`[data-matchkey="${CSS.escape(key)}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else showToast('ไม่พบรายการที่ตรงกัน');
      setTimeout(() => setHighlighted(''), 3000);
    }, 80);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <div className="w-8 h-8 border-4 border-blue-300 border-t-blue-600 rounded-full animate-spin mr-3" />
      กำลังโหลดข้อมูล...
    </div>
  );
  if (error) return (
    <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">
      ⚠️ {error}<button onClick={loadData} className="ml-4 underline">ลองใหม่</button>
    </div>
  );
  if (!data) return null;

  const invKeySet = buildKeySet(data.invoice);
  const bkKeySet  = buildKeySet(data.booking);

  const bookingPending  = data.booking.filter(x => !x.done).length;
  const bookingNewToday = data.booking.filter(x => x.isNewToday && !x.done).length;
  const invoicePending  = data.invoice.filter(x => !x.done).length;
  const invoiceNewToday = data.invoice.filter(x => x.detectedToday && !x.done).length;

  const visibleBooking = data.booking.filter(x => showDoneBooking || !x.done).sort((a, b) => b.checkin > a.checkin ? 1 : -1);
  const visibleInvoice = data.invoice.filter(x => showDoneInvoice || !x.done).sort((a, b) => b.detectedDate > a.detectedDate ? 1 : -1);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-blue-950">Booking & Invoice To-Do</h2>
          <p className="text-xs text-gray-400">วันนี้: {data.today}</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-xl hover:bg-gray-50 transition text-gray-600">
          🔄 รีเฟรช
        </button>
      </div>

      <div className="flex border-b mb-4">
        {([
          { key: 'booking', label: '📅 Booking To Add', count: bookingPending, flag: bookingNewToday },
          { key: 'invoice', label: '🧾 Invoice To Create', count: invoicePending, flag: invoiceNewToday },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex-1 pb-3 pt-2 text-sm font-semibold border-b-2 transition-colors
              ${activeTab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-bold
              ${t.count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
              {t.count}
            </span>
            {t.flag > 0 && <span className="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">+{t.flag}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'booking' && (
        <div>
          <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
            <span>ทั้งหมด {data.booking.length} • ค้าง {bookingPending} • ใหม่วันนี้ {bookingNewToday}</span>
            <button onClick={() => setShowDoneBooking(v => !v)} className="text-blue-600 underline">
              {showDoneBooking ? 'ซ่อนรายการที่ทำแล้ว' : 'แสดงทั้งหมด'}
            </button>
          </div>
          {visibleBooking.length === 0
            ? <p className="text-center text-gray-400 py-10 text-sm">ไม่มีรายการ</p>
            : visibleBooking.map(item => {
                const hasMat = hasMatch(item, invKeySet);
                const jk = jumpKey(item);
                const isHl = highlighted === jk;
                const copyVal = `${item.guest} / ${item.channel || 'Unknown'}`;
                return (
                  <div key={item.resId} data-matchkey={jk}
                    className={`flex gap-3 items-start rounded-2xl border p-4 mb-3 transition-all
                      ${item.isNewToday && !item.done ? 'bg-amber-50 border-amber-300' : ''}
                      ${item.done ? 'opacity-50 bg-green-50 border-green-200' : 'bg-white'}
                      ${isHl ? 'ring-2 ring-blue-400 border-blue-400 bg-blue-50' : ''}`}>
                    <input type="checkbox" checked={item.done} disabled={togglingId === item.resId}
                      onChange={e => toggleBookingDone(item.resId, e.target.checked)}
                      className="w-5 h-5 mt-0.5 accent-blue-600 flex-shrink-0 cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-sm">{item.room} — {item.guest}</span>
                        <button onClick={() => { copyToClipboard(copyVal); showToast('คัดลอกแล้ว: ' + copyVal); }}
                          className="text-xs border rounded-lg px-2 py-0.5 hover:bg-gray-100 transition text-gray-500">
                          📋 copy
                        </button>
                        {item.isNewToday && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">ใหม่วันนี้</span>}
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{item.checkin} → {item.checkout}{item.note ? ' • ' + item.note : ''}</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs bg-gray-100 rounded-lg px-2 py-0.5">{item.channel}</span>
                        <span className="text-xs bg-gray-100 rounded-lg px-2 py-0.5 font-mono">{item.resId}</span>
                        <button onClick={() => jumpTo('invoice', jk)}
                          className={`text-xs border rounded-lg px-2 py-0.5 transition
                            ${hasMat ? 'border-blue-400 text-blue-700 font-semibold hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                          {hasMat ? '🧾 ดู Invoice' : '🧾 ไม่มี Invoice'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
          }
        </div>
      )}

      {activeTab === 'invoice' && (
        <div>
          <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
            <span>ทั้งหมด {data.invoice.length} • ค้าง {invoicePending} • ตรวจพบวันนี้ {invoiceNewToday}</span>
            <button onClick={() => setShowDoneInvoice(v => !v)} className="text-blue-600 underline">
              {showDoneInvoice ? 'ซ่อนรายการที่ทำแล้ว' : 'แสดงทั้งหมด'}
            </button>
          </div>
          {visibleInvoice.length === 0
            ? <p className="text-center text-gray-400 py-10 text-sm">ไม่มีรายการ</p>
            : visibleInvoice.map(item => {
                const hasMat = hasMatch(item, bkKeySet);
                const jk = jumpKey(item);
                const isHl = highlighted === jk;
                return (
                  <div key={item.invoiceKey} data-matchkey={jk}
                    className={`flex gap-3 items-start rounded-2xl border p-4 mb-3 transition-all
                      ${item.detectedToday && !item.done ? 'bg-amber-50 border-amber-300' : ''}
                      ${item.done ? 'opacity-50 bg-green-50 border-green-200' : 'bg-white'}
                      ${isHl ? 'ring-2 ring-blue-400 border-blue-400 bg-blue-50' : ''}`}>
                    <input type="checkbox" checked={item.done} disabled={togglingId === item.invoiceKey}
                      onChange={e => toggleInvoiceDone(item.invoiceKey, e.target.checked)}
                      className="w-5 h-5 mt-0.5 accent-blue-600 flex-shrink-0 cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-sm">ห้อง {item.room} — {item.guest}</span>
                        {item.detectedToday && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">ตรวจพบวันนี้</span>}
                        {item.isSplitFromMulti && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">รายการ {item.splitIndex}/{item.splitTotal}</span>}
                      </div>
                      <p className="text-xs text-gray-500 mb-2">
                        {item.checkin} → {item.checkout}{item.nights ? ` (${item.nights} คืน)` : ''}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs bg-gray-100 rounded-lg px-2 py-0.5">{item.ota}</span>
                        <span className="text-xs bg-green-100 text-green-700 font-bold rounded-lg px-2 py-0.5 flex items-center gap-1">
                          NET ฿{formatNum(item.net)}
                          {item.isSplitFromMulti && <span className="font-normal opacity-60">(รวม ฿{formatNum(item.groupNet)})</span>}
                          <button onClick={() => { copyToClipboard(String(item.net).replace(/,/g,'')); showToast('คัดลอกแล้ว: ' + item.net); }}
                            className="ml-0.5 hover:text-green-900 transition" title="copy ยอด">⎘</button>
                        </span>
                        <span className="text-xs bg-gray-100 rounded-lg px-2 py-0.5">ตรวจพบ {item.detectedDate}</span>
                        <button onClick={() => jumpTo('booking', jk)}
                          className={`text-xs border rounded-lg px-2 py-0.5 transition
                            ${hasMat ? 'border-blue-400 text-blue-700 font-semibold hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                          {hasMat ? '📅 ดู Booking' : '📅 ไม่มี Booking'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
          }
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2 rounded-full shadow-xl z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
