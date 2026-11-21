import { useEffect, useState } from 'react';
import { BellRing, Eye, Loader2, Save, Send } from 'lucide-react';
import { T } from './theme';
import { useLang } from './LanguageContext';
import { getAuthToken } from './auth';

type Recipients = 'admin' | 'group' | 'both';
type Cfg = {
  morning: { enabled: boolean; time: string; recipients: Recipients; includePrices: boolean; consolidated: boolean };
  evening: { enabled: boolean; time: string; onlyWhenFlagged: boolean; aiSummary: boolean };
};
type Entry = { at: string; kind: 'morning' | 'evening'; date: string; decision: 'sent' | 'skipped' | 'error'; reason: string; text: string };
type Preview = { kind: 'morning' | 'evening'; text: string; send: boolean };

const DEFAULT_CFG: Cfg = { morning: { enabled: true, time: '07:30', recipients: 'admin', includePrices: false, consolidated: true }, evening: { enabled: true, time: '18:30', onlyWhenFlagged: true, aiSummary: false } };

async function call(action: string, init?: { method?: string; body?: unknown; query?: string }) {
  const res = await fetch(`/api/daily-summary?action=${action}${init?.query ? `&${init.query}` : ''}`, {
    method: init?.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || data.ok === false || data.error) throw new Error(String(data.error || `HTTP ${res.status}`));
  return data as Record<string, unknown>;
}

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.hair}`, borderRadius: 14, padding: 16 };
const field: React.CSSProperties = { fontSize: 15, padding: '10px 12px', border: `1px solid ${T.hair}`, borderRadius: 10, minHeight: 44, background: '#fff', color: T.ink };

export default function DailySummary() {
  const { t, lang } = useLang();
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  const [saved, setSaved] = useState<Cfg>(DEFAULT_CFG);
  const [serverOn, setServerOn] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'preview-morning' | 'preview-evening' | 'send-morning' | 'send-evening'>('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [openText, setOpenText] = useState('');

  const [loadErr, setLoadErr] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, h] = await Promise.all([call('settings'), call('history', { query: 'days=14' })]);
        if (!alive) return;
        const c = s.settings as Cfg;
        setCfg(c); setSaved(c); setServerOn(s.enabled !== false);
        setEntries((h.entries as Entry[]) || []);
      } catch (e) { if (alive) setLoadErr((e as Error).message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const kindLabel = (k: 'morning' | 'evening') => (k === 'morning' ? t('ds_kind_morning') : t('ds_kind_evening'));

  const save = async () => {
    setBusy('save'); setErr(''); setNotice('');
    try { const r = await call('settings', { method: 'PUT', body: cfg }); setCfg(r.settings as Cfg); setSaved(r.settings as Cfg); setNotice(t('ds_saved')); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(''); }
  };
  const runPreview = async (kind: 'morning' | 'evening') => {
    setBusy(kind === 'morning' ? 'preview-morning' : 'preview-evening'); setErr(''); setNotice('');
    try { const r = await call('run', { method: 'POST', body: { kind, dryRun: true } }); setPreview({ kind, text: String(r.text || ''), send: r.send === true }); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(''); }
  };
  const sendNow = async (kind: 'morning' | 'evening') => {
    if (!window.confirm(t('ds_send_confirm'))) return;
    setBusy(kind === 'morning' ? 'send-morning' : 'send-evening'); setErr(''); setNotice('');
    try { await call('run', { method: 'POST', body: { kind, dryRun: false } }); setNotice(t('ds_sent_ok')); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(''); }
  };

  const Spin = <Loader2 size={14} className="animate-spin" />;
  const timeOf = (iso: string) => { try { return new Date(iso).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const chip = (d: Entry['decision']) => ({
    sent: { bg: T.sageTint, fg: T.sage, label: t('ds_sent') },
    skipped: { bg: T.navyTint, fg: T.inkSoft, label: t('ds_skipped') },
    error: { bg: T.wineTint, fg: T.wine, label: t('ds_error') },
  }[d]);

  const section = (kind: 'morning' | 'evening') => {
    const c = cfg[kind];
    const set = (patch: Partial<Cfg['morning'] & Cfg['evening']>) => setCfg({ ...cfg, [kind]: { ...c, ...patch } } as Cfg);
    const chk = (checked: boolean, onChange: (v: boolean) => void, label: string, hint: string) => (
      <div style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 15 }}>
          <input type="checkbox" checked={checked} disabled={!c.enabled} onChange={e => onChange(e.target.checked)} style={{ width: 20, height: 20 }} />
          {label}
        </label>
        <div style={{ fontSize: 12, color: T.inkSoft, marginLeft: 30 }}>{hint}</div>
      </div>
    );
    return (
      <div style={card} className="f-thai">
        <div style={{ fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 8 }}>{kindLabel(kind)}</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 15 }}>
          <input type="checkbox" checked={c.enabled} onChange={e => set({ enabled: e.target.checked })} style={{ width: 20, height: 20 }} />
          {t('ds_enabled')}
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0' }}>
          <label htmlFor={`ds-time-${kind}`} style={{ fontSize: 13, color: T.inkSoft }}>{t('ds_time')}</label>
          <input id={`ds-time-${kind}`} type="time" value={c.time} disabled={!c.enabled} onChange={e => set({ time: e.target.value })} style={{ ...field, maxWidth: 160 }} />
        </div>
        {kind === 'morning' && (
          <>
            <div style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="ds-recipients" style={{ fontSize: 13, color: T.inkSoft }}>{t('ds_recipients')}</label>
              <select id="ds-recipients" value={cfg.morning.recipients} disabled={!c.enabled} onChange={e => setCfg({ ...cfg, morning: { ...cfg.morning, recipients: e.target.value as Recipients } })} style={{ ...field, maxWidth: 360 }}>
                <option value="admin">{t('ds_rec_admin')}</option>
                <option value="group">{t('ds_rec_group')}</option>
                <option value="both">{t('ds_rec_both')}</option>
              </select>
              <div style={{ fontSize: 12, color: T.inkSoft }}>{t('ds_rec_hint')}</div>
            </div>
            {chk(cfg.morning.includePrices, v => setCfg({ ...cfg, morning: { ...cfg.morning, includePrices: v } }), t('ds_include_prices'), t('ds_include_prices_hint'))}
            {cfg.morning.consolidated && chk(cfg.evening.aiSummary, v => setCfg({ ...cfg, evening: { ...cfg.evening, aiSummary: v } }), t('ds_ai_summary'), t('ds_ai_summary_morning_hint'))}
          </>
        )}
        {kind === 'evening' && (
          <>
            {chk(cfg.evening.onlyWhenFlagged, v => setCfg({ ...cfg, evening: { ...cfg.evening, onlyWhenFlagged: v } }), t('ds_only_flagged'), t('ds_only_flagged_hint'))}
            {chk(cfg.evening.aiSummary, v => setCfg({ ...cfg, evening: { ...cfg.evening, aiSummary: v } }), t('ds_ai_summary'), t('ds_ai_summary_hint'))}
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={() => runPreview(kind)} disabled={!!busy} className="press focus-ring" style={{ ...field, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
            {busy === `preview-${kind}` ? Spin : <Eye size={14} />}{t('ds_preview')}
          </button>
          <button onClick={() => sendNow(kind)} disabled={!!busy} className="press focus-ring" style={{ ...field, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
            {busy === `send-${kind}` ? Spin : <Send size={14} />}{t('ds_send_now')}
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <div className="p-6 f-thai" style={{ color: T.inkSoft }}>{t('ds_loading')}</div>;

  return (
    <div className="px-4 md:px-8 pt-5 f-thai" style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 'calc(120px + env(safe-area-inset-bottom))' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 22, fontWeight: 700, color: T.ink }}><BellRing size={20} />{t('ds_title')}</div>
        <div style={{ fontSize: 13, color: T.inkSoft }}>{t('ds_subtitle')}</div>
      </div>

      {!serverOn && <div role="alert" style={{ background: T.brassPale, color: T.brassDeep, borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{t('ds_server_off')}</div>}
      {loadErr && <div role="alert" style={{ background: T.wineTint, color: T.wine, borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{t('ds_load_failed')}: {loadErr}</div>}
      {err && <div role="alert" style={{ background: T.wineTint, color: T.wine, borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{err}</div>}
      {notice && <div role="status" style={{ background: T.sageTint, color: T.sage, borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{notice}</div>}

      <div style={card} className="f-thai">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 15, fontWeight: 600 }}>
          <input type="checkbox" checked={!!cfg.morning.consolidated} onChange={e => setCfg({ ...cfg, morning: { ...cfg.morning, consolidated: e.target.checked } })} style={{ width: 20, height: 20 }} />
          {t('ds_consolidated')}
        </label>
        <div style={{ fontSize: 12, color: T.inkSoft, marginLeft: 30 }}>{t('ds_consolidated_hint')}</div>
      </div>

      {section('morning')}
      {!cfg.morning.consolidated && section('evening')}

      <div style={card}>
        <div style={{ fontSize: 13, color: T.inkSoft }}>{t('ds_recipient')}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{t('ds_recipient_val')}</div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>{t('ds_recipient_hint')}</div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={!dirty || !!busy} className="press focus-ring"
          style={{ background: dirty ? T.navy : T.navyTint, color: dirty ? '#fff' : T.inkSoft, border: 0, borderRadius: 10, minHeight: 48, padding: '0 20px', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: dirty ? 'pointer' : 'default' }}>
          {busy === 'save' ? Spin : <Save size={16} />}{t('ds_save')}
        </button>
      </div>

      {preview && (
        <div style={card}>
          <div style={{ fontWeight: 700, color: T.ink }}>{t('ds_preview_title')} — {kindLabel(preview.kind)}</div>
          <div style={{ fontSize: 12, color: T.inkSoft, margin: '2px 0 8px' }}>{preview.send ? t('ds_would_send') : t('ds_would_skip')}</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: T.paper, borderRadius: 10, padding: 12, margin: 0 }}>{preview.text}</pre>
          <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 6 }}>{t('ds_preview_note')}</div>
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 8 }}>{t('ds_history')}</div>
        {entries.length === 0 && <div style={{ fontSize: 13, color: T.inkSoft }}>{t('ds_history_empty')}</div>}
        {entries.map(e => {
          const c = chip(e.decision); const k = `${e.date}-${e.kind}`;
          return (
            <div key={k} style={{ borderTop: `1px solid ${T.hair}`, padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{e.date}</span>
                <span style={{ fontSize: 13, color: T.inkSoft }}>{kindLabel(e.kind)} · {timeOf(e.at)}</span>
                <span style={{ background: c.bg, color: c.fg, borderRadius: 8, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{c.label}</span>
              </div>
              {e.reason && <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{e.reason}</div>}
              {e.text && (
                <>
                  <button onClick={() => setOpenText(openText === k ? '' : k)} className="press focus-ring" style={{ fontSize: 12, color: T.navy, background: 'none', border: 0, padding: '6px 0', minHeight: 32, cursor: 'pointer', textDecoration: 'underline' }}>{t('ds_view_text')}</button>
                  {openText === k && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: T.paper, borderRadius: 10, padding: 10, margin: 0 }}>{e.text}</pre>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
