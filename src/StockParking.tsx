import { useState, useEffect, useCallback, useRef } from 'react';
import { useLang } from './LanguageContext';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { T } from './theme';

const SB_URL = 'https://vshrmwfyanwwocftnccu.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzaHJtd2Z5YW53d29jZnRuY2N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTgyMTksImV4cCI6MjA5MzUzNDIxOX0.H8zKjDtCnRxzLcV2k-NsSIqJe0k_JkS-_zTtBaHCaGo';
const SB_HDR = { 'Content-Type':'application/json', apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`, Prefer:'resolution=merge-duplicates' };

async function sbLoad(key: string) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/settings?key=eq.${key}&select=value`, { headers: SB_HDR });
    const rows = await r.json();
    if (rows?.[0]?.value) return JSON.parse(rows[0].value);
  } catch {}
  return null;
}
async function sbSave(key: string, value: unknown) {
  await fetch(`${SB_URL}/rest/v1/settings`, {
    method: 'POST', headers: SB_HDR,
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
  });
}

// ── stock audit log ─────────────────────────────────────────────────────
interface StockAuditEntry { item_name:string; old_qty:number|null; new_qty:number|null; unit:string; note:string }
async function sbLogStockChanges(entries: StockAuditEntry[]) {
  if (!entries.length) return;
  try {
    await fetch(`${SB_URL}/rest/v1/stock_audit_log`, {
      method: 'POST', headers: SB_HDR,
      body: JSON.stringify(entries),
    });
  } catch {}
}
function diffStock(prev: { id:number; name:string; qty:number; unit:string; note:string }[], next: typeof prev): StockAuditEntry[] {
  const prevMap = new Map(prev.map(r => [r.id, r]));
  const nextMap = new Map(next.map(r => [r.id, r]));
  const entries: StockAuditEntry[] = [];
  for (const [id, n] of nextMap) {
    const p = prevMap.get(id);
    if (!p) {
      entries.push({ item_name: n.name, old_qty: null, new_qty: n.qty, unit: n.unit, note: 'added' });
    } else if (p.qty !== n.qty || p.name !== n.name || p.unit !== n.unit || p.note !== n.note) {
      const parts: string[] = [];
      if (p.name !== n.name) parts.push(`name: ${p.name} -> ${n.name}`);
      if (p.unit !== n.unit) parts.push(`unit: ${p.unit} -> ${n.unit}`);
      if (p.note !== n.note) parts.push(`note: ${p.note || '-'} -> ${n.note || '-'}`);
      entries.push({ item_name: n.name, old_qty: p.qty, new_qty: n.qty, unit: n.unit, note: parts.join('; ') });
    }
  }
  for (const [id, p] of prevMap) {
    if (!nextMap.has(id)) entries.push({ item_name: p.name, old_qty: p.qty, new_qty: null, unit: p.unit, note: 'deleted' });
  }
  return entries;
}

const W_CATS = ['AIR CONDITIONER','WATER HEATER','MICROWAVE','TV','REFRIGERATOR','PHOTOCOPIER'] as const;
type WCat = typeof W_CATS[number];

// ── Thai ↔ English translations for stock item names & units ──────────────
// Bidirectional: stored data may be Thai (legacy) or English (newly added items),
// so both STOCK_*_EN (th->en) and STOCK_*_TH (en->th) are used depending on `lang`.
const STOCK_NAME_EN: Record<string,string> = {
  'กระดาษทิชชู': 'Tissue paper',
  'น้ำดื่ม': 'Drinking water',
  'ยาสระผม+เจลอาบน้ำ+สบู่': 'Shampoo + Shower Gel + Soap',
  'ถุงขยะ': 'Trash bags',
  'roller': 'Lint roller',
  'ไมโครเวฟ': 'Microwave',
  'เตารีด': 'Iron',
  'ไดร์เป่าผม': 'Hair dryer',
  'หมอน': 'Pillow',
  'ผ้าปู+ผ้าเช็ดตัว+ผ้าเช็ดผม': 'Bedsheet + Bath towel + Hair towel set',
  'ผ้าเช็ดตัว': 'Bath towel',
  'ผ้าเช็ดผม': 'Hair towel',
  'ผ้าเช็ดมือ': 'Hand Towel',
  'ผ้าห่ม': 'Blanket',
  'ผ้านวม': 'Comforter',
  'ผ้าปูที่นอน': 'Bedsheet',
  'ที่นอน TOPPER': 'Mattress topper',
  'ทีวี': 'TV',
  'พัดลม': 'Fan',
  'กาน้ำร้อน': 'Electric kettle',
  'ชุดกะทะไฟฟ้า': 'Electric pan set',
  'สบู่': 'Soap',
  'แชมพู': 'Shampoo',
  'เจลอาบน้ำ': 'Shower gel',
  'พรมเช็ดเท้า': 'Door mat',
  'หน้ากากอนามัย': 'Face mask',
  'ฝาชักโครก': 'Toilet seat cover',
  'หลอดไฟ LED': 'LED light bulb',
  'แก้วกาแฟ': 'coffee cup',
  'แก้วน้ำ': 'water glass',
  'ปลอกหมอน': 'Pillowcase',
  'ที่นอน': 'Mattress',
  'โซฟา': 'Sofa',
  'หลอดไฟดวงเล็กสีเหลือง': 'Small yellow light bulb',
  'หลอดไฟดวงเล็กสีขาว': 'Small white light bulb',
  'เบาะปิกนิก': 'picnic mattress',
};
// Reverse (en->th), auto-derived, for items whose stored name is already English
const STOCK_NAME_TH: Record<string,string> = Object.fromEntries(
  Object.entries(STOCK_NAME_EN).map(([th, en]) => [en, th])
);
const STOCK_UNIT_EN: Record<string,string> = {
  'ม้วน': 'roll', 'ขวด': 'bottle', 'ชุด': 'set', 'ถุง': 'bag', 'ชิ้น': 'pc',
  'อัน': 'pc', 'ใบ': 'pc', 'ผืน': 'pc', 'เครื่อง': 'unit', 'ตัว': 'unit',
  'ก้อน': 'bar', 'กล่อง/ชิ้น': 'box/pc', 'ดวง': 'pc',
};
// Reverse (en->th) canonical unit, kept explicit since several Thai units share
// the same English word (e.g. อัน/ใบ/ผืน/ดวง all -> "pc")
const STOCK_UNIT_TH: Record<string,string> = {
  'pc': 'ชิ้น', 'roll': 'ม้วน', 'bottle': 'ขวด', 'set': 'ชุด', 'bag': 'ถุง',
  'unit': 'เครื่อง', 'bar': 'ก้อน', 'box/pc': 'กล่อง/ชิ้น',
};
const STOCK_NOTE_EN: Record<string,string> = {
  'เสีย 1': '1 broken',
  'ขนาดปกติ 7 / เล็ก 2': 'Standard 7 / Small 2',
};
const STOCK_NOTE_TH: Record<string,string> = Object.fromEntries(
  Object.entries(STOCK_NOTE_EN).map(([th, en]) => [en, th])
);

interface StockItem  { id:number; name:string; nameTh?:string; nameEn?:string; qty:number; unit:string; note:string; minQty?: number }

// ── auto-translate (Claude API via /api/translate) ─────────────────────────
const isThaiText = (s: string) => /[\u0E00-\u0E7F]/.test(s);

async function autoTranslate(text: string, context?: string): Promise<string> {
  if (!text.trim()) return '';
  const targetLang = isThaiText(text) ? 'en' : 'th';
  try {
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLang, sourceLang: 'auto', context }),
    });
    if (!r.ok) return '';
    const data = await r.json();
    return data.translated ?? '';
  } catch {
    return '';
  }
}
interface ParkingIn  { id:number; room:string; plate:string; type:string; name:string; status:string }
interface ParkingOut { id:number; plate:string; type:string; name:string; status:string }
interface Warranty   { id:number; cat:WCat; room:string; brand:string; model:string; sn:string; warranty:string; installed:string }

const EQUIP_CATS = ['อุปกรณ์ช่างทั่วไป', 'อุปกรณ์ซ่อมแซมตกแต่ง', 'อุปกรณ์งานประปา'] as const;
type EquipCat = typeof EQUIP_CATS[number];

interface EquipmentItem { id:number; cat:EquipCat; name:string; nameTh?:string; nameEn?:string; qty:number; unit:string; note:string }

