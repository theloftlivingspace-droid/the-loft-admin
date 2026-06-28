// CarRegistration.tsx — ตรวจสอบทะเบียนรถ
// Data stored in Supabase: settings table, key='car_registration'

import { useState, useEffect } from 'react';

const SUPABASE_URL = 'https://vshrmwfyanwwocftnccu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzaHJtd2Z5YW53d29jZnRuY2N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTgyMTksImV4cCI6MjA5MzUzNDIxOX0.H8zKjDtCnRxzLcV2k-NsSIqJe0k_JkS-_zTtBaHCaGo';
const SB_HEADERS = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Prefer: 'resolution=merge-duplicates',
};

interface CarEntry {
  id: string;       // uuid
  room: string;     // ห้อง หรือ 'นอก'
  plate: string;    // ทะเบียน
  isOutside: boolean;
  note: string;
}

const INITIAL_DATA: CarEntry[] = [
  // ผู้เช่าในตึก
  { id: 'r306-1', room: '306', plate: '7051', isOutside: false, note: '' },
  { id: 'r308-1', room: '308', plate: '8365', isOutside: false, note: '' },
  { id: 'r315-1', room: '315', plate: '7555', isOutside: false, note: '' },
  { id: 'r315-2', room: '315', plate: '0264', isOutside: false, note: '' },
  { id: 'r406-1', room: '406', plate: '691',  isOutside: false, note: '' },
  { id: 'r409-1', room: '409', plate: '617',  isOutside: false, note: '' },
  { id: 'r410-1', room: '410', plate: '5372', isOutside: false, note: '' },
  { id: 'r414-1', room: '414', plate: '533',  isOutside: false, note: '' },
  { id: 'r414-2', room: '414', plate: '5612', isOutside: false, note: '' },
  { id: 'r506-1', room: '506', plate: '8318', isOutside: false, note: '' },
  { id: 'r513-1', room: '513', plate: '4977', isOutside: false, note: '' },
  { id: 'r515-1', room: '515', plate: '4221', isOutside: false, note: '' },
  // คนนอก
  { id: 'o306-1', room: '306', plate: '1138', isOutside: true, note: '' },
  { id: 'o308-1', room: '308', plate: '1764', isOutside: true, note: '' },
  { id: 'o308-2', room: '308', plate: '8823', isOutside: true, note: '' },
  { id: 'o315-1', room: '315', plate: '3204', isOutside: true, note: '' },
  { id: 'o406-1', room: '406', plate: '6423', isOutside: true, note: '' },
  { id: 'o409-1', room: '409', plate: '7238', isOutside: true, note: '' },
  { id: 'o410-1', room: '410', plate: '5112', isOutside: true, note: '' },
  { id: 'o414-1', room: '414', plate: '3250', isOutside: true, note: '' },
  { id: 'o414-2', room: '414', plate: '8450', isOutside: true, note: '' },
  { id: 'o506-1', room: '506', plate: '6106', isOutside: true, note: '' },
  { id: 'o513-1', room: '513', plate: '4236', isOutside: true, note: '' },
  { id: 'o515-1', room: '515', plate: '8164', isOutside: true, note: '' },
  { id: 'o000-1', room: '',   plate: '1745', isOutside: true, note: '' },
];

