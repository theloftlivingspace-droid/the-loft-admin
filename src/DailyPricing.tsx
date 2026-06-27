// DailyPricing.tsx — แสดงราคาวันนี้ + Alert + KPI จาก loft-pricing dashboard
import { useState, useEffect } from 'react';

// ── ข้อมูล PriceLabs (sync จาก loft-pricing/index.html) ──────────────────────
const PL_PRICES: Record<string, Record<string, number>> = {"Luxury":{"2026-05-02":598,"2026-05-03":592,"2026-05-04":629,"2026-05-05":672,"2026-05-06":666,"2026-05-07":704,"2026-05-08":718,"2026-05-09":729,"2026-05-10":739,"2026-05-11":800,"2026-05-12":785,"2026-05-13":804,"2026-05-14":798,"2026-05-15":777,"2026-05-16":777,"2026-05-17":612,"2026-05-18":613,"2026-05-19":612,"2026-05-20":618,"2026-05-21":632,"2026-05-22":613,"2026-05-23":632,"2026-05-24":613,"2026-05-25":613,"2026-05-26":594,"2026-05-27":594,"2026-05-28":594,"2026-05-29":613,"2026-05-30":632,"2026-05-31":651,"2026-06-01":658,"2026-06-02":678,"2026-06-03":679,"2026-06-04":679,"2026-06-05":665,"2026-06-06":660,"2026-06-07":620,"2026-06-08":619,"2026-06-09":639,"2026-06-10":619,"2026-06-11":620,"2026-06-12":661,"2026-06-13":700,"2026-06-14":660,"2026-06-15":673,"2026-06-16":659,"2026-06-17":688,"2026-06-18":688,"2026-06-19":680,"2026-06-20":680,"2026-06-21":680,"2026-06-22":680,"2026-06-23":660,"2026-06-24":680,"2026-06-25":680,"2026-06-26":700,"2026-06-27":720,"2026-06-28":700,"2026-06-29":700,"2026-06-30":700,"2026-07-01":755,"2026-07-02":779,"2026-07-03":782,"2026-07-04":806,"2026-07-05":764,"2026-07-06":788,"2026-07-07":767,"2026-07-08":791,"2026-07-09":793,"2026-07-10":841,"2026-07-11":843,"2026-07-12":822,"2026-07-13":801,"2026-07-14":811,"2026-07-15":805,"2026-07-16":807,"2026-07-17":809,"2026-07-18":811,"2026-07-19":812,"2026-07-20":791,"2026-07-21":793,"2026-07-22":795,"2026-07-23":797,"2026-07-24":825,"2026-07-25":824,"2026-07-26":826,"2026-07-27":828,"2026-07-28":877,"2026-07-29":855,"2026-07-30":857},"Retro":{"2026-05-02":608,"2026-05-03":602,"2026-05-04":640,"2026-05-05":683,"2026-05-06":678,"2026-05-07":717,"2026-05-08":731,"2026-05-09":742,"2026-05-10":752,"2026-05-11":814,"2026-05-12":799,"2026-05-13":819,"2026-05-14":812,"2026-05-15":791,"2026-05-16":791,"2026-05-17":623,"2026-05-18":623,"2026-05-19":623,"2026-05-20":629,"2026-05-21":643,"2026-05-22":624,"2026-05-23":644,"2026-05-24":624,"2026-05-25":624,"2026-05-26":604,"2026-05-27":604,"2026-05-28":604,"2026-05-29":624,"2026-05-30":643,"2026-05-31":663,"2026-06-01":670,"2026-06-02":691,"2026-06-03":691,"2026-06-04":691,"2026-06-05":677,"2026-06-06":671,"2026-06-07":631,"2026-06-08":630,"2026-06-09":651,"2026-06-10":630,"2026-06-11":631,"2026-06-12":672,"2026-06-13":713,"2026-06-14":672,"2026-06-15":684,"2026-06-16":671,"2026-06-17":701,"2026-06-18":700,"2026-06-19":692,"2026-06-20":692,"2026-06-21":692,"2026-06-22":692,"2026-06-23":671,"2026-06-24":692,"2026-06-25":692,"2026-06-26":713,"2026-06-27":733,"2026-06-28":712,"2026-06-29":713,"2026-06-30":713,"2026-07-01":769,"2026-07-02":793,"2026-07-03":796,"2026-07-04":820,"2026-07-05":777,"2026-07-06":802,"2026-07-07":780,"2026-07-08":805,"2026-07-09":807,"2026-07-10":856,"2026-07-11":858,"2026-07-12":836,"2026-07-13":815,"2026-07-14":825,"2026-07-15":819,"2026-07-16":821,"2026-07-17":823,"2026-07-18":825,"2026-07-19":827,"2026-07-20":805,"2026-07-21":807,"2026-07-22":809,"2026-07-23":811,"2026-07-24":840,"2026-07-25":839,"2026-07-26":841,"2026-07-27":843,"2026-07-28":892,"2026-07-29":870,"2026-07-30":872},"Elegance":{"2026-05-02":589,"2026-05-03":574,"2026-05-04":619,"2026-05-05":661,"2026-05-06":656,"2026-05-07":693,"2026-05-08":707,"2026-05-09":718,"2026-05-10":728,"2026-05-11":788,"2026-05-12":773,"2026-05-13":792,"2026-05-14":786,"2026-05-15":765,"2026-05-16":766,"2026-05-17":622,"2026-05-18":622,"2026-05-19":621,"2026-05-20":628,"2026-05-21":642,"2026-05-22":623,"2026-05-23":642,"2026-05-24":622,"2026-05-25":622,"2026-05-26":603,"2026-05-27":603,"2026-05-28":603,"2026-05-29":623,"2026-05-30":642,"2026-05-31":661,"2026-06-01":668,"2026-06-02":689,"2026-06-03":689,"2026-06-04":690,"2026-06-05":675,"2026-06-06":670,"2026-06-07":629,"2026-06-08":629,"2026-06-09":649,"2026-06-10":629,"2026-06-11":630,"2026-06-12":671,"2026-06-13":711,"2026-06-14":670,"2026-06-15":683,"2026-06-16":670,"2026-06-17":699,"2026-06-18":699,"2026-06-19":690,"2026-06-20":691,"2026-06-21":690,"2026-06-22":690,"2026-06-23":670,"2026-06-24":690,"2026-06-25":690,"2026-06-26":711,"2026-06-27":731,"2026-06-28":711,"2026-06-29":711,"2026-06-30":711,"2026-07-01":767,"2026-07-02":791,"2026-07-03":794,"2026-07-04":818,"2026-07-05":775,"2026-07-06":800,"2026-07-07":778,"2026-07-08":803,"2026-07-09":805,"2026-07-10":854,"2026-07-11":856,"2026-07-12":834,"2026-07-13":813,"2026-07-14":823,"2026-07-15":817,"2026-07-16":819,"2026-07-17":821,"2026-07-18":823,"2026-07-19":825,"2026-07-20":803,"2026-07-21":805,"2026-07-22":807,"2026-07-23":809,"2026-07-24":838,"2026-07-25":837,"2026-07-26":839,"2026-07-27":841,"2026-07-28":890,"2026-07-29":868,"2026-07-30":870},"Allure":{"2026-05-02":500,"2026-05-03":500,"2026-05-04":500,"2026-05-05":505,"2026-05-06":501,"2026-05-07":512,"2026-05-08":540,"2026-05-09":548,"2026-05-10":556,"2026-05-11":598,"2026-05-12":588,"2026-05-13":602,"2026-05-14":598,"2026-05-15":581,"2026-05-16":585,"2026-05-17":519,"2026-05-18":525,"2026-05-19":524,"2026-05-20":521,"2026-05-21":524,"2026-05-22":525,"2026-05-23":525,"2026-05-24":525,"2026-05-25":525,"2026-05-26":509,"2026-05-27":509,"2026-05-28":509,"2026-05-29":525,"2026-05-30":541,"2026-05-31":558,"2026-06-01":564,"2026-06-02":581,"2026-06-03":581,"2026-06-04":581,"2026-06-05":552,"2026-06-06":565,"2026-06-07":531,"2026-06-08":531,"2026-06-09":531,"2026-06-10":531,"2026-06-11":531,"2026-06-12":566,"2026-06-13":583,"2026-06-14":565,"2026-06-15":576,"2026-06-16":547,"2026-06-17":581,"2026-06-18":581,"2026-06-19":565,"2026-06-20":582,"2026-06-21":565,"2026-06-22":565,"2026-06-23":565,"2026-06-24":582,"2026-06-25":582,"2026-06-26":600,"2026-06-27":617,"2026-06-28":600,"2026-06-29":599,"2026-06-30":583,"2026-07-01":647,"2026-07-02":668,"2026-07-03":670,"2026-07-04":671,"2026-07-05":654,"2026-07-06":675,"2026-07-07":656,"2026-07-08":677,"2026-07-09":679,"2026-07-10":701,"2026-07-11":702,"2026-07-12":699,"2026-07-13":686,"2026-07-14":694,"2026-07-15":669,"2026-07-16":671,"2026-07-17":673,"2026-07-18":694,"2026-07-19":696,"2026-07-20":657,"2026-07-21":659,"2026-07-22":660,"2026-07-23":682,"2026-07-24":704,"2026-07-25":705,"2026-07-26":706,"2026-07-27":708,"2026-07-28":750,"2026-07-29":732,"2026-07-30":733},"Legacy":{"2026-05-02":511,"2026-05-03":506,"2026-05-04":537,"2026-05-05":574,"2026-05-06":569,"2026-05-07":602,"2026-05-08":614,"2026-05-09":623,"2026-05-10":632,"2026-05-11":684,"2026-05-12":671,"2026-05-13":688,"2026-05-14":683,"2026-05-15":665,"2026-05-16":665,"2026-05-17":640,"2026-05-18":640,"2026-05-19":639,"2026-05-20":646,"2026-05-21":660,"2026-05-22":641,"2026-05-23":661,"2026-05-24":640,"2026-05-25":640,"2026-05-26":620,"2026-05-27":620,"2026-05-28":621,"2026-05-29":641,"2026-05-30":660,"2026-05-31":680,"2026-06-01":688,"2026-06-02":709,"2026-06-03":709,"2026-06-04":710,"2026-06-05":695,"2026-06-06":689,"2026-06-07":647,"2026-06-08":647,"2026-06-09":668,"2026-06-10":647,"2026-06-11":648,"2026-06-12":690,"2026-06-13":732,"2026-06-14":690,"2026-06-15":703,"2026-06-16":689,"2026-06-17":719,"2026-06-18":719,"2026-06-19":710,"2026-06-20":711,"2026-06-21":711,"2026-06-22":710,"2026-06-23":689,"2026-06-24":710,"2026-06-25":710,"2026-06-26":732,"2026-06-27":753,"2026-06-28":731,"2026-06-29":732,"2026-06-30":732,"2026-07-01":789,"2026-07-02":814,"2026-07-03":817,"2026-07-04":842,"2026-07-05":798,"2026-07-06":823,"2026-07-07":801,"2026-07-08":827,"2026-07-09":829,"2026-07-10":879,"2026-07-11":881,"2026-07-12":859,"2026-07-13":837,"2026-07-14":847,"2026-07-15":841,"2026-07-16":843,"2026-07-17":845,"2026-07-18":847,"2026-07-19":849,"2026-07-20":827,"2026-07-21":829,"2026-07-22":831,"2026-07-23":833,"2026-07-24":862,"2026-07-25":861,"2026-07-26":863,"2026-07-27":865,"2026-07-28":916,"2026-07-29":894,"2026-07-30":896},"Radiance":{"2026-05-02":530,"2026-05-03":530,"2026-05-04":530,"2026-05-05":535,"2026-05-06":531,"2026-05-07":543,"2026-05-08":572,"2026-05-09":581,"2026-05-10":589,"2026-05-11":634,"2026-05-12":623,"2026-05-13":638,"2026-05-14":634,"2026-05-15":616,"2026-05-16":620,"2026-05-17":550,"2026-05-18":557,"2026-05-19":556,"2026-05-20":552,"2026-05-21":555,"2026-05-22":557,"2026-05-23":557,"2026-05-24":557,"2026-05-25":557,"2026-05-26":540,"2026-05-27":540,"2026-05-28":540,"2026-05-29":557,"2026-05-30":573,"2026-05-31":591,"2026-06-01":598,"2026-06-02":616,"2026-06-03":616,"2026-06-04":616,"2026-06-05":585,"2026-06-06":599,"2026-06-07":563,"2026-06-08":563,"2026-06-09":563,"2026-06-10":563,"2026-06-11":563,"2026-06-12":600,"2026-06-13":618,"2026-06-14":599,"2026-06-15":610,"2026-06-16":580,"2026-06-17":616,"2026-06-18":616,"2026-06-19":599,"2026-06-20":617,"2026-06-21":599,"2026-06-22":599,"2026-06-23":599,"2026-06-24":617,"2026-06-25":617,"2026-06-26":636,"2026-06-27":654,"2026-06-28":636,"2026-06-29":635,"2026-06-30":618,"2026-07-01":686,"2026-07-02":708,"2026-07-03":710,"2026-07-04":711,"2026-07-05":693,"2026-07-06":716,"2026-07-07":695,"2026-07-08":717,"2026-07-09":720,"2026-07-10":743,"2026-07-11":744,"2026-07-12":741,"2026-07-13":727,"2026-07-14":736,"2026-07-15":709,"2026-07-16":711,"2026-07-17":713,"2026-07-18":736,"2026-07-19":738,"2026-07-20":696,"2026-07-21":699,"2026-07-22":700,"2026-07-23":723,"2026-07-24":746,"2026-07-25":747,"2026-07-26":748,"2026-07-27":751,"2026-07-28":795,"2026-07-29":776,"2026-07-30":777}};

