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
  confList?: string[];
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

// ─── Key format helpers (must match GAS BookingInvoiceTodo.gs exactly) ────────
//
// GAS produces these key formats:
//   conf:HMXXXXXX          — Airbnb conf code
//   cr:YYYY-MM-DD:ROOM     — checkin date + room number (colon separator)
//   n6:XXXXXX              — 6-char normalized name prefix per token
//   n:FULLNORMNAME         — full normalized name (no spaces/punctuation)
//
// TSX previously used '|' as separator in cr: keys — WRONG. Must use ':'.
// TSX previously built 'n:PART|DATE' keys — totally different format from GAS.
// Fix: always trust GAS-supplied matchKeys; only rebuild as fallback using
// the correct GAS format.

function normName(s: string): string {
  return (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function nameTokens(fullName: string): string[] {
  return (fullName || '').replace(/,/g, ' ').trim()
    .split(/\s+/).filter(t => t.length > 1);
}

function namePrefixes(fullName: string): string[] {
  return nameTokens(fullName).map(t => {
    const n = normName(t);
    return 'n6:' + n.substring(0, 6);
  }).filter(k => k.length > 4);
}

function extractRoomNum(r: string): string {
  const m = String(r || '').match(/(\d{3})/);
  return m ? m[1] : '';
}

function extractConfFromResId(resId: string): string | null {
  const m = String(resId || '').match(/ABB-([A-Za-z0-9]{6,})-\d{8}/);
  if (m) {
    const candidate = m[1].toUpperCase();
    if (/^HM[A-Z0-9]{6,}/.test(candidate)) return candidate;
  }
  return null;
}

// Build matchKeys in GAS format — used only as fallback when GAS didn't supply them
function buildBookingMatchKeysFallback(b: BookingRaw): string[] {
  const keys: string[] = [];
  const conf = extractConfFromResId(b.resId);
  if (conf) keys.push('conf:' + conf);
  const roomNum = extractRoomNum(b.room);
  if (roomNum && b.checkin) keys.push('cr:' + b.checkin + ':' + roomNum);
  namePrefixes(b.guest).forEach(px => keys.push(px));
  const nn = normName(b.guest.replace(/,/g, ' '));
  if (nn.length >= 4) keys.push('n:' + nn);
  return keys;
}

function buildInvoiceMatchKeysFallback(inv: InvoiceRaw): string[] {
  const keys: string[] = [];
  (inv.confList || []).forEach(c => {
    if (c && /^HM[A-Z0-9]{6,}/.test(c)) keys.push('conf:' + c);
  });
  const roomNum = extractRoomNum(inv.room);
  if (roomNum && inv.checkin)  keys.push('cr:' + inv.checkin  + ':' + roomNum);
  if (roomNum && inv.checkout) keys.push('cr:' + inv.checkout + ':' + roomNum);
  namePrefixes(inv.guest).forEach(px => keys.push(px));
  const nn = normName(inv.guest);
  if (nn.length >= 4) keys.push('n:' + nn);
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
    // Trust GAS matchKeys; only rebuild if absent
    matchKeys: (b.matchKeys && b.matchKeys.length > 0) ? b.matchKeys : buildBookingMatchKeysFallback(b),
  }));

  // Deduplicate by invoiceKey — GAS assigns unique keys:
  //   multi-room splits: "SCB-...:0", "SCB-...:1", etc.
  //   single rows: bookingId itself
  // So dedup on invoiceKey is correct and will NOT collapse split rows.
  const seen = new Set<string>();
  const invoice: InvoiceItem[] = [];
  invoicesRaw.forEach(inv => {
    const iKey = inv.invoiceKey || inv.bookingId || '';
    if (!iKey || seen.has(iKey)) return;
    seen.add(iKey);
    const detectedDate = (inv.detectedDate || inv.date || today).substring(0, 10);
    const detectedToday = detectedDate === today || inv.detectedToday === true;
    const item: InvoiceItem = {
      ...inv,
      invoiceKey: iKey,
      detectedDate,
      detectedToday,
      done: inv.done ?? false,
      isSplitFromMulti: inv.isSplitFromMulti ?? false,
      // Trust GAS matchKeys; only rebuild if absent
      matchKeys: (inv.matchKeys && inv.matchKeys.length > 0) ? inv.matchKeys : buildInvoiceMatchKeysFallback(inv),
    };
    invoice.push(item);
  });

  return { today, booking, invoice };
}

// ─── Matching ─────────────────────────────────────────────────────────────────
//
// Since GAS and TSX now share the same key format, matching is a simple
// set intersection. Scoring prioritises conf: > n6:/n: > cr: to avoid
// false positives from room+date coincidences alone.
//
// Guards:
//  - cancelled/no-show rooms: only match if conf: or n6:/n: key overlaps
//  - cr:-only match: require date ranges to actually overlap

