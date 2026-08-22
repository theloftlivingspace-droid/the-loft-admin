import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useLang } from './LanguageContext';
import { T } from './theme';
import { createWorker, PSM } from 'tesseract.js';
import { parse as parseMRZ } from 'mrz';

// ─── Config ───────────────────────────────────────────────────────────────────
// Proxied through /api/gas-proxy (Vercel serverless function) because Google
// Apps Script Web Apps do not reliably send Access-Control-Allow-Origin even
// on plain GET requests — server-to-server calls bypass this entirely.
const GAS_API = '/api/gas-proxy?app=checkinout';
const CHECKOUT_LOG_ID = '1hP26o_5W4IuqqE9wJyMPuttoPB4m6EIRfkC4ePMzrGE';
const CHECKOUT_GID = '335713576';
const TM30_URL = 'https://tm30.immigration.go.th/tm30api/loginExternal.jsp?value=EXT&id=d0c6b56279430512156a619772ece25a';

// Maid group LINE notes are always Thai (not run through t()) — matches
// existing messages like "🧳 Checkout แล้ว" / "🚫 ยกเลิกการจอง" which are
// hardcoded Thai regardless of admin UI language. Summarizes a checkout
// date change as a day-count ("อยู่ต่อ1วัน" / "เช็คเอาท์เร็วขึ้น2วัน") rather
// than spelling out both raw dates.
function extendLineNote_(oldCheckout: string, newCheckout: string): string {
  const days = Math.round(
    (new Date(newCheckout + 'T00:00:00').getTime() - new Date(oldCheckout + 'T00:00:00').getTime()) / 86400000
  );
  if (days > 0) return `อยู่ต่อ ${days} วัน`;
  if (days < 0) return `เช็คเอาท์เร็วขึ้น ${Math.abs(days)} วัน`;
  return 'แก้ไขวันเช็คเอาท์';
}

// Translates the raw (English, GAS-internal) apartmenteryNote reason
// codes from updateCheckoutDate_ into a short Thai sentence Nathan can
// actually read at a glance, instead of showing the debug string as-is.
function apartmenteryNoteTH_(note?: string): string {
  if (!note) return '';
  if (note.indexOf('no apartmentery bookingId yet') !== -1) {
    return 'ยังไม่มี booking นี้ใน Apartmentery — รอบอัตโนมัติชั่วโมงถัดไปจะสร้างให้เอง';
  }
  if (note.indexOf('session expired') !== -1) {
    return 'เซสชัน Apartmentery หมดอายุ ต้องเข้าไปล็อกอินใหม่';
  }
  if (note.indexOf('sync failed') !== -1) {
    return 'ซิงก์ Apartmentery ไม่สำเร็จ ลองใหม่อีกครั้งหรือแก้เองในเว็บ';
  }
  return 'ซิงก์ Apartmentery ไม่สำเร็จ เช็คด้วยตัวเองถ้าจำเป็น';
}

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

interface DocFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  url: string;
  downloadUrl: string;
  previewUrl: string;
  uploadedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Find the housekeeping/inspection log entry for a stay's checkout.
// Inspection can only ever happen ON or AFTER the guest's checkout date
// (never before), so we scan forward from checkout (allowing a few days'
// grace for late logging) rather than from checkin. Scanning from checkin
// would risk matching a *previous* guest's same-day turnover inspection
// (e.g. logged on this stay's check-in date) to this booking instead.
function findCoForStay(s: Pick<Stay, 'roomNum' | 'checkin' | 'checkout'>, coStatus: Record<string, CheckoutStatus>): CheckoutStatus | undefined {
  const parseLocal = (s2: string) => {
    const [y, m, d2] = s2.split('-').map(Number);
    return new Date(y, m - 1, d2);
  };
  const coD = parseLocal(s.checkout);
  const LATE_LOG_GRACE_DAYS = 3; // inspector may log a day or two after actual checkout
  for (let i = 0; i <= LATE_LOG_GRACE_DAYS; i++) {
    const d = new Date(coD);
    d.setDate(d.getDate() + i);
    const ds = toLocalDate(d);
    const k = `${s.roomNum}_${ds}`;
    if (coStatus[k]) return coStatus[k];
  }
  return undefined;
}

function today(): string {
  return toLocalDate(new Date());
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}

function diffDays(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function roomNum(r: string): string {
  const m = r.match(/\d{3}/);
  return m ? m[0] : r;
}

// Build a full Stay (same shape used by the room-status grid cards) from any raw
// sheet row, regardless of the 5-day arrival window — used by manual search so a
// booking far in the future (or already fully checked out) still gets a proper card.
function stayFromRawRow(row: { room: string; guest: string; checkin: string; checkout: string; channel: string; resId: string; note: string }): Stay {
  const tod = today();
  const ciStr = (row.checkin || '').substring(0, 10);
  const coStr = (row.checkout || '').substring(0, 10);
  const daysUntil = diffDays(tod, ciStr);
  const daysLeft  = diffDays(tod, coStr);

  const checkedIn        = ciStr <= tod && coStr > tod;
  const arrivingToday    = ciStr === tod;
  const checkingOutToday = coStr === tod && ciStr < tod;
  const arrivingSoon     = ciStr > tod;

  let status: Stay['status'] = 'checked-in';
  if (arrivingToday)         status = 'arriving-today';
  else if (checkingOutToday) status = 'checking-out-today';
  else if (arrivingSoon)     status = 'arriving-soon';
  else if (!checkedIn)       status = 'checking-out-today'; // fully in the past — closest display fit

  return {
    room:     row.room || '',
    roomNum:  roomNum(row.room || ''),
    guest:    row.guest || '',
    checkin:  ciStr,
    checkout: coStr,
    channel:  row.channel || '',
    resId:    row.resId || '',
    note:     row.note || '',
    nights:   diffDays(ciStr, coStr),
    status,
    daysLeft,
    daysUntil,
  };
}

// Inline-style variant (channel badge) matching the navy/gold theme without relying on Tailwind color utilities
function channelStyle(ch: string): { bg: string; fg: string } {
  const c = (ch || '').toLowerCase();
  if (c.includes('airbnb')) return { bg: T.wineTint, fg: T.wine };
  if (c.includes('booking')) return { bg: T.navyTint, fg: T.navy };
  if (c.includes('trip')) return { bg: T.sageTint, fg: T.sage };
  if (c.includes('expedia')) return { bg: T.brassPale, fg: T.brassDeep };
  return { bg: T.bone, fg: T.inkSoft };
}

function channelIcon(ch: string): string {
  const c = (ch || '').toLowerCase();
  if (c.includes('airbnb')) return '🏠';
  if (c.includes('booking')) return '📘';
  if (c.includes('trip')) return '✈️';
  if (c.includes('expedia')) return '🌐';
  return '📋';
}

// Standalone translation helper for module-level functions (outside React/useLang context).
// Reads the same localStorage key the LanguageProvider persists to.
function tStatic(th: string, en: string): string {
  try { return localStorage.getItem('loft_admin_lang') === 'en' ? en : th; } catch { return th; }
}

// Drive doc helpers — calls GAS Web App endpoints (uploadDoc / deleteDoc / getAllDocs)
async function uploadDocToDrive(room: string, checkin: string, resId: string, file: File): Promise<DocFile | null> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  // dataUrl looks like "data:image/jpeg;base64,/9j/4AAQ..." — GAS expects
  // the raw base64 payload only, so strip everything up to and including the comma.
  const base64Data = dataUrl.split(',')[1] ?? dataUrl;
  const res = await fetch(GAS_API, {
    method: 'POST',
    body: JSON.stringify({
      action: 'uploadDoc',
      room, checkin, resId,
      fileName: file.name,
      mimeType: file.type,
      base64Data,
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || tStatic('อัปโหลดไม่สำเร็จ', 'Upload failed'));
  return json as DocFile;
}

async function deleteDocFromDrive(fileId: string): Promise<void> {
  const res = await fetch(GAS_API, {
    method: 'POST',
    body: JSON.stringify({ action: 'deleteDoc', fileId }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || tStatic('ลบไม่สำเร็จ', 'Delete failed'));
}

async function fetchAllDocsIndex(): Promise<Record<string, DocFile[]>> {
  const res = await fetch(`${GAS_API}&action=getAllDocs`);
  const json = await res.json();
  return json.ok ? (json.docs as Record<string, DocFile[]>) : {};
}

const STATUS_CONFIG = {
  'checked-in':        { labelKey: 'ci_checked_in_done',    bg: T.sage,      text: '#FFFFFF', dot: '#FFFFFF' },
  'arriving-today':    { labelKey: 'ci_arriving_today',     bg: T.brass,     text: T.navyDeep, dot: T.navyDeep },
  'checking-out-today':{ labelKey: 'ci_checking_out_today', bg: T.wine,      text: '#FFFFFF', dot: '#FFFFFF' },
  'arriving-soon':     { labelKey: 'ci_arriving_soon',      bg: T.navy,      text: '#FFFFFF', dot: '#FFFFFF' },
};

// ─── Physical room list (all 10 units) ─────────────────────────────────────
// Static — room numbers/types don't change at runtime. Used to render the
// always-complete room-status grid (unlike `stays`, which only contains
// rooms that currently have a booking record).
// Column-major order (2026-08-22): with grid-cols-8 below, each pair of
// entries 8 apart lands in the same column, stacking same-type rooms
// top/bottom. Column 5 (Luxury/Retro) is the one exception — those two
// types have only 1 room each, so they share a column instead of getting
// their own.
const ROOM_LIST: { num: string; type: string }[] = [
  // Row 1
  { num: '203', type: 'Allure' },
  { num: '103', type: 'Elegance' },
  { num: '209', type: 'Radiance' },
  { num: '113', type: 'Legacy' },
  { num: '300', type: 'Luxury' },
  { num: '104', type: 'Noir' },
  { num: '105', type: 'Emerald' },
  // Added 2026-08-21 — under renovation, forced "closed" via
  // MANUALLY_CLOSED_ROOMS below until they're ready to sell (~pre-Oct 2026).
  { num: '112', type: 'Rhythm' },
  // Row 2
  { num: '205', type: 'Allure' },
  { num: '204', type: 'Elegance' },
  { num: '210', type: 'Radiance' },
  { num: '214', type: 'Legacy' },
  { num: '108', type: 'Retro' },
  { num: '207', type: 'Noir' },
  { num: '211', type: 'Emerald' },
  { num: '208', type: 'Rhythm' },
];

// Rooms forced to show "closed" on the grid regardless of booking/checkout
// data — e.g. mid-renovation rooms with no stays or housekeeping logs to
// derive a status from. Remove a room's number from this set once it's
// ready to go back on sale.
const MANUALLY_CLOSED_ROOMS = new Set<string>(['112', '208', '105', '211', '104', '207']);

type RoomGridStatus = 'vacant' | 'occupied' | 'checkout-today' | 'closed' | 'arriving-today' | 'arriving-soon';

// Reuses the exact same colors already used elsewhere in this file:
// occupied      → same green as the "checked-in" status card (STATUS_CONFIG)
// checkout-today→ same wine/red as the "checking-out-today" status card
// closed        → dedicated plum/purple — brass was tried first but that's
//                  also the color of the "arriving today" KPI card just
//                  above the grid, so a gold room tile read as "arriving
//                  today" at a glance instead of "closed". Covers both a
//                  room mid-renovation (manually forced, see
//                  MANUALLY_CLOSED_ROOMS below) and an uninspected checkout
//                  still awaiting housekeeping — both render identically as
//                  "Closed" per 2026-08-21 decision to merge the two states.
// arriving-today→ brass/gold — matches the "arriving today" KPI card and
//                  stay-card badge. This used to clash with closed when
//                  closed was also brass; now that closed is plum, brass is
//                  free for this again.
// arriving-soon → same navy tint used for "arriving-soon" stay cards below
// vacant        → neutral gray (no matching status color exists for "nothing going on")
// Tint intensity (pale bg + deep fg + fg-at-30%-opacity border) matches the
// Summary KPI row above, rather than the solid saturated blocks used before.
const ROOM_GRID_CONFIG: Record<RoomGridStatus, { bg: string; fg: string }> = {
  vacant:          { bg: '#D9DCE3', fg: '#5B6472' },
  occupied:        { bg: '#C2DACA',  fg: T.sage },
  'checkout-today':{ bg: '#E4BDC3',  fg: T.wine },
  'closed':        { bg: '#D1C4DF',  fg: T.plum },
  'arriving-today':{ bg: '#EEDCB2', fg: T.brassDeep },
  'arriving-soon': { bg: '#BAC4D6',  fg: T.navy },
};

// Mixes a hex color toward white — used to produce the "dimmed" pastel
// version of a tile/chip's own color when the legend filter has a different
// status selected, so unselected rooms stay visible (just quiet) rather
// than disappearing from the grid.
function dimToward(hex: string, amount = 0.72): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// ─── Passport MRZ scanning ─────────────────────────────────────────────────
// Reads the whole document image via OCR (general text, not restricted to
// the MRZ charset) so it still returns something useful even on blurry or
// oddly-cropped photos. As a bonus, if a valid-looking MRZ (the two
// `<`-padded lines at the bottom of a passport bio page) is found in the
// OCR output, it's parsed into structured fields via the `mrz` library —
// but this is optional and never blocks showing the raw text.
interface OcrScanResult {
  rawText: string;
  mrzFields?: ReturnType<typeof parseMRZ>['fields'];
  mrzValid?: boolean;
  error?: string;
}

function cleanMrzLine(line: string, targetLen: number): string {
  let s = line.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '<');
  if (s.length < targetLen) s = s.padEnd(targetLen, '<');
  else if (s.length > targetLen) s = s.slice(0, targetLen);
  return s;
}

async function scanDocumentOCR(imageUrl: string): Promise<OcrScanResult> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'));
    el.src = imageUrl;
  });

  // Upscale small photos a bit for better OCR accuracy; leave already-large
  // photos as-is (further upscaling doesn't help and just slows things down).
  const scale = img.naturalWidth < 1400 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับ canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const worker = await createWorker('eng');
  let rawText = '';
  let mrzRawText = '';
  try {
    // Pass 1: whole-page general text (names, printed fields, addresses,
    // etc.) — no character whitelist, since this isn't MRZ-only content.
    const { data } = await worker.recognize(canvas);
    rawText = data.text || '';

    // Pass 2: MRZ-focused re-scan. Reading the whole page in one generic
    // pass is unreliable for the MRZ zone specifically — mixed fonts,
    // printed text, and photos elsewhere on the page hurt accuracy, and
    // guessing which 2 lines of the general output are "the MRZ" is
    // fragile (background text can accidentally look MRZ-shaped too).
    // Instead: crop to the bottom band where the MRZ always sits on a
    // passport bio page, and restrict recognition to the MRZ charset —
    // this alone is usually enough to fix most misreads.
    const mrzCropTop = Math.round(canvas.height * 0.72);
    const mrzCanvas = document.createElement('canvas');
    mrzCanvas.width = canvas.width;
    mrzCanvas.height = canvas.height - mrzCropTop;
    const mrzCtx = mrzCanvas.getContext('2d');
    if (mrzCtx && mrzCanvas.height > 0) {
      mrzCtx.imageSmoothingEnabled = true;
      mrzCtx.drawImage(canvas, 0, mrzCropTop, canvas.width, mrzCanvas.height, 0, 0, canvas.width, mrzCanvas.height);
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
        // PSM 6: "uniform block of text" — the two MRZ lines are the same
        // font/size/spacing, unlike the mixed layout of the full page.
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
      const mrzData = await worker.recognize(mrzCanvas);
      mrzRawText = mrzData.data.text || '';
    }
  } finally {
    await worker.terminate();
  }

  // Build MRZ line candidates, preferring the focused crop+whitelist pass
  // (pass 2) since it's far more reliable; fall back to guessing from the
  // full-page text (pass 1) only if the crop pass found nothing usable.
  function candidateLines(text: string): string[] {
    return text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.replace(/\s+/g, '').length >= 20);
  }

  function tryParse(lines: string[]): OcrScanResult | null {
    if (lines.length < 2) return null;
    const last2 = lines.slice(-2).map(l => cleanMrzLine(l, 44));
    try {
      const parsed = parseMRZ(last2, { autocorrect: true });
      return { rawText, mrzFields: parsed.fields, mrzValid: parsed.valid };
    } catch {
      return null;
    }
  }

  // Prefer a fully checksum-valid parse from the MRZ-focused pass; if that
  // pass parsed but failed checksum, still prefer it over pass 1 (it's
  // reading the right zone, just possibly with a misread digit) — only
  // fall back to pass 1's guess if the focused pass produced nothing at all.
  const fromMrzPass = tryParse(candidateLines(mrzRawText));
  if (fromMrzPass) return fromMrzPass;

  const fromFullPage = tryParse(candidateLines(rawText));
  if (fromFullPage) return fromFullPage;

  return { rawText };
}

