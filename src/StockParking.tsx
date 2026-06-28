import { useState, useEffect } from 'react';

const W_CATS = ['AIR CONDITIONER','WATER HEATER','MICROWAVE','TV','REFRIGERATOR','PHOTOCOPIER'] as const;
type WCat = typeof W_CATS[number];

interface StockItem  { id:number; name:string; qty:number; unit:string; note:string; minQty?: number }
interface ParkingIn  { id:number; room:string; plate:string; type:string; name:string; status:string }
interface ParkingOut { id:number; plate:string; type:string; name:string; status:string }
interface Warranty   { id:number; cat:WCat; room:string; brand:string; model:string; sn:string; warranty:string; installed:string }

export default function StockParking({ initialTab, onLowStockChange }: { initialTab?: 'stock'|'parking-in'|'parking-out'|'warranty'; onLowStockChange?: (count: number) => void } = {}) {
  // ── nav ──────────────────────────────────────────────────────────────────
  const [section, setSection] = useState<'stock'|'parking-in'|'parking-out'|'warranty'>(initialTab ?? 'stock');
  useEffect(() => { if (initialTab) setSection(initialTab); }, [initialTab]);

  // ── stock ────────────────────────────────────────────────────────────────
  const [stockData, setStockData] = useState<StockItem[]>([
    {id:1, name:'กระดาษทิชชู',    qty:51, unit:'ม้วน', note:'',                          minQty:10},
    {id:2, name:'น้ำดื่ม',         qty:61, unit:'ขวด',  note:'',                          minQty:10},
    {id:16,name:'ยาสระผม+สบู่',   qty:20, unit:'ชุด',  note:'Shampoo+Shower Gel+Soap',  minQty:10},
    {id:24,name:'ถุงขยะ',          qty:0,  unit:'ถุง',  note:'',                          minQty:10},
    {id:25,name:'roller',          qty:0,  unit:'ชิ้น', note:'',                          minQty:1},
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
    {id:1,room:'105',plate:'บธ1074',type:'รถยนต์',name:'',status:'OK'},
    {id:2,room:'105',plate:'8316',type:'',name:'',status:''},
    {id:3,room:'107',plate:'4500',type:'',name:'',status:''},
    {id:4,room:'213',plate:'5ขย2961',type:'รถยนต์',name:'',status:'OK'},
    {id:5,room:'302',plate:'3091',type:'',name:'',status:''},
    {id:6,room:'306',plate:'7051',type:'',name:'',status:''},
    {id:7,room:'308',plate:'8ขฎ8365',type:'รถมอเตอร์ไซต์',name:'',status:'OK'},
    {id:8,room:'312',plate:'กว 1156',type:'',name:'อารียา เรียมแสน',status:''},
    {id:9,room:'315',plate:'ถฬ7555',type:'',name:'ฤกษ์มงคล เย็นใจ',status:'OK'},
    {id:10,room:'315',plate:'1ณ0264',type:'',name:'ฤกษ์มงคล เย็นใจ',status:''},
    {id:11,room:'406',plate:'8กว691',type:'รถยนต์',name:'',status:'OK'},
    {id:12,room:'409',plate:'ตถ617',type:'รถยนต์',name:'',status:'OK'},
    {id:13,room:'410',plate:'บธ5372',type:'รถยนต์',name:'เจนจิรา ปัดถาวโร',status:'OK'},
    {id:14,room:'414',plate:'533',type:'',name:'',status:''},
    {id:15,room:'414',plate:'5612',type:'',name:'',status:''},
    {id:16,room:'516',plate:'3ขส7034',type:'รถยนต์',name:'',status:'OK'},
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
    {id:1,plate:'ผธ1138',type:'รถยนต์',name:'รุ่งโรจน์ อินธินิน',status:'OK'},
    {id:2,plate:'บม1764',type:'รถยนต์',name:'',status:'OK'},
    {id:3,plate:'กง8823',type:'รถยนต์',name:'',status:'OK'},
    {id:4,plate:'1มฆ299',type:'แท็กซี่',name:'ประจักษ์ แปลนดี',status:''},
    {id:5,plate:'5กช3204',type:'รถยนต์',name:'จักรี ธนามี',status:'OK'},
    {id:6,plate:'4ขห3832',type:'รถยนต์',name:'',status:'OK'},
    {id:7,plate:'2ขพ6423',type:'',name:'ประคอง ประมวล',status:''},
    {id:8,plate:'3ขฆ7238',type:'รถยนต์',name:'จิตภรณ์ สีสัญ',status:'OK'},
    {id:9,plate:'2ขญ3250',type:'มอเตอร์ไซต์',name:'',status:'OK'},
    {id:10,plate:'8กฉ5112',type:'มอเตอร์ไซต์',name:'มยุรี พันธ์วงค์',status:'OK'},
    {id:11,plate:'0934',type:'',name:'',status:''},
    {id:12,plate:'5ขช1137',type:'รถยนต์',name:'',status:'OK'},
    {id:13,plate:'5ขศ8450',type:'รถยนต์',name:'',status:'OK'},
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
    {id:1,cat:'AIR CONDITIONER',room:'411',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2312C01041437',warranty:'ประกันคอมเพรสเซอร์ 5 ปี อะไหล่ 1 ปี',installed:'2/2/2567'},
    {id:2,cat:'AIR CONDITIONER',room:'308',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2205C00982898',warranty:'',installed:''},
    {id:3,cat:'AIR CONDITIONER',room:'213',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2206C00966606',warranty:'',installed:''},
    {id:4,cat:'AIR CONDITIONER',room:'107',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2206C00966647',warranty:'',installed:''},
    {id:5,cat:'AIR CONDITIONER',room:'214',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2308C01029304',warranty:'',installed:''},
    {id:6,cat:'AIR CONDITIONER',room:'305',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2310C01032446',warranty:'',installed:''},
    {id:7,cat:'AIR CONDITIONER',room:'303',brand:'SAIJO DENKI',model:'CE09SUPER32SWG1/SWG',sn:'2403C01052386',warranty:'',installed:''},
    {id:8,cat:'AIR CONDITIONER',room:'113',brand:'SAIJO DENKI',model:'CE12SUPER32SWG1/SWG',sn:'2307C01011440',warranty:'ประกันคอมเพรสเซอร์ 5 ปี อะไหล่ 2 ปี',installed:''},
    {id:9,cat:'AIR CONDITIONER',room:'202',brand:'SAIJO DENKI',model:'CS12TURBO32SW1/TURBO APS R32',sn:'2403C01052753',warranty:'',installed:''},
    {id:10,cat:'AIR CONDITIONER',room:'406',brand:'SAIJO DENKI',model:'CS12TURBO32SW1/TURBO APS R32',sn:'2403C01052535',warranty:'',installed:''},
    {id:11,cat:'AIR CONDITIONER',room:'311',brand:'SAIJO DENKI',model:'CE12SUPER32SWG1/SWG',sn:'2402C01048551',warranty:'',installed:''},
    {id:12,cat:'AIR CONDITIONER',room:'302',brand:'SAIJO DENKI',model:'CE12SUPER32SWG1/SWG',sn:'2405C01059300',warranty:'',installed:''},
    {id:13,cat:'AIR CONDITIONER',room:'306',brand:'SAIJO DENKI',model:'CS12TURBO32SW1/TURBO APS R32',sn:'2404C01056445',warranty:'',installed:''},
    {id:14,cat:'AIR CONDITIONER',room:'OFFICE',brand:'SAIJO DENKI',model:'CE12SUPER32SWG1/SWG',sn:'2405C01060536',warranty:'',installed:''},
    {id:15,cat:'AIR CONDITIONER',room:'205',brand:'SAIJO DENKI',model:'CS12TURBO32SW1/TURBO APS R32',sn:'2310C01031829',warranty:'',installed:''},
    {id:16,cat:'AIR CONDITIONER',room:'203',brand:'SAIJO DENKI',model:'CS12TURBO32SW1/TURBO APS R32',sn:'2310C01031847',warranty:'',installed:''},
    {id:17,cat:'AIR CONDITIONER',room:'—',brand:'CARRIER',model:'38ABF010 (Outdoor)',sn:'44XK13A00617',warranty:'ประกันคอมเพรสเซอร์ 7 ปี อะไหล่ 3 ปี',installed:''},
    {id:18,cat:'AIR CONDITIONER',room:'—',brand:'CARRIER',model:'38ABF010 (Outdoor)',sn:'44AK13A00496',warranty:'',installed:''},
    {id:19,cat:'AIR CONDITIONER',room:'—',brand:'CARRIER',model:'42ABF010 (Indoor)',sn:'44XF14A02197',warranty:'',installed:''},
    {id:20,cat:'AIR CONDITIONER',room:'—',brand:'CARRIER',model:'42ABF010 (Indoor)',sn:'44AF14A02052',warranty:'',installed:''},
    {id:21,cat:'AIR CONDITIONER',room:'OFFICE',brand:'MITSUBISHI',model:'SRC 19 CNS-S',sn:'151904002',warranty:'ประกันคอมเพรสเซอร์ 5 ปี อะไหล่ 3 ปี',installed:''},
    {id:22,cat:'AIR CONDITIONER',room:'300',brand:'MITSUBISHI',model:'MUY-JP15VF',sn:'8010924T',warranty:'ไม่พบใบรับประกัน',installed:''},
    {id:23,cat:'AIR CONDITIONER',room:'300',brand:'MITSUBISHI',model:'MUY-GN18VF',sn:'8010649T',warranty:'ไม่พบใบรับประกัน',installed:''},
    {id:24,cat:'WATER HEATER',room:'113',brand:'RINNAI',model:'ECO350',sn:'22120591',warranty:'',installed:''},
    {id:25,cat:'WATER HEATER',room:'214',brand:'RINNAI',model:'ECO350',sn:'221020559',warranty:'',installed:''},
    {id:26,cat:'WATER HEATER',room:'—',brand:'MEX',model:'COCO 350(SBA)',sn:'22075300941',warranty:'รับประกันสินค้า 2 ปี / หม้อต้มทองแดง 5 ปี',installed:''},
    {id:27,cat:'WATER HEATER',room:'—',brand:'MEX',model:'COCO 350(SBB)',sn:'23085500029',warranty:'',installed:''},
    {id:28,cat:'WATER HEATER',room:'—',brand:'MEX',model:'COCO 350(SBB)',sn:'23085500217',warranty:'',installed:''},
    {id:29,cat:'WATER HEATER',room:'—',brand:'MEX',model:'COCO 350(SBB)',sn:'23085500289',warranty:'',installed:''},
    {id:30,cat:'WATER HEATER',room:'300',brand:'STIEBEL ELTRON',model:'IS35',sn:'ZE1306180148736',warranty:'รับประกันหม้อต้ม 5 ปี อะไหล่ไฟฟ้า 2 ปี',installed:''},
    {id:31,cat:'MICROWAVE',room:'113',brand:'SHARP',model:'R-200W',sn:'211412774',warranty:'หมดประกัน 31/02/67',installed:''},
    {id:32,cat:'MICROWAVE',room:'—',brand:'TOSHIBA',model:'L1711205',sn:'547700000FG39121200518',warranty:'รับประกัน 1 ปี',installed:''},
    {id:33,cat:'MICROWAVE',room:'—',brand:'TOSHIBA',model:'L1711205',sn:'547700000FG39121200631',warranty:'',installed:''},
    {id:34,cat:'MICROWAVE',room:'—',brand:'TOSHIBA',model:'MW2-MM24PC(BK)',sn:'725766',warranty:'',installed:''},
    {id:35,cat:'MICROWAVE',room:'MY CONDO',brand:'TOSHIBA',model:'J1005101',sn:'547700000FG34171201658',warranty:'',installed:''},
    {id:36,cat:'MICROWAVE',room:'214',brand:'TOSHIBA',model:'MWP-MM20P(WH)',sn:'1607000061329',warranty:'',installed:''},
    {id:37,cat:'MICROWAVE',room:'205',brand:'TOSHIBA',model:'MWP-MM20P(WH)',sn:'16070000B62843',warranty:'',installed:''},
    {id:38,cat:'TV',room:'108',brand:'TCL',model:'65P615',sn:'2007ALU152755A00170',warranty:'รับประกัน 3 ปี',installed:''},
    {id:39,cat:'TV',room:'113',brand:'WEYON',model:'32F2',sn:'',warranty:'',installed:''},
    {id:40,cat:'TV',room:'205',brand:'BODA',model:'BD3288',sn:'2024011614',warranty:'',installed:''},
    {id:41,cat:'REFRIGERATOR',room:'113',brand:'TOSHIBA',model:'GR-A704CX',sn:'1939712200103',warranty:'',installed:''},
    {id:42,cat:'REFRIGERATOR',room:'214',brand:'Midea',model:'K57050 01 HS-65LN',sn:'3100008G-3626-1120112',warranty:'',installed:''},
    {id:43,cat:'REFRIGERATOR',room:'205',brand:'Midea',model:'K90230 01 HS-65LN',sn:'3100008G-3902-1120368',warranty:'',installed:''},
    {id:44,cat:'PHOTOCOPIER',room:'OFFICE',brand:'CANNON',model:'MF635Cx',sn:'WTY14984',warranty:'รับประกัน 3 ปี',installed:''},
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold mb-4 text-gray-800">{title}</h3>
        <div className="space-y-3">{children}</div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm text-gray-600 hover:bg-gray-50 transition">ยกเลิก</button>
          <button onClick={onSave}  className="px-5 py-2 rounded-xl bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition">บันทึก</button>
        </div>
      </div>
    </div>
  );

  const Field = ({label,children}:{label:string;children:React.ReactNode}) => (
    <div><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>
  );

  const typeOpts = ['รถยนต์','รถมอเตอร์ไซต์','แท็กซี่','จักรยานยนต์'];

  return (
    <div>
      {sectionNav([
        {key:'stock',      label:'Stock',        emoji:'📦'},
        {key:'parking-in', label:'Car · In',      emoji:'🚗'},
        {key:'parking-out',label:'Car · Out',     emoji:'🅿️'},
        {key:'warranty',   label:'Warranty',      emoji:'🛡️'},
      ])}

      {/* ── STOCK ── */}
      {section==='stock' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2 min-w-0">
              <span className="truncate">Stock</span>
              <span className="ml-1 text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">{stockData.length} รายการ</span>
            </h2>
            <button onClick={()=>setShowStockModal(true)} className={btnAdd}>+ เพิ่มรายการ</button>
          </div>
          <div className="overflow-x-auto rounded-2xl border shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['#','ชื่อของใช้','จำนวน','ขั้นต่ำ','หน่วย','หมายเหตุ',''].map(h=>(
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
                      {isLow && <span className="mr-1">🔴</span>}{r.name}
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
                    <td className="px-3 py-2 text-xs text-gray-400">{r.minQty !== undefined ? `≥ ${r.minQty}` : ''}</td>
                    <td className="px-3 py-2 text-gray-500">{r.unit}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{r.note}</td>
                    <td className="px-3 py-2"><button onClick={()=>delStock(r.id)} className={btnDel}>ลบ</button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showStockModal && (
            <Modal title="เพิ่มของใช้" onClose={()=>setShowStockModal(false)} onSave={addStock}>
              <Field label="ชื่อของใช้"><input className={inputCls} value={newStock.name} onChange={e=>setNewStock(p=>({...p,name:e.target.value}))} placeholder="เช่น สบู่"/></Field>
              <Field label="จำนวน"><input className={inputCls} type="number" value={newStock.qty} onChange={e=>setNewStock(p=>({...p,qty:+e.target.value}))} /></Field>
              <Field label="หน่วยนับ"><input className={inputCls} value={newStock.unit} onChange={e=>setNewStock(p=>({...p,unit:e.target.value}))} placeholder="เช่น ขวด"/></Field>
              <Field label="หมายเหตุ"><input className={inputCls} value={newStock.note} onChange={e=>setNewStock(p=>({...p,note:e.target.value}))} /></Field>
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
              <span className="ml-1 text-xs font-normal bg-green-100 text-green-700 px-2 py-0.5 rounded-full whitespace-nowrap">{parkingIn.length} คัน</span>
            </h2>
            <button onClick={()=>setShowPIModal(true)} className={btnAdd}>+ เพิ่มรายการ</button>
          </div>
          <div className="overflow-x-auto rounded-2xl border shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['#','ห้อง','ทะเบียน','ประเภท','ชื่อ','สถานะ',''].map(h=>(
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {parkingIn.map((r,i)=>(
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                    <td className="px-3 py-2 text-gray-400 text-xs">{i+1}</td>
                    <td className="px-3 py-2"><span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg text-xs font-medium">ห้อง {r.room}</span></td>
                    <td className="px-3 py-2 font-semibold">{r.plate}</td>
                    <td className="px-3 py-2 text-gray-500">{r.type||'—'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.name||'—'}</td>
                    <td className="px-3 py-2">
                      {r.status==='OK'
                        ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">OK</span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2"><button onClick={()=>delParkIn(r.id)} className={btnDel}>ลบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showPIModal && (
            <Modal title="เพิ่มรถผู้เช่าในตึก" onClose={()=>setShowPIModal(false)} onSave={addParkIn}>
              <Field label="เลขห้อง"><input className={inputCls} value={newPI.room} onChange={e=>setNewPI(p=>({...p,room:e.target.value}))} placeholder="205"/></Field>
              <Field label="ทะเบียนรถ"><input className={inputCls} value={newPI.plate} onChange={e=>setNewPI(p=>({...p,plate:e.target.value}))} placeholder="บธ1234"/></Field>
              <Field label="ประเภท">
                <select className={inputCls} value={newPI.type} onChange={e=>setNewPI(p=>({...p,type:e.target.value}))}>
                  <option value="">—</option>{typeOpts.map(o=><option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="ชื่อผู้ทำสัญญา"><input className={inputCls} value={newPI.name} onChange={e=>setNewPI(p=>({...p,name:e.target.value}))} /></Field>
              <Field label="สถานะ">
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
              <span className="ml-1 text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">{parkingOut.length} คัน</span>
            </h2>
            <button onClick={()=>setShowPOModal(true)} className={btnAdd}>+ เพิ่มรายการ</button>
          </div>
          <div className="overflow-x-auto rounded-2xl border shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['#','ทะเบียน','ประเภท','ชื่อ','สถานะ',''].map(h=>(
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
                    <td className="px-3 py-2"><button onClick={()=>delParkOut(r.id)} className={btnDel}>ลบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showPOModal && (
            <Modal title="เพิ่มรถผู้เช่าภายนอก" onClose={()=>setShowPOModal(false)} onSave={addParkOut}>
              <Field label="ทะเบียนรถ"><input className={inputCls} value={newPO.plate} onChange={e=>setNewPO(p=>({...p,plate:e.target.value}))} placeholder="บธ1234"/></Field>
              <Field label="ประเภท">
                <select className={inputCls} value={newPO.type} onChange={e=>setNewPO(p=>({...p,type:e.target.value}))}>
                  <option value="">—</option>{typeOpts.map(o=><option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="ชื่อผู้ทำสัญญา"><input className={inputCls} value={newPO.name} onChange={e=>setNewPO(p=>({...p,name:e.target.value}))} /></Field>
              <Field label="สถานะ">
                <select className={inputCls} value={newPO.status} onChange={e=>setNewPO(p=>({...p,status:e.target.value}))}>
                  <option value="">—</option><option value="OK">OK</option>
                </select>
              </Field>
            </Modal>
          )}
        </div>
      )}

      {/* ── WARRANTY ── */}
      {section==='warranty' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2 min-w-0">
              <span className="truncate">Warranty</span>
              <span className="ml-1 text-xs font-normal bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full whitespace-nowrap">{warrantyData.length} รายการ</span>
            </h2>
            <button onClick={()=>setShowWModal(true)} className={btnAdd}>+ เพิ่มรายการ</button>
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
                <tr>{['#','ห้อง','แบรนด์','รุ่น','Serial No.','การรับประกัน','วันติดตั้ง',''].map(h=>(
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
                    <td className="px-3 py-2"><button onClick={()=>delWarranty(r.id)} className={btnDel}>ลบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showWModal && (
            <Modal title="เพิ่มรายการรับประกัน" onClose={()=>setShowWModal(false)} onSave={addWarranty}>
              <Field label="หมวดหมู่">
                <select className={inputCls} value={newW.cat} onChange={e=>setNewW(p=>({...p,cat:e.target.value as WCat}))}>
                  {W_CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="ห้อง"><input className={inputCls} value={newW.room} onChange={e=>setNewW(p=>({...p,room:e.target.value}))} placeholder="เช่น 205, OFFICE"/></Field>
              <Field label="แบรนด์"><input className={inputCls} value={newW.brand} onChange={e=>setNewW(p=>({...p,brand:e.target.value}))} /></Field>
              <Field label="รุ่น (Model)"><input className={inputCls} value={newW.model} onChange={e=>setNewW(p=>({...p,model:e.target.value}))} /></Field>
              <Field label="Serial No."><input className={inputCls} value={newW.sn} onChange={e=>setNewW(p=>({...p,sn:e.target.value}))} /></Field>
              <Field label="การรับประกัน"><input className={inputCls} value={newW.warranty} onChange={e=>setNewW(p=>({...p,warranty:e.target.value}))} placeholder="เช่น ประกัน 5 ปี"/></Field>
              <Field label="วันติดตั้ง"><input className={inputCls} type="date" onChange={e=>setNewW(p=>({...p,installed:e.target.value}))} /></Field>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}
