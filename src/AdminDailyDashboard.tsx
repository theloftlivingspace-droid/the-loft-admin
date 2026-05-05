import { useState, useEffect } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────
const OFFICE_IP    = '203.0.113.10'; // 🔧 เปลี่ยนเป็น IP จริงของออฟฟิศ
const SUPABASE_URL = 'https://vshrmwfyanwwocftnccu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzaHJtd2Z5YW53d29jZnRuY2N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTgyMTksImV4cCI6MjA5MzUzNDIxOX0.H8zKjDtCnRxzLcV2k-NsSIqJe0k_JkS-_zTtBaHCaGo';

// ─── Supabase helpers ─────────────────────────────────────────────────────────
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `Insert failed: ${res.status}`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface User {
  id: number;
  full_name: string;
  username: string;
  password: string;
  role: 'admin' | 'employee';
}

interface Report {
  id: number;
  date: string;
  employee: string;
  check_in_time: string;
  submit_time: string;
  status: string;
  completed_tasks: string;
  pending_tasks: string;
  issues_found: string;
  suggestions: string;
  check_in_guests: string;
  check_in_rooms: string;
  check_out_guests: string;
  check_out_rooms: string;
  tm30_status: string;
  new_bookings: string;
  new_booking_rooms: string;
  invoice_rooms: string;
  invoice_total: string;
  invoice_room_numbers: string;
  created_at?: string;
}

