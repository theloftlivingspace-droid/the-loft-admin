import { useState, useEffect } from 'react';
import BookingInvoiceTodo from './BookingInvoiceTodo';
import CheckInOut from './CheckInOut';
import StockParking from './StockParking';

// ─── Config ───────────────────────────────────────────────────────────────────
// IP prefix โหลดจาก Supabase settings table
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

async function sbUpsert(table: string, body: object) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body),
  });
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

const TASKS: { label: string; url?: string; tab?: 'checkinout' | 'todo'; todoTab?: 'booking' | 'invoice' }[] = [
  { label: 'ตอบข้อความลูกค้า' },
  { label: 'อัปเดตราคา รายวัน', url: 'https://theloftlivingspace-droid.github.io/loft-pricing/' },
  { label: 'ลงทะเบียนแขก Check-in', tab: 'checkinout' },
  { label: 'ตรวจสอบรายการ Check-out', tab: 'checkinout' },
  { label: 'ลงทะเบียน TM30', url: 'https://tm30.immigration.go.th/tm30api/loginExternal.jsp?value=EXT&id=d0c6b56279430512156a619772ece25a' },
  { label: 'บันทึกการจองเพิ่ม', tab: 'todo', todoTab: 'booking' },
  { label: 'สร้างใบแจ้งหนี้ / ใบเสร็จ', tab: 'todo', todoTab: 'invoice' },
  { label: 'ตรวจสอบสต๊อก' },
  { label: 'ตรวจสอบทะเบียนรถ' },
  { label: 'เตรียมเอกสาร' },
  { label: 'สแกน / จัดเก็บไฟล์' },
  { label: 'สรุปรายงานประจำวัน' },
  { label: 'ตรวจสอบงานค้าง' },
];

