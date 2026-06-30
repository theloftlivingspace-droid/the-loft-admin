import { useState, useEffect } from 'react';

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
      alert('กรุณากรอกข้อมูลให้ครบ');
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
    if (!confirm(`ลบบัญชี "${u.full_name}" (${u.username}) ใช่หรือไม่?`)) return;
    setBusy(true);
    await sbDelete('users', `id=eq.${u.id}`);
    await loadUsers();
    setBusy(false);
  }

  async function addUser() {
    if (!newUser.username || !newUser.password || !newUser.full_name) {
      alert('กรุณากรอกข้อมูลให้ครบ');
      return;
    }
    setBusy(true);
    const existing = await sbGet('users', `username=eq.${encodeURIComponent(newUser.username)}`);
    if (Array.isArray(existing) && existing.length > 0) {
      alert('Username นี้มีอยู่แล้ว');
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
        <h2 className="text-xl font-semibold text-gray-800">👥 จัดการบัญชีพนักงาน</h2>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition">
          {showAddForm ? 'ยกเลิก' : '+ เพิ่มบัญชี'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อ-นามสกุล</label>
              <input value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="ชื่อพนักงาน" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="username" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="password" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'employee' })}
                className="w-full border rounded-xl px-3 py-2 text-sm bg-white">
                <option value="employee">employee</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
          <button onClick={addUser} disabled={busy}
            className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50">
            บันทึกบัญชีใหม่
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">⏳ กำลังโหลด...</div>
      ) : users.length === 0 ? (
        <div className="text-center text-gray-400 py-10">ไม่มีบัญชีในระบบ</div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="bg-white border rounded-2xl p-4 shadow-sm">
              {editingId === u.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input value={editDraft.full_name ?? ''} onChange={e => setEditDraft({ ...editDraft, full_name: e.target.value })}
                      className="border rounded-lg px-3 py-2 text-sm" placeholder="ชื่อ-นามสกุล" />
                    <input value={editDraft.username ?? ''} onChange={e => setEditDraft({ ...editDraft, username: e.target.value })}
                      className="border rounded-lg px-3 py-2 text-sm" placeholder="username" />
                    <input value={editDraft.password ?? ''} onChange={e => setEditDraft({ ...editDraft, password: e.target.value })}
                      className="border rounded-lg px-3 py-2 text-sm" placeholder="password" />
                    <select value={editDraft.role ?? 'employee'} onChange={e => setEditDraft({ ...editDraft, role: e.target.value as 'admin' | 'employee' })}
                      className="border rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="employee">employee</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(u.id)} disabled={busy}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                      บันทึก
                    </button>
                    <button onClick={() => { setEditingId(null); setEditDraft({}); }}
                      className="px-3 py-1.5 rounded-lg border text-xs font-semibold text-gray-600 hover:bg-gray-50">
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{u.full_name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold
                        ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                        {u.role}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      Username: <span className="font-mono">{u.username}</span>
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-1">
                      Password:{' '}
                      <span className="font-mono">
                        {showPw[u.id] ? u.password : '•'.repeat(Math.max(u.password?.length ?? 6, 6))}
                      </span>
                      <button onClick={() => setShowPw(s => ({ ...s, [u.id]: !s[u.id] }))}
                        className="text-blue-500 text-xs ml-1 hover:underline">
                        {showPw[u.id] ? 'ซ่อน' : 'แสดง'}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => startEdit(u)}
                      className="px-3 py-1.5 rounded-lg border text-xs font-semibold text-gray-600 hover:bg-gray-50">
                      แก้ไข
                    </button>
                    <button onClick={() => deleteUser(u)} disabled={busy}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                      ลบ
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
