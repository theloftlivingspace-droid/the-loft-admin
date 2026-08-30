import { useEffect, useMemo, useState } from 'react';
import { useLang } from './LanguageContext';
import { T } from './theme';
import { Wrench, Filter, X, Camera, Clock, CheckCircle2, AlertCircle, RefreshCw, UserCog } from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────
// Same Apps Script Web App the checkout-inspection form (checkout-checklist.html,
// loft-pricing repo) posts to — bound to the Raw_Checkout_Log sheet
// (CHECKOUT_LOG_ID, see CheckInOut.tsx). `action=getHistory` returns the full
// parsed JSON per inspection (uid, roomNum, damages[], repairs[], driveLinks[],
// ...) — richer than the CSV export CheckInOut.tsx uses for its lighter
// inspected/not-inspected check.
const INSPECTION_GAS_URL = 'https://script.google.com/macros/s/AKfycbwrRJs6MtXHErSE0pqjXVNp60huNjtfwjCcKGNZH2Jm5cCeCxNhUoFHcJn-vzXoNto/exec';

// The inspection form's general checklist (mainItems + bathItems in
// checkout-checklist.html) covers 24 categories spanning BOTH housekeeping
// (linens, towels, keycards, TV, fridge, trash, kitchen, smoke/durian smell...)
// and building/technical items (walls, furniture, AC, plumbing, electrical...).
// A flagged item's label is pushed into `issues[]` regardless of which domain
// it's in, so for a technician-only queue we keep just the labels that are
// actually building-maintenance work — exact strings copied from that file.
const MAINTENANCE_ISSUE_LABELS = new Set([
  'แอร์ทำงานปกติ',              // ac
  'ผนัง / พื้น / ฝ้า',           // wall
  'เฟอร์นิเจอร์ / บันได Loft',    // furniture
  'ขั้นบันได Loft',              // loft_step
  'ชักโครกไม่อุดตัน',            // toilet
  'อ่างล้างหน้า / ฝักบัว',        // sink
  'ไม่มีน้ำรั่ว / ซึม',           // leak
  'ไม่มีกลิ่นท่อ',               // smell_drain
  'ไม่มีเชื้อรา / คราบหินปูนหนัก', // mold
  'ปลั๊ก / สวิตช์ / หลอดไฟ',      // plug
]);
function maintenanceIssuesOf(issues?: string[]): string[] {
  return (issues || []).filter(i => MAINTENANCE_ISSUE_LABELS.has(i.trim()));
}
// `damages[]` (d_smoke/d_durian/d_linen/d_missing/d_guest/d_late/d_deep/
// d_electric/d_damage/d_other) is a guest-charge reason tag set, not a work
// order — shown for context in the detail view but never used to decide
// whether a room needs a technician.

// Overlay store for repair-task tracking (status / assigned tech / notes) —
// the inspection log itself is an append-only record of what was found at
// checkout, not a mutable task tracker, so status lives separately here,
// keyed by the inspection's uid. Same Supabase project/anon-key pattern as
// UserManagement.tsx / AdminDailyDashboard.tsx.
const SUPABASE_URL = 'https://vshrmwfyanwwocftnccu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzaHJtd2Z5YW53d29jZnRuY2N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTgyMTksImV4cCI6MjA5MzUzNDIxOX0.H8zKjDtCnRxzLcV2k-NsSIqJe0k_JkS-_zTtBaHCaGo';
const SB_HEADERS = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};
async function sbGet(table: string, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: SB_HEADERS });
  return res.json();
}
async function sbUpsert(table: string, body: object) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body),
  });
}
// NOTE: requires a `repair_status` table in Supabase — create once:
//   uid text primary key, status text default 'pending', assigned_to text,
//   notes text, completed_date timestamptz, after_photos text[] default '{}'
// (RLS: same policy as the existing `users`/`login_log` tables.)