// ─── Auto-summary generator ───────────────────────────────────────────────────
function generateSummary(data: {
  taskStatus: Record<number, string>;
  checkInGuests: string; checkInRooms: string;
  checkOutGuests: string; checkOutRooms: string;
  tm30Status: string; newBookings: string; newBookingRooms: string;
  invoiceRooms: string; invoiceTotal: string; invoiceRoomNumbers: string;
  stockItems: string; stockQty: string; supplier: string;
  docList: string; docCount: string;
  extraTask: string; extraTaskStatus: string;
  kpiReply: string; kpiPending: string; kpiErrors: string;
}) {
  const done: string[]    = [];
  const pending: string[] = [];
  const issues: string[]  = [];

  // Checklist
  TASKS.forEach((task, i) => {
    const s = data.taskStatus[i] || '';
    if (s === 'เสร็จแล้ว')              done.push(`✅ ${task.label}`);
    else if (s === 'กำลังดำเนินการ')    pending.push(`🔄 ${task.label} (กำลังดำเนินการ)`);
    else if (s === 'รอติดตาม')          pending.push(`⏳ ${task.label} (รอติดตาม)`);
    else if (s === 'มีปัญหา')           issues.push(`⚠️ ${task.label}`);
  });

  // Check-in
  if (data.checkInGuests)
    done.push(`✅ Check-in แขก ${data.checkInGuests} ท่าน${data.checkInRooms ? ` (ห้อง ${data.checkInRooms})` : ''}`);

  // Check-out
  if (data.checkOutGuests)
    done.push(`✅ Check-out แขก ${data.checkOutGuests} ท่าน${data.checkOutRooms ? ` (ห้อง ${data.checkOutRooms})` : ''}`);

  // TM30
  if (data.tm30Status === 'ครบแล้ว')
    done.push('✅ ลงทะเบียน TM30 ครบแล้ว');
  else if (data.tm30Status === 'ยังไม่ครบ')
    pending.push('⏳ TM30 ยังไม่ครบ');

  // Booking
  if (data.newBookings)
    done.push(`✅ บันทึกการจองเพิ่ม ${data.newBookings} ห้อง${data.newBookingRooms ? ` (${data.newBookingRooms})` : ''}`);

  // Invoice
  if (data.invoiceRooms)
    done.push(`✅ สร้างใบแจ้งหนี้ ${data.invoiceRooms} ห้อง${data.invoiceTotal ? ` ยอดรวม ${Number(data.invoiceTotal).toLocaleString()} บาท` : ''}${data.invoiceRoomNumbers ? ` (ห้อง ${data.invoiceRoomNumbers})` : ''}`);

  // Stock
  if (data.stockItems)
    pending.push(`📦 สินค้าที่ต้องจัดซื้อ: ${data.stockItems}${data.stockQty ? ` — จำนวน: ${data.stockQty}` : ''}${data.supplier ? ` — ร้านค้า: ${data.supplier}` : ''}`);

  // Documents
  if (data.docList)
    done.push(`✅ เอกสารที่ดำเนินการ${data.docCount ? ` ${data.docCount} ฉบับ` : ''}: ${data.docList}`);

  // Extra tasks
  if (data.extraTask) {
    const line = `${data.extraTask}${data.extraTaskStatus ? ` (${data.extraTaskStatus})` : ''}`;
    if (data.extraTaskStatus === 'เสร็จแล้ว') done.push(`✅ ${line}`);
    else pending.push(`🔄 ${line}`);
  }

  // KPI → suggestions
  const suggestionLines: string[] = [];
  if (data.kpiReply)    suggestionLines.push(`ตอบลูกค้าครบ: ${data.kpiReply}`);
  if (data.kpiPending)  suggestionLines.push(`งานค้าง: ${data.kpiPending} รายการ`);
  if (data.kpiErrors)   suggestionLines.push(`ข้อผิดพลาด: ${data.kpiErrors} ครั้ง`);
  if (Number(data.kpiErrors) > 0) issues.push(`⚠️ พบข้อผิดพลาด ${data.kpiErrors} ครั้งในวันนี้`);

  return {
    completedTasks: done.join('\n') || '-',
    pendingTasks:   pending.join('\n') || '-',
    issuesFound:    issues.join('\n') || '-',
    suggestions:    suggestionLines.join('\n') || '-',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminDailyDashboard() {
  // IP
  const [clientIP, setClientIP]   = useState('');
  const [ipLoading, setIpLoading] = useState(true);


  useEffect(() => {
    const existingLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement | null;
    const link: HTMLLinkElement = existingLink ?? document.createElement('link') as HTMLLinkElement;
    if (!existingLink) {
      link.rel = 'apple-touch-icon';
      document.head.appendChild(link);
    }
    link.href = 'data:image/png;base64,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';
    document.title = 'Loft Admin';
  }, []);

  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(r => r.json()).then(d => setClientIP(d.ip))
      .catch(() => setClientIP('unknown'))
      .finally(() => setIpLoading(false));
  }, []);

  useEffect(() => {
    sbGet('settings', 'key=eq.office_ip_prefix')
      .then(rows => {
        if (rows && rows.length > 0) {
          setOfficeIpPrefix(rows[0].value);
          setIpPrefixInput(rows[0].value);
        }
      });
  }, []);

  // Auth
  const [loggedIn, setLoggedIn]             = useState(false);
  const [username, setUsername]             = useState('');
  const [password, setPassword]             = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [currentUser, setCurrentUser]       = useState<User | null>(null);
  const [fullName, setFullName]             = useState('');
  const [authLoading, setAuthLoading]       = useState(false);

  // Reports
  const [reports, setReports]               = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [submitted, setSubmitted]           = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [adminTab, setAdminTab]             = useState<'dashboard' | 'todo' | 'checkinout' | 'stockparking'>('dashboard');
  const [todoInitialTab, setTodoInitialTab] = useState<'booking' | 'invoice'>('booking');
  const [officeIpPrefix, setOfficeIpPrefix] = useState('');
  const [ipPrefixInput, setIpPrefixInput]   = useState('');
  const [ipPrefixSaving, setIpPrefixSaving] = useState(false);

  // Form — basic
  const [employeeName, setEmployeeName] = useState('');
  const [checkInTime] = useState(
    new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  );
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  // Form — checklist (controlled)
  const [taskChecked, setTaskChecked] = useState<Record<number, boolean>>({});
  const [taskStatus, setTaskStatus]   = useState<Record<number, string>>({});

  // Form — check-in/out
  const [checkInGuests, setCheckInGuests]   = useState('');
  const [checkInRooms, setCheckInRooms]     = useState('');
  const [checkOutGuests, setCheckOutGuests] = useState('');
  const [checkOutRooms, setCheckOutRooms]   = useState('');

  // Form — TM30 / booking
  const [tm30Status, setTm30Status]           = useState('');
  const [newBookings, setNewBookings]         = useState('');
  const [newBookingRooms, setNewBookingRooms] = useState('');

  // Form — invoice
  const [invoiceRooms, setInvoiceRooms]           = useState('');
  const [invoiceTotal, setInvoiceTotal]           = useState('');
  const [invoiceRoomNumbers, setInvoiceRoomNumbers] = useState('');

  // Form — stock
  const [stockItems, setStockItems]         = useState('');
  const [stockQty, setStockQty]             = useState('');
  const [supplier, setSupplier]             = useState('');
  const [budget, setBudget]                 = useState('');
  const [purchaseStatus, setPurchaseStatus] = useState('');
  const [purchaseNote, setPurchaseNote]     = useState('');

  // Form — documents
  const [docList, setDocList]               = useState('');
  const [docCount, setDocCount]             = useState('');
  const [extraTask, setExtraTask]           = useState('');
  const [extraTaskStatus, setExtraTaskStatus] = useState('');

  // Form — KPI
  const [kpiReply, setKpiReply]   = useState('');
  const [kpiPending, setKpiPending] = useState('');
  const [kpiErrors, setKpiErrors]   = useState('');

  const today = new Date().toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // โหลด reports
  useEffect(() => {
    if (!loggedIn || !currentUser) return;
    setReportsLoading(true);
    const params = currentUser.role === 'admin'
      ? 'order=created_at.desc'
      : `employee=eq.${encodeURIComponent(currentUser.full_name)}&order=created_at.desc`;
    sbGet('reports', params)
      .then(d => setReports(Array.isArray(d) ? d : []))
      .finally(() => setReportsLoading(false));
  }, [loggedIn, currentUser]);

  const isOfficeNetwork = officeIpPrefix ? clientIP.startsWith(officeIpPrefix) : false;

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!username || !password || !fullName) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }
    setAuthLoading(true);
    const existing = await sbGet('users', `username=eq.${encodeURIComponent(username)}`);
    if (existing.length > 0) { alert('Username นี้ถูกใช้งานแล้ว'); setAuthLoading(false); return; }
    await sbInsert('users', { full_name: fullName, username, password, role: 'employee' });
    alert('สมัครสมาชิกเรียบร้อยแล้ว');
    setIsRegisterMode(false); setFullName(''); setUsername(''); setPassword('');
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    if (!username || !password) { alert('กรุณากรอก Username และ Password'); return; }
    setAuthLoading(true);
    // Re-fetch IP + prefix fresh every login attempt
    let currentIP = clientIP;
    let currentPrefix = officeIpPrefix;
    try {
      const [ipRes, prefixRows] = await Promise.all([
        fetch('https://api.ipify.org?format=json').then(r => r.json()),
        sbGet('settings', 'key=eq.office_ip_prefix'),
      ]);
      currentIP = ipRes.ip;
      setClientIP(currentIP);
      if (prefixRows && prefixRows.length > 0) {
        currentPrefix = prefixRows[0].value;
        setOfficeIpPrefix(currentPrefix);
        setIpPrefixInput(currentPrefix);
      }
    } catch (_) {}
    const isOfficeNow = currentPrefix ? currentIP.startsWith(currentPrefix) : false;
    const results = await sbGet('users',
      `username=eq.${encodeURIComponent(username)}&password=eq.${encodeURIComponent(password)}`);
    setAuthLoading(false);
    if (!results || results.length === 0) { alert('Username หรือ Password ไม่ถูกต้อง'); return; }
    const matched: User = results[0];
    if (matched.role === 'employee' && !isOfficeNow) {
      alert('⛔ ไม่อนุญาต\nพนักงานสามารถเข้าใช้งานได้เฉพาะเครือข่ายออฟฟิศเท่านั้น'); return;
    }
    setLoggedIn(true); setEmployeeName(matched.full_name); setCurrentUser(matched);
  };

  const handleLogout = () => {
    setLoggedIn(false); setCurrentUser(null); setSubmitted(false);
    setUsername(''); setPassword(''); setEmployeeName(''); setReports([]);
    setTaskChecked({}); setTaskStatus({});
  };

  // ─── Submit — auto-generate summary ────────────────────────────────────────
  const handleSubmitReport = async () => {
    if (!employeeName) { alert('กรุณากรอกชื่อพนักงานก่อนส่งรายงาน'); return; }
    setAuthLoading(true);

    const summary = generateSummary({
      taskStatus, checkInGuests, checkInRooms, checkOutGuests, checkOutRooms,
      tm30Status, newBookings, newBookingRooms, invoiceRooms, invoiceTotal, invoiceRoomNumbers,
      stockItems, stockQty, supplier, docList, docCount, extraTask, extraTaskStatus,
      kpiReply, kpiPending, kpiErrors,
    });

    await sbInsert('reports', {
      date: today, employee: employeeName,
      check_in_time: checkInTime,
      submit_time: new Date().toLocaleTimeString('th-TH'),
      status: 'ส่งแล้ว',
      completed_tasks: summary.completedTasks,
      pending_tasks:   summary.pendingTasks,
      issues_found:    summary.issuesFound,
      suggestions:     summary.suggestions,
      check_in_guests: checkInGuests, check_in_rooms: checkInRooms,
      check_out_guests: checkOutGuests, check_out_rooms: checkOutRooms,
      tm30_status: tm30Status, new_bookings: newBookings, new_booking_rooms: newBookingRooms,
      invoice_rooms: invoiceRooms, invoice_total: invoiceTotal, invoice_room_numbers: invoiceRoomNumbers,
    });

    const params = currentUser?.role === 'admin'
      ? 'order=created_at.desc'
      : `employee=eq.${encodeURIComponent(employeeName)}&order=created_at.desc`;
    const updated = await sbGet('reports', params);
    setReports(Array.isArray(updated) ? updated : []);
    setSubmitted(true); setAuthLoading(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (ipLoading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-amber-100 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm opacity-80">กำลังตรวจสอบเครือข่าย...</p>
      </div>
    </div>
  );

  // ─── Login ─────────────────────────────────────────────────────────────────
  if (!loggedIn) return (
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
          <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-500 to-blue-900 bg-clip-text text-transparent">The Loft Admin</h1>
          <p className="text-gray-500 mt-2 text-sm">{isRegisterMode ? 'สมัครสมาชิกพนักงานใหม่' : 'ระบบรายงานงานประจำวันพนักงาน'}</p>
        </div>
        {isOfficeNetwork && (
          <div className="flex items-center justify-center gap-2 text-xs font-medium px-4 py-2 rounded-full mb-6 mx-auto w-fit bg-green-100 text-green-700 border border-green-200">
            <span className="w-2 h-2 rounded-full bg-green-500" />🏢 เครือข่ายออฟฟิศ — เข้าได้ทุก account
          </div>
        )}
        <div className="space-y-5">
          {isRegisterMode && (
            <div><label className="block text-sm font-medium mb-2">ชื่อ - นามสกุล</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full border rounded-2xl px-4 py-3" placeholder="กรอกชื่อพนักงาน" /></div>
          )}
          <div><label className="block text-sm font-medium mb-2">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full border rounded-2xl px-4 py-3" placeholder="กรอก Username" /></div>
          <div><label className="block text-sm font-medium mb-2">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isRegisterMode && handleLogin()}
              className="w-full border rounded-2xl px-4 py-3" placeholder="กรอก Password" /></div>
          <button onClick={isRegisterMode ? handleRegister : handleLogin} disabled={authLoading}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-blue-900 text-white font-semibold shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60">
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
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="border rounded-xl px-3 py-2 text-sm" />
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 rounded-2xl border bg-white hover:bg-gray-50 transition shadow-sm text-sm">
              🚪 Logout
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        {(
          <div className="flex border-b mb-6 -mx-1 overflow-x-auto">
            {([
              { key: 'dashboard',    label: '📊 Dashboard' },
              { key: 'todo',         label: '📋 Booking' },
              { key: 'checkinout',   label: '🏨 Check-in/out' },
              { key: 'stockparking', label: '📦 Stock' },

            ] as const).map(t => (
              <button key={t.key} onClick={() => setAdminTab(t.key)}
                className={`flex-shrink-0 whitespace-nowrap px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors
                  ${adminTab === t.key
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Admin IP Management */}
        {isAdmin && adminTab === 'dashboard' && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 mb-6 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <p className="text-xs font-semibold text-blue-700 mb-1">🌐 IP ปัจจุบัน (ของคุณ)</p>
              <p className="font-mono text-sm font-bold text-blue-900">{clientIP || '...'}</p>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-blue-700 mb-1">🏢 Office IP Prefix (ที่ตั้งไว้)</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ipPrefixInput}
                  onChange={e => setIpPrefixInput(e.target.value)}
                  placeholder="เช่น 49.228.65"
                  className="border rounded-xl px-3 py-1.5 text-sm font-mono flex-1 focus:outline-none focus:border-blue-400"
                />
                <button
                  onClick={async () => {
                    setIpPrefixSaving(true);
                    await sbUpsert('settings', { key: 'office_ip_prefix', value: ipPrefixInput });
                    setOfficeIpPrefix(ipPrefixInput);
                    setIpPrefixSaving(false);
                  }}
                  disabled={ipPrefixSaving || ipPrefixInput === officeIpPrefix}
                  className="px-4 py-1.5 bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-blue-800 transition">
                  {ipPrefixSaving ? '...' : 'บันทึก'}
                </button>
              </div>
              <p className="text-xs text-blue-500 mt-1">
                {clientIP && ipPrefixInput
                  ? clientIP.startsWith(ipPrefixInput)
                    ? '✅ IP ปัจจุบันตรงกับ Office'
                    : '⚠️ IP ปัจจุบันไม่ตรงกับ Office — employee จะ login ไม่ได้'
                  : ''}
              </p>
            </div>
          </div>
        )}

        {/* To-Do Tab */}
        {adminTab === 'todo' && (
          <BookingInvoiceTodo key={todoInitialTab} initialTab={todoInitialTab} />
        )}
        {adminTab === 'checkinout' && (
          <CheckInOut />
        )}
        {adminTab === 'stockparking' && (
          <StockParking />
        )}

        {/* Dashboard Tab */}
        {adminTab === 'dashboard' && <div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: '👤', label: 'ผู้ใช้งาน', value: currentUser?.full_name || '-' },
            { icon: '📋', label: 'งานเสร็จ', value: `${Object.values(taskStatus).filter(s => s === 'เสร็จแล้ว').length} / ${TASKS.length}` },
            { icon: '🏠', label: 'Check-in วันนี้', value: `${checkInGuests || '0'} ห้อง` },
            { icon: '📄', label: 'รายงานทั้งหมด', value: `${reports.length} ฉบับ` },
          ].map((c, i) => (
            <div key={i} className="bg-white rounded-2xl border shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2"><span className="text-lg">{c.icon}</span><p className="text-xs text-gray-500">{c.label}</p></div>
              <p className="text-lg font-bold truncate">{c.value}</p>
            </div>
          ))}
        </div>

        {submitted && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 rounded-2xl px-5 py-4 font-medium text-sm">
            ✅ ส่งรายงานประจำวันเรียบร้อยแล้ว — {today}
          </div>
        )}

        {/* Employee Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div><label className="block text-sm font-medium mb-2">ชื่อพนักงาน</label>
            <input type="text" value={employeeName} onChange={e => setEmployeeName(e.target.value)} className="w-full border rounded-2xl px-4 py-3" placeholder="กรอกชื่อพนักงาน" /></div>
          <div><label className="block text-sm font-medium mb-2">เวลาเข้างาน</label>
            <input type="text" value={checkInTime} disabled className="w-full border rounded-2xl px-4 py-3 bg-gray-100 text-gray-600 cursor-not-allowed" /></div>
        </div>

        {/* Checklist */}
        <div className="bg-gradient-to-br from-blue-50 to-amber-50 rounded-3xl p-6 mb-8 border border-orange-100 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Checklist งานประจำวัน</h2>
          <div className="space-y-3">
            {TASKS.map((task, i) => (
              <div key={i} className="flex items-center justify-between bg-white rounded-2xl border p-4 hover:shadow-sm transition">
                <div className="flex items-center gap-3">
                  <input type="checkbox" className="w-5 h-5 accent-amber-500"
                    checked={!!taskChecked[i]}
                    onChange={e => setTaskChecked(prev => ({ ...prev, [i]: e.target.checked }))} />
                  <span className={`text-gray-700 text-sm ${taskChecked[i] ? 'line-through text-gray-400' : ''}`}>
                    {task.url
                      ? <a href={task.url} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-800">{task.label}</a>
                      : task.tab
                        ? <button onClick={() => { if (task.todoTab) setTodoInitialTab(task.todoTab); setAdminTab(task.tab!); }} className="text-blue-600 underline hover:text-blue-800 text-left">{task.label}</button>
                        : task.label}
                  </span>
                </div>
                <select className="border rounded-xl px-3 py-2 text-sm"
                  value={taskStatus[i] || ''}
                  onChange={e => setTaskStatus(prev => ({ ...prev, [i]: e.target.value }))}>
                  <option value="">สถานะ</option>
                  <option>เสร็จแล้ว</option>
                  <option>กำลังดำเนินการ</option>
                  <option>รอติดตาม</option>
                  <option>มีปัญหา</option>
                </select>
              </div>
            ))}
          </div>

          {/* Check-in / Check-out / TM30 / Invoice */}
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
                  <textarea rows={5} value={stockItems} onChange={e => setStockItems(e.target.value)} className="w-full border rounded-2xl p-4" placeholder="เช่น กระดาษชำระ, น้ำดื่ม, สบู่" /></div>
                <div><label className="block text-sm mb-2">จำนวนที่ต้องซื้อเพิ่ม</label>
                  <textarea rows={4} value={stockQty} onChange={e => setStockQty(e.target.value)} className="w-full border rounded-2xl p-4" placeholder="เช่น กระดาษชำระ 20 แพ็ค" /></div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border p-5">
              <h3 className="font-semibold mb-4">สร้างรายการจัดซื้อ</h3>
              <div className="space-y-4">
                <div><label className="block text-sm mb-2">ร้านค้า / Supplier</label>
                  <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} className="w-full border rounded-2xl px-4 py-3" placeholder="ระบุร้านค้าหรือ Supplier" /></div>
                <div><label className="block text-sm mb-2">งบประมาณโดยประมาณ (บาท)</label>
                  <input type="number" value={budget} onChange={e => setBudget(e.target.value)} className="w-full border rounded-2xl px-4 py-3" placeholder="0.00" /></div>
                <div><label className="block text-sm mb-2">สถานะการจัดซื้อ</label>
                  <select value={purchaseStatus} onChange={e => setPurchaseStatus(e.target.value)} className="w-full border rounded-2xl px-4 py-3">
                    <option value="">เลือกสถานะ</option><option>รออนุมัติ</option><option>สั่งซื้อแล้ว</option><option>ได้รับสินค้าแล้ว</option>
                  </select></div>
                <div><label className="block text-sm mb-2">หมายเหตุเพิ่มเติม</label>
                  <textarea rows={4} value={purchaseNote} onChange={e => setPurchaseNote(e.target.value)} className="w-full border rounded-2xl p-4" placeholder="รายละเอียดเพิ่มเติม" /></div>
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
                  <textarea rows={6} value={docList} onChange={e => setDocList(e.target.value)} className="w-full border rounded-2xl p-4" placeholder="เช่น ใบแจ้งหนี้ห้อง 302, สัญญาเช่า" /></div>
                <div><label className="block text-sm mb-2">จำนวนเอกสารทั้งหมด</label>
                  <input type="number" value={docCount} onChange={e => setDocCount(e.target.value)} className="w-full border rounded-2xl px-4 py-3" placeholder="0" /></div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border p-5 shadow-sm">
              <h3 className="font-semibold mb-4">งานอื่น ๆ ที่ได้รับมอบหมาย</h3>
              <div className="space-y-4">
                <div><label className="block text-sm mb-2">รายละเอียดงาน</label>
                  <textarea rows={6} value={extraTask} onChange={e => setExtraTask(e.target.value)} className="w-full border rounded-2xl p-4" placeholder="ระบุงานเพิ่มเติมที่ได้รับมอบหมายวันนี้" /></div>
                <div><label className="block text-sm mb-2">สถานะงาน</label>
                  <select value={extraTaskStatus} onChange={e => setExtraTaskStatus(e.target.value)} className="w-full border rounded-2xl px-4 py-3">
                    <option value="">เลือกสถานะ</option><option>เสร็จแล้ว</option><option>กำลังดำเนินการ</option><option>รอติดตาม</option>
                  </select></div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI */}
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-amber-700 mb-4">Daily KPI</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm mb-2">ตอบลูกค้าครบ</label>
              <select value={kpiReply} onChange={e => setKpiReply(e.target.value)} className="w-full border rounded-2xl px-4 py-3">
                <option value="">เลือก</option><option>YES</option><option>NO</option>
              </select></div>
            <div><label className="block text-sm mb-2">จำนวนงานค้าง</label>
              <input type="number" value={kpiPending} onChange={e => setKpiPending(e.target.value)} className="w-full border rounded-2xl px-4 py-3" placeholder="0" /></div>
            <div><label className="block text-sm mb-2">จำนวนข้อผิดพลาด</label>
              <input type="number" value={kpiErrors} onChange={e => setKpiErrors(e.target.value)} className="w-full border rounded-2xl px-4 py-3" placeholder="0" /></div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-blue-900 border border-blue-800 rounded-3xl p-5 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-amber-300">ระบบส่งรายงานออนไลน์</h2>
              <p className="text-sm text-blue-200 mt-1">ระบบจะสรุปข้อมูลทั้งหมดอัตโนมัติเมื่อกดส่งรายงาน</p>
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

        </div> /* end dashboard tab */}

      </div>

      {/* Modal — แสดงสรุปอัตโนมัติ */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">รายละเอียดรายงาน</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedReport.employee} • {selectedReport.date} • {selectedReport.submit_time}</p>
              </div>
              <button onClick={() => setSelectedReport(null)} className="px-4 py-2 rounded-xl border hover:bg-gray-50 transition text-sm">✕ ปิด</button>
            </div>

            {/* ข้อมูลหลัก */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Check-in', value: `${selectedReport.check_in_guests || '0'} ท่าน` },
                { label: 'Check-out', value: `${selectedReport.check_out_guests || '0'} ท่าน` },
                { label: 'TM30', value: selectedReport.tm30_status || '-' },
                { label: 'Invoice', value: selectedReport.invoice_total ? `฿${Number(selectedReport.invoice_total).toLocaleString()}` : '-' },
              ].map((c, i) => (
                <div key={i} className="bg-gray-50 rounded-2xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                  <p className="font-bold text-sm">{c.value}</p>
                </div>
              ))}
            </div>

            {/* สรุปอัตโนมัติ */}
            <div className="space-y-4 text-sm">
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                <p className="font-semibold text-green-700 mb-2">✅ งานที่ทำเสร็จ</p>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedReport.completed_tasks || '-'}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="font-semibold text-amber-700 mb-2">⏳ งานที่ต้องติดตามต่อ</p>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedReport.pending_tasks || '-'}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="font-semibold text-red-700 mb-2">⚠️ ปัญหาที่พบ</p>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedReport.issues_found || '-'}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <p className="font-semibold text-blue-700 mb-2">📊 KPI สรุป</p>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedReport.suggestions || '-'}</p>
              </div>

              {/* รายละเอียดเพิ่มเติม */}
              <details className="border rounded-2xl overflow-hidden">
                <summary className="px-4 py-3 font-medium text-gray-700 cursor-pointer hover:bg-gray-50">รายละเอียดเพิ่มเติม</summary>
                <div className="px-4 pb-4 space-y-2 text-gray-600 pt-2">
                  <p><span className="font-medium">เวลาเข้างาน:</span> {selectedReport.check_in_time || '-'}</p>
                  <p><span className="font-medium">ห้อง Check-in:</span> {selectedReport.check_in_rooms || '-'}</p>
                  <p><span className="font-medium">ห้อง Check-out:</span> {selectedReport.check_out_rooms || '-'}</p>
                  <p><span className="font-medium">จองเพิ่ม:</span> {selectedReport.new_bookings || '-'} ห้อง ({selectedReport.new_booking_rooms || '-'})</p>
                  <p><span className="font-medium">Invoice:</span> {selectedReport.invoice_rooms || '-'} ห้อง หมายเลข {selectedReport.invoice_room_numbers || '-'}</p>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// trigger Fri Jun  5 06:18:58 +07 2026
// rebuild Fri Jun  5 06:21:47 +07 2026

