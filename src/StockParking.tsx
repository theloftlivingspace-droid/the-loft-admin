import { useState, useEffect, useCallback, useRef } from 'react';
import { useLang } from './LanguageContext';

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

const W_CATS = ['AIR CONDITIONER','WATER HEATER','MICROWAVE','TV','REFRIGERATOR','PHOTOCOPIER'] as const;
type WCat = typeof W_CATS[number];

// ── Thai → English translations for stock item names & units ──────────────
const STOCK_NAME_EN: Record<string,string> = {
  'กระดาษทิชชู': 'Tissue paper',
  'น้ำดื่ม': 'Drinking water',
  'ยาสระผม+สบู่': 'Shampoo + Soap',
  'ถุงขยะ': 'Trash bags',
  'roller': 'Lint roller',
  'ไมโครเวฟ': 'Microwave',
  'เตารีด': 'Iron',
  'ไดร์เป่าผม': 'Hair dryer',
  'หมอน': 'Pillow',
  'ผ้าปู+ผ้าเช็ดตัว+ผ้าเช็ดผม': 'Bedsheet + Bath towel + Hand towel set',
  'ผ้าเช็ดตัว': 'Bath towel',
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
  'ฝาชักโคก': 'Toilet seat cover',
  'หลอดไฟ LED': 'LED light bulb',
};
const STOCK_UNIT_EN: Record<string,string> = {
  'ม้วน': 'roll', 'ขวด': 'bottle', 'ชุด': 'set', 'ถุง': 'bag', 'ชิ้น': 'pc',
  'อัน': 'pc', 'ใบ': 'pc', 'ผืน': 'pc', 'เครื่อง': 'unit', 'ตัว': 'unit',
  'ก้อน': 'bar', 'กล่อง/ชิ้น': 'box/pc', 'ดวง': 'pc',
};
const STOCK_NOTE_EN: Record<string,string> = {
  'เสีย 1': '1 broken',
  'ขนาดปกติ 7 / เล็ก 2': 'Standard 7 / Small 2',
};

interface StockItem  { id:number; name:string; qty:number; unit:string; note:string; minQty?: number }
interface ParkingIn  { id:number; room:string; plate:string; type:string; name:string; status:string }
interface ParkingOut { id:number; plate:string; type:string; name:string; status:string }
interface Warranty   { id:number; cat:WCat; room:string; brand:string; model:string; sn:string; warranty:string; installed:string }


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
    <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setOpen(x => !x)}>
        {u.photos[0]
          ? <img src={u.photos[0]} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-gray-200" />
          : <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-2xl">🚗</div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-sm text-gray-900">{u.plate || '—'}</span>
            <span className="bg-red-100 text-red-800 border border-red-200 text-xs px-2 py-0.5 rounded-full font-medium">
              {t('sp_patrol_unknown_badge')}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{u.timestamp}</div>
          {u.spotNumber && <div className="text-xs text-gray-400">{t('sp_patrol_spot_label')}: {u.spotNumber}</div>}
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-2">
          {u.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {u.photos.map((p, i) => (
                <img key={i} src={p} alt="" className="h-24 w-24 rounded-lg object-cover flex-shrink-0 border border-gray-200" />
              ))}
            </div>
          )}
          {u.notes && <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2">{u.notes}</p>}
          <button onClick={() => onDelete(u.id)}
            className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
            🗑 {t('sp_delete')}
          </button>
        </div>
      )}

    </div>
  );
}

