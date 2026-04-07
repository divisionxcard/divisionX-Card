"use client"
import { useState, useEffect, useCallback } from "react"
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts"
import {
  Package, TrendingUp, ShoppingCart, AlertTriangle,
  PlusCircle, MinusCircle, BarChart2, Home, Menu, X,
  CheckCircle, Clock, Search, RefreshCw, ArrowUpCircle, Loader2
} from "lucide-react"
import {
  getStockBalance, getStockIn, getStockOut,
  addStockIn as dbAddStockIn, addStockOut as dbAddStockOut,
  getMachines, getSalesByMachine
} from "../lib/supabase"

// ─────────────────────────────────────────────
// STATIC SKU DATA (ราคา/ต้นทุน)
// ─────────────────────────────────────────────
const SKUS = [
  { sku_id:"OP 01",  name:"One Piece OP-01",    series:"OP",  packs_per_box:12, sell_price:60,  cost_price:42 },
  { sku_id:"OP 02",  name:"One Piece OP-02",    series:"OP",  packs_per_box:12, sell_price:60,  cost_price:42 },
  { sku_id:"OP 03",  name:"One Piece OP-03",    series:"OP",  packs_per_box:12, sell_price:60,  cost_price:42 },
  { sku_id:"OP 04",  name:"One Piece OP-04",    series:"OP",  packs_per_box:12, sell_price:65,  cost_price:45 },
  { sku_id:"OP 05",  name:"One Piece OP-05",    series:"OP",  packs_per_box:12, sell_price:65,  cost_price:45 },
  { sku_id:"OP 06",  name:"One Piece OP-06",    series:"OP",  packs_per_box:12, sell_price:65,  cost_price:45 },
  { sku_id:"OP 07",  name:"One Piece OP-07",    series:"OP",  packs_per_box:12, sell_price:70,  cost_price:48 },
  { sku_id:"OP 08",  name:"One Piece OP-08",    series:"OP",  packs_per_box:12, sell_price:70,  cost_price:48 },
  { sku_id:"OP 09",  name:"One Piece OP-09",    series:"OP",  packs_per_box:12, sell_price:70,  cost_price:48 },
  { sku_id:"OP 10",  name:"One Piece OP-10",    series:"OP",  packs_per_box:12, sell_price:70,  cost_price:48 },
  { sku_id:"OP 11",  name:"One Piece OP-11",    series:"OP",  packs_per_box:12, sell_price:75,  cost_price:52 },
  { sku_id:"OP 12",  name:"One Piece OP-12",    series:"OP",  packs_per_box:12, sell_price:75,  cost_price:52 },
  { sku_id:"OP 13",  name:"One Piece OP-13",    series:"OP",  packs_per_box:12, sell_price:75,  cost_price:52 },
  { sku_id:"OP 14",  name:"One Piece OP-14",    series:"OP",  packs_per_box:12, sell_price:80,  cost_price:55 },
  { sku_id:"OP 15",  name:"One Piece OP-15",    series:"OP",  packs_per_box:12, sell_price:80,  cost_price:55 },
  { sku_id:"PRB 01", name:"Premium Booster 01", series:"PRB", packs_per_box:10, sell_price:150, cost_price:110 },
  { sku_id:"PRB 02", name:"Premium Booster 02", series:"PRB", packs_per_box:10, sell_price:180, cost_price:130 },
  { sku_id:"EB 01",  name:"Extra Booster 01",   series:"EB",  packs_per_box:12, sell_price:120, cost_price:85  },
  { sku_id:"EB 02",  name:"Extra Booster 02",   series:"EB",  packs_per_box:12, sell_price:120, cost_price:85  },
  { sku_id:"EB 03",  name:"Extra Booster 03",   series:"EB",  packs_per_box:12, sell_price:130, cost_price:90  },
  { sku_id:"EB 04",  name:"Extra Booster 04",   series:"EB",  packs_per_box:12, sell_price:130, cost_price:90  },
]

const SERIES_COLOR = { OP: "#3b82f6", PRB: "#8b5cf6", EB: "#10b981" }
const CHART_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4"]

const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const fmt   = (n) => (n ?? 0).toLocaleString("th-TH")
const fmtB  = (n) => `฿${(n ?? 0).toLocaleString("th-TH")}`
const today = () => new Date().toISOString().slice(0, 10)

function getLastNDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

function fmtDayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00")
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`
}

function convertToPacks(qty, unit, sku) {
  if (unit === "pack")   return qty
  if (unit === "box")    return qty * sku.packs_per_box
  if (unit === "cotton") return qty * 12 * sku.packs_per_box
  return qty
}

// ─────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────
function Badge({ series }) {
  const c = { OP:"bg-blue-100 text-blue-700", PRB:"bg-purple-100 text-purple-700", EB:"bg-emerald-100 text-emerald-700" }
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${c[series] ?? "bg-gray-100 text-gray-600"}`}>{series}</span>
}

function StatusDot({ status }) {
  return <span className={`inline-block w-2 h-2 rounded-full mr-1 ${status==="active"?"bg-green-500":"bg-gray-400"}`}/>
}

function KpiCard({ icon: Icon, label, value, sub, color }) {
  const bg = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    amber:  "bg-amber-50 text-amber-600",
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex gap-4 items-start">
      <div className={`rounded-xl p-3 ${bg[color]}`}><Icon size={22}/></div>
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-gray-800 break-all">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={40} className="animate-spin text-blue-500 mx-auto mb-4"/>
        <p className="text-gray-500 text-sm">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  )
}

function ErrorScreen({ msg, onRetry }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 max-w-md text-center">
        <AlertTriangle size={40} className="text-red-400 mx-auto mb-4"/>
        <h2 className="font-bold text-gray-700 mb-2">เชื่อมต่อฐานข้อมูลไม่ได้</h2>
        <p className="text-sm text-gray-400 mb-5 font-mono">{msg}</p>
        <button onClick={onRetry}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 flex items-center gap-2 mx-auto">
          <RefreshCw size={14}/> ลองใหม่
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 1: DASHBOARD
// ─────────────────────────────────────────────
function PageDashboard({ machines, stockIn, stockOut, stockBalance, sales }) {
  // Balance map from v_stock_balance view
  const balMap = Object.fromEntries(stockBalance.map(r => [r.sku_id, parseFloat(r.balance) || 0]))
  const totalPacks = stockBalance.reduce((a, r) => a + (parseFloat(r.balance) || 0), 0)
  const lowStock   = SKUS.filter(s => (balMap[s.sku_id] || 0) < 24)

  const todayStr   = today()
  const todaySales = sales.filter(r => r.sold_at === todayStr)
  const todayRevenue = todaySales.reduce((a, r) => a + r.revenue, 0)
  const todayQty   = todaySales.reduce((a, r) => a + r.quantity_sold, 0)

  // Last 7 days chart
  const last7 = getLastNDays(7)
  const dailyChart = last7.map(d => {
    const rows = sales.filter(r => r.sold_at === d)
    return {
      day: fmtDayLabel(d),
      ยอดขาย:   rows.reduce((a, r) => a + r.revenue, 0),
      จำนวนซอง: rows.reduce((a, r) => a + r.quantity_sold, 0),
    }
  })

  // Per-machine today
  const machineToday = machines.map(m => {
    const rows = todaySales.filter(r => r.machine_id === m.machine_id)
    return { name: m.name, ยอดขาย: rows.reduce((a, r) => a + r.revenue, 0) }
  })

  // Recent stock movements
  const recent = [
    ...stockIn.map(r  => ({ ...r, type:"in",  dateKey: r.purchased_at })),
    ...stockOut.map(r => ({ ...r, type:"out", dateKey: r.withdrawn_at })),
  ].sort((a, b) => new Date(b.dateKey) - new Date(a.dateKey)).slice(0, 6)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">ภาพรวม Dashboard</h1>
        <p className="text-sm text-gray-400">อัปเดตล่าสุด: {todayStr}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={TrendingUp}    label="ยอดขายวันนี้"   value={fmtB(todayRevenue)}  sub={`${fmt(todayQty)} ซอง`} color="green"/>
        <KpiCard icon={Package}       label="สต็อกคงเหลือ"   value={`${fmt(totalPacks)} ซอง`} sub={`${SKUS.length} SKU`} color="blue"/>
        <KpiCard icon={AlertTriangle} label="สต็อกใกล้หมด"  value={lowStock.length}     sub="SKU ต่ำกว่า 24 ซอง" color="amber"/>
        <KpiCard icon={ShoppingCart}  label="ตู้ที่ใช้งาน"   value={`${machines.filter(m=>m.status==="active").length} ตู้`} sub={`จากทั้งหมด ${machines.length} ตู้`} color="purple"/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Revenue Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ยอดขาย 7 วันล่าสุด (บาท)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyChart} margin={{top:0,right:10,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="day" tick={{fontSize:11}}/>
              <YAxis tick={{fontSize:11}} tickFormatter={v => fmt(v)}/>
              <Tooltip formatter={v => [fmtB(v), "ยอดขาย"]}/>
              <Bar dataKey="ยอดขาย" fill="#3b82f6" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Per-machine today */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ยอดขายวันนี้ แยกตู้</h2>
          {machineToday.every(m => m.ยอดขาย === 0) ? (
            <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">ยังไม่มีข้อมูลยอดขายวันนี้</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={machineToday} dataKey="ยอดขาย" nameKey="name"
                    cx="50%" cy="50%" outerRadius={75}
                    label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {machineToday.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]}/>)}
                  </Pie>
                  <Tooltip formatter={v => fmtB(v)}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-3 justify-center mt-2 flex-wrap">
                {machineToday.map((m, i) => (
                  <div key={i} className="text-center">
                    <div className="text-xs text-gray-500">{m.name}</div>
                    <div className="text-sm font-bold" style={{color:CHART_COLORS[i]}}>{fmtB(m.ยอดขาย)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Machine Status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3">สถานะตู้จำหน่าย</h2>
          <div className="space-y-3">
            {machines.map(m => {
              const mSales = todaySales.filter(r => r.machine_id === m.machine_id)
              const mRev   = mSales.reduce((a, r) => a + r.revenue, 0)
              const mQty   = mSales.reduce((a, r) => a + r.quantity_sold, 0)
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
                  <span className="text-sm font-bold text-amber-600">{balMap[s.sku_id] || 0} ซอง</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Movements */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-3">ความเคลื่อนไหวล่าสุด</h2>
        {recent.length === 0 ? (
          <p className="text-gray-400 text-sm">ยังไม่มีการเคลื่อนไหว</p>
        ) : (
          <div className="space-y-2">
            {recent.map((r, i) => {
              const sku     = SKUS.find(s => s.sku_id === r.sku_id)
              const isIn    = r.type === "in"
              return (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-full p-1.5 ${isIn?"bg-blue-50 text-blue-500":"bg-orange-50 text-orange-500"}`}>
                      {isIn ? <PlusCircle size={14}/> : <MinusCircle size={14}/>}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        <span className="font-mono text-xs bg-gray-100 px-1 rounded">{r.sku_id}</span>{" "}
                        {isIn ? `รับเข้า — ${r.source}` : `เบิก → ตู้ ${r.machine_id}`}
                      </p>
                      <p className="text-xs text-gray-400">{r.dateKey}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${isIn?"text-blue-600":"text-orange-500"}`}>
                    {isIn?"+":"-"}{fmt(r.quantity_packs)} ซอง
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 2: STOCK
// ─────────────────────────────────────────────
function PageStock({ stockIn, stockBalance, onAddStockIn }) {
  const [tab, setTab]       = useState("balance")
  const [search, setSearch] = useState("")
  const [seriesSel, setSeriesSel] = useState("ทั้งหมด")
  const [saving, setSaving] = useState(false)
  const [form, setForm]     = useState({ sku_id:"OP 01", source:"", unit:"box", quantity:"1", unit_cost:"", note:"" })
  const [toast, setToast]   = useState(null)

  // Balance map from view
  const balMap = Object.fromEntries(stockBalance.map(r => [r.sku_id, {
    total_in:  parseFloat(r.total_in)  || 0,
    total_out: parseFloat(r.total_out) || 0,
    balance:   parseFloat(r.balance)   || 0,
  }]))

  const filtered = SKUS
    .filter(s => s.sku_id.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()))
    .filter(s => seriesSel === "ทั้งหมด" || s.series === seriesSel)

  const showToast = (msg, type="success") => {
    setToast({msg, type}); setTimeout(() => setToast(null), 3500)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.source || !form.quantity || !form.unit_cost) {
      showToast("กรุณากรอกข้อมูลให้ครบถ้วน", "error"); return
    }
    const sku   = SKUS.find(s => s.sku_id === form.sku_id)
    const qty   = parseInt(form.quantity)
    const packs = convertToPacks(qty, form.unit, sku)
    const cost  = parseFloat(form.unit_cost)
    try {
      setSaving(true)
      await onAddStockIn({
        sku_id:        form.sku_id,
        source:        form.source,
        unit:          form.unit,
        quantity:      qty,
        quantity_packs: packs,
        unit_cost:     cost,
        total_cost:    qty * cost,
        purchased_at:  today(),
        note:          form.note,
      })
      showToast(`บันทึกสำเร็จ: เพิ่ม ${packs} ซอง (${form.sku_id})`)
      setForm({ sku_id:"OP 01", source:"", unit:"box", quantity:"1", unit_cost:"", note:"" })
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">จัดการสต็อกสินค้า</h1>

      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error" ? <X size={16}/> : <CheckCircle size={16}/>} {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[{key:"balance",label:"สต็อกคงเหลือ"},{key:"addin",label:"รับสินค้าเข้า"},{key:"history",label:"ประวัติการรับ"}].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
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
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหา SKU..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <div className="flex gap-1">
              {["ทั้งหมด","OP","PRB","EB"].map(s => (
                <button key={s} onClick={() => setSeriesSel(s)}
                  className={`px-3 py-2 text-xs rounded-lg font-medium transition-all ${seriesSel===s?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          {/* Mobile: card view */}
          <div className="sm:hidden space-y-2">
            {filtered.map(s => {
              const b   = balMap[s.sku_id] || { total_in:0, total_out:0, balance:0 }
              const low = b.balance < 24
              return (
                <div key={s.sku_id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-gray-700">{s.sku_id}</span>
                      <Badge series={s.series}/>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{s.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <span className="text-blue-500">+{fmt(b.total_in)}</span>
                      {" / "}
                      <span className="text-orange-400">-{fmt(b.total_out)}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-800">{fmt(b.balance)} ซอง</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${low?"bg-amber-100 text-amber-700":"bg-green-100 text-green-700"}`}>
                      {low ? "⚠️ ใกล้หมด" : "✓ ปกติ"}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Desktop: table view */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["SKU","ชื่อสินค้า","Series","รับเข้า(ทั้งหมด)","เบิกออก(ทั้งหมด)","คงเหลือ","สถานะ"].map(h => (
                    <th key={h} className="text-left py-2 text-xs text-gray-400 font-medium pr-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const b   = balMap[s.sku_id] || { total_in:0, total_out:0, balance:0 }
                  const low = b.balance < 24
                  return (
                    <tr key={s.sku_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 font-mono text-xs font-bold text-gray-700">{s.sku_id}</td>
                      <td className="py-2.5 text-gray-600">{s.name}</td>
                      <td className="py-2.5"><Badge series={s.series}/></td>
                      <td className="py-2.5 text-right text-blue-600 font-medium">+{fmt(b.total_in)}</td>
                      <td className="py-2.5 text-right text-orange-500 font-medium">-{fmt(b.total_out)}</td>
                      <td className="py-2.5 text-right font-bold text-gray-800">{fmt(b.balance)}</td>
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
              <select value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                {SKUS.map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">แหล่งที่มา / Supplier</label>
              <input value={form.source} onChange={e => setForm({...form, source:e.target.value})}
                placeholder="เช่น ตัวแทนจำหน่าย A"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">หน่วย</label>
                <select value={form.unit} onChange={e => setForm({...form, unit:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="pack">ซอง (Pack)</option>
                  <option value="box">กล่อง (Box)</option>
                  <option value="cotton">Cotton</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">จำนวน</label>
                <input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>
            </div>
            {form.quantity && (
              <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
                จะได้ <span className="font-bold">
                  {fmt(convertToPacks(parseInt(form.quantity)||0, form.unit, SKUS.find(s=>s.sku_id===form.sku_id)))}
                </span> ซอง
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">ราคาต่อหน่วย (บาท)</label>
              <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm({...form, unit_cost:e.target.value})}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">หมายเหตุ (ไม่บังคับ)</label>
              <input value={form.note} onChange={e => setForm({...form, note:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <button type="submit" disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin"/> : <PlusCircle size={16}/>}
              {saving ? "กำลังบันทึก..." : "บันทึกรับสินค้า"}
            </button>
          </form>
        </div>
      )}

      {/* ── Tab: History ── */}
      {tab === "history" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3">ประวัติการรับสินค้าเข้า (100 รายการล่าสุด)</h2>
          {stockIn.length === 0 ? (
            <p className="text-gray-400 text-sm">ยังไม่มีประวัติการรับสินค้า</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["วันที่","SKU","แหล่งที่มา","หน่วย","จำนวน","ซอง","ราคา/หน่วย","รวม","หมายเหตุ"].map(h => (
                      <th key={h} className="text-left py-2 text-xs text-gray-400 font-medium pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...stockIn].reverse().map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-3 text-gray-500 text-xs">{r.purchased_at}</td>
                      <td className="py-2 pr-3 font-mono font-bold text-xs text-gray-700">{r.sku_id}</td>
                      <td className="py-2 pr-3 text-gray-600">{r.source}</td>
                      <td className="py-2 pr-3 text-gray-500">{r.unit}</td>
                      <td className="py-2 pr-3 text-right font-medium">{fmt(r.quantity)}</td>
                      <td className="py-2 pr-3 text-right text-blue-600 font-bold">+{fmt(r.quantity_packs)}</td>
                      <td className="py-2 pr-3 text-right text-gray-600">{fmtB(r.unit_cost)}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{fmtB(r.total_cost)}</td>
                      <td className="py-2 text-gray-400 text-xs">{r.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 3: WITHDRAWAL
// ─────────────────────────────────────────────
function PageWithdrawal({ machines, stockOut, stockBalance, onAddStockOut }) {
  const [form, setForm]   = useState({ sku_id:"OP 01", machine_id:"", quantity_packs:"12", note:"" })
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)

  // Set default machine once loaded
  const machineId = form.machine_id || machines[0]?.machine_id || ""

  const balMap  = Object.fromEntries(stockBalance.map(r => [r.sku_id, parseFloat(r.balance) || 0]))
  const available = balMap[form.sku_id] || 0

  const showToast = (msg, type="success") => {
    setToast({msg, type}); setTimeout(() => setToast(null), 3500)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const qty = parseInt(form.quantity_packs)
    if (!qty || qty <= 0) { showToast("กรุณาระบุจำนวนที่ถูกต้อง","error"); return }
    if (!machineId)       { showToast("กรุณาเลือกตู้ปลายทาง","error"); return }
    if (qty > available)  {
      showToast(`สต็อกไม่เพียงพอ: คงเหลือ ${available} ซอง แต่ต้องการ ${qty} ซอง`, "error"); return
    }
    try {
      setSaving(true)
      await onAddStockOut({
        sku_id:        form.sku_id,
        machine_id:    machineId,
        quantity_packs: qty,
        withdrawn_at:  today(),
        note:          form.note,
      })
      const machine = machines.find(m => m.machine_id === machineId)
      showToast(`เบิกสำเร็จ: ${form.sku_id} → ${machine?.name ?? machineId} ${qty} ซอง`)
      setForm(f => ({...f, quantity_packs:"12", note:""}))
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">เบิกสินค้าเติมตู้</h1>

      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
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
              <select value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                {SKUS.map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
              </select>
            </div>

            <div className={`p-3 rounded-xl text-sm flex items-center justify-between ${available < 24 ? "bg-amber-50 text-amber-700":"bg-green-50 text-green-700"}`}>
              <span>สต็อกคงเหลือ ({form.sku_id})</span>
              <span className="font-bold">{fmt(available)} ซอง</span>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">ปลายทาง (ตู้)</label>
              <div className={`grid gap-2 ${machines.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
                {machines.map(m => (
                  <button type="button" key={m.machine_id}
                    onClick={() => setForm({...form, machine_id:m.machine_id})}
                    className={`py-3 px-2 rounded-xl text-sm font-medium border-2 transition-all ${(form.machine_id||machineId)===m.machine_id?"border-orange-400 bg-orange-50 text-orange-700":"border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                    <div className="text-xs font-bold">{m.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">{m.location}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">จำนวนซอง</label>
              <input type="number" min="1" max={available} value={form.quantity_packs}
                onChange={e => setForm({...form, quantity_packs:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
              {parseInt(form.quantity_packs) > available && (
                <p className="text-xs text-red-500 mt-1">⚠️ เกินจำนวนสต็อกที่มี ({available} ซอง)</p>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">หมายเหตุ (ไม่บังคับ)</label>
              <input value={form.note} onChange={e => setForm({...form, note:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
            </div>

            <button type="submit" disabled={saving}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin"/> : <ArrowUpCircle size={16}/>}
              {saving ? "กำลังบันทึก..." : "บันทึกการเบิก"}
            </button>
          </form>
        </div>

        {/* History */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3">ประวัติการเบิกสินค้า</h2>
          {stockOut.length === 0 ? (
            <p className="text-gray-400 text-sm">ยังไม่มีประวัติการเบิก</p>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {[...stockOut].reverse().map((r, i) => {
                const sku     = SKUS.find(s => s.sku_id === r.sku_id)
                const machine = machines.find(m => m.machine_id === r.machine_id)
                return (
                  <div key={i} className="p-3 rounded-xl bg-gray-50 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-700">{r.sku_id}</span>
                        <Badge series={sku?.series || "OP"}/>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        → <span className="font-medium text-orange-600">{machine?.name ?? r.machine_id}</span>
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
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 4: SALES
// ─────────────────────────────────────────────
function PageSales({ machines, sales }) {
  const [viewMode, setViewMode]   = useState("daily")
  const [machineSel, setMachineSel] = useState("all")

  const filtered = machineSel === "all" ? sales : sales.filter(r => r.machine_id === machineSel)

  // Last 7 days chart per machine
  const last7 = getLastNDays(7)
  const dailyData = last7.map(d => {
    const row = { day: fmtDayLabel(d) }
    machines.forEach(m => {
      const rows = sales.filter(r => r.sold_at === d && r.machine_id === m.machine_id)
      row[m.name] = rows.reduce((a, r) => a + r.revenue, 0)
    })
    return row
  })

  const totalRev = filtered.reduce((a, r) => a + r.revenue, 0)
  const totalQty = filtered.reduce((a, r) => a + r.quantity_sold, 0)
  const dayCount = Math.max(1, [...new Set(filtered.map(r => r.sold_at))].length)

  // Top SKUs
  const skuMap = {}
  filtered.forEach(r => {
    if (!skuMap[r.sku_id]) skuMap[r.sku_id] = { qty:0, rev:0 }
    skuMap[r.sku_id].qty += r.quantity_sold
    skuMap[r.sku_id].rev += r.revenue
  })
  const topSkus = Object.entries(skuMap)
    .sort((a, b) => b[1].rev - a[1].rev).slice(0, 8)
    .map(([id, v]) => ({ sku_id: id, ...v }))

  // Profit estimate
  const profit = filtered.reduce((a, r) => {
    const s = SKUS.find(sk => sk.sku_id === r.sku_id)
    return a + r.quantity_sold * (s ? s.sell_price - s.cost_price : 0)
  }, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">ยอดขาย (30 วันล่าสุด)</h1>
        <div className="flex gap-2 flex-wrap">
          <select value={machineSel} onChange={e => setMachineSel(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="all">ทุกตู้</option>
            {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
          </select>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"daily",l:"รายวัน"},{v:"stacked",l:"สะสม"}].map(t => (
              <button key={t.v} onClick={() => setViewMode(t.v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sales.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <ShoppingCart size={40} className="text-gray-300 mx-auto mb-3"/>
          <p className="text-gray-400 text-sm">ยังไม่มีข้อมูลยอดขาย</p>
          <p className="text-gray-300 text-xs mt-1">ข้อมูลจะปรากฏหลัง VMS Scraper ทำงานครั้งแรก</p>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">ยอดขายรวม (30 วัน)</p>
              <p className="text-xl font-bold text-green-600 mt-1">{fmtB(totalRev)}</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">จำนวนซองที่ขาย</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{fmt(totalQty)} ซอง</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">เฉลี่ยต่อวัน</p>
              <p className="text-xl font-bold text-purple-600 mt-1">{fmtB(Math.round(totalRev/dayCount))}</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">กำไรโดยประมาณ</p>
              <p className="text-xl font-bold text-amber-600 mt-1">{fmtB(profit)}</p>
            </div>
          </div>

          {/* Daily Chart */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">ยอดขาย 7 วันล่าสุด แยกตู้ (บาท)</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyData} margin={{top:0,right:10,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="day" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:11}} tickFormatter={v => fmt(v)}/>
                <Tooltip formatter={v => fmtB(v)}/>
                <Legend/>
                {machines.map((m, i) => (
                  <Bar key={m.machine_id} dataKey={m.name} fill={CHART_COLORS[i]}
                    radius={viewMode==="stacked" ? [0,0,0,0] : [4,4,0,0]}
                    stackId={viewMode==="stacked" ? "a" : undefined}/>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top SKUs */}
          {topSkus.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-700 mb-4">Top SKU ยอดขายสูงสุด</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topSkus} layout="vertical" margin={{top:0,right:30,left:10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11}} tickFormatter={v => fmt(v)}/>
                  <YAxis type="category" dataKey="sku_id" width={60} tick={{fontSize:11}}/>
                  <Tooltip formatter={(v, n) => [n==="rev" ? fmtB(v) : fmt(v), n==="rev"?"รายรับ":"ซอง"]}/>
                  <Bar dataKey="rev" name="rev" fill="#3b82f6" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 5: ANALYTICS
// ─────────────────────────────────────────────
function PageAnalytics({ sales }) {
  const [metric, setMetric] = useState("revenue")

  const skuMap = {}
  sales.forEach(r => {
    if (!skuMap[r.sku_id]) skuMap[r.sku_id] = { qty:0, rev:0 }
    skuMap[r.sku_id].qty += r.quantity_sold
    skuMap[r.sku_id].rev += r.revenue
  })

  const ranked = Object.entries(skuMap)
    .map(([id, v]) => {
      const s = SKUS.find(sk => sk.sku_id === id)
      return { sku_id:id, series:s?.series||"OP", ...v,
        profit: v.qty * ((s?.sell_price||0) - (s?.cost_price||0)) }
    })
    .sort((a, b) => metric==="revenue" ? b.rev-a.rev : metric==="qty" ? b.qty-a.qty : b.profit-a.profit)

  const top5    = ranked.slice(0, 5).map(r => r.sku_id)
  const last7   = getLastNDays(7)
  const trendData = last7.map(d => {
    const row = { day: fmtDayLabel(d) }
    top5.forEach(skuId => {
      const rows = sales.filter(r => r.sold_at === d && r.sku_id === skuId)
      row[skuId] = rows.reduce((a, r) => a + r.quantity_sold, 0)
    })
    return row
  })

  const seriesData = ["OP","PRB","EB"].map(s => {
    const rows = sales.filter(r => SKUS.find(sk => sk.sku_id === r.sku_id)?.series === s)
    return { name:s, ยอดขาย: rows.reduce((a, r) => a+r.revenue, 0), ซอง: rows.reduce((a, r) => a+r.quantity_sold, 0) }
  })

  if (sales.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">วิเคราะห์ยอดขาย SKU</h1>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <BarChart2 size={40} className="text-gray-300 mx-auto mb-3"/>
          <p className="text-gray-400 text-sm">ยังไม่มีข้อมูลยอดขาย</p>
          <p className="text-gray-300 text-xs mt-1">ข้อมูลจะปรากฏหลัง VMS Scraper ทำงานครั้งแรก</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">วิเคราะห์ยอดขาย SKU</h1>

      {/* Series Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {seriesData.map((s, i) => (
          <div key={s.name} className="bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-4">
            <div className="w-3 h-12 rounded-full flex-shrink-0" style={{backgroundColor:Object.values(SERIES_COLOR)[i]}}/>
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
            {[{v:"revenue",l:"รายรับ"},{v:"qty",l:"จำนวน"},{v:"profit",l:"กำไร"}].map(t => (
              <button key={t.v} onClick={() => setMetric(t.v)}
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
                <th className="text-center py-2 text-xs text-gray-400 hidden sm:table-cell">Series</th>
                <th className="text-right py-2 text-xs text-gray-400 hidden sm:table-cell">ซองที่ขาย</th>
                <th className="text-right py-2 text-xs text-gray-400">รายรับ</th>
                <th className="text-right py-2 text-xs text-gray-400">กำไร</th>
                <th className="py-2 px-2 text-xs text-gray-400 w-20 hidden sm:table-cell">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const maxRev = ranked[0]?.rev || 1
                const pct = r.rev / maxRev * 100
                return (
                  <tr key={r.sku_id} className={`border-b border-gray-50 hover:bg-gray-50 ${i<3?"bg-yellow-50/30":""}`}>
                    <td className="py-2.5 text-center">
                      {i===0?"🥇":i===1?"🥈":i===2?"🥉":<span className="text-gray-400 text-xs">{i+1}</span>}
                    </td>
                    <td className="py-2.5 font-mono text-xs font-bold text-gray-700">{r.sku_id}</td>
                    <td className="py-2.5 text-center hidden sm:table-cell"><Badge series={r.series}/></td>
                    <td className="py-2.5 text-right font-medium text-gray-700 hidden sm:table-cell">{fmt(r.qty)}</td>
                    <td className="py-2.5 text-right font-semibold text-green-600">{fmtB(r.rev)}</td>
                    <td className="py-2.5 text-right font-semibold text-purple-600">{fmtB(r.profit)}</td>
                    <td className="py-2.5 px-2 hidden sm:table-cell">
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
      {top5.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">แนวโน้มการขาย Top 5 SKU (7 วัน)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{top:0,right:20,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="day" tick={{fontSize:11}}/>
              <YAxis tick={{fontSize:11}}/>
              <Tooltip/>
              <Legend/>
              {top5.map((skuId, i) => (
                <Line key={skuId} type="monotone" dataKey={skuId} stroke={CHART_COLORS[i]} strokeWidth={2} dot={{r:3}}/>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────
const NAV = [
  { id:"dashboard",  label:"ภาพรวม",       icon:Home          },
  { id:"stock",      label:"จัดการสต็อก",  icon:Package       },
  { id:"withdrawal", label:"เบิกเติมตู้",   icon:ArrowUpCircle },
  { id:"sales",      label:"ยอดขาย",       icon:ShoppingCart  },
  { id:"analytics",  label:"วิเคราะห์ SKU", icon:BarChart2     },
]

// ─────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────
export default function DivisionXApp() {
  const [page, setPage]         = useState("dashboard")
  const [sideOpen, setSideOpen] = useState(false)

  // ── Data State ──
  const [machines,      setMachines]      = useState([])
  const [stockIn,       setStockIn]       = useState([])
  const [stockOut,      setStockOut]      = useState([])
  const [stockBalance,  setStockBalance]  = useState([])
  const [sales,         setSales]         = useState([])
  const [loading,       setLoading]       = useState(true)
  const [dataError,     setDataError]     = useState(null)

  // ── Load All Data from Supabase ──
  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      setDataError(null)
      const [machData, siData, soData, sbData, salesData] = await Promise.all([
        getMachines(),
        getStockIn(),
        getStockOut(),
        getStockBalance(),
        getSalesByMachine(30),
      ])
      setMachines(machData)
      setStockIn(siData)
      setStockOut(soData)
      setStockBalance(sbData)
      // Normalize sales: grand_total → revenue, sold_at timestamptz → date string
      setSales(salesData.map(r => ({
        ...r,
        revenue:  parseFloat(r.grand_total) || 0,
        sold_at:  r.sold_at ? r.sold_at.slice(0, 10) : "",
      })))
    } catch (err) {
      setDataError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Write Operations ──
  const addStockIn = async (record) => {
    await dbAddStockIn(record)
    const [newSI, newSB] = await Promise.all([getStockIn(), getStockBalance()])
    setStockIn(newSI)
    setStockBalance(newSB)
  }

  const addStockOut = async (record) => {
    await dbAddStockOut(record)
    const [newSO, newSB] = await Promise.all([getStockOut(), getStockBalance()])
    setStockOut(newSO)
    setStockBalance(newSB)
  }

  // ── Derived ──
  const balMap   = Object.fromEntries(stockBalance.map(r => [r.sku_id, parseFloat(r.balance) || 0]))
  const lowCount = SKUS.filter(s => (balMap[s.sku_id] || 0) < 24).length

  // ── Loading / Error screens ──
  if (loading)   return <LoadingScreen/>
  if (dataError) return <ErrorScreen msg={dataError} onRetry={loadAll}/>

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sideOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSideOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 shadow-sm z-40 flex flex-col transition-transform duration-300
        ${sideOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:z-auto`}>
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

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(n => {
            const Icon   = n.icon
            const active = page === n.id
            return (
              <button key={n.id} onClick={() => { setPage(n.id); setSideOpen(false) }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${active ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
                <Icon size={18}/>
                <span>{n.label}</span>
                {n.id === "stock" && lowCount > 0 && (
                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold ${active?"bg-white/20 text-white":"bg-amber-100 text-amber-600"}`}>
                    {lowCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="w-2 h-2 rounded-full bg-green-500"/>
            <span>เชื่อมต่อ Supabase</span>
            <RefreshCw size={11} className="ml-auto cursor-pointer hover:text-blue-500" onClick={loadAll}/>
          </div>
          <p className="text-xs text-gray-300 mt-1">v2.0 · Live Data</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 lg:px-6 sticky top-0 z-20">
          <button onClick={() => setSideOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
            <Menu size={20} className="text-gray-600"/>
          </button>
          <span className="font-semibold text-gray-700 text-sm">
            {NAV.find(n => n.id === page)?.label}
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
            <Clock size={12}/> {today()}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {page === "dashboard"  && <PageDashboard machines={machines} stockIn={stockIn} stockOut={stockOut} stockBalance={stockBalance} sales={sales}/>}
          {page === "stock"      && <PageStock     stockIn={stockIn} stockBalance={stockBalance} onAddStockIn={addStockIn}/>}
          {page === "withdrawal" && <PageWithdrawal machines={machines} stockOut={stockOut} stockBalance={stockBalance} onAddStockOut={addStockOut}/>}
          {page === "sales"      && <PageSales     machines={machines} sales={sales}/>}
          {page === "analytics"  && <PageAnalytics sales={sales}/>}
        </main>
      </div>
    </div>
  )
}