async function loadFromSB(): Promise<CarEntry[] | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/settings?key=eq.car_registration&select=value`,
      { headers: SB_HEADERS }
    );
    const rows = await res.json();
    if (rows?.[0]?.value) return JSON.parse(rows[0].value);
  } catch { /* fall through */ }
  return null;
}

async function saveToDB(entries: CarEntry[]) {
  await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify({ key: 'car_registration', value: JSON.stringify(entries) }),
  });
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function CarRegistration() {
  const [entries, setEntries]   = useState<CarEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const [newRoom, setNewRoom]   = useState('');
  const [newPlate, setNewPlate] = useState('');
  const [newOutside, setNewOutside] = useState(false);
  const [newNote, setNewNote]   = useState('');

  useEffect(() => {
    loadFromSB().then(data => {
      setEntries(data ?? INITIAL_DATA);
      setLoading(false);
    });
  }, []);

  const save = async (next: CarEntry[]) => {
    setEntries(next);
    setSaving(true);
    await saveToDB(next);
    setSaving(false);
  };

  const addEntry = async () => {
    if (!newPlate.trim()) return;
    const entry: CarEntry = {
      id: uid(),
      room: newRoom.trim(),
      plate: newPlate.trim().toUpperCase(),
      isOutside: newOutside,
      note: newNote.trim(),
    };
    await save([...entries, entry]);
    setNewRoom(''); setNewPlate(''); setNewOutside(false); setNewNote('');
    setShowAdd(false);
  };

  const removeEntry = async (id: string) => {
    await save(entries.filter(e => e.id !== id));
  };

  const filtered = entries.filter(e =>
    !search ||
    e.plate.toLowerCase().includes(search.toLowerCase()) ||
    e.room.includes(search)
  );

  // group by room for inside, flat list for outside
  const inside  = filtered.filter(e => !e.isOutside);
  const outside = filtered.filter(e =>  e.isOutside);

  // rooms sorted
  const rooms = [...new Set(inside.map(e => e.room))].sort();

  if (loading) return (
    <div className="text-sm text-gray-400 py-4 text-center">กำลังโหลด...</div>
  );

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-3xl p-6 mb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h2 className="text-xl font-semibold text-gray-800">🚗 ทะเบียนจอดรถ</h2>
        <div className="flex gap-2 flex-wrap">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาทะเบียน / ห้อง"
            className="border rounded-xl px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={() => setShowAdd(v => !v)}
            className="px-4 py-1.5 bg-blue-700 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition"
          >
            + เพิ่มรถ
          </button>
          {saving && <span className="text-xs text-gray-400 self-center">กำลังบันทึก...</span>}
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border border-blue-200 rounded-2xl p-4 mb-5 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ห้อง</label>
            <input value={newRoom} onChange={e => setNewRoom(e.target.value)}
              placeholder="เช่น 306" className="border rounded-xl px-3 py-2 text-sm w-24 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ทะเบียน *</label>
            <input value={newPlate} onChange={e => setNewPlate(e.target.value)}
              placeholder="เช่น กก 1234" className="border rounded-xl px-3 py-2 text-sm w-32 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
            <input value={newNote} onChange={e => setNewNote(e.target.value)}
              placeholder="ไม่บังคับ" className="border rounded-xl px-3 py-2 text-sm w-36 focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <input type="checkbox" id="outside-chk" checked={newOutside} onChange={e => setNewOutside(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <label htmlFor="outside-chk" className="text-sm text-gray-600">คนนอก</label>
          </div>
          <button onClick={addEntry}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition">
            บันทึก
          </button>
          <button onClick={() => setShowAdd(false)}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 transition">
            ยกเลิก
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ผู้เช่าในตึก */}
        <div className="bg-white border rounded-2xl p-4">
          <h3 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
            ผู้เช่าในตึก
            <span className="ml-auto text-xs text-gray-400 font-normal">{inside.length} คัน</span>
          </h3>
          <div className="space-y-1.5">
            {rooms.map(room => (
              <div key={room}>
                <div className="text-xs font-semibold text-gray-500 px-1 pt-1">ห้อง {room}</div>
                {inside.filter(e => e.room === room).map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2 mt-1">
                    <span className="font-mono text-sm font-bold text-blue-800 tracking-wide">{e.plate}</span>
                    <div className="flex items-center gap-2">
                      {e.note && <span className="text-xs text-gray-400">{e.note}</span>}
                      <button onClick={() => removeEntry(e.id)}
                        className="text-gray-300 hover:text-red-500 transition text-xs px-1">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {inside.length === 0 && <p className="text-xs text-gray-400 py-2 text-center">ไม่มีข้อมูล</p>}
          </div>
        </div>

        {/* คนนอก */}
        <div className="bg-white border rounded-2xl p-4">
          <h3 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
            คนนอก
            <span className="ml-auto text-xs text-gray-400 font-normal">{outside.length} คัน</span>
          </h3>
          <div className="space-y-1.5">
            {outside.map(e => (
              <div key={e.id} className="flex items-center justify-between bg-amber-50 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-amber-800 tracking-wide">{e.plate}</span>
                  {e.room && <span className="text-xs text-gray-500">({e.room})</span>}
                </div>
                <div className="flex items-center gap-2">
                  {e.note && <span className="text-xs text-gray-400">{e.note}</span>}
                  <button onClick={() => removeEntry(e.id)}
                    className="text-gray-300 hover:text-red-500 transition text-xs px-1">✕</button>
                </div>
              </div>
            ))}
            {outside.length === 0 && <p className="text-xs text-gray-400 py-2 text-center">ไม่มีข้อมูล</p>}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3">ข้อมูลบันทึกอัตโนมัติใน Supabase</p>
    </div>
  );
}
