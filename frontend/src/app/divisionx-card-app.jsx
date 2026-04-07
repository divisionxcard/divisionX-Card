import { useState, useMemo } from "react"
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts"
import {
  Package, TrendingUp, ShoppingCart, AlertTriangle,
  PlusCircle, MinusCircle, BarChart2, Home, Menu, X,
  CheckCircle, Clock, ChevronDown, Search, RefreshCw, ArrowUpCircle
} from "lucide-react"

// ─────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────
const MACHINES = [
  { machine_id: "machine_1", name: "ตู้ที่ 1", location: "ชั้น 1 โซน A", status: "active" },
  { machine_id: "machine_2", name: "ตู้ที่ 2", location: "ชั้น 1 โซน B", status: "active" },
  { machine_id: "machine_3", name: "ตู้ที่ 3", location: "ชั้น 2 โซน C", status: "active" },
]

const SKUS = [
  { sku_id:"OP 01",  name:"One Piece OP-01",  series:"OP",  packs_per_box:12, sell_price:60,  cost_price:42 },
  { sku_id:"OP 02",  name:"One Piece OP-02",  series:"OP",  packs_per_box:12, sell_price:60,  cost_price:42 },
  { sku_id:"OP 03",  name:"One Piece OP-03",  series:"OP",  packs_per_box:12, sell_price:60,  cost_price:42 },
  { sku_id:"OP 04",  name:"One Piece OP-04",  series:"OP",  packs_per_box:12, sell_price:65,  cost_price:45 },
  { sku_id:"OP 05",  name:"One Piece OP-05",  series:"OP",  packs_per_box:12, sell_price:65,  cost_price:45 },
  { sku_id:"OP 06",  name:"One Piece OP-06",  series:"OP",  packs_per_box:12, sell_price:65,  cost_price:45 },
  { sku_id:"OP 07",  name:"One Piece OP-07",  series:"OP",  packs_per_box:12, sell_price:70,  cost_price:48 },
  { sku_id:"OP 08",  name:"One Piece OP-08",  series:"OP",  packs_per_box:12, sell_price:70,  cost_price:48 },
  { sku_id:"OP 09",  name:"One Piece OP-09",  series:"OP",  packs_per_box:12, sell_price:70,  cost_price:48 },
  { sku_id:"OP 10",  name:"One Piece OP-10",  series:"OP",  packs_per_box:12, sell_price:70,  cost_price:48 },
  { sku_id:"OP 11",  name:"One Piece OP-11",  series:"OP",  packs_per_box:12, sell_price:75,  cost_price:52 },
  { sku_id:"OP 12",  name:"One Piece OP-12",  series:"OP",  packs_per_box:12, sell_price:75,  cost_price:52 },
  { sku_id:"OP 13",  name:"One Piece OP-13",  series:"OP",  packs_per_box:12, sell_price:75,  cost_price:52 },
  { sku_id:"OP 14",  name:"One Piece OP-14",  series:"OP",  packs_per_box:12, sell_price:80,  cost_price:55 },
  { sku_id:"OP 15",  name:"One Piece OP-15",  series:"OP",  packs_per_box:12, sell_price:80,  cost_price:55 },
  { sku_id:"PRB 01", name:"Premium Booster 01", series:"PRB", packs_per_box:10, sell_price:150, cost_price:110 },
  { sku_id:"PRB 02", name:"Premium Booster 02", series:"PRB", packs_per_box:10, sell_price:180, cost_price:130 },
  { sku_id:"EB 01",  name:"Extra Booster 01",  series:"EB",  packs_per_box:12, sell_price:120, cost_price:85  },
  { sku_id:"EB 02",  name:"Extra Booster 02",  series:"EB",  packs_per_box:12, sell_price:120, cost_price:85  },
  { sku_id:"EB 03",  name:"Extra Booster 03",  series:"EB",  packs_per_box:12, sell_price:130, cost_price:90  },
  { sku_id:"EB 04",  name:"Extra Booster 04",  series:"EB",  packs_per_box:12, sell_price:130, cost_price:90  },
]

const SERIES_COLOR = { OP: "#3b82f6", PRB: "#8b5cf6", EB: "#10b981" }
const CHART_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4"]