export default function StockParking({ initialTab, onLowStockChange }: { initialTab?: 'stock'|'parking-in'|'parking-out'|'patrol'|'warranty'; onLowStockChange?: (count: number) => void } = {}) {
  const { t, lang } = useLang();
  // ── nav ──────────────────────────────────────────────────────────────────
  const [section, setSection] = useState<'stock'|'parking-in'|'parking-out'|'patrol'|'warranty'>(initialTab ?? 'stock');
  useEffect(() => { if (initialTab) setSection(initialTab); }, [initialTab]);
  useEffect(() => { window.scrollTo(0, 0); }, [section]);
  const [saving, setSaving] = useState('');
  const [saved,  setSaved]  = useState('');

  // ── stock ────────────────────────────────────────────────────────────────
  const [stockData, setStockData] = useState<StockItem[]>([
    {id:1, name:'กระดาษทิชชู',    qty:51, unit:'ม้วน', note:'',                          minQty:10},
    {id:2, name:'น้ำดื่ม',         qty:61, unit:'ขวด',  note:'',                          minQty:10},
    {id:16,name:'ยาสระผม+สบู่',   qty:20, unit:'ชุด',  note:'Shampoo+Shower Gel+Soap',  minQty:10},
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
    {id:22,name:'ฝาชักโคก',        qty:2,  unit:'อัน',  note:''},
    {id:23,name:'หลอดไฟ LED',     qty:8,  unit:'ดวง',  note:'ขนาดปกติ 7 / เล็ก 2'},
  ]);
  const [nextSId, setNextSId] = useState(26);
  const [showStockModal, setShowStockModal] = useState(false);
  const [newStock, setNewStock] = useState({name:'',qty:0,unit:'',note:''});

  // Notify parent when low-stock count changes
  const lowStockCount = stockData.filter(r => r.minQty !== undefined && r.qty < r.minQty).length;
  useEffect(() => { onLowStockChange?.(lowStockCount); }, [lowStockCount, onLowStockChange]);

  const changeQty = (id:number, delta:number) =>
    setStockData(d => d.map(r => r.id===id ? {...r, qty:Math.max(0,r.qty+delta)} : r));
  const delStock = (id:number) => setStockData(d => d.filter(r=>r.id!==id));
  const addStock = () => {
    if(!newStock.name.trim()) return;
    setStockData(d => [...d, {id:nextSId, ...newStock}]);
    setNextSId(n=>n+1); setNewStock({name:'',qty:0,unit:'',note:''}); setShowStockModal(false);
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
  const addWarranty = () => {
    if(!newW.brand.trim()) return;
    setWarrantyData(d=>[...d,{id:nextWId,...newW}]);
    setNextWId(n=>n+1); setWCat(newW.cat);
    setNewW({cat:'AIR CONDITIONER',room:'',brand:'',model:'',sn:'',warranty:'',installed:''});
    setShowWModal(false);
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

  useEffect(() => {
    sbLoad('stock_data').then(d => {
      if (!d) return;
      // one-time migration: bump old minQty=1 to 2 for these items
      const fixed = (d as StockItem[]).map(r =>
        (r.id === 24 || r.id === 25) && r.minQty === 1 ? { ...r, minQty: 2 } : r
      );
      setStockData(fixed);
      if (JSON.stringify(fixed) !== JSON.stringify(d)) sbSave('stock_data', fixed);
    });
    sbLoad('parking_in').then(d => { if (d) setParkingIn(d); });
    sbLoad('parking_out').then(d => { if (d) setParkingOut(d); });
    sbLoad('warranty_data').then(d => { if (d) setWarrantyData(d); });
    sbLoad('patrol_unknowns').then(d => { if (d) setPatrolUnknowns(d); });
  }, []);

  // ── shared styles ─────────────────────────────────────────────────────────
  const sectionNav = (keys: {key:typeof section; label:string; emoji:string}[]) => (
    <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
      {keys.map(k=>(
        <button key={k.key} onClick={()=>setSection(k.key)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition border
            ${section===k.key
              ? 'bg-blue-900 text-white border-blue-900 shadow'
              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
          {k.emoji} {k.label}
        </button>
      ))}
    </div>
  );

  const inputCls = "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400";
  const btnDel   = "px-2 py-1 rounded-lg text-xs border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition";
  const btnAdd   = "px-4 py-2 rounded-2xl bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition";

  // ── Modal wrapper ─────────────────────────────────────────────────────────
  const Modal = ({title,onClose,onSave,children}:{title:string;onClose:()=>void;onSave:()=>void;children:React.ReactNode}) => (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 overflow-y-auto p-4 flex items-start sm:items-center justify-center">
      <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl my-8 sm:my-0">
        <h3 className="text-base font-semibold mb-4 text-gray-800">{title}</h3>
        <div className="space-y-3">{children}</div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm text-gray-600 hover:bg-gray-50 transition">{t('sp_cancel')}</button>
          <button onClick={onSave}  className="px-5 py-2 rounded-xl bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition">{t('sp_save_btn')}</button>
        </div>
      </div>
    </div>
  );

  const Field = ({label,children}:{label:string;children:React.ReactNode}) => (
    <div><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>
  );

  const typeOpts = ['Car','Motorcycle'];

  return (
    <div className="pb-24">
      {sectionNav([
        {key:'stock',      label:'Stock',        emoji:'📦'},
        {key:'parking-in', label:'Car · In',      emoji:'🚗'},
        {key:'parking-out',label:'Car · Out',     emoji:'🅿️'},
        {key:'patrol',     label:t('sp_patrol_tab'),  emoji:'🚨'},
        {key:'warranty',   label:'Warranty',      emoji:'🛡️'},
      ])}

      {/* ── STOCK ── */}
      {section==='stock' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2 min-w-0">
              <span className="truncate">Stock</span>
              <span className="ml-1 text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">{stockData.length} {t('sp_items_unit')}</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={()=>setShowStockModal(true)} className={btnAdd}>{t('sp_add_item')}</button>
              <button onClick={()=>doSave('stock_data', stockData)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${saving==='stock_data'?'bg-gray-200 text-gray-400':saved==='stock_data'?'bg-green-500 text-white':'bg-amber-400 hover:bg-amber-500 text-gray-900'}`}>
                {saving==='stock_data'?'...' : saved==='stock_data'?t('sp_saved') : t('sp_save')}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['#',t('sp_col_item_name'),t('sp_col_qty'),t('sp_col_min_qty'),t('sp_col_unit'),t('sp_col_note'),''].map(h=>(
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {stockData.map((r,i)=>{
                  const isLow = r.minQty !== undefined && r.qty < r.minQty;
                  return (
                  <tr key={r.id} className={`border-b last:border-0 transition ${isLow ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
                    <td className="px-3 py-2 text-gray-400 text-xs">{i+1}</td>
                    <td className={`px-3 py-2 font-medium ${isLow ? 'text-red-700' : ''}`}>
                      {isLow && <span className="mr-1">🔴</span>}{lang==='en' ? (STOCK_NAME_EN[r.name] || r.name) : r.name}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={()=>changeQty(r.id,-1)}
                          className="w-6 h-6 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm flex items-center justify-center">−</button>
                        <span className={`min-w-[28px] text-center font-semibold ${isLow ? 'text-red-600' : ''}`}>{r.qty}</span>
                        <button onClick={()=>changeQty(r.id,+1)}
                          className="w-6 h-6 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm flex items-center justify-center">+</button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      <input type="number" min={0}
                        value={r.minQty ?? ''}
                        onChange={e=>{
                          const v = e.target.value === '' ? undefined : Number(e.target.value);
                          setStockData(prev => prev.map(x => x.id===r.id ? {...x, minQty:v} : x));
                        }}
                        className="w-14 px-1.5 py-0.5 rounded-lg border border-gray-200 text-center focus:outline-none focus:ring-1 focus:ring-amber-400" />
                    </td>
                    <td className="px-3 py-2 text-gray-500">{lang==='en' ? (STOCK_UNIT_EN[r.unit] || r.unit) : r.unit}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{lang==='en' ? (STOCK_NOTE_EN[r.note] || r.note) : r.note}</td>
                    <td className="px-3 py-2"><button onClick={()=>delStock(r.id)} className={btnDel}>{t('sp_delete')}</button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showStockModal && (
            <Modal title={t('sp_modal_add_item')} onClose={()=>setShowStockModal(false)} onSave={addStock}>
              <Field label={t('sp_field_item_name')}><input className={inputCls} value={newStock.name} onChange={e=>setNewStock(p=>({...p,name:e.target.value}))} placeholder={t('sp_placeholder_soap')}/></Field>
              <Field label={t('sp_field_qty')}><input className={inputCls} type="number" value={newStock.qty} onChange={e=>setNewStock(p=>({...p,qty:+e.target.value}))} /></Field>
              <Field label={t('sp_field_unit')}><input className={inputCls} value={newStock.unit} onChange={e=>setNewStock(p=>({...p,unit:e.target.value}))} placeholder={t('sp_placeholder_bottle')}/></Field>
              <Field label={t('sp_field_note')}><input className={inputCls} value={newStock.note} onChange={e=>setNewStock(p=>({...p,note:e.target.value}))} /></Field>
            </Modal>
          )}
        </div>
      )}

      {/* ── PARKING IN ── */}
      {section==='parking-in' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2 min-w-0">
              <span className="truncate">Car · In-house</span>
              <span className="ml-1 text-xs font-normal bg-green-100 text-green-700 px-2 py-0.5 rounded-full whitespace-nowrap">{parkingIn.length} {t('sp_cars_unit')}</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={()=>setShowPIModal(true)} className={btnAdd}>{t('sp_add_item')}</button>
              <button onClick={()=>doSave('parking_in', parkingIn)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${saving==='parking_in'?'bg-gray-200 text-gray-400':saved==='parking_in'?'bg-green-500 text-white':'bg-amber-400 hover:bg-amber-500 text-gray-900'}`}>
                {saving==='parking_in'?'...' : saved==='parking_in'?t('sp_saved') : t('sp_save')}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['#',t('sp_col_room'),t('sp_col_plate'),t('sp_col_type'),t('sp_col_name'),t('sp_col_status'),''].map(h=>(
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {parkingIn.map((r,i)=>(
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                    <td className="px-3 py-2 text-gray-400 text-xs">{i+1}</td>
                    <td className="px-3 py-2"><span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg text-xs font-medium">{t('sp_room_prefix')} {r.room}</span></td>
                    <td className="px-3 py-2 font-semibold">{r.plate}</td>
                    <td className="px-3 py-2 text-gray-500">{r.type||'—'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.name||'—'}</td>
                    <td className="px-3 py-2">
                      {r.status==='OK'
                        ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">OK</span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2"><button onClick={()=>delParkIn(r.id)} className={btnDel}>{t('sp_delete')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showPIModal && (
            <Modal title={t('sp_modal_add_car_in')} onClose={()=>setShowPIModal(false)} onSave={addParkIn}>
              <Field label={t('sp_field_room_no')}><input className={inputCls} value={newPI.room} onChange={e=>setNewPI(p=>({...p,room:e.target.value}))} placeholder="205"/></Field>
              <Field label={t('sp_field_plate')}><input className={inputCls} value={newPI.plate} onChange={e=>setNewPI(p=>({...p,plate:e.target.value}))} placeholder="บธ1234"/></Field>
              <Field label={t('sp_field_type')}>
                <select className={inputCls} value={newPI.type} onChange={e=>setNewPI(p=>({...p,type:e.target.value}))}>
                  <option value="">—</option>{typeOpts.map(o=><option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label={t('sp_field_contract_name')}><input className={inputCls} value={newPI.name} onChange={e=>setNewPI(p=>({...p,name:e.target.value}))} /></Field>
              <Field label={t('sp_field_status')}>
                <select className={inputCls} value={newPI.status} onChange={e=>setNewPI(p=>({...p,status:e.target.value}))}>
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
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2 min-w-0">
              <span className="truncate">Car · Outside</span>
              <span className="ml-1 text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">{parkingOut.length} {t('sp_cars_unit')}</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={()=>setShowPOModal(true)} className={btnAdd}>{t('sp_add_item')}</button>
              <button onClick={()=>doSave('parking_out', parkingOut)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${saving==='parking_out'?'bg-gray-200 text-gray-400':saved==='parking_out'?'bg-green-500 text-white':'bg-amber-400 hover:bg-amber-500 text-gray-900'}`}>
                {saving==='parking_out'?'...' : saved==='parking_out'?t('sp_saved') : t('sp_save')}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['#',t('sp_col_plate'),t('sp_col_type'),t('sp_col_name'),t('sp_col_status'),''].map(h=>(
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {parkingOut.map((r,i)=>(
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                    <td className="px-3 py-2 text-gray-400 text-xs">{i+1}</td>
                    <td className="px-3 py-2 font-semibold">{r.plate}</td>
                    <td className="px-3 py-2 text-gray-500">{r.type||'—'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.name||'—'}</td>
                    <td className="px-3 py-2">
                      {r.status==='OK'
                        ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">OK</span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2"><button onClick={()=>delParkOut(r.id)} className={btnDel}>{t('sp_delete')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showPOModal && (
            <Modal title={t('sp_modal_add_car_out')} onClose={()=>setShowPOModal(false)} onSave={addParkOut}>
              <Field label={t('sp_field_plate')}><input className={inputCls} value={newPO.plate} onChange={e=>setNewPO(p=>({...p,plate:e.target.value}))} placeholder="บธ1234"/></Field>
              <Field label={t('sp_field_type')}>
                <select className={inputCls} value={newPO.type} onChange={e=>setNewPO(p=>({...p,type:e.target.value}))}>
                  <option value="">—</option>{typeOpts.map(o=><option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label={t('sp_field_contract_name')}><input className={inputCls} value={newPO.name} onChange={e=>setNewPO(p=>({...p,name:e.target.value}))} /></Field>
              <Field label={t('sp_field_status')}>
                <select className={inputCls} value={newPO.status} onChange={e=>setNewPO(p=>({...p,status:e.target.value}))}>
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
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('sp_patrol_search_label')}
            </label>
            <div className="flex gap-2 mt-2">
              <input
                value={patrolSearch}
                onChange={e => { setPatrolSearch(e.target.value); setPatrolSearched(false); }}
                onKeyDown={e => { if (e.key === 'Enter') setPatrolSearched(true); }}
                placeholder={t('sp_patrol_plate_placeholder')}
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                autoCapitalize="characters"
              />
              <button
                onClick={() => setPatrolSearched(true)}
                disabled={normQ(patrolSearch).length < 2}
                className="bg-blue-900 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 transition-colors"
              >
                {t('sp_patrol_search_btn')}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{t('sp_patrol_search_hint')}</p>
          </div>

          {/* Search results */}
          {patrolSearched && normQ(patrolSearch).length >= 2 && (() => {
            const hits = patrolHits();
            if (hits.length > 0) return (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t('sp_patrol_found_count')} {hits.length}
                </p>
                {hits.map((h, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-green-200 shadow-sm p-3 flex items-center gap-3">
                    <span className="text-2xl">✅</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-gray-900">{h.plate}</span>
                        <span className="bg-green-100 text-green-800 border border-green-200 text-xs px-2 py-0.5 rounded-full font-medium">
                          {t('sp_patrol_found_badge')}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{h.label}{h.extra ? ` · ${h.extra}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
            return (
              <div className="bg-red-50 rounded-2xl border border-red-200 p-4 text-center space-y-3">
                <div className="text-3xl">🚨</div>
                <div>
                  <p className="font-semibold text-red-700">{t('sp_patrol_not_found_title')}</p>
                  <p className="text-sm text-red-600 mt-0.5">
                    <span className="font-mono font-bold">{patrolSearch.toUpperCase()}</span>
                    {' '}{t('sp_patrol_not_found_desc')}
                  </p>
                </div>
                <button
                  onClick={() => openPatrolForm(patrolSearch)}
                  className="w-full bg-red-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-red-700 active:bg-red-800 transition-colors shadow-sm"
                >
                  📋 {t('sp_patrol_add_unknown_btn')}
                </button>
              </div>
            );
          })()}

          {/* Direct log button */}
          <button
            onClick={() => openPatrolForm()}
            className="w-full bg-white border-2 border-dashed border-gray-300 rounded-2xl py-3 text-sm text-gray-500 hover:border-red-400 hover:text-red-500 transition-colors font-medium"
          >
            ➕ {t('sp_patrol_add_direct_btn')}
          </button>

          {/* Unknown vehicles log */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              🚨 {t('sp_patrol_unknown_log_title')} ({patrolUnknowns.length})
            </p>
            {patrolUnknowns.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-gray-600 font-medium">{t('sp_patrol_no_unknown')}</p>
                <p className="text-sm text-gray-400 mt-1">{t('sp_patrol_no_unknown_desc')}</p>
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {t('sp_patrol_registered_list')} ({parkingIn.length + parkingOut.length})
            </p>
            <div className="space-y-1.5">
              {parkingIn.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex items-center gap-2">
                  <span className="text-sm">🚗</span>
                  <span className="font-mono text-xs font-bold text-blue-800 flex-1 truncate">{r.plate}</span>
                  <span className="text-xs text-gray-500 shrink-0">{t('sp_room_prefix')} {r.room}</span>
                  <span className="text-xs text-gray-400 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">{t('sp_patrol_in_building')}</span>
                </div>
              ))}
              {parkingOut.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex items-center gap-2">
                  <span className="text-sm">🚗</span>
                  <span className="font-mono text-xs font-bold text-amber-800 flex-1 truncate">{r.plate}</span>
                  {r.name && <span className="text-xs text-gray-500 truncate shrink-0 max-w-[80px]">{r.name}</span>}
                  <span className="text-xs text-gray-400 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">{t('sp_patrol_outside')}</span>
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
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2 min-w-0">
              <span className="truncate">Warranty</span>
              <span className="ml-1 text-xs font-normal bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full whitespace-nowrap">{warrantyData.length} {t('sp_items_unit')}</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={()=>setShowWModal(true)} className={btnAdd}>{t('sp_add_item')}</button>
              <button onClick={()=>doSave('warranty_data', warrantyData)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${saving==='warranty_data'?'bg-gray-200 text-gray-400':saved==='warranty_data'?'bg-green-500 text-white':'bg-amber-400 hover:bg-amber-500 text-gray-900'}`}>
                {saving==='warranty_data'?'...' : saved==='warranty_data'?t('sp_saved') : t('sp_save')}
              </button>
            </div>
          </div>
          {/* category tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {W_CATS.map(c=>(
              <button key={c} onClick={()=>setWCat(c)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition
                  ${c===wCat ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}>
                {c} <span className="opacity-70">({warrantyData.filter(r=>r.cat===c).length})</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl border shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['#',t('sp_col_room'),t('sp_col_brand'),t('sp_col_model'),'Serial No.',t('sp_col_warranty'),t('sp_col_installed'),''].map(h=>(
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {warrantyData.filter(r=>r.cat===wCat).map((r,i)=>(
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                    <td className="px-3 py-2 text-gray-400 text-xs">{i+1}</td>
                    <td className="px-3 py-2"><span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg text-xs font-medium">{r.room}</span></td>
                    <td className="px-3 py-2 font-semibold">{r.brand}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{r.model}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-400">{r.sn||'—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[180px]">{r.warranty||'—'}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">{r.installed||'—'}</td>
                    <td className="px-3 py-2"><button onClick={()=>delWarranty(r.id)} className={btnDel}>{t('sp_delete')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showWModal && (
            <Modal title={t('sp_modal_add_warranty')} onClose={()=>setShowWModal(false)} onSave={addWarranty}>
              <Field label={t('sp_field_category')}>
                <select className={inputCls} value={newW.cat} onChange={e=>setNewW(p=>({...p,cat:e.target.value as WCat}))}>
                  {W_CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={t('sp_field_room')}><input className={inputCls} value={newW.room} onChange={e=>setNewW(p=>({...p,room:e.target.value}))} placeholder={t('sp_placeholder_room')}/></Field>
              <Field label={t('sp_field_brand')}><input className={inputCls} value={newW.brand} onChange={e=>setNewW(p=>({...p,brand:e.target.value}))} /></Field>
              <Field label={t('sp_field_model')}><input className={inputCls} value={newW.model} onChange={e=>setNewW(p=>({...p,model:e.target.value}))} /></Field>
              <Field label="Serial No."><input className={inputCls} value={newW.sn} onChange={e=>setNewW(p=>({...p,sn:e.target.value}))} /></Field>
              <Field label={t('sp_field_warranty')}><input className={inputCls} value={newW.warranty} onChange={e=>setNewW(p=>({...p,warranty:e.target.value}))} placeholder={t('sp_placeholder_warranty')}/></Field>
              <Field label={t('sp_field_install_date')}><input className={inputCls} type="date" onChange={e=>setNewW(p=>({...p,installed:e.target.value}))} /></Field>
            </Modal>
          )}
        </div>
      )}

      {/* ── PATROL FORM MODAL ── */}
      {showPatrolForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between">
              <span className="font-semibold">🚨 {t('sp_patrol_form_title')}</span>
              <button onClick={() => setShowPatrolForm(false)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-4 space-y-3 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('sp_patrol_timestamp_label')}</label>
                <div className="mt-1 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 font-mono">{nowTH()}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('sp_patrol_plate_label')} *</label>
                <input value={pPlate} onChange={e => setPPlate(e.target.value.toUpperCase())}
                  placeholder="กข 1234 / BT 5678"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('sp_patrol_spot_label')}</label>
                <input value={pSpot} onChange={e => setPSpot(e.target.value)}
                  placeholder={t('sp_patrol_spot_placeholder')}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('sp_patrol_photos_label')} (max 4)</label>
                {pPhotos.length < 4 && (
                  <button onClick={() => patrolFileRef.current?.click()}
                    className="mt-1 w-full border-2 border-dashed border-gray-300 rounded-xl py-4 text-sm text-gray-500 hover:border-red-400 hover:text-red-500 transition-colors flex flex-col items-center gap-1">
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
                        <img src={p} alt="" className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
                        <button onClick={() => setPPhotos(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center leading-none">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('sp_patrol_notes_label')}</label>
                <textarea value={pNotes} onChange={e => setPNotes(e.target.value)}
                  placeholder={t('sp_patrol_notes_placeholder')} rows={2}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowPatrolForm(false)}
                  className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  {t('sp_cancel')}
                </button>
                <button onClick={savePatrolUnknown}
                  className="flex-1 bg-red-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-red-700 active:bg-red-800 transition-colors shadow-sm">
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
