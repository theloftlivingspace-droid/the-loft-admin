// DailyPricing.tsx — Room-type card grid with tab bar, OTA badges, occupancy bar
import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
type DayTab = 'weekday' | 'friday' | 'weekend' | 'peak';

interface RoomConfig {
  id: string;
  color: string;            // border / accent color
  border: string;           // Tailwind border color class
  airbnbAvgApr: number;     // Airbnb เม.ย. avg for comparison
  closeArrival?: boolean;
  occ: number;              // occupancy %
  prices: {
    weekday:  OTAPrices & GuestPrices;
    friday:   OTAPrices & GuestPrices;
    weekend:  OTAPrices & GuestPrices;
    peak:     OTAPrices & GuestPrices;
  };
}

interface OTAPrices {
  airbnb:   number;
  booking:  number;
  expedia:  number;
}

interface GuestPrices {
  g2: number;
  g3: number | null;
  g4: number | null;
}

// ── Room Config Data ──────────────────────────────────────────────────────────
const ROOMS: RoomConfig[] = [
  {
    id: 'Luxury',
    color: '#6B4FBB',
    border: 'border-purple-300',
    airbnbAvgApr: 557,
    occ: 0,
    prices: {
      weekday: { airbnb: 350, booking: 400, expedia: 500, g2: 400, g3: 550, g4: 650 },
      friday:  { airbnb: 400, booking: 450, expedia: 550, g2: 450, g3: 600, g4: 700 },
      weekend: { airbnb: 500, booking: 550, expedia: 650, g2: 550, g3: 700, g4: 800 },
      peak:    { airbnb: 700, booking: 750, expedia: 850, g2: 750, g3: 900, g4: 1000 },
    },
  },
  {
    id: 'Retro',
    color: '#C87C1A',
    border: 'border-amber-400',
    airbnbAvgApr: 667,
    occ: 43,
    prices: {
      weekday: { airbnb: 650, booking: 700, expedia: 850, g2: 700, g3: 900,  g4: 1100 },
      friday:  { airbnb: 700, booking: 750, expedia: 900, g2: 750, g3: 950,  g4: 1150 },
      weekend: { airbnb: 800, booking: 850, expedia: 1000, g2: 850, g3: 1050, g4: 1250 },
      peak:    { airbnb: 900, booking: 950, expedia: 1100, g2: 950, g3: 1150, g4: 1350 },
    },
  },
  {
    id: 'Allure',
    color: '#2B62B8',
    border: 'border-blue-400',
    airbnbAvgApr: 677,
    occ: 86,
    closeArrival: true,
    prices: {
      weekday: { airbnb: 700, booking: 800, expedia: 950,  g2: 800,  g3: 1050, g4: null },
      friday:  { airbnb: 750, booking: 850, expedia: 1000, g2: 850,  g3: 1100, g4: null },
      weekend: { airbnb: 850, booking: 950, expedia: 1100, g2: 950,  g3: 1200, g4: null },
      peak:    { airbnb: 950, booking: 1050, expedia: 1200, g2: 1050, g3: 1300, g4: null },
    },
  },
  {
    id: 'Elegance',
    color: '#2E8B57',
    border: 'border-green-400',
    airbnbAvgApr: 637,
    occ: 57,
    prices: {
      weekday: { airbnb: 700, booking: 750, expedia: 900,  g2: 750,  g3: 1000, g4: null },
      friday:  { airbnb: 750, booking: 800, expedia: 950,  g2: 800,  g3: 1050, g4: null },
      weekend: { airbnb: 850, booking: 900, expedia: 1050, g2: 900,  g3: 1150, g4: null },
      peak:    { airbnb: 950, booking: 1000, expedia: 1150, g2: 1000, g3: 1250, g4: null },
    },
  },
  {
    id: 'Legacy',
    color: '#7B5CB8',
    border: 'border-violet-400',
    airbnbAvgApr: 703,
    occ: 50,
    prices: {
      weekday: { airbnb: 650, booking: 700, expedia: 850, g2: 700, g3: 900, g4: null },
      friday:  { airbnb: 700, booking: 750, expedia: 900, g2: 750, g3: 950, g4: null },
      weekend: { airbnb: 800, booking: 850, expedia: 1000, g2: 850, g3: 1050, g4: null },
      peak:    { airbnb: 900, booking: 950, expedia: 1100, g2: 950, g3: 1150, g4: null },
    },
  },
  {
    id: 'Radiance',
    color: '#B94040',
    border: 'border-red-400',
    airbnbAvgApr: 850,
    occ: 64,
    prices: {
      weekday: { airbnb: 600, booking: 650, expedia: 800, g2: 650, g3: 850, g4: null },
      friday:  { airbnb: 650, booking: 700, expedia: 850, g2: 700, g3: 900, g4: null },
      weekend: { airbnb: 750, booking: 800, expedia: 950, g2: 800, g3: 1000, g4: null },
      peak:    { airbnb: 850, booking: 900, expedia: 1050, g2: 900, g3: 1100, g4: null },
    },
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────
function OccBar({ occ, color }: { occ: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${occ}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{occ}%</span>
    </div>
  );
}

function OTABadge({ label, price, color }: { label: string; price: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] font-bold tracking-wide" style={{ color }}>{label}</span>
      <span className="text-sm font-bold text-gray-800">฿{price.toLocaleString()}</span>
    </div>
  );
}

function PriceCell({ label, price }: { label: string; price: number | null }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] text-gray-400">{label}</span>
      <span className="text-xs font-semibold text-gray-700">
        {price !== null ? `฿${price.toLocaleString()}` : '—'}
      </span>
    </div>
  );
}

