import { useState, useEffect, useCallback } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────
const GAS_API = '/api/gas-proxy?app=todo';

interface DocFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  url: string;
  downloadUrl: string;
  previewUrl: string;
  uploadedAt: string;
}

// Docs are stored in Google Drive under folders named "{room}_{checkin}_{resId}"
// (see CheckInOut tab for the upload UI). This fetches the full index in one call.
async function fetchAllDocsIndex(): Promise<Record<string, DocFile[]>> {
  try {
    const res = await fetch(`${GAS_API}&action=getAllDocs`);
    const json = await res.json();
    return json.ok ? (json.docs as Record<string, DocFile[]>) : {};
  } catch {
    return {};
  }
}

function normNameForSearch(s: string): string {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
// Keys ต้องตรงกับ format ที่ GAS makeMatchKeys_ สร้าง:
//   n:NAMEPART|YYYY-MM-DD   (name part + ci date ±2 days)
//   cr:YYYY-MM-DD|ROOM      (checkin date ±2 days + room number)

function normDate(s: string): string {
  if (!s) return '';
  return String(s).substring(0, 10);
}

function extractRoomNum(r: string): string {
  const m = String(r || '').match(/\b(\d{3})\b/);
  return m ? m[1] : String(r || '').replace(/[^0-9]/g, '').substring(0, 3);
}

function ciDates(ci: string): string[] {
  const dates = [ci];
  if (!ci || ci.length < 10) return dates;
  try {
    const d = new Date(ci + 'T00:00:00Z');
    for (let delta = -2; delta <= 2; delta++) {
      if (delta === 0) continue;
      const d2 = new Date(d.getTime() + delta * 86400000);
      dates.push(d2.toISOString().substring(0, 10));
    }
  } catch (_) {}
  return dates;
}

function allNameParts(raw: string): string[] {
  return String(raw || '').trim()
    .split(/[\s,\/\\]+/)
    .map(p => p.toLowerCase().replace(/[^a-z0-9ก-๙]/g, ''))
    .filter(p => p.length >= 3);
}

// สร้าง keys แบบเดียวกับ GAS makeMatchKeys_ — ใช้ทั้งฝั่ง booking และ invoice
function buildMatchKeys(guest: string, checkin: string, room: string): string[] {
  const parts = allNameParts(guest);
  const rn    = extractRoomNum(room);
  const ci    = normDate(checkin);
  const dates = ciDates(ci);
  const keys: string[] = [];
  parts.forEach(p => dates.forEach(dt => keys.push('n:' + p + '|' + dt)));
  if (rn) dates.forEach(dt => keys.push('cr:' + dt + '|' + rn));
  return keys;
}

function buildBookingKeys(b: BookingRaw): string[] {
  return buildMatchKeys(b.guest, b.checkin, b.room);
}

function buildInvoiceKeys(inv: InvoiceRaw): string[] {
  // invoice อาจมีหลาย guest/room (comma-separated)
  const guests = String(inv.guest || '').split(',');
  const rooms  = String(inv.room  || '').split(',');
  const keys: string[] = [];
  guests.forEach((g, i) => {
    const r = rooms[i] || rooms[0] || '';
    buildMatchKeys(g.trim(), inv.checkin, r).forEach(k => keys.push(k));
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

  // Deduplicate by invoiceKey (GAS already handles multi-guest splitting via bookingId#confCode)
  const seen = new Set<string>();
  const invoice: InvoiceItem[] = [];
  invoicesRaw.forEach(inv => {
    const iKey = inv.invoiceKey || inv.bookingId || '';
    if (!iKey || seen.has(iKey)) return;
    seen.add(iKey);
    const detectedDate = normDate(inv.detectedDate || inv.date || today);
    const detectedToday = detectedDate === today || inv.detectedToday === true;
    const item: InvoiceItem = {
      ...inv,
      invoiceKey: iKey,
      detectedDate,
      detectedToday,
      done: inv.done ?? false,
      isSplitFromMulti: inv.isSplitFromMulti ?? false,
      matchKeys: inv.matchKeys?.length ? inv.matchKeys : buildInvoiceKeys(inv),
    };
    invoice.push(item);
  });

  return { today, booking, invoice };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Returns only the counterpart items whose matchKeys actually intersect with `item`'s matchKeys.
// Includes a sanity check: if the ONLY overlapping keys are room+date (`cr:`) keys, we double-check
// the real checkin dates are within 2 days of each other. This guards against invoices whose
// checkin/checkout span is abnormally wide (e.g. unmatched SCB transfers spanning 30+ nights),
// which would otherwise generate a wide date range of `cr:` keys and collide with unrelated bookings
// in the same room.
function rangesOverlap(aCheckin: string, aCheckout: string, bCheckin: string, bCheckout: string): boolean {
  const a1 = new Date(aCheckin).getTime();
  const a2 = new Date(aCheckout).getTime();
  const b1 = new Date(bCheckin).getTime();
  const b2 = new Date(bCheckout).getTime();
  if ([a1, a2, b1, b2].some(isNaN)) return false;
  return a1 < b2 && b1 < a2;
}
function isCancelledOrNoShow(room: string): boolean {
  const r = room.toLowerCase();
  return r.includes('cancel') || r.includes('no show') || r.includes('noshow') || r.includes('ยกเลิก');
}
// ชื่อสั้นๆ ที่พบบ่อย (lee, kim, ana, tom, john ฯลฯ — 3-4 ตัวอักษร) ไม่ควรเชื่อเป็นหลักฐานเดี่ยวๆ
// เพราะแขกคนละคนใช้ชื่อซ้ำกันได้บ่อย ต้องมี room ยืนยันด้วยถึงจะเชื่อ
function hasSpecificNameToken(overlap: string[]): boolean {
  return overlap.some(k => {
    if (k.startsWith('n6:')) return true;                                         // GAS 6-char prefix
    if (k.startsWith('n:') && !k.includes('|')) return k.length >= 7;            // GAS full-name key
    if (k.startsWith('n:') && k.includes('|')) return k.split('|')[0].length >= 'n:'.length + 5; // React key
    return false;
  });
}
function roomNumStr(room: string): string {
  const m = room.match(/\b(\d{3})\b/);
  return m ? m[1] : '';
}
function daysDiffNum(a: string, b: string): number {
  const da = new Date(a).getTime(), db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return 999;
  return Math.abs(da - db) / 86400000;
}
function findMatches<T extends { matchKeys: string[]; checkin: string; checkout: string; room?: string; guest?: string }>(
  item: { matchKeys: string[]; checkin: string; checkout: string; room?: string },
  candidates: T[]
): T[] {
  const mySet = new Set(item.matchKeys);
  const itemRoomNums = new Set(
    (item.room || '').split(',').map(r => roomNumStr(r.trim())).filter(Boolean)
  );
  const scored: Array<{ score: number; c: T }> = [];
  for (const c of candidates) {
    // cancel/noshow rooms: block ถ้า match แค่ cr: (room+date) เท่านั้น
    // แต่ถ้ามี name match (n:) หรือ conf: → อนุญาต เพราะ Airbnb จ่ายจริง
    const isCxl = c.room && isCancelledOrNoShow(c.room);
    if (isCxl) {
      const preCheck = c.matchKeys.filter(k => mySet.has(k));
      const hasNameOrConf = preCheck.some(k => k.startsWith('n:') || k.startsWith('n6:') || k.startsWith('conf:'));
      if (!hasNameOrConf) continue;
    }
    const overlap = c.matchKeys.filter(k => mySet.has(k));
    if (overlap.length === 0) continue;
    const hasConf = overlap.some(k => k.startsWith('conf:'));
    const hasName = overlap.some(k => k.startsWith('n:') || k.startsWith('n6:'));
    const hasCr   = overlap.some(k => k.startsWith('cr:'));
    const cRoomNum = roomNumStr(c.room || '');
    const roomOk = itemRoomNums.size === 0 || !cRoomNum || itemRoomNums.has(cRoomNum);
    const ciDiff = daysDiffNum(item.checkin || '', c.checkin || '');
    let score = 0;
    if (hasConf)  score += 100;
    if (hasName)  score += 20;
    if (roomOk)   score += 10;
    if (hasCr)    score += 2;
    score += Math.max(0, 5 - ciDiff);
    if (hasConf) {
      scored.push({ score, c });
    } else if (hasName) {
      // ป้องกัน false positive จากชื่อสั้นๆ ที่ซ้ำกันได้บ่อย (Lee, Kim, John...):
      // ต้องมี token ที่ยาว/เฉพาะเจาะจงพอ หรือไม่ก็ต้องมี room ยืนยันตรงกัน ถึงจะเชื่อ
      const trustworthy = hasSpecificNameToken(overlap) || (cRoomNum && roomOk && itemRoomNums.size > 0);
      if (!trustworthy) continue;
      if (itemRoomNums.size > 0 && cRoomNum && !roomOk) {
        if (rangesOverlap(item.checkin, item.checkout, c.checkin, c.checkout))
          scored.push({ score, c });
      } else {
        scored.push({ score, c });
      }
    } else if (hasCr) {
      if (rangesOverlap(item.checkin, item.checkout, c.checkin, c.checkout))
        scored.push({ score, c });
    }
  }
  if (scored.length === 0) return [];
  const maxScore = Math.max(...scored.map(x => x.score));
  const top = scored.filter(x => x.score >= maxScore - 5);
  // Same-guest repeat stays: keep only the one with closest checkin
  if (top.length > 1) {
    const firstNames = new Set(top.map(x => (x.c.guest || '').toLowerCase().split(/[\s,]+/)[0]));
    if (firstNames.size === 1) {
      const best = top.reduce((a, b) =>
        daysDiffNum(item.checkin, a.c.checkin) <= daysDiffNum(item.checkin, b.c.checkin) ? a : b
      );
      return [best.c];
    }
  }
  return top.map(x => x.c);
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

// ─── Doc Viewer Modal ─────────────────────────────────────────────────────────
function DocViewer({ docs, onClose }: { docs: DocFile[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const doc = docs[idx];

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  if (!doc) return null;
  const isImg = doc.mimeType.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';
  const displayUrl = `https://drive.google.com/thumbnail?id=${doc.fileId}&sz=w1600`;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{doc.fileName}</span>
          <span className="text-xs text-gray-400">{new Date(doc.uploadedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {docs.length > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setIdx(i => Math.max(0, i - 1))} className="px-2 py-1 text-xs bg-gray-700 rounded disabled:opacity-30" disabled={idx === 0}>‹</button>
              <span className="text-xs text-gray-300">{idx + 1}/{docs.length}</span>
              <button onClick={() => setIdx(i => Math.min(docs.length - 1, i + 1))} className="px-2 py-1 text-xs bg-gray-700 rounded disabled:opacity-30" disabled={idx === docs.length - 1}>›</button>
            </div>
          )}
          <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="px-2 py-1 text-xs bg-blue-600 rounded hover:bg-blue-700">⬇ ดาวน์โหลด</a>
          <button onClick={onClose} className="px-2 py-1 text-xs bg-gray-600 rounded hover:bg-gray-500">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto flex items-start justify-center p-4" onClick={e => e.stopPropagation()}>
        {isImg && <img src={displayUrl} alt={doc.fileName} className="max-w-full max-h-full object-contain rounded shadow-lg" />}
        {isPdf && <iframe src={doc.previewUrl} className="w-full h-full rounded" title={doc.fileName} />}
        {!isImg && !isPdf && (
          <div className="bg-white rounded-xl p-8 text-center text-gray-500">
            <div className="text-4xl mb-3">📄</div>
            <div className="font-semibold mb-1">{doc.fileName}</div>
            <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-sm">คลิกเพื่อดาวน์โหลด</a>
          </div>
        )}
      </div>
    </div>
  );
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
  const [search, setSearch] = useState('');
  const [docs, setDocs] = useState<Record<string, DocFile[]>>({});
  const [viewerDocs, setViewerDocs] = useState<DocFile[] | null>(null);

  const refreshDocs = useCallback(async () => {
    setDocs(await fetchAllDocsIndex());
  }, []);

  useEffect(() => {
    refreshDocs();
    window.addEventListener('focus', refreshDocs);
    return () => window.removeEventListener('focus', refreshDocs);
  }, [refreshDocs]);

  // Drive folders are named "{room}_{checkin}_{resId}" — match on resId first,
  // then fall back to room+checkin (covers stays without a resId).
  function findDocsForBooking(item: { resId: string; guest: string; checkin: string; room: string }): DocFile[] {
    const rm = (item.room.match(/\d{3}/) || [''])[0];
    const exactKey = `${rm}_${item.checkin}_${item.resId || 'noid'}`;
    if (docs[exactKey]?.length) return docs[exactKey];
    const prefix = `${rm}_${item.checkin}_`;
    const matchKey = Object.keys(docs).find(k => k.startsWith(prefix));
    return matchKey ? docs[matchKey] : [];
  }

  const showToast = useCallback((msg: string) => {
    setToast(msg); setTimeout(() => setToast(''), 2500);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${GAS_API}&action=getData`);
      const json = await res.json();
      // Debug: show shape if empty
      if (!Array.isArray(json.booking) && !Array.isArray(json.bookings)) {
        const keys = Object.keys(json);
        setError(`GAS response keys: [${keys.join(', ')}] — booking=${JSON.stringify(json.booking ?? json.bookings)?.substring(0,80)}`);
        setLoading(false); return;
      }
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
    try { await fetch(`${GAS_API}&action=setBookingDone&id=${encodeURIComponent(resId)}&done=${done}`); }
    catch { setData(d => d ? { ...d, booking: d.booking.map(x => x.resId === resId ? { ...x, done: !done } : x) } : d); showToast('บันทึกไม่สำเร็จ'); }
    setTogglingId('');
  };

  const toggleInvoiceDone = async (invoiceKey: string, done: boolean) => {
    if (!data) return;
    setTogglingId(invoiceKey);
    setData(d => d ? { ...d, invoice: d.invoice.map(x => x.invoiceKey === invoiceKey ? { ...x, done } : x) } : d);
    try { await fetch(`${GAS_API}&action=setInvoiceDone&id=${encodeURIComponent(invoiceKey)}&done=${done}`); }
    catch { setData(d => d ? { ...d, invoice: d.invoice.map(x => x.invoiceKey === invoiceKey ? { ...x, done: !done } : x) } : d); showToast('บันทึกไม่สำเร็จ'); }
    setTogglingId('');
  };

  const jumpTo = (tab: 'booking' | 'invoice', id: string) => {
    setActiveTab(tab);
    setTimeout(() => {
      setHighlighted(id);
      const el = document.querySelector(`[data-itemid="${CSS.escape(id)}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else showToast('ไม่พบรายการที่ตรงกัน (อาจถูกซ่อนอยู่ — ลองกด "แสดงทั้งหมด")');
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

  const bookingPending  = data.booking.filter(x => !x.done).length;
  const bookingNewToday = data.booking.filter(x => x.isNewToday && !x.done).length;
  const invoicePending  = data.invoice.filter(x => !x.done).length;
  const invoiceNewToday = data.invoice.filter(x => x.detectedToday && !x.done).length;

  const searchNorm = normNameForSearch(search);
  const visibleBooking = data.booking
    .filter(x => showDoneBooking || !x.done)
    .filter(x => !searchNorm || normNameForSearch(x.guest).includes(searchNorm))
    .sort((a, b) => { const fa = a.firstSeen || ''; const fb = b.firstSeen || ''; if (fa && fb) return fb.localeCompare(fa); return (b.checkin || '').localeCompare(a.checkin || ''); });
  const visibleInvoice = data.invoice
    .filter(x => showDoneInvoice || !x.done)
    .filter(x => !searchNorm || normNameForSearch(x.guest).includes(searchNorm))
    .sort((a, b) => b.detectedDate > a.detectedDate ? 1 : -1);

  return (
    <div className="relative">
      {viewerDocs && <DocViewer docs={viewerDocs} onClose={() => setViewerDocs(null)} />}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-blue-950">Booking & Invoice To-Do</h2>
          <p className="text-xs text-gray-400">วันนี้: {data.today}</p>
        </div>
        <button onClick={() => { loadData(); refreshDocs(); }} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-xl hover:bg-gray-50 transition text-gray-600">
          🔄 รีเฟรช
        </button>
      </div>

      {/* Name search */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อแขก…"
          className="w-full pl-9 pr-8 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">✕</button>
        )}
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
            ? <p className="text-center text-gray-400 py-10 text-sm">{search ? `ไม่พบ "${search}"` : 'ไม่มีรายการ'}</p>
            : visibleBooking.map(item => {
                const matchedInvoices = findMatches(item, data.invoice);
                const isHl = highlighted === item.resId;
                const copyVal = `${item.guest} / ${item.channel || 'Unknown'}`;
                const itemDocs = findDocsForBooking(item);
                return (
                  <div key={item.resId} data-itemid={item.resId}
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
                        {itemDocs.length > 0 && (
                          <button onClick={() => setViewerDocs(itemDocs)}
                            className="text-xs border border-indigo-300 text-indigo-700 font-semibold rounded-lg px-2 py-0.5 hover:bg-indigo-50 transition flex items-center gap-1">
                            🗂 เอกสาร ({itemDocs.length})
                          </button>
                        )}
                        {matchedInvoices.length === 0
                          ? <button className="text-xs border rounded-lg px-2 py-0.5 text-gray-400 hover:bg-gray-50">🧾 ไม่มี Invoice</button>
                          : matchedInvoices.map(inv => (
                              <button key={inv.invoiceKey} onClick={() => jumpTo('invoice', inv.invoiceKey)}
                                className="text-xs border border-blue-400 text-blue-700 font-semibold rounded-lg px-2 py-0.5 hover:bg-blue-50 transition">
                                🧾 NET ฿{formatNum(inv.net)}
                              </button>
                            ))
                        }
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
            ? <p className="text-center text-gray-400 py-10 text-sm">{search ? `ไม่พบ "${search}"` : 'ไม่มีรายการ'}</p>
            : visibleInvoice.map(item => {
                const matchedBookings = findMatches(item, data.booking);
                const isHl = highlighted === item.invoiceKey;
                return (
                  <div key={item.invoiceKey} data-itemid={item.invoiceKey}
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
                        {matchedBookings.length === 0
                          ? <button className="text-xs border rounded-lg px-2 py-0.5 text-gray-400 hover:bg-gray-50">📅 ไม่มี Booking</button>
                          : matchedBookings.map(bk => (
                              <button key={bk.resId} onClick={() => jumpTo('booking', bk.resId)}
                                className="text-xs border border-blue-400 text-blue-700 font-semibold rounded-lg px-2 py-0.5 hover:bg-blue-50 transition">
                                📅 {bk.room} — {bk.guest}
                              </button>
                            ))
                        }
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
