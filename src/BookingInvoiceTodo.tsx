import { useState, useEffect, useCallback } from 'react';
import { useLang } from './LanguageContext';
import { T } from './theme';

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

interface PendingMatchItem {
  ota: string; guest: string; room: string;
  detectedDate: string; checkin: string; checkout: string;
  net: string | number; status: string; note: string;
}

interface DashboardData {
  today: string;
  booking: BookingItem[];
  invoice: InvoiceItem[];
  pendingMatch: PendingMatchItem[];
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

function enrichData(raw: { today?: string; booking?: BookingRaw[]; invoice?: InvoiceRaw[]; bookings?: BookingRaw[]; ledger?: InvoiceRaw[]; pendingMatch?: PendingMatchItem[] }): DashboardData {
  const today = raw.today || new Date().toISOString().substring(0, 10);
  const bookingsRaw: BookingRaw[] = Array.isArray(raw.booking) ? raw.booking : Array.isArray(raw.bookings) ? raw.bookings : [];
  const invoicesRaw: InvoiceRaw[] = Array.isArray(raw.invoice) ? raw.invoice : Array.isArray(raw.ledger) ? raw.ledger : [];
  const pendingMatch: PendingMatchItem[] = Array.isArray(raw.pendingMatch) ? raw.pendingMatch : [];

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

  return { today, booking, invoice, pendingMatch };
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

// Pairwise eligibility + score for a single (item, candidate) pair.
// Extracted out of findMatches so the same rules can be reused by
// claimInvoicesToBookings() for cross-booking arbitration (see below).
// Returns null when the pair isn't a valid match at all.
type PairScore = { score: number; hasConf: boolean; hasName: boolean; hasCr: boolean };

function scorePair(
  item: { matchKeys: string[]; checkin: string; checkout: string; room?: string },
  c: { matchKeys: string[]; checkin: string; checkout: string; room?: string }
): PairScore | null {
  const mySet = new Set(item.matchKeys);
  const itemRoomNums = new Set(
    (item.room || '').split(',').map(r => roomNumStr(r.trim())).filter(Boolean)
  );

  const isCxl = c.room && isCancelledOrNoShow(c.room);
  const overlap = c.matchKeys.filter(k => mySet.has(k));
  if (overlap.length === 0) return null;

  const hasConf = overlap.some(k => k.startsWith('conf:'));
  const hasName = overlap.some(k => k.startsWith('n6:') || k.startsWith('n:'));
  const hasCr   = overlap.some(k => k.startsWith('cr:'));

  // Cancelled rooms: must have conf or name match, not just room+date
  if (isCxl && !hasConf && !hasName) return null;

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
        return { score, hasConf, hasName, hasCr };
      }
      return null;
    }
    return { score, hasConf, hasName, hasCr };
  } else if (hasCr) {
    // room+date only: require overlapping stay to avoid false positives
    if (rangesOverlap(item.checkin, item.checkout, c.checkin, c.checkout)) {
      return { score, hasConf, hasName, hasCr };
    }
  }
  return null;
}

