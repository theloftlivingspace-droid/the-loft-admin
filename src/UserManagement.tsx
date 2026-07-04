import { useState, useEffect } from 'react';
import { useLang } from './LanguageContext';
import { T } from './theme';
import { Shield, Users2 } from 'lucide-react';

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
async function sbInsert(table: string, body: object) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}
async function sbUpdate(table: string, params: string, body: object) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}
async function sbDelete(table: string, params: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'DELETE',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
  });
}

interface User {
  id: number;
  full_name: string;
  username: string;
  password: string;
  role: 'admin' | 'employee';
}

export default function UserManagement() {
  const { t } = useLang();
  const [users, setUsers]           = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showPw, setShowPw]         = useState<Record<number, boolean>>({});
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [editDraft, setEditDraft]   = useState<Partial<User>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser]       = useState({ full_name: '', username: '', password: '', role: 'employee' as 'admin' | 'employee' });
  const [busy, setBusy]             = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await sbGet('users', 'select=*&order=role.asc,full_name.asc');
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  function startEdit(u: User) {
    setEditingId(u.id);
    setEditDraft({ full_name: u.full_name, username: u.username, password: u.password, role: u.role });
  }

  async function saveEdit(id: number) {
    if (!editDraft.username || !editDraft.password || !editDraft.full_name) {
      alert(t('um_fill_required'));
      return;
    }
    setBusy(true);
    await sbUpdate('users', `id=eq.${id}`, editDraft);
    setEditingId(null);
    setEditDraft({});
    await loadUsers();
    setBusy(false);
  }

  async function deleteUser(u: User) {
    if (!confirm(`${t('um_delete_confirm')} "${u.full_name}" (${u.username}) ${t('um_confirm_suffix')}`)) return;
    setBusy(true);
    await sbDelete('users', `id=eq.${u.id}`);
    await loadUsers();
    setBusy(false);
  }

  async function addUser() {
    if (!newUser.username || !newUser.password || !newUser.full_name) {
      alert(t('um_fill_required'));
      return;
    }
    setBusy(true);
    const existing = await sbGet('users', `username=eq.${encodeURIComponent(newUser.username)}`);
    if (Array.isArray(existing) && existing.length > 0) {
      alert(t('um_username_exists'));
      setBusy(false);
      return;
    }
    await sbInsert('users', newUser);
    setNewUser({ full_name: '', username: '', password: '', role: 'employee' });
    setShowAddForm(false);
    await loadUsers();
    setBusy(false);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="f-display text-xl font-semibold" style={{ color: T.ink }}>{t('um_title')}</h2>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="press focus-ring f-thai px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: T.navy, color: '#fff' }}>
          {showAddForm ? t('um_cancel') : t('um_add_account')}
        </button>
      </div>

      {showAddForm && (
        <div className="rounded-2xl p-4 mb-5 space-y-3" style={{ background: T.navyTint, border: `1px solid ${T.hairGold}` }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="f-thai block text-xs font-medium mb-1" style={{ color: T.inkSoft }}>{t('um_full_name')}</label>
              <input value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })}
                className="focus-ring w-full rounded-xl px-3 py-2 text-sm" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('um_placeholder_emp_name')} />
            </div>
            <div>
              <label className="f-thai block text-xs font-medium mb-1" style={{ color: T.inkSoft }}>Username</label>
              <input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                className="focus-ring w-full rounded-xl px-3 py-2 text-sm" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="username" />
            </div>
            <div>
              <label className="f-thai block text-xs font-medium mb-1" style={{ color: T.inkSoft }}>Password</label>
              <input value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                className="focus-ring w-full rounded-xl px-3 py-2 text-sm" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="password" />
            </div>
            <div>
              <label className="f-thai block text-xs font-medium mb-1" style={{ color: T.inkSoft }}>Role</label>
              <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'employee' })}
                className="focus-ring w-full rounded-xl px-3 py-2 text-sm" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }}>
                <option value="employee">employee</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
          <button onClick={addUser} disabled={busy}
            className="press focus-ring f-thai px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: T.sage, color: '#fff' }}>
            {t('um_save_new_account')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="f-thai text-center py-10" style={{ color: T.inkSoft }}>{t('um_loading')}</div>
      ) : users.length === 0 ? (
        <div className="f-thai text-center py-10" style={{ color: T.inkSoft }}>{t('um_no_accounts')}</div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              {editingId === u.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input value={editDraft.full_name ?? ''} onChange={e => setEditDraft({ ...editDraft, full_name: e.target.value })}
                      className="focus-ring rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('um_full_name')} />
                    <input value={editDraft.username ?? ''} onChange={e => setEditDraft({ ...editDraft, username: e.target.value })}
                      className="focus-ring rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="username" />
                    <input value={editDraft.password ?? ''} onChange={e => setEditDraft({ ...editDraft, password: e.target.value })}
                      className="focus-ring rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="password" />
                    <select value={editDraft.role ?? 'employee'} onChange={e => setEditDraft({ ...editDraft, role: e.target.value as 'admin' | 'employee' })}
                      className="focus-ring rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }}>
                      <option value="employee">employee</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(u.id)} disabled={busy}
                      className="press focus-ring f-thai px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                      style={{ background: T.navy, color: '#fff' }}>
                      {t('um_save')}
                    </button>
                    <button onClick={() => { setEditingId(null); setEditDraft({}); }}
                      className="press focus-ring f-thai px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
                      {t('um_cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 34, height: 34, background: T.navyTint }}>
                      {u.role === 'admin' ? <Shield size={15} color={T.navy} /> : <Users2 size={15} color={T.navy} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="f-thai font-semibold" style={{ color: T.ink }}>{u.full_name}</span>
                        <span className="f-thai text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={u.role === 'admin' ? { background: T.brassPale, color: T.brassDeep } : { background: T.navyTint, color: T.inkSoft }}>
                          {u.role}
                        </span>
                      </div>
                      <div className="f-thai text-sm mt-0.5" style={{ color: T.inkSoft }}>
                        Username: <span className="f-num">{u.username}</span>
                      </div>
                      <div className="f-thai text-sm flex items-center gap-1" style={{ color: T.inkSoft }}>
                        Password:{' '}
                        <span className="f-num">
                          {showPw[u.id] ? u.password : '•'.repeat(Math.max(u.password?.length ?? 6, 6))}
                        </span>
                        <button onClick={() => setShowPw(s => ({ ...s, [u.id]: !s[u.id] }))}
                          className="press text-xs ml-1 underline" style={{ color: T.navy }}>
                          {showPw[u.id] ? t('um_hide') : t('um_show')}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => startEdit(u)}
                      className="press focus-ring f-thai px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
                      {t('um_edit')}
                    </button>
                    <button onClick={() => deleteUser(u)} disabled={busy}
                      className="press focus-ring f-thai px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                      style={{ border: `1px solid ${T.wine}40`, color: T.wine }}>
                      {t('um_delete')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
