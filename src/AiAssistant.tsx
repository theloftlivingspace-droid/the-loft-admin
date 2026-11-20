import { useState } from 'react';
import { T } from './theme';
import { useLang } from './LanguageContext';
import AiReplyDrafter from './AiReplyDrafter';
import AiRateReasons from './AiRateReasons';

// แท็บ "ผู้ช่วย AI": รวมฟีเจอร์ AI-PMS ไว้ที่เดียว (ร่างคำตอบแขก: แอดมิน+ฟรอนต์เดสก์ · เหตุผลราคา: แอดมินเท่านั้น)
export default function AiAssistant({ isAdmin }: { isAdmin: boolean }) {
  const { lang } = useLang();
  const L = (th: string, en: string) => (lang === 'th' ? th : en);
  const [sub, setSub] = useState<'reply' | 'rates'>('reply');
  const items: { key: 'reply' | 'rates'; label: string }[] = [{ key: 'reply', label: L('ตอบแขก', 'Guest reply') }, ...(isAdmin ? [{ key: 'rates' as const, label: L('เหตุผลราคา', 'Rate reasons') }] : [])];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.length > 1 && (
        <div className="flex gap-2" role="tablist">
          {items.map((i) => (
            <button key={i.key} role="tab" aria-selected={sub === i.key} onClick={() => setSub(i.key)} className="press focus-ring"
              style={{ minHeight: 40, padding: '0 16px', borderRadius: 99, fontWeight: 700, border: `1px solid ${sub === i.key ? T.navy : T.hair}`, background: sub === i.key ? T.navy : '#fff', color: sub === i.key ? '#fff' : T.ink }}>
              {i.label}
            </button>
          ))}
        </div>
      )}
      {sub === 'rates' && isAdmin ? <AiRateReasons /> : <AiReplyDrafter />}
    </div>
  );
}