function findMatches<T extends { matchKeys: string[]; checkin: string; checkout: string; room?: string; guest?: string }>(
  item: { matchKeys: string[]; checkin: string; checkout: string; room?: string },
  candidates: T[]
): T[] {
  const scored: Array<{ score: number; c: T }> = [];

  for (const c of candidates) {
    const r = scorePair(item, c);
    if (r) scored.push({ score: r.score, c });
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

// Cross-booking arbitration: makeMatchKeys_() (GAS) builds room+date "cr:" keys
// across a ±4 day window. Two different-guest bookings in the SAME room only
// 1–4 days apart (a normal turnover, or a cancelled/rebooked room) end up sharing
// several of those cr: keys with each other. Since findMatches() is called once
// per booking independently, one invoice could satisfy the cr:-only eligibility
// check for BOTH bookings and render on both cards, even though only one of them
// is the invoice's actual reservation (bug reported 2026-07-05: room 204, guests
// 佰顺王 / Moritz Reinhardt, invoice ฿-1,661.08 / ฿1,661.08 showing on both).
//
// findMatches() already collapses duplicates within a single booking's own
// candidate list, but has no visibility into what OTHER bookings also claimed
// the same invoice. This function looks at the whole booking list at once and
// gives each invoice exactly one "owner" booking:
//   1. Among all bookings eligible for that invoice, prefer ones with a strong
//      signal (conf code or name match) over a room+date-only (cr:) coincidence.
//   2. Break ties by whichever booking's checkin is closest to the invoice's.
//   3. Break further ties by resId for a stable, deterministic result.
// A booking can still legitimately show multiple invoices (split payouts) —
// this only restricts each invoice to a single booking, not the reverse.
function claimInvoicesToBookings<
  B extends { resId: string; matchKeys: string[]; checkin: string; checkout: string; room?: string },
  I extends { invoiceKey: string; matchKeys: string[]; checkin: string; checkout: string; room?: string }
>(bookings: B[], invoices: I[]): Map<string, string> {
  const claims = new Map<string, string>();

  for (const inv of invoices) {
    let best: { booking: B; score: number; strong: boolean; ciDiff: number } | null = null;

    for (const booking of bookings) {
      const r = scorePair(booking, inv);
      if (!r) continue;
      const strong = r.hasConf || r.hasName;
      const ciDiff = daysDiff(inv.checkin || '', booking.checkin || '');
      const candidate = { booking, score: r.score, strong, ciDiff };

      if (!best) { best = candidate; continue; }

      // Strong (conf/name) signal always beats a fuzzy room+date-only one,
      // regardless of score — this is the key fix for the reported bug.
      if (candidate.strong !== best.strong) {
        if (candidate.strong) best = candidate;
        continue;
      }
      if (candidate.score !== best.score) {
        if (candidate.score > best.score) best = candidate;
        continue;
      }
      if (candidate.ciDiff !== best.ciDiff) {
        if (candidate.ciDiff < best.ciDiff) best = candidate;
        continue;
      }
      if (candidate.booking.resId < best.booking.resId) best = candidate;
    }

    if (best) claims.set(inv.invoiceKey, best.booking.resId);
  }

  return claims;
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
  const { t } = useLang();
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
      <div className="f-thai flex items-center justify-between px-4 py-3 text-white" style={{ background: T.navyDeep }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{doc.fileName}</span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{new Date(doc.uploadedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {docs.length > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setIdx(i => Math.max(0, i - 1))} className="press px-2 py-1 text-xs rounded disabled:opacity-30" style={{ background: 'rgba(255,255,255,0.1)' }} disabled={idx === 0}>‹</button>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{idx + 1}/{docs.length}</span>
              <button onClick={() => setIdx(i => Math.min(docs.length - 1, i + 1))} className="press px-2 py-1 text-xs rounded disabled:opacity-30" style={{ background: 'rgba(255,255,255,0.1)' }} disabled={idx === docs.length - 1}>›</button>
            </div>
          )}
          <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="press px-2 py-1 text-xs rounded" style={{ background: T.brass, color: T.navyDeep }}>{t('bi_download')}</a>
          <button onClick={onClose} className="press px-2 py-1 text-xs rounded" style={{ background: 'rgba(255,255,255,0.15)' }}>✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto flex items-start justify-center p-4" onClick={e => e.stopPropagation()}>
        {isImg && <img src={displayUrl} alt={doc.fileName} className="max-w-full max-h-full object-contain rounded shadow-lg" />}
        {isPdf && <iframe src={doc.previewUrl} className="w-full h-full rounded" title={doc.fileName} />}
        {!isImg && !isPdf && (
          <div className="f-thai rounded-xl p-8 text-center" style={{ background: T.card, color: T.inkSoft }}>
            <div className="text-4xl mb-3">📄</div>
            <div className="font-semibold mb-1" style={{ color: T.ink }}>{doc.fileName}</div>
            <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="underline text-sm" style={{ color: T.navy }}>{t('bi_click_to_download')}</a>
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
export default function BookingInvoiceTodo({ initialTab, onCountChange }: { initialTab?: 'booking' | 'invoice' | 'pending'; onCountChange?: (booking: number, invoice: number) => void } = {}) {
  const { t } = useLang();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'booking' | 'invoice' | 'pending'>(initialTab ?? 'booking');
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
      setError(t('bi_load_failed') + String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleBookingDone = async (resId: string, done: boolean) => {
    if (!data) return;
    setTogglingId(resId);
    setData(d => d ? { ...d, booking: d.booking.map(x => x.resId === resId ? { ...x, done } : x) } : d);
    try { await fetch(`${GAS_API}&action=setBookingDone&id=${encodeURIComponent(resId)}&done=${done}`); }
    catch { setData(d => d ? { ...d, booking: d.booking.map(x => x.resId === resId ? { ...x, done: !done } : x) } : d); showToast(t('bi_save_failed')); }
    setTogglingId('');
  };

  const toggleInvoiceDone = async (invoiceKey: string, done: boolean) => {
    if (!data) return;
    setTogglingId(invoiceKey);
    setData(d => d ? { ...d, invoice: d.invoice.map(x => x.invoiceKey === invoiceKey ? { ...x, done } : x) } : d);
    try { await fetch(`${GAS_API}&action=setInvoiceDone&id=${encodeURIComponent(invoiceKey)}&done=${done}`); }
    catch { setData(d => d ? { ...d, invoice: d.invoice.map(x => x.invoiceKey === invoiceKey ? { ...x, done: !done } : x) } : d); showToast(t('bi_save_failed')); }
    setTogglingId('');
  };

  const jumpTo = (tab: 'booking' | 'invoice', id: string) => {
    setActiveTab(tab);
    setTimeout(() => {
      setHighlighted(id);
      const el = document.querySelector(`[data-itemid="${CSS.escape(id)}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else showToast(t('bi_no_match_found'));
      setTimeout(() => setHighlighted(''), 3000);
    }, 80);
  };

  // Must be before early returns — Rules of Hooks
  const bookingPending = data ? data.booking.filter(x => !x.done).length : 0;
  const invoicePending = data ? data.invoice.filter(x => !x.done).length : 0;
  useEffect(() => {
    onCountChange?.(bookingPending, invoicePending);
  }, [bookingPending, invoicePending, onCountChange]);

  if (loading) return (
    <div className="f-thai flex items-center justify-center py-6" style={{ color: T.inkSoft }}>
      <div className="w-8 h-8 rounded-full animate-spin mr-3" style={{ border: `4px solid ${T.hairGold}`, borderTopColor: T.brass }} />
      {t('bi_loading_data')}
    </div>
  );
  if (error) return (
    <div className="f-thai p-6 rounded-2xl text-sm" style={{ background: T.wineTint, border: `1px solid ${T.wine}30`, color: T.wine }}>
      ⚠️ {error}<button onClick={loadData} className="press ml-4 underline">{t('bi_retry')}</button>
    </div>
  );
  if (!data) return null;

  const bookingNewToday = data.booking.filter(x => x.isNewToday && !x.done).length;
  const invoiceNewToday = data.invoice.filter(x => x.detectedToday && !x.done).length;

  // firstSeen comes in two incompatible formats: ISO 'yyyy-MM-dd' for bookings detected
  // since the format was fixed, and legacy 'EEE MMM d' (no year) for a backfill batch
  // detected before that. Raw string comparison sorts 'Mon Jun 15' ahead of '2026-07-04'
  // (since 'M' > '2' lexicographically), scrambling the list. Parse both into real
  // timestamps instead — legacy strings are all from 2026, so that year is assumed.
  const firstSeenTs = (s?: string) => {
    if (!s) return 0;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00').getTime();
    const t = new Date(s + ' 2026').getTime();
    return isNaN(t) ? 0 : t;
  };
  const searchNorm = normNameForSearch(search);
  // Single source of truth for which booking "owns" each invoice — computed once
  // over the full lists so cross-booking conflicts (see claimInvoicesToBookings)
  // are resolved consistently for both tabs.
  const invoiceClaims = claimInvoicesToBookings(data.booking, data.invoice);
  const visibleBooking = data.booking
    .filter(x => showDoneBooking || !x.done)
    .filter(x => !searchNorm || normNameForSearch(x.guest).includes(searchNorm))
    .sort((a, b) => { const ta = firstSeenTs(a.firstSeen); const tb = firstSeenTs(b.firstSeen); if (ta && tb) return tb - ta; return (b.checkin || '').localeCompare(a.checkin || ''); });
  const visibleInvoice = data.invoice
    .filter(x => showDoneInvoice || !x.done)
    .filter(x => !searchNorm || normNameForSearch(x.guest).includes(searchNorm))
    .sort((a, b) => b.detectedDate > a.detectedDate ? 1 : -1);
  const visiblePending = data.pendingMatch
    .filter(x => !searchNorm || normNameForSearch(x.guest).includes(searchNorm));

  return (
    <div className="relative pb-24">
      {viewerDocs && <DocViewer docs={viewerDocs} onClose={() => setViewerDocs(null)} />}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="f-display text-lg font-bold" style={{ color: T.ink }}>Booking & Invoice To-Do</h2>
          <p className="f-thai text-xs" style={{ color: T.inkSoft }}>{t('bi_today_label')} {data.today}</p>
        </div>
        <button onClick={() => { loadData(); refreshDocs(); }} className="press f-thai flex items-center gap-1 px-3 py-1.5 text-xs rounded-xl" style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
          {t('bi_refresh')}
        </button>
      </div>

      {/* Name search */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: T.inkSoft }}>🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('bi_search_guest')}
          className="focus-ring w-full pl-9 pr-8 py-2 text-sm rounded-xl"
          style={{ border: `1px solid ${T.hairGold}`, color: T.ink }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="press absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: T.inkSoft }}>✕</button>
        )}
      </div>

      <div className="flex mb-4" style={{ borderBottom: `1px solid ${T.hair}` }}>
        {([
          { key: 'booking', label: '📅 Booking To Add', count: bookingPending, flag: bookingNewToday },
          { key: 'invoice', label: '🧾 Invoice To Create', count: invoicePending, flag: invoiceNewToday },
          { key: 'pending', label: '⏳ Pending Match', count: data.pendingMatch.length, flag: 0 },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="f-thai flex-1 pb-3 pt-2 text-sm font-semibold"
            style={{ borderBottom: `2px solid ${activeTab === tab.key ? T.brass : 'transparent'}`, color: activeTab === tab.key ? T.navy : T.inkSoft }}>
            {tab.label}
            <span className="f-num ml-2 text-xs px-2 py-0.5 rounded-full font-bold"
              style={tab.count > 0 ? { background: T.brassPale, color: T.brassDeep } : { background: T.bone, color: T.inkSoft }}>
              {tab.count}
            </span>
            {tab.flag > 0 && <span className="f-num ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: T.sageTint, color: T.sage }}>+{tab.flag}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'booking' && (
        <div>
          <div className="f-thai flex justify-between items-center text-xs mb-3" style={{ color: T.inkSoft }}>
            <span>{t('bi_total')} {data.booking.length} • {t('bi_pending')} {bookingPending} • {t('bi_new_today')} {bookingNewToday}</span>
            <button onClick={() => setShowDoneBooking(v => !v)} className="press underline" style={{ color: T.navy }}>
              {showDoneBooking ? t('bi_hide_done') : t('bi_show_all')}
            </button>
          </div>
          {visibleBooking.length === 0
            ? <p className="f-thai text-center py-10 text-sm" style={{ color: T.inkSoft }}>{search ? `${t('bi_no_results_for')} "${search}"` : t('bi_no_items')}</p>
            : visibleBooking.map(item => {
                const matchedInvoices = findMatches(item, data.invoice)
                  .filter(inv => invoiceClaims.get(inv.invoiceKey) === item.resId);
                const isHl = highlighted === item.resId;
                const copyVal = `${item.guest} / ${item.channel || 'Unknown'}`;
                const itemDocs = findDocsForBooking(item);
                const th = otaTheme(item.channel);
                const isCopied = copiedId === item.resId;
                return (
                  <div key={item.resId} data-itemid={item.resId}
                    className={`rounded-xl mb-1.5 overflow-hidden ${th.card}`}
                    style={{ ...(isHl ? { boxShadow: `0 0 0 2px ${T.brass}` } : {}), opacity: item.done ? 0.7 : 1 }}>
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
                          <span className="f-thai text-[13px] rounded-full px-1 py-px font-bold flex-shrink-0" style={{ background: T.brassPale, color: T.brassDeep }}>{t('bi_new_badge')}</span>
                        )}
                        <button
                          onClick={() => {
                            copyToClipboard(copyVal);
                            setCopiedId(item.resId);
                            setTimeout(() => setCopiedId(''), 2000);
                          }}
                          className={`press flex-shrink-0 text-[13px] border rounded px-1.5 py-px font-medium whitespace-nowrap ${isCopied ? '' : th.copy}`}
                          style={isCopied ? { background: T.sageTint, borderColor: T.sage, color: T.sage } : undefined}>
                          {isCopied ? '✓ copied!' : '📋 copy'}
                        </button>
                      </div>
                      {/* Row 2: date block */}
                      {(() => {
                        const fmtD = (iso: string) => {
                          const d = new Date(iso);
                          return { day: d.getDate(), month: d.toLocaleDateString('en-US', { month: 'short' }), year: String(d.getFullYear()).slice(2) };
                        };
                        const ci = fmtD(item.checkin);
                        const co = fmtD(item.checkout);
                        const nights = Math.round((new Date(item.checkout).getTime() - new Date(item.checkin).getTime()) / 86400000);
                        return (
                          <div className={`flex mt-0.5 ${th.dateBox}`}>
                            <div className="flex-1 px-1.5 py-0.5">
                              <div className={`text-[10px] uppercase tracking-widest ${th.dateLbl}`}>{t('bi_checkin_label')}</div>
                              <div className={`text-base font-semibold leading-none ${th.dateVal}`}>{ci.day}</div>
                              <div className={`text-[13px] ${th.dateSub}`}>{ci.month} '{ci.year}</div>
                            </div>
                            <div className={`flex items-center justify-center px-1.5 text-[13px] font-medium text-center leading-tight ${th.nightBg}`}>
                              <span className={`font-semibold ${th.nightNum}`}>{nights}</span>&nbsp;{t('bi_nights_unit')}
                            </div>
                            <div className="flex-1 px-1.5 py-0.5">
                              <div className={`text-[10px] uppercase tracking-widest ${th.dateLbl}`}>{t('bi_checkout_label')}</div>
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
                            className="press f-thai text-[13px] font-semibold rounded px-1 py-px" style={{ border: `1px solid ${T.hairGold}`, color: T.navy }}>
                            🗂 ({itemDocs.length})
                          </button>
                        )}
                        {matchedInvoices.length === 0
                          ? <span className="f-thai text-[13px] rounded px-1 py-px" style={{ border: `1px solid ${T.hair}`, color: T.inkSoft }}>{t('bi_no_invoice')}</span>
                          : matchedInvoices.map(inv => (
                              <button key={inv.invoiceKey} onClick={() => jumpTo('invoice', inv.invoiceKey)}
                                className={`text-[13px] border font-semibold rounded px-1 py-px transition ${th.inv}`}>
                                🧾 ฿{formatNum(inv.net)}
                              </button>
                            ))
                        }
                        {item.note && <span className="f-thai text-[13px] italic" style={{ color: T.inkSoft }}>📝 {item.note}</span>}
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
          <div className="f-thai flex justify-between items-center text-xs mb-3" style={{ color: T.inkSoft }}>
            <span>{t('bi_total')} {data.invoice.length} • {t('bi_pending')} {invoicePending} • {t('bi_detected_today')} {invoiceNewToday}</span>
            <button onClick={() => setShowDoneInvoice(v => !v)} className="press underline" style={{ color: T.navy }}>
              {showDoneInvoice ? t('bi_hide_done') : t('bi_show_all')}
            </button>
          </div>
          {visibleInvoice.length === 0
            ? <p className="f-thai text-center py-10 text-sm" style={{ color: T.inkSoft }}>{search ? `${t('bi_no_results_for')} "${search}"` : t('bi_no_items')}</p>
            : visibleInvoice.map(item => {
                const claimedResId = invoiceClaims.get(item.invoiceKey);
                const matchedBookings = claimedResId ? data.booking.filter(b => b.resId === claimedResId) : [];
                const isHl = highlighted === item.invoiceKey;
                const cardBg = isHl ? T.navyTint : item.done ? T.sageTint : item.detectedToday && !item.done ? T.brassPale : T.card;
                const cardBorder = isHl ? T.navy : item.done ? T.sage : item.detectedToday && !item.done ? T.hairGold : T.hair;
                return (
                  <div key={item.invoiceKey} data-itemid={item.invoiceKey}
                    className="f-thai flex gap-3 items-start rounded-2xl p-4 mb-3"
                    style={{ background: cardBg, border: `1px solid ${cardBorder}`, opacity: item.done ? 0.7 : 1 }}>
                    <input type="checkbox" checked={item.done} disabled={togglingId === item.invoiceKey}
                      onChange={e => toggleInvoiceDone(item.invoiceKey, e.target.checked)}
                      style={{ accentColor: T.navy }}
                      className="w-5 h-5 mt-0.5 flex-shrink-0 cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-sm" style={{ color: T.ink }}>{t('bi_room_prefix')} {item.room} — {item.guest}</span>
                        {item.detectedToday && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: T.brassPale, color: T.brassDeep }}>{t('bi_detected_today')}</span>}
                        {item.isSplitFromMulti && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: T.navyTint, color: T.navy }}>{t('bi_item_index')} {item.splitIndex}/{item.splitTotal}</span>}
                      </div>
                      <p className="text-xs mb-2" style={{ color: T.inkSoft }}>
                        {item.checkin} → {item.checkout}{item.nights ? ` (${item.nights} ${t('bi_nights_unit')})` : ''}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: T.bone, color: T.inkSoft }}>{item.ota}</span>
                        <span className="f-num text-xs font-bold rounded-lg px-2 py-0.5 flex items-center gap-1" style={{ background: T.sageTint, color: T.sage }}>
                          NET ฿{formatNum(item.net)}
                          {item.isSplitFromMulti && <span className="font-normal" style={{ opacity: 0.6 }}>({t('bi_combined')} ฿{formatNum(item.groupNet)})</span>}
                          <button onClick={() => { copyToClipboard(String(item.net).replace(/,/g,'')); showToast(t('bi_copied_label') + ' ' + item.net); }}
                            className="press ml-0.5" title={t('bi_copy_amount_title')}>⎘</button>
                        </span>
                        <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: T.bone, color: T.inkSoft }}>{t('bi_detected_label')} {item.detectedDate}</span>
                        {matchedBookings.length === 0
                          ? <button className="press text-xs rounded-lg px-2 py-0.5" style={{ border: `1px solid ${T.hair}`, color: T.inkSoft }}>{t('bi_no_booking')}</button>
                          : matchedBookings.map(bk => (
                              <button key={bk.resId} onClick={() => jumpTo('booking', bk.resId)}
                                className="press text-xs font-semibold rounded-lg px-2 py-0.5" style={{ border: `1px solid ${T.navy}40`, color: T.navy }}>
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

      {activeTab === 'pending' && (
        <div>
          <div className="f-thai flex justify-between items-center text-xs mb-3" style={{ color: T.inkSoft }}>
            <span>{t('bi_total')} {data.pendingMatch.length} — เงินเข้าแล้วแต่ยังไม่ match กับ booking</span>
          </div>
          {visiblePending.length === 0
            ? <p className="f-thai text-center py-10 text-sm" style={{ color: T.inkSoft }}>{search ? `${t('bi_no_results_for')} "${search}"` : 'ไม่มียอดค้าง match'}</p>
            : visiblePending.map((item, i) => (
                <div key={item.ota + item.guest + item.detectedDate + i}
                  className="f-thai flex gap-3 items-start rounded-2xl p-4 mb-3"
                  style={{ background: T.card, border: `1px solid ${T.hairGold}` }}>
                  <span className="text-xl flex-shrink-0">⏳</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-bold text-sm" style={{ color: T.ink }}>{item.guest || '(ไม่ทราบชื่อ)'}</span>
                      {item.room && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: T.navyTint, color: T.navy }}>{t('bi_room_prefix')} {item.room}</span>}
                    </div>
                    {(item.checkin || item.checkout) && (
                      <p className="text-xs mb-2" style={{ color: T.inkSoft }}>
                        {item.checkin} → {item.checkout}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: T.bone, color: T.inkSoft }}>{item.ota}</span>
                      <span className="f-num text-xs font-bold rounded-lg px-2 py-0.5" style={{ background: T.brassPale, color: T.brassDeep }}>
                        NET ฿{formatNum(item.net)}
                      </span>
                      <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: T.bone, color: T.inkSoft }}>{item.status}</span>
                      <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: T.bone, color: T.inkSoft }}>{t('bi_detected_label')} {item.detectedDate}</span>
                    </div>
                    {item.note && <p className="f-thai text-[13px] italic mt-1" style={{ color: T.inkSoft }}>📝 {item.note}</p>}
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {toast && (
        <div className="f-thai fixed bottom-6 left-1/2 -translate-x-1/2 text-sm px-5 py-2 rounded-full z-50 pointer-events-none" style={{ background: T.navyDeep, color: '#fff', boxShadow: '0 10px 24px rgba(11,30,66,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}