function isCancelledOrNoShow(room: string): boolean {
  const r = (room || '').toLowerCase();
  return r.includes('cancel') || r.includes('no show') || r.includes('noshow') || r.includes('ยกเลิก');
}

function rangesOverlap(aCheckin: string, aCheckout: string, bCheckin: string, bCheckout: string): boolean {
  const a1 = new Date(aCheckin).getTime();
  const a2 = new Date(aCheckout).getTime();
  const b1 = new Date(bCheckin).getTime();
  const b2 = new Date(bCheckout).getTime();
  if ([a1, a2, b1, b2].some(isNaN)) return false;
  return a1 < b2 && b1 < a2;
}

function daysDiff(a: string, b: string): number {
  const da = new Date(a).getTime(), db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return 999;
  return Math.abs(da - db) / 86400000;
}

function roomNumStr(room: string): string {
  const m = (room || '').match(/\b(\d{3})\b/);
  return m ? m[1] : '';
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
    const isCxl = c.room && isCancelledOrNoShow(c.room);
    const overlap = c.matchKeys.filter(k => mySet.has(k));
    if (overlap.length === 0) continue;

    const hasConf = overlap.some(k => k.startsWith('conf:'));
    const hasName = overlap.some(k => k.startsWith('n6:') || k.startsWith('n:'));
    const hasCr   = overlap.some(k => k.startsWith('cr:'));

    // Cancelled rooms: must have conf or name match, not just room+date
    if (isCxl && !hasConf && !hasName) continue;

    const cRoomNum = roomNumStr(c.room || '');
    const roomOk = itemRoomNums.size === 0 || !cRoomNum || itemRoomNums.has(cRoomNum);
    const ciDiff = daysDiff(item.checkin || '', c.checkin || '');

    let score = 0;
    if (hasConf) score += 100;
    if (hasName) score += 20;
    if (roomOk)  score += 10;
    if (hasCr)   score += 2;
    score += Math.max(0, 5 - ciDiff);

    if (hasConf || hasName) {
      // conf or name match: trust it (with optional room sanity check)
      if (itemRoomNums.size > 0 && cRoomNum && !roomOk) {
        // room mismatch — only accept if date ranges overlap (e.g. extension payout)
        if (rangesOverlap(item.checkin, item.checkout, c.checkin, c.checkout)) {
          scored.push({ score, c });
        }
      } else {
        scored.push({ score, c });
      }
    } else if (hasCr) {
      // room+date only: require overlapping stay to avoid false positives
      if (rangesOverlap(item.checkin, item.checkout, c.checkin, c.checkout)) {
        scored.push({ score, c });
      }
    }
  }

  if (scored.length === 0) return [];
  const maxScore = Math.max(...scored.map(x => x.score));
  const top = scored.filter(x => x.score >= maxScore - 5);

  // Same-guest repeat stays: collapse ONLY when invoices belong to DIFFERENT stays
  // (i.e. their checkins differ by >14 days from each other).
  // If all matched invoices share the same approximate checkin (same stay, split payouts),
  // keep them all so multi-payout bookings show every invoice button.
  if (top.length > 1) {
    const firstNames = new Set(top.map(x => (x.c.guest || '').toLowerCase().split(/[\s,]+/)[0]));
    if (firstNames.size === 1) {
      // Check if all checkins are within 14 days of each other (same stay)
      const checkins = top.map(x => x.c.checkin || '');
      const allSameStay = checkins.every(ci => daysDiff(checkins[0], ci) <= 14);
      if (!allSameStay) {
        // Different stays — keep only the one closest to the booking's checkin
        const best = top.reduce((a, b) =>
          daysDiff(item.checkin, a.c.checkin) <= daysDiff(item.checkin, b.c.checkin) ? a : b
        );
        return [best.c];
      }
      // Same stay (split payouts) — fall through and return all of them
    }
  }
  // Dedup by net: same net = same payout recorded twice (EXT ghost rows).
  // Keep the highest-scored match; within ties, prefer shorter invoiceKey (non-EXT).
  const seenNet = new Map<number, { score: number; c: T }>();
  for (const x of top) {
    const net = parseFloat(String((x.c as Record<string, unknown>)['net'] ?? 0));
    const existing = seenNet.get(net);
    if (!existing || x.score > existing.score) {
      seenNet.set(net, x);
    } else if (x.score === existing.score) {
      const xKey = String((x.c as Record<string, unknown>)['invoiceKey'] ?? '');
      const eKey = String((existing.c as Record<string, unknown>)['invoiceKey'] ?? '');
      if (xKey.length < eKey.length) seenNet.set(net, x);
    }
  }
  return Array.from(seenNet.values()).map(x => x.c);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── OTA colour themes ────────────────────────────────────────────────────────
