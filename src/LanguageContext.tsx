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

  // ── AdminDailyDashboard.tsx ──
  adm_task_reply:        { th: 'ตอบข้อความลูกค้า', en: 'Reply to customer messages' },
  adm_task_pricing:      { th: 'อัปเดตราคา รายวัน', en: 'Update daily pricing' },
  adm_task_checkin:      { th: 'ลงทะเบียนแขก Check-in', en: 'Register guest check-in' },
  adm_task_checkout_list:{ th: 'ตรวจสอบรายการ Check-out', en: 'Review check-out list' },
  adm_task_tm30:         { th: 'ลงทะเบียน TM30', en: 'Register TM30' },
  adm_task_booking:      { th: 'บันทึกการจองเพิ่ม', en: 'Record additional bookings' },
  adm_task_invoice:      { th: 'สร้างใบแจ้งหนี้ / ใบเสร็จ', en: 'Create invoice / receipt' },
  adm_task_stock:        { th: 'ตรวจสอบสต๊อก', en: 'Check stock' },
  adm_task_car:          { th: 'ตรวจสอบทะเบียนรถ', en: 'Check vehicle registration' },
  adm_task_docs:         { th: 'เตรียมเอกสาร', en: 'Prepare documents' },
  adm_task_scan:         { th: 'สแกน / จัดเก็บไฟล์', en: 'Scan / file documents' },
  adm_task_summary:      { th: 'สรุปรายงานประจำวัน', en: 'Summarize daily report' },
  adm_task_pending:      { th: 'ตรวจสอบงานค้าง', en: 'Check pending tasks' },

  adm_status_select:     { th: 'สถานะ', en: 'Status' },
  adm_status_done:       { th: 'เสร็จแล้ว', en: 'Done' },
  adm_status_inprogress: { th: 'กำลังดำเนินการ', en: 'In progress' },
  adm_status_followup:   { th: 'รอติดตาม', en: 'Pending follow-up' },
  adm_status_issue:      { th: 'มีปัญหา', en: 'Issue' },

  adm_register_subtitle: { th: 'สมัครสมาชิกพนักงานใหม่', en: 'Register new employee account' },
  adm_login_subtitle:    { th: 'ระบบรายงานงานประจำวันพนักงาน', en: 'Daily staff report system' },
  adm_office_network_badge:{ th: '🏢 เครือข่ายออฟฟิศ — เข้าได้ทุก account', en: '🏢 Office network — all accounts allowed' },
  adm_fullname_label:    { th: 'ชื่อ - นามสกุล', en: 'Full name' },
  adm_fullname_placeholder:{ th: 'กรอกชื่อพนักงาน', en: 'Enter employee name' },
  adm_username_label:    { th: 'Username', en: 'Username' },
  adm_username_placeholder:{ th: 'กรอก Username', en: 'Enter username' },
  adm_password_label:    { th: 'Password', en: 'Password' },
  adm_password_placeholder:{ th: 'กรอก Password', en: 'Enter password' },
  adm_processing:        { th: '⏳ กำลังดำเนินการ...', en: '⏳ Processing...' },
  adm_register_btn:      { th: 'สมัครสมาชิก', en: 'Register' },
  adm_login_btn:         { th: 'เข้าสู่ระบบ', en: 'Log in' },
  adm_back_to_login:     { th: 'กลับไปหน้าเข้าสู่ระบบ', en: 'Back to login' },
  adm_create_employee_account:{ th: 'สร้างบัญชีพนักงาน', en: 'Create employee account' },

  adm_alert_fill_all:       { th: 'กรุณากรอกข้อมูลให้ครบ', en: 'Please fill in all fields' },
  adm_alert_username_taken: { th: 'Username นี้ถูกใช้งานแล้ว', en: 'This username is already taken' },
  adm_alert_register_success:{ th: 'สมัครสมาชิกเรียบร้อยแล้ว', en: 'Registered successfully' },
  adm_alert_fill_credentials:{ th: 'กรุณากรอก Username และ Password', en: 'Please enter username and password' },
  adm_alert_wrong_credentials:{ th: 'Username หรือ Password ไม่ถูกต้อง', en: 'Incorrect username or password' },
  adm_alert_denied_title:   { th: '⛔ ไม่อนุญาต', en: '⛔ Not allowed' },
  adm_alert_denied_body:    { th: 'พนักงานสามารถเข้าใช้งานได้เฉพาะเครือข่ายออฟฟิศเท่านั้น', en: 'Employees can only access from the office network' },
  adm_alert_current_ip:     { th: 'IP ปัจจุบันของคุณ', en: 'Your current IP' },
  adm_alert_unknown:        { th: 'ไม่ทราบ', en: 'unknown' },
  adm_alert_notify_admin:   { th: 'กรุณาแจ้ง IP นี้ให้ admin หากต้องการอัปเดต', en: 'Please tell admin this IP if it needs updating' },
  adm_alert_fill_employee_name:{ th: 'กรุณากรอกชื่อพนักงานก่อนส่งรายงาน', en: 'Please enter employee name before submitting' },

  adm_current_ip:        { th: '🌐 IP ปัจจุบัน (ของคุณ)', en: '🌐 Current IP (yours)' },
  adm_office_ip_prefix:  { th: '🏢 Office IP Prefix (ที่ตั้งไว้)', en: '🏢 Office IP Prefix (configured)' },
  adm_ip_placeholder:    { th: 'เช่น 49.228.65', en: 'e.g. 49.228.65' },
  adm_save:              { th: 'บันทึก', en: 'Save' },
  adm_ip_match:          { th: '✅ IP ปัจจุบันตรงกับ Office', en: '✅ Current IP matches office' },
  adm_ip_mismatch:       { th: '⚠️ IP ปัจจุบันไม่ตรงกับ Office — employee จะ login ไม่ได้', en: "⚠️ Current IP doesn't match office — employees won't be able to log in" },

  adm_tab_users:         { th: '👥 จัดการบัญชี', en: '👥 Manage accounts' },

  adm_ql_checklist1:     { th: 'Checklist', en: 'Checklist' },
  adm_ql_checklist2:     { th: 'งานประจำวัน', en: 'Daily tasks' },
  adm_ql_check:          { th: 'ตรวจสอบ', en: 'Check' },
  adm_ql_stock:          { th: 'สต๊อก', en: 'Stock' },
  adm_ql_car:            { th: 'ทะเบียนรถ', en: 'Vehicle reg.' },

  adm_billing_btn:       { th: 'Billing Console (อพาร์ทเมนท์)', en: 'Billing Console (Apartment)' },
  adm_open_new_tab:      { th: '↗ เปิดแท็บใหม่', en: '↗ Open in new tab' },
  adm_billing_token_prompt:{ th: 'ใส่ Admin Token เพื่อเข้าระบบ', en: 'Enter Admin Token to access' },
  adm_cancel:            { th: 'ยกเลิก', en: 'Cancel' },
  adm_enter_system:      { th: 'เข้าระบบ', en: 'Enter' },
  adm_token_remembered:  { th: 'จำ token ไว้ในเครื่องนี้แล้ว', en: 'Token remembered on this device' },

  adm_stat_user:         { th: 'ผู้ใช้งาน', en: 'User' },
  adm_stat_done_tasks:   { th: 'งานเสร็จ', en: 'Tasks done' },
  adm_stat_checkin_today:{ th: 'Check-in วันนี้', en: 'Check-in today' },
  adm_stat_rooms:        { th: 'ห้อง', en: 'rooms' },
  adm_stat_all_reports:  { th: 'รายงานทั้งหมด', en: 'Total reports' },
  adm_stat_docs_unit:    { th: 'ฉบับ', en: 'docs' },

  adm_submitted_banner:  { th: '✅ ส่งรายงานประจำวันเรียบร้อยแล้ว —', en: '✅ Daily report submitted —' },

  adm_employee_name_label:{ th: 'ชื่อพนักงาน', en: 'Employee name' },
  adm_checkin_time_label:{ th: 'เวลาเข้างาน', en: 'Check-in time' },

  adm_checklist_title:   { th: 'Checklist งานประจำวัน', en: 'Daily Checklist' },

  adm_checkin_today_title:{ th: 'Check-in วันนี้', en: "Today's Check-ins" },
  adm_checkin_guest_count:{ th: 'จำนวนแขก Check-in', en: 'Number of check-in guests' },
  adm_checkin_rooms_label:{ th: 'ห้องที่ Check-in', en: 'Checked-in rooms' },
  adm_rooms_eg1:          { th: 'เช่น 201, 305, 402', en: 'e.g. 201, 305, 402' },
  adm_checkout_today_title:{ th: 'Check-out วันนี้', en: "Today's Check-outs" },
  adm_checkout_guest_count:{ th: 'จำนวนแขก Check-out', en: 'Number of check-out guests' },
  adm_checkout_rooms_label:{ th: 'ห้องที่ Check-out', en: 'Checked-out rooms' },
  adm_rooms_eg2:          { th: 'เช่น 102, 208', en: 'e.g. 102, 208' },
  adm_tm30_booking_title:{ th: 'TM30 & Booking', en: 'TM30 & Booking' },
  adm_tm30_complete_q:   { th: 'ลงทะเบียน TM30 ครบหรือไม่', en: 'TM30 registration complete?' },
  adm_select:            { th: 'เลือก', en: 'Select' },
  adm_tm30_complete:     { th: 'ครบแล้ว', en: 'Complete' },
  adm_tm30_incomplete:   { th: 'ยังไม่ครบ', en: 'Incomplete' },
  adm_new_bookings_count:{ th: 'บันทึกการจองเพิ่มกี่ห้อง', en: 'How many new bookings recorded' },
  adm_new_booking_rooms_label:{ th: 'ห้องที่มีการจองเพิ่ม', en: 'Rooms with new bookings' },
  adm_rooms_eg3:          { th: 'เช่น 203, 301', en: 'e.g. 203, 301' },
  adm_invoice_receipt_title:{ th: 'Invoice & Receipt', en: 'Invoice & Receipt' },
  adm_invoice_count:     { th: 'สร้างใบแจ้งหนี้ / ใบเสร็จกี่ห้อง', en: 'How many invoices/receipts created' },
  adm_invoice_total_label:{ th: 'ยอดรวมทั้งหมด (บาท)', en: 'Total amount (THB)' },
  adm_invoice_room_numbers_label:{ th: 'หมายเลขห้อง', en: 'Room numbers' },
  adm_rooms_eg4:          { th: 'เช่น 105, 302', en: 'e.g. 105, 302' },

  adm_stock_purchase_title:{ th: 'ตรวจสอบสต๊อก & จัดซื้อ', en: 'Stock Check & Purchasing' },
  adm_stock_low_title:   { th: 'รายการของใกล้หมด / ต้องซื้อเพิ่ม', en: 'Items running low / need restocking' },
  adm_stock_items_label: { th: 'รายการสินค้า', en: 'Item list' },
  adm_stock_items_eg:    { th: 'เช่น กระดาษชำระ, น้ำดื่ม, สบู่', en: 'e.g. tissue paper, drinking water, soap' },
  adm_stock_qty_label:   { th: 'จำนวนที่ต้องซื้อเพิ่ม', en: 'Quantity needed' },
  adm_stock_qty_eg:      { th: 'เช่น กระดาษชำระ 20 แพ็ค', en: 'e.g. tissue paper 20 packs' },
  adm_create_purchase_title:{ th: 'สร้างรายการจัดซื้อ', en: 'Create Purchase Order' },
  adm_supplier_label:    { th: 'ร้านค้า / Supplier', en: 'Shop / Supplier' },
  adm_supplier_placeholder:{ th: 'ระบุร้านค้าหรือ Supplier', en: 'Specify shop or supplier' },
  adm_budget_label:      { th: 'งบประมาณโดยประมาณ (บาท)', en: 'Estimated budget (THB)' },
  adm_purchase_status_label:{ th: 'สถานะการจัดซื้อ', en: 'Purchase status' },
  adm_purchase_status_pending:{ th: 'รออนุมัติ', en: 'Pending approval' },
  adm_purchase_status_ordered:{ th: 'สั่งซื้อแล้ว', en: 'Ordered' },
  adm_purchase_status_received:{ th: 'ได้รับสินค้าแล้ว', en: 'Received' },
  adm_purchase_note_label:{ th: 'หมายเหตุเพิ่มเติม', en: 'Additional notes' },
  adm_purchase_note_placeholder:{ th: 'รายละเอียดเพิ่มเติม', en: 'Additional details' },
  adm_stock_saving:      { th: '⏳ กำลังบันทึก...', en: '⏳ Saving...' },
  adm_stock_saved:       { th: '✅ บันทึกแล้ว', en: '✅ Saved' },
  adm_stock_save_btn:    { th: '💾 บันทึกสต็อก', en: '💾 Save stock' },

  adm_docs_extra_title:  { th: 'เอกสารที่ดำเนินการวันนี้ & งานเพิ่มเติม', en: "Today's Documents & Extra Tasks" },
  adm_docs_today_title:  { th: 'เอกสารที่ทำวันนี้', en: "Today's Documents" },
  adm_doc_list_label:    { th: 'รายการเอกสาร', en: 'Document list' },
  adm_doc_list_eg:       { th: 'เช่น ใบแจ้งหนี้ห้อง 302, สัญญาเช่า', en: 'e.g. invoice for room 302, lease agreement' },
  adm_doc_count_label:   { th: 'จำนวนเอกสารทั้งหมด', en: 'Total number of documents' },
  adm_extra_tasks_title: { th: 'งานอื่น ๆ ที่ได้รับมอบหมาย', en: 'Other Assigned Tasks' },
  adm_task_detail_label: { th: 'รายละเอียดงาน', en: 'Task details' },
  adm_task_detail_placeholder:{ th: 'ระบุงานเพิ่มเติมที่ได้รับมอบหมายวันนี้', en: 'Specify additional tasks assigned today' },
  adm_task_status_label: { th: 'สถานะงาน', en: 'Task status' },
  adm_select_status:     { th: 'เลือกสถานะ', en: 'Select status' },

  adm_kpi_reply_label:   { th: 'ตอบลูกค้าครบ', en: 'Replied to all customers' },
  adm_yes:               { th: 'YES', en: 'YES' },
  adm_no:                { th: 'NO', en: 'NO' },
  adm_kpi_pending_label: { th: 'จำนวนงานค้าง', en: 'Number of pending tasks' },
  adm_kpi_errors_label:  { th: 'จำนวนข้อผิดพลาด', en: 'Number of errors' },

  adm_report_system_title:{ th: 'ระบบส่งรายงานออนไลน์', en: 'Online Report Submission System' },
  adm_report_system_desc:{ th: 'ระบบจะสรุปข้อมูลทั้งหมดอัตโนมัติเมื่อกดส่งรายงาน', en: 'The system will automatically summarize all data when you submit the report' },

  adm_all_reports:       { th: 'รายงานทั้งหมด', en: 'All reports' },
  adm_my_reports:        { th: 'รายงานของฉัน', en: 'My reports' },
  adm_reports_unit:      { th: 'รายงาน', en: 'reports' },
  adm_loading:           { th: '⏳ กำลังโหลด...', en: '⏳ Loading...' },
  adm_no_reports_yet:    { th: 'ยังไม่มีรายงานที่ถูกส่ง', en: 'No reports submitted yet' },
  adm_sent_at:           { th: 'ส่งเวลา', en: 'Sent at' },
  adm_view_report:       { th: 'ดูรายงาน', en: 'View report' },

  adm_submitting:        { th: '⏳ กำลังบันทึก...', en: '⏳ Saving...' },
  adm_submitted_done:    { th: '✅ ส่งรายงานเรียบร้อยแล้ว', en: '✅ Report submitted' },
  adm_submit_daily_report:{ th: 'ส่งรายงานประจำวัน', en: 'Submit daily report' },

  adm_report_detail_title:{ th: 'รายละเอียดรายงาน', en: 'Report Details' },
  adm_close:             { th: '✕ ปิด', en: '✕ Close' },
  adm_guests_unit:       { th: 'ท่าน', en: 'guests' },
  adm_more_details:      { th: 'รายละเอียดเพิ่มเติม', en: 'More details' },
  adm_checkin_time_colon:{ th: 'เวลาเข้างาน:', en: 'Check-in time:' },
  adm_checkin_rooms_colon:{ th: 'ห้อง Check-in:', en: 'Check-in rooms:' },
  adm_checkout_rooms_colon:{ th: 'ห้อง Check-out:', en: 'Check-out rooms:' },
  adm_extra_bookings_colon:{ th: 'จองเพิ่ม:', en: 'Additional bookings:' },
  adm_invoice_colon:     { th: 'Invoice:', en: 'Invoice:' },
  adm_rooms_unit:        { th: 'ห้อง', en: 'rooms' },
  adm_room_number_label: { th: 'หมายเลข', en: 'number' },
  adm_completed_tasks:   { th: '✅ งานที่ทำเสร็จ', en: '✅ Completed tasks' },
  adm_pending_followup_tasks:{ th: '⏳ งานที่ต้องติดตามต่อ', en: '⏳ Tasks to follow up' },
  adm_issues_found:      { th: '⚠️ ปัญหาที่พบ', en: '⚠️ Issues found' },
  adm_kpi_summary:       { th: '📊 KPI สรุป', en: '📊 KPI Summary' },
  adm_checking_network:  { th: 'กำลังตรวจสอบเครือข่าย...', en: 'Checking network...' },
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