const ROOMS_DATA = [
  { id:'Luxury',   base:867, occ:100, realADR:657, rooms:['108'],          color:'#534AB7', bg:'#EEEDF9' },
  { id:'Retro',    base:865, occ:86,  realADR:560, rooms:['113','300'],    color:'#C8731A', bg:'#FDF0E3' },
  { id:'Allure',   base:907, occ:71,  realADR:486, rooms:['203','205'],    color:'#2B5FA8', bg:'#EBF1FC' },
  { id:'Elegance', base:871, occ:57,  realADR:480, rooms:['209','210'],    color:'#3A7D44', bg:'#EBF5EE' },
  { id:'Legacy',   base:882, occ:71,  realADR:478, rooms:['204','214'],    color:'#6B4C9A', bg:'#F2EDF9' },
  { id:'Radiance', base:851, occ:0,   realADR:850, rooms:['103','363'],    color:'#B94040', bg:'#FAEAEA' },
];

const BASE_PRICES: Record<string, { weekday: number; weekend: number; cleaning: number; extra3: number }> = {
  Luxury:   { weekday: 1100, weekend: 1300, cleaning: 350, extra3: 400 },
  Retro:    { weekday:  950, weekend: 1150, cleaning: 300, extra3: 350 },
  Allure:   { weekday:  800, weekend:  980, cleaning: 250, extra3: 300 },
  Elegance: { weekday:  800, weekend:  980, cleaning: 250, extra3: 300 },
  Legacy:   { weekday:  750, weekend:  920, cleaning: 250, extra3: 280 },
  Radiance: { weekday:  850, weekend: 1020, cleaning: 270, extra3: 300 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getSeason(d: Date): string {
  const m = d.getMonth(); // 0-based
  if ([10, 11].includes(m)) return 'high';
  if ([3, 4, 5, 6, 7, 8].includes(m)) return 'low';
  return 'normal';
}

const SEASON_LABEL: Record<string, string> = {
  low:    '🌧 Low Season',
  normal: '🌤 Normal Season',
  high:   '❄️ High Season',
  peak:   '🔥 Peak',
};
const SEASON_COLOR: Record<string, string> = {
  low:    'bg-blue-50 text-blue-700 border-blue-200',
  normal: 'bg-amber-50 text-amber-700 border-amber-200',
  high:   'bg-green-50 text-green-700 border-green-200',
  peak:   'bg-red-50 text-red-700 border-red-200',
};

function getDow(d: Date): string {
  const day = d.getDay(); // 0=Sun,6=Sat
  if (day === 5) return 'ศุกร์';
  if (day === 6 || day === 0) return 'เสาร์–อาทิตย์';
  return 'จ–พฤ';
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 5 || day === 6;
}

function getPlPrice(type: string, dateStr: string): number | null {
  return PL_PRICES[type]?.[dateStr] ?? null;
}

function alertLevel(occ: number): 'urgent-up' | 'warn-down' | 'ok' {
  if (occ >= 85) return 'urgent-up';
  if (occ < 50)  return 'warn-down';
  return 'ok';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DailyPricing() {
  const [today] = useState(() => new Date());
  const todayStr = fmtDate(today);
  const season   = getSeason(today);
  const dow      = getDow(today);
  const weekend  = isWeekend(today);

  // Next 7 days
  const next7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Alert summary
  const alerts = ROOMS_DATA.map(r => ({ ...r, level: alertLevel(r.occ) }));
  const urgentUp   = alerts.filter(a => a.level === 'urgent-up');
  const warnDown   = alerts.filter(a => a.level === 'warn-down');
  const avgPLToday = Math.round(
    ROOMS_DATA.map(r => getPlPrice(r.id, todayStr) ?? r.base).reduce((a, b) => a + b, 0) / ROOMS_DATA.length
  );

  const DOW_TH: Record<number, string> = { 0:'อา', 1:'จ', 2:'อ', 3:'พ', 4:'พฤ', 5:'ศ', 6:'ส' };

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-900">💰 Daily Pricing</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {today.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <a href="https://theloftlivingspace-droid.github.io/loft-pricing/" target="_blank" rel="noopener noreferrer"
          className="text-xs border border-blue-300 text-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition font-medium">
          🔗 เปิด Pricing Dashboard
        </a>
      </div>

      {/* ── Alert Banner ── */}
      {urgentUp.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-red-600 font-bold text-lg leading-none mt-0.5">!</span>
          <div>
            <div className="font-semibold text-red-800 text-sm">ต้องปรับราคาทันที — {urgentUp.length} ประเภท Occ สูงมาก</div>
            <div className="text-xs text-red-600 mt-1 space-y-0.5">
              {urgentUp.map(r => (
                <div key={r.id}>• {r.id} ({r.rooms.join(',')}) — Occ {r.occ}% → ขึ้นราคา / ปิด Close Arrival</div>
              ))}
            </div>
          </div>
        </div>
      ) : warnDown.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span className="text-amber-600 font-bold text-lg leading-none mt-0.5">↓</span>
          <div>
            <div className="font-semibold text-amber-800 text-sm">แนะนำลดราคา — {warnDown.length} ประเภท Occ ต่ำกว่าเป้า</div>
            <div className="text-xs text-amber-700 mt-1 space-y-0.5">
              {warnDown.map(r => (
                <div key={r.id}>• {r.id} ({r.rooms.join(',')}) — Occ {r.occ}% → พิจารณาลดราคาหรือ Promotion</div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
          <span className="text-green-600 font-bold text-lg">✓</span>
          <div className="font-semibold text-green-800 text-sm">ราคาอยู่ในช่วงปกติ — ไม่ต้องปรับอะไรวันนี้</div>
        </div>
      )}

      {/* ── KPI Row (ภาพรวมผู้บริหาร) ── */}
      <div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">ภาพรวมผู้บริหาร</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border bg-white px-3 py-2.5">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Season</div>
            <div className={`mt-1 text-xs font-semibold rounded-full px-2 py-0.5 border w-fit ${SEASON_COLOR[season]}`}>{SEASON_LABEL[season]}</div>
          </div>
          <div className="rounded-xl border bg-white px-3 py-2.5">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">PriceLabs วันนี้ (เฉลี่ย)</div>
            <div className="text-lg font-bold text-gray-900 mt-0.5">฿{avgPLToday.toLocaleString()}</div>
            <div className="text-[10px] text-gray-400">{dow}</div>
          </div>
          <div className="rounded-xl border bg-white px-3 py-2.5">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Revenue รวม</div>
            <div className="text-lg font-bold text-gray-900 mt-0.5">฿2.09M</div>
            <div className="text-[10px] text-gray-400">ธ.ค.2024 – พ.ค.2026 · 471 bookings</div>
          </div>
          <div className="rounded-xl border bg-white px-3 py-2.5">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">ADR เฉลี่ย</div>
            <div className="text-lg font-bold text-gray-900 mt-0.5">฿825</div>
            <div className="text-[10px] text-gray-400">Expedia สูงสุด ฿1,573</div>
          </div>
        </div>
      </div>

      {/* ── ราคาแต่ละ Room Type วันนี้ ── */}
      <div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">ราคาแต่ละ Room Type — วันนี้</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ROOMS_DATA.map(r => {
            const plPrice  = getPlPrice(r.id, todayStr);
            const baseP    = BASE_PRICES[r.id];
            const stdPrice = weekend ? baseP.weekend : baseP.weekday;
            const level    = alertLevel(r.occ);
            const alertCls = level === 'urgent-up' ? 'border-red-200 bg-red-50' :
                             level === 'warn-down'  ? 'border-amber-200 bg-amber-50' :
                             'border-gray-100 bg-white';
            const occColor = level === 'urgent-up' ? 'text-red-600' :
                             level === 'warn-down'  ? 'text-amber-600' : 'text-green-600';
            return (
              <div key={r.id} className={`rounded-xl border px-3 py-2.5 ${alertCls}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: r.color }}>{r.id}</span>
                    <span className="text-[10px] text-gray-400">{r.rooms.join(' / ')}</span>
                  </div>
                  <span className={`text-xs font-semibold ${occColor}`}>Occ {r.occ}%</span>
                </div>
                <div className="flex items-end gap-3 flex-wrap">
                  {plPrice && (
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wide">PriceLabs</div>
                      <div className="text-base font-bold text-gray-900">฿{plPrice.toLocaleString()}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-[9px] text-gray-400 uppercase tracking-wide">ราคาตั้ง ({weekend ? 'wknd' : 'wkday'})</div>
                    <div className="text-base font-bold" style={{ color: r.color }}>฿{stdPrice.toLocaleString()}</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-[9px] text-gray-400">ADR จริง</div>
                    <div className="text-xs font-medium text-gray-600">฿{r.realADR.toLocaleString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-400">Cleaning ฿{baseP.cleaning}</span>
                  <span className="text-gray-200">·</span>
                  <span className="text-[10px] text-gray-400">Extra ฿{baseP.extra3}/คืน</span>
                  {level === 'urgent-up' && <span className="text-[10px] bg-red-100 text-red-700 rounded px-1 font-medium ml-auto">⬆ ขึ้นราคา</span>}
                  {level === 'warn-down' && <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1 font-medium ml-auto">⬇ พิจารณาลด</span>}
                  {level === 'ok'        && <span className="text-[10px] bg-green-100 text-green-700 rounded px-1 font-medium ml-auto">✓ คงราคา</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ราคา 7 วัน ── */}
      <div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">PriceLabs — 7 วันข้างหน้า</div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-3 py-2 font-semibold text-gray-500 w-24">Room Type</th>
                {next7.map((d, i) => (
                  <th key={i} className={`px-2 py-2 text-center font-semibold ${isWeekend(d) ? 'text-blue-600 bg-blue-50' : 'text-gray-500'}`}>
                    <div>{DOW_TH[d.getDay()]}</div>
                    <div className="text-[10px] font-normal">{d.getDate()}/{d.getMonth()+1}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROOMS_DATA.map((r, ri) => (
                <tr key={r.id} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-3 py-2 font-semibold" style={{ color: r.color }}>{r.id}</td>
                  {next7.map((d, i) => {
                    const ds  = fmtDate(d);
                    const p   = getPlPrice(r.id, ds);
                    const wkd = isWeekend(d);
                    return (
                      <td key={i} className={`px-2 py-2 text-center ${wkd ? 'bg-blue-50/30' : ''}`}>
                        {p
                          ? <span className="font-medium text-gray-800">{p.toLocaleString()}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">สีน้ำเงิน = ศุกร์–อาทิตย์ · ราคาจาก PriceLabs CSV (อัปเดต พ.ค. 2026)</p>
      </div>

    </div>
  );
}