function otaTheme(channel: string) {
  const ch = (channel || '').toLowerCase();
  if (ch.includes('airbnb'))   return {
    card:   'bg-white border-l-4 border-l-rose-300 border-t border-r border-b border-rose-100',
    room:   'bg-rose-50 border border-rose-200 text-rose-700',
    badge:  'bg-rose-50 text-rose-700 border border-rose-200',
    name:   'text-rose-900',
    dateVal:'text-rose-900',
    dateSub:'text-rose-700',
    dateLbl:'text-rose-500',
    dateBox:'border border-rose-100 rounded-lg overflow-hidden mb-1',
    nightBg:'bg-rose-50/60 border-x border-rose-100 text-rose-600',
    nightNum:'text-rose-900',
    inv:    'border-rose-400 text-rose-800 hover:bg-rose-100',
    copy:   'border-rose-300 text-rose-600 hover:bg-rose-100',
    accent: '#e11d48',
  };
  if (ch.includes('booking'))  return {
    card:   'bg-white border-l-4 border-l-blue-400 border-t border-r border-b border-blue-100',
    room:   'bg-blue-50 border border-blue-200 text-blue-700',
    badge:  'bg-blue-50 text-blue-800 border border-blue-200',
    name:   'text-blue-950',
    dateVal:'text-blue-950',
    dateSub:'text-blue-700',
    dateLbl:'text-blue-500',
    dateBox:'border border-blue-100 rounded-lg overflow-hidden mb-1',
    nightBg:'bg-blue-50/60 border-x border-blue-100 text-blue-600',
    nightNum:'text-blue-950',
    inv:    'border-blue-500 text-blue-800 hover:bg-blue-100',
    copy:   'border-blue-300 text-blue-600 hover:bg-blue-100',
    accent: '#1d4ed8',
  };
  if (ch.includes('expedia'))  return {
    card:   'bg-white border-l-4 border-l-amber-300 border-t border-r border-b border-amber-100',
    room:   'bg-amber-50 border border-amber-200 text-amber-800',
    badge:  'bg-amber-50 text-amber-800 border border-amber-200',
    name:   'text-amber-950',
    dateVal:'text-amber-950',
    dateSub:'text-amber-700',
    dateLbl:'text-amber-500',
    dateBox:'border border-amber-100 rounded-lg overflow-hidden mb-1',
    nightBg:'bg-amber-50/60 border-x border-amber-100 text-amber-600',
    nightNum:'text-amber-950',
    inv:    'border-amber-500 text-amber-800 hover:bg-amber-100',
    copy:   'border-amber-300 text-amber-700 hover:bg-amber-100',
    accent: '#b45309',
  };
  if (ch.includes('trip'))     return {
    card:   'bg-white border-l-4 border-l-green-400 border-t border-r border-b border-green-100',
    room:   'bg-green-50 border border-green-200 text-green-800',
    badge:  'bg-green-50 text-green-800 border border-green-200',
    name:   'text-green-950',
    dateVal:'text-green-950',
    dateSub:'text-green-700',
    dateLbl:'text-green-500',
    dateBox:'border border-green-100 rounded-lg overflow-hidden mb-1',
    nightBg:'bg-green-50/60 border-x border-green-100 text-green-600',
    nightNum:'text-green-950',
    inv:    'border-green-500 text-green-800 hover:bg-green-100',
    copy:   'border-green-300 text-green-700 hover:bg-green-100',
    accent: '#16a34a',
  };
  // default (direct / unknown)
  return {
    card:   'bg-white border border-gray-200',
    room:   'bg-gray-100 border border-gray-200 text-gray-700',
    badge:  'bg-gray-100 text-gray-600 border border-gray-200',
    name:   'text-gray-900',
    dateVal:'text-gray-900',
    dateSub:'text-gray-500',
    dateLbl:'text-gray-400',
    dateBox:'border border-gray-100 rounded-lg overflow-hidden mb-1',
    nightBg:'bg-gray-50 border-x border-gray-100 text-gray-500',
    nightNum:'text-gray-900',
    inv:    'border-blue-400 text-blue-700 hover:bg-blue-50',
    copy:   'border-gray-300 text-gray-400 hover:bg-gray-50',
    accent: '#2563eb',
  };
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
  const [copiedId, setCopiedId] = useState<string>('');

  const refreshDocs = useCallback(async () => {
    setDocs(await fetchAllDocsIndex());
  }, []);

  useEffect(() => {
    refreshDocs();
    window.addEventListener('focus', refreshDocs);
    return () => window.removeEventListener('focus', refreshDocs);
  }, [refreshDocs]);

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
      if (json.ok === false && json.error) {
        setError(`GAS error: ${json.error}`);
        setLoading(false); return;
      }
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
                const th = otaTheme(item.channel);
                const isCopied = copiedId === item.resId;
                return (
                  <div key={item.resId} data-itemid={item.resId}
                    className={`rounded-xl mb-1.5 transition-all overflow-hidden
                      ${item.done ? 'opacity-40 saturate-50' : th.card}
                      ${isHl ? 'ring-2 ring-blue-400' : ''}`}>
                    <div className="px-2 py-1">
                      {/* Row 1: checkbox + room pill + name + channel + new + copy */}
                      <div className="flex items-center gap-1">
                        <input type="checkbox" checked={item.done} disabled={togglingId === item.resId}
                          onChange={e => toggleBookingDone(item.resId, e.target.checked)}
                          style={{ accentColor: th.accent }}
                          className="w-3.5 h-3.5 flex-shrink-0 cursor-pointer" />
                        <div className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-sm font-semibold ${th.room}`}>
                          {(item.room || '').match(/\b(\d{3})\b/)?.[1] || item.room}
                        </div>
                        <span className={`flex-1 min-w-0 text-[17px] font-semibold truncate ${th.name}`}>{item.guest}</span>
                        <span className={`text-[13px] rounded-full px-1.5 py-px font-medium flex-shrink-0 ${th.badge}`}>{item.channel}</span>
                        {item.isNewToday && !item.done && (
                          <span className="text-[13px] bg-yellow-200 text-yellow-900 rounded-full px-1 py-px font-bold flex-shrink-0">ใหม่</span>
                        )}
                        <button
                          onClick={() => {
                            copyToClipboard(copyVal);
                            setCopiedId(item.resId);
                            setTimeout(() => setCopiedId(''), 2000);
                          }}
                          className={`flex-shrink-0 text-[13px] border rounded px-1.5 py-px transition font-medium whitespace-nowrap
                            ${isCopied ? 'bg-green-100 border-green-400 text-green-700' : th.copy}`}>
                          {isCopied ? '✓ copied!' : '📋 copy'}
                        </button>
                      </div>
                      {/* Row 2: date block */}
                      {(() => {
                        const fmtD = (iso: string) => {
                          const d = new Date(iso);
                          return { day: d.getDate(), month: d.toLocaleDateString('th-TH', { month: 'short' }), year: String(d.getFullYear()).slice(2) };
                        };
                        const ci = fmtD(item.checkin);
                        const co = fmtD(item.checkout);
                        const nights = Math.round((new Date(item.checkout).getTime() - new Date(item.checkin).getTime()) / 86400000);
                        return (
                          <div className={`flex mt-0.5 ${th.dateBox}`}>
                            <div className="flex-1 px-1.5 py-0.5">
                              <div className={`text-[10px] uppercase tracking-widest ${th.dateLbl}`}>เช็คอิน</div>
                              <div className={`text-base font-semibold leading-none ${th.dateVal}`}>{ci.day}</div>
                              <div className={`text-[13px] ${th.dateSub}`}>{ci.month} '{ci.year}</div>
                            </div>
                            <div className={`flex items-center justify-center px-1.5 text-[13px] font-medium text-center leading-tight ${th.nightBg}`}>
                              <span className={`font-semibold ${th.nightNum}`}>{nights}</span>&nbsp;คืน
                            </div>
                            <div className="flex-1 px-1.5 py-0.5">
                              <div className={`text-[10px] uppercase tracking-widest ${th.dateLbl}`}>เช็คเอาท์</div>
                              <div className={`text-sm font-semibold leading-none ${th.dateVal}`}>{co.day}</div>
                              <div className={`text-[10px] ${th.dateSub}`}>{co.month} '{co.year}</div>
                            </div>
                          </div>
                        );
                      })()}
                      {/* Row 3: tags */}
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {itemDocs.length > 0 && (
                          <button onClick={() => setViewerDocs(itemDocs)}
                            className="text-[13px] border border-indigo-300 text-indigo-700 font-semibold rounded px-1 py-px hover:bg-indigo-50 transition">
                            🗂 ({itemDocs.length})
                          </button>
                        )}
                        {matchedInvoices.length === 0
                          ? <span className="text-[13px] border rounded px-1 py-px text-gray-400">🧾 ไม่มี Invoice</span>
                          : matchedInvoices.map(inv => (
                              <button key={inv.invoiceKey} onClick={() => jumpTo('invoice', inv.invoiceKey)}
                                className={`text-[13px] border font-semibold rounded px-1 py-px transition ${th.inv}`}>
                                🧾 ฿{formatNum(inv.net)}
                              </button>
                            ))
                        }
                        {item.note && <span className="text-[13px] text-gray-400 italic">📝 {item.note}</span>}
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