// ช่างอาคาร (maintenance) equipment list, imported from Nathan's อุปกรณ์ช่าง.xlsx
// (2026-08) — seeds the Equipment tab's initial state (same pattern as the
// hardcoded stockData/warrantyData defaults above); once saved, the live copy
// in Supabase (key 'equipment_data') takes over.
const EQUIPMENT_SEED: Omit<EquipmentItem, 'id'>[] = [
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เครื่องตัดเหล็กไฟเบอร์', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เครื่องเชื่อมไฟฟ้า', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'หินเจียร์', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'แท่นตัดกระเบื้อง', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ประแจคอม้าตัวยาว', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ประแจคอม้าตัวสั้น', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เลื่อยลันดา', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เกียงฉาบ (เหล็ก)', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เกียงผสมปูน (เหล็ก)', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เกียงฉาบ (ไม้)', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'สว่านแบตmarkita', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ชุดสว่าน WORX', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เลื่อยวงเดือน 7 นิ้ว', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ใบหินเจียร์ตัดเหล็ก 7นิ้ว', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ใบหินเจียร์ ตัดไม้ 7นิ้ว', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เครื่องขัดกระดาษทรายไฟฟ้า', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เลื่อยมือตัดเหล็ก', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เลื่อยมือตัดแผ่นยิปซั่ม', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เพาใบพัดปั่นปูน', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กรรไกรพลาสติก', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กรรไกรตัดท่อ PVC', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ค้อนเหล็กด้ามไม้', qty: 0, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ค้อนเหล็กประดิษฐ์', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ปืนยิงกาว', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'แปรงขัดลวดเล็ก', qty: 0, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'แปรงขัดลวดกลาง', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'จอบ', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ค้อนปอนด์', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ฉะแลงขุด', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เชือก10เมตร', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เชือกเส้นใหญ่', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'หินลับ', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ลูกกลิ้งรีดวอลเปเปอร์', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'บันไดยาว', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'บันไดกลาง', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'พลาสติกซีนม้วน', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กล่องสว่างไม่ได้ใช้', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ประแจร์', qty: 5, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ประแจร์เลื่อน', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ลูกกลิ้งทาสี', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ลูกกลิ้งทาสีเล็ก', qty: 0, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'แปรงทาสีเล็ก', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'พุกพลาสติก', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ตะปู 3 นิ้ว', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ชุดน็อตตัวผู้+น็อตตัวเมีย', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ตะปู ดำ', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ระดับน้ำ', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เกรียง โป๊ว', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'คีมปากแหลม', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'คีมตัด', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ไดโว่ MICAWA 50Hz', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ตลับเมตร (กลาง)', qty: 3, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ตลับเมตร (ใหญ่)', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เลื่อยฉลุ', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'คราด', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'คีมล็อค', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กะบะผสมปูน', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กล่องตะปู และ สกรู', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ดอกสว่าน', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ไฟเบอร์ ตัดเหล็ก Automac 4นิ้ว (หนา)', qty: 5, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ไฟเบอร์ ตัดเหล็ก Automac 4นิ้ว (บาง)', qty: 3, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ไฟเบอร์ ตัดเหล็ก SOLIX 4นิ้ว (บาง)', qty: 6, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กรรไกรเหล็ก', qty: 6, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'สิ่วไม้', qty: 6, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'คีมถอนตะปู', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'คีมปากจิ้งจก', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'เครื่องถอดลูกปืน', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'คีมปากขยาย', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'คีมปากตรง', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'คีมปากโค้ง', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'คีมปากตรง', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ปะแจร์  ปากตาย', qty: 11, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ปะแจร์  ปากแหวน', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'หัวจับดอกสว่าน Drill Chucks SUNKEY 0.6 - 6 mm (1/4") รูแบบเกลียว 3/8', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'Dimmer Wide Series 600W ดิมเมอร์หรี่ไฟ รุ่น RKW-803', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'สวิตไฟ (เล็ก)', qty: 14, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'สวิตไฟ (ใหญ่)', qty: 8, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กรอบสวิตช์ไฟ  แบบ2ช่อง สั้น', qty: 8, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กรอบสวิตช์ไฟ  แบบ1ช่อง สั้น', qty: 5, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กรอบสวิตช์ไฟ  แบบ2ช่อง ยาว', qty: 3, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กรอบสวิตช์ไฟ  แบบ1ช่อง ยาว', qty: 3, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ตะปูคอนกรีตผิวเรียบ (Concrete Nails)    #12x1 นิ้ว', qty: 4, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'กระดาษทราย', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'ปืนยิงซิลิโคน', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ช่างทั่วไป', name: 'สายไฟใหญ่เส้นขาว', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'ปูนสกรีมโค้ท', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'ซิลิโคน', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'อาคลีลิค โป๊ว WALL PUTTY', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'เทบกาวกันซึม', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'เศษปูนยาแนวกระเบื้องที่เหลือใช้', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'เศษปูนยิปซั่มเหลือใช้', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'กาวอีพ็อกซี่ ซีล  (ใช้ในงานเหล็ก)', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'น้ำยาเคลือบพื้นไฮบริต', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'น้ำยากันซึม ตราเสือ', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'น้ำยากันซึม ตรา J.U', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีน้ำ สีเทาอ่อน Madison Grey 8256', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีน้ำ เทาเข้ม สีรองพื้นหยุดสนิม RUST TECH', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีน้ำมัน สีดำด้าน(BoardBlack) GF888', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีน้ำมัน น้ำตาลแดง(Coral Red) KG163', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีเคลือบเงา ตรา กระทิง สีขาว  KG111', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีน้ำทาภายในกึ่งเงา   สีครีม                              MAJESTIC PERFECT BEAUTYANDCARE A BASE', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'กระเบื้อง', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'กระเบื้องปูห้องยาวลายไม้', qty: 0, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'แผ่นลามิเนตลายไม้', qty: 4, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'แผ่นเหล็ก94cm×230cm.', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'แผ่นซีเมนต์บอร์ด', qty: 4, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'เศษสังกะสี', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'แผ่นอะคิลิค', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'กระจก', qty: 3, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีน้ำอะคิลิค  สีขาวด้าน ทาภายนอก  โฟร์ซีซันส์ แอดวานซ์  เบส 1/4 กล #000A (สีขาว) + A2004', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีทาหลังคา TOA ROOFPAINT แดงเอราวัญ (RUSTIC RED)  R19', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีเคลือบเงา SUPER COAT SHMRG395223', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีสเปรย์ ดำ FLAT BLACK 29', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'ซีเมนต์ขัดมันสำเร็จรูป  Decoration Cement (น้ำยาซีเมนต์ล็อฟ)', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'น้ำยาขจัดปัญหาท่ออุดตัน', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'JOTUN  GARDEX PREMIUM E.G.BASE A', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: 'สีน้ำด้าน ภายใน TOA รุ่น 4 Seasons Advance', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์ซ่อมแซมตกแต่ง', name: '4 SEASONS EMULSION MATT INT BASE 2.5 GL #000B', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'ข้อต่อเกียวใน pvc', qty: 21, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'ข้อต่อเกลียวนอก PVC', qty: 14, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'ข้อต่อเกลียวชุด', qty: 50, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'ข้องอ เล็ก', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'ข้องอ PVC 2 นิ้วครึ่ง', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'ข้อลด1 นิ้ว×6หุน', qty: 3, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'ฝาเกลียวปิดท่อประปา', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'ข้อแยกลด3ทาง PVC 2.5"×4หุน', qty: 4, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'เศษท่อ PVC', qty: 1, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'คลิปจับท่อpvc 4หุน', qty: 3, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'เทปพันกลียว', qty: 2, unit: 'ชิ้น', note: '' },
  { cat: 'อุปกรณ์งานประปา', name: 'ข้อต่อยูเนี่ยน PVC หนา', qty: 6, unit: 'ชิ้น', note: '' },
];
const EQUIP_NAME_EN: Record<string,string> = {
  'เครื่องตัดเหล็กไฟเบอร์': 'Fiber metal cutter',
  'เครื่องเชื่อมไฟฟ้า': 'Electric welding machine',
  'หินเจียร์': 'Angle grinder',
  'แท่นตัดกระเบื้อง': 'Tile cutting machine',
  'ประแจคอม้าตัวยาว': 'Long pipe wrench',
  'ประแจคอม้าตัวสั้น': 'Short pipe wrench',
  'เลื่อยลันดา': 'Crosscut handsaw',
  'เกียงฉาบ (เหล็ก)': 'Steel plastering trowel',
  'เกียงผสมปูน (เหล็ก)': 'Steel mortar mixing trowel',
  'เกียงฉาบ (ไม้)': 'Wood plastering trowel',
  'สว่านแบตmarkita': 'Makita cordless drill',
  'ชุดสว่าน WORX': 'WORX drill set',
  'เลื่อยวงเดือน 7 นิ้ว': '7" circular saw',
  'ใบหินเจียร์ตัดเหล็ก 7นิ้ว': '7" metal cutting disc',
  'ใบหินเจียร์ ตัดไม้ 7นิ้ว': '7" wood cutting disc',
  'เครื่องขัดกระดาษทรายไฟฟ้า': 'Electric sander',
  'เลื่อยมือตัดเหล็ก': 'Hand hacksaw (metal)',
  'เลื่อยมือตัดแผ่นยิปซั่ม': 'Hand saw for gypsum board',
  'เพาใบพัดปั่นปูน': 'Mortar mixing paddle',
  'กรรไกรพลาสติก': 'Plastic scissors',
  'กรรไกรตัดท่อ PVC': 'PVC pipe cutter',
  'ค้อนเหล็กด้ามไม้': 'Steel hammer, wooden handle',
  'ค้อนเหล็กประดิษฐ์': 'Forged steel hammer',
  'ปืนยิงกาว': 'Glue gun',
  'แปรงขัดลวดเล็ก': 'Small wire brush',
  'แปรงขัดลวดกลาง': 'Medium wire brush',
  'จอบ': 'Hoe',
  'ค้อนปอนด์': 'Sledgehammer',
  'ฉะแลงขุด': 'Digging mattock',
  'เชือก10เมตร': 'Rope, 10 m',
  'เชือกเส้นใหญ่': 'Thick rope',
  'หินลับ': 'Sharpening stone',
  'ลูกกลิ้งรีดวอลเปเปอร์': 'Wallpaper seam roller',
  'บันไดยาว': 'Long ladder',
  'บันไดกลาง': 'Medium ladder',
  'พลาสติกซีนม้วน': 'Plastic sheeting roll',
  'กล่องสว่างไม่ได้ใช้': 'Spare light box (unused)',
  'ประแจร์': 'Wrench',
  'ประแจร์เลื่อน': 'Adjustable wrench',
  'ลูกกลิ้งทาสี': 'Paint roller',
  'ลูกกลิ้งทาสีเล็ก': 'Small paint roller',
  'แปรงทาสีเล็ก': 'Small paint brush',
  'พุกพลาสติก': 'Plastic wall anchors',
  'ตะปู 3 นิ้ว': 'Nails, 3"',
  'ชุดน็อตตัวผู้+น็อตตัวเมีย': 'Nut & bolt set',
  'ตะปู ดำ': 'Black nails',
  'ระดับน้ำ': 'Spirit level',
  'เกรียง โป๊ว': 'Putty knife',
  'คีมปากแหลม': 'Needle-nose pliers',
  'คีมตัด': 'Cutting pliers',
  'ไดโว่ MICAWA 50Hz': 'MICAWA submersible pump, 50Hz',
  'ตลับเมตร (กลาง)': 'Measuring tape (medium)',
  'ตลับเมตร (ใหญ่)': 'Measuring tape (large)',
  'เลื่อยฉลุ': 'Coping saw',
  'คราด': 'Rake',
  'คีมล็อค': 'Locking pliers',
  'กะบะผสมปูน': 'Mortar mixing tray',
  'กล่องตะปู และ สกรู': 'Box of nails & screws',
  'ดอกสว่าน': 'Drill bits',
  'ไฟเบอร์ ตัดเหล็ก Automac 4นิ้ว (หนา)': 'Automac 4" metal cutting disc (thick)',
  'ไฟเบอร์ ตัดเหล็ก Automac 4นิ้ว (บาง)': 'Automac 4" metal cutting disc (thin)',
  'ไฟเบอร์ ตัดเหล็ก SOLIX 4นิ้ว (บาง)': 'SOLIX 4" metal cutting disc (thin)',
  'กรรไกรเหล็ก': 'Tin snips',
  'สิ่วไม้': 'Wood chisel',
  'คีมถอนตะปู': 'Nail-puller pliers',
  'คีมปากจิ้งจก': 'Long-nose pliers',
  'เครื่องถอดลูกปืน': 'Bearing puller',
  'คีมปากขยาย': 'Adjustable-jaw pliers',
  'คีมปากตรง': 'Straight-nose pliers',
  'คีมปากโค้ง': 'Curved-nose pliers',
  'ปะแจร์  ปากตาย': 'Open-end wrench',
  'ปะแจร์  ปากแหวน': 'Box-end wrench',
  'หัวจับดอกสว่าน Drill Chucks SUNKEY 0.6 - 6 mm (1/4") รูแบบเกลียว 3/8': 'SUNKEY drill chuck 0.6–6mm (1/4"), 3/8" threaded bore',
  'Dimmer Wide Series 600W ดิมเมอร์หรี่ไฟ รุ่น RKW-803': 'Dimmer switch, 600W Wide Series, RKW-803',
  'สวิตไฟ (เล็ก)': 'Light switch (small)',
  'สวิตไฟ (ใหญ่)': 'Light switch (large)',
  'กรอบสวิตช์ไฟ  แบบ2ช่อง สั้น': 'Switch cover plate, 2-gang, short',
  'กรอบสวิตช์ไฟ  แบบ1ช่อง สั้น': 'Switch cover plate, 1-gang, short',
  'กรอบสวิตช์ไฟ  แบบ2ช่อง ยาว': 'Switch cover plate, 2-gang, long',
  'กรอบสวิตช์ไฟ  แบบ1ช่อง ยาว': 'Switch cover plate, 1-gang, long',
  'ตะปูคอนกรีตผิวเรียบ (Concrete Nails)    #12x1 นิ้ว': 'Smooth concrete nails #12 x 1"',
  'กระดาษทราย': 'Sandpaper',
  'ปืนยิงซิลิโคน': 'Silicone caulking gun',
  'สายไฟใหญ่เส้นขาว': 'Large white electrical wire',
  'ปูนสกรีมโค้ท': 'Skim coat cement',
  'ซิลิโคน': 'Silicone',
  'อาคลีลิค โป๊ว WALL PUTTY': 'Acrylic wall putty',
  'เทบกาวกันซึม': 'Waterproof adhesive tape',
  'เศษปูนยาแนวกระเบื้องที่เหลือใช้': 'Leftover tile grout',
  'เศษปูนยิปซั่มเหลือใช้': 'Leftover gypsum plaster',
  'กาวอีพ็อกซี่ ซีล  (ใช้ในงานเหล็ก)': 'Epoxy seal adhesive (for steel work)',
  'น้ำยาเคลือบพื้นไฮบริต': 'Hybrid floor coating solution',
  'น้ำยากันซึม ตราเสือ': 'Waterproofing solution, Tiger brand',
  'น้ำยากันซึม ตรา J.U': 'Waterproofing solution, J.U brand',
  'สีน้ำ สีเทาอ่อน Madison Grey 8256': 'Water paint, light grey, Madison Grey 8256',
  'สีน้ำ เทาเข้ม สีรองพื้นหยุดสนิม RUST TECH': 'Water paint, dark grey, RUST TECH rust-stop primer',
  'สีน้ำมัน สีดำด้าน(BoardBlack) GF888': 'Oil paint, matte black (BoardBlack) GF888',
  'สีน้ำมัน น้ำตาลแดง(Coral Red) KG163': 'Oil paint, reddish brown (Coral Red) KG163',
  'สีเคลือบเงา ตรา กระทิง สีขาว  KG111': 'Gloss enamel, Bison brand, white, KG111',
  'สีน้ำทาภายในกึ่งเงา   สีครีม                              MAJESTIC PERFECT BEAUTYANDCARE A BASE': 'Semi-gloss interior water paint, cream, Majestic Perfect Beauty & Care A Base',
  'กระเบื้อง': 'Tile',
  'กระเบื้องปูห้องยาวลายไม้': 'Wood-look plank floor tile',
  'แผ่นลามิเนตลายไม้': 'Wood-grain laminate sheet',
  'แผ่นเหล็ก94cm×230cm.': 'Steel sheet, 94×230cm',
  'แผ่นซีเมนต์บอร์ด': 'Cement board sheet',
  'เศษสังกะสี': 'Leftover zinc sheet',
  'แผ่นอะคิลิค': 'Acrylic sheet',
  'กระจก': 'Glass',
  'สีน้ำอะคิลิค  สีขาวด้าน ทาภายนอก  โฟร์ซีซันส์ แอดวานซ์  เบส 1/4 กล #000A (สีขาว) + A2004': 'Acrylic exterior paint, matte white, Four Seasons Advance, Base 1/4gal #000A + A2004',
  'สีทาหลังคา TOA ROOFPAINT แดงเอราวัญ (RUSTIC RED)  R19': 'TOA Roofpaint, Rustic Red R19',
  'สีเคลือบเงา SUPER COAT SHMRG395223': 'Super Coat gloss enamel, SHMRG395223',
  'สีสเปรย์ ดำ FLAT BLACK 29': 'Spray paint, flat black 29',
  'ซีเมนต์ขัดมันสำเร็จรูป  Decoration Cement (น้ำยาซีเมนต์ล็อฟ)': 'Ready-mix polished cement, Decoration Cement (loft finish)',
  'น้ำยาขจัดปัญหาท่ออุดตัน': 'Drain unclogging solution',
  'JOTUN  GARDEX PREMIUM E.G.BASE A': 'Jotun Gardex Premium E.G. Base A',
  'สีน้ำด้าน ภายใน TOA รุ่น 4 Seasons Advance': 'TOA matte interior paint, 4 Seasons Advance',
  '4 SEASONS EMULSION MATT INT BASE 2.5 GL #000B': '4 Seasons Emulsion Matt Interior Base 2.5gal #000B',
  'ข้อต่อเกียวใน pvc': 'PVC female threaded connector',
  'ข้อต่อเกลียวนอก PVC': 'PVC male threaded connector',
  'ข้อต่อเกลียวชุด': 'Threaded connector set',
  'ข้องอ เล็ก': 'Small elbow',
  'ข้องอ PVC 2 นิ้วครึ่ง': 'PVC elbow, 2.5"',
  'ข้อลด1 นิ้ว×6หุน': 'Reducer, 1"×3/4"',
  'ฝาเกลียวปิดท่อประปา': 'Threaded pipe cap',
  'ข้อแยกลด3ทาง PVC 2.5"×4หุน': 'PVC 3-way reducing tee, 2.5"×1/2"',
  'เศษท่อ PVC': 'PVC pipe offcuts',
  'คลิปจับท่อpvc 4หุน': 'PVC pipe clip, 1/2"',
  'เทปพันกลียว': 'Thread seal tape',
  'ข้อต่อยูเนี่ยน PVC หนา': 'PVC union connector, heavy-duty',
};
const EQUIP_NAME_TH: Record<string,string> = Object.fromEntries(
  Object.entries(EQUIP_NAME_EN).map(([th, en]) => [en, th])
);

const EQUIP_CAT_EN: Record<string,string> = {
  'อุปกรณ์ช่างทั่วไป': 'General Tools',
  'อุปกรณ์ซ่อมแซมตกแต่ง': 'Repair & Decoration',
  'อุปกรณ์งานประปา': 'Plumbing',
};



// ── Patrol types & helpers ────────────────────────────────────────────────
interface PatrolUnknown { id: string; plate: string; timestamp: string; photos: string[]; notes: string; spotNumber: string }

async function compressImg(dataUrl: string): Promise<string> {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 800 / Math.max(img.width || 1, img.height || 1));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.72));
    };
    img.src = dataUrl;
  });
}

