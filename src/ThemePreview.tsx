import { T, pastelT, fontImports } from './theme';

type Tokens = Record<keyof typeof T, string>;

function Panel({ tokens, label }: { tokens: Tokens; label: string }) {
  const c = tokens;
  return (
    <div
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${c.hair}`,
        boxShadow: '0 4px 20px rgba(11,30,66,0.08)',
      }}
    >
      <div
        style={{
          background: c.ink,
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
              background: c.brass,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 600,
              color: c.ink,
            }}
          >
            L
          </div>
          <span style={{ color: c.brass, fontSize: 14, fontWeight: 600 }} className="f-thai">
            The Loft
          </span>
        </div>
        <span style={{ color: c.brass, fontSize: 12 }}>●</span>
      </div>

      <div
        style={{
          background: c.navy,
          padding: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        <div style={{ background: 'rgba(217,178,92,0.14)', borderRadius: 10, padding: '10px 12px' }}>
          <p style={{ fontSize: 12, color: c.brass, margin: '0 0 4px' }} className="f-thai">
            เช็คอินวันนี้
          </p>
          <p style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }} className="f-num">
            5
          </p>
        </div>
        <div style={{ background: 'rgba(217,178,92,0.14)', borderRadius: 10, padding: '10px 12px' }}>
          <p style={{ fontSize: 12, color: c.brass, margin: '0 0 4px' }} className="f-thai">
            อัตราเข้าพัก
          </p>
          <p style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }} className="f-num">
            82%
          </p>
        </div>
      </div>

      <div style={{ background: c.navy, padding: '0 16px 16px', display: 'grid', gap: 6 }}>
        <div
          style={{
            background: c.navyDeep,
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 13, color: '#fff' }} className="f-thai">
            ห้อง 300 · Luxury
          </span>
          <span
            style={{
              fontSize: 11,
              color: c.ink,
              background: c.brass,
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
            background: c.navyDeep,
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 13, color: '#fff' }} className="f-thai">
            ห้อง 108 · Retro
          </span>
          <span
            style={{
              fontSize: 11,
              color: c.brass,
              background: 'rgba(217,178,92,0.16)',
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
          background: c.navy,
          borderTop: `1px solid ${c.hairGold}`,
        }}
      >
        <p style={{ fontSize: 11, color: c.brass, textAlign: 'center', margin: 0 }} className="f-thai">
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
          น้ำเงินเดิม vs น้ำเงิน pastel
        </h1>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
          }}
        >
          <Panel tokens={T} label="เดิม · navy #142E67" />
          <Panel tokens={pastelT} label="pastel · navy #4A6FA0" />
        </div>
        <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 20 }} className="f-thai">
          ธีมเดิมทุกอย่างเหมือนกัน (header, brass accent, การจัดวาง) ต่างกันแค่เฉดน้ำเงิน — หน้านี้เป็น
          preview เท่านั้น ไม่กระทบ dashboard จริง เข้าดูได้ที่ #theme-preview
        </p>
      </div>
    </div>
  );
}
