import { useLang } from './LanguageContext';
import { formatGuests, guestEmoji, guestTotal, type GuestFields } from './guests';

// ป้ายจำนวนแขกสำหรับการ์ด (ไม่มีข้อมูล = "❓ ?" พร้อม tooltip "ไม่ระบุ")
export function GuestBadge({ g, compact = true, className = '' }: { g: GuestFields; compact?: boolean; className?: string }) {
  const { t } = useLang();
  const known = guestTotal(g) > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 flex-shrink-0 whitespace-nowrap ${className}`}
      title={`${t('guests_label')}: ${formatGuests(g, t)}`}
      style={known ? undefined : { opacity: 0.55 }}
    >
      <span aria-hidden>{guestEmoji(g)}</span>
      <span>{formatGuests(g, t, compact)}</span>
    </span>
  );
}