// Technician "after repair" photos are the only thing this component writes
// binary data for — everything else is JSON. Uses the Storage REST API
// directly (same anon-key pattern as sbGet/sbUpsert above) rather than the
// supabase-js SDK, to stay consistent with the rest of this file.
// Bucket `repair-photos` (public) must exist with anon insert/select policies.
async function sbUploadPhoto(uid: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${uid}-${Date.now()}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/repair-photos/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return `${SUPABASE_URL}/storage/v1/object/public/repair-photos/${path}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type RepairStatus = 'pending' | 'in_progress' | 'completed';

interface DriveLink { label: string; url: string; }

// Shape of one parsed record from the inspection log's JSON column.
interface InspectionRecord {
  uid: string;
  checkDate?: string;
  roomNum?: string;
  ota?: string;
  guestName?: string;
  inspector?: string;
  damages?: string[];
  repairs?: string[];
  issues?: string[];
  extraNote?: string;
  driveLinks?: DriveLink[];
}

interface RepairStatusRow {
  uid: string;
  status: RepairStatus;
  assigned_to?: string;
  notes?: string;
  completed_date?: string | null;
  after_photos?: string[];
}

export interface RepairItem {
  uid: string;
  room: string;
  reportedDate: string;
  reportedBy: string;
  repairs: string[];
  damages: string[];
  issues: string[];
  extraNote: string;
  photos: DriveLink[];
  status: RepairStatus;
  assignedTo: string;
  notes: string;
  completedDate?: string | null;
  afterPhotos: string[];
}

interface CurrentUser {
  role: 'admin' | 'employee' | 'maintenance' | string;
  full_name?: string;
}

interface RepairListProps {
  currentUser: CurrentUser | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function driveThumb(url: string): string {
  // https://drive.google.com/file/d/<id>/view -> a directly embeddable thumbnail
  const m = url.match(/\/file\/d\/([^/]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : url;
}

const statusStyle: Record<RepairStatus, { bg: string; fg: string; border: string }> = {
  pending:     { bg: T.brassPale, fg: T.brassDeep, border: T.hairGold },
  in_progress: { bg: '#E4E9F2',   fg: T.navy,      border: T.hair },
  completed:   { bg: T.sageTint,  fg: T.sage,      border: `${T.sage}30` },
};

function StatusIcon({ status }: { status: RepairStatus }) {
  if (status === 'completed') return <CheckCircle2 size={14} />;
  if (status === 'in_progress') return <Clock size={14} />;
  return <AlertCircle size={14} />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RepairList({ currentUser }: RepairListProps) {
  const { t } = useLang();
  const hasAccess = currentUser?.role === 'admin' || currentUser?.role === 'maintenance';

  const [items, setItems] = useState<RepairItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RepairStatus | 'all'>('all');
  const [selected, setSelected] = useState<RepairItem | null>(null);
  const [lastRefresh, setLastRefresh] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [historyRes, statusRows] = await Promise.all([
        fetch(`${INSPECTION_GAS_URL}?action=getHistory`, { redirect: 'follow' }).then(r => r.json()),
        sbGet('repair_status') as Promise<RepairStatusRow[]>,
      ]);

      const records: InspectionRecord[] = historyRes?.data || [];
      const statusByUid: Record<string, RepairStatusRow> = {};
      if (Array.isArray(statusRows)) {
        for (const row of statusRows) statusByUid[row.uid] = row;
      }

      const withWork = records.filter(
        r => (r.repairs && r.repairs.length > 0) || maintenanceIssuesOf(r.issues).length > 0
      );

      const mapped: RepairItem[] = withWork.map(r => {
        const st = statusByUid[r.uid];
        return {
          uid: r.uid,
          room: r.roomNum || '',
          reportedDate: r.checkDate || '',
          reportedBy: r.inspector || '',
          repairs: r.repairs || [],
          damages: r.damages || [],
          issues: maintenanceIssuesOf(r.issues),
          extraNote: r.extraNote || '',
          photos: r.driveLinks || [],
          status: st?.status || 'pending',
          assignedTo: st?.assigned_to || '',
          notes: st?.notes || '',
          completedDate: st?.completed_date,
          afterPhotos: st?.after_photos || [],
        };
      });

      setItems(mapped);
      setLastRefresh(new Date().toLocaleTimeString('en-GB'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasAccess) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  const filtered = useMemo(() => {
    const list = statusFilter === 'all' ? items : items.filter(i => i.status === statusFilter);
    const rank: Record<RepairStatus, number> = { pending: 0, in_progress: 1, completed: 2 };
    return [...list].sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return b.reportedDate.localeCompare(a.reportedDate);
    });
  }, [items, statusFilter]);

  async function persist(uid: string, patch: Partial<RepairStatusRow>) {
    const current = items.find(i => i.uid === uid);
    if (!current) return;
    const next: RepairItem = {
      ...current,
      status: (patch.status as RepairStatus) ?? current.status,
      assignedTo: patch.assigned_to ?? current.assignedTo,
      notes: patch.notes ?? current.notes,
      // explicit key check (not `??`) so passing `completed_date: null` to
      // reopen a completed item actually clears it, instead of `null`
      // being treated as "not provided" and falling back to the old value.
      completedDate: 'completed_date' in patch ? (patch.completed_date ?? undefined) : current.completedDate,
      afterPhotos: patch.after_photos ?? current.afterPhotos,
    };
    setItems(prev => prev.map(i => (i.uid === uid ? next : i)));
    setSelected(prev => (prev && prev.uid === uid ? next : prev));
    await sbUpsert('repair_status', {
      uid,
      status: next.status,
      assigned_to: next.assignedTo,
      notes: next.notes,
      completed_date: next.completedDate || null,
      after_photos: next.afterPhotos,
    });
  }

  const [uploadingUid, setUploadingUid] = useState<string | null>(null);

  async function addAfterPhoto(uid: string, file: File) {
    setUploadingUid(uid);
    try {
      const url = await sbUploadPhoto(uid, file);
      const current = items.find(i => i.uid === uid);
      const nextPhotos = [...(current?.afterPhotos || []), url];
      await persist(uid, { after_photos: nextPhotos });
    } catch (e) {
      alert(t('repair_upload_failed'));
      console.error(e);
    } finally {
      setUploadingUid(null);
    }
  }

  async function removeAfterPhoto(uid: string, index: number) {
    if (!confirm(t('repair_photo_delete_confirm'))) return;
    const current = items.find(i => i.uid === uid);
    const nextPhotos = (current?.afterPhotos || []).filter((_, i) => i !== index);
    await persist(uid, { after_photos: nextPhotos });
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-16" style={{ color: T.inkSoft }}>
        <Wrench size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
        <p className="f-thai text-sm">{t('repair_no_access')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="f-display flex items-center gap-2" style={{ fontSize: 19, fontWeight: 700, color: T.ink }}>
            <Wrench size={19} /> {t('repair_title')}
          </h1>
          <p className="f-thai text-sm" style={{ color: T.inkSoft }}>{t('repair_subtitle')}</p>
        </div>
        <button onClick={load} className="press focus-ring flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs f-thai"
          style={{ background: T.card, border: `1px solid ${T.hair}`, color: T.inkSoft }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {t('cal_refresh')}
        </button>
      </div>
      {lastRefresh && <div className="text-xs f-thai" style={{ color: T.inkSoft }}>{t('cal_updated')}: {lastRefresh}</div>}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={15} style={{ color: T.inkSoft }} />
        {(['all', 'pending', 'in_progress', 'completed'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="press focus-ring px-3 py-1 rounded-full text-xs f-thai font-semibold"
            style={{
              background: statusFilter === s ? T.navy : T.card,
              color: statusFilter === s ? '#fff' : T.inkSoft,
              border: `1px solid ${statusFilter === s ? T.navy : T.hair}`,
            }}>
            {s === 'all' ? t('repair_filter_all') : t(`repair_status_${s}`)}
          </button>
        ))}
      </div>

      {error && <p className="text-sm" style={{ color: T.wine }}>{error}</p>}
      {!loading && filtered.length === 0 && !error && (
        <p className="f-thai text-sm text-center py-10" style={{ color: T.inkSoft }}>{t('repair_empty')}</p>
      )}

      {/* List */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(item => {
          const ss = statusStyle[item.status];
          return (
            <button key={item.uid} onClick={() => setSelected(item)}
              className="press focus-ring text-left rounded-xl p-3"
              style={{ background: T.card, border: `1px solid ${T.hair}`, boxShadow: '0 4px 14px rgba(11,30,66,0.06)' }}>
              <div className="f-display" style={{ fontWeight: 700, color: T.ink, fontSize: 15 }}>
                {t('cal_room_word')} {item.room}
              </div>
              <div className="f-thai text-sm mt-0.5 line-clamp-2" style={{ color: T.inkSoft }}>
                {[...item.issues, ...item.repairs, ...item.damages].join(' · ') || item.extraNote}
              </div>
              {(item.photos.length > 0 || item.afterPhotos.length > 0) && (
                <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: T.inkSoft }}>
                  {item.photos.length > 0 && (
                    <span className="flex items-center gap-1"><Camera size={12} /> {item.photos.length}</span>
                  )}
                  {item.afterPhotos.length > 0 && (
                    <span className="flex items-center gap-1" style={{ color: T.sage }}>
                      <CheckCircle2 size={12} /> {item.afterPhotos.length}
                    </span>
                  )}
                </div>
              )}
              <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs f-thai font-semibold"
                style={{ background: ss.bg, color: ss.fg, border: `1px solid ${ss.border}` }}>
                <StatusIcon status={item.status} /> {t(`repair_status_${item.status}`)}
              </div>
              {item.assignedTo && (
                <div className="flex items-center gap-1 mt-1.5 text-xs f-thai font-medium" style={{ color: T.navy }}>
                  <UserCog size={12} /> {item.assignedTo}
                </div>
              )}
              <div className="text-xs f-thai mt-1" style={{ color: T.inkSoft }}>
                {item.reportedDate} · {item.reportedBy}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail sheet */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(11,30,66,0.4)' }}>
          <div className="w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto"
            style={{ background: T.paper }}>
            <div className="flex items-start justify-between mb-3">
              <h2 className="f-display" style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>
                {t('cal_room_word')} {selected.room}
              </h2>
              <button onClick={() => setSelected(null)} style={{ color: T.inkSoft }}><X size={20} /></button>
            </div>

            {selected.issues.length > 0 && (
              <div className="mb-2">
                <div className="text-xs f-thai font-semibold" style={{ color: T.navy }}>{t('repair_field_issues')}</div>
                <p className="f-thai text-sm" style={{ color: T.ink }}>{selected.issues.join(', ')}</p>
              </div>
            )}
            {selected.repairs.length > 0 && (
              <div className="mb-2">
                <div className="text-xs f-thai font-semibold" style={{ color: T.brassDeep }}>{t('repair_field_repairs')}</div>
                <p className="f-thai text-sm" style={{ color: T.ink }}>{selected.repairs.join(', ')}</p>
              </div>
            )}
            {selected.damages.length > 0 && (
              <div className="mb-2">
                <div className="text-xs f-thai font-semibold" style={{ color: T.wine }}>{t('repair_field_damages')}</div>
                <p className="f-thai text-sm" style={{ color: T.ink }}>{selected.damages.join(', ')}</p>
              </div>
            )}
            {selected.extraNote && (
              <p className="f-thai text-sm mb-2" style={{ color: T.inkSoft }}>{selected.extraNote}</p>
            )}

            {selected.photos.length > 0 && (
              <div className="mb-3">
                <div className="text-xs f-thai font-semibold mb-1" style={{ color: T.inkSoft }}>
                  {t('repair_photo_before')}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {selected.photos.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer">
                      <img src={driveThumb(p.url)} alt={p.label} className="rounded-lg object-cover aspect-square w-full" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-3">
              <div className="text-xs f-thai font-semibold mb-1" style={{ color: T.sage }}>
                {t('repair_photo_after')}
              </div>
              {selected.afterPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {selected.afterPhotos.map((url, i) => (
                    <div key={i} className="relative">
                      <a href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`after-${i}`} className="rounded-lg object-cover aspect-square w-full" />
                      </a>
                      <button
                        type="button"
                        className="press absolute top-1 right-1 flex items-center justify-center rounded-full"
                        style={{ width: 22, height: 22, background: 'rgba(0,0,0,0.55)', color: '#fff' }}
                        onClick={() => removeAfterPhoto(selected.uid, i)}
                        aria-label="delete photo"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label
                className="press focus-ring inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs f-thai font-semibold cursor-pointer"
                style={{ background: T.card, border: `1px solid ${T.hair}`, color: T.inkSoft }}
              >
                {uploadingUid === selected.uid ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Camera size={13} />
                )}
                {uploadingUid === selected.uid ? t('repair_uploading') : t('repair_upload_after')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingUid === selected.uid}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) addAfterPhoto(selected.uid, file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <div className="text-sm f-thai space-y-1 my-3" style={{ color: T.inkSoft }}>
              <div>{t('repair_reported_by')}: {selected.reportedBy}</div>
              <div>{t('repair_reported_date')}: {selected.reportedDate}</div>
              {selected.completedDate && (
                <div>{t('repair_status_completed')}: {new Date(selected.completedDate).toLocaleString()}</div>
              )}
            </div>

            <label className="text-xs f-thai" style={{ color: T.inkSoft }}>{t('repair_assigned_to')}</label>
            <input defaultValue={selected.assignedTo} placeholder={t('repair_assign_placeholder')}
              onBlur={e => persist(selected.uid, { assigned_to: e.target.value })}
              className="w-full rounded-lg px-3 py-1.5 text-sm f-thai mb-3"
              style={{ border: `1px solid ${T.hair}`, background: T.card, color: T.ink }} />

            <label className="text-xs f-thai" style={{ color: T.inkSoft }}>{t('repair_notes')}</label>
            <textarea defaultValue={selected.notes} placeholder={t('repair_notes_placeholder')} rows={2}
              onBlur={e => persist(selected.uid, { notes: e.target.value })}
              className="w-full rounded-lg px-3 py-1.5 text-sm f-thai mb-4"
              style={{ border: `1px solid ${T.hair}`, background: T.card, color: T.ink }} />

            <div className="flex gap-2">
              {selected.status === 'pending' && (
                <button onClick={() => persist(selected.uid, { status: 'in_progress' })}
                  className="press focus-ring flex-1 rounded-lg py-2 text-sm f-thai font-semibold"
                  style={{ background: T.navy, color: '#fff' }}>
                  {t('repair_mark_in_progress')}
                </button>
              )}
              {selected.status !== 'completed' && (
                <button onClick={() => persist(selected.uid, { status: 'completed', completed_date: new Date().toISOString() })}
                  className="press focus-ring flex-1 rounded-lg py-2 text-sm f-thai font-semibold"
                  style={{ background: T.sage, color: '#fff' }}>
                  {t('repair_mark_completed')}
                </button>
              )}
              {selected.status === 'completed' && (
                <button onClick={() => persist(selected.uid, { status: 'in_progress', completed_date: null })}
                  className="press focus-ring flex-1 rounded-lg py-2 text-sm f-thai font-semibold"
                  style={{ background: T.card, color: T.navy, border: `1px solid ${T.hair}` }}>
                  {t('repair_reopen')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
