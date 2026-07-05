import { useState, useEffect, useRef } from 'react';
import { useLang } from './LanguageContext';
import { T } from './theme';
import { createWorker } from 'tesseract.js';
import { parse as parseMRZ } from 'mrz';

// ─── Config ───────────────────────────────────────────────────────────────────
// Proxied through /api/gas-proxy (Vercel serverless function) because Google
// Apps Script Web Apps do not reliably send Access-Control-Allow-Origin even
// on plain GET requests — server-to-server calls bypass this entirely.
const GAS_API = '/api/gas-proxy?app=checkinout';
const CHECKOUT_LOG_ID = '1hP26o_5W4IuqqE9wJyMPuttoPB4m6EIRfkC4ePMzrGE';
const CHECKOUT_GID = '335713576';
const TM30_URL = 'https://tm30.immigration.go.th/tm30api/loginExternal.jsp?value=EXT&id=d0c6b56279430512156a619772ece25a';

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

// Find the housekeeping/inspection log entry for a stay's checkout, scanning
// only within the stay window (checkin → checkout) so a previous guest's
// inspection is never misattributed to this booking.
function findCoForStay(s: Pick<Stay, 'roomNum' | 'checkin' | 'checkout'>, coStatus: Record<string, CheckoutStatus>): CheckoutStatus | undefined {
  const parseLocal = (s2: string) => {
    const [y, m, d2] = s2.split('-').map(Number);
    return new Date(y, m - 1, d2);
  };
  const ciD = parseLocal(s.checkin);
  const coD = parseLocal(s.checkout);
  for (let d = new Date(ciD); d <= coD; d.setDate(d.getDate() + 1)) {
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

// ─── Passport MRZ scanning ─────────────────────────────────────────────────
// Reads the Machine Readable Zone (the two `<`-padded lines at the bottom of
// a passport bio page) via OCR, then parses it into structured fields with
// the `mrz` library — far more reliable than trying to OCR the whole page,
// since the MRZ format is fixed-width and checksum-validated.
interface MrzScanResult {
  lines: string[];
  rawText: string;
  parsed: ReturnType<typeof parseMRZ> | null;
  parseError?: string;
}

function cleanMrzLine(line: string, targetLen: number): string {
  let s = line.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '<');
  if (s.length < targetLen) s = s.padEnd(targetLen, '<');
  else if (s.length > targetLen) s = s.slice(0, targetLen);
  return s;
}

async function scanPassportMRZ(imageUrl: string): Promise<MrzScanResult> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'));
    el.src = imageUrl;
  });

  // Crop the bottom ~24% of the page (MRZ zone on a standard TD3 passport
  // bio page) and upscale 2.5x — small serif MRZ text OCRs far more
  // accurately when the source image is magnified first.
  const cropFrac = 0.24;
  const scale = 2.5;
  const sy = Math.floor(img.naturalHeight * (1 - cropFrac));
  const sw = img.naturalWidth;
  const sh = img.naturalHeight - sy;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับ canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const worker = await createWorker('eng');
  let rawText = '';
  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
    });
    const { data } = await worker.recognize(canvas);
    rawText = data.text || '';
  } finally {
    await worker.terminate();
  }

  // Keep only lines that look like MRZ (mostly A-Z/0-9/<), pick the last two
  // — the MRZ sits at the very bottom, so any OCR noise from fields above
  // (address, older passport layouts, etc.) tends to appear first.
  const candidates = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 20)
    .filter(l => {
      const cleaned = l.replace(/\s+/g, '');
      const okChars = (cleaned.match(/[A-Z0-9<]/gi) || []).length;
      return okChars / Math.max(1, cleaned.length) > 0.85;
    });
  const last2 = candidates.slice(-2);
  if (last2.length < 2) {
    return { lines: [], rawText, parsed: null, parseError: 'อ่านแถบ MRZ ไม่ชัดพอ ลองถ่ายรูปให้ตรง/แสงดีขึ้น' };
  }
  const lines = last2.map(l => cleanMrzLine(l, 44));
  try {
    const parsed = parseMRZ(lines, { autocorrect: true });
    return { lines, rawText, parsed };
  } catch (e) {
    return { lines, rawText, parsed: null, parseError: e instanceof Error ? e.message : 'parse ไม่สำเร็จ' };
  }
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

  // ── Passport MRZ scan state ──────────────────────────────────────────────
  const [scanOpen, setScanOpen]     = useState(false);
  const [scanning, setScanning]     = useState(false);
  const [scanResult, setScanResult] = useState<MrzScanResult | null>(null);
  useEffect(() => { setScanOpen(false); setScanResult(null); }, [idx]);

  async function handleScanMrz() {
    setScanOpen(true);
    setScanning(true);
    setScanResult(null);
    try {
      const proxyUrl = `/api/drive-image-proxy?id=${encodeURIComponent(doc.fileId)}&sz=w1600`;
      const result = await scanPassportMRZ(proxyUrl);
      setScanResult(result);
    } catch (e) {
      setScanResult({ lines: [], rawText: '', parsed: null, parseError: e instanceof Error ? e.message : 'สแกนไม่สำเร็จ' });
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
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent) => {
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
  // Tapping/clicking the image (without dragging/swiping) closes the viewer,
  // like a lightbox — a genuine swipe should just change page, not close.
  const onImageAreaClick = (e: React.MouseEvent) => {
    e.stopPropagation();
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
  const isImg = doc.mimeType.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';
  // drive.google.com/uc?export=download forces a download instead of rendering —
  // use the thumbnail endpoint for inline display, keep downloadUrl for the download button.
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
          {isImg && (
            <button onClick={handleScanMrz} disabled={scanning}
              className="press f-thai px-2 py-1 text-xs rounded disabled:opacity-60" style={{ background: T.sage, color: '#fff' }}>
              {scanning ? '⏳ กำลังสแกน…' : '🛂 Scan MRZ'}
            </button>
          )}
          <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="press px-2 py-1 text-xs rounded" style={{ background: T.brass, color: T.navyDeep }}>⬇ {t('ci_download')}</a>
          <button disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              try { await onDelete(idx); if (idx >= docs.length - 1) setIdx(Math.max(0, idx - 1)); }
              finally { setDeleting(false); }
            }}
            className="press px-2 py-1 text-xs rounded disabled:opacity-50" style={{ background: T.wine, color: '#fff' }}>
            {deleting ? '…' : '🗑'}
          </button>
          <button onClick={onClose} className="press px-2 py-1 text-xs rounded" style={{ background: 'rgba(255,255,255,0.15)' }}>✕</button>
        </div>
      </div>
      <div ref={viewerAreaRef} className="flex-1 overflow-auto flex items-start justify-center p-4" onClick={onImageAreaClick} onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ touchAction: 'pan-y', cursor: docs.length > 1 ? 'ew-resize' : 'pointer' }}>
        {isImg && <img src={displayUrl} alt={doc.fileName} className="max-w-full max-h-full object-contain rounded shadow-lg" />}
        {isPdf && <iframe src={doc.previewUrl} className="w-full h-full rounded" title={doc.fileName} />}
        {!isImg && !isPdf && (
          <div className="f-thai rounded-xl p-8 text-center" style={{ background: T.card, color: T.inkSoft }}>
            <div className="text-4xl mb-3">📄</div>
            <div className="font-semibold mb-1" style={{ color: T.ink }}>{doc.fileName}</div>
            <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="underline text-sm" style={{ color: T.navy }}>{t('ci_click_download')}</a>
          </div>
        )}
      </div>

      {/* Passport MRZ scan results */}
      {scanOpen && (
        <div className="f-thai px-4 py-3 max-h-[45vh] overflow-auto" style={{ background: T.navyDeep }} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: T.brass }}>🛂 ผลสแกน MRZ</span>
            <button onClick={() => setScanOpen(false)} className="press px-2 py-0.5 text-xs rounded" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>ปิด</button>
          </div>
          {scanning && <div className="text-sm py-4 text-center" style={{ color: 'rgba(255,255,255,0.7)' }}>⏳ กำลังอ่านแถบ MRZ...</div>}
          {!scanning && scanResult && (() => {
            const fields = scanResult.parsed?.fields;
            if (!scanResult.parsed || !fields || scanResult.parseError) {
              return (
                <div className="text-sm py-2" style={{ color: T.brass }}>
                  ⚠️ {scanResult.parseError || 'อ่านไม่สำเร็จ'}
                  {scanResult.rawText && (
                    <div className="mt-2 text-[11px] whitespace-pre-wrap opacity-60" style={{ color: '#fff' }}>{scanResult.rawText.slice(0, 300)}</div>
                  )}
                </div>
              );
            }
            const fullName = `${fields.firstName || ''} ${fields.lastName || ''}`.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
            return (
              <div>
                {!scanResult.parsed.valid && (
                  <div className="text-[11px] mb-1.5" style={{ color: T.brass }}>⚠️ checksum บางช่องไม่ผ่าน — ตรวจสอบตัวเลขให้ดีก่อนใช้</div>
                )}
                <CopyField label="ชื่อ-นามสกุล" value={fullName} />
                <CopyField label="เลขพาสปอร์ต" value={(fields.documentNumber || '').replace(/</g, '')} />
                <CopyField label="สัญชาติ" value={fields.nationality || ''} />
                <CopyField label="วันเกิด" value={formatMrzDate(fields.birthDate, 'birth')} />
                <CopyField label="เพศ" value={fields.sex === 'male' ? 'ชาย (M)' : fields.sex === 'female' ? 'หญิง (F)' : (fields.sex || '')} />
                <CopyField label="วันหมดอายุ" value={formatMrzDate(fields.expirationDate, 'expiry')} />
                <CopyField label="ประเทศที่ออกเอกสาร" value={fields.issuingState || ''} />
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CheckInOut() {
  const { t } = useLang();
  const [stays, setStays]           = useState<Stay[]>([]);
  const [coStatus, setCoStatus]     = useState<Record<string, CheckoutStatus>>({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [view, setView]             = useState<'all' | 'checkedin' | 'arrivals' | 'checkouts'>('all');
  const [lastRefresh, setLastRefresh] = useState('');
  // Docs keyed by cardKey (resId or roomNum+checkin) — mirrors the Drive folder name "{room}_{checkin}_{resId}"
  const [docs, setDocs]             = useState<Record<string, DocFile[]>>({});
  const [docsLoading, setDocsLoading] = useState(true);
  const [viewerKey, setViewerKey]   = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [noteModal, setNoteModal]       = useState<{ resId: string; room: string; guest: string; checkin: string; checkout: string; current: string } | null>(null);
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
      let j: { ok?: boolean; error?: string } = {};
      try { j = await r.json(); } catch { /* non-JSON */ }
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      const next = new Set(checkedOutSet).add(s.resId);
      setCheckedOutSet(next);
      localStorage.setItem('ci_checkout', JSON.stringify([...next]));
      showToast(`🧳 ${t('ci_checkout_early')}`);
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
      let j: { ok?: boolean; error?: string } = {};
      try { j = JSON.parse(text); } catch { /* non-JSON */ }
      console.log('[auto-checkout] response for', s.resId, r.status, text);
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}: ${text.slice(0, 200)}`);
      const next = new Set(checkedOutSet).add(s.resId);
      setCheckedOutSet(next);
      localStorage.setItem('ci_checkout', JSON.stringify([...next]));
      showToast(`🧳 ห้อง ${s.roomNum} ${t('ci_checked_out_done')}`);
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
    setNoteModal({ resId: s.resId, room: s.roomNum, guest: s.guest, checkin: s.checkin, checkout: s.checkout, current: s.note });
    setNoteText(s.note || '');
  }

  async function saveNote() {
    if (!noteModal) return;
    setNoteSaving(true);
    const { resId, room, guest, checkin, checkout } = noteModal;
    const text = noteText; // capture before any state change
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

      // 3. Push LINE
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
    } catch (e) {
      showToast(t('ci_save_failed_colon') + String(e));
    } finally {
      setNoteSaving(false);
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

      const tod = today();
      const soon = addDays(tod, 5);
      const list: Stay[] = [];

      for (const row of json.stays) {
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
            const inspected = (status !== '' && !['major','block',''].includes(status.toLowerCase()))
              || ready.includes('พร้อม');
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
        }
      } catch (_) { /* optional */ }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('ci_load_failed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); refreshDocs(); }, []);

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

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="f-display text-lg font-bold" style={{ color: T.ink }}>{t('ci_room_status_title')}</h2>
          <p className="f-thai text-xs" style={{ color: T.inkSoft }}>{t('ci_last_refresh')} {lastRefresh} · {t('ci_today_label')} {today()}</p>
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
        </div>
      </div>

      {/* Summary KPI row */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: t('ci_in_hotel'), val: counts.checkedin,  icon: '🛏️', bg: T.sageTint, fg: T.sage },
          { label: t('ci_checking_out_today'), val: counts.checkouts, icon: '🧳', bg: T.wineTint, fg: T.wine },
          { label: t('ci_arriving_today'),   val: counts.today_ci,  icon: '📥', bg: T.brassPale, fg: T.brassDeep },
          { label: t('ci_arriving_soon'), val: counts.arrivals - counts.today_ci, icon: '📅', bg: T.navyTint, fg: T.navy },
        ].map(k => (
          <div key={k.label} className="f-thai rounded-2xl p-3 text-center" style={{ background: k.bg, color: k.fg, border: `1px solid ${k.fg}30` }}>
            <div className="text-xl mb-0.5">{k.icon}</div>
            <div className="f-num text-2xl font-bold">{k.val}</div>
            <div className="text-xs leading-tight mt-0.5">{k.label}</div>
          </div>
        ))}
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
          {filtered.map(s => {
            const cfg    = STATUS_CONFIG[s.status];
            const co     = findCoForStay(s, coStatus);
            const cardKey = folderKey(s.roomNum, s.checkin, s.resId);
            const cardDocs = docs[cardKey] || [];
            const isUploading = uploadingFor === cardKey;
            const roomReady = co?.inspected ?? null;

            // ── per-card check-in state ──────────────────────────────
            const isCheckedIn  = s.status === 'arriving-today' && ciDoneSet.has(s.resId);
            const isCancelled  = cancelledSet.has(s.resId);
            const isCheckedOut = checkedOutSet.has(s.resId);
            const isNoShow     = s.status === 'arriving-today' && s.checkin < today() && !isCheckedIn && !isCheckedOut;

            // สี: cancelled=แดง(wine) | checkedOut=ทองเข้ม | checkedIn=เขียว | noShow=เทา | arriving-soon=navy | default=cfg
            const cardStyle = isCancelled               ? { border: `1px solid ${T.wine}40`, background: T.wineTint }
                             : isCheckedOut              ? { border: `1px solid ${T.brassDeep}40`, background: T.brassPale }
                             : isCheckedIn               ? { border: `1px solid ${T.sage}40`, background: T.sageTint }
                             : isNoShow                  ? { border: `1px solid ${T.hair}`, background: T.bone }
                             : s.status==='arriving-soon'? { border: `1px solid ${T.navy}30`, background: T.navyTint }
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

            return (
              <div key={cardKey}
                className="f-thai rounded-2xl overflow-hidden" style={cardStyle}>
                {/* Top bar */}
                <div className="px-4 py-2 flex items-center justify-between" style={{ background: topBarBg }}>
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
                    {/* ปุ่มยกเลิกการจอง — เฉพาะห้องที่ยังไม่เช็คอิน (ก่อนถึงวันเข้าพัก) เท่านั้น */}
                    {!isCancelled && !isCheckedOut && (s.status === 'arriving-today' || s.status === 'arriving-soon') && (
                      <button
                        onClick={e => { e.stopPropagation(); setCancelModal(s); }}
                        className="press w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold leading-none"
                        style={{ background: 'rgba(255,255,255,0.2)', color: topBarText }}
                        title="ยกเลิกการจอง">
                        ✕
                      </button>
                    )}
                    {/* ปุ่ม Checkout (ก่อนกำหนด) — เฉพาะห้องที่กำลังพักอยู่ (checked-in) เท่านั้น
                        กดแล้วอัปเดตวันเช็คเอาท์ทั้งใน CheckStatus log และ Sheet1 (เลขห้อง col D) เป็นวันนี้ */}
                    {!isCancelled && !isCheckedOut && s.status === 'checked-in' && (
                      <button
                        onClick={e => { e.stopPropagation(); setCheckoutModal(s); }}
                        className="press f-thai inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: 'rgba(255,255,255,0.2)', color: topBarText }}
                        title="Checkout ก่อนกำหนด">
                        🧳 {t('ci_checkout_btn')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="px-4 pt-3 pb-1">
                  {/* Room + Guest row */}
                  <div className="flex items-center gap-3 mb-3">
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
                      {s.status === 'arriving-today' && (
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
                        <div className="flex-1 px-3 py-2">
                          <div className="f-thai text-[9px] font-semibold tracking-widest uppercase mb-1" style={{ color: T.inkSoft }}>{t('ci_checkout_label')}</div>
                          <div className="f-num text-xl font-semibold leading-none" style={{ color: isCheckoutToday ? T.wine : T.ink }}>{co2.day}</div>
                          <div className="text-xs mt-0.5" style={{ color: isCheckoutToday ? T.wine : T.inkSoft, opacity: isCheckoutToday ? 0.75 : 1 }}>{co2.month} {co2.year}</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Note */}
                  <div className="mb-2 flex items-center gap-2">
                    {s.note && <p className="f-thai flex-1 text-xs italic truncate" style={{ color: T.inkSoft }}>📝 {s.note}</p>}
                    <button onClick={() => openNoteModal(s)}
                      className="press f-thai text-[11px] font-semibold rounded-lg px-2 py-1 whitespace-nowrap"
                      style={{ border: `1px solid ${T.hairGold}`, color: T.brassDeep }}>
                      {s.note ? `✏️ ${t('ci_edit_note')}` : `📝 ${t('ci_add_note')}`}
                    </button>
                  </div>

                  {/* Check-in / No-show / Checkout / Cancel — arriving-today only */}
                  {s.status === 'arriving-today' && !isCancelled && !isCheckedOut && (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {/* ยังไม่เช็คอิน */}
                      {!isCheckedIn && !isNoShow && (
                        <a href={TM30_URL} target="_blank" rel="noopener noreferrer"
                          onClick={() => markCheckedIn(s.resId)}
                          className="press f-thai inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                          style={{ background: T.sage, color: '#fff' }}>
                          ✅ {t('ci_checkin_tm30')}
                        </a>
                      )}
                      {/* เช็คอินแล้ว — badge (ปุ่ม checkout อยู่ที่มุมขวาบนแล้ว) */}
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
                    </div>
                  )}

                  {/* Checked out badge */}
                  {isCheckedOut && (
                    <div className="mb-3">
                      <span className="f-thai inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: T.brassPale, color: T.brassDeep, border: `1px solid ${T.hairGold}` }}>
                        🧳 {t('ci_checked_out_done')}
                      </span>
                    </div>
                  )}

                  {/* Upload + doc list */}
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
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
                  <div className="f-thai mx-4 mb-3 p-2.5 rounded-xl text-[11px] space-y-0.5" style={{ background: T.bone, color: T.inkSoft }}>
                    {co.cleanedBy   && <div>🧹 {t('ci_cleaned_by')}: <span style={{ color: T.ink }}>{co.cleanedBy}</span></div>}
                    {co.inspectedBy && <div>👁️ {t('ci_inspected_by')}: <span style={{ color: T.ink }}>{co.inspectedBy}</span></div>}
                    {co.issues      && <div>⚠️ <span style={{ color: T.brassDeep }}>{co.issues}</span></div>}
                  </div>
                )}
              </div>
            );
          })}
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCheckoutModal(null)}>
          <div className="rounded-2xl w-full max-w-sm p-5" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.4)' }} onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🧳</div>
              <p className="f-thai font-bold text-base" style={{ color: T.ink }}>{t('ci_confirm_checkout_q')}</p>
              <p className="f-thai text-sm mt-1" style={{ color: T.inkSoft }}>ห้อง {checkoutModal.room} · {checkoutModal.guest}</p>
              <p className="f-thai text-xs mt-0.5" style={{ color: T.inkSoft }}>{checkoutModal.checkin} → {checkoutModal.checkout}</p>
              <p className="f-thai text-xs mt-2" style={{ color: T.brassDeep }}>⚠️ วันเช็คเอาท์จะถูกเปลี่ยนเป็นวันนี้ ({today()}) ใน Sheet1</p>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setCheckoutModal(null)}
                className="press f-thai flex-1 rounded-xl py-2.5 text-sm font-medium"
                style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
                {t('ci_no')}
              </button>
              <button
                disabled={checkoutSaving}
                onClick={async () => { await confirmCheckout(checkoutModal); setCheckoutModal(null); }}
                className="press f-thai flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: T.brassDeep, color: '#fff' }}>
                {checkoutSaving ? '⏳...' : `🧳 ${t('ci_confirm')}`}
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

      {toast && (
        <div className="f-thai fixed bottom-6 left-1/2 -translate-x-1/2 text-sm px-5 py-2 rounded-full z-50 pointer-events-none" style={{ background: T.navyDeep, color: '#fff', boxShadow: '0 10px 24px rgba(11,30,66,0.4)' }}>
          {toast}
        </div>
      )}

    </div>
  );
}


