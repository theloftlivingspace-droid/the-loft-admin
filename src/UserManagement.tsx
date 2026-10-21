import { useState, useEffect } from 'react';
import { useLang } from './LanguageContext';
import { T } from './theme';
import { Shield, Users2, Wrench } from 'lucide-react';
import { sbGet, sbInsert, sbUpdate, sbDelete } from './api';

interface User {
  id: number;
  full_name: string;
  username: string;
  password?: string; // write-only: the server never returns passwords
  role: 'admin' | 'employee' | 'maintenance' | 'frontdesk';
}

export default function UserManagement() {
  const { t } = useLang();
  const [users, setUsers]           = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [editDraft, setEditDraft]   = useState<Partial<User>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser]       = useState({ full_name: '', username: '', password: '', role: 'employee' as 'admin' | 'employee' | 'maintenance' | 'frontdesk' });
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
    setEditDraft({ full_name: u.full_name, username: u.username, password: '', role: u.role });
  }

  async function saveEdit(id: number) {
    if (!editDraft.username || !editDraft.full_name) {
      alert(t('um_fill_required'));
      return;
    }
    setBusy(true);
    // blank password = keep the current one
    const { password: newPw, ...rest } = editDraft;
    await sbUpdate('users', `id=eq.${id}`, newPw ? { ...rest, password: newPw } : rest);
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
              <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'employee' | 'maintenance' | 'frontdesk' })}
                className="focus-ring w-full rounded-xl px-3 py-2 text-sm" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }}>
                <option value="employee">employee</option>
                <option value="maintenance">maintenance</option>
                <option value="frontdesk">frontdesk</option>
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
                      className="focus-ring rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('um_new_password_placeholder')} />
                    <select value={editDraft.role ?? 'employee'} onChange={e => setEditDraft({ ...editDraft, role: e.target.value as 'admin' | 'employee' | 'maintenance' | 'frontdesk' })}
                      className="focus-ring rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }}>
                      <option value="employee">employee</option>
                      <option value="maintenance">maintenance</option>
                <option value="frontdesk">frontdesk</option>
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
                      {u.role === 'admin' ? <Shield size={15} color={T.navy} /> : u.role === 'maintenance' ? <Wrench size={15} color={T.navy} /> : <Users2 size={15} color={T.navy} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="f-thai font-semibold" style={{ color: T.ink }}>{u.full_name}</span>
                        <span className="f-thai text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={u.role === 'admin' ? { background: T.brassPale, color: T.brassDeep } : u.role === 'maintenance' ? { background: T.sageTint, color: T.sage } : { background: T.navyTint, color: T.inkSoft }}>
                          {u.role}
                        </span>
                      </div>
                      <div className="f-thai text-sm mt-0.5" style={{ color: T.inkSoft }}>
                        Username: <span className="f-num">{u.username}</span>
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