function nowTH() {
  return new Date().toLocaleString('th-TH', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Bangkok',
  });
}

function PatrolCard({ u, onDelete, t }: { u: PatrolUnknown; onDelete: (id: string) => void; t: (k: string) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="f-thai rounded-xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.wine}30` }}>
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setOpen(x => !x)}>
        {u.photos[0]
          ? <img src={u.photos[0]} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" style={{ border: `1px solid ${T.hair}` }} />
          : <div className="w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 text-2xl" style={{ background: T.bone }}>🚗</div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="f-num font-bold text-sm" style={{ color: T.ink }}>{u.plate || '—'}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: T.wineTint, color: T.wine, border: `1px solid ${T.wine}30` }}>
              {t('sp_patrol_unknown_badge')}
            </span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: T.inkSoft }}>{u.timestamp}</div>
          {u.spotNumber && <div className="text-xs" style={{ color: T.inkSoft }}>{t('sp_patrol_spot_label')}: {u.spotNumber}</div>}
        </div>
        <span className="text-sm" style={{ color: T.inkSoft }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-3 space-y-2" style={{ borderTop: `1px solid ${T.hair}` }}>
          {u.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {u.photos.map((p, i) => (
                <img key={i} src={p} alt="" className="h-24 w-24 rounded-lg object-cover flex-shrink-0" style={{ border: `1px solid ${T.hair}` }} />
              ))}
            </div>
          )}
          {u.notes && <p className="text-sm rounded-lg p-2" style={{ color: T.ink, background: T.bone }}>{u.notes}</p>}
          <button onClick={() => onDelete(u.id)}
            className="press text-xs rounded-lg px-3 py-1.5" style={{ border: `1px solid ${T.wine}30`, color: T.wine }}>
            🗑 {t('sp_delete')}
          </button>
        </div>
      )}

    </div>
  );
}

// ── Modal wrapper (module-level: must NOT be redefined on every render of
//    StockParking, or React remounts it — and its children inputs — on every
//    keystroke, which is what was breaking typing/adding items) ────────────
const Modal = ({title,onClose,onSave,children,cancelLabel,saveLabel}:{title:string;onClose:()=>void;onSave:()=>void;children:React.ReactNode;cancelLabel:string;saveLabel:string}) => (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 overflow-y-auto p-4 flex items-start sm:items-center justify-center">
    <div className="f-thai rounded-3xl p-6 w-full max-w-md my-8 sm:my-0" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.4)' }}>
      <h3 className="f-display text-base font-semibold mb-4" style={{ color: T.ink }}>{title}</h3>
      <div className="space-y-3">{children}</div>
      <div className="flex gap-2 mt-5 justify-end">
        <button onClick={onClose} className="press px-4 py-2 rounded-xl text-sm" style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>{cancelLabel}</button>
        <button onClick={onSave}  className="press px-5 py-2 rounded-xl text-sm font-medium" style={{ background: T.navy, color: '#fff' }}>{saveLabel}</button>
      </div>
    </div>
  </div>
);

const Field = ({label,children}:{label:string;children:React.ReactNode}) => (
  <div><label className="f-thai block text-xs mb-1" style={{ color: T.inkSoft }}>{label}</label>{children}</div>
);

// ── drag-and-drop reordering (works with mouse and touch) ──────────────────
// One row wrapper used inside every reorderable <table>: it turns a <tr>
// into a drag source/target via dnd-kit's useSortable, driven by the handle
// rendered inside it (via the `handleProps` render-prop).
// Self-heal any rows that already ended up sharing an id (from the old
// next-id-counter bug) — keeps the first occurrence's id and reassigns
// later duplicates to fresh unique ids, so drag-and-drop keys never collide.
function dedupeIds<T extends { id: number }>(arr: T[]): T[] {
  const seen = new Set<number>();
  let nextId = arr.length ? Math.max(...arr.map(r => r.id)) + 1 : 1;
  return arr.map(r => {
    if (seen.has(r.id)) { const fixedRow = { ...r, id: nextId }; seen.add(nextId); nextId += 1; return fixedRow; }
    seen.add(r.id);
    return r;
  });
}

function SortableRow({id, className, style: styleProp, children}:{id:number|string; className?:string; style?: React.CSSProperties; children:(handleProps:{attributes: import('@dnd-kit/core').DraggableAttributes; listeners: ReturnType<typeof useSortable>['listeners']})=>React.ReactNode}) {
  const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({ id });
  const style: React.CSSProperties = {
    ...styleProp,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? T.navyTint : styleProp?.background,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined,
  };
  return (
    <tr ref={setNodeRef} style={style} className={className}>
      {children({attributes, listeners})}
    </tr>
  );
}

const DragHandle = (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" {...props}
    className="press w-6 h-6 rounded-lg flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
    style={{ color: T.inkSoft }}
    aria-label="drag to reorder">⠿</button>
);

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
}


