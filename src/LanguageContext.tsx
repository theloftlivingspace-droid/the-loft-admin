import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Lang = 'th' | 'en';

// ─── Translation dictionary ────────────────────────────────────────────────
// Add keys here as files get translated. Each file should pull only the
// keys it needs via t('key').
const DICT: Record<string, { th: string; en: string }> = {
  // ── Header / nav (AdminDailyDashboard) ──
  admin_mgmt_title:     { th: 'Admin Management Dashboard', en: 'Admin Management Dashboard' },
  daily_admin_title:    { th: 'Daily Admin Dashboard',      en: 'Daily Admin Dashboard' },
  admin_subtitle:       { th: 'บัญชีผู้ดูแลระบบ — ตรวจสอบรายงานของพนักงานทั้งหมดได้', en: 'Admin account — review all staff reports' },
  daily_subtitle:       { th: 'ระบบเช็คงานและสรุปรายงานประจำวันพนักงานธุรการ',       en: 'Daily task checklist and report summary for admin staff' },
  office_badge:         { th: '🏢 ออฟฟิศ', en: '🏢 Office' },
  online_badge:         { th: '🌐 ออนไลน์', en: '🌐 Online' },
  report_date_label:    { th: 'วันที่รายงาน', en: 'Report date' },
  logout_btn:           { th: '🚪 Logout', en: '🚪 Logout' },
  tab_dashboard:        { th: '📊 Dashboard', en: '📊 Dashboard' },
  tab_booking:          { th: '📋 Booking', en: '📋 Booking' },
  tab_checkinout:       { th: '🏨 Check-in/out', en: '🏨 Check-in/out' },
  tab_stock:            { th: '📦 Stock', en: '📦 Stock' },
  notif_booking_invoice:{ th: 'booking รอเพิ่ม', en: 'bookings pending' },
  notif_invoice_pending:{ th: 'invoice รอสร้าง', en: 'invoices pending' },
  notif_low_stock:      { th: 'รายการสต๊อกต่ำกว่าขั้นต่ำ', en: 'items below min stock' },

  // ── CheckInOut.tsx ──
  ci_checked_out_done:  { th: 'Checked Out แล้ว', en: 'Checked Out' },
  ci_checking_out_today:{ th: 'เช็คเอาท์วันนี้', en: 'Checking out today' },
  ci_checked_in_done:   { th: 'เช็คอินแล้ว', en: 'Checked In' },
  ci_arriving_today:    { th: 'เข้าวันนี้', en: 'Arriving today' },
  ci_arriving_soon:     { th: 'เข้าเร็วๆ นี้', en: 'Arriving soon' },
  ci_checkin_label:     { th: 'เช็คอิน', en: 'Check-in' },
  ci_checkout_label:    { th: 'เช็คเอาท์', en: 'Check-out' },
  ci_nights:            { th: 'คืน', en: 'nights' },
  ci_add_note:          { th: 'เพิ่ม Note', en: 'Add Note' },
  ci_upload_doc:        { th: 'อัปโหลดเอกสาร', en: 'Upload Document' },
  ci_view_docs:         { th: 'ดูเอกสาร', en: 'View Documents' },
  ci_inspected_by:      { th: 'ตรวจโดย', en: 'Inspected by' },
  ci_cleaned_by:        { th: 'ทำความสะอาด', en: 'Cleaned by' },
  ci_issues:            { th: 'ปัญหา', en: 'Issues' },
  ci_view_all:          { th: 'ทั้งหมด', en: 'All' },
  ci_view_checkedin:    { th: 'เช็คอินแล้ว', en: 'Checked in' },
  ci_view_arrivals:     { th: 'เข้าวันนี้', en: 'Arrivals' },
  ci_view_checkouts:    { th: 'เช็คเอาท์วันนี้', en: 'Checkouts' },
  ci_no_data:           { th: 'ไม่มีข้อมูล', en: 'No data' },
  ci_last_refresh:      { th: 'อัปเดต', en: 'Updated' },
  ci_today_label:       { th: 'วันนี้', en: 'Today' },
  ci_in_hotel:          { th: 'อยู่ในโรงแรม', en: 'In hotel' },
  ci_filter_all:        { th: 'ทั้งหมด', en: 'All' },
  ci_filter_checkedin:  { th: 'อยู่แล้ว', en: 'Checked in' },
  ci_filter_checkouts:  { th: 'เช็คเอาท์วันนี้', en: 'Checking out today' },
  ci_filter_arrivals:   { th: 'กำลังเข้า', en: 'Arriving' },
  ci_checkin_tm30:      { th: 'เช็คอิน + TM30', en: 'Check-in + TM30' },
  ci_arrives_in:        { th: 'เข้าในอีก', en: 'Arrives in' },
  ci_days:              { th: 'วัน', en: 'days' },
  ci_today_exclaim:     { th: 'วันนี้!', en: 'Today!' },
  ci_edit_note:         { th: 'แก้ Note', en: 'Edit Note' },
  ci_uploading:         { th: 'กำลังอัปโหลด…', en: 'Uploading…' },
  ci_checkout_done_label: { th: 'แล้ว', en: 'done' },
  ci_cancelled_booking: { th: 'ยกเลิก Booking', en: 'Booking Cancelled' },
  ci_no_show:           { th: 'No Show', en: 'No Show' },
  ci_remaining_nights:  { th: 'เหลือ', en: 'Remaining' },
  ci_checkout_early:    { th: 'Checkout แล้ว (ก่อนกำหนด — อัปเดต Sheet1)', en: 'Checked out (early — Sheet1 updated)' },
  ci_checkout_simple:   { th: 'Checkout แล้ว', en: 'Checked out' },
  ci_save_failed:       { th: 'บันทึกไม่สำเร็จ', en: 'Save failed' },
  ci_checked_in_toast:  { th: 'เช็คอินแล้ว', en: 'Checked in' },
  ci_cancel_booking_done:{ th: 'ยกเลิก booking แล้ว', en: 'Booking cancelled' },
  ci_note_saved_line_warn:{ th: 'Note บันทึกแล้ว ⚠️ LINE: ', en: 'Note saved ⚠️ LINE: ' },
  ci_note_saved_line_ok:{ th: 'บันทึก Note + แจ้ง LINE แล้ว ✅', en: 'Note saved + LINE notified ✅' },
  ci_save_failed_colon: { th: 'บันทึกไม่สำเร็จ: ', en: 'Save failed: ' },
  ci_upload_failed_colon:{ th: 'อัปโหลดไม่สำเร็จ: ', en: 'Upload failed: ' },
  ci_load_room_failed:  { th: 'โหลดข้อมูลห้องไม่สำเร็จ', en: 'Failed to load room data' },
  ci_invalid_data_format:{ th: 'รูปแบบข้อมูลไม่ถูกต้อง', en: 'Invalid data format' },
  ci_load_failed:       { th: 'โหลดข้อมูลไม่สำเร็จ', en: 'Failed to load data' },
  ci_loading_data:      { th: 'กำลังโหลดข้อมูล...', en: 'Loading data...' },
  ci_retry:             { th: 'ลองใหม่', en: 'Retry' },
  ci_room_status_title: { th: 'สถานะห้องพัก', en: 'Room Status' },
  ci_create_tm30:       { th: '📋 สร้าง TM30', en: '📋 Create TM30' },
  ci_refresh:           { th: '🔄 รีเฟรช', en: '🔄 Refresh' },
  ci_checkout_btn:      { th: '🧳 Checkout', en: '🧳 Checkout' },
  ci_cancel_booking_btn:{ th: '🚫 Cancel Booking', en: '🚫 Cancel Booking' },
  ci_confirm_cancel_q:  { th: 'ยืนยันยกเลิก?', en: 'Confirm cancel?' },
  ci_confirm:           { th: 'ยืนยัน', en: 'Confirm' },
  ci_no:                { th: 'ไม่', en: 'No' },
  ci_legend_title:      { th: 'หมายเหตุ', en: 'Legend' },
  ci_legend_ready:      { th: '🟢 ตรวจห้องผ่าน / ห้องพร้อม', en: '🟢 Inspected / Room ready' },
  ci_legend_not_inspected:{ th: '🟡 ยังไม่ตรวจห้อง', en: '🟡 Not inspected yet' },
  ci_legend_not_ready:  { th: '🔴 ห้องไม่พร้อม', en: '🔴 Room not ready' },
  ci_legend_unknown:    { th: '⚪ ไม่ทราบสถานะ', en: '⚪ Status unknown' },
  ci_note_modal_title:  { th: 'Note — ห้อง', en: 'Note — Room' },
  ci_note_placeholder:  { th: 'พิมพ์หมายเหตุ... (จะส่งไป LINE group แม่บ้านด้วย)', en: 'Type a note... (will also be sent to the housekeeping LINE group)' },
  ci_cancel:            { th: 'ยกเลิก', en: 'Cancel' },
  ci_saving:            { th: 'กำลังบันทึก...', en: 'Saving...' },
  ci_save_notify_line:  { th: '💾 บันทึก + แจ้ง LINE', en: '💾 Save + Notify LINE' },
  ci_download:          { th: 'ดาวน์โหลด', en: 'Download' },
  ci_click_download:    { th: 'คลิกเพื่อดาวน์โหลด', en: 'Click to download' },
};

type TranslationKey = keyof typeof DICT;

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey | string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'loft_admin_lang';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'th' || saved === 'en') return saved;
    } catch { /* ignore */ }
    return 'th';
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  }, [lang]);

  function setLang(l: Lang) {
    setLangState(l);
  }

  function t(key: TranslationKey | string): string {
    const entry = DICT[key];
    if (!entry) return key; // fallback: show the key itself so missing translations are obvious
    return entry[lang];
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within a LanguageProvider');
  return ctx;
}