function BadgeDiscount({ pct, increase }: { pct: number; increase?: boolean }) {
  if (increase) {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-red-300 text-red-600 bg-red-50">
        เพิ่ม {pct}%
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-green-300 text-green-700 bg-green-50">
      ลดราคา {pct}%
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DailyPricing() {
  const [tab, setTab] = useState<DayTab>('weekday');

  const tabs: { key: DayTab; label: string }[] = [
    { key: 'weekday', label: 'จ–พฤ' },
    { key: 'friday',  label: 'ศุกร์' },
    { key: 'weekend', label: 'เสาร์–อาทิตย์' },
    { key: 'peak',    label: 'Peak day' },
  ];

  // compute discount % vs Airbnb Apr avg
  function discountPct(room: RoomConfig): { pct: number; increase: boolean } {
    const airbnbPrice = room.prices[tab].airbnb;
    const diff = airbnbPrice - room.airbnbAvgApr;
    const pct  = Math.abs(Math.round((diff / room.airbnbAvgApr) * 100));
    return { pct, increase: diff > 0 };
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-gray-900">💰 Daily Pricing</h2>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Room Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {ROOMS.map(room => {
          const p = room.prices[tab];
          const { pct, increase } = discountPct(room);
          const airbnbDiff = p.airbnb - room.airbnbAvgApr;

          return (
            <div
              key={room.id}
              className={`rounded-2xl border-2 ${room.border} bg-white p-4 flex flex-col gap-2`}
            >
              {/* Room name + badge */}
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm" style={{ color: room.color }}>
                  {room.id}
                </span>
                <BadgeDiscount pct={pct} increase={increase} />
              </div>

              {/* Occupancy bar */}
              <OccBar occ={room.occ} color={room.color} />

              {/* Recommended price */}
              <div className="text-center">
                <div className="text-[10px] text-gray-400">ราคาแนะนำ (2 คน)</div>
                <div className="text-3xl font-bold text-gray-900">฿{p.g2.toLocaleString()}</div>
                <div className={`text-xs mt-0.5 ${airbnbDiff >= 0 ? 'text-orange-500' : 'text-orange-500'}`}>
                  Airbnb เม.ย. ฿{room.airbnbAvgApr.toLocaleString()} · {airbnbDiff >= 0 ? '+' : ''}{airbnbDiff}/คืน
                </div>
              </div>

              {/* OTA badges */}
              <div className="flex justify-around bg-gray-50 rounded-xl py-2 px-1">
                <OTABadge label="AIRBNB"  price={p.airbnb}  color="#FF5A5F" />
                <OTABadge label="BOOKING" price={p.booking} color="#003580" />
                <OTABadge label="EXPEDIA" price={p.expedia} color="#00355F" />
              </div>

              {/* Guest count pricing */}
              <div className="flex justify-around pt-1">
                <PriceCell label="2 คน" price={p.g2} />
                <PriceCell label="3 คน" price={p.g3} />
                <PriceCell label="4 คน" price={p.g4} />
              </div>

              {/* Close Arrival banner */}
              {room.closeArrival && (
                <div className="mt-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold text-center py-1.5">
                  ⚠ Close Arrival
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
