import { T, surface, fontImports } from './theme';

function Panel({ variant, label }: { variant: 'positive' | 'negative'; label: string }) {
  const s = surface[variant];
  return (
    <div
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${T.hair}`,
        boxShadow: '0 4px 20px rgba(11,30,66,0.08)',
      }}
    >
      <div
        style={{
          background: s.bgHeader,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: s.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 600,
              color: s.bgHeader,
            }}
          >
            L
          </div>
          <span style={{ color: s.accent, fontSize: 14, fontWeight: 600 }} className="f-thai">
            The Loft
          </span>
        </div>
        <span style={{ color: s.accent, fontSize: 12 }}>●</span>
      </div>

      <div
        style={{
          background: s.bg,
          padding: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        <div style={{ background: s.accentSubtle, borderRadius: 10, padding: '10px 12px' }}>
          <p style={{ fontSize: 12, color: s.textAccent, margin: '0 0 4px' }} className="f-thai">
            เช็คอินวันนี้
          </p>
          <p style={{ fontSize: 22, fontWeight: 600, color: s.text, margin: 0 }} className="f-num">
            5
          </p>
        </div>
        <div style={{ background: s.accentSubtle, borderRadius: 10, padding: '10px 12px' }}>
          <p style={{ fontSize: 12, color: s.textAccent, margin: '0 0 4px' }} className="f-thai">
            อัตราเข้าพัก
          </p>
          <p style={{ fontSize: 22, fontWeight: 600, color: s.text, margin: 0 }} className="f-num">
            82%
          </p>
        </div>
      </div>

      <div style={{ background: s.bg, padding: '0 16px 16px', display: 'grid', gap: 6 }}>
        <div
          style={{
            background: s.bgCard,
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 13, color: s.text }} className="f-thai">
            ห้อง 300 · Luxury
          </span>
          <span
            style={{
              fontSize: 11,
              color: s.bgHeader,
              background: s.accent,
              padding: '2px 9px',
              borderRadius: 6,
              fontWeight: 600,
            }}
            className="f-thai"
          >
            พร้อม
          </span>
        </div>
        <div
          style={{
            background: s.bgCard,
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 13, color: s.text }} className="f-thai">
            ห้อง 108 · Retro
          </span>
          <span
            style={{
              fontSize: 11,
              color: s.textAccent,
              background: s.accentSubtle,
              padding: '2px 9px',
              borderRadius: 6,
              fontWeight: 600,
            }}
            className="f-thai"
          >
            ทำความสะอาด
          </span>
        </div>
      </div>

      <div
        style={{
          padding: '8px 16px',
          background: s.bg,
          borderTop: `1px solid ${T.hairGold}`,
        }}
      >
        <p style={{ fontSize: 11, color: s.textAccent, textAlign: 'center', margin: 0 }} className="f-thai">
          {label}
        </p>
      </div>
    </div>
  );
}

export default function ThemePreview() {
  return (
    <div style={{ minHeight: '100vh', background: T.paper, padding: '32px 20px' }}>
      <style>{fontImports}</style>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <p className="eyebrow f-thai" style={{ fontSize: 12, color: T.inkSoft, marginBottom: 4 }}>
          theme preview
        </p>
        <h1 className="f-display" style={{ fontSize: 26, color: T.ink, margin: '0 0 24px' }}>
          น้ำเงิน / ทอง — positive vs negative
        </h1>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
          }}
        >
          <Panel variant="positive" label="positive · น้ำเงินเป็นพื้น ทองเป็นตัวเน้น" />
          <Panel variant="negative" label="negative · ทองเป็นพื้น น้ำเงินเป็นตัวเน้น" />
        </div>
        <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 20 }} className="f-thai">
          หน้านี้เป็น preview เท่านั้น ไม่กระทบ dashboard จริง — เข้าดูได้ที่ #theme-preview
        </p>
      </div>
    </div>
  );
}