export default function StockParking({ group, initialTab, onLowStockChange, isAdmin }: { group: 'stock'|'parking'; initialTab?: 'stock'|'parking-in'|'parking-out'|'patrol'|'warranty'|'equipment'; onLowStockChange?: (count: number) => void; isAdmin?: boolean }) {
  const { t, lang } = useLang();
  // ── nav ──────────────────────────────────────────────────────────────────
  const SECTION_GROUPS = {
    stock:   ['stock', 'warranty', 'equipment'],
    parking: ['parking-in', 'parking-out', 'patrol'],
  } as const;
  const [section, setSection] = useState<'stock'|'parking-in'|'parking-out'|'patrol'|'warranty'|'equipment'>(initialTab ?? SECTION_GROUPS[group][0]);
  useEffect(() => { if (initialTab) setSection(initialTab); }, [initialTab]);
  // If the active main tab (group) changes and the current sub-tab doesn't
  // belong to it, snap to that group's first sub-tab.
  useEffect(() => {
    setSection(s => (SECTION_GROUPS[group] as readonly string[]).includes(s) ? s : SECTION_GROUPS[group][0]);
  }, [group]);
  useEffect(() => { window.scrollTo(0, 0); }, [section]);
  const [saving, setSaving] = useState('');
  const [saved,  setSaved]  = useState('');

  // ── stock ────────────────────────────────────────────────────────────────
  const [stockData, setStockData] = useState<StockItem[]>([
    {id:1, name:'กระดาษทิชชู',    qty:51, unit:'ม้วน', note:'',                          minQty:10},
    {id:2, name:'น้ำดื่ม',         qty:61, unit:'ขวด',  note:'',                          minQty:10},
    {id:16,name:'ยาสระผม+เจลอาบน้ำ+สบู่', qty:20, unit:'ชุด',  note:'',                          minQty:10},
    {id:24,name:'ถุงขยะ',          qty:0,  unit:'ถุง',  note:'',                          minQty:2},
    {id:25,name:'roller',          qty:0,  unit:'ชิ้น', note:'',                          minQty:2},
    {id:3, name:'ไมโครเวฟ',        qty:1,  unit:'อัน',  note:''},
    {id:4, name:'เตารีด',          qty:1,  unit:'อัน',  note:''},
    {id:5, name:'ไดร์เป่าผม',      qty:2,  unit:'อัน',  note:''},
    {id:6, name:'หมอน',            qty:3,  unit:'ใบ',   note:''},
    {id:7, name:'ผ้าปู+ผ้าเช็ดตัว+ผ้าเช็ดผม', qty:1, unit:'ชุด', note:''},
    {id:8, name:'ผ้าเช็ดตัว',      qty:2,  unit:'ผืน',  note:''},
    {id:9, name:'ผ้านวม',          qty:1,  unit:'ผืน',  note:''},
    {id:10,name:'ผ้าปูที่นอน',     qty:1,  unit:'ผืน',  note:''},
    {id:11,name:'ที่นอน TOPPER',   qty:1,  unit:'อัน',  note:''},
    {id:12,name:'ทีวี',            qty:1,  unit:'เครื่อง',note:''},
    {id:13,name:'พัดลม',           qty:1,  unit:'ตัว',  note:''},
    {id:14,name:'กาน้ำร้อน',       qty:2,  unit:'ใบ',   note:'เสีย 1'},
    {id:15,name:'ชุดกะทะไฟฟ้า',   qty:2,  unit:'ชุด',  note:''},
    {id:17,name:'สบู่',            qty:21, unit:'ก้อน', note:''},
    {id:18,name:'แชมพู',           qty:27, unit:'ขวด',  note:''},
    {id:19,name:'เจลอาบน้ำ',      qty:4,  unit:'ขวด',  note:''},
    {id:20,name:'พรมเช็ดเท้า',     qty:8,  unit:'ผืน',  note:''},
    {id:21,name:'หน้ากากอนามัย',   qty:0,  unit:'กล่อง/ชิ้น',note:''},
    {id:22,name:'ฝาชักโครก',       qty:2,  unit:'อัน',  note:''},
    {id:23,name:'หลอดไฟ LED',     qty:8,  unit:'ดวง',  note:'ขนาดปกติ 7 / เล็ก 2'},
  ]);
  const [nextSId, setNextSId] = useState(26);
  // Snapshot of the last-known-saved stock state, used to diff against on save
  // so we can write per-item audit log entries instead of just overwriting the blob.
  const stockSnapshotRef = useRef<StockItem[]>(stockData);
  const [showStockModal, setShowStockModal] = useState(false);
  const [newStock, setNewStock] = useState<{name:string;nameTh?:string;nameEn?:string;qty:number;unit:string;note:string;minQty?:number}>({name:'',nameTh:'',nameEn:'',qty:0,unit:'',note:''});
  const [translatingStockName, setTranslatingStockName] = useState(false);

  // Notify parent when low-stock count changes
  const lowStockCount = stockData.filter(r => r.minQty !== undefined && r.qty < r.minQty).length;
  useEffect(() => { onLowStockChange?.(lowStockCount); }, [lowStockCount, onLowStockChange]);

  const changeQty = (id:number, delta:number) =>
    setStockData(d => d.map(r => r.id===id ? {...r, qty:Math.max(0,r.qty+delta)} : r));
  const updateStockNote = (id:number, note:string) =>
    setStockData(d => d.map(r => r.id===id ? {...r, note} : r));
  const updateStockName = (id:number, value:string, editLang:'th'|'en') =>
    setStockData(d => d.map(r => {
      if (r.id !== id) return r;
      return editLang==='en' ? {...r, nameEn:value} : {...r, nameTh:value, name:value};
    }));
  const updateStockUnit = (id:number, unit:string) =>
    setStockData(d => d.map(r => r.id===id ? {...r, unit} : r));
  const updateStockMinQty = (id:number, raw:string) =>
    setStockData(d => d.map(r => {
      if (r.id !== id) return r;
      if (raw.trim() === '') { const { minQty, ...rest } = r; return rest; }
      const n = Math.max(0, Math.floor(Number(raw)));
      return Number.isFinite(n) ? { ...r, minQty: n } : r;
    }));
  const delStock = (id:number) => setStockData(d => d.filter(r=>r.id!==id));
  const addStock = () => {
    if(!newStock.name.trim()) return;
    setStockData(d => [...d, {id:nextSId, ...newStock}]);
    setNextSId(n=>n+1); setNewStock({name:'',nameTh:'',nameEn:'',qty:0,unit:'',note:'',minQty:undefined}); setShowStockModal(false);
  };

  // ── parking in ───────────────────────────────────────────────────────────
  const [parkingIn, setParkingIn] = useState<ParkingIn[]>([
    {id:1,room:'105',plate:'บธ1074',type:'Car',name:'',status:'OK'},
    {id:2,room:'105',plate:'8316',type:'',name:'',status:''},
    {id:3,room:'107',plate:'4500',type:'',name:'',status:''},
    {id:4,room:'213',plate:'5ขย2961',type:'Car',name:'',status:'OK'},
    {id:5,room:'302',plate:'3091',type:'',name:'',status:''},
    {id:6,room:'306',plate:'7051',type:'',name:'',status:''},
    {id:7,room:'308',plate:'8ขฎ8365',type:'Motorcycle',name:'',status:'OK'},
    {id:8,room:'312',plate:'กว 1156',type:'',name:'อารียา เรียมแสน',status:''},
    {id:9,room:'315',plate:'ถฬ7555',type:'',name:'ฤกษ์มงคล เย็นใจ',status:'OK'},
    {id:10,room:'315',plate:'1ณ0264',type:'',name:'ฤกษ์มงคล เย็นใจ',status:''},
    {id:11,room:'406',plate:'8กว691',type:'Car',name:'',status:'OK'},
    {id:12,room:'409',plate:'ตถ617',type:'Car',name:'',status:'OK'},
    {id:13,room:'410',plate:'บธ5372',type:'Car',name:'เจนจิรา ปัดถาวโร',status:'OK'},
    {id:14,room:'414',plate:'533',type:'',name:'',status:''},
    {id:15,room:'414',plate:'5612',type:'',name:'',status:''},
    {id:16,room:'516',plate:'3ขส7034',type:'Car',name:'',status:'OK'},
  ]);
  const [nextPIId, setNextPIId] = useState(17);
  const [showPIModal, setShowPIModal] = useState(false);
  const [newPI, setNewPI] = useState({room:'',plate:'',type:'',name:'',status:''});
  const delParkIn = (id:number) => setParkingIn(d=>d.filter(r=>r.id!==id));
  const updateParkInStatus = (id:number, status:string) =>
    setParkingIn(d=>d.map(r=>r.id===id ? {...r, status} : r));
  const addParkIn = () => {
    if(!newPI.plate.trim()) return;
    setParkingIn(d=>[...d,{id:nextPIId,...newPI}]);
    setNextPIId(n=>n+1); setNewPI({room:'',plate:'',type:'',name:'',status:''}); setShowPIModal(false);
  };

  // ── parking out ──────────────────────────────────────────────────────────
  const [parkingOut, setParkingOut] = useState<ParkingOut[]>([
    {id:1,plate:'ผธ1138',type:'Car',name:'รุ่งโรจน์ อินธินิน',status:'OK'},
    {id:2,plate:'บม1764',type:'Car',name:'',status:'OK'},
    {id:3,plate:'กง8823',type:'Car',name:'',status:'OK'},
    {id:4,plate:'1มฆ299',type:'Taxi',name:'ประจักษ์ แปลนดี',status:''},
    {id:5,plate:'5กช3204',type:'Car',name:'จักรี ธนามี',status:'OK'},
    {id:6,plate:'4ขห3832',type:'Car',name:'',status:'OK'},
    {id:7,plate:'2ขพ6423',type:'',name:'ประคอง ประมวล',status:''},
    {id:8,plate:'3ขฆ7238',type:'Car',name:'จิตภรณ์ สีสัญ',status:'OK'},
    {id:9,plate:'2ขญ3250',type:'Motorcycle',name:'',status:'OK'},
    {id:10,plate:'8กฉ5112',type:'Motorcycle',name:'มยุรี พันธ์วงค์',status:'OK'},
    {id:11,plate:'0934',type:'',name:'',status:''},
    {id:12,plate:'5ขช1137',type:'Car',name:'',status:'OK'},
    {id:13,plate:'5ขศ8450',type:'Car',name:'',status:'OK'},
  ]);
  const [nextPOId, setNextPOId] = useState(14);
  const [showPOModal, setShowPOModal] = useState(false);
  const [newPO, setNewPO] = useState({plate:'',type:'',name:'',status:''});
  const delParkOut = (id:number) => setParkingOut(d=>d.filter(r=>r.id!==id));
  const updateParkOutStatus = (id:number, status:string) =>
    setParkingOut(d=>d.map(r=>r.id===id ? {...r, status} : r));
  const addParkOut = () => {
    if(!newPO.plate.trim()) return;
    setParkingOut(d=>[...d,{id:nextPOId,...newPO}]);
    setNextPOId(n=>n+1); setNewPO({plate:'',type:'',name:'',status:''}); setShowPOModal(false);
  };

  // ── warranty ─────────────────────────────────────────────────────────────
  const [warrantyData, setWarrantyData] = useState<Warranty[]>([
    {id:1,cat:'AIR CONDITIONER',room:'411',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2312C01041437',warranty:'Compressor 5yr / Parts 1yr',installed:'2/2/2567'},
    {id:2,cat:'AIR CONDITIONER',room:'308',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2205C00982898',warranty:'',installed:''},
    {id:3,cat:'AIR CONDITIONER',room:'213',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2206C00966606',warranty:'',installed:''},
    {id:4,cat:'AIR CONDITIONER',room:'107',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2206C00966647',warranty:'',installed:''},
    {id:5,cat:'AIR CONDITIONER',room:'214',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2308C01029304',warranty:'',installed:''},
    {id:6,cat:'AIR CONDITIONER',room:'305',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2310C01032446',warranty:'',installed:''},
    {id:7,cat:'AIR CONDITIONER',room:'303',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2403C01052386',warranty:'',installed:''},
    {id:8,cat:'AIR CONDITIONER',room:'113',brand:'SAIJO DENKI',model:'CE12SUPER32SWG1/SWG',sn:'2307C01011440',warranty:'Compressor 5yr / Parts 2yr',installed:''},
    {id:9,cat:'AIR CONDITIONER',room:'202',brand:'SAIJO DENKI',model:'CS12TURBO32SW1/TURBO APS R32',sn:'2403C01052753',warranty:'',installed:''},
    {id:10,cat:'AIR CONDITIONER',room:'406',brand:'SAIJO DENKI',model:'CS12TURBO32SW1/TURBO APS R32',sn:'2403C01052535',warranty:'',installed:''},
    {id:11,cat:'AIR CONDITIONER',room:'311',brand:'SAIJO DENKI',model:'CE12SUPER32SWG1/SWG',sn:'2402C01048551',warranty:'',installed:''},
    {id:12,cat:'AIR CONDITIONER',room:'302',brand:'SAIJO DENKI',model:'CE12SUPER32SWG1/SWG',sn:'2405C01059300',warranty:'',installed:''},
    {id:13,cat:'AIR CONDITIONER',room:'306',brand:'SAIJO DENKI',model:'CS12TURBO32SW1/TURBO APS R32',sn:'2404C01056445',warranty:'',installed:''},
    {id:14,cat:'AIR CONDITIONER',room:'OFFICE',brand:'SAIJO DENKI',model:'CE12SUPER32SWG1/SWG',sn:'2405C01060536',warranty:'',installed:''},
    {id:15,cat:'AIR CONDITIONER',room:'205',brand:'SAIJO DENKI',model:'CS12TURBO32SW1/TURBO APS R32',sn:'2310C01031829',warranty:'',installed:''},
    {id:16,cat:'AIR CONDITIONER',room:'203',brand:'SAIJO DENKI',model:'CS12TURBO32SW1/TURBO APS R32',sn:'2310C01031847',warranty:'',installed:''},
    {id:17,cat:'AIR CONDITIONER',room:'—',brand:'CARRIER',model:'38ABF010 (Outdoor)',sn:'44XK13A00617',warranty:'Compressor 7yr / Parts 3yr',installed:''},
    {id:18,cat:'AIR CONDITIONER',room:'—',brand:'CARRIER',model:'38ABF010 (Outdoor)',sn:'44AK13A00496',warranty:'',installed:''},
    {id:19,cat:'AIR CONDITIONER',room:'—',brand:'CARRIER',model:'42ABF010 (Indoor)',sn:'44XF14A02197',warranty:'',installed:''},
    {id:20,cat:'AIR CONDITIONER',room:'—',brand:'CARRIER',model:'42ABF010 (Indoor)',sn:'44AF14A02052',warranty:'',installed:''},
    {id:21,cat:'AIR CONDITIONER',room:'OFFICE',brand:'MITSUBISHI',model:'SRC 19 CNS-S',sn:'151904002',warranty:'Compressor 5yr / Parts 3yr',installed:''},
    {id:22,cat:'AIR CONDITIONER',room:'300',brand:'MITSUBISHI',model:'MUY-JP15VF',sn:'8010924T',warranty:'No warranty card found',installed:''},
    {id:23,cat:'AIR CONDITIONER',room:'300',brand:'MITSUBISHI',model:'MUY-GN18VF',sn:'8010649T',warranty:'No warranty card found',installed:''},
    {id:24,cat:'WATER HEATER',room:'113',brand:'RINNAI',model:'ECO350',sn:'22120591',warranty:'',installed:''},
    {id:25,cat:'WATER HEATER',room:'214',brand:'RINNAI',model:'ECO350',sn:'221020559',warranty:'',installed:''},
    {id:26,cat:'WATER HEATER',room:'—',brand:'MEX',model:'COCO 350(SBA)',sn:'22075300941',warranty:'Product 2yr / Copper boiler 5yr',installed:''},
    {id:27,cat:'WATER HEATER',room:'—',brand:'MEX',model:'COCO 350(SBB)',sn:'23085500029',warranty:'',installed:''},
    {id:28,cat:'WATER HEATER',room:'—',brand:'MEX',model:'COCO 350(SBB)',sn:'23085500217',warranty:'',installed:''},
    {id:29,cat:'WATER HEATER',room:'—',brand:'MEX',model:'COCO 350(SBB)',sn:'23085500289',warranty:'',installed:''},
    {id:30,cat:'WATER HEATER',room:'300',brand:'STIEBEL ELTRON',model:'IS35',sn:'ZE1306180148736',warranty:'Boiler 5yr / Electrical parts 2yr',installed:''},
    {id:31,cat:'MICROWAVE',room:'113',brand:'SHARP',model:'R-200W',sn:'211412774',warranty:'Expired 31/02/67',installed:''},
    {id:32,cat:'MICROWAVE',room:'—',brand:'TOSHIBA',model:'L1711205',sn:'547700000FG39121200518',warranty:'1yr warranty',installed:''},
    {id:33,cat:'MICROWAVE',room:'—',brand:'TOSHIBA',model:'L1711205',sn:'547700000FG39121200631',warranty:'',installed:''},
    {id:34,cat:'MICROWAVE',room:'—',brand:'TOSHIBA',model:'MW2-MM24PC(BK)',sn:'725766',warranty:'',installed:''},
    {id:35,cat:'MICROWAVE',room:'MY CONDO',brand:'TOSHIBA',model:'J1005101',sn:'547700000FG34171201658',warranty:'',installed:''},
    {id:36,cat:'MICROWAVE',room:'214',brand:'TOSHIBA',model:'MWP-MM20P(WH)',sn:'1607000061329',warranty:'',installed:''},
    {id:37,cat:'MICROWAVE',room:'205',brand:'TOSHIBA',model:'MWP-MM20P(WH)',sn:'16070000B62843',warranty:'',installed:''},
    {id:38,cat:'TV',room:'108',brand:'TCL',model:'65P615',sn:'2007ALU152755A00170',warranty:'3yr warranty',installed:''},
    {id:39,cat:'TV',room:'113',brand:'WEYON',model:'32F2',sn:'',warranty:'',installed:''},
    {id:40,cat:'TV',room:'205',brand:'BODA',model:'BD3288',sn:'2024011614',warranty:'',installed:''},
    {id:41,cat:'REFRIGERATOR',room:'113',brand:'TOSHIBA',model:'GR-A704CX',sn:'1939712200103',warranty:'',installed:''},
    {id:42,cat:'REFRIGERATOR',room:'214',brand:'Midea',model:'K57050 01 HS-65LN',sn:'3100008G-3626-1120112',warranty:'',installed:''},
    {id:43,cat:'REFRIGERATOR',room:'205',brand:'Midea',model:'K90230 01 HS-65LN',sn:'3100008G-3902-1120368',warranty:'',installed:''},
    {id:44,cat:'PHOTOCOPIER',room:'OFFICE',brand:'CANNON',model:'MF635Cx',sn:'WTY14984',warranty:'3yr warranty',installed:''},
  ]);
  const [nextWId, setNextWId] = useState(45);
  const [wCat, setWCat] = useState<WCat>('AIR CONDITIONER');
  const [showWModal, setShowWModal] = useState(false);
  const [newW, setNewW] = useState<Omit<Warranty,'id'>>({cat:'AIR CONDITIONER',room:'',brand:'',model:'',sn:'',warranty:'',installed:''});
  const delWarranty = (id:number) => setWarrantyData(d=>d.filter(r=>r.id!==id));
  const updateWarrantyRoom = (id:number, room:string) =>
    setWarrantyData(d=>d.map(r=>r.id===id ? {...r, room} : r));
  const addWarranty = () => {
    if(!newW.brand.trim()) return;
    setWarrantyData(d=>[...d,{id:nextWId,...newW}]);
    setNextWId(n=>n+1); setWCat(newW.cat);
    setNewW({cat:'AIR CONDITIONER',room:'',brand:'',model:'',sn:'',warranty:'',installed:''});
    setShowWModal(false);
  };

  // ── equipment (ช่างอาคาร) ───────────────────────────────────────────────
  const [equipmentData, setEquipmentData] = useState<EquipmentItem[]>(
    EQUIPMENT_SEED.map((r, i) => ({ id: i + 1, ...r }))
  );
  const equipmentSnapshotRef = useRef<EquipmentItem[]>(equipmentData);
  const [nextEqId, setNextEqId] = useState(EQUIPMENT_SEED.length + 1);
  const [eqCat, setEqCat] = useState<EquipCat>(EQUIP_CATS[0]);
  const [showEqModal, setShowEqModal] = useState(false);
  const [newEq, setNewEq] = useState<Omit<EquipmentItem,'id'>>({cat:EQUIP_CATS[0],name:'',nameTh:'',nameEn:'',qty:0,unit:'ชิ้น',note:''});
  const [translatingEqName, setTranslatingEqName] = useState(false);
  const changeEqQty = (id:number, delta:number) =>
    setEquipmentData(d => d.map(r => r.id===id ? {...r, qty:Math.max(0,r.qty+delta)} : r));
  const updateEqNote = (id:number, note:string) =>
    setEquipmentData(d => d.map(r => r.id===id ? {...r, note} : r));
  const updateEqName = (id:number, value:string, editLang:'th'|'en') =>
    setEquipmentData(d => d.map(r => {
      if (r.id !== id) return r;
      return editLang==='en' ? {...r, nameEn:value} : {...r, nameTh:value, name:value};
    }));
  const updateEqUnit = (id:number, unit:string) =>
    setEquipmentData(d => d.map(r => r.id===id ? {...r, unit} : r));
  const delEquipment = (id:number) => setEquipmentData(d => d.filter(r=>r.id!==id));
  const addEquipment = () => {
    if(!newEq.name.trim()) return;
    setEquipmentData(d=>[...d,{id:nextEqId,...newEq}]);
    setNextEqId(n=>n+1); setEqCat(newEq.cat);
    setNewEq({cat:newEq.cat,name:'',nameTh:'',nameEn:'',qty:0,unit:'ชิ้น',note:''});
    setShowEqModal(false);
  };


  // ── patrol ─────────────────────────────────────────────────────────────────
  const [patrolUnknowns, setPatrolUnknowns] = useState<PatrolUnknown[]>([]);
  const [patrolSearch,   setPatrolSearch]   = useState('');
  const [patrolSearched, setPatrolSearched] = useState(false);
  const [showPatrolForm, setShowPatrolForm] = useState(false);
  const [pPlate, setPPlate] = useState('');
  const [pSpot,  setPSpot]  = useState('');
  const [pNotes, setPNotes] = useState('');
  const [pPhotos,setPPhotos]= useState<string[]>([]);
  const patrolFileRef = useRef<HTMLInputElement>(null);

  // ── Supabase save/load ────────────────────────────────────────────────────

  // ── patrol helpers ─────────────────────────────────────────────────────────
  function normQ(s: string) { return s.replace(/\s+/g, '').toLowerCase(); }
  function patrolHits() {
    const q = normQ(patrolSearch);
    if (q.length < 2) return [];
    return [
      ...parkingIn.map(r => ({ plate: r.plate, label: `${t('sp_room_prefix')} ${r.room}`, extra: r.name })),
      ...parkingOut.map(r => ({ plate: r.plate, label: t('sp_patrol_outside'), extra: r.name })),
    ].filter(r => normQ(r.plate).includes(q));
  }
  function openPatrolForm(plate = '') {
    setPPlate(plate.toUpperCase()); setPSpot(''); setPNotes(''); setPPhotos([]);
    setShowPatrolForm(true);
  }
  async function handlePatrolFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 4 - pPhotos.length);
    const imgs = await Promise.all(files.map(f => new Promise<string>(res => {
      const reader = new FileReader();
      reader.onload = async ev => res(await compressImg(ev.target!.result as string));
      reader.readAsDataURL(f);
    })));
    setPPhotos(prev => [...prev, ...imgs]);
    e.target.value = '';
  }
  async function savePatrolUnknown() {
    if (!pPlate.trim()) { alert(t('sp_patrol_plate_required')); return; }
    const entry: PatrolUnknown = {
      id: Math.random().toString(36).slice(2, 10),
      plate: pPlate.trim().toUpperCase(),
      timestamp: nowTH(),
      photos: pPhotos,
      notes: pNotes.trim(),
      spotNumber: pSpot.trim(),
    };
    const next = [entry, ...patrolUnknowns];
    setPatrolUnknowns(next);
    setShowPatrolForm(false);
    setPatrolSearch(''); setPatrolSearched(false);
    await sbSave('patrol_unknowns', next);
  }
  async function deletePatrolUnknown(id: string) {
    if (!confirm(t('sp_patrol_delete_confirm'))) return;
    const next = patrolUnknowns.filter(u => u.id !== id);
    setPatrolUnknowns(next);
    await sbSave('patrol_unknowns', next);
  }

  const doSave = useCallback(async (key: string, data: unknown) => {
    setSaving(key); setSaved('');
    await sbSave(key, data);
    setSaving(''); setSaved(key);
    setTimeout(() => setSaved(''), 2500);
  }, []);

  const saveEquipment = useCallback(async () => {
    equipmentSnapshotRef.current = equipmentData;
    await doSave('equipment_data', equipmentData);
  }, [equipmentData, doSave]);

  const saveStock = useCallback(async () => {
    const entries = diffStock(stockSnapshotRef.current, stockData);
    await sbLogStockChanges(entries);
    stockSnapshotRef.current = stockData;
    await doSave('stock_data', stockData);
  }, [stockData, doSave]);

  useEffect(() => {
    sbLoad('stock_data').then(d => {
      if (!d) return;
      // one-time migration: bump old minQty=1 to 2 for these items
      const migrated = (d as StockItem[]).map(r =>
        (r.id === 24 || r.id === 25) && r.minQty === 1 ? { ...r, minQty: 2 } : r
      );
      const fixed = dedupeIds(migrated);
      setStockData(fixed);
      stockSnapshotRef.current = fixed;
      if (fixed.length) setNextSId(Math.max(...fixed.map(r => r.id)) + 1);
      if (JSON.stringify(fixed) !== JSON.stringify(d)) sbSave('stock_data', fixed);
    });
    sbLoad('parking_in').then(d => {
      if (!d) return;
      const fixed = dedupeIds(d as ParkingIn[]);
      setParkingIn(fixed);
      if (fixed.length) setNextPIId(Math.max(...fixed.map(r => r.id)) + 1);
      if (JSON.stringify(fixed) !== JSON.stringify(d)) sbSave('parking_in', fixed);
    });
    sbLoad('parking_out').then(d => {
      if (!d) return;
      const fixed = dedupeIds(d as ParkingOut[]);
      setParkingOut(fixed);
      if (fixed.length) setNextPOId(Math.max(...fixed.map(r => r.id)) + 1);
      if (JSON.stringify(fixed) !== JSON.stringify(d)) sbSave('parking_out', fixed);
    });
    sbLoad('warranty_data').then(d => {
      if (!d) return;
      const fixed = dedupeIds(d as Warranty[]);
      setWarrantyData(fixed);
      if (fixed.length) setNextWId(Math.max(...fixed.map(r => r.id)) + 1);
      if (JSON.stringify(fixed) !== JSON.stringify(d)) sbSave('warranty_data', fixed);
    });
    sbLoad('equipment_data').then(d => {
      if (!d) return;
      const fixed = dedupeIds(d as EquipmentItem[]);
      setEquipmentData(fixed);
      equipmentSnapshotRef.current = fixed;
      if (fixed.length) setNextEqId(Math.max(...fixed.map(r => r.id)) + 1);
      if (JSON.stringify(fixed) !== JSON.stringify(d)) sbSave('equipment_data', fixed);
    });
    sbLoad('patrol_unknowns').then(d => { if (d) setPatrolUnknowns(d); });
  }, []);

  // ── shared styles ─────────────────────────────────────────────────────────
  const sectionNav = (keys: {key:typeof section; label:string; emoji:string}[]) => (
    <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
      {keys.map(k=>(
        <button key={k.key} onClick={()=>setSection(k.key)}
          className="f-thai flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold press"
          style={section===k.key ? { background: T.navy, color: '#fff', border: `1px solid ${T.navy}` } : { background: T.card, color: T.inkSoft, border: `1px solid ${T.hair}` }}>
          {k.emoji} {k.label}
        </button>
      ))}
    </div>
  );

  const inputCls = "focus-ring w-full rounded-xl px-3 py-2 text-sm";
  const inputStyle = { border: `1px solid ${T.hairGold}`, color: T.ink };
  const btnDel   = "press f-thai px-2 py-1 rounded-lg text-xs";
  const btnDelStyle = { border: `1px solid ${T.wine}30`, background: T.wineTint, color: T.wine };
  const btnAdd   = "press f-thai px-4 py-2 rounded-2xl text-sm font-medium";
  const btnAddStyle = { background: T.navy, color: '#fff' };
  const saveBtnStyle = (key: string) =>
    saving===key ? { background: '#E5E7EB', color: '#9CA3AF' }
    : saved===key ? { background: T.sage, color: '#fff' }
    : { background: T.brass, color: T.navyDeep };



  const typeOpts = ['Car','Motorcycle'];

  // ── drag-and-drop reordering ─────────────────────────────────────────────
  const dndSensors = useDndSensors();
  const onStockDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setStockData(arr => {
      const oldIdx = arr.findIndex(r=>r.id===active.id), newIdx = arr.findIndex(r=>r.id===over.id);
      return oldIdx===-1||newIdx===-1 ? arr : arrayMove(arr, oldIdx, newIdx);
    });
  };
  const onParkingInDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setParkingIn(arr => {
      const oldIdx = arr.findIndex(r=>r.id===active.id), newIdx = arr.findIndex(r=>r.id===over.id);
      return oldIdx===-1||newIdx===-1 ? arr : arrayMove(arr, oldIdx, newIdx);
    });
  };
  const onParkingOutDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setParkingOut(arr => {
      const oldIdx = arr.findIndex(r=>r.id===active.id), newIdx = arr.findIndex(r=>r.id===over.id);
      return oldIdx===-1||newIdx===-1 ? arr : arrayMove(arr, oldIdx, newIdx);
    });
  };
  // Warranty rows are only ever dragged among currently-visible same-category
  // rows (SortableContext below is scoped to the filtered list), and same-
  // category rows are stored contiguously, so a plain arrayMove on the full
  // array (using each item's real index) reorders correctly without
  // disturbing other categories.
  const onWarrantyDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setWarrantyData(arr => {
      const oldIdx = arr.findIndex(r=>r.id===active.id), newIdx = arr.findIndex(r=>r.id===over.id);
      return oldIdx===-1||newIdx===-1 ? arr : arrayMove(arr, oldIdx, newIdx);
    });
  };
  // Same reasoning as onWarrantyDragEnd above — equipment rows are dragged
  // within one category at a time (see EQUIP_CATS filter below).
  const onEquipmentDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setEquipmentData(arr => {
      const oldIdx = arr.findIndex(r=>r.id===active.id), newIdx = arr.findIndex(r=>r.id===over.id);
      return oldIdx===-1||newIdx===-1 ? arr : arrayMove(arr, oldIdx, newIdx);
    });
  };

  return (
    <div className="pb-24">
      {group==='stock'
        ? sectionNav([
            {key:'stock',      label:'Stock',        emoji:'📦'},
            {key:'warranty',   label:'Warranty',      emoji:'🛡️'},
            {key:'equipment',  label:t('sp_tab_equipment'), emoji:'🔧'},
          ])
        : sectionNav([
            {key:'parking-in', label:'Car · In',      emoji:'🚗'},
            {key:'parking-out',label:'Car · Out',     emoji:'🅿️'},
            {key:'patrol',     label:t('sp_patrol_tab'),  emoji:'🚨'},
          ])}

      {/* ── STOCK ── */}
      {section==='stock' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="f-display text-base sm:text-lg font-semibold flex items-center gap-2 min-w-0" style={{ color: T.ink }}>
              <span className="truncate">Stock</span>
              <span className="f-thai ml-1 text-xs font-normal px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: T.navyTint, color: T.navy }}>{stockData.length} {t('sp_items_unit')}</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={()=>setShowStockModal(true)} className={btnAdd} style={btnAddStyle}>{t('sp_add_item')}</button>
              <button onClick={saveStock}
                className="f-thai px-3 py-1.5 rounded-xl text-xs font-semibold" style={saveBtnStyle('stock_data')}>
                {saving==='stock_data'?'...' : saved==='stock_data'?t('sp_saved') : t('sp_save')}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl" style={{ border: `1px solid ${T.hair}` }}>
            <table className="w-full text-sm">
              <thead style={{ background: T.bone, borderBottom: `1px solid ${T.hair}` }}>
                <tr>{['#','',t('sp_col_item_name'),t('sp_col_qty'),t('sp_col_min_qty'),t('sp_col_unit'),t('sp_col_note'),''].map((h,hi)=>(
                  <th key={hi} className="f-thai text-left px-3 py-2 text-xs font-medium whitespace-nowrap" style={{ color: T.inkSoft }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onStockDragEnd}>
                  <SortableContext items={stockData.map(r=>r.id)} strategy={verticalListSortingStrategy}>
                    {stockData.map((r,i)=>{
                      const isLow = r.minQty !== undefined && r.qty < r.minQty;
                      return (
                        <SortableRow key={r.id} id={r.id} style={{ borderBottom: `1px solid ${T.hair}`, background: isLow ? T.wineTint : 'transparent' }}>
                          {(handleProps) => (<>
                            <td className="px-3 py-2 text-xs" style={{ color: T.inkSoft }}>{i+1}</td>
                            <td className="px-3 py-2"><DragHandle {...handleProps.attributes} {...handleProps.listeners}/></td>
                            <td className="px-3 py-2 font-medium f-thai" style={{ color: isLow ? T.wine : T.ink }}>
                              {isLow && <span className="mr-1">🔴</span>}
                              <input
                                className="bg-transparent focus-ring rounded-lg px-1.5 py-1 font-medium f-thai"
                                style={{ color: isLow ? T.wine : T.ink, border: '1px solid transparent', minWidth: '80px' }}
                                value={lang==='en' ? (r.nameEn || STOCK_NAME_EN[r.name] || r.name) : (r.nameTh || STOCK_NAME_TH[r.name] || r.name)}
                                onChange={e=>updateStockName(r.id, e.target.value, lang)}
                                onBlur={async e=>{
                                  const val = e.target.value;
                                  if (!val.trim()) return;
                                  const translated = await autoTranslate(val, 'hotel stock/supply item name');
                                  if (!translated) return;
                                  setStockData(d => d.map(row => row.id===r.id
                                    ? (lang==='en' ? {...row, nameTh: translated} : {...row, nameEn: translated})
                                    : row));
                                }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <button onClick={()=>changeQty(r.id,-1)}
                                  className="press w-6 h-6 rounded-lg text-sm flex items-center justify-center" style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>−</button>
                                <span className="f-num min-w-[28px] text-center font-semibold" style={{ color: isLow ? T.wine : T.ink }}>{r.qty}</span>
                                <button onClick={()=>changeQty(r.id,+1)}
                                  className="press w-6 h-6 rounded-lg text-sm flex items-center justify-center" style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>+</button>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs f-num">
                              <div className="flex items-center gap-1">
                                <span style={{ color: T.inkSoft }}>≥</span>
                                {isAdmin ? (
                                  <input
                                    type="number" min={0}
                                    className="w-14 bg-transparent focus-ring rounded-lg px-1.5 py-1 text-xs f-num"
                                    style={{ color: T.inkSoft, border: `1px solid ${T.hairGold}` }}
                                    value={r.minQty ?? ''}
                                    placeholder="—"
                                    onChange={e=>updateStockMinQty(r.id, e.target.value)}
                                  />
                                ) : (
                                  <span style={{ color: T.inkSoft }}>{r.minQty ?? '—'}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 f-thai">
                              <input
                                className="w-full bg-transparent focus-ring rounded-lg px-1.5 py-1 text-sm f-thai"
                                style={{ color: T.inkSoft, border: '1px solid transparent' }}
                                value={lang==='en' ? (STOCK_UNIT_EN[r.unit] || r.unit) : (STOCK_UNIT_TH[r.unit] || r.unit)}
                                onChange={e=>updateStockUnit(r.id, e.target.value)}
                              />
                            </td>
                            <td className="px-3 py-2 text-xs f-thai">
                              <input
                                className="w-full bg-transparent focus-ring rounded-lg px-1.5 py-1 text-xs f-thai"
                                style={{ color: T.inkSoft, border: '1px solid transparent' }}
                                value={lang==='en' ? (STOCK_NOTE_EN[r.note] || r.note) : (STOCK_NOTE_TH[r.note] || r.note)}
                                onChange={e=>updateStockNote(r.id, e.target.value)}
                                placeholder={t('sp_field_note')}
                              />
                            </td>
                            <td className="px-3 py-2"><button onClick={()=>delStock(r.id)} className={btnDel} style={btnDelStyle}>{t('sp_delete')}</button></td>
                          </>)}
                        </SortableRow>
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </tbody>
            </table>
          </div>
          {showStockModal && (
            <Modal title={t('sp_modal_add_item')} onClose={()=>setShowStockModal(false)} onSave={addStock} cancelLabel={t('sp_cancel')} saveLabel={t('sp_save_btn')}>
              <Field label={t('sp_field_item_name')}>
                <input
                  className={inputCls} style={inputStyle}
                  value={newStock.name}
                  onChange={e=>setNewStock(p=>({...p,name:e.target.value}))}
                  onBlur={async e=>{
                    const val = e.target.value;
                    if (!val.trim() || newStock.nameTh || newStock.nameEn) return;
                    setTranslatingStockName(true);
                    const translated = await autoTranslate(val, 'hotel stock/supply item name');
                    setNewStock(p => {
                      if (p.name !== val) return p; // typed further while translating
                      return isThaiText(val)
                        ? { ...p, nameTh: val, nameEn: translated }
                        : { ...p, nameEn: val, nameTh: translated };
                    });
                    setTranslatingStockName(false);
                  }}
                  placeholder={t('sp_placeholder_soap')}
                />
                {translatingStockName && <span style={{fontSize:11,color:T.brass,marginTop:2,display:'block'}}>{t('sp_translating')}</span>}
                {!translatingStockName && (newStock.nameTh || newStock.nameEn) && (
                  <span style={{fontSize:11,color:T.inkSoft,marginTop:2,display:'block'}}>
                    TH: {newStock.nameTh || '—'} · EN: {newStock.nameEn || '—'}
                  </span>
                )}
              </Field>
              <Field label={t('sp_field_qty')}><input className={inputCls} style={inputStyle} type="number" value={newStock.qty} onChange={e=>setNewStock(p=>({...p,qty:+e.target.value}))} /></Field>
              <Field label={t('sp_field_unit')}><input className={inputCls} style={inputStyle} value={newStock.unit} onChange={e=>setNewStock(p=>({...p,unit:e.target.value}))} placeholder={t('sp_placeholder_bottle')}/></Field>
              {isAdmin && (
                <Field label={t('sp_col_min_qty')}><input className={inputCls} style={inputStyle} type="number" min={0} value={newStock.minQty ?? ''} placeholder="—" onChange={e=>setNewStock(p=>({...p, minQty: e.target.value.trim()==='' ? undefined : Math.max(0, Math.floor(+e.target.value))}))} /></Field>
              )}
              <Field label={t('sp_field_note')}><input className={inputCls} style={inputStyle} value={newStock.note} onChange={e=>setNewStock(p=>({...p,note:e.target.value}))} /></Field>
            </Modal>
          )}
        </div>
      )}

      {/* ── EQUIPMENT (ช่างอาคาร) ── */}
      {section==='equipment' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="f-display text-base sm:text-lg font-semibold flex items-center gap-2 min-w-0" style={{ color: T.ink }}>
              <span className="truncate f-thai">{t('sp_tab_equipment')}</span>
              <span className="f-thai ml-1 text-xs font-normal px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: T.sageTint, color: T.sage }}>{equipmentData.length} {t('sp_items_unit')}</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={()=>{ setNewEq(p=>({...p, cat: eqCat})); setShowEqModal(true); }} className={btnAdd} style={btnAddStyle}>{t('sp_add_item')}</button>
              <button onClick={saveEquipment}
                className="f-thai px-3 py-1.5 rounded-xl text-xs font-semibold" style={saveBtnStyle('equipment_data')}>
                {saving==='equipment_data'?'...' : saved==='equipment_data'?t('sp_saved') : t('sp_save')}
              </button>
            </div>
          </div>
          {/* category tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {EQUIP_CATS.map(c=>(
              <button key={c} onClick={()=>setEqCat(c)}
                className="press f-thai px-3 py-1.5 rounded-xl text-xs font-medium"
                style={c===eqCat ? { background: T.brass, color: T.navyDeep, border: `1px solid ${T.brass}` } : { background: T.card, color: T.inkSoft, border: `1px solid ${T.hair}` }}>
                {lang==='en' ? (EQUIP_CAT_EN[c]||c) : c} <span style={{ opacity: 0.7 }}>({equipmentData.filter(r=>r.cat===c).length})</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl" style={{ border: `1px solid ${T.hair}` }}>
            <table className="w-full text-sm">
              <thead style={{ background: T.bone, borderBottom: `1px solid ${T.hair}` }}>
                <tr>{['#','',t('sp_col_item_name'),t('sp_col_qty'),t('sp_col_unit'),t('sp_col_note'),''].map((h,hi)=>(
                  <th key={hi} className="f-thai text-left px-3 py-2 text-xs font-medium whitespace-nowrap" style={{ color: T.inkSoft }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onEquipmentDragEnd}>
                  <SortableContext items={equipmentData.filter(r=>r.cat===eqCat).map(r=>r.id)} strategy={verticalListSortingStrategy}>
                    {equipmentData.filter(r=>r.cat===eqCat).map((r,i)=>(
                      <SortableRow key={r.id} id={r.id} style={{ borderBottom: `1px solid ${T.hair}` }}>
                        {(handleProps) => (<>
                          <td className="px-3 py-2 text-xs" style={{ color: T.inkSoft }}>{i+1}</td>
                          <td className="px-3 py-2"><DragHandle {...handleProps.attributes} {...handleProps.listeners}/></td>
                          <td className="px-3 py-2 font-medium f-thai" style={{ color: T.ink }}>
                            <input
                              className="bg-transparent focus-ring rounded-lg px-1.5 py-1 font-medium f-thai"
                              style={{ color: T.ink, border: '1px solid transparent', minWidth: '80px' }}
                              value={lang==='en' ? (r.nameEn || EQUIP_NAME_EN[r.name] || r.name) : (r.nameTh || EQUIP_NAME_TH[r.name] || r.name)}
                              onChange={e=>updateEqName(r.id, e.target.value, lang)}
                              onBlur={async e=>{
                                const val = e.target.value;
                                if (!val.trim()) return;
                                const translated = await autoTranslate(val, 'hotel maintenance equipment name');
                                if (!translated) return;
                                setEquipmentData(d => d.map(row => row.id===r.id
                                  ? (lang==='en' ? {...row, nameTh: translated} : {...row, nameEn: translated})
                                  : row));
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <button onClick={()=>changeEqQty(r.id,-1)}
                                className="press w-6 h-6 rounded-lg text-sm flex items-center justify-center" style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>−</button>
                              <span className="f-num min-w-[28px] text-center font-semibold" style={{ color: T.ink }}>{r.qty}</span>
                              <button onClick={()=>changeEqQty(r.id,+1)}
                                className="press w-6 h-6 rounded-lg text-sm flex items-center justify-center" style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>+</button>
                            </div>
                          </td>
                          <td className="px-3 py-2 f-thai">
                            <input
                              className="w-full bg-transparent focus-ring rounded-lg px-1.5 py-1 text-sm f-thai"
                              style={{ color: T.inkSoft, border: '1px solid transparent' }}
                              value={lang==='en' ? (STOCK_UNIT_EN[r.unit] || r.unit) : (STOCK_UNIT_TH[r.unit] || r.unit)}
                              onChange={e=>updateEqUnit(r.id, e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs f-thai">
                            <input
                              className="w-full bg-transparent focus-ring rounded-lg px-1.5 py-1 text-xs f-thai"
                              style={{ color: T.inkSoft, border: '1px solid transparent' }}
                              value={r.note}
                              onChange={e=>updateEqNote(r.id, e.target.value)}
                              placeholder={t('sp_field_note')}
                            />
                          </td>
                          <td className="px-3 py-2"><button onClick={()=>delEquipment(r.id)} className={btnDel} style={btnDelStyle}>{t('sp_delete')}</button></td>
                        </>)}
                      </SortableRow>
                    ))}
                  </SortableContext>
                </DndContext>
              </tbody>
            </table>
          </div>
          {showEqModal && (
            <Modal title={t('sp_modal_add_item')} onClose={()=>setShowEqModal(false)} onSave={addEquipment} cancelLabel={t('sp_cancel')} saveLabel={t('sp_save_btn')}>
              <Field label={t('sp_field_category')}>
                <select className={inputCls} style={inputStyle} value={newEq.cat} onChange={e=>setNewEq(p=>({...p,cat:e.target.value as EquipCat}))}>
                  {EQUIP_CATS.map(c=><option key={c} value={c}>{lang==='en' ? (EQUIP_CAT_EN[c]||c) : c}</option>)}
                </select>
              </Field>
              <Field label={t('sp_field_item_name')}>
                <input
                  className={inputCls} style={inputStyle}
                  value={newEq.name}
                  onChange={e=>setNewEq(p=>({...p,name:e.target.value}))}
                  onBlur={async e=>{
                    const val = e.target.value;
                    if (!val.trim() || newEq.nameTh || newEq.nameEn) return;
                    setTranslatingEqName(true);
                    const translated = await autoTranslate(val, 'hotel maintenance equipment name');
                    setNewEq(p => {
                      if (p.name !== val) return p;
                      return isThaiText(val)
                        ? { ...p, nameTh: val, nameEn: translated }
                        : { ...p, nameEn: val, nameTh: translated };
                    });
                    setTranslatingEqName(false);
                  }}
                />
                {translatingEqName && <span style={{fontSize:11,color:T.brass,marginTop:2,display:'block'}}>{t('sp_translating')}</span>}
                {!translatingEqName && (newEq.nameTh || newEq.nameEn) && (
                  <span style={{fontSize:11,color:T.inkSoft,marginTop:2,display:'block'}}>
                    TH: {newEq.nameTh || '—'} · EN: {newEq.nameEn || '—'}
                  </span>
                )}
              </Field>
              <Field label={t('sp_field_qty')}><input className={inputCls} style={inputStyle} type="number" value={newEq.qty} onChange={e=>setNewEq(p=>({...p,qty:+e.target.value}))} /></Field>
              <Field label={t('sp_field_unit')}><input className={inputCls} style={inputStyle} value={newEq.unit} onChange={e=>setNewEq(p=>({...p,unit:e.target.value}))} /></Field>
              <Field label={t('sp_field_note')}><input className={inputCls} style={inputStyle} value={newEq.note} onChange={e=>setNewEq(p=>({...p,note:e.target.value}))} /></Field>
            </Modal>
          )}
        </div>
      )}

      {/* ── PARKING IN ── */}
      {section==='parking-in' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="f-display text-base sm:text-lg font-semibold flex items-center gap-2 min-w-0" style={{ color: T.ink }}>
              <span className="truncate">Car · In-house</span>
              <span className="f-thai ml-1 text-xs font-normal px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: T.sageTint, color: T.sage }}>{parkingIn.length} {t('sp_cars_unit')}</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={()=>setShowPIModal(true)} className={btnAdd} style={btnAddStyle}>{t('sp_add_item')}</button>
              <button onClick={()=>doSave('parking_in', parkingIn)}
                className="f-thai px-3 py-1.5 rounded-xl text-xs font-semibold" style={saveBtnStyle('parking_in')}>
                {saving==='parking_in'?'...' : saved==='parking_in'?t('sp_saved') : t('sp_save')}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl" style={{ border: `1px solid ${T.hair}` }}>
            <table className="w-full text-sm">
              <thead style={{ background: T.bone, borderBottom: `1px solid ${T.hair}` }}>
                <tr>{['#','',t('sp_col_room'),t('sp_col_plate'),t('sp_col_type'),t('sp_col_name'),t('sp_col_status'),''].map((h,hi)=>(
                  <th key={hi} className="f-thai text-left px-3 py-2 text-xs font-medium" style={{ color: T.inkSoft }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onParkingInDragEnd}>
                  <SortableContext items={parkingIn.map(r=>r.id)} strategy={verticalListSortingStrategy}>
                    {parkingIn.map((r,i)=>(
                      <SortableRow key={r.id} id={r.id} style={{ borderBottom: `1px solid ${T.hair}` }}>
                        {(handleProps) => (<>
                          <td className="px-3 py-2 text-xs" style={{ color: T.inkSoft }}>{i+1}</td>
                          <td className="px-3 py-2"><DragHandle {...handleProps.attributes} {...handleProps.listeners}/></td>
                          <td className="px-3 py-2"><span className="f-thai px-2 py-0.5 rounded-lg text-xs font-medium" style={{ background: T.navyTint, color: T.navy }}>{r.room}</span></td>
                          <td className="px-3 py-2 font-semibold f-num" style={{ color: T.ink }}>{r.plate}</td>
                          <td className="px-3 py-2 f-thai" style={{ color: T.inkSoft }}>{r.type||'—'}</td>
                          <td className="px-3 py-2 f-thai" style={{ color: T.inkSoft }}>{r.name||'—'}</td>
                          <td className="px-3 py-2">
                            <select
                              className="f-thai px-2 py-0.5 rounded-full text-xs font-medium focus-ring"
                              style={r.status==='OK' ? { background: T.sageTint, color: T.sage, border: '1px solid transparent' } : { background: 'transparent', color: T.inkSoft, border: `1px solid ${T.hairGold}` }}
                              value={r.status}
                              onChange={e=>updateParkInStatus(r.id, e.target.value)}
                            >
                              <option value="">—</option>
                              <option value="OK">OK</option>
                            </select>
                          </td>
                          <td className="px-3 py-2"><button onClick={()=>delParkIn(r.id)} className={btnDel} style={btnDelStyle}>{t('sp_delete')}</button></td>
                        </>)}
                      </SortableRow>
                    ))}
                  </SortableContext>
                </DndContext>
              </tbody>
            </table>
          </div>
          {showPIModal && (
            <Modal title={t('sp_modal_add_car_in')} onClose={()=>setShowPIModal(false)} onSave={addParkIn} cancelLabel={t('sp_cancel')} saveLabel={t('sp_save_btn')}>
              <Field label={t('sp_field_room_no')}><input className={inputCls} style={inputStyle} value={newPI.room} onChange={e=>setNewPI(p=>({...p,room:e.target.value}))} placeholder="205"/></Field>
              <Field label={t('sp_field_plate')}><input className={inputCls} style={inputStyle} value={newPI.plate} onChange={e=>setNewPI(p=>({...p,plate:e.target.value}))} placeholder="บธ1234"/></Field>
              <Field label={t('sp_field_type')}>
                <select className={inputCls} style={inputStyle} value={newPI.type} onChange={e=>setNewPI(p=>({...p,type:e.target.value}))}>
                  <option value="">—</option>{typeOpts.map(o=><option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label={t('sp_field_contract_name')}><input className={inputCls} style={inputStyle} value={newPI.name} onChange={e=>setNewPI(p=>({...p,name:e.target.value}))} /></Field>
              <Field label={t('sp_field_status')}>
                <select className={inputCls} style={inputStyle} value={newPI.status} onChange={e=>setNewPI(p=>({...p,status:e.target.value}))}>
                  <option value="">—</option><option value="OK">OK</option>
                </select>
              </Field>
            </Modal>
          )}
        </div>
      )}

      {/* ── PARKING OUT ── */}
      {section==='parking-out' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="f-display text-base sm:text-lg font-semibold flex items-center gap-2 min-w-0" style={{ color: T.ink }}>
              <span className="truncate">Car · Outside</span>
              <span className="f-thai ml-1 text-xs font-normal px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: T.navyTint, color: T.navy }}>{parkingOut.length} {t('sp_cars_unit')}</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={()=>setShowPOModal(true)} className={btnAdd} style={btnAddStyle}>{t('sp_add_item')}</button>
              <button onClick={()=>doSave('parking_out', parkingOut)}
                className="f-thai px-3 py-1.5 rounded-xl text-xs font-semibold" style={saveBtnStyle('parking_out')}>
                {saving==='parking_out'?'...' : saved==='parking_out'?t('sp_saved') : t('sp_save')}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl" style={{ border: `1px solid ${T.hair}` }}>
            <table className="w-full text-sm">
              <thead style={{ background: T.bone, borderBottom: `1px solid ${T.hair}` }}>
                <tr>{['#','',t('sp_col_plate'),t('sp_col_type'),t('sp_col_name'),t('sp_col_status'),''].map((h,hi)=>(
                  <th key={hi} className="f-thai text-left px-3 py-2 text-xs font-medium" style={{ color: T.inkSoft }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onParkingOutDragEnd}>
                  <SortableContext items={parkingOut.map(r=>r.id)} strategy={verticalListSortingStrategy}>
                    {parkingOut.map((r,i)=>(
                      <SortableRow key={r.id} id={r.id} style={{ borderBottom: `1px solid ${T.hair}` }}>
                        {(handleProps) => (<>
                          <td className="px-3 py-2 text-xs" style={{ color: T.inkSoft }}>{i+1}</td>
                          <td className="px-3 py-2"><DragHandle {...handleProps.attributes} {...handleProps.listeners}/></td>
                          <td className="px-3 py-2 font-semibold f-num" style={{ color: T.ink }}>{r.plate}</td>
                          <td className="px-3 py-2 f-thai" style={{ color: T.inkSoft }}>{r.type||'—'}</td>
                          <td className="px-3 py-2 f-thai" style={{ color: T.inkSoft }}>{r.name||'—'}</td>
                          <td className="px-3 py-2">
                            <select
                              className="f-thai px-2 py-0.5 rounded-full text-xs font-medium focus-ring"
                              style={r.status==='OK' ? { background: T.sageTint, color: T.sage, border: '1px solid transparent' } : { background: 'transparent', color: T.inkSoft, border: `1px solid ${T.hairGold}` }}
                              value={r.status}
                              onChange={e=>updateParkOutStatus(r.id, e.target.value)}
                            >
                              <option value="">—</option>
                              <option value="OK">OK</option>
                            </select>
                          </td>
                          <td className="px-3 py-2"><button onClick={()=>delParkOut(r.id)} className={btnDel} style={btnDelStyle}>{t('sp_delete')}</button></td>
                        </>)}
                      </SortableRow>
                    ))}
                  </SortableContext>
                </DndContext>
              </tbody>
            </table>
          </div>
          {showPOModal && (
            <Modal title={t('sp_modal_add_car_out')} onClose={()=>setShowPOModal(false)} onSave={addParkOut} cancelLabel={t('sp_cancel')} saveLabel={t('sp_save_btn')}>
              <Field label={t('sp_field_plate')}><input className={inputCls} style={inputStyle} value={newPO.plate} onChange={e=>setNewPO(p=>({...p,plate:e.target.value}))} placeholder="บธ1234"/></Field>
              <Field label={t('sp_field_type')}>
                <select className={inputCls} style={inputStyle} value={newPO.type} onChange={e=>setNewPO(p=>({...p,type:e.target.value}))}>
                  <option value="">—</option>{typeOpts.map(o=><option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label={t('sp_field_contract_name')}><input className={inputCls} style={inputStyle} value={newPO.name} onChange={e=>setNewPO(p=>({...p,name:e.target.value}))} /></Field>
              <Field label={t('sp_field_status')}>
                <select className={inputCls} style={inputStyle} value={newPO.status} onChange={e=>setNewPO(p=>({...p,status:e.target.value}))}>
                  <option value="">—</option><option value="OK">OK</option>
                </select>
              </Field>
            </Modal>
          )}
        </div>
      )}


      {/* ── PATROL ── */}
      {section === 'patrol' && (
        <div className="space-y-4">
          {/* Search box */}
          <div className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
            <label className="f-thai text-xs font-semibold uppercase tracking-wide" style={{ color: T.inkSoft }}>
              {t('sp_patrol_search_label')}
            </label>
            <div className="flex gap-2 mt-2">
              <input
                value={patrolSearch}
                onChange={e => { setPatrolSearch(e.target.value); setPatrolSearched(false); }}
                onKeyDown={e => { if (e.key === 'Enter') setPatrolSearched(true); }}
                placeholder={t('sp_patrol_plate_placeholder')}
                className="focus-ring f-num flex-1 rounded-xl px-3 py-2.5 text-sm"
                style={{ border: `1px solid ${T.hairGold}`, color: T.ink }}
                autoCapitalize="characters"
              />
              <button
                onClick={() => setPatrolSearched(true)}
                disabled={normQ(patrolSearch).length < 2}
                className="press f-thai rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                style={{ background: T.navy, color: '#fff' }}
              >
                {t('sp_patrol_search_btn')}
              </button>
            </div>
            <p className="f-thai text-xs mt-1.5" style={{ color: T.inkSoft }}>{t('sp_patrol_search_hint')}</p>
          </div>

          {/* Search results */}
          {patrolSearched && normQ(patrolSearch).length >= 2 && (() => {
            const hits = patrolHits();
            if (hits.length > 0) return (
              <div className="space-y-2">
                <p className="f-thai text-xs font-semibold uppercase tracking-wide" style={{ color: T.inkSoft }}>
                  {t('sp_patrol_found_count')} {hits.length}
                </p>
                {hits.map((h, i) => (
                  <div key={i} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: T.card, border: `1px solid ${T.sage}40` }}>
                    <span className="text-2xl">✅</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="f-num font-bold text-sm" style={{ color: T.ink }}>{h.plate}</span>
                        <span className="f-thai text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: T.sageTint, color: T.sage, border: `1px solid ${T.sage}30` }}>
                          {t('sp_patrol_found_badge')}
                        </span>
                      </div>
                      <div className="f-thai text-xs mt-0.5" style={{ color: T.inkSoft }}>{h.label}{h.extra ? ` · ${h.extra}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
            return (
              <div className="rounded-2xl p-4 text-center space-y-3" style={{ background: T.wineTint, border: `1px solid ${T.wine}30` }}>
                <div className="text-3xl">🚨</div>
                <div>
                  <p className="f-thai font-semibold" style={{ color: T.wine }}>{t('sp_patrol_not_found_title')}</p>
                  <p className="f-thai text-sm mt-0.5" style={{ color: T.wine, opacity: 0.85 }}>
                    <span className="f-num font-bold">{patrolSearch.toUpperCase()}</span>
                    {' '}{t('sp_patrol_not_found_desc')}
                  </p>
                </div>
                <button
                  onClick={() => openPatrolForm(patrolSearch)}
                  className="press f-thai w-full rounded-xl py-3 text-sm font-semibold"
                  style={{ background: T.wine, color: '#fff' }}
                >
                  📋 {t('sp_patrol_add_unknown_btn')}
                </button>
              </div>
            );
          })()}

          {/* Direct log button */}
          <button
            onClick={() => openPatrolForm()}
            className="press f-thai w-full rounded-2xl py-3 text-sm font-medium"
            style={{ background: T.card, border: `2px dashed ${T.hair}`, color: T.inkSoft }}
          >
            ➕ {t('sp_patrol_add_direct_btn')}
          </button>

          {/* Unknown vehicles log */}
          <div>
            <p className="f-thai text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: T.inkSoft }}>
              🚨 {t('sp_patrol_unknown_log_title')} ({patrolUnknowns.length})
            </p>
            {patrolUnknowns.length === 0 ? (
              <div className="rounded-2xl p-8 text-center" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
                <div className="text-4xl mb-2">✅</div>
                <p className="f-thai font-medium" style={{ color: T.ink }}>{t('sp_patrol_no_unknown')}</p>
                <p className="f-thai text-sm mt-1" style={{ color: T.inkSoft }}>{t('sp_patrol_no_unknown_desc')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {patrolUnknowns.map(u => (
                  <PatrolCard key={u.id} u={u} onDelete={deletePatrolUnknown} t={t} />
                ))}
              </div>
            )}
          </div>

          {/* Reference: all registered plates */}
          <div>
            <p className="f-thai text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: T.inkSoft }}>
              {t('sp_patrol_registered_list')} ({parkingIn.length + parkingOut.length})
            </p>
            <div className="space-y-1.5">
              {parkingIn.map(r => (
                <div key={r.id} className="rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
                  <span className="text-sm">🚗</span>
                  <span className="f-num text-xs font-bold flex-1 truncate" style={{ color: T.navy }}>{r.plate}</span>
                  <span className="f-thai text-xs shrink-0" style={{ color: T.inkSoft }}>{t('sp_room_prefix')} {r.room}</span>
                  <span className="f-thai text-xs px-1.5 py-0.5 rounded shrink-0" style={{ color: T.inkSoft, background: T.navyTint }}>{t('sp_patrol_in_building')}</span>
                </div>
              ))}
              {parkingOut.map(r => (
                <div key={r.id} className="rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
                  <span className="text-sm">🚗</span>
                  <span className="f-num text-xs font-bold flex-1 truncate" style={{ color: T.brassDeep }}>{r.plate}</span>
                  {r.name && <span className="f-thai text-xs truncate shrink-0 max-w-[80px]" style={{ color: T.inkSoft }}>{r.name}</span>}
                  <span className="f-thai text-xs px-1.5 py-0.5 rounded shrink-0" style={{ color: T.inkSoft, background: T.brassPale }}>{t('sp_patrol_outside')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── WARRANTY ── */}
      {section==='warranty' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="f-display text-base sm:text-lg font-semibold flex items-center gap-2 min-w-0" style={{ color: T.ink }}>
              <span className="truncate">Warranty</span>
              <span className="f-thai ml-1 text-xs font-normal px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: T.brassPale, color: T.brassDeep }}>{warrantyData.length} {t('sp_items_unit')}</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={()=>setShowWModal(true)} className={btnAdd} style={btnAddStyle}>{t('sp_add_item')}</button>
              <button onClick={()=>doSave('warranty_data', warrantyData)}
                className="f-thai px-3 py-1.5 rounded-xl text-xs font-semibold" style={saveBtnStyle('warranty_data')}>
                {saving==='warranty_data'?'...' : saved==='warranty_data'?t('sp_saved') : t('sp_save')}
              </button>
            </div>
          </div>
          {/* category tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {W_CATS.map(c=>(
              <button key={c} onClick={()=>setWCat(c)}
                className="press f-thai px-3 py-1.5 rounded-xl text-xs font-medium"
                style={c===wCat ? { background: T.brass, color: T.navyDeep, border: `1px solid ${T.brass}` } : { background: T.card, color: T.inkSoft, border: `1px solid ${T.hair}` }}>
                {c} <span style={{ opacity: 0.7 }}>({warrantyData.filter(r=>r.cat===c).length})</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl" style={{ border: `1px solid ${T.hair}` }}>
            <table className="w-full text-sm">
              <thead style={{ background: T.bone, borderBottom: `1px solid ${T.hair}` }}>
                <tr>{['#','',t('sp_col_room'),t('sp_col_brand'),t('sp_col_model'),'Serial No.',t('sp_col_warranty'),t('sp_col_installed'),''].map((h,hi)=>(
                  <th key={hi} className="f-thai text-left px-3 py-2 text-xs font-medium whitespace-nowrap" style={{ color: T.inkSoft }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onWarrantyDragEnd}>
                  <SortableContext items={warrantyData.filter(r=>r.cat===wCat).map(r=>r.id)} strategy={verticalListSortingStrategy}>
                    {warrantyData.filter(r=>r.cat===wCat).map((r,i)=>(
                      <SortableRow key={r.id} id={r.id} style={{ borderBottom: `1px solid ${T.hair}` }}>
                        {(handleProps) => (<>
                          <td className="px-3 py-2 text-xs" style={{ color: T.inkSoft }}>{i+1}</td>
                          <td className="px-3 py-2"><DragHandle {...handleProps.attributes} {...handleProps.listeners}/></td>
                          <td className="px-3 py-2">
                            <input
                              className="f-thai px-2 py-0.5 rounded-lg text-xs font-medium bg-transparent focus-ring text-center"
                              style={{ background: T.navyTint, color: T.navy, border: '1px solid transparent', width: '64px' }}
                              value={r.room}
                              onChange={e=>updateWarrantyRoom(r.id, e.target.value)}
                              placeholder={t('sp_placeholder_room')}
                            />
                          </td>
                          <td className="px-3 py-2 font-semibold f-thai" style={{ color: T.ink }}>{r.brand}</td>
                          <td className="px-3 py-2 text-xs f-thai" style={{ color: T.inkSoft }}>{r.model}</td>
                          <td className="px-3 py-2 f-num text-xs" style={{ color: T.inkSoft }}>{r.sn||'—'}</td>
                          <td className="px-3 py-2 text-xs max-w-[180px] f-thai" style={{ color: T.inkSoft }}>{r.warranty||'—'}</td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap f-num" style={{ color: T.inkSoft }}>{r.installed||'—'}</td>
                          <td className="px-3 py-2"><button onClick={()=>delWarranty(r.id)} className={btnDel} style={btnDelStyle}>{t('sp_delete')}</button></td>
                        </>)}
                      </SortableRow>
                    ))}
                  </SortableContext>
                </DndContext>
              </tbody>
            </table>
          </div>
          {showWModal && (
            <Modal title={t('sp_modal_add_warranty')} onClose={()=>setShowWModal(false)} onSave={addWarranty} cancelLabel={t('sp_cancel')} saveLabel={t('sp_save_btn')}>
              <Field label={t('sp_field_category')}>
                <select className={inputCls} style={inputStyle} value={newW.cat} onChange={e=>setNewW(p=>({...p,cat:e.target.value as WCat}))}>
                  {W_CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={t('sp_field_room')}><input className={inputCls} style={inputStyle} value={newW.room} onChange={e=>setNewW(p=>({...p,room:e.target.value}))} placeholder={t('sp_placeholder_room')}/></Field>
              <Field label={t('sp_field_brand')}><input className={inputCls} style={inputStyle} value={newW.brand} onChange={e=>setNewW(p=>({...p,brand:e.target.value}))} /></Field>
              <Field label={t('sp_field_model')}><input className={inputCls} style={inputStyle} value={newW.model} onChange={e=>setNewW(p=>({...p,model:e.target.value}))} /></Field>
              <Field label="Serial No."><input className={inputCls} style={inputStyle} value={newW.sn} onChange={e=>setNewW(p=>({...p,sn:e.target.value}))} /></Field>
              <Field label={t('sp_field_warranty')}><input className={inputCls} style={inputStyle} value={newW.warranty} onChange={e=>setNewW(p=>({...p,warranty:e.target.value}))} placeholder={t('sp_placeholder_warranty')}/></Field>
              <Field label={t('sp_field_install_date')}><input className={inputCls} style={inputStyle} type="date" onChange={e=>setNewW(p=>({...p,installed:e.target.value}))} /></Field>
            </Modal>
          )}
        </div>
      )}

      {/* ── PATROL FORM MODAL ── */}
      {showPatrolForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
          <div className="f-thai w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ background: T.card, boxShadow: '0 20px 50px rgba(11,30,66,0.4)' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: T.wine, color: '#fff' }}>
              <span className="font-semibold">🚨 {t('sp_patrol_form_title')}</span>
              <button onClick={() => setShowPatrolForm(false)} className="press text-xl leading-none" style={{ color: 'rgba(255,255,255,0.85)' }}>✕</button>
            </div>
            <div className="p-4 space-y-3 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: T.inkSoft }}>{t('sp_patrol_timestamp_label')}</label>
                <div className="f-num mt-1 rounded-lg px-3 py-2 text-sm" style={{ background: T.bone, color: T.ink }}>{nowTH()}</div>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: T.inkSoft }}>{t('sp_patrol_plate_label')} *</label>
                <input value={pPlate} onChange={e => setPPlate(e.target.value.toUpperCase())}
                  placeholder="กข 1234 / BT 5678"
                  className="focus-ring f-num mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: T.inkSoft }}>{t('sp_patrol_spot_label')}</label>
                <input value={pSpot} onChange={e => setPSpot(e.target.value)}
                  placeholder={t('sp_patrol_spot_placeholder')}
                  className="focus-ring mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: T.inkSoft }}>{t('sp_patrol_photos_label')} (max 4)</label>
                {pPhotos.length < 4 && (
                  <button onClick={() => patrolFileRef.current?.click()}
                    className="press mt-1 w-full rounded-xl py-4 text-sm flex flex-col items-center gap-1"
                    style={{ border: `2px dashed ${T.hair}`, color: T.inkSoft }}>
                    <span className="text-2xl">📷</span>
                    <span>{t('sp_patrol_photo_btn')}</span>
                  </button>
                )}
                <input ref={patrolFileRef} type="file" accept="image/*" multiple capture="environment"
                  onChange={handlePatrolFiles} className="hidden" />
                {pPhotos.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {pPhotos.map((p, i) => (
                      <div key={i} className="relative">
                        <img src={p} alt="" className="h-20 w-20 object-cover rounded-lg" style={{ border: `1px solid ${T.hair}` }} />
                        <button onClick={() => setPPhotos(prev => prev.filter((_, j) => j !== i))}
                          className="press absolute -top-1.5 -right-1.5 rounded-full w-5 h-5 text-xs flex items-center justify-center leading-none" style={{ background: T.wine, color: '#fff' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: T.inkSoft }}>{t('sp_patrol_notes_label')}</label>
                <textarea value={pNotes} onChange={e => setPNotes(e.target.value)}
                  placeholder={t('sp_patrol_notes_placeholder')} rows={2}
                  className="focus-ring mt-1 w-full rounded-lg px-3 py-2 text-sm resize-none" style={{ border: `1px solid ${T.hairGold}`, color: T.ink }} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowPatrolForm(false)}
                  className="press flex-1 rounded-xl py-3 text-sm font-medium" style={{ border: `1px solid ${T.hairGold}`, color: T.inkSoft }}>
                  {t('sp_cancel')}
                </button>
                <button onClick={savePatrolUnknown}
                  className="press flex-1 rounded-xl py-3 text-sm font-semibold" style={{ background: T.wine, color: '#fff' }}>
                  🚨 {t('sp_patrol_save_btn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
