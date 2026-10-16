// จำนวนแขกต่อ booking — มาจาก Sheet1 (คอลัมน์ Adults / Children / Guests) ผ่าน GAS
// null/undefined ทั้งหมด = ไม่มีข้อมูล (แสดง "ไม่ระบุ" ไม่เดาเป็น 1)
export type GuestFields = {
  adults?: number | null;
  children?: number | null;
  guests?: number | null;
};

export function guestTotal(g: GuestFields): number {
  if (g.guests && g.guests > 0) return g.guests;
  return (g.adults ?? 0) + (g.children ?? 0);
}

type TFn = (key: string) => string;

// เต็ม:   "3 ท่าน (ผู้ใหญ่ 2 / เด็ก 1)"  |  "3 guests (2 adults / 1 child)"
// ย่อ:    "3 (2+1)"  — ใช้บนการ์ดที่พื้นที่แคบ
export function formatGuests(g: GuestFields, t: TFn, compact = false): string {
  const total = guestTotal(g);
  if (!total) return compact ? '?' : t('guests_unknown');
  const a = g.adults ?? 0;
  const c = g.children ?? 0;
  if (compact) return c > 0 && a > 0 ? `${total} (${a}+${c})` : String(total);
  const unit = total === 1 && t('guests_unit_one') ? t('guests_unit_one') : t('guests_unit');
  if (c > 0 && a > 0) {
    const aw = a === 1 ? t('guests_adult_one') : t('guests_adults');
    const cw = c === 1 ? t('guests_child_one') : t('guests_children');
    return `${total} ${unit} (${aw} ${a} / ${cw} ${c})`;
  }
  if (c > 0) return `${total} ${unit} (${c === 1 ? t('guests_child_one') : t('guests_children')} ${c})`;
  return `${total} ${unit}`;
}