// Initial stock_in mock data
const INIT_STOCK_IN = [
  { id:1, sku_id:"OP 01",  source:"ตัวแทนจำหน่าย A", unit:"cotton", quantity:2, quantity_packs:288, unit_cost:6048,  total_cost:12096, purchased_at:"2026-03-01", note:"" },
  { id:2, sku_id:"OP 05",  source:"ตัวแทนจำหน่าย A", unit:"cotton", quantity:1, quantity_packs:144, unit_cost:6480,  total_cost:6480,  purchased_at:"2026-03-01", note:"" },
  { id:3, sku_id:"PRB 01", source:"ตัวแทนจำหน่าย B", unit:"box",    quantity:3, quantity_packs:30,  unit_cost:1100,  total_cost:3300,  purchased_at:"2026-03-05", note:"" },
  { id:4, sku_id:"EB 01",  source:"ตัวแทนจำหน่าย A", unit:"box",    quantity:6, quantity_packs:72,  unit_cost:1020,  total_cost:6120,  purchased_at:"2026-03-10", note:"" },
  { id:5, sku_id:"OP 10",  source:"ตัวแทนจำหน่าย C", unit:"cotton", quantity:1, quantity_packs:144, unit_cost:6912,  total_cost:6912,  purchased_at:"2026-03-15", note:"" },
  { id:6, sku_id:"OP 14",  source:"ตัวแทนจำหน่าย A", unit:"box",    quantity:4, quantity_packs:48,  unit_cost:660,   total_cost:2640,  purchased_at:"2026-03-20", note:"" },
  { id:7, sku_id:"PRB 02", source:"ตัวแทนจำหน่าย B", unit:"box",    quantity:2, quantity_packs:20,  unit_cost:1300,  total_cost:2600,  purchased_at:"2026-03-22", note:"" },
  { id:8, sku_id:"EB 03",  source:"ตัวแทนจำหน่าย A", unit:"box",    quantity:5, quantity_packs:60,  unit_cost:1080,  total_cost:5400,  purchased_at:"2026-03-28", note:"" },
  { id:9, sku_id:"OP 01",  source:"ตัวแทนจำหน่าย A", unit:"box",    quantity:6, quantity_packs:72,  unit_cost:504,   total_cost:3024,  purchased_at:"2026-04-01", note:"ล็อตใหม่" },
  { id:10, sku_id:"OP 07", source:"ตัวแทนจำหน่าย C", unit:"cotton", quantity:1, quantity_packs:144, unit_cost:6912,  total_cost:6912,  purchased_at:"2026-04-03", note:"" },
]

const INIT_STOCK_OUT = [
  { id:1, sku_id:"OP 01",  machine_id:"machine_1", quantity_packs:48, withdrawn_at:"2026-03-02", note:"เติมตู้รอบเปิดเดือน" },
  { id:2, sku_id:"OP 01",  machine_id:"machine_2", quantity_packs:36, withdrawn_at:"2026-03-02", note:"" },
  { id:3, sku_id:"OP 05",  machine_id:"machine_1", quantity_packs:24, withdrawn_at:"2026-03-03", note:"" },
  { id:4, sku_id:"PRB 01", machine_id:"machine_2", quantity_packs:10, withdrawn_at:"2026-03-06", note:"" },
  { id:5, sku_id:"EB 01",  machine_id:"machine_3", quantity_packs:36, withdrawn_at:"2026-03-11", note:"" },
  { id:6, sku_id:"OP 10",  machine_id:"machine_1", quantity_packs:48, withdrawn_at:"2026-03-16", note:"" },
  { id:7, sku_id:"OP 14",  machine_id:"machine_3", quantity_packs:24, withdrawn_at:"2026-03-21", note:"" },
  { id:8, sku_id:"OP 01",  machine_id:"machine_1", quantity_packs:36, withdrawn_at:"2026-04-02", note:"เติมเพิ่ม" },
  { id:9, sku_id:"OP 07",  machine_id:"machine_2", quantity_packs:48, withdrawn_at:"2026-04-04", note:"" },
]

// Mock sales (last 7 days)
const genSales = () => {
  const rows = []
  let id = 1
  const days = ["04-01","04-02","04-03","04-04","04-05","04-06","04-07"]
  const topSkus = ["OP 01","OP 05","OP 07","PRB 01","EB 01","OP 10","PRB 02","EB 03","OP 14","OP 04"]
  days.forEach(d => {
    MACHINES.forEach(m => {
      topSkus.forEach(skuId => {
        const sku = SKUS.find(s => s.sku_id === skuId)
        const qty = Math.floor(Math.random()*8) + 1
        rows.push({ id: id++, machine_id: m.machine_id, sku_id: skuId,
          quantity_sold: qty, revenue: qty * sku.sell_price,
          sold_at: `2026-${d}` })
      })
    })
  })
  return rows
}
const INIT_SALES = genSales()

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const fmt = (n) => n?.toLocaleString("th-TH") ?? "0"
const fmtB = (n) => `฿${(n??0).toLocaleString("th-TH")}`
const today = () => new Date().toISOString().slice(0,10)

function calcBalance(stockIn, stockOut) {
  const map = {}
  stockIn.forEach(r => { map[r.sku_id] = (map[r.sku_id]||0) + r.quantity_packs })
  stockOut.forEach(r => { map[r.sku_id] = (map[r.sku_id]||0) - r.quantity_packs })
  return map
}

function convertToPacks(qty, unit, sku) {
  if (unit === "pack")   return qty
  if (unit === "box")    return qty * sku.packs_per_box
  if (unit === "cotton") return qty * 12 * sku.packs_per_box
  return qty
}

