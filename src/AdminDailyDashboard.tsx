import { useState, useEffect, useRef } from 'react';
import BookingInvoiceTodo from './BookingInvoiceTodo';
import CheckInOut from './CheckInOut';
import StockParking from './StockParking';
import UserManagement from './UserManagement';
import { useLang } from './LanguageContext';
import { T, FoilRule, fontImports } from './theme';
import loftLogo from './assets/brand/loft-logo.png';
import { LayoutGrid, ClipboardList, Building2, Package, Car, Users2, Bell, BellRing } from 'lucide-react';
import { subscribeToPush, setForegroundBadge, getPushPermissionState } from './push';

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

const TASKS: { label: string; url?: string; tab?: 'checkinout' | 'todo' | 'stock' | 'parking'; todoTab?: 'booking' | 'invoice'; stockTab?: 'stock' | 'parking-in' | 'parking-out' | 'patrol' | 'warranty' }[] = [
  { label: 'ตอบข้อความลูกค้า', url: 'https://chat.line.biz/' },
  { label: 'อัปเดตราคา รายวัน', url: 'https://theloftlivingspace-droid.github.io/loft-pricing/' },
  { label: 'ลงทะเบียนแขก Check-in', tab: 'checkinout' },
  { label: 'ตรวจสอบรายการ Check-out', url: 'https://theloftlivingspace-droid.github.io/loft-pricing/checkout-checklist.html' },
  { label: 'ลงทะเบียน TM30', url: 'https://tm30.immigration.go.th/tm30api/loginExternal.jsp?value=EXT&id=d0c6b56279430512156a619772ece25a' },
  { label: 'บันทึกการจองเพิ่ม', tab: 'todo', todoTab: 'booking' },
  { label: 'สร้างใบแจ้งหนี้ / ใบเสร็จ', tab: 'todo', todoTab: 'invoice' },
  { label: 'ตรวจสอบสต๊อก', tab: 'stock', stockTab: 'stock' },
  { label: 'ตรวจสอบทะเบียนรถ', tab: 'parking', stockTab: 'patrol' },
  { label: 'เตรียมเอกสาร' },
  { label: 'สแกน / จัดเก็บไฟล์' },
  { label: 'สรุปรายงานประจำวัน' },
  { label: 'ตรวจสอบงานค้าง' },
];

