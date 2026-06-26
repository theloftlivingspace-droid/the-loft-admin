import { useState, useEffect, useRef } from 'react';

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

function channelColor(ch: string): string {
  const c = (ch || '').toLowerCase();
  if (c.includes('airbnb')) return 'bg-rose-100 text-rose-700';
  if (c.includes('booking')) return 'bg-blue-100 text-blue-700';
  if (c.includes('trip')) return 'bg-cyan-100 text-cyan-700';
  if (c.includes('expedia')) return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-600';
}

function channelIcon(ch: string): string {
  const c = (ch || '').toLowerCase();
  if (c.includes('airbnb')) return '🏠';
  if (c.includes('booking')) return '📘';
  if (c.includes('trip')) return '✈️';
  if (c.includes('expedia')) return '🌐';
  return '📋';
}

// Drive doc helpers — calls GAS Web App endpoints (uploadDoc / deleteDoc / getAllDocs)
async function uploadDocToDrive(room: string, checkin: string, resId: string, file: File): Promise<DocFile | null> {
  const base64Data: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  if (!json.ok) throw new Error(json.error || 'อัปโหลดไม่สำเร็จ');
  return json as DocFile;
}

async function deleteDocFromDrive(fileId: string): Promise<void> {
  const res = await fetch(GAS_API, {
    method: 'POST',
    body: JSON.stringify({ action: 'deleteDoc', fileId }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'ลบไม่สำเร็จ');
}

async function fetchAllDocsIndex(): Promise<Record<string, DocFile[]>> {
  const res = await fetch(`${GAS_API}&action=getAllDocs`);
  const json = await res.json();
  return json.ok ? (json.docs as Record<string, DocFile[]>) : {};
}

const STATUS_CONFIG = {
  'checked-in':        { label: 'เช็คอินแล้ว',       bg: 'bg-emerald-500', text: 'text-white',        dot: 'bg-white' },
  'arriving-today':    { label: 'เข้าวันนี้',          bg: 'bg-amber-400',   text: 'text-amber-900',    dot: 'bg-amber-900' },
  'checking-out-today':{ label: 'เช็คเอาท์วันนี้',    bg: 'bg-orange-500',  text: 'text-white',        dot: 'bg-white' },
  'arriving-soon':     { label: 'เข้าเร็วๆ นี้',      bg: 'bg-sky-400',     text: 'text-white',        dot: 'bg-white' },
};

// ─── Doc Viewer Modal ─────────────────────────────────────────────────────────
function DocViewer({ docs, onClose, onDelete }: { docs: DocFile[]; onClose: () => void; onDelete: (i: number) => void | Promise<void> }) {
  const [idx, setIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const doc = docs[idx];

  // Reset background page scroll so the fixed overlay always starts visible at the top,
  // regardless of how far down the card list was scrolled when the viewer was opened.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  if (!doc) return null;
  const isImg = doc.mimeType.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';
  // drive.google.com/uc?export=download forces a download instead of rendering —
  // use the thumbnail endpoint for inline display, keep downloadUrl for the download button.
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
          <button disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              try { await onDelete(idx); if (idx >= docs.length - 1) setIdx(Math.max(0, idx - 1)); }
              finally { setDeleting(false); }
            }}
            className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-700 disabled:opacity-50">
            {deleting ? '…' : '🗑'}
          </button>
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CheckInOut() {
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
      try { j = await r.json(); } catch { /* non-JSON response */ }
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);

      // 2. Close modal + update UI
      setNoteModal(null);
      setNoteText('');
      setStays(prev => prev.map(x => x.resId === resId ? { ...x, note: text } : x));

      // 3. Push LINE (fire-and-forget)
      if (text.trim()) {
        fetch('/api/maid-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resId, room, guest, checkin, checkout, note: text }),
        })
          .then(r => r.json().catch(() => ({} as { ok?: boolean; error?: string })))
          .then(j => {
            if (j.ok === false) showToast('Note บันทึกแล้ว ⚠️ LINE: ' + (j.error || 'error'));
            else showToast('บันทึก Note + แจ้ง LINE แล้ว ✅');
          })
          .catch(e => showToast('Note บันทึกแล้ว ⚠️ LINE: ' + String(e)));
      } else {
        showToast('บันทึก Note แล้ว ✅');
      }
    } catch (e) {
      showToast('❌ บันทึกไม่สำเร็จ: ' + String(e));
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
      alert('อัปโหลดไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err)));
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
      const res = await fetch(`${GAS_API}&action=getRoomStatus`);
      if (!res.ok) throw new Error('โหลดข้อมูลห้องไม่สำเร็จ');
      const json: { today: string; stays: Array<{ room: string; guest: string; checkin: string; checkout: string; channel: string; resId: string; note: string }> } = await res.json();
      if (!Array.isArray(json.stays)) throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');

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
      setLastRefresh(new Date().toLocaleTimeString('th-TH'));

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
          // UID(0) Date(1) Time(2) Inspector(3) Room(4) OTA(5) Guest(6)
          // Status(7) Ready(8) Issues(9) Damages(10) Charge(11) ChargeNote(12)
          // ElecUnit(13) ElecTHB(14) LateCheckout(15) Repairs(16) ExtraNote(17)
          // DriveLinks(18) Timestamp(19) JSON(20)
          const iDate      = h.indexOf('Date');
          const iInspector = h.indexOf('Inspector');
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
              cleanedBy:   '',
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
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); refreshDocs(); }, []);

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
    <div className="flex items-center justify-center py-20 text-gray-400">
      <div className="text-center">
        <div className="text-3xl mb-3 animate-spin">⏳</div>
        <p className="text-sm">กำลังโหลดข้อมูลห้องพัก…</p>
      </div>
    </div>
  );
  if (error) return (
    <div className="text-center py-16 text-red-500">
      <div className="text-2xl mb-2">⚠️</div>
      <p className="text-sm">{error}</p>
      <button onClick={load} className="mt-3 px-4 py-2 text-xs bg-red-50 rounded-xl border border-red-200 text-red-600">ลองใหม่</button>
    </div>
  );

  const viewerDocs = viewerKey ? (docs[viewerKey] || []) : [];

  return (
    <div className="pb-8">
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
          <h2 className="text-lg font-bold text-blue-950">สถานะห้องพัก</h2>
          <p className="text-xs text-gray-400">อัปเดต {lastRefresh} · วันนี้ {today()}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={TM30_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-xl bg-indigo-50 border-indigo-200 hover:bg-indigo-100 transition text-indigo-700 font-medium">
            📋 สร้าง TM30
          </a>
          <button onClick={() => { load(); refreshDocs(); }}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-xl hover:bg-gray-50 transition text-gray-600">
            🔄 รีเฟรช
          </button>
        </div>
      </div>

      {/* Summary KPI row */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: 'อยู่ในโรงแรม', val: counts.checkedin,  icon: '🛏️',  color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { label: 'เช็คเอาท์วันนี้', val: counts.checkouts, icon: '🧳',  color: 'bg-orange-50 border-orange-200 text-orange-700' },
          { label: 'เข้าวันนี้',   val: counts.today_ci,  icon: '📥',  color: 'bg-amber-50 border-amber-200 text-amber-700' },
          { label: 'เข้าเร็วๆ นี้', val: counts.arrivals - counts.today_ci, icon: '📅', color: 'bg-sky-50 border-sky-200 text-sky-700' },
        ].map(k => (
          <div key={k.label} className={`rounded-2xl border p-3 text-center ${k.color}`}>
            <div className="text-xl mb-0.5">{k.icon}</div>
            <div className="text-2xl font-bold">{k.val}</div>
            <div className="text-xs leading-tight mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 bg-gray-100 rounded-2xl p-1">
        {([
          { key: 'all',       label: `ทั้งหมด (${stays.length})` },
          { key: 'checkedin', label: `อยู่แล้ว (${counts.checkedin})` },
          { key: 'checkouts', label: `เช็คเอาท์วันนี้ (${counts.checkouts})` },
          { key: 'arrivals',  label: `กำลังเข้า (${counts.arrivals})` },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`flex-1 px-2 py-1.5 text-xs rounded-xl font-medium transition
              ${view === t.key ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูล</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const cfg    = STATUS_CONFIG[s.status];
            // Find log: date within stay window OR up to 3 days before checkin
            const coKey = (() => {
              const parseLocal = (s2: string) => {
                const [y,m,d2] = s2.split('-').map(Number);
                return new Date(y, m-1, d2);
              };
              const ciD = parseLocal(s.checkin);
              const coD = parseLocal(s.checkout);
              // Scan from 3 days before checkin up to checkout
              const scanStart = new Date(ciD);
              scanStart.setDate(scanStart.getDate() - 3);
              for (let d = new Date(scanStart); d <= coD; d.setDate(d.getDate() + 1)) {
                const ds = toLocalDate(d);
                const k = `${s.roomNum}_${ds}`;
                if (coStatus[k]) return k;
              }
              return null;
            })();
            const co     = coKey ? coStatus[coKey] : undefined;
            const cardKey = folderKey(s.roomNum, s.checkin, s.resId);
            const cardDocs = docs[cardKey] || [];
            const isUploading = uploadingFor === cardKey;
            const roomReady = co?.inspected ?? null;

            return (
              <div key={cardKey}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Top bar */}
                <div className={`${cfg.bg} px-4 py-2 flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`}></span>
                    <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === 'checked-in' && (
                      <span className={`text-xs ${cfg.text} opacity-80`}>
                        เหลือ {s.daysLeft} คืน · เช็คเอาท์ {s.checkout}
                      </span>
                    )}
                    {s.status === 'arriving-soon' && (
                      <span className={`text-xs ${cfg.text} opacity-90`}>เข้าในอีก {s.daysUntil} วัน</span>
                    )}
                    {s.status === 'arriving-today' && (
                      <span className={`text-xs ${cfg.text} opacity-90`}>วันนี้!</span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="px-4 pt-3 pb-1">
                  {/* Room + Guest row */}
                  <div className="flex items-center gap-3 mb-3">
                    {/* Room badge */}
                    <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100
                      flex flex-col items-center justify-center">
                      <span className="text-2xl font-semibold text-blue-700 leading-none">{s.roomNum}</span>
                      <span className="text-[10px] text-blue-400 mt-1 tracking-wide uppercase">
                        {s.room.replace(s.roomNum, '').trim().split(' ')[0]}
                      </span>
                    </div>

                    {/* Guest + channel */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-base leading-tight truncate">{s.guest}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full font-medium ${channelColor(s.channel)}`}>
                          {channelIcon(s.channel)} {s.channel}
                        </span>
                      </div>
                    </div>

                    {/* Right status badge */}
                    <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                      {(s.status === 'checking-out-today' || s.status === 'checked-in') && (
                        <div className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium
                          ${co?.inspected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
                          <span className="text-base">{co?.inspected ? '🟢' : '🟡'}</span>
                        </div>
                      )}
                      {s.status === 'arriving-today' && (
                        <div className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium
                          ${roomReady === true  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : roomReady === false ? 'bg-red-50 text-red-600 border border-red-200'
                                                : 'bg-white text-gray-400 border border-gray-200'}`}>
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
                        month: d.toLocaleDateString('th-TH', { month: 'short' }),
                        year: d.getFullYear(),
                      };
                    };
                    const ci = fmtDate(s.checkin);
                    const co2 = fmtDate(s.checkout);
                    const isCheckoutToday = s.status === 'checking-out-today';
                    return (
                      <div className="flex border border-gray-100 rounded-xl overflow-hidden mb-2">
                        <div className="flex-1 px-3 py-2">
                          <div className="text-[9px] text-gray-400 font-semibold tracking-widest uppercase mb-1">เช็คอิน</div>
                          <div className="text-xl font-semibold text-gray-900 leading-none">{ci.day}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{ci.month} {ci.year}</div>
                        </div>
                        <div className="flex items-center justify-center px-3 bg-gray-50 text-[11px] text-gray-400 font-medium border-x border-gray-100">
                          {s.nights}<br/>คืน
                        </div>
                        <div className="flex-1 px-3 py-2">
                          <div className="text-[9px] text-gray-400 font-semibold tracking-widest uppercase mb-1">เช็คเอาท์</div>
                          <div className={`text-xl font-semibold leading-none ${isCheckoutToday ? 'text-orange-600' : 'text-gray-900'}`}>{co2.day}</div>
                          <div className={`text-xs mt-0.5 ${isCheckoutToday ? 'text-orange-400' : 'text-gray-500'}`}>{co2.month} {co2.year}</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Note */}
                  <div className="mb-2 flex items-center gap-2">
                    {s.note && <p className="flex-1 text-xs text-gray-400 italic truncate">📝 {s.note}</p>}
                    <button onClick={() => openNoteModal(s)}
                      className="text-[11px] border border-yellow-300 text-yellow-700 font-semibold rounded-lg px-2 py-1 hover:bg-yellow-50 transition whitespace-nowrap">
                      {s.note ? '✏️ แก้ Note' : '📝 เพิ่ม Note'}
                    </button>
                  </div>

                  {/* Upload + doc list */}
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    <button
                      disabled={isUploading}
                      onClick={() => handleUploadClick(s.roomNum, s.checkin, s.resId)}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition disabled:opacity-50">
                      {isUploading ? '⏳ กำลังอัปโหลด…' : '📎 อัปโหลดเอกสาร'}
                    </button>
                    {!docsLoading && cardDocs.length > 0 && (
                      <button
                        onClick={() => setViewerKey(cardKey)}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-medium hover:bg-blue-100 transition">
                        🗂 ดูเอกสาร ({cardDocs.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Checkout details (for checkout-today only) */}
                {s.status === 'checking-out-today' && co && (
                  <div className="mx-4 mb-3 p-2.5 bg-gray-50 rounded-xl text-[11px] text-gray-500 space-y-0.5">
                    {co.cleanedBy   && <div>🧹 ทำความสะอาด: <span className="text-gray-700">{co.cleanedBy}</span></div>}
                    {co.inspectedBy && <div>👁️ ตรวจโดย: <span className="text-gray-700">{co.inspectedBy}</span></div>}
                    {co.issues      && <div>⚠️ <span className="text-amber-700">{co.issues}</span></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-gray-500">
        <div className="font-semibold text-gray-600 mb-1.5">หมายเหตุ</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>🟢 ตรวจห้องผ่าน / ห้องพร้อม</span>
          <span>🟡 ยังไม่ตรวจห้อง</span>
          <span>🔴 ห้องไม่พร้อม</span>
          <span>⚪ ไม่ทราบสถานะ</span>
        </div>
      </div>

      {noteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setNoteModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-sm mb-1">📝 Note — ห้อง {noteModal.room}</p>
            <p className="text-xs text-gray-500 mb-3">{noteModal.guest} · {noteModal.checkin} → {noteModal.checkout}</p>
            <textarea
              className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-300"
              rows={4}
              placeholder="พิมพ์หมายเหตุ... (จะส่งไป LINE group แม่บ้านด้วย)"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setNoteModal(null)}
                className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
                ยกเลิก
              </button>
              <button onClick={async () => {
                  alert(`saveNote called\nnoteModal=${JSON.stringify(noteModal)}\nnoteText="${noteText}"`);
                  await saveNote();
                }} disabled={noteSaving}
                className="flex-1 bg-yellow-400 hover:bg-yellow-500 rounded-lg py-2 text-sm font-bold transition disabled:opacity-50">
                {noteSaving ? 'กำลังบันทึก...' : '💾 บันทึก + แจ้ง LINE'}
              </button>
            </div>
          </div>
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