// ─────────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────────
function Badge({ series }) {
  const c = { OP:"bg-blue-100 text-blue-700", PRB:"bg-purple-100 text-purple-700", EB:"bg-emerald-100 text-emerald-700" }
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${c[series]}`}>{series}</span>
}

function StatusDot({ status }) {
  return <span className={`inline-block w-2 h-2 rounded-full mr-1 ${status==="active"?"bg-green-500":"bg-gray-400"}`}/>
}

// ─────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color }) {
  const bg = { blue:"bg-blue-50 text-blue-600", green:"bg-green-50 text-green-600",
               purple:"bg-purple-50 text-purple-600", amber:"bg-amber-50 text-amber-600" }
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex gap-4 items-start">
      <div className={`rounded-xl p-3 ${bg[color]}`}><Icon size={22}/></div>
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGES
// ─────────────────────────────────────────────

// ── 1. DASHBOARD ──────────────────────────────
function PageDashboard({ stockIn, stockOut, sales }) {
  const balance = calcBalance(stockIn, stockOut)
  const totalPacks = Object.values(balance).reduce((a,b)=>a+b,0)
  const lowStock = SKUS.filter(s => (balance[s.sku_id]||0) < 24)
  const todaySales = sales.filter(r => r.sold_at === "2026-04-07")
  const todayRevenue = todaySales.reduce((a,r)=>a+r.revenue,0)
  const todayQty = todaySales.reduce((a,r)=>a+r.quantity_sold,0)

  // Sales by day chart
  const days = ["04-01","04-02","04-03","04-04","04-05","04-06","04-07"]
  const dailyChart = days.map(d => {
    const rows = sales.filter(r=>r.sold_at===`2026-${d}`)
    return {
      day: d.replace("04-",""),
      ยอดขาย: rows.reduce((a,r)=>a+r.revenue,0),
      จำนวนซอง: rows.reduce((a,r)=>a+r.quantity_sold,0),
    }
  })

  // Per-machine today
  const machineToday = MACHINES.map(m => {
    const rows = todaySales.filter(r=>r.machine_id===m.machine_id)
    return { name: m.name, ยอดขาย: rows.reduce((a,r)=>a+r.revenue,0) }
  })

  // Recent stock movements (last 5)
  const recent = [
    ...stockIn.map(r=>({...r, type:"in"})),
    ...stockOut.map(r=>({...r, type:"out"})),
  ].sort((a,b)=>new Date(b.purchased_at||b.withdrawn_at)-new Date(a.purchased_at||a.withdrawn_at)).slice(0,6)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">ภาพรวม Dashboard</h1>
        <p className="text-sm text-gray-400">อัปเดตล่าสุด: {today()}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={TrendingUp}   label="ยอดขายวันนี้"   value={fmtB(todayRevenue)}  sub={`${fmt(todayQty)} ซอง`} color="green"/>
        <KpiCard icon={Package}      label="สต็อกคงเหลือ"   value={`${fmt(totalPacks)} ซอง`} sub={`${SKUS.length} SKU`} color="blue"/>
        <KpiCard icon={AlertTriangle} label="สต็อกใกล้หมด" value={lowStock.length}      sub="SKU ต่ำกว่า 24 ซอง" color="amber"/>
        <KpiCard icon={ShoppingCart} label="ตู้ที่ใช้งาน"   value={`${MACHINES.filter(m=>m.status==="active").length} ตู้`} sub="จากทั้งหมด 3 ตู้" color="purple"/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Revenue Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ยอดขาย 7 วันล่าสุด (บาท)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyChart} margin={{top:0,right:10,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="day" tick={{fontSize:12}} tickFormatter={v=>`${v} เม.ย.`}/>
              <YAxis tick={{fontSize:11}} tickFormatter={v=>fmt(v)}/>
              <Tooltip formatter={(v)=>[fmtB(v),"ยอดขาย"]}/>
              <Bar dataKey="ยอดขาย" fill="#3b82f6" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Per-machine today */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ยอดขายวันนี้ แยกตู้</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={machineToday} dataKey="ยอดขาย" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                {machineToday.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]}/>)}
              </Pie>
              <Tooltip formatter={(v)=>fmtB(v)}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex gap-3 justify-center mt-2">
            {machineToday.map((m,i)=>(
              <div key={i} className="text-center">
                <div className="text-xs text-gray-500">{m.name}</div>
                <div className="text-sm font-bold" style={{color:CHART_COLORS[i]}}>{fmtB(m.ยอดขาย)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Machine Status & Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Machine Status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3">สถานะตู้จำหน่าย</h2>
          <div className="space-y-3">
            {MACHINES.map(m => {
              const mSales = todaySales.filter(r=>r.machine_id===m.machine_id)
              const mRev = mSales.reduce((a,r)=>a+r.revenue,0)
              const mQty = mSales.reduce((a,r)=>a+r.quantity_sold,0)
              return (
                <div key={m.machine_id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                  <div className="flex items-center gap-2">
                    <StatusDot status={m.status}/>
                    <div>
                      <p className="font-semibold text-sm text-gray-700">{m.name}</p>
                      <p className="text-xs text-gray-400">{m.location}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">{fmtB(mRev)}</p>
                    <p className="text-xs text-gray-400">{fmt(mQty)} ซอง</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500"/> สต็อกใกล้หมด
          </h2>
          {lowStock.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600 text-sm p-3 bg-green-50 rounded-xl">
              <CheckCircle size={16}/> ทุก SKU มีสต็อกเพียงพอ
            </div>
          ) : (
            <div className="space-y-2">
              {lowStock.map(s => (
                <div key={s.sku_id} className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50">
                  <div>
                    <span className="text-xs font-mono font-bold text-amber-700">{s.sku_id}</span>
                    <p className="text-xs text-gray-500">{s.name}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-600">{balance[s.sku_id]||0} ซอง</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Movements */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-3">ความเคลื่อนไหวล่าสุด</h2>
        <div className="space-y-2">
          {recent.map((r,i) => {
            const sku = SKUS.find(s=>s.sku_id===r.sku_id)
            const machine = r.machine_id ? MACHINES.find(m=>m.machine_id===r.machine_id) : null
            const isIn = r.type === "in"
            return (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-1.5 ${isIn?"bg-blue-50 text-blue-500":"bg-orange-50 text-orange-500"}`}>
                    {isIn ? <PlusCircle size={14}/> : <MinusCircle size={14}/>}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      <span className="font-mono text-xs bg-gray-100 px-1 rounded">{r.sku_id}</span>{" "}
                      {isIn ? `รับเข้า — ${r.source}` : `เบิก → ${machine?.name}`}
                    </p>
                    <p className="text-xs text-gray-400">{r.purchased_at || r.withdrawn_at}</p>
                  </div>
                </div>
                <span className={`text-sm font-bold ${isIn?"text-blue-600":"text-orange-500"}`}>
                  {isIn?"+":"-"}{fmt(r.quantity_packs)} ซอง
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── 2. STOCK ──────────────────────────────────
function PageStock({ stockIn, stockOut, onAddStockIn }) {
  const [tab, setTab] = useState("balance")
  const [search, setSearch] = useState("")
  const [form, setForm] = useState({ sku_id:"OP 01", source:"", unit:"box", quantity:"1", unit_cost:"", note:"" })
  const [toast, setToast] = useState(null)
  const balance = calcBalance(stockIn, stockOut)

  const filtered = SKUS.filter(s =>
    s.sku_id.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const showToast = (msg, type="success") => {
    setToast({msg,type})
    setTimeout(()=>setToast(null), 3000)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.source || !form.quantity || !form.unit_cost) {
      showToast("กรุณากรอกข้อมูลให้ครบถ้วน", "error"); return
    }
    const sku = SKUS.find(s=>s.sku_id===form.sku_id)
    const qty = parseInt(form.quantity)
    const packs = convertToPacks(qty, form.unit, sku)
    const cost = parseFloat(form.unit_cost)
    onAddStockIn({
      id: Date.now(),
      sku_id: form.sku_id,
      source: form.source,
      unit: form.unit,
      quantity: qty,
      quantity_packs: packs,
      unit_cost: cost,
      total_cost: qty * cost,
      purchased_at: today(),
      note: form.note,
    })
    showToast(`บันทึกสำเร็จ: เพิ่ม ${packs} ซอง (${form.sku_id})`)
    setForm({ sku_id:"OP 01", source:"", unit:"box", quantity:"1", unit_cost:"", note:"" })
  }

  const seriesFilter = ["ทั้งหมด","OP","PRB","EB"]
  const [seriesSel, setSeriesSel] = useState("ทั้งหมด")
  const visibleSkus = filtered.filter(s => seriesSel==="ทั้งหมด" || s.series===seriesSel)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">จัดการสต็อกสินค้า</h1>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error" ? <X size={16}/> : <CheckCircle size={16}/>} {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[{key:"balance",label:"สต็อกคงเหลือ"},{key:"addin",label:"รับสินค้าเข้า"},{key:"history",label:"ประวัติการรับ"}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab===t.key?"bg-white shadow text-blue-600":"text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Balance ── */}
      {tab === "balance" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="ค้นหา SKU..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <div className="flex gap-1">
              {seriesFilter.map(s=>(
                <button key={s} onClick={()=>setSeriesSel(s)}
                  className={`px-3 py-2 text-xs rounded-lg font-medium transition-all ${seriesSel===s?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs text-gray-400 font-medium">SKU</th>
                  <th className="text-left py-2 text-xs text-gray-400 font-medium">ชื่อสินค้า</th>
                  <th className="text-center py-2 text-xs text-gray-400 font-medium">Series</th>
                  <th className="text-right py-2 text-xs text-gray-400 font-medium">รับเข้า</th>
                  <th className="text-right py-2 text-xs text-gray-400 font-medium">เบิกออก</th>
                  <th className="text-right py-2 text-xs text-gray-400 font-medium">คงเหลือ</th>
                  <th className="text-right py-2 text-xs text-gray-400 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {visibleSkus.map(s => {
                  const inTotal = stockIn.filter(r=>r.sku_id===s.sku_id).reduce((a,r)=>a+r.quantity_packs,0)
                  const outTotal = stockOut.filter(r=>r.sku_id===s.sku_id).reduce((a,r)=>a+r.quantity_packs,0)
                  const bal = (balance[s.sku_id]||0)
                  const low = bal < 24
                  return (
                    <tr key={s.sku_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 font-mono text-xs font-bold text-gray-700">{s.sku_id}</td>
                      <td className="py-2.5 text-gray-600">{s.name}</td>
                      <td className="py-2.5 text-center"><Badge series={s.series}/></td>
                      <td className="py-2.5 text-right text-blue-600 font-medium">+{fmt(inTotal)}</td>
                      <td className="py-2.5 text-right text-orange-500 font-medium">-{fmt(outTotal)}</td>
                      <td className="py-2.5 text-right font-bold text-gray-800">{fmt(bal)}</td>
                      <td className="py-2.5 text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${low?"bg-amber-100 text-amber-700":"bg-green-100 text-green-700"}`}>
                          {low ? "⚠️ ใกล้หมด" : "✓ ปกติ"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Add Stock In ── */}
      {tab === "addin" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 max-w-lg">
          <h2 className="font-semibold text-gray-700 mb-4">บันทึกรับสินค้าเข้าสต็อก</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">SKU</label>
              <select value={form.sku_id} onChange={e=>setForm({...form,sku_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                {SKUS.map(s=><option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">แหล่งที่มา / Supplier</label>
              <input value={form.source} onChange={e=>setForm({...form,source:e.target.value})}
                placeholder="เช่น ตัวแทนจำหน่าย A"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">หน่วย</label>
                <select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="pack">ซอง (Pack)</option>
                  <option value="box">กล่อง (Box)</option>
                  <option value="cotton">Cotton</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">จำนวน</label>
                <input type="number" min="1" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>
            </div>
            {/* Preview packs */}
            {form.quantity && (
              <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
                จะได้ <span className="font-bold">
                  {fmt(convertToPacks(parseInt(form.quantity)||0, form.unit, SKUS.find(s=>s.sku_id===form.sku_id)))}
                </span> ซอง
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">ราคาต่อหน่วย (บาท)</label>
              <input type="number" min="0" value={form.unit_cost} onChange={e=>setForm({...form,unit_cost:e.target.value})}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">หมายเหตุ (ไม่บังคับ)</label>
              <input value={form.note} onChange={e=>setForm({...form,note:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              <PlusCircle size={16}/> บันทึกรับสินค้า
            </button>
          </form>
        </div>
      )}

      {/* ── Tab: History ── */}
      {tab === "history" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3">ประวัติการรับสินค้าเข้า</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["วันที่","SKU","แหล่งที่มา","หน่วย","จำนวน","ซอง","ราคา/หน่วย","รวม","หมายเหตุ"].map(h=>(
                    <th key={h} className="text-left py-2 text-xs text-gray-400 font-medium pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...stockIn].reverse().map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-3 text-gray-500 text-xs">{r.purchased_at}</td>
                    <td className="py-2 pr-3 font-mono font-bold text-xs text-gray-700">{r.sku_id}</td>
                    <td className="py-2 pr-3 text-gray-600">{r.source}</td>
                    <td className="py-2 pr-3 text-gray-500">{r.unit}</td>
                    <td className="py-2 pr-3 text-right font-medium">{fmt(r.quantity)}</td>
                    <td className="py-2 pr-3 text-right text-blue-600 font-bold">+{fmt(r.quantity_packs)}</td>
                    <td className="py-2 pr-3 text-right text-gray-600">{fmtB(r.unit_cost)}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{fmtB(r.total_cost)}</td>
                    <td className="py-2 text-gray-400 text-xs">{r.note||"-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 3. WITHDRAWAL ─────────────────────────────
function PageWithdrawal({ stockIn, stockOut, onAddStockOut }) {
  const [form, setForm] = useState({ sku_id:"OP 01", machine_id:"machine_1", quantity_packs:"12", note:"" })
  const [toast, setToast] = useState(null)
  const balance = calcBalance(stockIn, stockOut)

  const showToast = (msg, type="success") => {
    setToast({msg,type}); setTimeout(()=>setToast(null), 3000)
  }

  const available = balance[form.sku_id] || 0

  const handleSubmit = (e) => {
    e.preventDefault()
    const qty = parseInt(form.quantity_packs)
    if (!qty || qty <= 0) { showToast("กรุณาระบุจำนวนที่ถูกต้อง","error"); return }
    if (qty > available) {
      showToast(`สต็อกไม่เพียงพอ: คงเหลือ ${available} ซอง แต่ต้องการ ${qty} ซอง`,"error"); return
    }
    onAddStockOut({ id: Date.now(), ...form, quantity_packs: qty, withdrawn_at: today() })
    showToast(`เบิกสำเร็จ: ${form.sku_id} → ${MACHINES.find(m=>m.machine_id===form.machine_id)?.name} ${qty} ซอง`)
    setForm({...form, quantity_packs:"12", note:""})
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">เบิกสินค้าเติมตู้</h1>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error"?<X size={16}/>:<CheckCircle size={16}/>} {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">บันทึกการเบิกสินค้า</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">SKU ที่ต้องการเบิก</label>
              <select value={form.sku_id} onChange={e=>setForm({...form,sku_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                {SKUS.map(s=><option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
              </select>
            </div>

            {/* Stock indicator */}
            <div className={`p-3 rounded-xl text-sm flex items-center justify-between ${available < 24 ? "bg-amber-50 text-amber-700":"bg-green-50 text-green-700"}`}>
              <span>สต็อกคงเหลือ ({form.sku_id})</span>
              <span className="font-bold">{fmt(available)} ซอง</span>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">ปลายทาง (ตู้)</label>
              <div className="grid grid-cols-3 gap-2">
                {MACHINES.map(m => (
                  <button type="button" key={m.machine_id}
                    onClick={()=>setForm({...form, machine_id:m.machine_id})}
                    className={`py-3 rounded-xl text-sm font-medium border-2 transition-all ${form.machine_id===m.machine_id?"border-orange-400 bg-orange-50 text-orange-700":"border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                    <div>{m.name}</div>
                    <div className="text-xs text-gray-400">{m.location}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">จำนวนซอง</label>
              <input type="number" min="1" max={available} value={form.quantity_packs}
                onChange={e=>setForm({...form,quantity_packs:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
              {parseInt(form.quantity_packs) > available && (
                <p className="text-xs text-red-500 mt-1">⚠️ เกินจำนวนสต็อกที่มี ({available} ซอง)</p>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">หมายเหตุ (ไม่บังคับ)</label>
              <input value={form.note} onChange={e=>setForm({...form,note:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
            </div>

            <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              <ArrowUpCircle size={16}/> บันทึกการเบิก
            </button>
          </form>
        </div>

        {/* Withdrawal History */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3">ประวัติการเบิกสินค้า</h2>
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {[...stockOut].reverse().map(r => {
              const sku = SKUS.find(s=>s.sku_id===r.sku_id)
              const machine = MACHINES.find(m=>m.machine_id===r.machine_id)
              return (
                <div key={r.id} className="p-3 rounded-xl bg-gray-50 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-gray-700">{r.sku_id}</span>
                      <Badge series={sku?.series||"OP"}/>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      → <span className="font-medium text-orange-600">{machine?.name}</span>
                      {r.note && <span className="ml-2 text-gray-400">({r.note})</span>}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Clock size={10}/> {r.withdrawn_at}
                    </p>
                  </div>
                  <span className="text-orange-500 font-bold text-sm">-{fmt(r.quantity_packs)} ซอง</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 4. SALES ──────────────────────────────────
function PageSales({ sales }) {
  const [viewMode, setViewMode] = useState("daily")
  const [machineSel, setMachineSel] = useState("all")

  const filtered = machineSel === "all" ? sales : sales.filter(r=>r.machine_id===machineSel)

  // Daily chart
  const days = ["04-01","04-02","04-03","04-04","04-05","04-06","04-07"]
  const dailyData = days.map(d => {
    const row = { day: d.slice(3) + " เม.ย." }
    MACHINES.forEach(m => {
      const rows = sales.filter(r=>r.sold_at===`2026-${d}` && r.machine_id===m.machine_id)
      row[m.name] = rows.reduce((a,r)=>a+r.revenue, 0)
    })
    return row
  })

  // Monthly summary (April 2026)
  const totalRev = filtered.reduce((a,r)=>a+r.revenue,0)
  const totalQty = filtered.reduce((a,r)=>a+r.quantity_sold,0)

  // Top SKUs this month
  const skuMap = {}
  filtered.forEach(r => {
    if (!skuMap[r.sku_id]) skuMap[r.sku_id] = {qty:0, rev:0}
    skuMap[r.sku_id].qty += r.quantity_sold
    skuMap[r.sku_id].rev += r.revenue
  })
  const topSkus = Object.entries(skuMap).sort((a,b)=>b[1].rev-a[1].rev).slice(0,8)
    .map(([id, v]) => ({ sku_id: id, ...v }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">ยอดขาย</h1>
        <div className="flex gap-2 flex-wrap">
          <select value={machineSel} onChange={e=>setMachineSel(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="all">ทุกตู้</option>
            {MACHINES.map(m=><option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
          </select>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"daily",l:"รายวัน"},{v:"monthly",l:"รายเดือน"}].map(t=>(
              <button key={t.v} onClick={()=>setViewMode(t.v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <p className="text-xs text-gray-400">ยอดขายรวม (เม.ย.)</p>
          <p className="text-xl font-bold text-green-600 mt-1">{fmtB(totalRev)}</p>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <p className="text-xs text-gray-400">จำนวนซองที่ขาย</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{fmt(totalQty)} ซอง</p>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <p className="text-xs text-gray-400">เฉลี่ยต่อวัน</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{fmtB(Math.round(totalRev/7))}</p>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <p className="text-xs text-gray-400">กำไรโดยประมาณ</p>
          <p className="text-xl font-bold text-amber-600 mt-1">
            {fmtB(filtered.reduce((a,r) => {
              const s = SKUS.find(sk=>sk.sku_id===r.sku_id)
              return a + r.quantity_sold*(s?s.sell_price-s.cost_price:0)
            },0))}
          </p>
        </div>
      </div>

      {/* Daily Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-4">ยอดขายรายวัน แยกตู้ (บาท)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dailyData} margin={{top:0,right:10,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
            <XAxis dataKey="day" tick={{fontSize:11}}/>
            <YAxis tick={{fontSize:11}} tickFormatter={v=>fmt(v)}/>
            <Tooltip formatter={(v)=>fmtB(v)}/>
            <Legend/>
            {MACHINES.map((m,i) => (
              <Bar key={m.machine_id} dataKey={m.name} fill={CHART_COLORS[i]} radius={[4,4,0,0]} stackId={viewMode==="daily"?undefined:"a"}/>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top SKUs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-4">Top SKU ยอดขายสูงสุด (เม.ย.)</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={topSkus} layout="vertical" margin={{top:0,right:30,left:10,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
            <XAxis type="number" tick={{fontSize:11}} tickFormatter={v=>fmt(v)}/>
            <YAxis type="category" dataKey="sku_id" width={60} tick={{fontSize:11}}/>
            <Tooltip formatter={(v,n)=>[n==="rev"?fmtB(v):fmt(v), n==="rev"?"รายรับ":"ซอง"]}/>
            <Bar dataKey="rev" name="rev" fill="#3b82f6" radius={[0,4,4,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── 5. ANALYTICS ──────────────────────────────
function PageAnalytics({ sales }) {
  const [metric, setMetric] = useState("revenue")

  // SKU totals
  const skuMap = {}
  sales.forEach(r => {
    if (!skuMap[r.sku_id]) skuMap[r.sku_id] = {qty:0, rev:0}
    skuMap[r.sku_id].qty += r.quantity_sold
    skuMap[r.sku_id].rev += r.revenue
  })
  const ranked = Object.entries(skuMap)
    .map(([id,v]) => {
      const s = SKUS.find(sk=>sk.sku_id===id)
      return { sku_id:id, series:s?.series||"OP", ...v,
        profit: v.qty * ((s?.sell_price||0)-(s?.cost_price||0)) }
    })
    .sort((a,b) => metric==="revenue" ? b.rev-a.rev : metric==="qty" ? b.qty-a.qty : b.profit-a.profit)

  // Trend (7 days, top 5 SKUs)
  const top5 = ranked.slice(0,5).map(r=>r.sku_id)
  const days = ["04-01","04-02","04-03","04-04","04-05","04-06","04-07"]
  const trendData = days.map(d => {
    const row = { day: d.slice(3)+" เม.ย." }
    top5.forEach(skuId => {
      const rows = sales.filter(r=>r.sold_at===`2026-${d}` && r.sku_id===skuId)
      row[skuId] = rows.reduce((a,r)=>a+r.quantity_sold,0)
    })
    return row
  })

  // Series breakdown
  const seriesData = ["OP","PRB","EB"].map(s => {
    const rows = sales.filter(r => SKUS.find(sk=>sk.sku_id===r.sku_id)?.series===s)
    return { name: s, ยอดขาย: rows.reduce((a,r)=>a+r.revenue,0), ซอง: rows.reduce((a,r)=>a+r.quantity_sold,0) }
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">วิเคราะห์ยอดขาย SKU</h1>

      {/* Series Overview */}
      <div className="grid grid-cols-3 gap-4">
        {seriesData.map((s,i) => (
          <div key={s.name} className="bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-4">
            <div className="w-3 h-12 rounded-full" style={{backgroundColor:Object.values(SERIES_COLOR)[i]}}/>
            <div>
              <Badge series={s.name}/><br/>
              <span className="text-lg font-bold text-gray-800 mt-1 block">{fmtB(s.ยอดขาย)}</span>
              <span className="text-xs text-gray-400">{fmt(s.ซอง)} ซอง</span>
            </div>
          </div>
        ))}
      </div>

      {/* Ranking Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-gray-700">อันดับ SKU ทั้งหมด</h2>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"revenue",l:"รายรับ"},{v:"qty",l:"จำนวน"},{v:"profit",l:"กำไร"}].map(t=>(
              <button key={t.v} onClick={()=>setMetric(t.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${metric===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs text-gray-400 w-8">#</th>
                <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                <th className="text-center py-2 text-xs text-gray-400">Series</th>
                <th className="text-right py-2 text-xs text-gray-400">ซองที่ขาย</th>
                <th className="text-right py-2 text-xs text-gray-400">รายรับ</th>
                <th className="text-right py-2 text-xs text-gray-400">กำไร</th>
                <th className="py-2 px-2 text-xs text-gray-400 w-28">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r,i) => {
                const maxRev = ranked[0].rev
                const pct = maxRev > 0 ? (r.rev/maxRev*100) : 0
                return (
                  <tr key={r.sku_id} className={`border-b border-gray-50 hover:bg-gray-50 ${i<3?"bg-yellow-50/30":""}`}>
                    <td className="py-2.5 text-center">
                      {i===0?"🥇":i===1?"🥈":i===2?"🥉":<span className="text-gray-400 text-xs">{i+1}</span>}
                    </td>
                    <td className="py-2.5 font-mono text-xs font-bold text-gray-700">{r.sku_id}</td>
                    <td className="py-2.5 text-center"><Badge series={r.series}/></td>
                    <td className="py-2.5 text-right font-medium text-gray-700">{fmt(r.qty)}</td>
                    <td className="py-2.5 text-right font-semibold text-green-600">{fmtB(r.rev)}</td>
                    <td className="py-2.5 text-right font-semibold text-purple-600">{fmtB(r.profit)}</td>
                    <td className="py-2.5 px-2">
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-400" style={{width:`${pct}%`}}/>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-4">แนวโน้มการขาย Top 5 SKU (7 วัน)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData} margin={{top:0,right:20,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
            <XAxis dataKey="day" tick={{fontSize:11}}/>
            <YAxis tick={{fontSize:11}}/>
            <Tooltip/>
            <Legend/>
            {top5.map((skuId,i) => (
              <Line key={skuId} type="monotone" dataKey={skuId} stroke={CHART_COLORS[i]} strokeWidth={2} dot={{r:3}}/>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────
const NAV = [
  { id:"dashboard", label:"ภาพรวม", icon:Home },
  { id:"stock",     label:"จัดการสต็อก", icon:Package },
  { id:"withdrawal",label:"เบิกเติมตู้", icon:ArrowUpCircle },
  { id:"sales",     label:"ยอดขาย",  icon:ShoppingCart },
  { id:"analytics", label:"วิเคราะห์ SKU", icon:BarChart2 },
]

// ─────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard")
  const [sideOpen, setSideOpen] = useState(false)
  const [stockIn, setStockIn]   = useState(INIT_STOCK_IN)
  const [stockOut, setStockOut] = useState(INIT_STOCK_OUT)
  const [sales]                 = useState(INIT_SALES)

  const addStockIn  = (row) => setStockIn(prev => [...prev, row])
  const addStockOut = (row) => setStockOut(prev => [...prev, row])

  const balance = calcBalance(stockIn, stockOut)
  const lowCount = SKUS.filter(s=>(balance[s.sku_id]||0)<24).length

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sideOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={()=>setSideOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 shadow-sm z-40 flex flex-col transition-transform duration-300
        ${sideOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:z-auto`}>
        {/* Logo */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-sm">DX</span>
            </div>
            <div>
              <p className="font-bold text-gray-800 text-sm">DivisionX Card</p>
              <p className="text-xs text-gray-400">ระบบจัดการสต็อก</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(n => {
            const Icon = n.icon
            const active = page === n.id
            return (
              <button key={n.id} onClick={()=>{setPage(n.id); setSideOpen(false)}}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${active ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
                <Icon size={18}/>
                <span>{n.label}</span>
                {n.id==="stock" && lowCount > 0 && (
                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold ${active?"bg-white/20 text-white":"bg-amber-100 text-amber-600"}`}>
                    {lowCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="w-2 h-2 rounded-full bg-green-500"/>
            <span>ระบบทำงานปกติ</span>
            <RefreshCw size={11} className="ml-auto cursor-pointer hover:text-blue-500"/>
          </div>
          <p className="text-xs text-gray-300 mt-1">v1.0 · เม.ย. 2026</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 lg:px-6 sticky top-0 z-20">
          <button onClick={()=>setSideOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
            <Menu size={20} className="text-gray-600"/>
          </button>
          <span className="font-semibold text-gray-700 text-sm">
            {NAV.find(n=>n.id===page)?.label}
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
            <Clock size={12}/> {today()}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {page === "dashboard"  && <PageDashboard stockIn={stockIn} stockOut={stockOut} sales={sales}/>}
          {page === "stock"      && <PageStock     stockIn={stockIn} stockOut={stockOut} onAddStockIn={addStockIn}/>}
          {page === "withdrawal" && <PageWithdrawal stockIn={stockIn} stockOut={stockOut} onAddStockOut={addStockOut}/>}
          {page === "sales"      && <PageSales     sales={sales}/>}
          {page === "analytics"  && <PageAnalytics sales={sales}/>}
        </main>
      </div>
    </div>
  )
}