// Translation keys parallel to TASKS array (for display only — generateSummary still uses task.label)
const TASK_LABEL_KEYS = [
  'adm_task_reply', 'adm_task_pricing', 'adm_task_checkin', 'adm_task_checkout_list',
  'adm_task_tm30', 'adm_task_booking', 'adm_task_invoice', 'adm_task_stock',
  'adm_task_car', 'adm_task_docs', 'adm_task_scan', 'adm_task_summary', 'adm_task_pending',
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
  const { lang, setLang, t } = useLang();
  // IP
  const [clientIP, setClientIP]   = useState('');
  const [ipLoading, setIpLoading] = useState(true);


  const scrollAreaRef = useRef<HTMLDivElement>(null);
  function scrollToTop() {
    scrollAreaRef.current?.scrollTo({ top: 0 });
  }

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
    sbGet('settings', 'key=eq.stock_draft')
      .then(rows => {
        if (rows?.[0]?.value) {
          try {
            const d = JSON.parse(rows[0].value);
            if (d.stockItems)     setStockItems(d.stockItems);
            if (d.stockQty)       setStockQty(d.stockQty);
            if (d.supplier)       setSupplier(d.supplier);
            if (d.budget)         setBudget(d.budget);
            if (d.purchaseStatus) setPurchaseStatus(d.purchaseStatus);
            if (d.purchaseNote)   setPurchaseNote(d.purchaseNote);
          } catch { /* ignore */ }
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
  const [adminTab, setAdminTab]             = useState<'dashboard' | 'todo' | 'checkinout' | 'stock' | 'parking' | 'users'>('dashboard');
  const [todoInitialTab, setTodoInitialTab] = useState<'booking' | 'invoice'>('booking');
  const [stockInitialTab, setStockInitialTab] = useState<'stock'|'parking-in'|'parking-out'|'patrol'|'warranty'>('stock');
  const [notifBooking, setNotifBooking]     = useState(0);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billingToken, setBillingToken]     = useState(() => localStorage.getItem('billing_token') || '');
  const [notifInvoice, setNotifInvoice]     = useState(0);
  const [notifLowStock, setNotifLowStock]   = useState(0);

  // Scroll to top whenever the active tab changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [adminTab]);

  // Notification counts from BookingInvoiceTodo GAS — auto-refresh every 10 min
  useEffect(() => {
    if (!loggedIn || currentUser?.role !== 'admin') return;
    const fetchNotif = () => {
      fetch('/api/gas-proxy?app=todo&action=getData')
        .then(r => r.json())
        .then(j => {
          console.log('[notif] GAS response:', j);
          const d = j.data ?? j;
          const booking = (d.booking ?? d.bookings ?? []) as {done?:boolean}[];
          const invoice = (d.invoice ?? d.ledger ?? []) as {done?:boolean}[];
          if (!Array.isArray(booking)) return;
          console.log('[notif] booking:', booking.length, 'invoice:', invoice.length);
          setNotifBooking(booking.filter((x) => !x.done).length);
          setNotifInvoice(invoice.filter((x) => !x.done).length);
        })
        .catch((e) => console.log('[notif] fetch error:', e));
    };
    fetchNotif();
    const timer = setInterval(fetchNotif, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loggedIn, currentUser]);

  // Live check-in/check-out counts — same GAS endpoint & date logic as
  // CheckInOut.tsx, so the overview cards stay in sync with the actual
  // checkout button state instead of drifting from it. Auto-refresh every 2 min.
  useEffect(() => {
    if (!loggedIn) return;
    const fetchRoomCounts = () => {
      fetch(`/api/gas-proxy?app=checkinout&action=getRoomStatus&_ts=${Date.now()}`, { cache: 'no-store' })
        .then(r => r.json())
        .then((json: { today: string; stays: Array<{ checkin: string; checkout: string; checkedInAt?: string; checkedOutAt?: string }> }) => {
          if (!Array.isArray(json.stays)) return;
          const tod = json.today;
          let arrivingToday = 0, checkedInToday = 0, checkingOutToday = 0, checkedOutToday = 0, currentlyIn = 0;
          for (const row of json.stays) {
            const ciStr = (row.checkin || '').substring(0, 10);
            const coStr = (row.checkout || '').substring(0, 10);
            if (!ciStr || !coStr) continue;
            const isArrivingToday    = ciStr === tod;
            const isCheckingOutToday = coStr === tod && ciStr < tod;
            const isCurrentlyIn      = ciStr <= tod && coStr > tod;
            if (isArrivingToday) { arrivingToday++; if (row.checkedInAt) checkedInToday++; }
            if (isCheckingOutToday) { checkingOutToday++; if (row.checkedOutAt) checkedOutToday++; }
            if (isCurrentlyIn) currentlyIn++;
          }
          setRoomCounts({ arrivingToday, checkedInToday, checkingOutToday, checkedOutToday, currentlyIn });
        })
        .catch((e) => console.log('[roomCounts] fetch error:', e));
    };
    fetchRoomCounts();
    const timer = setInterval(fetchRoomCounts, 2 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loggedIn]);

  // Keep the iOS home-screen app badge in sync while the app is open.
  // (When the app is closed, a server-side Web Push updates the badge instead.)
  const [pushPerm, setPushPerm] = useState<string>('default');
  useEffect(() => { setPushPerm(getPushPermissionState()); }, []);
  useEffect(() => {
    setForegroundBadge(notifBooking + notifInvoice + notifLowStock);
  }, [notifBooking, notifInvoice, notifLowStock]);
  const handleEnableNotifications = async () => {
    // Force a fresh subscription every time — fixes the case where a stale
    // subscription silently stops working and re-pressing the bell did nothing.
    const res = await subscribeToPush(true);
    setPushPerm(getPushPermissionState());
    if (!res.ok) {
      console.log('[push] subscribe failed:', res.reason);
      alert(res.reason === 'denied'
        ? t('push_denied_alert')
        : t('push_failed_alert'));
    } else {
      alert(t('push_enabled_alert'));
    }
  };
  const [officeIpPrefix, setOfficeIpPrefix] = useState('');
  const [ipPrefixInput, setIpPrefixInput]   = useState('');
  const [ipPrefixSaving, setIpPrefixSaving] = useState(false);

  // Form — basic
  const [employeeName, setEmployeeName] = useState('');
  const [checkInTime] = useState(
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  // Form — checklist (controlled)
  const [taskChecked, setTaskChecked] = useState<Record<number, boolean>>({});
  const [taskStatus, setTaskStatus]   = useState<Record<number, string>>({});

  // Form — check-in/out (manual report text, kept for the submitted daily report)
  const [checkInGuests, setCheckInGuests]   = useState('');
  const [checkInRooms, setCheckInRooms]     = useState('');
  const [checkOutGuests, setCheckOutGuests] = useState('');
  const [checkOutRooms, setCheckOutRooms]   = useState('');

  // Live room-status counts — real source of truth, shared with CheckInOut.tsx
  // via the same GAS endpoint, so the overview stat cards always reflect the
  // actual checked-in/checked-out state instead of the manually-typed report fields.
  const [roomCounts, setRoomCounts] = useState({
    arrivingToday: 0, checkedInToday: 0,
    checkingOutToday: 0, checkedOutToday: 0,
    currentlyIn: 0,
  });

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
  const [stockSaving, setStockSaving]       = useState(false);
  const [stockSaved, setStockSaved]         = useState(false);

  // Form — documents
  const [docList, setDocList]               = useState('');
  const [docCount, setDocCount]             = useState('');
  const [extraTask, setExtraTask]           = useState('');
  const [extraTaskStatus, setExtraTaskStatus] = useState('');

  // Form — KPI
  const [kpiReply, setKpiReply]   = useState('');
  const [kpiPending, setKpiPending] = useState('');
  const [kpiErrors, setKpiErrors]   = useState('');

  const today = new Date().toLocaleDateString('en-US', {
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
    if (!username || !password || !fullName) { alert(t('adm_alert_fill_all')); return; }
    setAuthLoading(true);
    const existing = await sbGet('users', `username=eq.${encodeURIComponent(username)}`);
    if (existing.length > 0) { alert(t('adm_alert_username_taken')); setAuthLoading(false); return; }
    await sbInsert('users', { full_name: fullName, username, password, role: 'employee' });
    alert(t('adm_alert_register_success'));
    setIsRegisterMode(false); setFullName(''); setUsername(''); setPassword('');
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    if (!username || !password) { alert(t('adm_alert_fill_credentials')); return; }
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
    if (!results || results.length === 0) { alert(t('adm_alert_wrong_credentials')); return; }
    const matched: User = results[0];
    if (matched.role === 'employee' && !isOfficeNow) {
      alert(`${t('adm_alert_denied_title')}\n${t('adm_alert_denied_body')}\n\n${t('adm_alert_current_ip')}: ${currentIP || t('adm_alert_unknown')}\n${t('adm_alert_notify_admin')}`); return;
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
    if (!employeeName) { alert(t('adm_alert_fill_employee_name')); return; }
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
      submit_time: new Date().toLocaleTimeString('en-GB'),
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

  const handleSaveStock = async () => {
    setStockSaving(true); setStockSaved(false);
    await sbUpsert("settings", {
      key: "stock_draft",
      value: JSON.stringify({ stockItems, stockQty, supplier, budget, purchaseStatus, purchaseNote, date: today }),
    });
    setStockSaving(false); setStockSaved(true);
    setTimeout(() => setStockSaved(false), 3000);
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (ipLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: T.navyDeep }}>
      <div className="text-center text-white">
        <div className="w-12 h-12 rounded-full animate-spin mx-auto mb-4" style={{ border: `4px solid ${T.brass}55`, borderTopColor: T.brass }} />
        <p className="f-thai text-sm opacity-80">{t('adm_checking_network')}</p>
      </div>
    </div>
  );

  // ─── Login ─────────────────────────────────────────────────────────────────
  if (!loggedIn) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: T.navyDeep }}>
      <style>{fontImports}</style>
      <div className="rounded-[32px] p-10 w-full max-w-md" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.5)' }}>
        <div className="text-center mb-8">
          <div className="rounded-full mx-auto mb-5 overflow-hidden" style={{ width: 88, height: 88, border: `1px solid ${T.brass}55`, boxShadow: '0 10px 24px rgba(11,30,66,0.25)' }}>
            <img src={loftLogo} alt="The Loft Living Space" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <p className="f-thai" style={{ fontSize: 11, fontWeight: 700, color: T.brassDeep, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            The Loft Living Space
          </p>
          <h1 className="f-display text-2xl font-bold mt-1" style={{ color: T.ink }}>Admin Dashboard</h1>
          <p className="f-thai mt-2 text-sm" style={{ color: T.inkSoft }}>{isRegisterMode ? t('adm_register_subtitle') : t('adm_login_subtitle')}</p>
        </div>
        {isOfficeNetwork && (
          <div className="f-thai flex items-center justify-center gap-2 text-xs font-medium px-4 py-2 rounded-full mb-6 mx-auto w-fit" style={{ background: T.sageTint, color: T.sage, border: `1px solid ${T.sage}30` }}>
            <span className="w-2 h-2 rounded-full" style={{ background: T.sage }} />{t('adm_office_network_badge')}
          </div>
        )}
        <div className="space-y-5">
          {isRegisterMode && (
            <div><label className="f-thai block text-sm font-medium mb-2" style={{ color: T.ink }}>{t('adm_fullname_label')}</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_fullname_placeholder')} /></div>
          )}
          <div><label className="f-thai block text-sm font-medium mb-2" style={{ color: T.ink }}>{t('adm_username_label')}</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_username_placeholder')} /></div>
          <div><label className="f-thai block text-sm font-medium mb-2" style={{ color: T.ink }}>{t('adm_password_label')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isRegisterMode && handleLogin()}
              className="focus-ring w-full rounded-2xl px-4 py-3" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_password_placeholder')} /></div>
          <button onClick={isRegisterMode ? handleRegister : handleLogin} disabled={authLoading}
            className="press focus-ring f-thai w-full py-3 rounded-2xl font-semibold disabled:opacity-60"
            style={{ background: `linear-gradient(90deg, ${T.brass}, ${T.navy})`, color: '#fff' }}>
            {authLoading ? t('adm_processing') : isRegisterMode ? t('adm_register_btn') : t('adm_login_btn')}
          </button>
          <button onClick={() => { setIsRegisterMode(!isRegisterMode); setUsername(''); setPassword(''); setFullName(''); }}
            className="press focus-ring f-thai w-full py-3 rounded-2xl font-medium"
            style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
            {isRegisterMode ? t('adm_back_to_login') : t('adm_create_employee_account')}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="h-screen overflow-hidden p-0 md:p-6" style={{ background: T.bone }}>
      <style>{fontImports}</style>
      <div className="max-w-6xl mx-auto h-full flex flex-col overflow-hidden md:rounded-[32px]" style={{ background: T.paper, boxShadow: '0 20px 50px rgba(11,30,66,0.18)', border: `1px solid ${T.hairGold}` }}>

        {/* Header */}
        <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6 pb-0">
          <div
            className="rounded-[22px] md:rounded-[26px] px-4 md:px-6 pt-4 pb-3 md:pb-4"
            style={{ background: T.navyDeep, boxShadow: '0 10px 28px rgba(11,30,66,0.45)' }}
          >
            {/* Desktop header — full */}
            <div className="hidden md:flex md:items-start md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center rounded-full shrink-0 overflow-hidden" style={{ width: 52, height: 52, border: `1px solid ${T.brass}55` }}>
                  <img src={loftLogo} alt="The Loft Living Space" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div>
                  <p className="f-thai" style={{ fontSize: 11, fontWeight: 700, color: T.brass, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1 }}>
                    The Loft Living Space
                  </p>
                  <h1 className="f-display" style={{ fontSize: 24, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25, marginTop: 4 }}>
                    {isAdmin ? t('admin_mgmt_title') : t('daily_admin_title')}
                  </h1>
                  <p className="f-thai" style={{ fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                    {isAdmin ? t('admin_subtitle') : t('daily_subtitle')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
                  <button
                    onClick={() => setLang('th')}
                    className="press focus-ring rounded-full"
                    style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 700, color: lang === 'th' ? T.navyDeep : 'rgba(255,255,255,0.7)', background: lang === 'th' ? T.brass : 'transparent' }}>
                    TH
                  </button>
                  <button
                    onClick={() => setLang('en')}
                    className="press focus-ring rounded-full"
                    style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 700, color: lang === 'en' ? T.navyDeep : 'rgba(255,255,255,0.7)', background: lang === 'en' ? T.brass : 'transparent' }}>
                    EN
                  </button>
                </div>
                <div
                  className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-medium f-thai"
                  style={{
                    background: isOfficeNetwork ? 'rgba(63,130,86,0.18)' : 'rgba(217,178,92,0.18)',
                    color: isOfficeNetwork ? '#8FD4A5' : T.brass,
                    border: `1px solid ${isOfficeNetwork ? 'rgba(143,212,165,0.3)' : 'rgba(217,178,92,0.35)'}`,
                  }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: isOfficeNetwork ? '#8FD4A5' : T.brass }} />
                  {isOfficeNetwork ? t('office_badge') : t('online_badge')}
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}>({clientIP})</span>
                </div>
                <div className="text-right">
                  <p className="f-thai" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>{t('report_date_label')}</p>
                  <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="rounded-xl px-3 py-2 text-sm focus-ring" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF' }} />
                </div>
                <button onClick={handleEnableNotifications} title={pushPerm === 'granted' ? 'Notifications on' : 'Enable notifications'} className="press focus-ring flex items-center gap-2 px-3 py-2 rounded-2xl text-sm f-thai" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: pushPerm === 'granted' ? T.brass : 'rgba(255,255,255,0.85)' }}>
                  {pushPerm === 'granted' ? <BellRing size={16} /> : <Bell size={16} />}
                </button>
                <button onClick={handleLogout} className="press focus-ring flex items-center gap-2 px-4 py-2 rounded-2xl text-sm f-thai" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)' }}>
                  {t('logout_btn')}
                </button>
              </div>
            </div>
            {/* Desktop notification row */}
            {((isAdmin && (notifBooking > 0 || notifInvoice > 0)) || notifLowStock > 0) && (
              <div className="hidden md:flex flex-wrap items-center gap-2 mt-3">
                {isAdmin && (notifBooking > 0 || notifInvoice > 0) && (
                  <button
                    onClick={() => { setTodoInitialTab(notifBooking > 0 ? 'booking' : 'invoice'); setAdminTab('todo'); }}
                    className="press focus-ring flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ background: T.brassPale, border: `1px solid ${T.hairGold}`, color: T.brassDeep }}>
                    {notifBooking > 0 && <span>📋 {notifBooking} booking</span>}
                    {notifBooking > 0 && notifInvoice > 0 && <span style={{ opacity: 0.5 }}>·</span>}
                    {notifInvoice > 0 && <span>🧾 {notifInvoice} invoice</span>}
                    <span>→</span>
                  </button>
                )}
                {notifLowStock > 0 && (
                  <button
                    onClick={() => { setStockInitialTab('stock'); setAdminTab('stock'); }}
                    className="press focus-ring flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ background: T.wineTint, border: `1px solid ${T.wine}30`, color: T.wine }}>
                    🔴 {notifLowStock} {t('notif_low_stock')}
                    <span>→</span>
                  </button>
                )}
              </div>
            )}
            {/* Mobile header — two rows so the brand name/title never truncate */}
            <div className="flex md:hidden items-center gap-3 min-w-0">
                <div className="flex items-center justify-center rounded-full shrink-0 overflow-hidden" style={{ width: 42, height: 42, border: `1px solid ${T.brass}55` }}>
                  <img src={loftLogo} alt="The Loft Living Space" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div className="min-w-0">
                  <p className="f-thai" style={{ fontSize: 10.5, fontWeight: 700, color: T.brass, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    The Loft Living Space
                  </p>
                  <h1 className="f-display" style={{ fontSize: 19, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25, marginTop: 3, whiteSpace: 'nowrap' }}>
                    {isAdmin ? t('admin_mgmt_title') : t('daily_admin_title')}
                  </h1>
                </div>
            </div>
            {/* Mobile notification banners */}
            {((isAdmin && (notifBooking > 0 || notifInvoice > 0)) || notifLowStock > 0) && (
              <div className="md:hidden flex flex-col gap-1.5 mt-3">
                {isAdmin && (notifBooking > 0 || notifInvoice > 0) && (
                  <button
                    onClick={() => { setTodoInitialTab(notifBooking > 0 ? 'booking' : 'invoice'); setAdminTab('todo'); }}
                    className="press focus-ring w-full flex items-center justify-center gap-3 px-4 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: T.brassPale, border: `1px solid ${T.hairGold}`, color: T.brassDeep }}>
                    {notifBooking > 0 && <span>📋 {notifBooking} {t('notif_booking_invoice')}</span>}
                    {notifBooking > 0 && notifInvoice > 0 && <span style={{ opacity: 0.5 }}>·</span>}
                    {notifInvoice > 0 && <span>🧾 {notifInvoice} {t('notif_invoice_pending')}</span>}
                    <span className="ml-1">→</span>
                  </button>
                )}
                {notifLowStock > 0 && (
                  <button
                    onClick={() => { setStockInitialTab('stock'); setAdminTab('stock'); }}
                    className="press focus-ring w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: T.wineTint, border: `1px solid ${T.wine}30`, color: T.wine }}>
                    🔴 {notifLowStock} {t('notif_low_stock')}
                    <span className="ml-1">→</span>
                  </button>
                )}
              </div>
            )}
            <div className="mt-3.5">
              <FoilRule />
            </div>
            <div className="flex md:hidden items-center justify-between gap-1.5 mt-2.5">
              <span className="f-thai" style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                {(() => {
                  const activeLabel = { dashboard: t('tab_dashboard'), todo: t('tab_booking'), checkinout: t('tab_checkinout'), stock: t('tab_stock'), parking: t('tab_parking'), users: t('adm_tab_users') } as Record<string, string>;
                  return activeLabel[adminTab] || '';
                })()}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
                  <button
                    onClick={() => setLang('th')}
                    className="press focus-ring rounded-full"
                    style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, color: lang === 'th' ? T.navyDeep : 'rgba(255,255,255,0.7)', background: lang === 'th' ? T.brass : 'transparent' }}>
                    TH
                  </button>
                  <button
                    onClick={() => setLang('en')}
                    className="press focus-ring rounded-full"
                    style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, color: lang === 'en' ? T.navyDeep : 'rgba(255,255,255,0.7)', background: lang === 'en' ? T.brass : 'transparent' }}>
                    EN
                  </button>
                </div>
                <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="rounded-lg px-2 py-1 text-xs focus-ring" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF' }} />
                <button onClick={handleEnableNotifications} className="press focus-ring flex items-center gap-1 px-2 py-1 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: pushPerm === 'granted' ? T.brass : 'rgba(255,255,255,0.85)' }}>
                  {pushPerm === 'granted' ? <BellRing size={14} /> : <Bell size={14} />}
                </button>
                <button onClick={handleLogout} className="press focus-ring flex items-center gap-1 px-2 py-1 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)' }}>
                  🚪
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* Tab Switcher — desktop: border-b tabs, mobile: bottom bar */}


        {/* Desktop tabs (md and up) */}
        <div className="flex-shrink-0 hidden md:flex px-6 md:px-8 overflow-x-auto" style={{ borderBottom: `1px solid ${T.hair}` }}>
          {([
            { key: 'dashboard',    Icon: LayoutGrid,    label: t('tab_dashboard') },
            ...(isAdmin ? [{ key: 'todo' as const, Icon: ClipboardList, label: t('tab_booking') }] : []),
            { key: 'checkinout',   Icon: Building2,     label: t('tab_checkinout') },
            { key: 'stock',        Icon: Package,       label: t('tab_stock') },
            { key: 'parking',      Icon: Car,           label: t('tab_parking') },
            ...(isAdmin ? [{ key: 'users' as const, Icon: Users2, label: t('adm_tab_users') }] : []),
          ] as const).map(t2 => (
            <button key={t2.key} onClick={() => { setAdminTab(t2.key); scrollToTop(); }}
              className="press focus-ring f-thai flex-shrink-0 whitespace-nowrap px-5 py-3 text-sm font-semibold flex items-center gap-2"
              style={{
                borderBottom: `2px solid ${adminTab === t2.key ? T.brass : 'transparent'}`,
                color: adminTab === t2.key ? T.navy : T.inkSoft,
              }}>
              <t2.Icon size={16} strokeWidth={adminTab === t2.key ? 2.2 : 1.8} />
              {t2.label}
            </button>
          ))}
        </div>

        {/* Mobile bottom tab bar (below md) — fixed at bottom of screen */}
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex pb-safe" style={{ background: T.card, borderTop: `1px solid ${T.hair}` }}>
          {([
            { key: 'dashboard',    Icon: LayoutGrid,    label: 'Dashboard' },
            ...(isAdmin ? [{ key: 'todo' as const, Icon: ClipboardList, label: 'Booking' }] : []),
            { key: 'checkinout',   Icon: Building2,     label: 'Check-in/out' },
            { key: 'stock',        Icon: Package,       label: 'Stock' },
            { key: 'parking',      Icon: Car,           label: 'Parking' },
            ...(isAdmin ? [{ key: 'users' as const, Icon: Users2, label: 'Users' }] : []),
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => { setAdminTab(tab.key); scrollToTop(); }}
              className="press focus-ring flex-1 flex flex-col items-center justify-center py-2.5 gap-1 min-w-0 relative">
              <tab.Icon size={23} color={adminTab === tab.key ? T.navy : '#8A8570'} strokeWidth={adminTab === tab.key ? 2.2 : 1.8} />
              <span className="f-thai text-[10.5px] leading-tight text-center px-0.5" style={{ color: adminTab === tab.key ? T.navy : '#8A8570', fontWeight: adminTab === tab.key ? 700 : 600 }}>{tab.label}</span>
              <span style={{ width: 16, height: 2.5, borderRadius: 1.5, background: adminTab === tab.key ? T.brass : 'transparent' }} />
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 pt-0 md:pt-6">
        {/* Admin IP Management */}
        {isAdmin && adminTab === 'dashboard' && (
          <div className="rounded-2xl px-5 py-4 mb-6 flex flex-col md:flex-row md:items-center gap-3" style={{ background: T.navyTint, border: `1px solid ${T.hairGold}` }}>
            <div className="flex-1">
              <p className="f-thai text-xs font-semibold mb-1" style={{ color: T.navy }}>{t('adm_current_ip')}</p>
              <p className="f-num text-sm font-bold" style={{ color: T.ink }}>{clientIP || '...'}</p>
            </div>
            <div className="flex-1">
              <p className="f-thai text-xs font-semibold mb-1" style={{ color: T.navy }}>{t('adm_office_ip_prefix')}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ipPrefixInput}
                  onChange={e => setIpPrefixInput(e.target.value)}
                  placeholder={t('adm_ip_placeholder')}
                  className="focus-ring f-num rounded-xl px-3 py-1.5 text-sm flex-1"
                  style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }}
                />
                <button
                  onClick={async () => {
                    setIpPrefixSaving(true);
                    await sbUpsert('settings', { key: 'office_ip_prefix', value: ipPrefixInput });
                    setOfficeIpPrefix(ipPrefixInput);
                    setIpPrefixSaving(false);
                  }}
                  disabled={ipPrefixSaving || ipPrefixInput === officeIpPrefix}
                  className="press focus-ring f-thai px-4 py-1.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                  style={{ background: T.navy, color: '#fff' }}>
                  {ipPrefixSaving ? '...' : t('adm_save')}
                </button>
              </div>
              <p className="f-thai text-xs mt-1" style={{ color: T.inkSoft }}>
                {clientIP && ipPrefixInput
                  ? clientIP.startsWith(ipPrefixInput)
                    ? t('adm_ip_match')
                    : t('adm_ip_mismatch')
                  : ''}
              </p>
            </div>
          </div>
        )}

        {/* To-Do Tab */}
        {isAdmin && adminTab === 'todo' && (
          <BookingInvoiceTodo key={todoInitialTab} initialTab={todoInitialTab} onCountChange={(b: number, i: number) => { setNotifBooking(b); setNotifInvoice(i); }} />
        )}
        {adminTab === 'checkinout' && (
          <CheckInOut />
        )}
        {/* Always mounted (hidden when inactive) so onLowStockChange fires on login */}
        <div className={adminTab === 'stock' || adminTab === 'parking' ? '' : 'hidden'}>
          <StockParking group={adminTab === 'parking' ? 'parking' : 'stock'} initialTab={stockInitialTab} onLowStockChange={(n) => setNotifLowStock(n)} />
        </div>
        {isAdmin && adminTab === 'users' && (
          <UserManagement />
        )}

        {/* Dashboard Tab */}
        {adminTab === 'dashboard' && <div>

        {/* Quick Links — shortcut buttons */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {([
            { icon: '✅', line1: t('adm_ql_checklist1'), line2: t('adm_ql_checklist2'), tab: 'dashboard' as const, scroll: 'checklist' },
            { icon: '📦', line1: t('adm_ql_check'),  line2: t('adm_ql_stock'),       tab: 'stock' as const, scroll: '' },
            { icon: '🚨', line1: t('adm_ql_check'),  line2: t('adm_ql_car'),   tab: 'parking' as const, scroll: 'patrol' },
          ]).map((q, i) => (
            <button key={i}
              onClick={() => {
                if (q.scroll === 'patrol') setStockInitialTab('patrol');
                else if (q.scroll === '') setStockInitialTab('stock');
                setAdminTab(q.tab);
                if (q.scroll === 'checklist') {
                  setTimeout(() => document.getElementById('daily-checklist')?.scrollIntoView({ behavior: 'smooth' }), 100);
                }
              }}
              className="press focus-ring rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center"
              style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              <span className="text-2xl">{q.icon}</span>
              <span className="f-thai text-xs font-semibold leading-tight" style={{ color: T.ink }}>{q.line1}<br/>{q.line2}</span>
            </button>
          ))}
        </div>

        {/* Billing Console — token modal */}
        <button
          onClick={() => setShowBillingModal(true)}
          className="press focus-ring f-thai w-full mb-5 rounded-2xl px-5 py-3 flex items-center justify-center gap-2 font-semibold"
          style={{ background: '#3A817D', color: '#FFFFFF' }}
        >
          <span className="text-lg">💳</span>
          <span>{t('adm_billing_btn')}</span>
          <span className="ml-auto text-xs" style={{ color: T.brassPale }}>{t('adm_open_new_tab')}</span>
        </button>

        {/* Billing Token Modal */}
        {showBillingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="rounded-2xl w-full max-w-sm p-6" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.4)' }}>
              <h3 className="f-display text-base font-bold mb-1" style={{ color: T.ink }}>💳 Billing Console</h3>
              <p className="f-thai text-xs mb-4" style={{ color: T.inkSoft }}>{t('adm_billing_token_prompt')}</p>
              <input
                type="password"
                value={billingToken}
                onChange={e => setBillingToken(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    localStorage.setItem('billing_token', billingToken);
                    window.open(`https://hotel-line-bot.onrender.com/?token=${encodeURIComponent(billingToken)}`, '_blank');
                    setShowBillingModal(false);
                  }
                }}
                placeholder="Admin Token"
                autoFocus
                className="focus-ring w-full rounded-xl px-4 py-2.5 text-sm mb-4"
                style={{ border: `1px solid ${T.hairGold}`, color: T.ink }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBillingModal(false)}
                  className="press focus-ring f-thai flex-1 rounded-xl py-2 text-sm"
                  style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}
                >{t('adm_cancel')}</button>
                <button
                  onClick={() => {
                    localStorage.setItem('billing_token', billingToken);
                    window.open(`https://hotel-line-bot.onrender.com/?token=${encodeURIComponent(billingToken)}`, '_blank');
                    setShowBillingModal(false);
                  }}
                  className="press focus-ring f-thai flex-1 rounded-xl py-2 text-sm font-semibold"
                  style={{ background: T.navy, color: '#fff' }}
                >{t('adm_enter_system')}</button>
              </div>
              {billingToken && (
                <p className="f-thai text-xs text-center mt-3" style={{ color: T.inkSoft }}>{t('adm_token_remembered')}</p>
              )}
            </div>
          </div>
        )}

        {/* Stat Cards — check-in/out counts are live-synced from the same GAS
            endpoint CheckInOut.tsx uses, so they always match the real
            checked-in/checked-out state (not the manually-typed report fields). */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { icon: '👤', label: t('adm_stat_user'), value: currentUser?.full_name || '-' },
            { icon: '📋', label: t('adm_stat_done_tasks'), value: `${Object.values(taskStatus).filter(s => s === 'เสร็จแล้ว').length} / ${TASKS.length}` },
            { icon: '🏠', label: t('adm_stat_checkin_today'), value: `${roomCounts.checkedInToday} / ${roomCounts.arrivingToday} ${t('adm_stat_rooms')}` },
            { icon: '🧳', label: t('adm_stat_checkout_today'), value: `${roomCounts.checkedOutToday} / ${roomCounts.checkingOutToday} ${t('adm_stat_rooms')}` },
            { icon: '📄', label: t('adm_stat_all_reports'), value: `${reports.length} ${t('adm_stat_docs_unit')}` },
          ].map((c, i) => (
            <div key={i} className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              <div className="flex items-center gap-2 mb-2"><span className="text-lg">{c.icon}</span><p className="f-thai text-xs" style={{ color: T.inkSoft }}>{c.label}</p></div>
              <p className="f-num text-lg font-bold truncate" style={{ color: T.ink }}>{c.value}</p>
            </div>
          ))}
        </div>

        {submitted && (
          <div className="mb-6 rounded-2xl px-5 py-4 font-medium text-sm f-thai" style={{ background: T.sageTint, border: `1px solid ${T.sage}30`, color: T.sage }}>
            {t('adm_submitted_banner')} {today}
          </div>
        )}

        {/* Employee Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div><label className="f-thai block text-sm font-medium mb-2" style={{ color: T.ink }}>{t('adm_employee_name_label')}</label>
            <input type="text" value={employeeName} onChange={e => setEmployeeName(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_fullname_placeholder')} /></div>
          <div><label className="f-thai block text-sm font-medium mb-2" style={{ color: T.ink }}>{t('adm_checkin_time_label')}</label>
            <input type="text" value={checkInTime} disabled className="w-full rounded-2xl px-4 py-3 cursor-not-allowed" style={{ background: T.bone, border: `1px solid ${T.hair}`, color: T.inkSoft }} /></div>
        </div>

        {/* Checklist */}
        <div id="daily-checklist" className="rounded-3xl p-6 mb-8" style={{ background: T.navyTint, border: `1px solid ${T.hairGold}` }}>
          <h2 className="f-display text-xl font-semibold mb-4" style={{ color: T.ink }}>{t('adm_checklist_title')}</h2>
          <div className="space-y-3">
            {TASKS.map((task, i) => (
              <div key={i} className="flex items-center justify-between rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
                <div className="flex items-center gap-3">
                  <input type="checkbox" className="w-5 h-5" style={{ accentColor: T.brass }}
                    checked={!!taskChecked[i]}
                    onChange={e => setTaskChecked(prev => ({ ...prev, [i]: e.target.checked }))} />
                  <span className="f-thai text-sm" style={{ color: taskChecked[i] ? '#9CA3AF' : T.ink, textDecoration: taskChecked[i] ? 'line-through' : 'none' }}>
                    {task.url
                      ? <a href={task.url} target="_blank" rel="noreferrer" className="underline" style={{ color: T.navy }}>{t(TASK_LABEL_KEYS[i])}</a>
                      : task.tab
                        ? <button onClick={() => { if (task.todoTab) setTodoInitialTab(task.todoTab); if (task.stockTab) setStockInitialTab(task.stockTab); setAdminTab(task.tab!); }} className="underline text-left" style={{ color: T.navy }}>{t(TASK_LABEL_KEYS[i])}</button>
                        : t(TASK_LABEL_KEYS[i])}
                  </span>
                </div>
                <select className="focus-ring rounded-xl px-3 py-2 text-sm f-thai" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }}
                  value={taskStatus[i] || ''}
                  onChange={e => setTaskStatus(prev => ({ ...prev, [i]: e.target.value }))}>
                  <option value="">{t('adm_status_select')}</option>
                  <option value="เสร็จแล้ว">{t('adm_status_done')}</option>
                  <option value="กำลังดำเนินการ">{t('adm_status_inprogress')}</option>
                  <option value="รอติดตาม">{t('adm_status_followup')}</option>
                  <option value="มีปัญหา">{t('adm_status_issue')}</option>
                </select>
              </div>
            ))}
          </div>

          {/* Check-in / Check-out / TM30 / Invoice */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              <h3 className="f-thai font-semibold mb-4" style={{ color: T.ink }}>{t('adm_checkin_today_title')}</h3>
              <div className="space-y-4">
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_checkin_guest_count')}</label>
                  <input type="number" value={checkInGuests} onChange={e => setCheckInGuests(e.target.value)} className="focus-ring w-full rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="0" /></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_checkin_rooms_label')}</label>
                  <textarea rows={3} value={checkInRooms} onChange={e => setCheckInRooms(e.target.value)} className="focus-ring w-full rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_rooms_eg1')} /></div>
              </div>
            </div>
            <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              <h3 className="f-thai font-semibold mb-4" style={{ color: T.ink }}>{t('adm_checkout_today_title')}</h3>
              <div className="space-y-4">
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_checkout_guest_count')}</label>
                  <input type="number" value={checkOutGuests} onChange={e => setCheckOutGuests(e.target.value)} className="focus-ring w-full rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="0" /></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_checkout_rooms_label')}</label>
                  <textarea rows={3} value={checkOutRooms} onChange={e => setCheckOutRooms(e.target.value)} className="focus-ring w-full rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_rooms_eg2')} /></div>
              </div>
            </div>
            <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              <h3 className="f-thai font-semibold mb-4" style={{ color: T.ink }}>{t('adm_tm30_booking_title')}</h3>
              <div className="space-y-4">
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_tm30_complete_q')}</label>
                  <select value={tm30Status} onChange={e => setTm30Status(e.target.value)} className="focus-ring w-full rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }}>
                    <option value="">{t('adm_select')}</option><option value="ครบแล้ว">{t('adm_tm30_complete')}</option><option value="ยังไม่ครบ">{t('adm_tm30_incomplete')}</option>
                  </select></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_new_bookings_count')}</label>
                  <input type="number" value={newBookings} onChange={e => setNewBookings(e.target.value)} className="focus-ring w-full rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="0" /></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_new_booking_rooms_label')}</label>
                  <textarea rows={3} value={newBookingRooms} onChange={e => setNewBookingRooms(e.target.value)} className="focus-ring w-full rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_rooms_eg3')} /></div>
              </div>
            </div>
            <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              <h3 className="f-thai font-semibold mb-4" style={{ color: T.ink }}>{t('adm_invoice_receipt_title')}</h3>
              <div className="space-y-4">
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_invoice_count')}</label>
                  <input type="number" value={invoiceRooms} onChange={e => setInvoiceRooms(e.target.value)} className="focus-ring w-full rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="0" /></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_invoice_total_label')}</label>
                  <input type="number" value={invoiceTotal} onChange={e => setInvoiceTotal(e.target.value)} className="focus-ring w-full rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="0.00" /></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_invoice_room_numbers_label')}</label>
                  <textarea rows={3} value={invoiceRoomNumbers} onChange={e => setInvoiceRoomNumbers(e.target.value)} className="focus-ring w-full rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_rooms_eg4')} /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Stock */}
        <div className="rounded-3xl p-6 mb-8" style={{ background: T.navyDeep }}>
          <h2 className="f-display text-xl font-semibold mb-6" style={{ color: T.brass }}>{t('adm_stock_purchase_title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl p-5" style={{ background: T.card }}>
              <h3 className="f-thai font-semibold mb-4" style={{ color: T.ink }}>{t('adm_stock_low_title')}</h3>
              <div className="space-y-4">
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_stock_items_label')}</label>
                  <textarea rows={5} value={stockItems} onChange={e => setStockItems(e.target.value)} className="focus-ring w-full rounded-2xl p-4" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_stock_items_eg')} /></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_stock_qty_label')}</label>
                  <textarea rows={4} value={stockQty} onChange={e => setStockQty(e.target.value)} className="focus-ring w-full rounded-2xl p-4" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_stock_qty_eg')} /></div>
              </div>
            </div>
            <div className="rounded-2xl p-5" style={{ background: T.card }}>
              <h3 className="f-thai font-semibold mb-4" style={{ color: T.ink }}>{t('adm_create_purchase_title')}</h3>
              <div className="space-y-4">
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_supplier_label')}</label>
                  <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_supplier_placeholder')} /></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_budget_label')}</label>
                  <input type="number" value={budget} onChange={e => setBudget(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="0.00" /></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_purchase_status_label')}</label>
                  <select value={purchaseStatus} onChange={e => setPurchaseStatus(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }}>
                    <option value="">{t('adm_select_status')}</option><option value="รออนุมัติ">{t('adm_purchase_status_pending')}</option><option value="สั่งซื้อแล้ว">{t('adm_purchase_status_ordered')}</option><option value="ได้รับสินค้าแล้ว">{t('adm_purchase_status_received')}</option>
                  </select></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_purchase_note_label')}</label>
                  <textarea rows={4} value={purchaseNote} onChange={e => setPurchaseNote(e.target.value)} className="focus-ring w-full rounded-2xl p-4" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_purchase_note_placeholder')} /></div>
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={handleSaveStock}
              disabled={stockSaving}
              className="press focus-ring f-thai px-6 py-2.5 rounded-xl text-sm font-semibold"
              style={
                stockSaved ? { background: T.sage, color: '#fff' } :
                stockSaving ? { background: '#4B5563', color: '#9CA3AF', cursor: 'not-allowed' } :
                { background: T.brass, color: T.navyDeep }
              }
            >
              {stockSaving ? t('adm_stock_saving') : stockSaved ? t('adm_stock_saved') : t('adm_stock_save_btn')}
            </button>
          </div>
        </div>

        {/* Documents */}
        <div className="rounded-3xl p-6 mb-8" style={{ background: T.navyTint, border: `1px solid ${T.hairGold}` }}>
          <h2 className="f-display text-xl font-semibold mb-6" style={{ color: T.navy }}>{t('adm_docs_extra_title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              <h3 className="f-thai font-semibold mb-4" style={{ color: T.ink }}>{t('adm_docs_today_title')}</h3>
              <div className="space-y-4">
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_doc_list_label')}</label>
                  <textarea rows={6} value={docList} onChange={e => setDocList(e.target.value)} className="focus-ring w-full rounded-2xl p-4" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_doc_list_eg')} /></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_doc_count_label')}</label>
                  <input type="number" value={docCount} onChange={e => setDocCount(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="0" /></div>
              </div>
            </div>
            <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              <h3 className="f-thai font-semibold mb-4" style={{ color: T.ink }}>{t('adm_extra_tasks_title')}</h3>
              <div className="space-y-4">
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_task_detail_label')}</label>
                  <textarea rows={6} value={extraTask} onChange={e => setExtraTask(e.target.value)} className="focus-ring w-full rounded-2xl p-4" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder={t('adm_task_detail_placeholder')} /></div>
                <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_task_status_label')}</label>
                  <select value={extraTaskStatus} onChange={e => setExtraTaskStatus(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }}>
                    <option value="">{t('adm_select_status')}</option><option value="เสร็จแล้ว">{t('adm_status_done')}</option><option value="กำลังดำเนินการ">{t('adm_status_inprogress')}</option><option value="รอติดตาม">{t('adm_status_followup')}</option>
                  </select></div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI */}
        <div className="rounded-3xl p-6 mb-8" style={{ background: T.brassPale, border: `1px solid ${T.hairGold}` }}>
          <h2 className="f-display text-lg font-semibold mb-4" style={{ color: T.brassDeep }}>Daily KPI</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_kpi_reply_label')}</label>
              <select value={kpiReply} onChange={e => setKpiReply(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }}>
                <option value="">{t('adm_select')}</option><option>{t('adm_yes')}</option><option>{t('adm_no')}</option>
              </select></div>
            <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_kpi_pending_label')}</label>
              <input type="number" value={kpiPending} onChange={e => setKpiPending(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="0" /></div>
            <div><label className="f-thai block text-sm mb-2" style={{ color: T.inkSoft }}>{t('adm_kpi_errors_label')}</label>
              <input type="number" value={kpiErrors} onChange={e => setKpiErrors(e.target.value)} className="focus-ring w-full rounded-2xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.hairGold}`, color: T.ink }} placeholder="0" /></div>
          </div>
        </div>

        {/* Footer */}
        <div className="rounded-3xl p-5 mb-8" style={{ background: T.navyDeep }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="f-display text-base font-semibold" style={{ color: T.brass }}>{t('adm_report_system_title')}</h2>
              <p className="f-thai text-sm mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{t('adm_report_system_desc')}</p>
            </div>
            <div className="rounded-2xl px-4 py-3 text-sm flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
              <p className="f-thai font-medium" style={{ color: '#FFFFFF' }}>{t('report_date_label')}</p>
              <p className="f-num" style={{ color: 'rgba(255,255,255,0.6)' }}>{today}</p>
            </div>
          </div>
        </div>

        {/* Report History */}
        <div className="rounded-3xl p-6 mb-8" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="f-display text-xl font-semibold" style={{ color: T.ink }}>{isAdmin ? t('adm_all_reports') : t('adm_my_reports')}</h2>
            <span className="f-thai text-sm" style={{ color: T.inkSoft }}>{reports.length} {t('adm_reports_unit')}</span>
          </div>
          {reportsLoading ? (
            <div className="text-center py-10 text-sm f-thai" style={{ color: T.inkSoft }}>{t('adm_loading')}</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-10 text-sm f-thai" style={{ color: T.inkSoft }}>{t('adm_no_reports_yet')}</div>
          ) : (
            <div className="space-y-3">
              {reports.map(report => (
                <div key={report.id} className="press rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4" style={{ border: `1px solid ${T.hair}` }}>
                  <div>
                    <p className="f-thai font-semibold" style={{ color: T.ink }}>{report.employee}</p>
                    <p className="f-thai text-sm" style={{ color: T.inkSoft }}>{report.date} • {t('adm_sent_at')} {report.submit_time}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="f-thai px-3 py-1 rounded-full text-sm font-medium" style={{ background: T.sageTint, color: T.sage }}>{report.status}</span>
                    <button onClick={() => setSelectedReport(report)}
                      className="press focus-ring f-thai px-4 py-2 rounded-xl text-sm" style={{ background: T.navy, color: '#fff' }}>{t('adm_view_report')}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-center mb-4">
          <button onClick={handleSubmitReport} disabled={submitted || authLoading}
            className="press focus-ring f-thai px-10 py-4 rounded-2xl text-lg font-semibold"
            style={
              submitted ? { background: '#8FD4A5', color: '#fff', cursor: 'not-allowed', opacity: 0.8 }
              : authLoading ? { background: '#9CA3AF', color: '#fff', cursor: 'not-allowed' }
              : { background: `linear-gradient(90deg, ${T.brass}, ${T.navy})`, color: '#fff' }
            }>
            {authLoading ? t('adm_submitting') : submitted ? t('adm_submitted_done') : t('adm_submit_daily_report')}
          </button>
        </div>

        </div>
      }{/* end dashboard tab */}

      </div>{/* end inner card */}
    </div>{/* end outer wrapper */}

      {/* Modal — แสดงสรุปอัตโนมัติ */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.4)' }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="f-display text-xl font-bold" style={{ color: T.ink }}>{t('adm_report_detail_title')}</h2>
                <p className="f-thai text-sm mt-1" style={{ color: T.inkSoft }}>{selectedReport.employee} • {selectedReport.date} • {selectedReport.submit_time}</p>
              </div>
              <button onClick={() => setSelectedReport(null)} className="press focus-ring f-thai px-4 py-2 rounded-xl text-sm" style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>{t('adm_close')}</button>
            </div>

            {/* ข้อมูลหลัก */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Check-in', value: `${selectedReport.check_in_guests || '0'} ${t('adm_guests_unit')}` },
                { label: 'Check-out', value: `${selectedReport.check_out_guests || '0'} ${t('adm_guests_unit')}` },
                { label: 'TM30', value: selectedReport.tm30_status || '-' },
                { label: 'Invoice', value: selectedReport.invoice_total ? `฿${Number(selectedReport.invoice_total).toLocaleString()}` : '-' },
              ].map((c, i) => (
                <div key={i} className="rounded-2xl p-3 text-center" style={{ background: T.bone }}>
                  <p className="f-thai text-xs mb-1" style={{ color: T.inkSoft }}>{c.label}</p>
                  <p className="f-num font-bold text-sm" style={{ color: T.ink }}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* สรุปอัตโนมัติ */}
            <div className="space-y-4 text-sm">
              <div className="rounded-2xl p-4" style={{ background: T.sageTint, border: `1px solid ${T.sage}30` }}>
                <p className="f-thai font-semibold mb-2" style={{ color: T.sage }}>{t('adm_completed_tasks')}</p>
                <p className="f-thai whitespace-pre-wrap leading-relaxed" style={{ color: T.inkSoft }}>{selectedReport.completed_tasks || '-'}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: T.brassPale, border: `1px solid ${T.hairGold}` }}>
                <p className="f-thai font-semibold mb-2" style={{ color: T.brassDeep }}>{t('adm_pending_followup_tasks')}</p>
                <p className="f-thai whitespace-pre-wrap leading-relaxed" style={{ color: T.inkSoft }}>{selectedReport.pending_tasks || '-'}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: T.wineTint, border: `1px solid ${T.wine}30` }}>
                <p className="f-thai font-semibold mb-2" style={{ color: T.wine }}>{t('adm_issues_found')}</p>
                <p className="f-thai whitespace-pre-wrap leading-relaxed" style={{ color: T.inkSoft }}>{selectedReport.issues_found || '-'}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: T.navyTint, border: `1px solid ${T.hairGold}` }}>
                <p className="f-thai font-semibold mb-2" style={{ color: T.navy }}>{t('adm_kpi_summary')}</p>
                <p className="f-thai whitespace-pre-wrap leading-relaxed" style={{ color: T.inkSoft }}>{selectedReport.suggestions || '-'}</p>
              </div>

              {/* รายละเอียดเพิ่มเติม */}
              <details className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
                <summary className="f-thai px-4 py-3 font-medium cursor-pointer" style={{ color: T.ink }}>{t('adm_more_details')}</summary>
                <div className="f-thai px-4 pb-4 space-y-2 pt-2" style={{ color: T.inkSoft }}>
                  <p><span className="font-medium" style={{ color: T.ink }}>{t('adm_checkin_time_colon')}</span> {selectedReport.check_in_time || '-'}</p>
                  <p><span className="font-medium" style={{ color: T.ink }}>{t('adm_checkin_rooms_colon')}</span> {selectedReport.check_in_rooms || '-'}</p>
                  <p><span className="font-medium" style={{ color: T.ink }}>{t('adm_checkout_rooms_colon')}</span> {selectedReport.check_out_rooms || '-'}</p>
                  <p><span className="font-medium" style={{ color: T.ink }}>{t('adm_extra_bookings_colon')}</span> {selectedReport.new_bookings || '-'} {t('adm_rooms_unit')} ({selectedReport.new_booking_rooms || '-'})</p>
                  <p><span className="font-medium" style={{ color: T.ink }}>{t('adm_invoice_colon')}</span> {selectedReport.invoice_rooms || '-'} {t('adm_rooms_unit')} {t('adm_room_number_label')} {selectedReport.invoice_room_numbers || '-'}</p>
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