const TASKS = [
  'เช็คข้อความลูกค้า',
  'อัปเดต Booking',
  'ลงทะเบียนแขก Check-in',
  'ตรวจสอบรายการ Check-out',
  'ลงทะเบียน TM30',
  'บันทึกการจองเพิ่ม',
  'สร้างใบแจ้งหนี้ / ใบเสร็จ',
  'คีย์ข้อมูลรายรับ',
  'ตรวจสอบสต๊อก',
  'เตรียมเอกสาร',
  'สแกน / จัดเก็บไฟล์',
  'สรุปรายงานประจำวัน',
  'ตรวจสอบงานค้าง',
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminDailyDashboard() {
  // IP
  const [clientIP, setClientIP]     = useState('');
  const [ipLoading, setIpLoading]   = useState(true);
  const isOfficeNetwork = clientIP === OFFICE_IP;

  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then(d => setClientIP(d.ip))
      .catch(() => setClientIP('unknown'))
      .finally(() => setIpLoading(false));
  }, []);

  // Auth
  const [loggedIn, setLoggedIn]               = useState(false);
  const [username, setUsername]               = useState('');
  const [password, setPassword]               = useState('');
  const [isRegisterMode, setIsRegisterMode]   = useState(false);
  const [currentUser, setCurrentUser]         = useState<User | null>(null);
  const [fullName, setFullName]               = useState('');
  const [authLoading, setAuthLoading]         = useState(false);

  // Reports
  const [reports, setReports]                 = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading]   = useState(false);
  const [submitted, setSubmitted]             = useState(false);
  const [selectedReport, setSelectedReport]   = useState<Report | null>(null);

  // Form
  const [employeeName, setEmployeeName]       = useState('');
  const [checkInTime]                         = useState(
    new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  );
  const [completedTasks, setCompletedTasks]   = useState('');
  const [pendingTasks, setPendingTasks]       = useState('');
  const [issuesFound, setIssuesFound]         = useState('');
  const [suggestions, setSuggestions]         = useState('');
  const [checkInGuests, setCheckInGuests]     = useState('');
  const [checkInRooms, setCheckInRooms]       = useState('');
  const [checkOutGuests, setCheckOutGuests]   = useState('');
  const [checkOutRooms, setCheckOutRooms]     = useState('');
  const [tm30Status, setTm30Status]           = useState('');
  const [newBookings, setNewBookings]         = useState('');
  const [newBookingRooms, setNewBookingRooms] = useState('');
  const [invoiceRooms, setInvoiceRooms]       = useState('');
  const [invoiceTotal, setInvoiceTotal]       = useState('');
  const [invoiceRoomNumbers, setInvoiceRoomNumbers] = useState('');
  const [reportDate, setReportDate]           = useState(new Date().toISOString().split('T')[0]);

  const today = new Date().toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // โหลด reports หลัง login
  useEffect(() => {
    if (!loggedIn || !currentUser) return;
    setReportsLoading(true);
    const params = currentUser.role === 'admin'
      ? 'order=created_at.desc'
      : `employee=eq.${encodeURIComponent(currentUser.full_name)}&order=created_at.desc`;
    sbGet('reports', params)
      .then(data => setReports(Array.isArray(data) ? data : []))
      .finally(() => setReportsLoading(false));
  }, [loggedIn, currentUser]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!username || !password || !fullName) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }
    setAuthLoading(true);
    const existing = await sbGet('users', `username=eq.${encodeURIComponent(username)}`);
    if (existing.length > 0) { alert('Username นี้ถูกใช้งานแล้ว'); setAuthLoading(false); return; }
    try {
      await sbInsert('users', { full_name: fullName, username, password, role: 'employee' });
    } catch (e: unknown) {
      alert('เกิดข้อผิดพลาด: ' + (e instanceof Error ? e.message : String(e)));
      setAuthLoading(false);
      return;
    }
    alert('สมัครสมาชิกเรียบร้อยแล้ว');
    setIsRegisterMode(false);
    setFullName(''); setUsername(''); setPassword('');
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    if (!username || !password) { alert('กรุณากรอก Username และ Password'); return; }
    setAuthLoading(true);
    const results = await sbGet('users',
      `username=eq.${encodeURIComponent(username)}&password=eq.${encodeURIComponent(password)}`
    );
    setAuthLoading(false);
    if (!results || results.length === 0) { alert('Username หรือ Password ไม่ถูกต้อง'); return; }
    const matched: User = results[0];
    if (matched.role === 'employee' && !isOfficeNetwork) {
      alert('⛔ ไม่อนุญาต\nพนักงานสามารถเข้าใช้งานได้เฉพาะเครือข่ายออฟฟิศเท่านั้น');
      return;
    }
    setLoggedIn(true);
    setEmployeeName(matched.full_name);
    setCurrentUser(matched);
  };

  const handleLogout = () => {
    setLoggedIn(false); setCurrentUser(null); setSubmitted(false);
    setUsername(''); setPassword(''); setEmployeeName('');
    setCompletedTasks(''); setPendingTasks(''); setIssuesFound(''); setSuggestions('');
    setReports([]);
  };

  const handleSubmitReport = async () => {
    if (!employeeName) { alert('กรุณากรอกชื่อพนักงานก่อนส่งรายงาน'); return; }
    setAuthLoading(true);
    try {
      await sbInsert('reports', {
        date: today, employee: employeeName,
        check_in_time: checkInTime,
        submit_time: new Date().toLocaleTimeString('th-TH'),
        status: 'ส่งแล้ว',
        completed_tasks: completedTasks, pending_tasks: pendingTasks,
        issues_found: issuesFound, suggestions,
        check_in_guests: checkInGuests, check_in_rooms: checkInRooms,
        check_out_guests: checkOutGuests, check_out_rooms: checkOutRooms,
        tm30_status: tm30Status, new_bookings: newBookings, new_booking_rooms: newBookingRooms,
        invoice_rooms: invoiceRooms, invoice_total: invoiceTotal, invoice_room_numbers: invoiceRoomNumbers,
      });
    } catch (e: unknown) {
      alert('บันทึกไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e)));
      setAuthLoading(false);
      return;
    }
    // refresh
    const params = currentUser?.role === 'admin'
      ? 'order=created_at.desc'
      : `employee=eq.${encodeURIComponent(employeeName)}&order=created_at.desc`;
    const updated = await sbGet('reports', params);
    setReports(Array.isArray(updated) ? updated : []);
    setSubmitted(true);
    setAuthLoading(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─── IP Loading ────────────────────────────────────────────────────────────
  if (ipLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-amber-100 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm opacity-80">กำลังตรวจสอบเครือข่าย...</p>
        </div>
      </div>
    );
  }

  // ─── Login ─────────────────────────────────────────────────────────────────
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-amber-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-[32px] shadow-2xl p-10 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-24 h-24 rounded-[24px] bg-white flex items-center justify-center mx-auto mb-5 shadow-2xl p-2">
              <svg viewBox="0 0 200 200" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="200" height="200" rx="28" fill="#082F6B" />
                <path d="M40 135H75V70L105 45L135 70V135M92 135H160V95H142V70L105 35L68 70V117H40"
                  stroke="#D4AF37" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="92" y="82" width="12" height="12" fill="#D4AF37" />
                <rect x="108" y="82" width="12" height="12" fill="#D4AF37" />
                <rect x="92" y="98" width="12" height="12" fill="#D4AF37" />
                <rect x="108" y="98" width="12" height="12" fill="#D4AF37" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-500 to-blue-900 bg-clip-text text-transparent">
              The Loft Admin
            </h1>
            <p className="text-gray-500 mt-2 text-sm">
              {isRegisterMode ? 'สมัครสมาชิกพนักงานใหม่' : 'ระบบรายงานงานประจำวันพนักงาน'}
            </p>
          </div>

          {isOfficeNetwork && (
            <div className="flex items-center justify-center gap-2 text-xs font-medium px-4 py-2 rounded-full mb-6 mx-auto w-fit bg-green-100 text-green-700 border border-green-200">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              🏢 เครือข่ายออฟฟิศ — เข้าได้ทุก account
            </div>
          )}

          <div className="space-y-5">
            {isRegisterMode && (
              <div>
                <label className="block text-sm font-medium mb-2">ชื่อ - นามสกุล</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  className="w-full border rounded-2xl px-4 py-3" placeholder="กรอกชื่อพนักงาน" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2">Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="w-full border rounded-2xl px-4 py-3" placeholder="กรอก Username" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isRegisterMode && handleLogin()}
                className="w-full border rounded-2xl px-4 py-3" placeholder="กรอก Password" />
            </div>
            <button onClick={isRegisterMode ? handleRegister : handleLogin} disabled={authLoading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-blue-900 text-white font-semibold shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {authLoading ? '⏳ กำลังดำเนินการ...' : isRegisterMode ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
            </button>
            <button onClick={() => { setIsRegisterMode(!isRegisterMode); setUsername(''); setPassword(''); setFullName(''); }}
              className="w-full py-3 rounded-2xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition">
              {isRegisterMode ? 'กลับไปหน้าเข้าสู่ระบบ' : 'สร้างบัญชีพนักงาน'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-slate-900 to-amber-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto bg-white/95 backdrop-blur rounded-[32px] shadow-2xl border border-blue-100 p-6 md:p-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-blue-950">
              {isAdmin ? 'Admin Management Dashboard' : 'Daily Admin Dashboard'}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              {isAdmin ? 'บัญชีผู้ดูแลระบบ — ตรวจสอบรายงานของพนักงานทั้งหมดได้' : 'ระบบเช็คงานและสรุปรายงานประจำวันพนักงานธุรการ'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className={`hidden md:flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-medium
              ${isOfficeNetwork ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
              <span className={`w-2 h-2 rounded-full ${isOfficeNetwork ? 'bg-green-500' : 'bg-amber-400'}`} />
              {isOfficeNetwork ? '🏢 ออฟฟิศ' : '🌐 ออนไลน์'}
              <span className="text-gray-400 font-normal">({clientIP})</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">วันที่รายงาน</p>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm" />
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl border bg-white hover:bg-gray-50 transition shadow-sm text-sm">
              🚪 Logout
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: '👤', label: 'ผู้ใช้งาน', value: currentUser?.full_name || '-' },
            { icon: '📋', label: 'งานวันนี้', value: `${TASKS.length} รายการ` },
            { icon: '🏠', label: 'Check-in วันนี้', value: `${checkInGuests || '0'} ห้อง` },
            { icon: '📄', label: 'รายงานทั้งหมด', value: `${reports.length} ฉบับ` },
          ].map((c, i) => (
            <div key={i} className="bg-white rounded-2xl border shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{c.icon}</span>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
              <p className="text-lg font-bold truncate">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Success Banner */}
        {submitted && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 rounded-2xl px-5 py-4 font-medium text-sm">
            ✅ ส่งรายงานประจำวันเรียบร้อยแล้ว — {today}
          </div>
        )}

        {/* Employee Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-medium mb-2">ชื่อพนักงาน</label>
            <input type="text" value={employeeName} onChange={e => setEmployeeName(e.target.value)}
              className="w-full border rounded-2xl px-4 py-3" placeholder="กรอกชื่อพนักงาน" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">เวลาเข้างาน</label>
            <input type="text" value={checkInTime} disabled
              className="w-full border rounded-2xl px-4 py-3 bg-gray-100 text-gray-600 cursor-not-allowed" />
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-gradient-to-br from-blue-50 to-amber-50 rounded-3xl p-6 mb-8 border border-orange-100 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Checklist งานประจำวัน</h2>
          <div className="space-y-3">
            {TASKS.map((task, i) => (
              <div key={i} className="flex items-center justify-between bg-white rounded-2xl border p-4 hover:shadow-sm transition">
                <div className="flex items-center gap-3">
                  <input type="checkbox" className="w-5 h-5 accent-amber-500" />
                  <span className="text-gray-700 text-sm">{task}</span>
                </div>
                <select className="border rounded-xl px-3 py-2 text-sm">
                  <option value="">สถานะ</option>
                  <option>เสร็จแล้ว</option>
                  <option>กำลังดำเนินการ</option>
                  <option>รอติดตาม</option>
                  <option>มีปัญหา</option>
                </select>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="bg-white border rounded-2xl p-5">
              <h3 className="font-semibold mb-4">Check-in วันนี้</h3>
              <div className="space-y-4">
                <div><label className="block text-sm mb-2">จำนวนแขก Check-in</label>
                  <input type="number" value={checkInGuests} onChange={e => setCheckInGuests(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="0" /></div>
                <div><label className="block text-sm mb-2">ห้องที่ Check-in</label>
                  <textarea rows={3} value={checkInRooms} onChange={e => setCheckInRooms(e.target.value)} className="w-full border rounded-xl p-3" placeholder="เช่น 201, 305, 402" /></div>
              </div>
            </div>
            <div className="bg-white border rounded-2xl p-5">
              <h3 className="font-semibold mb-4">Check-out วันนี้</h3>
              <div className="space-y-4">
                <div><label className="block text-sm mb-2">จำนวนแขก Check-out</label>
                  <input type="number" value={checkOutGuests} onChange={e => setCheckOutGuests(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="0" /></div>
                <div><label className="block text-sm mb-2">ห้องที่ Check-out</label>
                  <textarea rows={3} value={checkOutRooms} onChange={e => setCheckOutRooms(e.target.value)} className="w-full border rounded-xl p-3" placeholder="เช่น 102, 208" /></div>
              </div>
            </div>
            <div className="bg-white border rounded-2xl p-5">
              <h3 className="font-semibold mb-4">TM30 & Booking</h3>
              <div className="space-y-4">
                <div><label className="block text-sm mb-2">ลงทะเบียน TM30 ครบหรือไม่</label>
                  <select value={tm30Status} onChange={e => setTm30Status(e.target.value)} className="w-full border rounded-xl px-4 py-3">
                    <option value="">เลือก</option><option>ครบแล้ว</option><option>ยังไม่ครบ</option>
                  </select></div>
                <div><label className="block text-sm mb-2">บันทึกการจองเพิ่มกี่ห้อง</label>
                  <input type="number" value={newBookings} onChange={e => setNewBookings(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="0" /></div>
                <div><label className="block text-sm mb-2">ห้องที่มีการจองเพิ่ม</label>
                  <textarea rows={3} value={newBookingRooms} onChange={e => setNewBookingRooms(e.target.value)} className="w-full border rounded-xl p-3" placeholder="เช่น 203, 301" /></div>
              </div>
            </div>
            <div className="bg-white border rounded-2xl p-5">
              <h3 className="font-semibold mb-4">Invoice & Receipt</h3>
              <div className="space-y-4">
                <div><label className="block text-sm mb-2">สร้างใบแจ้งหนี้ / ใบเสร็จกี่ห้อง</label>
                  <input type="number" value={invoiceRooms} onChange={e => setInvoiceRooms(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="0" /></div>
                <div><label className="block text-sm mb-2">ยอดรวมทั้งหมด (บาท)</label>
                  <input type="number" value={invoiceTotal} onChange={e => setInvoiceTotal(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="0.00" /></div>
                <div><label className="block text-sm mb-2">หมายเลขห้อง</label>
                  <textarea rows={3} value={invoiceRoomNumbers} onChange={e => setInvoiceRoomNumbers(e.target.value)} className="w-full border rounded-xl p-3" placeholder="เช่น 105, 302" /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Stock */}
        <div className="bg-blue-950 border border-blue-800 rounded-3xl p-6 mb-8">
          <h2 className="text-xl font-semibold text-amber-300 mb-6">ตรวจสอบสต๊อก & จัดซื้อ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border p-5">
              <h3 className="font-semibold mb-4">รายการของใกล้หมด / ต้องซื้อเพิ่ม</h3>
              <div className="space-y-4">
                <div><label className="block text-sm mb-2">รายการสินค้า</label>
                  <textarea rows={5} className="w-full border rounded-2xl p-4" placeholder="เช่น กระดาษชำระ, น้ำดื่ม, สบู่" /></div>
                <div><label className="block text-sm mb-2">จำนวนที่ต้องซื้อเพิ่ม</label>
                  <textarea rows={4} className="w-full border rounded-2xl p-4" placeholder="เช่น กระดาษชำระ 20 แพ็ค" /></div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border p-5">
              <h3 className="font-semibold mb-4">สร้างรายการจัดซื้อ</h3>
              <div className="space-y-4">
                <div><label className="block text-sm mb-2">ร้านค้า / Supplier</label>
                  <input type="text" className="w-full border rounded-2xl px-4 py-3" placeholder="ระบุร้านค้าหรือ Supplier" /></div>
                <div><label className="block text-sm mb-2">งบประมาณโดยประมาณ (บาท)</label>
                  <input type="number" className="w-full border rounded-2xl px-4 py-3" placeholder="0.00" /></div>
                <div><label className="block text-sm mb-2">สถานะการจัดซื้อ</label>
                  <select className="w-full border rounded-2xl px-4 py-3">
                    <option value="">เลือกสถานะ</option><option>รออนุมัติ</option><option>สั่งซื้อแล้ว</option><option>ได้รับสินค้าแล้ว</option>
                  </select></div>
                <div><label className="block text-sm mb-2">หมายเหตุเพิ่มเติม</label>
                  <textarea rows={4} className="w-full border rounded-2xl p-4" placeholder="รายละเอียดเพิ่มเติม" /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="bg-purple-50 border border-purple-200 rounded-3xl p-6 mb-8">
          <h2 className="text-xl font-semibold text-purple-700 mb-6">เอกสารที่ดำเนินการวันนี้ & งานเพิ่มเติม</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border p-5 shadow-sm">
              <h3 className="font-semibold mb-4">เอกสารที่ทำวันนี้</h3>
              <div className="space-y-4">
                <div><label className="block text-sm mb-2">รายการเอกสาร</label>
                  <textarea rows={6} className="w-full border rounded-2xl p-4" placeholder="เช่น ใบแจ้งหนี้ห้อง 302, สัญญาเช่า" /></div>
                <div><label className="block text-sm mb-2">จำนวนเอกสารทั้งหมด</label>
                  <input type="number" className="w-full border rounded-2xl px-4 py-3" placeholder="0" /></div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border p-5 shadow-sm">
              <h3 className="font-semibold mb-4">งานอื่น ๆ ที่ได้รับมอบหมาย</h3>
              <div className="space-y-4">
                <div><label className="block text-sm mb-2">รายละเอียดงาน</label>
                  <textarea rows={6} className="w-full border rounded-2xl p-4" placeholder="ระบุงานเพิ่มเติมที่ได้รับมอบหมายวันนี้" /></div>
                <div><label className="block text-sm mb-2">สถานะงาน</label>
                  <select className="w-full border rounded-2xl px-4 py-3">
                    <option value="">เลือกสถานะ</option><option>เสร็จแล้ว</option><option>กำลังดำเนินการ</option><option>รอติดตาม</option>
                  </select></div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-br from-gray-50 to-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">สรุปงานวันนี้</h2>
            <div className="space-y-4">
              <div><label className="block text-sm mb-2">งานที่ทำเสร็จ</label>
                <textarea rows={4} value={completedTasks} onChange={e => setCompletedTasks(e.target.value)} className="w-full border rounded-2xl p-4" placeholder="สรุปรายการงานที่ทำเสร็จ" /></div>
              <div><label className="block text-sm mb-2">งานที่ต้องติดตามต่อ</label>
                <textarea rows={4} value={pendingTasks} onChange={e => setPendingTasks(e.target.value)} className="w-full border rounded-2xl p-4" placeholder="ระบุงานค้าง หรืองานที่ต้องทำต่อพรุ่งนี้" /></div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">รายงานปัญหา</h2>
            <div className="space-y-4">
              <div><label className="block text-sm mb-2">ปัญหาที่พบวันนี้</label>
                <textarea rows={4} value={issuesFound} onChange={e => setIssuesFound(e.target.value)} className="w-full border rounded-2xl p-4" placeholder="ระบุปัญหาที่พบ" /></div>
              <div><label className="block text-sm mb-2">ข้อเสนอแนะ / หมายเหตุ</label>
                <textarea rows={4} value={suggestions} onChange={e => setSuggestions(e.target.value)} className="w-full border rounded-2xl p-4" placeholder="ข้อเสนอแนะเพิ่มเติม" /></div>
            </div>
          </div>
        </div>

        {/* KPI */}
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-amber-700 mb-4">Daily KPI</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm mb-2">ตอบลูกค้าครบ</label>
              <select className="w-full border rounded-2xl px-4 py-3"><option value="">เลือก</option><option>YES</option><option>NO</option></select></div>
            <div><label className="block text-sm mb-2">จำนวนงานค้าง</label>
              <input type="number" className="w-full border rounded-2xl px-4 py-3" placeholder="0" /></div>
            <div><label className="block text-sm mb-2">จำนวนข้อผิดพลาด</label>
              <input type="number" className="w-full border rounded-2xl px-4 py-3" placeholder="0" /></div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-blue-900 border border-blue-800 rounded-3xl p-5 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-amber-300">ระบบส่งรายงานออนไลน์</h2>
              <p className="text-sm text-blue-200 mt-1">พนักงานสามารถเปิดลิงก์นี้ผ่านมือถือหรือคอมพิวเตอร์ และส่งรายงานก่อนกลับบ้านทุกวัน</p>
            </div>
            <div className="bg-white rounded-2xl border px-4 py-3 text-sm shadow-sm flex-shrink-0">
              <p className="font-medium text-gray-700">วันที่รายงาน</p>
              <p className="text-gray-500">{today}</p>
            </div>
          </div>
        </div>

        {/* Report History */}
        <div className="bg-white border rounded-3xl p-6 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">{isAdmin ? 'รายงานทั้งหมด' : 'รายงานของฉัน'}</h2>
            <span className="text-sm text-gray-500">{reports.length} รายงาน</span>
          </div>
          {reportsLoading ? (
            <div className="text-center py-10 text-gray-400 text-sm">⏳ กำลังโหลด...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">ยังไม่มีรายงานที่ถูกส่ง</div>
          ) : (
            <div className="space-y-3">
              {reports.map(report => (
                <div key={report.id} className="border rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:shadow-sm transition">
                  <div>
                    <p className="font-semibold text-gray-800">{report.employee}</p>
                    <p className="text-sm text-gray-500">{report.date} • ส่งเวลา {report.submit_time}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">{report.status}</span>
                    <button onClick={() => setSelectedReport(report)}
                      className="px-4 py-2 rounded-xl bg-blue-900 text-white hover:bg-blue-800 transition text-sm">ดูรายงาน</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-center mb-4">
          <button onClick={handleSubmitReport} disabled={submitted || authLoading}
            className={`px-10 py-4 rounded-2xl text-white text-lg font-semibold shadow-xl transition-all
              ${submitted ? 'bg-green-400 cursor-not-allowed opacity-70'
              : authLoading ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-400 to-blue-900 hover:scale-[1.02]'}`}>
            {authLoading ? '⏳ กำลังบันทึก...' : submitted ? '✅ ส่งรายงานเรียบร้อยแล้ว' : 'ส่งรายงานประจำวัน'}
          </button>
        </div>

      </div>

      {/* Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">รายละเอียดรายงาน</h2>
              <button onClick={() => setSelectedReport(null)}
                className="px-4 py-2 rounded-xl border hover:bg-gray-50 transition text-sm">✕ ปิด</button>
            </div>
            <div className="space-y-3 text-sm">
              <p><span className="font-semibold">วันที่:</span> {selectedReport.date}</p>
              <p><span className="font-semibold">พนักงาน:</span> {selectedReport.employee}</p>
              <p><span className="font-semibold">เวลาเข้างาน:</span> {selectedReport.check_in_time || '-'}</p>
              <p><span className="font-semibold">เวลาส่งรายงาน:</span> {selectedReport.submit_time}</p>
              <p><span className="font-semibold">สถานะ: </span>
                <span className="text-green-600 font-medium">{selectedReport.status}</span></p>
              <div className="border-t pt-4 space-y-4">
                <div><p className="font-semibold text-gray-700 mb-1">Check-in</p>
                  <p className="text-gray-600">จำนวน: {selectedReport.check_in_guests || '-'} | ห้อง: {selectedReport.check_in_rooms || '-'}</p></div>
                <div><p className="font-semibold text-gray-700 mb-1">Check-out</p>
                  <p className="text-gray-600">จำนวน: {selectedReport.check_out_guests || '-'} | ห้อง: {selectedReport.check_out_rooms || '-'}</p></div>
                <div><p className="font-semibold text-gray-700 mb-1">TM30 & Booking</p>
                  <p className="text-gray-600">TM30: {selectedReport.tm30_status || '-'}</p>
                  <p className="text-gray-600">จองเพิ่ม: {selectedReport.new_bookings || '-'} ห้อง ({selectedReport.new_booking_rooms || '-'})</p></div>
                <div><p className="font-semibold text-gray-700 mb-1">Invoice</p>
                  <p className="text-gray-600">จำนวน: {selectedReport.invoice_rooms || '-'} | ยอดรวม: {selectedReport.invoice_total || '-'} บาท</p></div>
                <div><p className="font-semibold text-gray-700 mb-1">งานที่เสร็จ</p>
                  <p className="text-gray-600 whitespace-pre-wrap">{selectedReport.completed_tasks || '-'}</p></div>
                <div><p className="font-semibold text-gray-700 mb-1">งานค้าง</p>
                  <p className="text-gray-600 whitespace-pre-wrap">{selectedReport.pending_tasks || '-'}</p></div>
                <div><p className="font-semibold text-gray-700 mb-1">ปัญหาที่พบ</p>
                  <p className="text-gray-600 whitespace-pre-wrap">{selectedReport.issues_found || '-'}</p></div>
                <div><p className="font-semibold text-gray-700 mb-1">ข้อเสนอแนะ</p>
                  <p className="text-gray-600 whitespace-pre-wrap">{selectedReport.suggestions || '-'}</p></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
