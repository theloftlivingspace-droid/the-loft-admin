import React, { useState } from "react";

const NAVY = "#071B3D";
const GOLD = "#D9B25C";

const STATUS = {
  vacant: { label: "Vacant", short: "ว่าง", bg: "#E5E7EB", text: "#4B5563" },
  occupied: { label: "Occupied", short: "เข้าพัก", bg: "#B8DDC5", text: "#1F5C3A" },
  checkout: { label: "Checkout today", short: "เช็คเอาท์", bg: "#F0C4C4", text: "#7A2020" },
  closed: { label: "Closed", short: "ปิดห้อง", bg: "#D9CBEE", text: "#4A3480" },
  arrivingToday: { label: "Arriving today", short: "เข้าวันนี้", bg: "#F3DFA8", text: "#7A5A0A" },
  arrivingSoon: { label: "Arriving soon", short: "ใกล้เข้า", bg: "#C3D2EC", text: "#1F3D73" },
};

// room 300 corrected to floor 2
const ROOMS = [
  { no: "203", type: "Allure", floor: 2, status: "occupied" },
  { no: "103", type: "Elegance", floor: 1, status: "closed" },
  { no: "209", type: "Radiance", floor: 2, status: "occupied" },
  { no: "113", type: "Legacy", floor: 1, status: "occupied" },
  { no: "300", type: "Luxury", floor: 2, status: "vacant" },
  { no: "104", type: "Noir", floor: 1, status: "closed" },
  { no: "105", type: "Emerald", floor: 1, status: "closed" },
  { no: "112", type: "Rhythm", floor: 1, status: "closed" },
  { no: "205", type: "Allure", floor: 2, status: "vacant" },
  { no: "204", type: "Elegance", floor: 2, status: "occupied" },
  { no: "210", type: "Radiance", floor: 2, status: "occupied" },
  { no: "214", type: "Legacy", floor: 2, status: "occupied" },
  { no: "108", type: "Retro", floor: 1, status: "vacant" },
  { no: "207", type: "Noir", floor: 2, status: "closed" },
  { no: "211", type: "Emerald", floor: 2, status: "closed" },
  { no: "208", type: "Rhythm", floor: 2, status: "closed" },
];

// mix a hex color toward white to create a "dimmed" pastel version
function dim(hex, amount = 0.72) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function RoomCard({ room, activeFilter }) {
  const s = STATUS[room.status];
  const isDimmed = activeFilter && activeFilter !== room.status;
  const bg = isDimmed ? dim(s.bg) : s.bg;
  const textColor = isDimmed ? dim(s.text, 0.55) : s.text;

  return (
    <div
      className="rounded-md px-1 py-1 flex flex-col justify-center items-center text-center transition-colors duration-150 overflow-hidden"
      style={{ backgroundColor: bg }}
    >
      <span className="font-bold text-[12px] leading-none" style={{ color: textColor }}>
        {room.no}
      </span>
      <span
        className="leading-none truncate w-full mt-0.5"
        style={{ color: textColor, opacity: 0.65, fontSize: "5px" }}
      >
        {room.type}
      </span>
    </div>
  );
}

function LegendChip({ statusKey, active, onToggle }) {
  const s = STATUS[statusKey];
  const dimmed = active !== null && active !== statusKey;
  const isSelected = active === statusKey;

  return (
    <button
      onClick={() => onToggle(statusKey)}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
      style={{
        backgroundColor: dimmed ? dim(s.bg, 0.8) : s.bg,
        color: dimmed ? dim(s.text, 0.6) : s.text,
        boxShadow: isSelected ? `0 0 0 2px ${NAVY}` : "none",
        opacity: dimmed ? 0.6 : 1,
      }}
    >
      {s.short}
    </button>
  );
}

export default function RoomStatusMockupV3() {
  // null = no filter (all full color); otherwise the selected status key
  const [activeFilter, setActiveFilter] = useState(null);

  const toggle = (key) => setActiveFilter((cur) => (cur === key ? null : key));

  return (
    <div className="min-h-screen bg-gray-50 pb-10" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="px-4 pt-5 pb-3" style={{ backgroundColor: NAVY }}>
        <div className="text-[11px] tracking-wider" style={{ color: GOLD }}>
          THE LOFT LIVING SPACE
        </div>
        <div className="text-white text-lg font-bold">Room Status</div>
        <div className="text-white/50 text-[11px]">Updated 09:35 · 2026-08-22</div>
      </div>

      <div className="px-4 pt-3">
        {/* legend as clickable filter menu — click highlights one, dims the rest */}
        <div className="flex flex-wrap gap-1.5 mb-4 items-center">
          {Object.keys(STATUS).map((k) => (
            <LegendChip key={k} statusKey={k} active={activeFilter} onToggle={toggle} />
          ))}
          {activeFilter && (
            <button
              onClick={() => setActiveFilter(null)}
              className="text-[11px] text-gray-400 underline ml-1"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {/* single flat grid, original room order — no floor grouping */}
        <div className="grid grid-cols-8 gap-[4px]">
          {ROOMS.map((r) => (
            <RoomCard key={r.no} room={r} activeFilter={activeFilter} />
          ))}
        </div>
      </div>
    </div>
  );
}