function formatMrzDate(yymmdd: string | null | undefined, guessCentury: 'birth' | 'expiry'): string {
  if (!yymmdd || yymmdd.includes('<') || yymmdd.length < 6) return yymmdd || '—';
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  // Expiry dates on currently-valid documents are always in the 2000s.
  // Birth dates: assume 1900s unless that would put the person's age
  // below 0 (i.e. yy is close to the current 2-digit year or later).
  const nowYY = new Date().getFullYear() % 100;
  let century = 1900;
  if (guessCentury === 'expiry') century = 2000;
  else if (yy <= nowYY) century = 2000;
  return `${dd}/${mm}/${century + yy}`;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</div>
        <div className="text-sm font-medium truncate" style={{ color: '#fff' }}>{value || '—'}</div>
      </div>
      <button
        onClick={async () => {
          try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
        }}
        className="press flex-shrink-0 px-2 py-1 text-[11px] rounded"
        style={{ background: copied ? T.sage : 'rgba(255,255,255,0.15)', color: '#fff' }}>
        {copied ? '✓' : '📋'}
      </button>
    </div>
  );
}

function DocViewer({ docs, onClose, onDelete }: { docs: DocFile[]; onClose: () => void; onDelete: (i: number) => void | Promise<void> }) {
  const { t } = useLang();
  const [idx, setIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const doc = docs[idx];
  const isImg = doc.mimeType.startsWith('image/');

  // ── OCR scan state ────────────────────────────────────────────────────────
  const [scanOpen, setScanOpen]     = useState(false);
  const [scanning, setScanning]     = useState(false);
  const [scanResult, setScanResult] = useState<OcrScanResult | null>(null);
  const [copiedAll, setCopiedAll]   = useState(false);
  const [pasteOpen, setPasteOpen]   = useState(false);
  const [pasteText, setPasteText]   = useState('');
  const [pasteError, setPasteError] = useState('');
  useEffect(() => { setScanOpen(false); setScanResult(null); setCopiedAll(false); setPasteOpen(false); setPasteText(''); setPasteError(''); }, [idx]);

  // Parse MRZ lines the user copied themselves (e.g. via iOS Live Text —
  // long-press the passport image, select the two MRZ lines, copy, paste
  // here). Apple's on-device Vision OCR is far more accurate than
  // tesseract.js on a real phone photo, so this is the most reliable path
  // when the automatic 🔍 OCR scan doesn't come out clean.
  function handlePasteMrzSubmit() {
    setPasteError('');
    const lines = pasteText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.replace(/\s+/g, '').length >= 20);
    if (lines.length < 2) {
      setPasteError('ต้องมี 2 บรรทัดของ MRZ (บรรทัดชื่อ และบรรทัดตัวเลข)');
      return;
    }
    const last2 = lines.slice(-2).map(l => cleanMrzLine(l, 44));
    try {
      const parsed = parseMRZ(last2, { autocorrect: true });
      setScanResult({ rawText: pasteText, mrzFields: parsed.fields, mrzValid: parsed.valid });
      setScanOpen(true);
      setPasteOpen(false);
    } catch {
      setPasteError('อ่าน MRZ ที่วางไม่ได้ ลองเช็คว่าคัดลอกครบ 2 บรรทัดถูกต้อง');
    }
  }

  async function handleScanOcr() {
    setScanOpen(true);
    setScanning(true);
    setScanResult(null);
    try {
      const proxyUrl = `/api/drive-image-proxy?id=${encodeURIComponent(doc.fileId)}&sz=w1600`;
      const result = await scanDocumentOCR(proxyUrl);
      setScanResult(result);
    } catch (e) {
      setScanResult({ rawText: '', error: e instanceof Error ? e.message : 'สแกนไม่สำเร็จ' });
    } finally {
      setScanning(false);
    }
  }

  // Reset background page scroll so the fixed overlay always starts visible at the top,
  // regardless of how far down the card list was scrolled when the viewer was opened.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // Swipe/drag left/right to move between documents — pointer events cover
  // both touch (mobile) and mouse (desktop) with a single set of handlers.
  const dragStartX = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const wasDrag = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if (isImg) return; // let native text-selection dragging own the gesture
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (isImg) return; // navigate images via the ‹ › buttons instead
    if (dragStartX.current === null || dragStartY.current === null) return;
    const dx = e.clientX - dragStartX.current;
    const dy = e.clientY - dragStartY.current;
    dragStartX.current = null;
    dragStartY.current = null;
    // ignore mostly-vertical drags (scrolling) and short drags — and treat
    // these as a plain tap, which closes the viewer (see onClick below)
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) { wasDrag.current = false; return; }
    wasDrag.current = true;
    if (dx < 0) setIdx(i => Math.min(docs.length - 1, i + 1)); // swipe/drag left → next
    else        setIdx(i => Math.max(0, i - 1));               // swipe/drag right → prev
  };
  // Tapping/clicking the area (without dragging/swiping) closes the viewer,
  // like a lightbox — a genuine swipe should just change page, not close.
  // Images are the exception: a long-press-to-select-text gesture (for iOS
  // Live Text, used to copy the MRZ) also registers as a plain tap on
  // release, which would close the viewer mid-selection. So for images we
  // don't close on tap at all — the explicit ✕ button handles closing.
  const onImageAreaClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isImg) return;
    if (!wasDrag.current) onClose();
  };

  // Magic Mouse / trackpad horizontal swipe fires as wheel events with deltaX.
  // React's onWheel is passive (can't preventDefault), and on macOS a horizontal
  // swipe also triggers the browser's own "swipe to go back/forward" page
  // navigation — so we attach a native, non-passive listener and call
  // preventDefault on any clearly-horizontal swipe to stop that from firing.
  const wheelLocked = useRef(false);
  const viewerAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = viewerAreaRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return; // mostly-vertical scroll, let it through
      e.preventDefault(); // stop macOS swipe-navigation from hijacking this
      if (Math.abs(e.deltaX) < 12 || wheelLocked.current) return;
      wheelLocked.current = true;
      if (e.deltaX > 0) setIdx(i => Math.min(docs.length - 1, i + 1)); // swipe left → next
      else              setIdx(i => Math.max(0, i - 1));               // swipe right → prev
      setTimeout(() => { wheelLocked.current = false; }, 400);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [docs.length]);

  if (!doc) return null;
  const isPdf = doc.mimeType === 'application/pdf';
  // drive.google.com/uc?export=download forces a download instead of rendering —
  // use the thumbnail endpoint for inline display, keep downloadUrl for the download button.
  const displayUrl = `https://drive.google.com/thumbnail?id=${doc.fileId}&sz=w1600`;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col" onClick={onClose}>
      <div className="f-thai flex items-center gap-2 px-4 py-3 text-white" style={{ background: T.navyDeep }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto">
          <span className="text-sm font-semibold truncate flex-shrink-0">{doc.fileName}</span>
          <span className="text-xs flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>{new Date(doc.uploadedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
          {docs.length > 1 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => setIdx(i => Math.max(0, i - 1))} className="press px-2 py-1 text-xs rounded disabled:opacity-30" style={{ background: 'rgba(255,255,255,0.1)' }} disabled={idx === 0}>‹</button>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{idx + 1}/{docs.length}</span>
              <button onClick={() => setIdx(i => Math.min(docs.length - 1, i + 1))} className="press px-2 py-1 text-xs rounded disabled:opacity-30" style={{ background: 'rgba(255,255,255,0.1)' }} disabled={idx === docs.length - 1}>›</button>
            </div>
          )}
          {isImg && (
            <button onClick={handleScanOcr} disabled={scanning}
              className="press f-thai flex-shrink-0 px-2 py-1 text-xs rounded disabled:opacity-60" style={{ background: T.sage, color: '#fff' }}>
              {scanning ? '⏳ กำลังสแกน…' : '🔍 OCR'}
            </button>
          )}
          {isImg && (
            <button onClick={() => { setPasteOpen(o => !o); setScanOpen(false); }}
              className="press f-thai flex-shrink-0 px-2 py-1 text-xs rounded" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
              title="แตะค้างที่รูปด้านล่างเพื่อใช้ Live Text ของ iPhone คัดลอก MRZ แล้ววางที่นี่">
              📋 วาง MRZ
            </button>
          )}
          <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="press flex-shrink-0 px-2 py-1 text-xs rounded" style={{ background: T.brass, color: T.navyDeep }}>⬇ {t('ci_download')}</a>
          <button disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              try { await onDelete(idx); if (idx >= docs.length - 1) setIdx(Math.max(0, idx - 1)); }
              finally { setDeleting(false); }
            }}
            className="press flex-shrink-0 px-2 py-1 text-xs rounded disabled:opacity-50" style={{ background: T.wine, color: '#fff' }}>
            {deleting ? '…' : '🗑'}
          </button>
        </div>
        {/* Always visible, never pushed off-screen by the scrollable strip above */}
        <button onClick={onClose} className="press flex-shrink-0 px-2 py-1 text-xs rounded" style={{ background: 'rgba(255,255,255,0.15)' }}>✕</button>
      </div>
      <div ref={viewerAreaRef} className="flex-1 overflow-auto flex items-start justify-center p-4" onClick={onImageAreaClick} onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ touchAction: isImg ? 'auto' : 'pan-y', cursor: !isImg && docs.length > 1 ? 'ew-resize' : 'auto' }}>
        {isImg && <img src={displayUrl} alt={doc.fileName} className="max-w-full max-h-full object-contain rounded shadow-lg" />}
        {isPdf && <iframe src={`/api/drive-file-proxy?id=${encodeURIComponent(doc.fileId)}`} className="w-full h-full rounded" style={{ background: '#fff' }} title={doc.fileName} />}
        {!isImg && !isPdf && (
          <div className="f-thai rounded-xl p-8 text-center" style={{ background: T.card, color: T.inkSoft }}>
            <div className="text-4xl mb-3">📄</div>
            <div className="font-semibold mb-1" style={{ color: T.ink }}>{doc.fileName}</div>
            <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="underline text-sm" style={{ color: T.navy }}>{t('ci_click_download')}</a>
          </div>
        )}
      </div>

      {/* Paste MRZ (from iOS Live Text) */}
      {pasteOpen && (
        <div className="f-thai px-4 py-3" style={{ background: T.navyDeep }} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: T.brass }}>📋 วาง MRZ จาก Live Text</span>
            <button onClick={() => setPasteOpen(false)} className="press px-2 py-0.5 text-xs rounded" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>ปิด</button>
          </div>
          <div className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
            แตะค้างที่รูปพาสปอร์ตด้านบน → เลือก 2 บรรทัดล่างสุด (MRZ) → คัดลอก → วางที่นี่
          </div>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
            placeholder={'P<USADUNLOP<<GREGORY<KEVIN<<<<<<<<<<<<<<<<<<\nA624806749USA9204269M3503236118591076<905554'}
            className="w-full text-xs rounded-lg p-2 mb-2" rows={3}
            style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }} />
          {pasteError && <div className="text-xs mb-2" style={{ color: T.brass }}>⚠️ {pasteError}</div>}
          <button onClick={handlePasteMrzSubmit} disabled={!pasteText.trim()}
            className="press f-thai px-3 py-1.5 text-xs rounded disabled:opacity-40" style={{ background: T.sage, color: '#fff' }}>
            แปลงข้อมูล
          </button>
        </div>
      )}

      {/* OCR scan results */}
      {scanOpen && (
        <div className="f-thai px-4 py-3 max-h-[45vh] overflow-auto" style={{ background: T.navyDeep }} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: T.brass }}>🔍 ผลสแกน OCR</span>
            <button onClick={() => setScanOpen(false)} className="press px-2 py-0.5 text-xs rounded" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>ปิด</button>
          </div>
          {scanning && <div className="text-sm py-4 text-center" style={{ color: 'rgba(255,255,255,0.7)' }}>⏳ กำลังอ่านตัวหนังสือ...</div>}
          {!scanning && scanResult?.error && (
            <div className="text-sm py-2" style={{ color: T.brass }}>⚠️ {scanResult.error}</div>
          )}
          {!scanning && scanResult && !scanResult.error && (
            <div>
              {/* Bonus: structured MRZ fields, only shown if a passport MRZ was detected */}
              {scanResult.mrzFields && (
                <div className="mb-3">
                  <div className="text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    🛂 ตรวจพบแถบ MRZ {scanResult.mrzValid ? '' : '— ⚠️ checksum บางช่องไม่ผ่าน ตรวจสอบก่อนใช้'}
                  </div>
                  <CopyField label="ชื่อ-นามสกุล" value={`${scanResult.mrzFields.firstName || ''} ${scanResult.mrzFields.lastName || ''}`.replace(/</g, ' ').replace(/\s+/g, ' ').trim()} />
                  <CopyField label="เลขพาสปอร์ต" value={(scanResult.mrzFields.documentNumber || '').replace(/</g, '')} />
                  <CopyField label="สัญชาติ" value={scanResult.mrzFields.nationality || ''} />
                  <CopyField label="วันเกิด" value={formatMrzDate(scanResult.mrzFields.birthDate, 'birth')} />
                  <CopyField label="เพศ" value={scanResult.mrzFields.sex === 'male' ? 'ชาย (M)' : scanResult.mrzFields.sex === 'female' ? 'หญิง (F)' : (scanResult.mrzFields.sex || '')} />
                  <CopyField label="วันหมดอายุ" value={formatMrzDate(scanResult.mrzFields.expirationDate, 'expiry')} />
                  <CopyField label="ประเทศที่ออกเอกสาร" value={scanResult.mrzFields.issuingState || ''} />
                </div>
              )}
              {/* Primary result: raw OCR text of the whole document */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>ข้อความที่อ่านได้ทั้งหมด</span>
                <button
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(scanResult.rawText); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500); } catch { /* clipboard unavailable */ }
                  }}
                  className="press px-2 py-1 text-[11px] rounded"
                  style={{ background: copiedAll ? T.sage : 'rgba(255,255,255,0.15)', color: '#fff' }}>
                  {copiedAll ? '✓ คัดลอกแล้ว' : '📋 คัดลอกทั้งหมด'}
                </button>
              </div>
              <textarea readOnly value={scanResult.rawText}
                className="w-full text-xs rounded-lg p-2"
                rows={8}
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export type CheckInOutHandle = { refresh: () => void };
export type CheckInOutProps = {
  // ISO 'YYYY-MM-DD'. When omitted (or invalid), the view uses the real
  // current date. When set to a different date, the whole Room Status view
  // (KPI cards, legend counts, room grid, stay list, no-show detection)
  // recalculates as if that date were "today" — a read-only preview.
  // Actions that write real state (check-in, checkout, cancel, extend) stay
  // disabled unless the value equals the real today, since those represent
  // real-world events and must not be backdated/forward-dated by mistake.
  viewDate?: string;
  // Called when the user wants to jump the shared header date back to the
  // real today (e.g. the preview banner's "back to today" button). Omitted
  // in contexts where the date isn't controllable from here.
  onViewDateChange?: (date: string) => void;
};

