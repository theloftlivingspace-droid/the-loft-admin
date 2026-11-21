-- ตารางบันทึกการใช้งาน AI (เมตาดาต้าเท่านั้น — ไม่เก็บข้อความ/ชื่อแขก) ใช้ตรวจย้อนหลังและคุมโควตารายวัน
-- รันใน Supabase SQL editor ก่อนเปิดใช้ (ถ้ายังไม่สร้าง ระบบจะข้ามการบันทึกและโควตา แต่ AI ยังทำงานได้)
create table if not exists public.ai_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  feature text not null,
  actor text,
  lang text,
  confidence int,
  escalate boolean,
  reason text,
  input_len int
);
create index if not exists ai_audit_log_feature_created on public.ai_audit_log (feature, created_at desc);
alter table public.ai_audit_log enable row level security;  -- ไม่มี policy: เข้าถึงได้เฉพาะ service key ฝั่งเซิร์ฟเวอร์