const CheckInOut = forwardRef<CheckInOutHandle, CheckInOutProps>(function CheckInOut({ viewDate, onViewDateChange }, ref) {
  const { t } = useLang();
  const realToday = today();
  const isValidIsoDate = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const refDate = isValidIsoDate(viewDate) ? viewDate! : realToday;
  const isViewingToday = refDate === realToday;
  const [stays, setStays]           = useState<Stay[]>([]);
  // Every row from the sheet, unfiltered by the 5-day arrival window — kept
  // separately so the manual search/cancel panel can find and cancel any
  // booking regardless of check-in date, not just ones arriving soon.
  const [allStaysRaw, setAllStaysRaw] = useState<Array<{ room: string; guest: string; checkin: string; checkout: string; channel: string; resId: string; note: string }>>([]);
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  // The raw row the admin tapped in manual search results — while set, we show
  // its full booking card (same as the room-status grid cards) instead of the list.
  const [manualSearchSelected, setManualSearchSelected] = useState<{ room: string; guest: string; checkin: string; checkout: string; channel: string; resId: string; note: string } | null>(null);
  const [coStatus, setCoStatus]     = useState<Record<string, CheckoutStatus>>({});
  // Latest checkout-log entry per room (by log date), regardless of whether
  // the booking it belongs to is still in the date-windowed `stays` list.
  // Lets a blocked/damaged room keep showing "needs cleaning" even after its
  // checkout date has aged out of the stays list.
  const [latestCoByRoom, setLatestCoByRoom] = useState<Record<string, CheckoutStatus>>({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [view, setView]             = useState<'all' | 'checkedin' | 'arrivals' | 'checkouts'>('all');
  // Room-status grid legend filter — clicking a legend chip highlights only
  // that status's tiles (full color) and dims every other tile to a pastel
  // tint, rather than hiding rooms outright. null = no filter, all tiles at
  // full color. Click the active chip again (or "clear") to reset.
  const [gridFilter, setGridFilter] = useState<RoomGridStatus | null>(null);
  const [lastRefresh, setLastRefresh] = useState('');
  // Docs keyed by cardKey (resId or roomNum+checkin) — mirrors the Drive folder name "{room}_{checkin}_{resId}"
  const [docs, setDocs]             = useState<Record<string, DocFile[]>>({});
  const [docsLoading, setDocsLoading] = useState(true);
  const [viewerKey, setViewerKey]   = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [noteModal, setNoteModal]       = useState<{ resId: string; room: string; guest: string; checkin: string; checkout: string; current: string; status: string } | null>(null);
  const [noteText, setNoteText]         = useState('');
  const [noteSaving, setNoteSaving]     = useState(false);
  const [toast, setToast]               = useState('');

  // ── Check-in / No-show / Cancel state (keyed by resId) ──────────────────
  const [ciDoneSet,    setCiDoneSet]    = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ci_done')   || '[]')); } catch { return new Set(); }
  });
  const [cancelledSet, setCancelledSet] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ci_cancel') || '[]')); } catch { return new Set(); }
  });
  const [cancelModal,   setCancelModal]   = useState<Stay | null>(null);
  const [cancelSaving,  setCancelSaving]  = useState(false);

  // ── Early checkout state ─────────────────────────────────────────────────
  const [checkedOutSet,  setCheckedOutSet]  = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ci_checkout') || '[]')); } catch { return new Set(); }
  });
  const [checkoutModal,  setCheckoutModal]  = useState<Stay | null>(null);
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [checkoutArmed,  setCheckoutArmed]  = useState(false);
  // แก้ไข/ต่อพัก — สำหรับกรณี Little Hotelier เปลี่ยนวันเช็คเอาท์แล้วแต่ไม่ส่งอีเมล
  // แจ้ง (ระบบ auto-sync จากอีเมลเลยไม่รู้) ต้องแก้มือผ่านหน้านี้แทน
  const [extendModal,   setExtendModal]     = useState<Stay | null>(null);
  const [extendDate,    setExtendDate]      = useState('');
  const [extendSaving,  setExtendSaving]    = useState(false);
  const [extendError,   setExtendError]     = useState('');

  // ── Room-status grid: refs to each rendered card (for scroll/highlight) ──
  const roomCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  async function markCheckedIn(resId: string) {
    // Optimistic local update so the UI feels instant on this device.
    const next = new Set(ciDoneSet).add(resId);
    setCiDoneSet(next);
    localStorage.setItem('ci_done', JSON.stringify([...next]));
    showToast(`✅ ${t('ci_checked_in_toast')}`);

    // Persist to the shared sheet so OTHER devices (e.g. the admin's own
    // phone/PC) see the check-in too — previously this only lived in
    // this browser's localStorage and never synced anywhere.
    try {
      await fetch(GAS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markCheckedIn', resId }),
      });
    } catch {
      showToast(`⚠️ ${t('ci_save_failed')}`);
    }
  }

  async function confirmCancel(s: Stay) {
    setCancelSaving(true);
    try {
      const r = await fetch(`/api/gas-proxy?app=todo&action=cancelBooking&id=${encodeURIComponent(s.resId)}`);
      let j: { ok?: boolean; error?: string } = {};
      try { j = await r.json(); } catch { /* non-JSON */ }
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      const next = new Set(cancelledSet).add(s.resId);
      setCancelledSet(next);
      localStorage.setItem('ci_cancel', JSON.stringify([...next]));
      showToast(`🚫 ${t('ci_cancel_booking_done')}`);
    } catch {
      showToast(`❌ ${t('ci_save_failed')}`);
    } finally {
      setCancelSaving(false);
    }
  }
  async function confirmCheckout(s: Stay) {
    setCheckoutSaving(true);
    try {
      const newCheckout = today();
      const r = await fetch(GAS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'earlyCheckout', resId: s.resId, isEarly: true, newCheckout }),
      });
      let j: { ok?: boolean; error?: string; apartmenterySynced?: boolean; apartmenteryNote?: string; dateUnchanged?: boolean } = {};
      try { j = await r.json(); } catch { /* non-JSON */ }
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      const next = new Set(checkedOutSet).add(s.resId);
      setCheckedOutSet(next);
      localStorage.setItem('ci_checkout', JSON.stringify([...next]));
      if (j.apartmenterySynced || j.dateUnchanged) {
        showToast(`🧳 ${t('ci_checkout_early')}`);
      } else {
        // Same diagnostic pattern as the extend-date flow — don't say
        // "done" when Apartmentery wasn't actually touched, or the next
        // sign anyone gets is a same-day-turnover collision days later.
        setToast(`🧳 ${t('ci_checkout_early')} — ${apartmenteryNoteTH_(j.apartmenteryNote)}`);
        setTimeout(() => setToast(''), 6000);
      }
    } catch {
      showToast(`❌ ${t('ci_save_failed')}`);
    } finally {
      setCheckoutSaving(false);
    }
  }

  // ── Auto checkout on inspection ──────────────────────────────────────────
  // A stay whose checkout is today and whose room has already been inspected
  // (co.inspected === true) is auto-flipped to "checked out" — no manual
  // button needed for on-time checkouts. inFlightRef guards against firing
  // twice while the request for the same resId is still pending (data
  // reloads / re-renders shouldn't cause duplicate server writes).
  const autoCheckoutInFlight = useRef<Set<string>>(new Set());
  async function autoMarkCheckedOut(s: Stay) {
    if (!s.resId) { console.warn('[auto-checkout] skipped — stay has no resId, cannot match on server', s); return; }
    if (checkedOutSet.has(s.resId) || autoCheckoutInFlight.current.has(s.resId)) return;
    autoCheckoutInFlight.current.add(s.resId);
    try {
      const r = await fetch(GAS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'earlyCheckout', resId: s.resId, isEarly: false, newCheckout: s.checkout }),
      });
      const text = await r.text();
      let j: { ok?: boolean; error?: string; apartmenterySynced?: boolean; apartmenteryNote?: string; dateUnchanged?: boolean } = {};
      try { j = JSON.parse(text); } catch { /* non-JSON */ }
      console.log('[auto-checkout] response for', s.resId, r.status, text);
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}: ${text.slice(0, 200)}`);
      const next = new Set(checkedOutSet).add(s.resId);
      setCheckedOutSet(next);
      localStorage.setItem('ci_checkout', JSON.stringify([...next]));
      if (j.apartmenterySynced || j.dateUnchanged) {
        showToast(`🧳 ห้อง ${s.roomNum} ${t('ci_checked_out_done')}`);
      } else {
        setToast(`🧳 ห้อง ${s.roomNum} ${t('ci_checked_out_done')} — ${apartmenteryNoteTH_(j.apartmenteryNote)}`);
        setTimeout(() => setToast(''), 6000);
      }
    } catch (e) {
      console.error('[auto-checkout] failed for', s.resId, e);
    } finally {
      autoCheckoutInFlight.current.delete(s.resId);
    }
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadCtxRef = useRef<{ key: string; room: string; checkin: string; resId: string } | null>(null);

  function folderKey(room: string, checkin: string, resId: string): string {
    return `${room}_${checkin}_${resId || 'noid'}`;
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  function openNoteModal(s: Stay) {
    setNoteModal({ resId: s.resId, room: s.roomNum, guest: s.guest, checkin: s.checkin, checkout: s.checkout, current: s.note, status: s.status });
    setNoteText(s.note || '');
  }

  async function saveNote() {
    if (!noteModal) return;
    setNoteSaving(true);
    const { resId, room, guest, checkin, checkout, status } = noteModal;
    const text = noteText; // capture before any state change
    // Rooms that are only "arriving soon" (not checking in today) shouldn't
    // ping the maid group right away — the note just needs to be in Sheet1
    // so it rides along with the regular 19:00 daily maid summary instead.
    const isArrivingSoon = status === 'arriving-soon';
    try {
      // 1. Write to GAS Sheet1
      const r = await fetch(`/api/gas-proxy?app=todo&action=setNote&id=${encodeURIComponent(resId)}&note=${encodeURIComponent(text)}`);
      let j: { ok?: boolean; error?: string } = {};
      let rawText = '';
      try { rawText = await r.text(); j = JSON.parse(rawText); } catch { /* non-JSON */ }
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);

      // 2. Close modal + update UI
      setNoteModal(null);
      setNoteText('');
      setStays(prev => prev.map(x => x.resId === resId ? { ...x, note: text } : x));

      // 3. Push LINE — skip for arriving-soon; it'll go out with the 19:00 summary
      if (isArrivingSoon) {
        showToast(t('ci_note_saved_pending_line'));
      } else {
        fetch('/api/maid-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resId, room, guest, checkin, checkout, note: text }),
          })
          .then(r => r.json().catch(() => ({} as { ok?: boolean; error?: string })))
            .then(j => {
              if (j.ok === false) showToast(t('ci_note_saved_line_warn') + (j.error || 'error'));
              else showToast(t('ci_note_saved_line_ok'));
            })
            .catch(e => showToast(t('ci_note_saved_line_warn') + String(e)));
      }
    } catch (e) {
      showToast(t('ci_save_failed_colon') + String(e));
    } finally {
      setNoteSaving(false);
    }
  }

  function openExtendModal(s: Stay) {
    setExtendModal(s);
    setExtendDate(s.checkout);
    setExtendError('');
  }

  async function saveExtend() {
    if (!extendModal) return;
    const { resId, roomNum: room, guest, checkin, checkout: oldCheckout, status: extendStatus } = extendModal;
    if (!extendDate || extendDate === oldCheckout) { setExtendError(t('ci_extend_pick_diff_date')); return; }
    setExtendSaving(true);
    setExtendError('');
    try {
      // 1. Write new checkout date to Sheet1 (+ Apartmentery sync if possible)
      const r = await fetch(GAS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateCheckout', resId, newCheckout: extendDate }),
      });
      let j: { ok?: boolean; error?: string; conflict?: { guest: string; checkin: string }; apartmenterySynced?: boolean; apartmenteryNote?: string } = {};
      try { j = await r.json(); } catch { /* non-JSON */ }
      if (!r.ok || j.ok === false) {
        if (j.error === 'conflict' && j.conflict) {
          setExtendError(`${t('ci_extend_conflict')} — ${j.conflict.guest} (${j.conflict.checkin})`);
        } else {
          setExtendError(j.error || `HTTP ${r.status}`);
        }
        setExtendSaving(false);
        return;
      }

      // 2. Update local UI immediately
      setStays(prev => prev.map(x => x.resId === resId ? { ...x, checkout: extendDate } : x));
      setExtendModal(null);
      if (j.apartmenterySynced) {
        showToast(`🗓️ บันทึกวันเช็คเอาท์ใหม่แล้ว ซิงก์ Apartmentery เรียบร้อย`);
      } else {
        // Surface the *actual* reason instead of a generic "not synced" —
        // common cases: booking not yet created on apartmentery (next
        // hourly automation run will pick up the new date automatically),
        // apartmentery session expired (needs manual re-login), or some
        // other apartmentery-side error. Translated to plain Thai so it's
        // actually readable, not the raw GAS debug string. Longer duration
        // since this is diagnostic text, not a quick confirmation.
        setToast(`🗓️ บันทึกวันเช็คเอาท์ใหม่แล้ว — ${apartmenteryNoteTH_(j.apartmenteryNote)}`);
        setTimeout(() => setToast(''), 6000);
      }

      // 3. Notify maid group via LINE — only for cards checking out today.
      //    A "checked-in" card extending its stay doesn't need an immediate
      //    ping; the regular 19:00 daily maid summary already covers it.
      if (extendStatus === 'checking-out-today') {
        fetch('/api/maid-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resId, room, guest, checkin, checkout: extendDate,
            note: extendLineNote_(oldCheckout, extendDate),
          }),
        }).catch(() => { /* non-fatal — date is already saved */ });
      }
    } catch (e) {
      setExtendError(String(e));
    } finally {
      setExtendSaving(false);
    }
  }

  async function refreshDocs() {
    setDocsLoading(true);
    try { setDocs(await fetchAllDocsIndex()); }
    catch { /* non-fatal — docs panel just stays empty */ }
    finally { setDocsLoading(false); }
  }

  function handleUploadClick(room: string, checkin: string, resId: string) {
    uploadCtxRef.current = { key: folderKey(room, checkin, resId), room, checkin, resId };
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const ctx = uploadCtxRef.current;
    e.target.value = '';
    if (!files.length || !ctx) return;
    setUploadingFor(ctx.key);
    try {
      for (const file of files) {
        const uploaded = await uploadDocToDrive(ctx.room, ctx.checkin, ctx.resId, file);
        if (uploaded) {
          setDocs(prev => ({ ...prev, [ctx.key]: [...(prev[ctx.key] || []), uploaded] }));
        }
      }
    } catch (err) {
      alert(t('ci_upload_failed_colon') + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploadingFor(null);
    }
  }

  async function deleteDoc(cardKey: string, idx: number) {
    const doc = (docs[cardKey] || [])[idx];
    if (!doc) return;
    await deleteDocFromDrive(doc.fileId);
    setDocs(prev => {
      const arr = [...(prev[cardKey] || [])];
      arr.splice(idx, 1);
      const next = arr.length ? { ...prev, [cardKey]: arr } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== cardKey));
      return next;
    });
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${GAS_API}&action=getRoomStatus&_ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(t('ci_load_room_failed'));
      const json: { today: string; stays: Array<{ room: string; guest: string; checkin: string; checkout: string; channel: string; resId: string; note: string; checkedInAt?: string; checkedOutAt?: string }> } = await res.json();
      if (!Array.isArray(json.stays)) throw new Error(t('ci_invalid_data_format'));

      setAllStaysRaw(json.stays.map(row => ({
        room:     row.room || '',
        guest:    row.guest || '',
        checkin:  (row.checkin || '').substring(0, 10),
        checkout: (row.checkout || '').substring(0, 10),
        channel:  row.channel || '',
        resId:    row.resId || '',
        note:     row.note || '',
      })));

      // Merge server-side (shared) check-in/checkout status into local sets.
      // This is the source of truth across devices; localStorage is only an
      // optimistic cache for this browser between refreshes.
      const serverCheckedIn = new Set<string>();
      const serverCheckedOut = new Set<string>();
      const seenResIds = new Set<string>();
      for (const row of json.stays) {
        if (!row.resId) continue;
        seenResIds.add(row.resId);
        if (row.checkedInAt)  serverCheckedIn.add(row.resId);
        if (row.checkedOutAt) serverCheckedOut.add(row.resId);
      }
      // Preserve local-only optimistic state for resIds not present in this
      // payload (e.g. just updated on this device); for resIds the server
      // DOES report on, the server value wins — so clearing a cell in the
      // sheet actually reverts the card instead of being stuck on the old
      // locally-cached value forever.
      for (const id of ciDoneSet)     if (!seenResIds.has(id)) serverCheckedIn.add(id);
      for (const id of checkedOutSet) if (!seenResIds.has(id)) serverCheckedOut.add(id);
      setCiDoneSet(serverCheckedIn);
      setCheckedOutSet(serverCheckedOut);
      localStorage.setItem('ci_done', JSON.stringify([...serverCheckedIn]));
      localStorage.setItem('ci_checkout', JSON.stringify([...serverCheckedOut]));

      const tod = refDate;
      const soon = addDays(tod, 5);
      const list: Stay[] = [];

      for (const row of json.stays) {
        // ข้ามแถวที่ถูกยกเลิกแล้ว (getRoomStatus_() ส่ง room string ดิบมา
        // เช่น "203 ยกเลิก" โดยไม่กรองทิ้ง) — ไม่งั้นการ์ด arriving-soon /
        // arriving-today / room-grid จะยังโผล่ทั้งที่ cancelBooking_() (manual
        // หรือ auto จาก CancellationEmailWatcher.gs) อัปเดต Sheet1 ไปแล้ว.
        // ใช้ pattern เดียวกับ isCxl เช็คที่ manual-search panel ด้านล่าง.
        if (/ยกเลิก|cancel/i.test(row.room || '')) continue;
        const ciStr = (row.checkin || '').substring(0, 10);
        const coStr = (row.checkout || '').substring(0, 10);
        if (!ciStr || !coStr) continue;

        const daysUntil = diffDays(tod, ciStr);
        const daysLeft  = diffDays(tod, coStr);

        const checkedIn        = ciStr <= tod && coStr > tod;
        const arrivingToday    = ciStr === tod;
        const checkingOutToday = coStr === tod && ciStr < tod;
        const arrivingSoon     = ciStr > tod && ciStr <= soon;

        if (!checkedIn && !arrivingSoon && !checkingOutToday) continue;

        let status: Stay['status'] = 'checked-in';
        if (arrivingToday)        status = 'arriving-today';
        else if (checkingOutToday) status = 'checking-out-today';
        else if (arrivingSoon)    status = 'arriving-soon';

        list.push({
          room:     row.room || '',
          roomNum:  roomNum(row.room || ''),
          guest:    row.guest || '',
          checkin:  ciStr,
          checkout: coStr,
          channel:  row.channel || '',
          resId:    row.resId || '',
          note:     row.note || '',
          nights:   diffDays(ciStr, coStr),
          status,
          daysLeft,
          daysUntil,
        });
      }

      const ORDER = { 'checking-out-today': 0, 'arriving-today': 1, 'checked-in': 2, 'arriving-soon': 3 };
      list.sort((a, b) => {
        const od = ORDER[a.status] - ORDER[b.status];
        return od !== 0 ? od : a.checkout.localeCompare(b.checkout);
      });
      setStays(list);
      setLastRefresh(new Date().toLocaleTimeString('en-GB'));

      // Checkout log
      try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${CHECKOUT_LOG_ID}/export?format=csv&gid=${CHECKOUT_GID}`;
        const cr = await fetch(csvUrl);
        if (cr.ok) {
          const csv = await cr.text();
          // Proper CSV parser - handles quoted fields with commas inside
          const parseCSV = (text: string): string[][] => {
            const result: string[][] = [];
            const lines = text.split(/\r?\n/);
            for (const line of lines) {
              if (!line.trim()) continue;
              const row: string[] = [];
              let cur = ''; let inQ = false;
              for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                  if (inQ && line[i+1] === '"') { cur += '"'; i++; }
                  else inQ = !inQ;
                } else if (ch === ',' && !inQ) {
                  row.push(cur.trim()); cur = '';
                } else { cur += ch; }
              }
              row.push(cur.trim());
              result.push(row);
            }
            return result;
          };
          const rows = parseCSV(csv);
          const h = rows[0];
          // Raw_Checkout_Log columns:
          // UID(0) Date(1) Time(2) Inspector(3) Maid(4) Room(5) OTA(6) Guest(7)
          // Status(8) Ready(9) Issues(10) Damages(11) Charge(12) ChargeNote(13)
          // ElecUnit(14) ElecTHB(15) LateCheckout(16) Repairs(17) ExtraNote(18)
          // DriveLinks(19) Timestamp(20) JSON(21)
          const iDate      = h.indexOf('Date');
          const iInspector = h.indexOf('Inspector');
          const iMaid      = h.indexOf('Maid');
          const iRoom      = h.indexOf('Room');
          const iStatus    = h.indexOf('Status');
          const iReady     = h.indexOf('Ready');
          const iIssues    = h.indexOf('Issues');

          // Build list of all log records, lookup by room+booking window later
          const allLogs: CheckoutStatus[] = [];
          for (const row of rows.slice(1)) {
            const rawRoom = iRoom >= 0 ? row[iRoom] : row[4];
            const rm = roomNum(rawRoom || '');
            if (!rm) continue;
            const date   = iDate >= 0 ? (row[iDate] || '') : '';
            const status = iStatus >= 0 ? (row[iStatus] || '') : '';
            const ready  = iReady  >= 0 ? (row[iReady]  || '') : '';
            // Block/major-issue rooms must never be treated as inspected,
            // even if the Ready column happens to also be set — a blocked
            // room is never ready for sale regardless of what else is logged.
            const isBlockedOrMajor = status !== '' && ['major', 'block'].includes(status.toLowerCase());
            // "พร้อม" is a substring of "ไม่พร้อม" ("not ready"), so a plain
            // .includes('พร้อม') check wrongly matched "ยังไม่พร้อม" too.
            // Require the positive word without a preceding "ไม่".
            const readyPositive = /พร้อม/.test(ready) && !/ไม่พร้อม/.test(ready);
            const inspected = isBlockedOrMajor
              ? false
              : (status !== '' || readyPositive);
            allLogs.push({
              room: rm,
              inspected,
              inspectedBy: iInspector >= 0 ? (row[iInspector] || '') : '',
              cleanedBy:   iMaid >= 0 ? (row[iMaid] || '') : '',
              issues:      iIssues >= 0 ? (row[iIssues] || '') : '',
              date,
            });
          }
          // map key = roomNum_checkin_checkout for booking-window matching
          const map: Record<string, CheckoutStatus> = {};
          for (const log of allLogs) {
            // key by room+date so stays can look up by their window
            const key = `${log.room}_${log.date}`;
            map[key] = log;
          }
          setCoStatus(map);

          // Most recent log per room (by date string, ISO-sortable), used as
          // a fallback for rooms whose checkout has aged out of `stays`.
          const latestPerRoom: Record<string, CheckoutStatus> = {};
          for (const log of allLogs) {
            const cur = latestPerRoom[log.room];
            if (!cur || log.date > cur.date) latestPerRoom[log.room] = log;
          }
          setLatestCoByRoom(latestPerRoom);
        }
      } catch (_) { /* optional */ }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('ci_load_failed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshDocs(); }, []);
  // Re-fetch/reclassify whenever the previewed date changes (including the
  // initial mount, where refDate === realToday).
  useEffect(() => { load(); }, [refDate]);

  useImperativeHandle(ref, () => ({
    refresh: () => { load(); refreshDocs(); }
  }));

  // Whenever stays or the housekeeping/inspection log update, sweep today's
  // checkouts and flip any that are inspected but not yet marked checked out.
  useEffect(() => {
    for (const s of stays) {
      if (s.status !== 'checking-out-today') continue;
      if (checkedOutSet.has(s.resId)) continue;
      const co = findCoForStay(s, coStatus);
      console.log('[auto-checkout] checking', s.roomNum, s.resId, 'inspected=', co?.inspected, co);
      if (co?.inspected) autoMarkCheckedOut(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stays, coStatus, checkedOutSet]);

  // ── Single source of truth for "is this stay physically in-house right
  // now" ───────────────────────────────────────────────────────────────────
  // A stay counts as in-house if its status is 'checked-in', OR it's a
  // same-day arrival that staff have already checked in (ciDoneSet) even
  // though the status field hasn't flipped to 'checked-in' yet — unless it
  // was subsequently checked out or cancelled. This is the exact rule the
  // room-status grid uses to color a tile green; every other "in hotel"
  // count (KPI card, filter-tab count, filtered list) must use the same
  // rule or the numbers will drift apart, as they did before this fix.
  const isInHouse = (s: Stay) => {
    if (cancelledSet.has(s.resId))  return false;
    if (checkedOutSet.has(s.resId)) return false;
    const isCheckedInEarly = s.status === 'arriving-today' && ciDoneSet.has(s.resId);
    return s.status === 'checked-in' || isCheckedInEarly;
  };

  const filtered = stays.filter(s => {
    if (view === 'checkedin')  return isInHouse(s);
    if (view === 'arrivals')   return s.status === 'arriving-today' || s.status === 'arriving-soon';
    if (view === 'checkouts')  return s.status === 'checking-out-today';
    return true;
  });

  const counts = {
    checkedin:  stays.filter(isInHouse).length,
    arrivals:   stays.filter(s => s.status === 'arriving-today' || s.status === 'arriving-soon').length,
    checkouts:  stays.filter(s => s.status === 'checking-out-today').length,
    today_ci:   stays.filter(s => s.status === 'arriving-today').length,
  };

  // KPI summary cards only cover this property's 10 rooms — the underlying
  // sheet can contain stays for other properties (e.g. room 363 "MyCondo")
  // that still render as normal cards below via `counts`/`filtered`, but
  // shouldn't skew the top KPI totals.
  const loftRoomNums = new Set(ROOM_LIST.map(r => r.num));
  const loftStays = stays.filter(s => loftRoomNums.has(s.roomNum));
  const kpiCounts = {
    checkedin:  loftStays.filter(isInHouse).length,
    arrivals:   loftStays.filter(s => s.status === 'arriving-today' || s.status === 'arriving-soon').length,
    checkouts:  loftStays.filter(s => s.status === 'checking-out-today').length,
    today_ci:   loftStays.filter(s => s.status === 'arriving-today').length,
  };

  // ── Room-status grid: derive live status for every physical room ────────
  // Scans `stays` (always the full, unfiltered set) so the grid stays
  // accurate regardless of which filter tab is active. Priority when a room
  // has multiple relevant records: occupied > checkout-today > needs-cleaning
  // > vacant. `targetKey` is the cardKey of the stay that explains the
  // status, used to scroll to that exact card when the tile is clicked.
  const roomGrid = ROOM_LIST.map(room => {
    const roomStays = stays.filter(s => s.roomNum === room.num && !cancelledSet.has(s.resId));

    // Rank, not sequential overwrite — so stay iteration order can never
    // let a lower-priority status (e.g. arriving-soon) stick after a
    // higher-priority one (e.g. needs-cleaning) is found later in the loop.
    const RANK: Record<RoomGridStatus, number> = {
      vacant: 0, 'arriving-soon': 1, 'arriving-today': 2, 'closed': 3, 'checkout-today': 4, occupied: 5,
    };
    let status: RoomGridStatus = 'vacant';
    let targetKey: string | null = null;
    // Every status this room touches across ALL its stays this loop finds —
    // not just the top-ranked one. A room showing "occupied" (current guest)
    // can still have a future stay that's "arriving-soon"; that booking is
    // invisible on the tile normally, but the legend filter below needs to
    // find it when the person clicks "Arriving soon", so we keep a target
    // key per secondary status too (for the click-through).
    const secondaryTargets: Partial<Record<RoomGridStatus, string>> = {};

    for (const s of roomStays) {
      const isCheckedOut = checkedOutSet.has(s.resId);
      const inHouse = isInHouse(s);
      let candidate: RoomGridStatus | null = null;

      if (inHouse) {
        candidate = 'occupied';
      } else if (s.status === 'checking-out-today' && !isCheckedOut) {
        candidate = 'checkout-today';
      } else if (isCheckedOut) {
        const co = findCoForStay(s, coStatus);
        if (!co?.inspected) candidate = 'closed';
      } else if (s.status === 'arriving-today') {
        candidate = 'arriving-today';
      } else if (s.status === 'arriving-soon') {
        candidate = 'arriving-soon';
      }

      if (candidate) {
        secondaryTargets[candidate] = folderKey(s.roomNum, s.checkin, s.resId);
        if (RANK[candidate] > RANK[status]) {
          status = candidate;
          targetKey = folderKey(s.roomNum, s.checkin, s.resId);
        }
      }
      // A stay checked in early (isCheckedInEarly in isInHouse) keeps its
      // stored s.status as 'arriving-today' — inHouse wins the candidate
      // above (correctly colors the tile 'occupied'), but that leaves this
      // stay's *arrival* invisible to the "arriving today" filter, since
      // the else-if chain above never reaches the arriving-today branch
      // once inHouse is true. Record it independently of the chain so the
      // filter still finds it.
      if (s.status === 'arriving-today') secondaryTargets['arriving-today'] = folderKey(s.roomNum, s.checkin, s.resId);
      if (s.status === 'arriving-soon')  secondaryTargets['arriving-soon']  = folderKey(s.roomNum, s.checkin, s.resId);
      // (no early break — a room can hold more than one relevant stay, e.g.
      // a current occupied guest plus a future arriving-soon booking, and
      // we need to see all of them for the secondaryTargets above)
    }

    // Fallback: nothing in the (date-windowed) `stays` list explained this
    // room, but its most recent housekeeping log entry might still show it
    // as uninspected — e.g. a blocked/damaged room whose checkout date has
    // aged past the stays window. Without this, such a room silently reverts
    // to "vacant" a day or two after checkout even though it's not sellable.
    if (RANK[status] < RANK['closed']) {
      const latest = latestCoByRoom[room.num];
      if (latest && !latest.inspected) {
        status = 'closed';
        targetKey = null;
      }
    }

    // Manual override — always wins, even over an in-progress stay record,
    // since a room mid-renovation shouldn't show as bookable/occupied.
    if (MANUALLY_CLOSED_ROOMS.has(room.num)) {
      status = 'closed';
      targetKey = null;
    }

    return { ...room, status, targetKey, secondaryTargets };
  });

  function goToRoomCard(targetKey: string | null, roomLabel: string, status?: RoomGridStatus) {
    if (!targetKey) {
      const msg = status === 'closed'
        ? `ห้อง ${roomLabel} ปิดปรับปรุง — ไม่มีการ์ดให้เปิด`
        : `ห้อง ${roomLabel} ว่าง — ไม่มีการ์ดให้เปิด`;
      showToast(msg);
      return;
    }
    setView('all');
    setHighlightKey(targetKey);
    setTimeout(() => {
      roomCardRefs.current[targetKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    setTimeout(() => setHighlightKey(k => (k === targetKey ? null : k)), 2200);
  }

  if (loading) return (
    <div className="f-thai flex items-center justify-center py-20" style={{ color: T.inkSoft }}>
      <div className="w-8 h-8 rounded-full animate-spin mr-3" style={{ border: `4px solid ${T.hairGold}`, borderTopColor: T.brass }} />
      {t('ci_loading_data')}
    </div>
  );
  if (error) return (
    <div className="f-thai text-center py-16" style={{ color: T.wine }}>
      <div className="text-2xl mb-2">⚠️</div>
      <p className="text-sm">{error}</p>
      <button onClick={load} className="press mt-3 px-4 py-2 text-xs rounded-xl" style={{ background: T.wineTint, border: `1px solid ${T.wine}30`, color: T.wine }}>{t('ci_retry')}</button>
    </div>
  );

  function renderStayCard(s: Stay) {
            const cfg    = STATUS_CONFIG[s.status];
            // For an in-house/checking-out guest, "inspected" means THEIR OWN
            // checkout has been logged as inspected — matched against their
            // own checkout date.
            const co     = findCoForStay(s, coStatus);
            const cardKey = folderKey(s.roomNum, s.checkin, s.resId);
            const cardDocs = docs[cardKey] || [];
            const isUploading = uploadingFor === cardKey;
            // For an arriving-today or arriving-soon guest, "is the room
            // ready" must instead ask about the PREVIOUS occupant's
            // checkout — matching against this stay's own (future) checkout
            // date would look for a log that can't exist yet. Use the
            // room's most recent checkout log overall (same fallback the
            // room-status grid uses) instead.
            const roomReady = (s.status === 'arriving-today' || s.status === 'arriving-soon')
              ? (latestCoByRoom[s.roomNum]?.inspected ?? null)
              : (co?.inspected ?? null);

            // ── per-card check-in state ──────────────────────────────
            const isCheckedIn  = s.status === 'arriving-today' && ciDoneSet.has(s.resId);
            const isCancelled  = cancelledSet.has(s.resId);
            const isCheckedOut = checkedOutSet.has(s.resId);
            const isNoShow     = s.status === 'arriving-today' && s.checkin < refDate && !isCheckedIn && !isCheckedOut;

            // สี: cancelled=แดง(wine) | checkedOut=ทองเข้ม | checkedIn=เขียว | noShow=เทา | arriving-soon=navy | default=cfg
            const cardStyle = isCancelled               ? { border: `1px solid ${T.wine}40`, background: '#E4BDC3' }
                             : isCheckedOut              ? { border: `1px solid ${T.brassDeep}40`, background: '#EEDCB2' }
                             : isCheckedIn               ? { border: `1px solid ${T.sage}40`, background: '#C2DACA' }
                             : isNoShow                  ? { border: `1px solid ${T.hair}`, background: T.bone }
                             : s.status==='arriving-soon'? { border: `1px solid ${T.navy}30`, background: '#BAC4D6' }
                                                         : { border: `1px solid ${T.hair}`, background: T.card };
            const topBarBg     = isCancelled  ? T.wine
                                : isCheckedOut ? T.brassDeep
                                : isCheckedIn  ? T.sage
                                : isNoShow     ? '#9CA3AF'
                                               : cfg.bg;
            const topBarLabel  = isCancelled  ? `🚫 ${t('ci_cancelled_booking')}`
                                : isCheckedOut ? `🧳 ${t('ci_checked_out_done')}`
                                : isCheckedIn  ? `✅ ${t('ci_checked_in_done')}`
                                : isNoShow     ? `⚠️ ${t('ci_no_show')}`
                                               : t(cfg.labelKey);
            const topBarText   = (isCancelled || isCheckedOut || isCheckedIn || isNoShow) ? '#FFFFFF' : cfg.text;

            const isHighlighted = highlightKey === cardKey;

            return (
              <div key={cardKey}
                ref={el => { roomCardRefs.current[cardKey] = el; }}
                className="f-thai rounded-2xl overflow-hidden transition-shadow duration-300"
                style={{ ...cardStyle, ...(isHighlighted ? { boxShadow: `0 0 0 3px ${T.brass}` } : {}) }}>
                {/* Top bar */}
                <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: topBarBg }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: topBarText }}></span>
                    <span className="text-xs font-semibold" style={{ color: topBarText }}>{topBarLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === 'checked-in' && (
                      <span className="text-xs" style={{ color: topBarText, opacity: 0.8 }}>
                        {t('ci_remaining_nights')} {s.daysLeft} {t('ci_nights')} · {t('ci_checkout_label')} {s.checkout}
                      </span>
                    )}
                    {s.status === 'arriving-soon' && (
                      <span className="text-xs" style={{ color: topBarText, opacity: 0.9 }}>{t('ci_arrives_in')} {s.daysUntil} {t('ci_days')}</span>
                    )}
                    {s.status === 'arriving-today' && (
                      <span className="text-xs" style={{ color: topBarText, opacity: 0.9 }}>{t('ci_today_exclaim')}</span>
                    )}
                    {/* ปุ่มยกเลิกการจอง — เฉพาะห้องที่ยังไม่เช็คอิน (ก่อนถึงวันเข้าพัก) เท่านั้น
                        ซ่อนขณะ preview วันอื่น เพราะเป็น action จริงที่ผูกกับวันปัจจุบันจริง */}
                    {isViewingToday && !isCancelled && !isCheckedOut && (s.status === 'arriving-today' || s.status === 'arriving-soon') && (
                      <button
                        onClick={e => { e.stopPropagation(); setCancelModal(s); }}
                        className="press w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold leading-none"
                        style={{ background: 'rgba(255,255,255,0.2)', color: topBarText }}
                        title="ยกเลิกการจอง">
                        ✕
                      </button>
                    )}
                    {/* ปุ่ม Checkout (ก่อนกำหนด) — เฉพาะห้องที่กำลังพักอยู่ (checked-in) เท่านั้น
                        กดแล้วอัปเดตวันเช็คเอาท์ทั้งใน CheckStatus log, Sheet1 (col เช็คเอาท์)
                        และแจ้งกลุ่มแม่บ้านผ่าน LINE — ซ่อนขณะ preview วันอื่นเช่นกัน */}
                    {isViewingToday && !isCancelled && !isCheckedOut && s.status === 'checked-in' && (
                      <button
                        onClick={e => { e.stopPropagation(); setCheckoutArmed(false); setCheckoutModal(s); }}
                        className="press w-5 h-5 rounded-full flex items-center justify-center text-[10px] leading-none"
                        style={{ background: 'rgba(255,255,255,0.2)', color: topBarText }}
                        title="Checkout แล้ว">
                        🧳
                      </button>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="px-4 pt-3 pb-1.5">
                  {/* Room + Guest row */}
                  <div className="flex items-center gap-3 mb-2.5">
                    {/* Room badge */}
                    <div className="flex-shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center" style={{ background: T.navyDeep }}>
                      <span className="f-num text-2xl font-semibold leading-none" style={{ color: T.brass }}>{s.roomNum}</span>
                      <span className="text-[9px] mt-1 tracking-wide uppercase" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        {s.room.replace(s.roomNum, '').trim().split(' ')[0]}
                      </span>
                    </div>

                    {/* Guest + channel */}
                    <div className="flex-1 min-w-0">
                      <div className="f-display font-semibold text-base leading-tight truncate" style={{ color: T.ink }}>{s.guest}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: channelStyle(s.channel).bg, color: channelStyle(s.channel).fg }}>
                          {channelIcon(s.channel)} {s.channel}
                        </span>
                      </div>
                    </div>

                    {/* Right status badge */}
                    <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                      {(s.status === 'checking-out-today' || s.status === 'checked-in') && (() => {
                        const reallyInspected = co?.inspected;
                        return (
                          <div className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium"
                            style={reallyInspected ? { background: T.sageTint, color: T.sage, border: `1px solid ${T.sage}30` } : { background: T.brassPale, color: T.brassDeep, border: `1px solid ${T.hairGold}` }}>
                            <span className="text-base">{reallyInspected ? '🟢' : '🟡'}</span>
                          </div>
                        );
                      })()}
                      {(s.status === 'arriving-today' || s.status === 'arriving-soon') && (
                        <div className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium"
                          style={roomReady === true ? { background: T.sageTint, color: T.sage, border: `1px solid ${T.sage}30` }
                          : roomReady === false ? { background: T.wineTint, color: T.wine, border: `1px solid ${T.wine}30` }
                                                : { background: T.card, color: '#9CA3AF', border: `1px solid ${T.hair}` }}>
                          <span className="text-base">{roomReady === true ? '🟢' : roomReady === false ? '🔴' : '⚪'}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Date block */}
                  {(() => {
                    const fmtDate = (iso: string) => {
                      const d = new Date(iso);
                      return {
                        day: d.getDate(),
                        month: d.toLocaleDateString('en-US', { month: 'short' }),
                        year: d.getFullYear(),
                      };
                    };
                    const ci = fmtDate(s.checkin);
                    const co2 = fmtDate(s.checkout);
                    const isCheckoutToday = s.status === 'checking-out-today';
                    // แก้ไขวันเช็คเอาท์ได้ทุกสถานะ (arriving-soon / arriving-today /
                    // checked-in / checking-out-today) ยกเว้นการจองที่ยกเลิกแล้ว
                    // หรือเช็คเอาท์ไปแล้ว — และเฉพาะตอนดูวันนี้จริง (ไม่ใช่ preview วันอื่น)
                    const canEditCheckout = isViewingToday && !isCancelled && !isCheckedOut;
                    return (
                      <div className="flex rounded-xl overflow-hidden mb-2" style={{ border: `1px solid ${T.hairGold}` }}>
                        <div className="flex-1 px-3 py-2">
                          <div className="f-thai text-[9px] font-semibold tracking-widest uppercase mb-1" style={{ color: T.inkSoft }}>{t('ci_checkin_label')}</div>
                          <div className="f-num text-xl font-semibold leading-none" style={{ color: T.ink }}>{ci.day}</div>
                          <div className="text-xs mt-0.5" style={{ color: T.inkSoft }}>{ci.month} {ci.year}</div>
                        </div>
                        <div className="flex items-center justify-center px-3 text-[11px] font-medium" style={{ background: T.bone, color: T.brassDeep, borderLeft: `1px solid ${T.hairGold}`, borderRight: `1px solid ${T.hairGold}` }}>
                          {s.nights}<br/>{t('ci_nights')}
                        </div>
                        <div
                          onClick={canEditCheckout ? (e => { e.stopPropagation(); openExtendModal(s); }) : undefined}
                          className={`flex-1 px-3 py-2 relative${canEditCheckout ? ' press cursor-pointer' : ''}`}
                          title={canEditCheckout ? t('ci_edit_checkout_date') : undefined}>
                          <div className="f-thai text-[9px] font-semibold tracking-widest uppercase mb-1" style={{ color: T.inkSoft }}>{t('ci_checkout_label')}</div>
                          <div className="f-num text-xl font-semibold leading-none" style={{ color: isCheckoutToday ? T.wine : T.ink }}>{co2.day}</div>
                          <div className="text-xs mt-0.5" style={{ color: isCheckoutToday ? T.wine : T.inkSoft, opacity: isCheckoutToday ? 0.75 : 1 }}>{co2.month} {co2.year}</div>
                          {canEditCheckout && (
                            <span className="absolute top-1.5 right-1.5 text-[10px]" style={{ color: T.brassDeep, opacity: 0.6 }}>✏️</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Note text (if any) */}
                  {s.note && (
                    <p className="f-thai text-xs italic truncate mb-1" style={{ color: T.inkSoft }}>📝 {s.note}</p>
                  )}

                  {/* Actions row — Note / เช็คอินแล้ว / อัปโหลดเอกสาร / ดูเอกสาร grouped together */}
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <button onClick={() => openNoteModal(s)}
                      className="press f-thai text-[11px] font-semibold rounded-lg px-2 py-1 whitespace-nowrap"
                      style={{ border: `1px solid ${T.hairGold}`, color: T.brassDeep }}>
                      {s.note ? `✏️ ${t('ci_edit_note')}` : `📝 ${t('ci_add_note')}`}
                    </button>

                    {/* Check-in / No-show — arriving-today only */}
                    {s.status === 'arriving-today' && !isCancelled && !isCheckedOut && (
                      <>
                        {!isCheckedIn && !isNoShow && isViewingToday && (
                          <a href={TM30_URL} target="_blank" rel="noopener noreferrer"
                            onClick={() => markCheckedIn(s.resId)}
                            className="press f-thai inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                            style={{ background: T.sage, color: '#fff' }}>
                            ✅ {t('ci_checkin_tm30')}
                          </a>
                        )}
                        {!isCheckedIn && !isNoShow && !isViewingToday && (
                          <span className="f-thai inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: T.bone, color: T.inkSoft, border: `1px solid ${T.hair}` }}>
                            ⏳ {t('ci_checkin_tm30')}
                          </span>
                        )}
                        {/* เช็คอินแล้ว — badge */}
                        {isCheckedIn && (
                          <span className="f-thai inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: T.sageTint, color: T.sage, border: `1px solid ${T.sage}30` }}>
                            ✅ {t('ci_checked_in_done')}
                          </span>
                        )}
                        {/* No show — badge */}
                        {isNoShow && (
                          <span className="f-thai inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: T.bone, color: T.inkSoft, border: `1px solid ${T.hair}` }}>
                            ⚠️ {t('ci_no_show')}
                          </span>
                        )}
                      </>
                    )}

                    {/* Checked out badge */}
                    {isCheckedOut && (
                      <span className="f-thai inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: T.brassPale, color: T.brassDeep, border: `1px solid ${T.hairGold}` }}>
                        🧳 {t('ci_checked_out_done')}
                      </span>
                    )}

                    {/* Upload + doc list */}
                    <button
                      disabled={isUploading}
                      onClick={() => handleUploadClick(s.roomNum, s.checkin, s.resId)}
                      className="press f-thai inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg disabled:opacity-50"
                      style={{ border: `1px dashed ${T.hair}`, color: T.inkSoft }}>
                      {isUploading ? `⏳ ${t('ci_uploading')}` : `📎 ${t('ci_upload_doc')}`}
                    </button>
                    {!docsLoading && cardDocs.length > 0 && (
                      <button
                        onClick={() => setViewerKey(cardKey)}
                        className="press f-thai inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg font-medium"
                        style={{ background: T.navyTint, border: `1px solid ${T.hairGold}`, color: T.navy }}>
                        🗂 {t('ci_view_docs')} ({cardDocs.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Checkout details (for checkout-today only) */}
                {s.status === 'checking-out-today' && co && (
                  <div className="f-thai mx-4 mb-2 p-2.5 rounded-xl text-[11px] space-y-0.5" style={{ background: T.bone, color: T.inkSoft }}>
                    {co.cleanedBy   && <div>🧹 {t('ci_cleaned_by')}: <span style={{ color: T.ink }}>{co.cleanedBy}</span></div>}
                    {co.inspectedBy && <div>👁️ {t('ci_inspected_by')}: <span style={{ color: T.ink }}>{co.inspectedBy}</span></div>}
                    {co.issues      && <div>⚠️ <span style={{ color: T.brassDeep }}>{co.issues}</span></div>}
                  </div>
                )}
              </div>
            );
  }

  const viewerDocs = viewerKey ? (docs[viewerKey] || []) : [];

  return (
    <div className="pb-24">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp"
        multiple className="hidden" onChange={handleFileChange} />

      {/* Doc viewer modal */}
      {viewerKey && viewerDocs.length > 0 && (
        <DocViewer
          docs={viewerDocs}
          onClose={() => setViewerKey(null)}
          onDelete={async i => { await deleteDoc(viewerKey, i); if (viewerDocs.length <= 1) setViewerKey(null); }}
        />
      )}

      {/* Preview-mode banner — shown whenever the header date picker isn't
          set to the real today, so it's never ambiguous that the grid below
          is a read-only reconstruction of another date rather than live state. */}
      {!isViewingToday && (
        <div className="mb-4 px-4 py-2.5 rounded-2xl f-thai text-xs font-semibold flex items-center justify-between gap-2"
          style={{ background: T.navyTint, color: T.navy, border: `1px solid ${T.navy}30` }}>
          <span>🔍 {t('ci_preview_mode')} {refDate} {t('ci_preview_readonly')}</span>
          {onViewDateChange && (
            <button
              onClick={() => onViewDateChange(realToday)}
              className="press flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold"
              style={{ background: T.navy, color: '#FFFFFF' }}>
              {t('ci_preview_back_today')}
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="f-display text-lg font-bold" style={{ color: T.ink }}>{t('ci_room_status_title')}</h2>
          <p className="f-thai text-xs" style={{ color: T.inkSoft }}>{t('ci_last_refresh')} {lastRefresh} · {t('ci_today_label')} {refDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={TM30_URL} target="_blank" rel="noopener noreferrer"
            className="press f-thai flex items-center gap-1 px-3 py-1.5 text-xs rounded-xl font-medium"
            style={{ background: T.navyTint, border: `1px solid ${T.hairGold}`, color: T.navy }}>
            {t('ci_create_tm30')}
          </a>
          <button onClick={() => { load(); refreshDocs(); }}
            className="press f-thai flex items-center gap-1 px-3 py-1.5 text-xs rounded-xl"
            style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
            {t('ci_refresh')}
          </button>
          <button onClick={() => { setManualSearchOpen(v => !v); setManualSearchSelected(null); }}
            aria-label={t('ci_manual_search_btn')}
            title={t('ci_manual_search_btn')}
            className="press flex items-center justify-center w-8 h-8 rounded-xl"
            style={{ background: manualSearchOpen ? T.navy : T.navyTint, border: `1px solid ${T.navy}`, color: manualSearchOpen ? '#FFFFFF' : T.navy }}>
            🔍
          </button>
        </div>
      </div>

      {/* Manual search — works for ANY booking regardless of the 5-day arrival
          window the card grid below is limited to. Selecting a result shows
          its full booking card (same as the room-status grid below), with all
          the usual actions (check-in, cancel, checkout, notes, docs) rather
          than a bare cancel button. */}
      {manualSearchOpen && (
        <div className="rounded-2xl p-4 mb-5" style={{ background: T.navyTint, border: `1px solid ${T.navy}30` }}>
          {manualSearchSelected ? (
            <div>
              <button onClick={() => setManualSearchSelected(null)}
                className="press f-thai flex items-center gap-1 text-xs font-semibold mb-3"
                style={{ color: T.navy }}>
                ← {t('ci_manual_search_back')}
              </button>
              {renderStayCard(stayFromRawRow(manualSearchSelected))}
            </div>
          ) : (
            <>
              <p className="f-thai text-xs font-bold mb-2" style={{ color: T.navy }}>{t('ci_manual_search_title')}</p>
              <input
                autoFocus
                value={manualSearchQuery}
                onChange={e => setManualSearchQuery(e.target.value)}
                placeholder={t('ci_manual_search_placeholder')}
                className="f-thai w-full px-3 py-2 rounded-xl text-sm mb-2"
                style={{ border: `1px solid ${T.hairGold}`, color: T.ink }}
              />
              {manualSearchQuery.trim().length < 2 ? (
                <p className="f-thai text-xs" style={{ color: T.inkSoft }}>{t('ci_manual_search_hint')}</p>
              ) : (() => {
                const q = manualSearchQuery.trim().toLowerCase();
                const results = allStaysRaw.filter(row =>
                  row.guest.toLowerCase().includes(q) ||
                  row.resId.toLowerCase().includes(q) ||
                  row.room.toLowerCase().includes(q)
                ).slice(0, 20);
                if (!results.length) return <p className="f-thai text-xs" style={{ color: T.inkSoft }}>{t('ci_manual_search_no_results')}</p>;
                return (
                  <div className="flex flex-col gap-2">
                    {results.map(row => {
                      const isCxl = /ยกเลิก|cancel/i.test(row.room) || cancelledSet.has(row.resId);
                      return (
                        <button key={row.resId + row.checkin}
                          onClick={() => setManualSearchSelected(row)}
                          className="press flex items-center justify-between rounded-xl px-3 py-2 text-left"
                          style={{ background: '#FFFFFF', border: `1px solid ${T.hairGold}` }}>
                          <div className="min-w-0">
                            <p className="f-thai text-sm font-medium truncate" style={{ color: T.ink }}>{row.guest} · {row.room}</p>
                            <p className="f-thai text-xs truncate" style={{ color: T.inkSoft }}>{row.checkin} → {row.checkout} · {row.resId}</p>
                          </div>
                          {isCxl && (
                            <span className="f-thai text-xs shrink-0 ml-2" style={{ color: T.wine }}>{t('ci_manual_search_already_cancelled')}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
      {/* KPI cards double as the room-grid filter — no separate legend row
          needed. Tap a card to highlight only that status in the grid
          below (full color, everything else dims to a pastel tint); tap
          the same card again to clear. */}
      <div className="grid grid-cols-6 gap-1 mb-5">
        {([
          { key: 'occupied' as RoomGridStatus,       label: t('ci_in_hotel'),           icon: '🛏️' },
          { key: 'checkout-today' as RoomGridStatus, label: t('ci_checking_out_today'), icon: '🧳' },
          { key: 'arriving-today' as RoomGridStatus, label: t('ci_arriving_today'),     icon: '📥' },
          { key: 'arriving-soon' as RoomGridStatus,  label: t('ci_arriving_soon'),      icon: '📅' },
          { key: 'vacant' as RoomGridStatus,         label: t('ci_kpi_vacant'),         icon: '🚪' },
          { key: 'closed' as RoomGridStatus,         label: t('ci_kpi_closed'),         icon: '🔧' },
        ]).map(k => {
          const val =
            k.key === 'occupied' ? kpiCounts.checkedin :
            k.key === 'checkout-today' ? kpiCounts.checkouts :
            k.key === 'arriving-today' ? kpiCounts.today_ci :
            k.key === 'arriving-soon' ? kpiCounts.arrivals - kpiCounts.today_ci :
            roomGrid.filter(r => r.status === k.key).length;
          const cfg = ROOM_GRID_CONFIG[k.key];
          const isSelected = gridFilter === k.key;
          const isDimmed = gridFilter !== null && !isSelected;
          const bg = isDimmed ? dimToward(cfg.bg, 0.8) : cfg.bg;
          const fg = isDimmed ? dimToward(cfg.fg, 0.6) : cfg.fg;
          return (
            <button key={k.key}
              onClick={() => setGridFilter(cur => (cur === k.key ? null : k.key))}
              className="press f-thai rounded-lg py-3 px-0.5 text-center transition-colors overflow-hidden"
              style={{ background: bg, color: fg, border: isSelected ? `2px solid ${T.navy}` : `1px solid ${fg}30`, opacity: isDimmed ? 0.65 : 1 }}>
              <div className="text-base leading-none mb-0.5">{k.icon}</div>
              <div className="f-num text-xl font-bold leading-none">{val}</div>
              <div className="leading-tight mt-0.5 truncate w-full" style={{ fontSize: 9.5 }}>{k.label}</div>
            </button>
          );
        })}
      </div>

      {/* Room status grid — every physical room, colored by live status.
          Filtered via the KPI cards above: the selected status shows full
          color, everything else dims to a pastel tint — rooms stay
          visible, just quieter, so nothing disappears from the grid. */}
      <div className="mb-5">
        {gridFilter && (
          <div className="flex items-center justify-end mb-1.5">
            <button onClick={() => setGridFilter(null)}
              className="f-thai text-[11px] underline" style={{ color: T.inkSoft }}>
              {t('ci_legend_clear')}
            </button>
          </div>
        )}
        <div className="grid grid-cols-8 gap-1">
          {roomGrid.map(r => {
            // If a legend filter is active and this room's *top* status
            // doesn't match it, check whether the room has a secondary
            // (lower-ranked, currently-hidden) stay that does — e.g. a
            // room showing "occupied" can still have a future
            // "arriving-soon" booking. When filtering, that secondary
            // match takes over the tile's color instead of just dimming,
            // since that's specifically what the person clicked to see.
            const matchesFilter = gridFilter !== null && (
              r.status === gridFilter || r.secondaryTargets[gridFilter] !== undefined
            );
            const displayStatus: RoomGridStatus =
              gridFilter !== null && r.status !== gridFilter && r.secondaryTargets[gridFilter] !== undefined
                ? gridFilter
                : r.status;
            const displayTargetKey =
              gridFilter !== null && r.status !== gridFilter && r.secondaryTargets[gridFilter] !== undefined
                ? r.secondaryTargets[gridFilter]!
                : r.targetKey;
            const cfg = ROOM_GRID_CONFIG[displayStatus];
            const isDimmed = gridFilter !== null && !matchesFilter;
            const bg = isDimmed ? dimToward(cfg.bg) : cfg.bg;
            const fg = isDimmed ? dimToward(cfg.fg, 0.55) : cfg.fg;
            return (
              <button key={r.num}
                onClick={() => goToRoomCard(displayTargetKey, r.num, displayStatus)}
                className="press f-thai rounded-md py-1.5 px-0.5 text-center overflow-hidden transition-colors"
                style={{ background: bg, border: `1px solid ${fg}30` }}>
                <div className="f-num text-[13px] font-bold leading-none" style={{ color: fg }}>{r.num}</div>
                <div className="leading-none truncate w-full mt-1" style={{ color: fg, opacity: 0.7, fontSize: '8.5px' }}>{r.type}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 rounded-2xl p-1" style={{ background: T.bone }}>
        {([
          { key: 'all',       label: `${t('ci_filter_all')} (${stays.length})` },
          { key: 'checkedin', label: `${t('ci_filter_checkedin')} (${counts.checkedin})` },
          { key: 'checkouts', label: `${t('ci_filter_checkouts')} (${counts.checkouts})` },
          { key: 'arrivals',  label: `${t('ci_filter_arrivals')} (${counts.arrivals})` },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setView(tab.key)}
            className="press f-thai flex-1 px-2 py-1.5 text-xs rounded-xl font-medium"
            style={view === tab.key ? { background: T.card, color: T.navy, boxShadow: '0 1px 4px rgba(11,30,66,0.15)' } : { color: T.inkSoft }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="f-thai text-center py-12 text-sm" style={{ color: T.inkSoft }}>{t('ci_no_data')}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => renderStayCard(s))}
        </div>
      )}

      {/* Legend */}
      <div className="f-thai mt-6 px-4 py-3 rounded-xl text-[11px]" style={{ background: T.bone, border: `1px solid ${T.hair}`, color: T.inkSoft }}>
        <div className="font-semibold mb-1.5" style={{ color: T.ink }}>{t('ci_legend_title')}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>{t('ci_legend_ready')}</span>
          <span>{t('ci_legend_not_inspected')}</span>
          <span>{t('ci_legend_not_ready')}</span>
          <span>{t('ci_legend_unknown')}</span>
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCancelModal(null)}>
          <div className="rounded-2xl w-full max-w-sm p-5" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.4)' }} onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🚫</div>
              <p className="f-thai font-bold text-base" style={{ color: T.ink }}>{t('ci_confirm_cancel_q')}</p>
              <p className="f-thai text-sm mt-1" style={{ color: T.inkSoft }}>ห้อง {cancelModal.room} · {cancelModal.guest}</p>
              <p className="f-thai text-xs mt-0.5" style={{ color: T.inkSoft }}>{cancelModal.checkin} → {cancelModal.checkout}</p>
              <p className="f-thai text-xs mt-2" style={{ color: T.brassDeep }}>⚠️ วันเช็คเอาท์จะถูกเปลี่ยนเป็นวันนี้</p>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setCancelModal(null)}
                className="press f-thai flex-1 rounded-xl py-2.5 text-sm font-medium"
                style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
                {t('ci_no')}
              </button>
              <button
                disabled={cancelSaving}
                onClick={async () => { await confirmCancel(cancelModal); setCancelModal(null); }}
                className="press f-thai flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: T.wine, color: '#fff' }}>
                {cancelSaving ? '⏳...' : `🚫 ${t('ci_confirm')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout confirmation modal */}
      {checkoutModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setCheckoutModal(null); setCheckoutArmed(false); }}>
          <div className="rounded-2xl w-full max-w-sm p-5" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.4)' }} onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🧳</div>
              <p className="f-thai font-bold text-base" style={{ color: T.ink }}>{t('ci_confirm_checkout_q')}</p>
              <p className="f-thai text-sm mt-1" style={{ color: T.inkSoft }}>ห้อง {checkoutModal.room} · {checkoutModal.guest}</p>
              <p className="f-thai text-xs mt-0.5" style={{ color: T.inkSoft }}>{checkoutModal.checkin} → {checkoutModal.checkout}</p>
              <p className="f-thai text-xs mt-2" style={{ color: T.brassDeep }}>⚠️ วันเช็คเอาท์จะถูกเปลี่ยนเป็นวันนี้ ({today()}) ใน Sheet1 และแจ้งกลุ่มแม่บ้านทันที</p>
              {checkoutArmed && (
                <p className="f-thai text-xs mt-2 font-bold" style={{ color: T.wine }}>⚠️ แตะ "ยืนยันอีกครั้ง" เพื่อดำเนินการ — ทำแล้วย้อนกลับไม่ได้</p>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setCheckoutModal(null); setCheckoutArmed(false); }}
                className="press f-thai flex-1 rounded-xl py-2.5 text-sm font-medium"
                style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
                {t('ci_no')}
              </button>
              <button
                disabled={checkoutSaving}
                onClick={async () => {
                  if (!checkoutArmed) { setCheckoutArmed(true); return; }
                  await confirmCheckout(checkoutModal);
                  setCheckoutModal(null);
                  setCheckoutArmed(false);
                }}
                className="press f-thai flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: checkoutArmed ? T.wine : T.brassDeep, color: '#fff' }}>
                {checkoutSaving ? '⏳...' : checkoutArmed ? `⚠️ ${t('ci_confirm')}อีกครั้ง` : `🧳 ${t('ci_confirm')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {noteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setNoteModal(null)}>
          <div className="rounded-2xl w-full max-w-sm p-5" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.4)' }} onClick={e => e.stopPropagation()}>
            <p className="f-thai font-bold text-sm mb-1" style={{ color: T.ink }}>📝 {t('ci_note_modal_title')} {noteModal.room}</p>
            <p className="f-thai text-xs mb-3" style={{ color: T.inkSoft }}>{noteModal.guest} · {noteModal.checkin} → {noteModal.checkout}</p>
            <textarea
              className="focus-ring w-full rounded-lg p-2 text-sm resize-none"
              style={{ border: `1px solid ${T.hairGold}`, color: T.ink }}
              rows={4}
              placeholder={t('ci_note_placeholder')}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setNoteModal(null)}
                className="press f-thai flex-1 rounded-lg py-2 text-sm"
                style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
                {t('ci_cancel')}
              </button>
              <button onClick={saveNote} disabled={noteSaving}
                className="press f-thai flex-1 rounded-lg py-2 text-sm font-bold disabled:opacity-50"
                style={{ background: T.brass, color: T.navyDeep }}>
                {noteSaving ? t('ci_saving') : t('ci_save_notify_line')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* แก้ไขวันเช็คเอาท์ modal */}
      {extendModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !extendSaving && setExtendModal(null)}>
          <div className="rounded-2xl w-full max-w-sm p-5" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.4)' }} onClick={e => e.stopPropagation()}>
            <p className="f-thai font-bold text-sm mb-1" style={{ color: T.ink }}>🗓️ {t('ci_edit_checkout_date')} — {t('ci_room_word')} {extendModal.roomNum}</p>
            <p className="f-thai text-xs mb-3" style={{ color: T.inkSoft }}>{extendModal.guest} · {t('ci_checkin_label')} {extendModal.checkin}</p>
            <label className="f-thai text-[11px] font-semibold tracking-wide uppercase mb-1 block" style={{ color: T.inkSoft }}>
              {t('ci_extend_new_checkout_label')} ({t('ci_checkout_label')} {t('ci_extend_current')}: {extendModal.checkout})
            </label>
            <input
              type="date"
              className="focus-ring w-full rounded-lg p-2 text-sm"
              style={{ border: `1px solid ${T.hairGold}`, color: T.ink }}
              min={extendModal.checkin}
              value={extendDate}
              onChange={e => { setExtendDate(e.target.value); setExtendError(''); }}
              autoFocus
            />
            {extendError && (
              <p className="f-thai text-xs mt-2" style={{ color: T.wine }}>⚠️ {extendError}</p>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={() => setExtendModal(null)} disabled={extendSaving}
                className="press f-thai flex-1 rounded-lg py-2 text-sm disabled:opacity-50"
                style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
                {t('ci_cancel')}
              </button>
              <button onClick={saveExtend} disabled={extendSaving}
                className="press f-thai flex-1 rounded-lg py-2 text-sm font-bold disabled:opacity-50"
                style={{ background: T.brass, color: T.navyDeep }}>
                {extendSaving ? t('ci_saving') : (extendModal.status === 'checking-out-today' ? t('ci_save_notify_line') : t('ci_save_only'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="f-thai fixed bottom-6 left-1/2 -translate-x-1/2 max-w-[88vw] sm:max-w-sm text-sm text-center px-5 py-3 rounded-2xl z-50 pointer-events-none" style={{ background: T.navyDeep, color: '#fff', boxShadow: '0 10px 24px rgba(11,30,66,0.4)' }}>
          {toast}
        </div>
      )}

    </div>
  );
});

export default CheckInOut;


