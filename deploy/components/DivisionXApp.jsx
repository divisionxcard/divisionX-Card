"use client"
import { useState, useEffect, useCallback } from "react"
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts"
import {
  Package, TrendingUp, ShoppingCart, AlertTriangle,
  PlusCircle, MinusCircle, BarChart2, Home, Menu, X,
  CheckCircle, Clock, Search, RefreshCw, ArrowUpCircle, Loader2,
  Pencil, Trash2, ChevronDown, ChevronUp, Layers,
  LogOut, UserPlus, Users, Shield, Eye, EyeOff, Monitor
} from "lucide-react"
import {
  supabase,
  getStockBalance, getStockIn, getStockOut,
  addStockIn as dbAddStockIn, addStockOut as dbAddStockOut,
  updateStockIn as dbUpdateStockIn,
  deleteStockIn as dbDeleteStockIn,
  deleteStockOut as dbDeleteStockOut,
  getMachines, getSalesByMachine,
  getSkus, addSku as dbAddSku, deactivateSku as dbDeactivateSku, updateSkuAvgCost,
  signIn as authSignIn, signOut as authSignOut, getProfile,
  getMachineStock,
  getClaims, addClaim as dbAddClaim, updateClaim as dbUpdateClaim, deleteClaim as dbDeleteClaim,
} from "../lib/supabase"

// ─────────────────────────────────────────────
// STATIC SKU DATA (ราคา/ต้นทุน)
// ─────────────────────────────────────────────
const SKUS = [
  { sku_id:"OP 01",  name:"One Piece OP-01",    series:"OP",  packs_per_box:24, sell_price:60,  cost_price:42 },
  { sku_id:"OP 02",  name:"One Piece OP-02",    series:"OP",  packs_per_box:24, sell_price:60,  cost_price:42 },
  { sku_id:"OP 03",  name:"One Piece OP-03",    series:"OP",  packs_per_box:24, sell_price:60,  cost_price:42 },
  { sku_id:"OP 04",  name:"One Piece OP-04",    series:"OP",  packs_per_box:24, sell_price:65,  cost_price:45 },
  { sku_id:"OP 05",  name:"One Piece OP-05",    series:"OP",  packs_per_box:24, sell_price:65,  cost_price:45 },
  { sku_id:"OP 06",  name:"One Piece OP-06",    series:"OP",  packs_per_box:24, sell_price:65,  cost_price:45 },
  { sku_id:"OP 07",  name:"One Piece OP-07",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 08",  name:"One Piece OP-08",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 09",  name:"One Piece OP-09",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 10",  name:"One Piece OP-10",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 11",  name:"One Piece OP-11",    series:"OP",  packs_per_box:24, sell_price:75,  cost_price:52 },
  { sku_id:"OP 12",  name:"One Piece OP-12",    series:"OP",  packs_per_box:24, sell_price:75,  cost_price:52 },
  { sku_id:"OP 13",  name:"One Piece OP-13",    series:"OP",  packs_per_box:24, sell_price:75,  cost_price:52 },
  { sku_id:"OP 14",  name:"One Piece OP-14",    series:"OP",  packs_per_box:24, sell_price:80,  cost_price:55 },
  { sku_id:"OP 15",  name:"One Piece OP-15",    series:"OP",  packs_per_box:24, sell_price:80,  cost_price:55 },
  { sku_id:"PRB 01", name:"Premium Booster 01", series:"PRB", packs_per_box:10, boxes_per_cotton:10, sell_price:150, cost_price:110 },
  { sku_id:"PRB 02", name:"Premium Booster 02", series:"PRB", packs_per_box:10, boxes_per_cotton:20, sell_price:180, cost_price:130 },
  { sku_id:"EB 01",  name:"Extra Booster 01",   series:"EB",  packs_per_box:24, sell_price:120, cost_price:85  },
  { sku_id:"EB 02",  name:"Extra Booster 02",   series:"EB",  packs_per_box:24, sell_price:120, cost_price:85  },
  { sku_id:"EB 03",  name:"Extra Booster 03",   series:"EB",  packs_per_box:24, sell_price:130, cost_price:90  },
  { sku_id:"EB 04",  name:"Extra Booster 04",   series:"EB",  packs_per_box:24, sell_price:130, cost_price:90  },
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

// แสดงจำนวนเป็น "X กล่อง Y ซอง" (ซ่อน 0 กล่อง / 0 ซอง)
const fmtBoxPack = (packs, ppb) => {
  if (!packs || packs === 0) return "0 ซอง"
  const boxes = Math.floor(packs / ppb)
  const rem   = packs % ppb
  if (boxes === 0) return `${fmt(rem)} ซอง`
  if (rem   === 0) return `${fmt(boxes)} กล่อง`
  return `${fmt(boxes)} กล่อง ${rem} ซอง`
}
const UNIT_LABEL = { pack: "ซอง", box: "กล่อง", cotton: "Cotton" }

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
  if (unit === "cotton") return qty * (sku.boxes_per_cotton || 12) * sku.packs_per_box
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

function RealtimeClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const day = now.getDate()
  const month = THAI_MONTHS[now.getMonth()]
  const year = now.getFullYear()
  const time = now.toTimeString().slice(0, 8)
  return <span>{day} {month} {year} · {time}</span>
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
// LOGIN PAGE
// ─────────────────────────────────────────────
function LoginPage() {
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await authSignIn(email, password)
      // onAuthStateChange จัดการ session ให้อัตโนมัติ
    } catch {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-3 shadow-md">
            <span className="text-white font-black text-xl">DX</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800">DivisionX Card</h1>
          <p className="text-sm text-gray-400 mt-1">ระบบจัดการสต็อก</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">อีเมล</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="example@email.com" required autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">รหัสผ่าน</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 pr-10"/>
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>
          )}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
            {loading && <Loader2 size={16} className="animate-spin"/>}
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE: USER MANAGEMENT (Admin only)
// ─────────────────────────────────────────────
function PageUsers({ currentProfile }) {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState("list")
  const [form,    setForm]    = useState({ email:"", display_name:"", password:"", role:"user" })
  const [showPw,  setShowPw]  = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/admin/users")
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setUsers(data)
    } catch (err) {
      showToast("โหลดข้อมูลไม่สำเร็จ: " + err.message, "error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res  = await fetch("/api/admin/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`เพิ่มผู้ใช้ ${form.email} สำเร็จ`)
      setForm({ email:"", display_name:"", password:"", role:"user" })
      setTab("list")
      loadUsers()
    } catch (err) {
      showToast("เพิ่มไม่สำเร็จ: " + err.message, "error")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (userId, email) => {
    setDeleting(true)
    try {
      const res  = await fetch("/api/admin/users", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`ลบผู้ใช้ ${email} สำเร็จ`)
      setConfirmDelete(null)
      loadUsers()
    } catch (err) {
      showToast("ลบไม่สำเร็จ: " + err.message, "error")
    } finally {
      setDeleting(false)
    }
  }

  if (currentProfile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <Shield size={44} className="mb-3 text-gray-300"/>
        <p className="font-semibold text-gray-500">ไม่มีสิทธิ์เข้าถึง</p>
        <p className="text-sm mt-1">เฉพาะ Admin เท่านั้น</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">จัดการผู้ใช้งาน</h1>
        <p className="text-sm text-gray-400">เพิ่ม ดู และลบผู้ใช้ในระบบ</p>
      </div>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm text-white
          ${toast.type==="error" ? "bg-red-500" : "bg-green-500"}`}>
          {toast.type==="error" ? <X size={14}/> : <CheckCircle size={14}/>}
          {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {[{id:"list",label:"รายชื่อผู้ใช้"},{id:"add",label:"เพิ่มผู้ใช้ใหม่"}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${tab===t.id ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {t.id==="add" && <UserPlus size={14} className="inline mr-1.5"/>}
            {t.label}
          </button>
        ))}
      </div>

      {/* User list */}
      {tab === "list" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">ผู้ใช้ทั้งหมด</h2>
            <button onClick={loadUsers} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-500">
              <RefreshCw size={14}/>
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={24} className="animate-spin text-blue-400"/>
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">ยังไม่มีผู้ใช้งาน</p>
          ) : (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-blue-600">
                      {(u.display_name || u.email)[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{u.display_name || "—"}</p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0
                    ${u.role==="admin" ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-500"}`}>
                    {u.role==="admin" ? "Admin" : "User"}
                  </span>
                  {u.id !== currentProfile?.id && (
                    confirmDelete === u.id ? (
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-white">
                          ยกเลิก
                        </button>
                        <button onClick={() => handleDelete(u.id, u.email)} disabled={deleting}
                          className="px-2 py-1 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                          {deleting ? "..." : "ลบ"}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(u.id)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 flex-shrink-0">
                        <Trash2 size={14}/>
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add user form */}
      {tab === "add" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">อีเมล <span className="text-red-400">*</span></label>
                <input type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} required
                  placeholder="user@example.com"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ชื่อที่แสดง</label>
                <input value={form.display_name} onChange={e => setForm({...form,display_name:e.target.value})}
                  placeholder="ชื่อ-นามสกุล หรือ Nickname"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">รหัสผ่าน <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={form.password}
                    onChange={e => setForm({...form,password:e.target.value})} required minLength={6}
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 pr-9"/>
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">สิทธิ์การใช้งาน</label>
                <select value={form.role} onChange={e => setForm({...form,role:e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="user">User — ใช้งานทั่วไป</option>
                  <option value="admin">Admin — จัดการผู้ใช้ได้</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              {saving ? <Loader2 size={16} className="animate-spin"/> : <UserPlus size={16}/>}
              {saving ? "กำลังเพิ่ม..." : "เพิ่มผู้ใช้ใหม่"}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 1: DASHBOARD — Stock Overview with Lots
// ─────────────────────────────────────────────
function PageDashboard({ stockIn, stockOut, stockBalance, skus }) {
  const [expandedSku, setExpandedSku] = useState(null)
  const [seriesSel,   setSeriesSel]   = useState("ทั้งหมด")
  const [search,      setSearch]      = useState("")

  // Balance map from view
  const balMap = Object.fromEntries(stockBalance.map(r => [r.sku_id, {
    total_in:  parseFloat(r.total_in)  || 0,
    total_out: parseFloat(r.total_out) || 0,
    balance:   parseFloat(r.balance)   || 0,
  }]))

  const totalPacks     = stockBalance.reduce((a, r) => a + (parseFloat(r.balance) || 0), 0)
  const lowStock       = skus.filter(s => (balMap[s.sku_id]?.balance || 0) < 24)
  const totalLotValue  = stockIn.reduce((a, r) => a + (parseFloat(r.total_cost) || 0), 0)

  // Lots grouped by SKU (sorted newest first)
  const lotsMap = {}
  stockIn.forEach(r => {
    if (!lotsMap[r.sku_id]) lotsMap[r.sku_id] = []
    lotsMap[r.sku_id].push(r)
  })
  Object.values(lotsMap).forEach(arr =>
    arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  )

  const SERIES_ORDER = { OP: 0, EB: 1, PRB: 2 }
  const filtered = skus
    .filter(s => s.sku_id.toLowerCase().includes(search.toLowerCase()) ||
                 s.name.toLowerCase().includes(search.toLowerCase()))
    .filter(s => seriesSel === "ทั้งหมด" || s.series === seriesSel)
    .sort((a, b) => (SERIES_ORDER[a.series] ?? 9) - (SERIES_ORDER[b.series] ?? 9) || a.sku_id.localeCompare(b.sku_id))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">ภาพรวมสต็อกสินค้า</h1>
        <p className="text-sm text-gray-400">สต็อกคงเหลือแยกตาม SKU พร้อมประวัติ Lot ต้นทุน</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Package}       label="สต็อกรวม"      value={`${fmt(totalPacks)} ซอง`}    sub={`≈ ${fmt(Math.floor(totalPacks / 12))} กล่อง`} color="blue"/>
        <KpiCard icon={AlertTriangle} label="ใกล้หมด"       value={`${lowStock.length} SKU`}   sub="ต่ำกว่า 24 ซอง"    color="amber"/>
        <KpiCard icon={Layers}        label="Lot ทั้งหมด"   value={`${stockIn.length} Lot`}     sub="รายการรับเข้า"    color="green"/>
        <KpiCard icon={TrendingUp}    label="มูลค่าซื้อรวม" value={fmtB(totalLotValue)}         sub="ต้นทุนสะสมทั้งหมด" color="purple"/>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา SKU..."
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

      {/* SKU Cards — Visual Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filtered.map(s => {
          const b          = balMap[s.sku_id] || { balance:0, total_in:0, total_out:0 }
          const low        = b.balance < 24
          const lots       = lotsMap[s.sku_id] || []
          const isExpanded = expandedSku === s.sku_id

          // Moving Average Cost (ต้นทุนเฉลี่ยเคลื่อนที่ — ตรึงไว้จนกว่าจะรับของใหม่)
          const avgCpp = s.avg_cost || 0

          // แปลงหน่วยแสดงผล
          const balCotton = Math.floor(b.balance / (12 * s.packs_per_box))
          const balBoxes  = Math.floor((b.balance % (12 * s.packs_per_box)) / s.packs_per_box)
          const balPacks  = b.balance % s.packs_per_box

          // สีของ series
          const seriesBg = { OP: "from-blue-500 to-blue-600", PRB: "from-purple-500 to-purple-600", EB: "from-emerald-500 to-emerald-600" }
          const seriesBgLight = { OP: "from-blue-50 to-blue-100", PRB: "from-purple-50 to-purple-100", EB: "from-emerald-50 to-emerald-100" }

          // Progress
          const maxPacks = lots.reduce((a, r) => a + (r.quantity_packs || 0), 0) || 1
          const pctRemain = Math.min(100, (b.balance / maxPacks) * 100)

          return (
            <div key={s.sku_id} className="flex flex-col">
              {/* Card */}
              <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md cursor-pointer
                ${low && b.balance > 0 ? "border-amber-300 ring-1 ring-amber-100" : b.balance === 0 ? "border-red-300 ring-1 ring-red-100" : "border-gray-100"}`}
                onClick={() => setExpandedSku(isExpanded ? null : s.sku_id)}>

                {/* Image area */}
                <div className={`relative h-32 bg-gradient-to-br ${seriesBgLight[s.series] || "from-gray-50 to-gray-100"} flex items-center justify-center overflow-hidden`}>
                  {s.image_url ? (
                    <img src={s.image_url} alt={s.sku_id}
                      className="h-full w-full object-contain p-2"
                      onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}/>
                  ) : null}
                  <div className={`${s.image_url ? 'hidden' : 'flex'} w-16 h-16 rounded-2xl bg-gradient-to-br ${seriesBg[s.series] || "from-gray-400 to-gray-500"} items-center justify-center shadow-lg`}>
                    <span className="text-white font-black text-xs leading-tight text-center">{s.sku_id}</span>
                  </div>
                  {/* Status badge */}
                  {b.balance === 0 && (
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">หมด</div>
                  )}
                  {low && b.balance > 0 && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">ใกล้หมด</div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Badge series={s.series}/>
                    <span className="font-mono text-xs font-bold text-gray-700">{s.sku_id}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mb-3" title={s.name}>{s.name}</p>

                  {/* Stock display */}
                  <div className="space-y-1.5">
                    {balCotton > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Cotton</span>
                        <span className="text-sm font-bold text-gray-800">{fmt(balCotton)}</span>
                      </div>
                    )}
                    {balBoxes > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">กล่อง</span>
                        <span className="text-sm font-bold text-gray-800">{fmt(balBoxes)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">ซอง</span>
                      <span className={`text-sm font-bold ${b.balance === 0 ? "text-red-500" : low ? "text-amber-600" : "text-gray-800"}`}>
                        {balCotton > 0 || balBoxes > 0 ? fmt(balPacks) : fmt(b.balance)}
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-400">รวม</span>
                      <span className={`text-xs font-semibold ${b.balance === 0 ? "text-red-500" : low ? "text-amber-600" : "text-blue-600"}`}>
                        {fmt(b.balance)} ซอง
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${b.balance === 0 ? "bg-red-400" : low ? "bg-amber-400" : "bg-green-400"}`}
                      style={{width:`${pctRemain}%`}}/>
                  </div>

                  {/* Cost */}
                  {avgCpp > 0 && (
                    <p className="text-xs text-purple-500 mt-1.5 text-center">ต้นทุน {fmtB(avgCpp.toFixed(2))}/ซอง</p>
                  )}
                </div>
              </div>

              {/* Expanded Lot detail — below card */}
              {isExpanded && (
                <div className="mt-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden col-span-full">
                  {/* Summary bar */}
                  <div className="px-4 py-3 bg-gray-50 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <span className="font-semibold text-gray-600">{s.sku_id} — {s.name}</span>
                    <span className="text-blue-600 font-medium">
                      รับเข้า: {fmtBoxPack(b.total_in, s.packs_per_box)}
                    </span>
                    <span className="text-orange-500 font-medium">
                      เบิกออก: {fmtBoxPack(b.total_out, s.packs_per_box)}
                    </span>
                    {avgCpp > 0 && (
                      <span className="text-purple-600 font-medium">ต้นทุน: {fmtB(avgCpp.toFixed(2))}/ซอง</span>
                    )}
                    <span className="text-gray-500">{lots.length} Lot</span>
                  </div>
                  <div className="p-4 space-y-2">
                    {lots.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูลการรับสินค้า</p>
                    ) : (() => {
                      const activeLots = []
                      const depletedLots = []
                      lots.forEach(lot => {
                        const lotWithdrawn = stockOut.filter(r => r.lot_number === lot.lot_number).reduce((a, r) => a + (r.quantity_packs || 0), 0)
                        const lotBalance = (lot.quantity_packs || 0) - lotWithdrawn
                        const lotOuts = stockOut.filter(r => r.lot_number === lot.lot_number)
                        const lastOut = lotOuts.length > 0 ? lotOuts.sort((a,b) => (b.withdrawn_at||"").localeCompare(a.withdrawn_at||""))[0] : null
                        const entry = { lot, lotWithdrawn, lotBalance, lastOut }
                        if (lotBalance <= 0) depletedLots.push(entry)
                        else activeLots.push(entry)
                      })
                      return (
                        <>
                          {/* Lot ที่ยังมีสต็อก */}
                          {activeLots.map(({ lot, lotWithdrawn, lotBalance }, i) => {
                            const cpp = (lot.quantity_packs || 0) > 0 ? (parseFloat(lot.total_cost) || 0) / lot.quantity_packs : 0
                            return (
                              <div key={i} className="p-3 rounded-xl border bg-gray-50 border-gray-100">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{lot.lot_number || "ไม่ระบุ"}</span>
                                      <span className="text-xs text-gray-500">{lot.source}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Clock size={10}/> {lot.purchased_at?.slice(0,10)}</p>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-green-600">{fmtBoxPack(lotBalance, s.packs_per_box)}</p>
                                    <p className="text-xs text-gray-400">{fmt(lotBalance)} ซอง</p>
                                  </div>
                                </div>
                                {lot.quantity_packs > 0 && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                      <div className="h-1.5 rounded-full bg-green-400 transition-all" style={{width:`${Math.max(0,(lotBalance/lot.quantity_packs)*100)}%`}}/>
                                    </div>
                                    <span className="text-xs text-gray-400">{fmt(lotWithdrawn)}/{fmt(lot.quantity_packs)}</span>
                                  </div>
                                )}
                                <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                                  <div>
                                    <p className="text-xs text-gray-400">รับเข้า</p>
                                    <p className="text-xs font-bold text-blue-600">+{fmt(lot.quantity)} {UNIT_LABEL[lot.unit] || lot.unit}</p>
                                    <p className="text-xs text-blue-400">= {fmt(lot.quantity_packs)} ซอง</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-400">ต้นทุน/ซอง</p>
                                    <p className="text-xs font-bold text-purple-600">{fmtB(cpp.toFixed(2))}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-400">มูลค่า Lot</p>
                                    <p className="text-xs font-bold text-gray-800">{fmtB(lot.total_cost)}</p>
                                  </div>
                                </div>
                                {lot.note && <p className="text-xs text-gray-400 mt-1.5 italic">"{lot.note}"</p>}
                              </div>
                            )
                          })}

                          {/* Lot ที่ใช้หมดแล้ว — ซ่อนรายละเอียด */}
                          {depletedLots.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <p className="text-xs text-gray-400 mb-2">Lot ที่ใช้หมดแล้ว ({depletedLots.length})</p>
                              <div className="space-y-1">
                                {depletedLots.map(({ lot, lastOut }, i) => (
                                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 text-xs text-gray-400">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-gray-500">{lot.lot_number || "ไม่ระบุ"}</span>
                                      <span>{lot.source}</span>
                                      <span>· {fmt(lot.quantity_packs)} ซอง</span>
                                    </div>
                                    <span>
                                      ใช้หมด {lastOut?.withdrawn_at?.slice(0,10) || lot.purchased_at?.slice(0,10) || "—"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 2: STOCK
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// EDIT STOCK IN MODAL
// ─────────────────────────────────────────────
function EditStockInModal({ record, onSave, onClose, skus }) {
  const [form, setForm] = useState({
    lot_number:   record.lot_number || "",
    purchased_at: record.purchased_at?.slice(0,10) || today(),
    source:       record.source || "",
    sku_id:       record.sku_id || "OP 01",
    unit:         record.unit || "box",
    quantity:     String(record.quantity || 1),
    unit_cost:    String(record.unit_cost || ""),
    note:         record.note || "",
  })
  const [saving, setSaving] = useState(false)

  const sku       = skus.find(s => s.sku_id === form.sku_id)
  const qty       = parseInt(form.quantity) || 0
  const packs     = convertToPacks(qty, form.unit, sku)
  const unitCost  = parseFloat(form.unit_cost) || 0
  const totalCost = qty * unitCost
  const cpp       = packs > 0 ? totalCost / packs : 0

  const handleSave = async () => {
    if (!form.lot_number || !form.source || !qty || !unitCost) return
    setSaving(true)
    try {
      await onSave(record.id, {
        lot_number:    form.lot_number,
        purchased_at:  form.purchased_at,
        source:        form.source,
        sku_id:        form.sku_id,
        unit:          form.unit,
        quantity:      qty,
        quantity_packs: packs,
        unit_cost:     unitCost,
        total_cost:    totalCost,
        note:          form.note,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">แก้ไขข้อมูลการรับสินค้า</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">เลขที่ Lot</label>
              <input value={form.lot_number} onChange={e => setForm({...form, lot_number:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">วันที่ซื้อ</label>
              <input type="date" value={form.purchased_at} onChange={e => setForm({...form, purchased_at:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Supplier</label>
            <input value={form.source} onChange={e => setForm({...form, source:e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">สินค้า (SKU)</label>
            <select value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              {skus.map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
            </select>
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
          <div>
            <label className="block text-xs text-gray-500 mb-1">ราคาต้นทุนต่อหน่วย (บาท)</label>
            <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm({...form, unit_cost:e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
          </div>
          {qty > 0 && unitCost > 0 && (
            <div className="p-3 bg-blue-50 rounded-xl grid grid-cols-3 gap-2 text-center">
              <div><p className="text-xs text-gray-400">ซองรวม</p><p className="text-sm font-bold text-blue-700">{fmt(packs)}</p></div>
              <div><p className="text-xs text-gray-400">ต้นทุน/ซอง</p><p className="text-sm font-bold text-purple-600">{fmtB(cpp.toFixed(2))}</p></div>
              <div><p className="text-xs text-gray-400">มูลค่ารวม</p><p className="text-sm font-bold text-gray-800">{fmtB(totalCost)}</p></div>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
            <input value={form.note} onChange={e => setForm({...form, note:e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving || !form.lot_number || !form.source || !qty || !unitCost}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
            {saving ? <Loader2 size={15} className="animate-spin"/> : <CheckCircle size={15}/>}
            {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </div>
    </div>
  )
}

function genLotNumber() {
  const d = new Date()
  const ymd = d.toISOString().slice(0,10).replace(/-/g,"")
  const hm  = String(d.getHours()).padStart(2,"0") + String(d.getMinutes()).padStart(2,"0")
  return `LOT-${ymd}-${hm}`
}

function PageStock({ stockIn, stockBalance, onAddStockIn, onUpdateStockIn, onDeleteStockIn, skus, onAddSku, onDeactivateSku, onRecalcAvgCost }) {
  const [tab, setTab]       = useState("balance")
  const [search, setSearch] = useState("")
  const [seriesSel, setSeriesSel] = useState("ทั้งหมด")
  const [saving, setSaving] = useState(false)
  const [recalcSku, setRecalcSku] = useState("")
  const nowDate = () => new Date().toISOString().slice(0,10)
  const [lotFilter,   setLotFilter]   = useState("all")
  const [lotDate,     setLotDate]     = useState(nowDate())
  const [lotMonth,    setLotMonth]    = useState(nowDate().slice(0,7))
  const [lotYear,     setLotYear]     = useState(nowDate().slice(0,4))

  const filterLots = (list) => {
    const sorted = [...list].sort((a, b) => (b.purchased_at || b.created_at || "").localeCompare(a.purchased_at || a.created_at || ""))
    if (lotFilter === "day")   return sorted.filter(r => (r.purchased_at || r.created_at || "").slice(0,10) === lotDate)
    if (lotFilter === "month") return sorted.filter(r => (r.purchased_at || r.created_at || "").slice(0,7) === lotMonth)
    if (lotFilter === "year")  return sorted.filter(r => (r.purchased_at || r.created_at || "").slice(0,4) === lotYear)
    return sorted
  }

  const LotFilterBar = () => (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {[{v:"all",l:"ทั้งหมด"},{v:"day",l:"รายวัน"},{v:"month",l:"รายเดือน"},{v:"year",l:"รายปี"}].map(t => (
          <button key={t.v} onClick={() => setLotFilter(t.v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${lotFilter===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
            {t.l}
          </button>
        ))}
      </div>
      {lotFilter === "day" && (
        <input type="date" value={lotDate} onChange={e => setLotDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"/>
      )}
      {lotFilter === "month" && (
        <input type="month" value={lotMonth} onChange={e => setLotMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"/>
      )}
      {lotFilter === "year" && (
        <select value={lotYear} onChange={e => setLotYear(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200">
          {[...new Set(stockIn.map(r => (r.purchased_at || r.created_at || "").slice(0,4)).filter(Boolean))].sort().reverse()
            .map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      )}
    </div>
  )
  const [form, setForm]     = useState({
    lot_number:   genLotNumber(),
    sku_id:       "OP 01",
    source:       "",
    purchased_at: today(),
    unit:         "box",
    quantity:     "1",
    unit_cost:    "",
    note:         "",
  })
  const [toast, setToast]       = useState(null)
  const [editRecord, setEditRecord] = useState(null)   // record กำลัง edit
  const [deleteId, setDeleteId]     = useState(null)   // id กำลัง confirm ลบ
  const [deleting, setDeleting]     = useState(false)

  const handleDelete = async (id) => {
    setDeleting(true)
    try {
      await onDeleteStockIn(id)
      setDeleteId(null)
      showToast("ลบข้อมูลสำเร็จ")
    } catch (err) {
      showToast("ลบไม่สำเร็จ: " + err.message, "error")
    } finally {
      setDeleting(false)
    }
  }

  // Balance map from view
  const balMap = Object.fromEntries(stockBalance.map(r => [r.sku_id, {
    total_in:  parseFloat(r.total_in)  || 0,
    total_out: parseFloat(r.total_out) || 0,
    balance:   parseFloat(r.balance)   || 0,
  }]))

  const filtered = skus
    .filter(s => s.sku_id.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()))
    .filter(s => seriesSel === "ทั้งหมด" || s.series === seriesSel)

  const showToast = (msg, type="success") => {
    setToast({msg, type}); setTimeout(() => setToast(null), 3500)
  }

  const sku     = skus.find(s => s.sku_id === form.sku_id)
  const qty     = parseInt(form.quantity) || 0
  const packs   = convertToPacks(qty, form.unit, sku)
  const unitCost = parseFloat(form.unit_cost) || 0
  const totalCost = qty * unitCost
  const costPerPack = packs > 0 ? totalCost / packs : 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.lot_number || !form.source || !form.quantity || !form.unit_cost) {
      showToast("กรุณากรอกข้อมูลให้ครบถ้วน (เลขที่ Lot, Supplier, จำนวน, ราคาต้นทุน)", "error"); return
    }
    try {
      setSaving(true)
      await onAddStockIn({
        lot_number:    form.lot_number,
        sku_id:        form.sku_id,
        source:        form.source,
        unit:          form.unit,
        quantity:      qty,
        quantity_packs: packs,
        unit_cost:     unitCost,
        total_cost:    totalCost,
        purchased_at:  form.purchased_at,
        note:          form.note,
      })
      showToast(`บันทึกสำเร็จ: Lot ${form.lot_number} — ${packs} ซอง (${form.sku_id})`)
      setForm({
        lot_number:   genLotNumber(),
        sku_id:       form.sku_id,
        source:       form.source,
        purchased_at: today(),
        unit:         form.unit,
        quantity:     "1",
        unit_cost:    "",
        note:         "",
      })
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">จัดการสต็อกสินค้า</h1>
        <div className="flex items-center gap-2">
          <select value={recalcSku} onChange={e => setRecalcSku(e.target.value)}
            className="border border-purple-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200">
            <option value="">— เลือก SKU —</option>
            {skus.map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
          </select>
          <button onClick={async () => {
            if (!recalcSku) { alert("กรุณาเลือก SKU ก่อน"); return }
            if (!confirm(`คำนวณต้นทุนเฉลี่ยใหม่สำหรับ ${recalcSku}?`)) return
            await onRecalcAvgCost(recalcSku)
            alert(`คำนวณต้นทุน ${recalcSku} ใหม่เรียบร้อยแล้ว`)
            setRecalcSku("")
          }}
            disabled={!recalcSku}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 text-xs font-medium hover:bg-purple-50 disabled:opacity-40 transition-all">
            <RefreshCw size={14}/> คำนวณต้นทุนใหม่
          </button>
        </div>
      </div>

      {editRecord && (
        <EditStockInModal
          record={editRecord}
          skus={skus}
          onSave={async (id, data) => { await onUpdateStockIn(id, data); setEditRecord(null) }}
          onClose={() => setEditRecord(null)}
        />
      )}

      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error" ? <X size={16}/> : <CheckCircle size={16}/>} {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[{key:"balance",label:"สต็อกคงเหลือ"},{key:"addin",label:"รับสินค้าเข้า"},{key:"history",label:"ประวัติการรับ"},{key:"skus",label:"จัดการ SKU"}].map(t => (
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-1">บันทึกรับซื้อสินค้าเข้าสต็อก</h2>
            <p className="text-xs text-gray-400 mb-4">บันทึกแต่ละครั้งที่ซื้อสินค้าเข้ามา พร้อมระบุ Lot และต้นทุน</p>
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Lot + วันที่ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">เลขที่ Lot <span className="text-red-400">*</span></label>
                  <input value={form.lot_number} onChange={e => setForm({...form, lot_number:e.target.value})}
                    placeholder="LOT-YYYYMMDD-HHMM"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 font-mono"/>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">วันที่ซื้อ <span className="text-red-400">*</span></label>
                  <input type="date" value={form.purchased_at} onChange={e => setForm({...form, purchased_at:e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                </div>
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Supplier / แหล่งที่มา <span className="text-red-400">*</span></label>
                <input value={form.source} onChange={e => setForm({...form, source:e.target.value})}
                  placeholder="เช่น ตัวแทนจำหน่าย A, Bandai Thailand"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>

              {/* SKU */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">สินค้า (SKU) <span className="text-red-400">*</span></label>
                <select value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  {skus.map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
                </select>
              </div>

              {/* หน่วย + จำนวน */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">หน่วยที่ซื้อ</label>
                  <select value={form.unit} onChange={e => setForm({...form, unit:e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                    <option value="pack">ซอง (Pack)</option>
                    <option value="box">กล่อง (Box)</option>
                    <option value="cotton">Cotton</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">จำนวน <span className="text-red-400">*</span></label>
                  <input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                </div>
              </div>

              {/* ราคาต้นทุน */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">ราคาต้นทุนต่อ{form.unit === "pack" ? "ซอง" : form.unit === "box" ? "กล่อง" : "Cotton"} (บาท) <span className="text-red-400">*</span></label>
                <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm({...form, unit_cost:e.target.value})}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>

              {/* สรุปต้นทุน Lot */}
              {qty > 0 && unitCost > 0 && (
                <div className="p-4 bg-blue-50 rounded-xl space-y-2">
                  <p className="text-xs font-semibold text-blue-700 mb-2">สรุปต้นทุน Lot นี้</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">จำนวนซองรวม</span>
                    <span className="font-bold text-blue-700">{fmt(packs)} ซอง</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">ต้นทุนต่อซอง</span>
                    <span className="font-bold text-purple-700">{fmtB(costPerPack.toFixed(2))}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-blue-200 pt-2">
                    <span className="text-gray-700 font-medium">มูลค่ารวม Lot</span>
                    <span className="font-bold text-gray-800 text-base">{fmtB(totalCost)}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
                <input value={form.note} onChange={e => setForm({...form, note:e.target.value})}
                  placeholder="ไม่บังคับ เช่น ส่วนลด, โปรโมชัน"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>

              <button type="submit" disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin"/> : <PlusCircle size={16}/>}
                {saving ? "กำลังบันทึก..." : "บันทึกรับสินค้าเข้าสต็อก"}
              </button>
            </form>
          </div>

          {/* Lot Cost Summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-semibold text-gray-700">ประวัติ Lot ล่าสุด</h2>
              <LotFilterBar/>
            </div>
            {(() => { const filteredLots = filterLots(stockIn); return filteredLots.length === 0 ? (
              <p className="text-gray-400 text-sm">ยังไม่มีประวัติการรับสินค้า{lotFilter !== "all" ? "ในช่วงที่เลือก" : ""}</p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {filteredLots.map((r, i) => {
                  const s   = skus.find(sk => sk.sku_id === r.sku_id)
                  const cpp = r.quantity_packs > 0 ? r.total_cost / r.quantity_packs : 0
                  const isConfirmingDelete = deleteId === r.id
                  return (
                    <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                              {r.lot_number || "—"}
                            </span>
                            <span className="font-mono text-xs font-bold text-gray-700">{r.sku_id}</span>
                            <Badge series={s?.series || "OP"}/>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{r.source}</p>
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                            <Clock size={10}/> {r.purchased_at?.slice(0,10)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-blue-600">+{fmt(r.quantity_packs)} ซอง</p>
                          <p className="text-xs text-gray-500">{fmt(r.quantity)} {r.unit}</p>
                          <div className="flex gap-1 justify-end mt-1">
                            <button onClick={() => setEditRecord(r)}
                              className="p-1 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200">
                              <Pencil size={12}/>
                            </button>
                            <button onClick={() => setDeleteId(r.id)}
                              className="p-1 rounded-lg bg-red-100 text-red-500 hover:bg-red-200">
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                        <div><p className="text-xs text-gray-400">ต้นทุน/{r.unit}</p><p className="text-xs font-bold text-gray-700">{fmtB(r.unit_cost)}</p></div>
                        <div><p className="text-xs text-gray-400">ต้นทุน/ซอง</p><p className="text-xs font-bold text-purple-600">{fmtB(cpp.toFixed(2))}</p></div>
                        <div><p className="text-xs text-gray-400">มูลค่า Lot</p><p className="text-xs font-bold text-gray-800">{fmtB(r.total_cost)}</p></div>
                      </div>
                      {r.note && <p className="text-xs text-gray-400 mt-1 italic">"{r.note}"</p>}
                      {isConfirmingDelete && (
                        <div className="mt-2 pt-2 border-t border-red-100 flex items-center justify-between bg-red-50 rounded-lg p-2">
                          <p className="text-xs text-red-600 font-medium">ยืนยันลบ Lot นี้?</p>
                          <div className="flex gap-2">
                            <button onClick={() => setDeleteId(null)}
                              className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-white">
                              ยกเลิก
                            </button>
                            <button onClick={() => handleDelete(r.id)} disabled={deleting}
                              className="px-3 py-1 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
                              {deleting ? <Loader2 size={10} className="animate-spin"/> : <Trash2 size={10}/>}
                              ลบ
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
            })()}
          </div>
        </div>
      )}

      {/* ── Tab: History ── */}
      {tab === "history" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold text-gray-700">ประวัติรับซื้อสินค้า</h2>
            <LotFilterBar/>
          </div>
          {(() => { const filteredHistory = filterLots(stockIn); return filteredHistory.length === 0 ? (
            <p className="text-gray-400 text-sm">ยังไม่มีประวัติการรับสินค้า{lotFilter !== "all" ? "ในช่วงที่เลือก" : ""}</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {filteredHistory.map((r, i) => {
                  const cpp = r.quantity_packs > 0 ? r.total_cost / r.quantity_packs : 0
                  return (
                    <div key={i} className="p-3 rounded-xl bg-gray-50">
                      <div className="flex justify-between">
                        <div>
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{r.lot_number || "—"}</span>
                          <span className="ml-2 font-mono text-xs font-bold text-gray-700">{r.sku_id}</span>
                        </div>
                        <span className="text-xs text-gray-400">{r.purchased_at?.slice(0,10)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{r.source}</p>
                      <div className="flex justify-between mt-1 text-xs">
                        <span className="text-gray-500">{fmt(r.quantity)} {r.unit} = {fmt(r.quantity_packs)} ซอง</span>
                        <span className="font-bold text-gray-800">{fmtB(r.total_cost)}</span>
                      </div>
                      <div className="text-xs text-purple-600 mt-0.5">ต้นทุน/ซอง: {fmtB(cpp.toFixed(2))}</div>
                    </div>
                  )
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["วันที่","เลขที่ Lot","SKU","Supplier","หน่วย","จำนวน","ซอง","ต้นทุน/หน่วย","ต้นทุน/ซอง","มูลค่า Lot","หมายเหตุ"].map(h => (
                        <th key={h} className="text-left py-2 text-xs text-gray-400 font-medium pr-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((r, i) => {
                      const cpp = r.quantity_packs > 0 ? r.total_cost / r.quantity_packs : 0
                      return (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 pr-3 text-gray-500 text-xs whitespace-nowrap">{r.purchased_at?.slice(0,10)}</td>
                          <td className="py-2 pr-3 font-mono text-xs font-bold text-blue-700">{r.lot_number || "—"}</td>
                          <td className="py-2 pr-3 font-mono font-bold text-xs text-gray-700">{r.sku_id}</td>
                          <td className="py-2 pr-3 text-gray-600 text-xs">{r.source}</td>
                          <td className="py-2 pr-3 text-gray-500 text-xs">{r.unit}</td>
                          <td className="py-2 pr-3 text-right font-medium">{fmt(r.quantity)}</td>
                          <td className="py-2 pr-3 text-right text-blue-600 font-bold">+{fmt(r.quantity_packs)}</td>
                          <td className="py-2 pr-3 text-right text-gray-600">{fmtB(r.unit_cost)}</td>
                          <td className="py-2 pr-3 text-right text-purple-600 font-medium">{fmtB(cpp.toFixed(2))}</td>
                          <td className="py-2 pr-3 text-right font-semibold">{fmtB(r.total_cost)}</td>
                          <td className="py-2 text-gray-400 text-xs">{r.note || "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
          })()}
        </div>
      )}

      {/* ── Tab: Manage SKUs ── */}
      {tab === "skus" && (
        <SkuManager skus={skus} onAddSku={onAddSku} onDeactivateSku={onDeactivateSku} showToast={showToast}/>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// SKU MANAGER (Add / Deactivate)
// ─────────────────────────────────────────────
function SkuManager({ skus, onAddSku, onDeactivateSku, showToast }) {
  const [saving, setSaving]       = useState(false)
  const [deactId, setDeactId]     = useState(null)
  const [deacting, setDeacting]   = useState(false)
  const [form, setForm] = useState({
    sku_id:           "",
    name:             "",
    series:           "OP",
    packs_per_box:    "24",
    boxes_per_cotton: "12",
    sell_price:       "",
    cost_price:       "",
  })

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.sku_id || !form.name) return
    setSaving(true)
    try {
      await onAddSku({
        sku_id:           form.sku_id.trim().toUpperCase(),
        name:             form.name.trim(),
        series:           form.series,
        packs_per_box:    parseInt(form.packs_per_box) || 24,
        boxes_per_cotton: parseInt(form.boxes_per_cotton) || 12,
        sell_price:       parseFloat(form.sell_price) || 0,
        cost_price:       parseFloat(form.cost_price) || 0,
        is_active:        true,
      })
      showToast(`เพิ่ม SKU ${form.sku_id} สำเร็จ`)
      setForm({ sku_id:"", name:"", series:"OP", packs_per_box:"12", boxes_per_cotton:"12", sell_price:"", cost_price:"" })
    } catch (err) {
      showToast("เพิ่มไม่สำเร็จ: " + err.message, "error")
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (skuId) => {
    setDeacting(true)
    try {
      await onDeactivateSku(skuId)
      setDeactId(null)
      showToast(`ปิดใช้งาน ${skuId} สำเร็จ`)
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error")
    } finally {
      setDeacting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Add form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-1">เพิ่ม SKU ใหม่</h2>
        <p className="text-xs text-gray-400 mb-4">เพิ่มสินค้าใหม่เข้าระบบ ก่อนจะบันทึกรับสต็อกได้</p>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">รหัส SKU <span className="text-red-400">*</span></label>
              <input value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value})}
                placeholder="เช่น OP 16, EB 05"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Series <span className="text-red-400">*</span></label>
              <select value={form.series} onChange={e => setForm({...form, series:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="OP">OP — One Piece</option>
                <option value="PRB">PRB — Premium Booster</option>
                <option value="EB">EB — Extra Booster</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ชื่อสินค้า <span className="text-red-400">*</span></label>
            <input value={form.name} onChange={e => setForm({...form, name:e.target.value})}
              placeholder="เช่น One Piece OP-16"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">ซอง/กล่อง</label>
              <input type="number" min="1" value={form.packs_per_box} onChange={e => setForm({...form, packs_per_box:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              <p className="text-xs text-gray-400 mt-0.5">OP/EB=24, PRB=10</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">กล่อง/Cotton</label>
              <input type="number" min="1" value={form.boxes_per_cotton} onChange={e => setForm({...form, boxes_per_cotton:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">ราคาขาย/ซอง (บาท)</label>
              <input type="number" min="0" step="0.01" value={form.sell_price} onChange={e => setForm({...form, sell_price:e.target.value})}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ต้นทุน/ซอง (บาท)</label>
              <input type="number" min="0" step="0.01" value={form.cost_price} onChange={e => setForm({...form, cost_price:e.target.value})}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
          </div>
          <button type="submit" disabled={saving || !form.sku_id || !form.name}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin"/> : <PlusCircle size={16}/>}
            {saving ? "กำลังบันทึก..." : "เพิ่ม SKU ใหม่"}
          </button>
        </form>
      </div>

      {/* SKU list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-3">SKU ที่ใช้งานอยู่ ({skus.length})</h2>
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {skus.map(s => (
            <div key={s.sku_id} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-gray-800">{s.sku_id}</span>
                    <Badge series={s.series}/>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.packs_per_box} ซอง/กล่อง · ขาย {fmtB(s.sell_price)} · ต้นทุน {fmtB(s.cost_price)}
                  </p>
                </div>
                <button onClick={() => setDeactId(s.sku_id)}
                  className="p-1.5 rounded-lg bg-red-100 text-red-500 hover:bg-red-200 flex-shrink-0">
                  <Trash2 size={13}/>
                </button>
              </div>
              {deactId === s.sku_id && (
                <div className="mt-2 pt-2 border-t border-red-100 flex items-center justify-between bg-red-50 rounded-lg p-2">
                  <p className="text-xs text-red-600 font-medium">ปิดใช้งาน {s.sku_id}?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setDeactId(null)}
                      className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-white">ยกเลิก</button>
                    <button onClick={() => handleDeactivate(s.sku_id)} disabled={deacting}
                      className="px-3 py-1 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
                      {deacting ? <Loader2 size={10} className="animate-spin"/> : <Trash2 size={10}/>} ปิด
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 3: WITHDRAWAL
// ─────────────────────────────────────────────
function PageWithdrawal({ machines, stockOut, stockIn, stockBalance, onAddStockOut, onDeleteStockOut, skus }) {
  const nowDate = () => new Date().toISOString().slice(0,10)
  const nowTime = () => new Date().toTimeString().slice(0,5)
  const [form, setForm]   = useState({ sku_id:"", lot_number:"", machine_id:"", unit:"box", quantity:"1", note:"", date: nowDate(), time: nowTime() })
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)

  const [deleteOutId, setDeleteOutId] = useState(null)
  const [deletingOut, setDeletingOut] = useState(false)
  const [historyFilter, setHistoryFilter] = useState("all")
  const [historyDate,   setHistoryDate]   = useState(nowDate())
  const [historyMonth,  setHistoryMonth]  = useState(nowDate().slice(0,7))
  const [historyYear,   setHistoryYear]   = useState(nowDate().slice(0,4))

  const handleDeleteOut = async (id) => {
    setDeletingOut(true)
    try {
      await onDeleteStockOut(id)
      setDeleteOutId(null)
      showToast("ลบรายการเบิกสำเร็จ")
    } catch (err) {
      showToast("ลบไม่สำเร็จ: " + err.message, "error")
    } finally {
      setDeletingOut(false)
    }
  }

  const machineId   = form.machine_id || machines[0]?.machine_id || ""
  const balMap      = Object.fromEntries(stockBalance.map(r => [r.sku_id, parseFloat(r.balance) || 0]))
  const available   = balMap[form.sku_id] || 0
  const selectedSku = skus.find(s => s.sku_id === form.sku_id)
  const availBoxes  = selectedSku ? Math.floor(available / selectedSku.packs_per_box) : 0

  // ── Lot options สำหรับ SKU ที่เลือก (group by lot_number เพื่อไม่ให้ซ้ำ) ──
  const skuLots = (() => {
    if (!form.sku_id) return []
    const lotMap = {}
    stockIn
      .filter(r => r.sku_id === form.sku_id && r.lot_number)
      .forEach(r => {
        if (!lotMap[r.lot_number]) {
          lotMap[r.lot_number] = { ...r, quantity_packs: 0, total_cost: 0 }
        }
        lotMap[r.lot_number].quantity_packs += r.quantity_packs || 0
        lotMap[r.lot_number].total_cost += parseFloat(r.total_cost) || 0
      })
    return Object.values(lotMap).map(r => {
      const withdrawn = stockOut
        .filter(so => so.lot_number === r.lot_number && so.sku_id === r.sku_id)
        .reduce((a, so) => a + (so.quantity_packs || 0), 0)
      return { ...r, lotBalance: r.quantity_packs - withdrawn }
    }).sort((a, b) => new Date(a.purchased_at) - new Date(b.purchased_at))
  })()

  const availableLots = skuLots.filter(r => r.lotBalance > 0)
  const selectedLot   = skuLots.find(r => r.lot_number === form.lot_number)

  // คำนวณซองที่จะเบิก
  const withdrawQty   = parseInt(form.quantity) || 0
  const withdrawPacks = form.unit === "box"
    ? withdrawQty * (selectedSku?.packs_per_box || 24)
    : withdrawQty
  const overStock = withdrawPacks > available
  const overLot   = selectedLot && withdrawPacks > selectedLot.lotBalance

  const showToast = (msg, type="success") => {
    setToast({msg, type}); setTimeout(() => setToast(null), 3500)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.sku_id)  { showToast("กรุณาเลือกสินค้า","error"); return }
    if (!withdrawQty || withdrawQty <= 0) { showToast("กรุณาระบุจำนวนที่ถูกต้อง","error"); return }
    if (!machineId)    { showToast("กรุณาเลือกตู้ปลายทาง","error"); return }
    if (overStock)     { showToast(`สต็อกไม่เพียงพอ: คงเหลือ ${available} ซอง`, "error"); return }
    if (overLot)       { showToast(`เกินสต็อก Lot นี้: คงเหลือ ${fmt(selectedLot.lotBalance)} ซอง`, "error"); return }
    if (availableLots.length > 0 && !form.lot_number) { showToast("กรุณาเลือก Lot ที่จะเบิก","error"); return }
    try {
      setSaving(true)
      const machine = machines.find(m => m.machine_id === machineId)
      await onAddStockOut({
        sku_id:         form.sku_id,
        lot_number:     form.lot_number || null,
        machine_id:     machineId,
        quantity_packs: withdrawPacks,
        withdrawn_at:   `${form.date}T${form.time}:00`,
        note:           form.note
          ? `[${form.unit === "box" ? withdrawQty+"กล่อง" : withdrawQty+"ซอง"}] ${form.note}`
          : `[${form.unit === "box" ? withdrawQty+"กล่อง" : withdrawQty+"ซอง"}]`,
      })
      showToast(`เบิกสำเร็จ: ${form.sku_id}${form.lot_number ? ` (${form.lot_number})` : ""} → ${machine?.name ?? machineId} ${fmt(withdrawPacks)} ซอง`)
      setForm(f => ({...f, sku_id:"", lot_number:"", quantity:"1", note:""}))
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
          <h2 className="font-semibold text-gray-700 mb-1">บันทึกการเบิกสินค้าเติมตู้</h2>
          <p className="text-xs text-gray-400 mb-4">เลือกเบิกเป็น กล่อง หรือ ซอง ระบบจะคำนวณจำนวนซองให้อัตโนมัติ</p>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* SKU */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">สินค้า (SKU)</label>
              <select value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value, lot_number:""})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="" disabled>— เลือกสินค้า —</option>
                {skus.map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
              </select>
            </div>

            {/* เลือก Lot */}
            {skuLots.length > 0 && (
              <div>
                <label className="block text-xs text-gray-500 mb-2">
                  เลือก Lot ที่จะเบิก <span className="text-red-400">*</span>
                  <span className="ml-1 text-gray-400">({availableLots.length}/{skuLots.length} Lot มีสต็อก)</span>
                </label>
                <div className="space-y-2">
                  {skuLots.map(lot => {
                    const isSelected = form.lot_number === lot.lot_number
                    const depleted   = lot.lotBalance <= 0
                    const lotBoxes   = Math.floor(lot.lotBalance / (selectedSku?.packs_per_box || 24))
                    const lotRem     = lot.lotBalance % (selectedSku?.packs_per_box || 24)
                    return (
                      <button type="button" key={lot.lot_number}
                        disabled={depleted}
                        onClick={() => setForm({...form, lot_number: isSelected ? "" : lot.lot_number})}
                        className={`w-full p-3 rounded-xl border-2 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed
                          ${isSelected ? "border-orange-400 bg-orange-50" : depleted ? "border-gray-200 bg-gray-50" : "border-gray-200 hover:border-orange-300"}`}>
                        {/* แจ้งเตือนถ้า lot_number ไม่ตรงกับ SKU ที่เลือก */}
                        {lot.lot_number && !lot.lot_number.toUpperCase().includes(form.sku_id.replace(" ","")) && (
                          <p className="text-xs text-red-500 font-medium mb-1">⚠ Lot นี้อาจบันทึกผิด SKU — ชื่อ Lot ไม่ตรงกับ {form.sku_id}</p>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${isSelected ? "bg-orange-100 text-orange-700" : "bg-blue-50 text-blue-700"}`}>
                              {lot.lot_number}
                            </span>
                            <span className="text-xs text-gray-500 ml-2">{lot.source}</span>
                            <span className="text-xs text-gray-400 ml-1">· {lot.purchased_at?.slice(0,10)}</span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-bold ${depleted ? "text-gray-400" : isSelected ? "text-orange-600" : "text-green-600"}`}>
                              {fmt(lot.lotBalance)} ซอง
                            </p>
                            <p className="text-xs text-gray-400">
                              {depleted ? "หมดแล้ว" : `${lotBoxes > 0 ? lotBoxes+"กล่อง" : ""}${lotBoxes>0&&lotRem>0?"+":""}${lotRem>0?lotRem+"ซอง":""}`}
                            </p>
                          </div>
                        </div>
                        {/* Progress */}
                        {lot.quantity_packs > 0 && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-1">
                              <div className={`h-1 rounded-full transition-all ${isSelected?"bg-orange-400":"bg-green-400"}`}
                                style={{width:`${Math.max(0,(lot.lotBalance/lot.quantity_packs)*100)}%`}}/>
                            </div>
                            <span className="text-xs text-gray-400">{fmt(lot.lotBalance)}/{fmt(lot.quantity_packs)}</span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* สต็อกคงเหลือ */}
            <div className={`p-3 rounded-xl text-sm grid grid-cols-2 gap-2 ${available < 24 ? "bg-amber-50":"bg-green-50"}`}>
              <div className="text-center">
                <p className={`text-xs ${available < 24 ? "text-amber-500":"text-green-500"}`}>
                  {selectedLot ? `Lot นี้คงเหลือ` : "คงเหลือรวม (ซอง)"}
                </p>
                <p className={`text-lg font-bold ${available < 24 ? "text-amber-700":"text-green-700"}`}>
                  {fmt(selectedLot ? selectedLot.lotBalance : available)}
                </p>
              </div>
              <div className="text-center border-l border-white/60">
                <p className={`text-xs ${available < 24 ? "text-amber-500":"text-green-500"}`}>
                  {selectedLot ? "คงเหลือ (กล่อง)" : "คงเหลือ (กล่อง)"}
                </p>
                <p className={`text-lg font-bold ${available < 24 ? "text-amber-700":"text-green-700"}`}>
                  {selectedLot
                    ? Math.floor(selectedLot.lotBalance / (selectedSku?.packs_per_box || 24))
                    : availBoxes}
                  <span className="text-xs font-normal ml-1">({selectedSku?.packs_per_box} ซอง/กล่อง)</span>
                </p>
              </div>
            </div>

            {/* เลือกหน่วย */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">เบิกเป็น</label>
              <div className="grid grid-cols-2 gap-2">
                {[{v:"box",l:"กล่อง (Box)",sub:`${selectedSku?.packs_per_box} ซอง/กล่อง`},
                  {v:"pack",l:"ซอง (Pack)",sub:"ระบุจำนวนซองตรงๆ"}].map(opt => (
                  <button type="button" key={opt.v}
                    onClick={() => setForm({...form, unit:opt.v, quantity:"1"})}
                    className={`py-3 px-4 rounded-xl border-2 text-left transition-all ${form.unit===opt.v?"border-orange-400 bg-orange-50":"border-gray-200 hover:border-gray-300"}`}>
                    <p className={`text-sm font-bold ${form.unit===opt.v?"text-orange-700":"text-gray-700"}`}>{opt.l}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* จำนวน */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                จำนวน{form.unit === "box" ? "กล่อง" : "ซอง"}
              </label>
              <input type="number" min="1"
                max={form.unit === "box" ? availBoxes : available}
                value={form.quantity}
                onChange={e => setForm({...form, quantity:e.target.value})}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 ${overStock?"border-red-300":"border-gray-200"}`}/>

              {/* สรุปการเบิก */}
              {withdrawQty > 0 && (
                <div className={`mt-2 p-3 rounded-xl text-sm ${overStock?"bg-red-50 text-red-700":"bg-orange-50 text-orange-700"}`}>
                  {form.unit === "box" ? (
                    <span>
                      เบิก <span className="font-bold">{withdrawQty} กล่อง</span>
                      {" = "}
                      <span className="font-bold">{fmt(withdrawPacks)} ซอง</span>
                    </span>
                  ) : (
                    <span>เบิก <span className="font-bold">{fmt(withdrawPacks)} ซอง</span></span>
                  )}
                  {(overStock || overLot) && <span className="ml-2 font-semibold">⚠️ เกินสต็อก{overLot && !overStock ? " Lot" : ""}!</span>}
                  {!overStock && !overLot && (
                    <span className="ml-2 text-xs opacity-70">
                      เหลือ {fmt((selectedLot ? selectedLot.lotBalance : available) - withdrawPacks)} ซอง
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* วันที่และเวลา */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">วันที่เบิก</label>
                <input type="date" value={form.date} onChange={e => setForm({...form, date:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">เวลา</label>
                <input type="time" value={form.time} onChange={e => setForm({...form, time:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
              </div>
            </div>

            {/* ตู้ปลายทาง */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">ตู้ปลายทาง</label>
              <div className={`grid gap-2 ${machines.length <= 2 ? "grid-cols-2" : "grid-cols-2"}`}>
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

            {/* หมายเหตุ */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">หมายเหตุ (ไม่บังคับ)</label>
              <input value={form.note} onChange={e => setForm({...form, note:e.target.value})}
                placeholder="เช่น เติมเพิ่มหลังงานอีเว้นท์"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
            </div>

            <button type="submit" disabled={saving || overStock || overLot}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin"/> : <ArrowUpCircle size={16}/>}
              {saving ? "กำลังบันทึก..." : `บันทึกเบิก ${withdrawQty > 0 ? fmt(withdrawPacks)+" ซอง" : ""}`}
            </button>
          </form>
        </div>

        {/* History */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold text-gray-700">ประวัติการเบิกสินค้า</h2>
            <div className="flex gap-2 items-center">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {[{v:"all",l:"ทั้งหมด"},{v:"day",l:"รายวัน"},{v:"month",l:"รายเดือน"},{v:"year",l:"รายปี"}].map(t => (
                  <button key={t.v} onClick={() => setHistoryFilter(t.v)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${historyFilter===t.v?"bg-white shadow text-orange-600":"text-gray-500"}`}>
                    {t.l}
                  </button>
                ))}
              </div>
              {historyFilter === "day" && (
                <input type="date" value={historyDate} onChange={e => setHistoryDate(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200"/>
              )}
              {historyFilter === "month" && (
                <input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200"/>
              )}
              {historyFilter === "year" && (
                <select value={historyYear} onChange={e => setHistoryYear(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200">
                  {[...new Set(stockOut.map(r => r.withdrawn_at?.slice(0,4)).filter(Boolean))].sort().reverse()
                    .map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </div>
          </div>
          {(() => {
            const sorted = [...stockOut].sort((a, b) => (b.withdrawn_at || "").localeCompare(a.withdrawn_at || ""))
            const filtered = historyFilter === "day" ? sorted.filter(r => r.withdrawn_at?.slice(0,10) === historyDate)
              : historyFilter === "month" ? sorted.filter(r => r.withdrawn_at?.slice(0,7) === historyMonth)
              : historyFilter === "year" ? sorted.filter(r => r.withdrawn_at?.slice(0,4) === historyYear)
              : sorted
            return filtered.length === 0 ? (
            <p className="text-gray-400 text-sm">ยังไม่มีประวัติการเบิก{historyFilter !== "all" ? "ในช่วงที่เลือก" : ""}</p>
          ) : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {filtered.map((r, i) => {
                const sku     = skus.find(s => s.sku_id === r.sku_id)
                const machine = machines.find(m => m.machine_id === r.machine_id)
                const unitMatch = r.note?.match(/^\[(\d+)(กล่อง|ซอง)\]/)
                const cleanNote = r.note?.replace(/^\[\d+(กล่อง|ซอง)\]\s*/, "") || ""
                const isConfirming = deleteOutId === r.id
                return (
                  <div key={i} className="p-3 rounded-xl bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-gray-700">{r.sku_id}</span>
                          <Badge series={sku?.series || "OP"}/>
                          {r.lot_number && (
                            <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                              {r.lot_number}
                            </span>
                          )}
                          {unitMatch && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                              {unitMatch[1]} {unitMatch[2]}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          → <span className="font-medium text-orange-600">{machine?.name ?? r.machine_id}</span>
                        </p>
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Clock size={10}/> {r.withdrawn_at?.slice(0,10)} {r.withdrawn_at?.slice(11,16) || ""}
                        </p>
                        {cleanNote && <p className="text-xs text-gray-400 mt-0.5 italic">"{cleanNote}"</p>}
                      </div>
                      <div className="flex-shrink-0 ml-2 text-right">
                        <span className="text-orange-500 font-bold text-sm block">
                          -{fmt(r.quantity_packs)} ซอง
                        </span>
                        <button onClick={() => setDeleteOutId(r.id)}
                          className="mt-1 p-1 rounded-lg bg-red-100 text-red-500 hover:bg-red-200">
                          <Trash2 size={12}/>
                        </button>
                      </div>
                    </div>
                    {isConfirming && (
                      <div className="mt-2 pt-2 border-t border-red-100 flex items-center justify-between bg-red-50 rounded-lg p-2">
                        <p className="text-xs text-red-600 font-medium">ยืนยันลบรายการนี้?</p>
                        <div className="flex gap-2">
                          <button onClick={() => setDeleteOutId(null)}
                            className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-white">
                            ยกเลิก
                          </button>
                          <button onClick={() => handleDeleteOut(r.id)} disabled={deletingOut}
                            className="px-3 py-1 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
                            {deletingOut ? <Loader2 size={10} className="animate-spin"/> : <Trash2 size={10}/>}
                            ลบ
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
          })()}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SALES: SKU × Machine breakdown
// ─────────────────────────────────────────────
function SalesSkuByMachine({ sales, machines, skus }) {
  const [expandedMachine, setExpandedMachine] = useState(null)
  const [sortBy, setSortBy] = useState("rev") // rev, qty
  const [dateFilter, setDateFilter] = useState("all") // all, daily
  const [selectedDate, setSelectedDate] = useState(today())

  // วันที่ที่มีข้อมูล (สำหรับ quick nav)
  const availDates = [...new Set(sales.map(r => r.sold_at).filter(Boolean))].sort().reverse()

  // กรองตามวัน
  const filteredSales = dateFilter === "daily"
    ? sales.filter(r => r.sold_at === selectedDate)
    : sales

  // สร้าง map: machine → sku → { packQty, boxQty, rev }
  // packQty = จำนวนซองจากการขายแบบซองเท่านั้น (ไม่รวมกล่อง)
  // boxQty  = จำนวนกล่องจากการขายแบบกล่อง
  const machineSkuMap = {}
  machines.forEach(m => { machineSkuMap[m.machine_id] = {} })
  filteredSales.forEach(r => {
    if (!machineSkuMap[r.machine_id]) machineSkuMap[r.machine_id] = {}
    if (!machineSkuMap[r.machine_id][r.sku_id]) machineSkuMap[r.machine_id][r.sku_id] = { packQty:0, boxQty:0, rev:0 }
    const raw = (r.product_name_raw || "").toLowerCase()
    const isBox = raw.includes("(box)") || raw.split(/\s+/).includes("box")
    if (isBox) {
      machineSkuMap[r.machine_id][r.sku_id].boxQty += 1
    } else {
      machineSkuMap[r.machine_id][r.sku_id].packQty += r.quantity_sold || 0
    }
    machineSkuMap[r.machine_id][r.sku_id].rev += r.revenue || 0
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-gray-700">
          รายการขายแยก SKU ต่อตู้
          {dateFilter === "daily" && <span className="text-sm font-normal text-gray-400 ml-2">({fmtDayLabel(selectedDate)})</span>}
        </h2>
        <div className="flex flex-wrap gap-2 items-center">
          {/* ตัวกรองวัน */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"all",l:"ทั้งหมด"},{v:"daily",l:"รายวัน"}].map(t => (
              <button key={t.v} onClick={() => setDateFilter(t.v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${dateFilter===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
          {dateFilter === "daily" && (
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"/>
          )}
          {/* เรียงลำดับ */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"rev",l:"ยอดขาย"},{v:"qty",l:"จำนวน"}].map(t => (
              <button key={t.v} onClick={() => setSortBy(t.v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${sortBy===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {machines.map((m, mi) => {
          const skuData = machineSkuMap[m.machine_id] || {}
          const skuList = Object.entries(skuData)
            .map(([skuId, v]) => {
              const s = skus.find(sk => sk.sku_id === skuId)
              return { sku_id: skuId, series: s?.series || "OP", name: s?.name || skuId, ...v }
            })
            .sort((a, b) => sortBy === "rev" ? b.rev - a.rev : b.qty - a.qty)
          const machineTotal = skuList.reduce((a, r) => a + r.rev, 0)
          const machineTotalPack = skuList.reduce((a, r) => a + r.packQty, 0)
          const machineTotalBox = skuList.reduce((a, r) => a + r.boxQty, 0)
          const machineTxn = new Set(filteredSales.filter(r => r.machine_id === m.machine_id).map(r => r.transaction_id).filter(Boolean)).size
          const isExpanded = expandedMachine === m.machine_id

          return (
            <div key={m.machine_id} className="border border-gray-100 rounded-xl overflow-hidden">
              {/* Machine header */}
              <button onClick={() => setExpandedMachine(isExpanded ? null : m.machine_id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: CHART_COLORS[mi]}}/>
                  <div className="text-left">
                    <p className="font-semibold text-sm text-gray-800">{m.name}</p>
                    <p className="text-xs text-gray-400">{m.location} · {skuList.length} SKU</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">{fmtB(machineTotal)}</p>
                    <p className="text-xs text-gray-400">{fmt(machineTxn)} ธุรกรรม · {machineTotalBox > 0 ? `${fmt(machineTotalBox)} กล่อง · ` : ""}{fmt(machineTotalPack)} ซอง</p>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                </div>
              </button>

              {/* SKU list */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {skuList.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูลการขาย</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left py-2 px-4 text-xs text-gray-400 font-medium">#</th>
                            <th className="text-left py-2 px-2 text-xs text-gray-400 font-medium">SKU</th>
                            <th className="text-left py-2 px-2 text-xs text-gray-400 font-medium">ชื่อสินค้า</th>
                            <th className="text-center py-2 px-2 text-xs text-gray-400 font-medium">Series</th>
                            <th className="text-right py-2 px-2 text-xs text-red-400 font-medium">กล่องที่ขาย</th>
                            <th className="text-right py-2 px-2 text-xs text-gray-400 font-medium">ซองที่ขาย</th>
                            <th className="text-right py-2 px-2 text-xs text-gray-400 font-medium">ยอดขาย</th>
                            <th className="py-2 px-4 text-xs text-gray-400 font-medium w-24">สัดส่วน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {skuList.map((r, i) => {
                            const maxVal = skuList[0]?.[sortBy] || 1
                            const pct = (r[sortBy] / maxVal) * 100
                            return (
                              <tr key={r.sku_id} className={`border-b border-gray-50 hover:bg-gray-50 ${i < 3 ? "bg-yellow-50/30" : ""}`}>
                                <td className="py-2 px-4 text-center">
                                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":<span className="text-gray-400 text-xs">{i+1}</span>}
                                </td>
                                <td className="py-2 px-2 font-mono text-xs font-bold text-gray-700">{r.sku_id}</td>
                                <td className="py-2 px-2 text-xs text-gray-500 truncate max-w-[120px]">{r.name}</td>
                                <td className="py-2 px-2 text-center"><Badge series={r.series}/></td>
                                <td className="py-2 px-2 text-right font-medium text-red-500">{r.boxQty > 0 ? fmt(r.boxQty) : "-"}</td>
                                <td className="py-2 px-2 text-right font-medium text-blue-600">{r.packQty > 0 ? fmt(r.packQty) : "-"}</td>
                                <td className="py-2 px-2 text-right font-semibold text-green-600">{fmtB(r.rev)}</td>
                                <td className="py-2 px-4">
                                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-blue-400 transition-all" style={{width:`${pct}%`}}/>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 font-semibold">
                            <td colSpan={4} className="py-2 px-4 text-xs text-gray-500">รวม {m.name}</td>
                            <td className="py-2 px-2 text-right text-red-600 text-xs">{fmt(machineTotalBox)} กล่อง</td>
                            <td className="py-2 px-2 text-right text-blue-700 text-xs">{fmt(machineTotalPack)} ซอง</td>
                            <td className="py-2 px-2 text-right text-green-700 text-xs">{fmtB(machineTotal)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 4: SALES
// ─────────────────────────────────────────────
function PageSales({ machines, sales, skus, claims, onRefresh }) {
  const [viewMode, setViewMode]   = useState("daily")
  const [machineSel, setMachineSel] = useState("all")
  const [syncing, setSyncing]     = useState(false)
  const [syncMsg, setSyncMsg]     = useState(null)

  const triggerSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch("/api/vms-sync", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSyncMsg({ type:"success", text:"สั่งดึงข้อมูลสำเร็จ — รอประมาณ 2-3 นาที แล้วกด refresh" })
      } else {
        setSyncMsg({ type:"error", text: data.error || "เกิดข้อผิดพลาด" })
      }
    } catch (err) {
      setSyncMsg({ type:"error", text: err.message })
    } finally {
      setSyncing(false)
    }
  }

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
  const totalTxn = new Set(filtered.map(r => r.transaction_id).filter(Boolean)).size
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

  // Profit estimate (หักยอดคืนเงินจากเคลม)
  const totalRefund = (claims || []).reduce((a, c) => a + (parseFloat(c.refund_amount) || 0), 0)
  const profit = filtered.reduce((a, r) => {
    const s = skus.find(sk => sk.sku_id === r.sku_id)
    const cost = (s?.avg_cost || s?.cost_price || 0) * (r.quantity_sold || 0)
    return a + (r.revenue || 0) - cost
  }, 0) - totalRefund

  return (
    <div className="space-y-6">
      {/* Sync message */}
      {syncMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${syncMsg.type==="success"?"bg-green-50 text-green-700 border border-green-200":"bg-red-50 text-red-700 border border-red-200"}`}>
          {syncMsg.type==="success" ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
          <span className="flex-1">{syncMsg.text}</span>
          {syncMsg.type==="success" && (
            <button onClick={onRefresh} className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 flex items-center gap-1">
              <RefreshCw size={12}/> Refresh
            </button>
          )}
          <button onClick={() => setSyncMsg(null)} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">ยอดขาย (30 วันล่าสุด)</h1>
        <div className="flex gap-2 flex-wrap items-center">
          {/* ปุ่มดึงข้อมูล VMS */}
          <button onClick={triggerSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {syncing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            {syncing ? "กำลังสั่ง..." : "ดึงข้อมูล VMS"}
          </button>
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">ยอดขายรวม (30 วัน)</p>
              <p className="text-xl font-bold text-green-600 mt-1">{fmtB(totalRev)}</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">จำนวนธุรกรรม</p>
              <p className="text-xl font-bold text-indigo-600 mt-1">{fmt(totalTxn)} <span className="text-sm font-normal text-gray-400">ครั้ง</span></p>
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

          {/* รายการขายแยก SKU ต่อตู้ */}
          <SalesSkuByMachine sales={filtered} machines={machines} skus={skus}/>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 5: CLAIMS (เคลม/คืนเงิน)
// ─────────────────────────────────────────────
function PageClaims({ machines, skus, claims, onAddClaim, onConfirmClaim, onDeleteClaim }) {
  const [form, setForm] = useState({
    machine_id:"", sku_id:"", quantity:"1", refund_amount:"",
    product_status:"returned", reason:"สินค้าไม่ตก", note:"",
    claimed_at: new Date().toISOString().slice(0,10),
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(() => setToast(null), 3000) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.machine_id) { showToast("กรุณาเลือกตู้","error"); return }
    if (!form.sku_id)     { showToast("กรุณาเลือกสินค้า","error"); return }
    if (form.product_status !== "lost" && (!form.refund_amount || parseFloat(form.refund_amount) <= 0)) { showToast("กรุณาระบุยอดคืนเงิน","error"); return }
    if (!form.claimed_at) { showToast("กรุณาระบุวันที่เคลม","error"); return }
    try {
      setSaving(true)
      await onAddClaim({
        machine_id:     form.machine_id,
        sku_id:         form.sku_id,
        quantity:       parseInt(form.quantity) || 1,
        refund_amount:  parseFloat(form.refund_amount) || 0,
        product_status: form.product_status,
        reason:         form.reason || null,
        note:           form.note || null,
        claimed_at:     form.claimed_at,
      })
      showToast(`บันทึกเคลมสำเร็จ: ${form.sku_id} → ${form.product_status === "returned" ? "คืนสต็อก" : "ตัดชำรุด"}`)
      setForm(f => ({...f, machine_id:"", sku_id:"", quantity:"1", refund_amount:"", note:"", claimed_at: new Date().toISOString().slice(0,10) }))
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error")
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try {
      await onDeleteClaim(id)
      setDeleteId(null)
      showToast("ลบรายการเคลมสำเร็จ")
    } catch (err) { showToast("ลบไม่สำเร็จ: " + err.message, "error") }
  }

  const handleConfirm = async (claim) => {
    try {
      setConfirming(true)
      await onConfirmClaim(claim)
      setConfirmId(null)
      showToast(`ยืนยันเคลมสำเร็จ: ${claim.sku_id} ตัด ${claim.quantity} ซองออกจากสต็อก`)
    } catch (err) { showToast("ยืนยันไม่สำเร็จ: " + err.message, "error") }
    finally { setConfirming(false) }
  }

  // สรุป
  const totalRefund  = claims.reduce((a, r) => a + (parseFloat(r.refund_amount) || 0), 0)
  const totalReturned = claims.filter(r => r.product_status === "returned").length
  const totalDamaged  = claims.filter(r => r.product_status === "damaged").length
  const totalLost     = claims.filter(r => r.product_status === "lost").length

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">เคลม / คืนเงิน</h1>

      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${toast.type==="success"?"bg-green-50 text-green-700 border border-green-200":"bg-red-50 text-red-700 border border-red-200"}`}>
          {toast.type==="success" ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
          {toast.msg}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <p className="text-xs text-gray-400">เคลมทั้งหมด</p>
          <p className="text-xl font-bold text-red-600">{claims.length} รายการ</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <p className="text-xs text-gray-400">ยอดคืนเงินรวม</p>
          <p className="text-xl font-bold text-red-600">{fmtB(totalRefund)}</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <p className="text-xs text-gray-400">สถานะสินค้า</p>
          <p className="text-sm font-medium text-gray-700 mt-1">
            <span className="text-green-600">{totalReturned} คืนสต็อก</span>
            {" · "}
            <span className="text-red-500">{totalDamaged} ชำรุด</span>
            {totalLost > 0 && <>{" · "}<span className="text-orange-500">{totalLost} สูญหาย</span></>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ฟอร์มบันทึกเคลม */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">บันทึกเคลม</h2>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-xs text-gray-500 mb-1">วันที่เคลม</label>
              <input type="date" value={form.claimed_at} onChange={e => setForm({...form, claimed_at:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"/>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">ตู้ที่เกิดปัญหา</label>
              <select value={form.machine_id} onChange={e => setForm({...form, machine_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                <option value="" disabled>— เลือกตู้ —</option>
                {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name} ({m.machine_id})</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">สินค้า (SKU)</label>
              <select value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                <option value="" disabled>— เลือกสินค้า —</option>
                {skus.map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">จำนวน (ซอง)</label>
                <input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ยอดคืนเงิน (฿)</label>
                <input type="number" min="0" step="0.01" value={form.refund_amount} onChange={e => setForm({...form, refund_amount:e.target.value})}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"/>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">สาเหตุ</label>
              <select value={form.reason} onChange={e => setForm({...form, reason:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                <option value="สินค้าไม่ตก">สินค้าไม่ตก</option>
                <option value="ตกผิดช่อง">ตกผิดช่อง</option>
                <option value="ตู้ปล่อยเกิน">ตู้ปล่อยเกิน (สินค้าตกเกินจำนวน)</option>
                <option value="เครื่องค้าง">เครื่องค้าง</option>
                <option value="สินค้าชำรุด">สินค้าชำรุด</option>
                <option value="อื่นๆ">อื่นๆ</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">สถานะสินค้า</label>
              <div className="grid grid-cols-2 gap-2">
                {[{v:"returned",l:"คืนสต็อก",desc:"สภาพดี นำกลับมาขายได้",color:"green"},{v:"damaged",l:"ชำรุด",desc:"เสียหาย ขายต่อไม่ได้",color:"red"},{v:"lost",l:"สูญหาย",desc:"ตู้ปล่อยเกิน ไม่ได้คืน",color:"orange"}].map(opt => (
                  <button key={opt.v} type="button" onClick={() => setForm({...form, product_status:opt.v})}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${form.product_status===opt.v ? `border-${opt.color}-400 bg-${opt.color}-50` : "border-gray-200 hover:border-gray-300"}`}>
                    <p className={`text-sm font-semibold ${form.product_status===opt.v ? `text-${opt.color}-700` : "text-gray-700"}`}>{opt.l}</p>
                    <p className="text-xs text-gray-400">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
              <input type="text" value={form.note} onChange={e => setForm({...form, note:e.target.value})}
                placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"/>
            </div>

            <button type="submit" disabled={saving}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50 transition-all">
              {saving ? "กำลังบันทึก..." : "บันทึกเคลม"}
            </button>
          </form>
        </div>

        {/* ประวัติเคลม */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ประวัติเคลม ({claims.length} รายการ)</h2>
          {claims.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีรายการเคลม</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-xs text-gray-400">วันที่</th>
                    <th className="text-left py-2 text-xs text-gray-400">ตู้</th>
                    <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                    <th className="text-right py-2 text-xs text-gray-400">จำนวน</th>
                    <th className="text-right py-2 text-xs text-gray-400">คืนเงิน</th>
                    <th className="text-center py-2 text-xs text-gray-400">สาเหตุ</th>
                    <th className="text-center py-2 text-xs text-gray-400">สถานะ</th>
                    <th className="text-center py-2 text-xs text-gray-400">ยืนยัน</th>
                    <th className="py-2 text-xs text-gray-400"></th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map(c => {
                    const m = machines.find(m => m.machine_id === c.machine_id)
                    return (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 text-xs text-gray-600">{c.claimed_at}</td>
                        <td className="py-2.5 text-xs text-gray-700 font-medium">{m?.name || c.machine_id}</td>
                        <td className="py-2.5">
                          <span className="font-mono text-xs font-bold text-gray-700">{c.sku_id}</span>
                        </td>
                        <td className="py-2.5 text-right text-xs text-gray-700">{c.quantity} ซอง</td>
                        <td className="py-2.5 text-right text-xs font-semibold text-red-600">{fmtB(c.refund_amount)}</td>
                        <td className="py-2.5 text-center">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.reason}</span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            c.product_status === "returned" ? "bg-green-100 text-green-700"
                            : c.product_status === "lost" ? "bg-orange-100 text-orange-700"
                            : "bg-red-100 text-red-700"
                          }`}>
                            {c.product_status === "returned" ? "คืนสต็อก" : c.product_status === "lost" ? "สูญหาย" : "ชำรุด"}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          {c.confirm_status === "confirmed" ? (
                            <span className="text-xs text-green-600 font-medium">ตัดสต็อกแล้ว</span>
                          ) : c.confirm_status === "pending" ? (
                            confirmId === c.id ? (
                              <div className="flex gap-1 justify-center">
                                <button onClick={() => handleConfirm(c)} disabled={confirming}
                                  className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
                                  {confirming ? "..." : "ยืนยันตัดสต็อก"}
                                </button>
                                <button onClick={() => setConfirmId(null)} className="text-xs text-gray-400 px-1">ยกเลิก</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmId(c.id)}
                                className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-medium hover:bg-amber-200">
                                รอยืนยัน
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          {deleteId === c.id ? (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => handleDelete(c.id)} className="text-xs text-red-600 font-medium">ลบ</button>
                              <button onClick={() => setDeleteId(null)} className="text-xs text-gray-400">ยกเลิก</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteId(c.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={14}/></button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE 6: ANALYTICS
// ─────────────────────────────────────────────
function PageAnalytics({ sales, skus }) {
  const [metric, setMetric] = useState("revenue")

  const skuMap = {}
  sales.forEach(r => {
    if (!skuMap[r.sku_id]) skuMap[r.sku_id] = { qty:0, rev:0 }
    skuMap[r.sku_id].qty += r.quantity_sold
    skuMap[r.sku_id].rev += r.revenue
  })

  const ranked = Object.entries(skuMap)
    .map(([id, v]) => {
      const s = skus.find(sk => sk.sku_id === id)
      return { sku_id:id, series:s?.series||"OP", ...v,
        profit: v.rev - v.qty * (s?.avg_cost || s?.cost_price || 0) }
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
    const rows = sales.filter(r => skus.find(sk => sk.sku_id === r.sku_id)?.series === s)
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
// PAGE: MACHINE HISTORY (ประวัติเบิกเติมตู้ย่อย)
// ─────────────────────────────────────────────
function PageMachineHistory({ machine, stockOut, skus }) {
  const [filterMode, setFilterMode] = useState("all") // all, daily, monthly, yearly
  const [filterDate, setFilterDate] = useState(today())
  const [filterMonth, setFilterMonth] = useState(today().slice(0,7))
  const [filterYear, setFilterYear] = useState(today().slice(0,4))

  // กรองเฉพาะตู้นี้
  const machineOut = stockOut.filter(r => r.machine_id === machine.machine_id)

  // กรองตามช่วงเวลา
  const filtered = machineOut.filter(r => {
    const d = r.withdrawn_at?.slice(0,10) || ""
    if (filterMode === "daily")   return d === filterDate
    if (filterMode === "monthly") return d.slice(0,7) === filterMonth
    if (filterMode === "yearly")  return d.slice(0,4) === filterYear
    return true
  })

  // สรุปยอด
  const totalPacks = filtered.reduce((a,r) => a + (r.quantity_packs || 0), 0)
  const skuSummary = {}
  filtered.forEach(r => {
    if (!skuSummary[r.sku_id]) skuSummary[r.sku_id] = 0
    skuSummary[r.sku_id] += r.quantity_packs || 0
  })
  const skuRanked = Object.entries(skuSummary).sort((a,b) => b[1]-a[1])

  // ปีที่มีข้อมูล
  const years = [...new Set(machineOut.map(r => r.withdrawn_at?.slice(0,4)).filter(Boolean))].sort().reverse()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">{machine.name}</h1>
        <p className="text-sm text-gray-400">{machine.location} — ประวัติการเบิกเติมตู้</p>
      </div>

      {/* ตัวกรอง */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {[{v:"all",l:"ทั้งหมด"},{v:"daily",l:"รายวัน"},{v:"monthly",l:"รายเดือน"},{v:"yearly",l:"รายปี"}].map(t => (
            <button key={t.v} onClick={() => setFilterMode(t.v)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${filterMode===t.v ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t.l}
            </button>
          ))}
        </div>
        {filterMode === "daily" && (
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
        )}
        {filterMode === "monthly" && (
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
        )}
        {filterMode === "yearly" && (
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
            {years.length > 0 ? years.map(y => <option key={y} value={y}>{y}</option>)
              : <option value={filterYear}>{filterYear}</option>}
          </select>
        )}
      </div>

      {/* สรุปยอด */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400">จำนวนครั้งที่เบิก</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{filtered.length} <span className="text-sm font-normal text-gray-400">ครั้ง</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400">จำนวนซองที่เบิก</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(totalPacks)} <span className="text-sm font-normal text-gray-400">ซอง</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 col-span-2 lg:col-span-1">
          <p className="text-xs text-gray-400 mb-2">SKU ที่เบิกมากสุด</p>
          {skuRanked.length === 0 ? (
            <p className="text-sm text-gray-300">ไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-1">
              {skuRanked.slice(0,3).map(([skuId, packs], i) => (
                <div key={skuId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{i===0?"🥇":i===1?"🥈":"🥉"}</span>
                    <span className="font-mono text-xs font-bold text-gray-700">{skuId}</span>
                  </div>
                  <span className="text-xs font-medium text-orange-600">{fmt(packs)} ซอง</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* รายการเบิก */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-3">
          รายการเบิก ({filtered.length} รายการ)
        </h2>
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">ไม่มีรายการในช่วงเวลาที่เลือก</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map((r, i) => {
              const sku = skus.find(s => s.sku_id === r.sku_id)
              const unitMatch = r.note?.match(/^\[(\d+)(กล่อง|ซอง)\]/)
              const cleanNote = r.note?.replace(/^\[\d+(กล่อง|ซอง)\]\s*/, "") || ""
              return (
                <div key={i} className="p-3 rounded-xl bg-gray-50 flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-gray-700">{r.sku_id}</span>
                      <Badge series={sku?.series || "OP"}/>
                      {r.lot_number && (
                        <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{r.lot_number}</span>
                      )}
                      {unitMatch && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                          {unitMatch[1]} {unitMatch[2]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <Clock size={10}/> {r.withdrawn_at?.slice(0,10)} {r.withdrawn_at?.slice(11,16) || ""}
                    </p>
                    {cleanNote && <p className="text-xs text-gray-400 mt-0.5 italic">"{cleanNote}"</p>}
                  </div>
                  <span className="text-orange-500 font-bold text-sm flex-shrink-0 ml-2">
                    -{fmt(r.quantity_packs)} ซอง
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
// PAGE: MACHINE STOCK (สต็อกหน้าตู้ จาก VMS)
// ─────────────────────────────────────────────
function PageMachineStockView({ machines, machineStock, skus, onRefresh }) {
  const [selectedMachine, setSelectedMachine] = useState("all")
  const [sortBy, setSortBy] = useState("slot") // slot, sku, remain
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [showSkuDetail, setShowSkuDetail] = useState(false)

  // ── Export รายงานเติมสินค้า ──
  const exportRefillReport = () => {
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`
    const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`

    const machineIds = selectedMachine === "all"
      ? Object.keys(grouped).sort()
      : [selectedMachine].filter(id => grouped[id])

    let html = `<html><head><meta charset="utf-8"><title>รายงานเติมสินค้า ${dateStr}</title>
      <style>
        body { font-family: sans-serif; font-size: 12px; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; margin-top: 20px; border-bottom: 2px solid #333; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; font-size: 11px; }
        th { background: #f5f5f5; font-weight: bold; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .red { color: #dc2626; }
        .summary { margin-top: 8px; padding: 8px; background: #f0f9ff; border-radius: 4px; }
        @media print { body { padding: 0; } }
      </style></head><body>`
    html += `<h1>📋 รายงานเติมสินค้า</h1>`
    html += `<p>วันที่: ${dateStr} เวลา: ${timeStr} น.</p>`

    machineIds.forEach(machId => {
      const slots = grouped[machId] || []
      const mInfo = machineNames[machId] || { name: machId, location: "" }

      // รวมตาม SKU + ประเภท (box/pack)
      const skuRefill = {}
      slots.filter(s => s.product_name && s.is_occupied && s.remain < s.max_capacity).forEach(s => {
        const name = s.product_name || ""
        const isBox = name.toLowerCase().includes("box")
        const key = (s.sku_id || name) + (isBox ? "_box" : "_pack")
        const refill = (s.max_capacity || 0) - (s.remain || 0)
        if (refill <= 0) return
        if (!skuRefill[key]) skuRefill[key] = { sku_id: s.sku_id || "", name, isBox, refill: 0, slots: 0 }
        skuRefill[key].refill += refill
        skuRefill[key].slots += 1
      })
      const refillList = Object.values(skuRefill).sort((a, b) => b.refill - a.refill)
      const totalBoxRefill = refillList.filter(r => r.isBox).reduce((a, r) => a + r.refill, 0)
      const totalPackRefill = refillList.filter(r => !r.isBox).reduce((a, r) => a + r.refill, 0)

      html += `<h2>${mInfo.name || machId} — ${mInfo.location || ""}</h2>`
      if (refillList.length === 0) {
        html += `<p>สินค้าเต็มทุกช่อง ไม่ต้องเติม</p>`
      } else {
        html += `<table><thead><tr>
          <th>SKU</th><th>สินค้า</th><th>ประเภท</th><th class="right">ช่อง</th><th class="right bold red">ต้องเติม</th>
        </tr></thead><tbody>`
        refillList.forEach(r => {
          html += `<tr>
            <td>${r.sku_id}</td>
            <td>${r.name}</td>
            <td>${r.isBox ? "กล่อง" : "ซอง"}</td>
            <td class="right">${r.slots} ช่อง</td>
            <td class="right bold red">${r.refill} ${r.isBox ? "กล่อง" : "ซอง"}</td>
          </tr>`
        })
        html += `</tbody></table>`
        html += `<div class="summary"><strong>รวมต้องเติม:</strong> `
        if (totalBoxRefill > 0) html += `<span class="bold red">${totalBoxRefill} กล่อง</span> `
        if (totalPackRefill > 0) html += `<span class="bold red">${totalPackRefill} ซอง</span>`
        html += `</div>`
      }
    })

    html += `</body></html>`
    const w = window.open("", "_blank")
    w.document.write(html)
    w.document.close()
    w.print()
  }

  const triggerStockSync = async () => {
    try {
      setSyncing(true)
      setSyncMsg(null)
      const res = await fetch("/api/stock-sync", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSyncMsg({ type:"success", msg:"กำลังดึงข้อมูลสต็อกหน้าตู้... รอสักครู่แล้วกด Refresh" })
        setTimeout(() => onRefresh?.(), 30000)
      } else {
        setSyncMsg({ type:"error", msg: data.error || "เกิดข้อผิดพลาด" })
      }
    } catch (err) { setSyncMsg({ type:"error", msg: err.message }) }
    finally { setSyncing(false) }
  }

  // Map VMS machine_id → machine name
  const machineNames = {}
  machines.forEach(m => { machineNames[m.machine_id] = m })
  // fallback สำหรับ machine_id ที่ไม่ได้อยู่ในตาราง machines
  ;["chukes01","chukes02","chukes03","chukes04"].forEach(id => {
    if (!machineNames[id]) machineNames[id] = { name: id, location: "" }
  })

  // จัดกลุ่มตามตู้
  const grouped = {}
  machineStock.forEach(s => {
    if (!grouped[s.machine_id]) grouped[s.machine_id] = []
    grouped[s.machine_id].push(s)
  })

  const machineIds = selectedMachine === "all"
    ? Object.keys(grouped).sort()
    : [selectedMachine].filter(id => grouped[id])

  // สรุป SKU ต่อตู้
  const summarizeBySku = (slots) => {
    const map = {}
    slots.forEach(s => {
      const skuId = s.sku_id || s.product_name || "ไม่ระบุ"
      if (!map[skuId]) map[skuId] = { sku_id: skuId, product_name: s.product_name, remain: 0, capacity: 0, slots: 0 }
      map[skuId].remain += s.remain || 0
      map[skuId].capacity += s.max_capacity || 0
      map[skuId].slots += 1
    })
    return Object.values(map).sort((a, b) => sortBy === "remain" ? b.remain - a.remain : a.sku_id.localeCompare(b.sku_id))
  }

  // เวลาที่ sync ล่าสุด
  const lastSync = machineStock.length > 0
    ? machineStock.reduce((latest, s) => {
        const t = s.synced_at || ""
        return t > latest ? t : latest
      }, "")
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">สต็อกหน้าตู้ (VMS)</h1>
          <p className="text-sm text-gray-400">
            ข้อมูลคงเหลือจริงที่หน้าตู้ขาย ดึงจากระบบ VMS
            {lastSync && <span className="ml-2">· อัปเดตล่าสุด: {lastSync.slice(0,10)} {lastSync.slice(11,16)}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={triggerStockSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all">
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""}/>
            {syncing ? "กำลังดึง..." : "ดึงข้อมูล VMS"}
          </button>
          {machineStock.length > 0 && (
            <button onClick={exportRefillReport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-all">
              <ArrowUpCircle size={14}/>
              รายงานเติมสินค้า
            </button>
          )}
          <select value={selectedMachine} onChange={e => setSelectedMachine(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="all">ทุกตู้</option>
            {Object.keys(grouped).sort().map(id => (
              <option key={id} value={id}>{machineNames[id]?.name || id}</option>
            ))}
          </select>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"slot",l:"ตามช่อง"},{v:"sku",l:"ตาม SKU"},{v:"remain",l:"คงเหลือ"}].map(t => (
              <button key={t.v} onClick={() => setSortBy(t.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortBy===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {syncMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${syncMsg.type==="success"?"bg-green-50 text-green-700 border border-green-200":"bg-red-50 text-red-700 border border-red-200"}`}>
          {syncMsg.type==="success" ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
          {syncMsg.msg}
          {syncMsg.type==="success" && <button onClick={() => { onRefresh?.(); setSyncMsg(null) }} className="ml-auto text-xs bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700">Refresh</button>}
        </div>
      )}

      {machineStock.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <Monitor size={40} className="text-gray-300 mx-auto mb-3"/>
          <p className="text-gray-500 font-medium">ยังไม่มีข้อมูลสต็อกหน้าตู้</p>
          <p className="text-gray-400 text-sm mt-1">ข้อมูลจะปรากฏหลังเชื่อมต่อ VMS API และดึงข้อมูลครั้งแรก</p>
          <div className="mt-4 p-4 bg-amber-50 rounded-xl text-left max-w-md mx-auto">
            <p className="text-xs text-amber-700 font-medium mb-1">รอดำเนินการ:</p>
            <p className="text-xs text-amber-600">ขออนุญาตใช้ API จาก VMS InboxCorp</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── สรุปยอดรวม SKU ทุกตู้ ── */}
          {selectedMachine === "all" && (() => {
            const allSkuMap = {}
            machineStock.filter(s => s.product_name && s.is_occupied).forEach(s => {
              const skuId = s.sku_id || s.product_name || "ไม่ระบุ"
              if (!allSkuMap[skuId]) allSkuMap[skuId] = { sku_id: skuId, product_name: s.product_name, remain: 0, capacity: 0, perMachine: {} }
              allSkuMap[skuId].remain += s.remain || 0
              allSkuMap[skuId].capacity += s.max_capacity || 0
              if (!allSkuMap[skuId].perMachine[s.machine_id]) allSkuMap[skuId].perMachine[s.machine_id] = 0
              allSkuMap[skuId].perMachine[s.machine_id] += s.remain || 0
            })
            const allSkuList = Object.values(allSkuMap).sort((a, b) => b.remain - a.remain)
            const grandRemain = allSkuList.reduce((a, r) => a + r.remain, 0)
            const grandCapacity = allSkuList.reduce((a, r) => a + r.capacity, 0)
            const allMachineIds = Object.keys(grouped).sort()

            // คำนวณยอดกล่อง+ซองต่อตู้ (แยกจาก product_name: "Box" vs "Pack")
            const machTotals = {}
            allMachineIds.forEach(id => {
              let totalPacks = 0, totalBoxes = 0
              machineStock.filter(s => s.machine_id === id && s.is_occupied && s.product_name).forEach(s => {
                const name = (s.product_name || "").toLowerCase()
                const isBox = name.includes("(box)") || name.includes("box")
                if (isBox) totalBoxes += s.remain || 0
                else       totalPacks += s.remain || 0
              })
              machTotals[id] = { packs: totalPacks, boxes: totalBoxes }
            })
            // รวม grand total
            const grandPacks = Object.values(machTotals).reduce((a, t) => a + t.packs, 0)
            const grandBoxes = Object.values(machTotals).reduce((a, t) => a + t.boxes, 0)

            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header — สรุปยอดรวม + ปุ่มแสดงรายละเอียด */}
                <button onClick={() => setShowSkuDetail(v => !v)}
                  className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="text-left">
                    <h2 className="font-semibold text-gray-700">สรุปยอดรวมทุกตู้</h2>
                    <p className="text-xs text-gray-400">{allSkuList.length} SKU · {fmt(grandRemain)} ซอง · {allMachineIds.length} ตู้</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* ยอดรวมแต่ละตู้ */}
                    <div className="hidden sm:flex items-center gap-3">
                      {allMachineIds.map((id, i) => (
                        <div key={id} className="text-center">
                          <p className="text-xs text-gray-400">{machineNames[id]?.name || id}</p>
                          <div className="flex gap-1 justify-center mt-0.5">
                            <span className="text-xs font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">{fmt(machTotals[id].boxes)} กล่อง</span>
                            <span className="text-xs font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{fmt(machTotals[id].packs)} ซอง</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* ยอดรวมทั้งหมด 4 ตู้ */}
                    <div className="text-right border-l border-gray-200 pl-4">
                      <div className="flex gap-2">
                        <span className="text-sm font-bold text-red-600">{fmt(grandBoxes)} <span className="text-xs font-normal">กล่อง</span></span>
                        <span className="text-sm font-bold text-blue-600">{fmt(grandPacks)} <span className="text-xs font-normal">ซอง</span></span>
                      </div>
                    </div>
                    {showSkuDetail ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                  </div>
                </button>

                {/* ตาราง SKU — ซ่อน/แสดง */}
                {showSkuDetail && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-2 px-4 text-xs text-gray-400 font-medium">SKU</th>
                        <th className="text-left py-2 px-2 text-xs text-gray-400 font-medium">สินค้า</th>
                        {allMachineIds.map(id => (
                          <th key={id} className="text-center py-2 px-2 text-xs text-gray-400 font-medium">{machineNames[id]?.name || id}</th>
                        ))}
                        <th className="text-right py-2 px-2 text-xs text-red-500 font-medium">รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allSkuList.map(r => {
                        const isBox = (r.product_name || "").toLowerCase().includes("box")
                        return (
                          <tr key={r.sku_id + (isBox ? "_box" : "_pack")} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 px-4 font-mono text-xs font-bold text-gray-700">{r.sku_id}</td>
                            <td className="py-2 px-2 text-xs text-gray-500 truncate max-w-[120px]">{r.product_name}</td>
                            {allMachineIds.map(id => {
                              const val = r.perMachine[id] || 0
                              return (
                                <td key={id} className={`py-2 px-2 text-center text-xs font-medium ${val === 0 ? "text-gray-300" : val < 5 ? "text-amber-600" : "text-gray-700"}`}>
                                  {val > 0 ? fmt(val) : "-"}
                                </td>
                              )
                            })}
                            <td className={`py-2 px-2 text-right font-bold ${isBox ? "text-red-600" : "text-blue-600"}`}>
                              {fmt(r.remain)} {isBox ? "กล่อง" : "ซอง"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td colSpan={2} className="py-2.5 px-4 text-xs text-gray-500">รวมทั้งหมด</td>
                        {allMachineIds.map(id => (
                          <td key={id} className="py-2.5 px-2 text-center text-xs">
                            <span className="text-red-600 font-bold">{fmt(machTotals[id].boxes)}</span>
                            <span className="text-gray-400 mx-0.5">/</span>
                            <span className="text-blue-600 font-bold">{fmt(machTotals[id].packs)}</span>
                          </td>
                        ))}
                        <td className="py-2.5 px-2 text-right">
                          <span className="text-red-700 font-bold">{fmt(grandBoxes)} กล่อง</span>
                          <span className="text-gray-400 mx-1">/</span>
                          <span className="text-blue-700 font-bold">{fmt(grandPacks)} ซอง</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                )}
              </div>
            )
          })()}

          {machineIds.map((machId, mi) => {
            const slots = grouped[machId] || []
            const mInfo = machineNames[machId] || { name: machId, location: "" }
            const totalRemain = slots.reduce((a, s) => a + (s.remain || 0), 0)
            const totalCapacity = slots.reduce((a, s) => a + (s.max_capacity || 0), 0)
            const pct = totalCapacity > 0 ? ((totalRemain / totalCapacity) * 100).toFixed(1) : 0
            const skuSummary = summarizeBySku(slots)
            const activeSlots = slots.filter(s => s.product_name && s.remain !== null)

            return (
              <div key={machId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{backgroundColor: CHART_COLORS[mi % CHART_COLORS.length]}}/>
                      <div>
                        <p className="font-semibold text-gray-800">{mInfo.name || machId}</p>
                        <p className="text-xs text-gray-400">{mInfo.location} · {activeSlots.length} ช่อง · {skuSummary.length} SKU</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-800">{pct}%</p>
                      <p className="text-xs text-gray-400">{fmt(totalRemain)}/{fmt(totalCapacity)}</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 w-full bg-gray-100 rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full transition-all ${parseFloat(pct) < 30 ? "bg-red-400" : parseFloat(pct) < 60 ? "bg-amber-400" : "bg-green-400"}`}
                      style={{width:`${pct}%`}}/>
                  </div>
                </div>

                {/* SKU Summary */}
                {sortBy !== "slot" ? (
                  <div className="p-5">
                    <h3 className="text-sm font-semibold text-gray-600 mb-3">สรุปตาม SKU</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left py-2 text-xs text-gray-400 font-medium">SKU</th>
                            <th className="text-left py-2 text-xs text-gray-400 font-medium">สินค้า</th>
                            <th className="text-center py-2 text-xs text-gray-400 font-medium">ช่อง</th>
                            <th className="text-right py-2 text-xs text-gray-400 font-medium">ซอง</th>
                            <th className="text-right py-2 text-xs text-purple-400 font-medium">กล่อง</th>
                            <th className="text-right py-2 text-xs text-gray-400 font-medium">ความจุ</th>
                            <th className="py-2 px-2 text-xs text-gray-400 font-medium w-24">สัดส่วน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {skuSummary.map(r => {
                            const sku = skus.find(s => s.sku_id === r.sku_id)
                            const skuPct = r.capacity > 0 ? (r.remain / r.capacity * 100) : 0
                            return (
                              <tr key={r.sku_id} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="py-2 font-mono text-xs font-bold text-gray-700">{r.sku_id}</td>
                                <td className="py-2 text-xs text-gray-500 truncate max-w-[150px]">{r.product_name}</td>
                                <td className="py-2 text-center text-xs text-gray-500">{r.slots}</td>
                                <td className={`py-2 text-right font-bold text-sm ${r.remain === 0 ? "text-red-500" : r.remain < 5 ? "text-amber-600" : "text-green-600"}`}>
                                  {fmt(r.remain)}
                                </td>
                                <td className="py-2 text-right text-xs text-purple-600 font-medium">
                                  {(() => { const ppb = (skus.find(s=>s.sku_id===r.sku_id)?.packs_per_box)||24; const b=Math.floor(r.remain/ppb); const p=r.remain%ppb; return b>0?`${b}${p>0?`+${p}ซอง`:""}`:r.remain>0?`${r.remain}ซอง`:"-" })()}
                                </td>
                                <td className="py-2 text-right text-xs text-gray-400">{fmt(r.capacity)}</td>
                                <td className="py-2 px-2">
                                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${skuPct < 30 ? "bg-red-400" : skuPct < 60 ? "bg-amber-400" : "bg-green-400"}`}
                                      style={{width:`${skuPct}%`}}/>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* Slot view — VMS style */
                  <div className="p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-3">
                      {slots.map(s => {
                        const isEmpty = !s.product_name
                        const isZero = s.remain === 0 && !isEmpty
                        // หา SKU เพื่อใช้ image_url จากตาราง skus (เหมือนหน้าภาพรวม)
                        const matchedSku = skus.find(sk => sk.sku_id === s.sku_id)
                        const imgUrl = matchedSku?.image_url || null
                        return (
                          <div key={s.slot_number} className={`rounded-xl border overflow-hidden transition-all ${isEmpty ? "bg-gray-50 border-gray-200 opacity-40" : isZero ? "bg-red-50 border-red-200" : "bg-white border-blue-100 hover:border-blue-300 hover:shadow-sm"}`}>
                            {/* Slot number */}
                            <div className={`text-center py-1 text-xs font-mono font-bold ${isEmpty ? "text-gray-400" : "text-blue-500"}`}>
                              {s.slot_number}
                            </div>

                            {isEmpty ? (
                              <div className="px-2 pb-3 text-center">
                                <div className="w-full h-20 bg-gray-100 rounded-lg flex items-center justify-center mb-2">
                                  <Package size={20} className="text-gray-300"/>
                                </div>
                                <p className="text-xs text-gray-400">ไม่มีสินค้า</p>
                              </div>
                            ) : (
                              <div className="px-2 pb-2.5">
                                {/* Product image — ใช้รูปจาก skus table เหมือนหน้าภาพรวม */}
                                {imgUrl ? (
                                  <div className="w-full h-24 rounded-lg overflow-hidden bg-gray-50 mb-2 flex items-center justify-center">
                                    <img src={imgUrl} alt={s.product_name}
                                      className="h-full w-auto object-contain p-1"
                                      loading="lazy"
                                      onError={e => { e.target.onerror=null; e.target.style.display='none' }}/>
                                  </div>
                                ) : (
                                  <div className="w-full h-24 rounded-lg bg-gradient-to-b from-blue-50 to-white flex items-center justify-center mb-2">
                                    <Package size={24} className="text-blue-200"/>
                                  </div>
                                )}

                                {/* Product name */}
                                <p className="text-xs font-medium text-gray-700 truncate" title={s.product_name}>
                                  {s.product_name}
                                </p>

                                {/* คงเหลือ */}
                                <p className="text-xs text-gray-400 mt-1">คงเหลือ</p>
                                <div className={`mt-1 flex items-center justify-center gap-0 rounded-lg border ${isZero ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
                                  <span className={`py-1.5 px-3 text-sm font-bold text-center w-full ${isZero ? "text-red-500" : s.remain <= 3 ? "text-amber-600" : "text-gray-800"}`}>
                                    {s.remain}
                                  </span>
                                </div>

                                {/* ความจุ */}
                                <p className="text-center text-xs text-blue-500 mt-1.5">
                                  ความจุ: {s.max_capacity}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────
const NAV_BASE = [
  { id:"dashboard",  label:"ภาพรวม",       icon:Home          },
  { id:"stock",      label:"จัดการสต็อก",  icon:Package       },
  { id:"withdrawal", label:"เบิกเติมตู้",   icon:ArrowUpCircle },
  { id:"machstock",  label:"สต็อกหน้าตู้",  icon:Monitor       },
  { id:"sales",      label:"ยอดขาย",       icon:ShoppingCart  },
  { id:"claims",     label:"เคลม/คืนเงิน", icon:AlertTriangle },
  { id:"analytics",  label:"วิเคราะห์ SKU", icon:BarChart2     },
]
const NAV_ADMIN = { id:"users", label:"จัดการผู้ใช้", icon:Users }

// ─────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────
export default function DivisionXApp() {
  const [page, setPage]         = useState("dashboard")
  const [sideOpen, setSideOpen] = useState(false)
  const [withdrawalExpanded, setWithdrawalExpanded] = useState(false)

  // ── Auth State ──
  const [session,     setSession]     = useState(null)
  const [profile,     setProfile]     = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) getProfile(session.user.id).then(setProfile)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) getProfile(session.user.id).then(setProfile)
      else { setProfile(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const NAV = profile?.role === "admin" ? [...NAV_BASE, NAV_ADMIN] : NAV_BASE

  // ── Data State ──
  const [machines,      setMachines]      = useState([])
  const [skus,          setSkus]          = useState(SKUS)
  const [stockIn,       setStockIn]       = useState([])
  const [stockOut,      setStockOut]      = useState([])
  const [stockBalance,  setStockBalance]  = useState([])
  const [sales,         setSales]         = useState([])
  const [machineStock,  setMachineStock]  = useState([])
  const [claims,        setClaims]        = useState([])
  const [loading,       setLoading]       = useState(true)
  const [dataError,     setDataError]     = useState(null)

  // ── Load All Data from Supabase ──
  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      setDataError(null)
      const [machData, skuData, siData, soData, sbData, salesData, msData, claimsData] = await Promise.all([
        getMachines(),
        getSkus(),
        getStockIn(),
        getStockOut(),
        getStockBalance(),
        getSalesByMachine(30),
        getMachineStock(),
        getClaims(),
      ])
      setMachines(machData)
      if (skuData?.length) setSkus(skuData)
      setStockIn(siData)
      setStockOut(soData)
      setStockBalance(sbData)
      setMachineStock(msData || [])
      setClaims(claimsData || [])
      // Normalize sales: grand_total → revenue, sold_at timestamptz → date string
      // แปลง box → pack: ถ้า product_name_raw มีคำว่า "box" และ quantity_sold ยังเป็น 1 (ข้อมูลเก่า)
      setSales(salesData.map(r => {
        const raw = (r.product_name_raw || "").toLowerCase()
        const isBox = raw.includes("(box)") || raw.split(/\s+/).includes("box")
        const sku = skuData?.find(s => s.sku_id === r.sku_id)
        const ppb = sku?.packs_per_box || 24
        const qty = (isBox && r.quantity_sold === 1) ? ppb : r.quantity_sold
        return {
          ...r,
          quantity_sold: qty,
          revenue:  parseFloat(r.grand_total) || 0,
          sold_at:  r.sold_at ? r.sold_at.slice(0, 10) : "",
        }
      }))
    } catch (err) {
      setDataError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Write Operations ──
  // ── คำนวณ avg_cost ใหม่จาก stock_in ทั้งหมดของ SKU (ใช้ตอนแก้ไข/ลบ/เพิ่ม) ──
  const recalcAvgCost = async (skuId, freshStockIn) => {
    const siList = (freshStockIn || stockIn).filter(r => r.sku_id === skuId)
    const totalPacks = siList.reduce((a, r) => a + (r.quantity_packs || 0), 0)
    const totalCost  = siList.reduce((a, r) => a + (parseFloat(r.total_cost) || 0), 0)
    const avg = totalPacks > 0 ? totalCost / totalPacks : 0
    await updateSkuAvgCost(skuId, Math.round(avg * 100) / 100)
  }

  const recalcAllAvgCost = async (freshStockIn) => {
    const allSkuIds = [...new Set((freshStockIn || stockIn).map(r => r.sku_id))]
    for (const skuId of allSkuIds) {
      await recalcAvgCost(skuId, freshStockIn)
    }
  }

  const addStockIn = async (record) => {
    await dbAddStockIn(record)
    // ── Moving Average Cost: คำนวณต้นทุนเฉลี่ยใหม่ ──
    const sku = skus.find(s => s.sku_id === record.sku_id)
    const bal = stockBalance.find(b => b.sku_id === record.sku_id)
    const currentQty  = bal?.balance || 0
    const currentCost = sku?.avg_cost || 0
    const newPacks    = record.quantity_packs || 0
    const newCostPer  = newPacks > 0 ? (record.total_cost || 0) / newPacks : 0
    const totalQty    = currentQty + newPacks
    const newAvgCost  = totalQty > 0
      ? ((currentQty * currentCost) + (newPacks * newCostPer)) / totalQty
      : newCostPer
    await updateSkuAvgCost(record.sku_id, Math.round(newAvgCost * 100) / 100)
    const [newSI, newSB, newSkus] = await Promise.all([getStockIn(), getStockBalance(), getSkus()])
    setStockIn(newSI)
    setStockBalance(newSB)
    if (newSkus?.length) setSkus(newSkus)
  }

  const addStockOut = async (record) => {
    await dbAddStockOut(record)
    const [newSO, newSB] = await Promise.all([getStockOut(), getStockBalance()])
    setStockOut(newSO)
    setStockBalance(newSB)
  }

  const updateStockIn = async (id, record) => {
    // หา SKU เดิมก่อนแก้ (อาจเปลี่ยน SKU)
    const oldRecord = stockIn.find(r => r.id === id)
    await dbUpdateStockIn(id, record)
    const [newSI, newSB] = await Promise.all([getStockIn(), getStockBalance()])
    // คำนวณ avg_cost ใหม่สำหรับ SKU ที่ได้รับผลกระทบ
    await recalcAvgCost(record.sku_id, newSI)
    if (oldRecord && oldRecord.sku_id !== record.sku_id) {
      await recalcAvgCost(oldRecord.sku_id, newSI)  // SKU เดิมด้วย
    }
    setStockIn(newSI)
    setStockBalance(newSB)
    setSkus(await getSkus())
  }

  const deleteStockIn = async (id) => {
    const deleted = stockIn.find(r => r.id === id)
    await dbDeleteStockIn(id)
    const [newSI, newSB] = await Promise.all([getStockIn(), getStockBalance()])
    if (deleted) await recalcAvgCost(deleted.sku_id, newSI)
    setStockIn(newSI)
    setStockBalance(newSB)
    setSkus(await getSkus())
  }

  const deleteStockOut = async (id) => {
    await dbDeleteStockOut(id)
    const [newSO, newSB] = await Promise.all([getStockOut(), getStockBalance()])
    setStockOut(newSO)
    setStockBalance(newSB)
  }

  const addClaim = async (record) => {
    // สูญหาย/ชำรุด → สถานะเริ่มต้น "pending" (รอยืนยัน)
    // คืนสต็อก → บันทึกเลย ผู้ใช้ไปคีย์รับเข้าเอง
    const status = (record.product_status === "lost" || record.product_status === "damaged")
      ? "pending" : record.product_status
    await dbAddClaim({ ...record, confirm_status: status })
    setClaims(await getClaims())
  }

  const confirmClaim = async (claim) => {
    // ยืนยันเคลม → ตัด stock อัตโนมัติ
    await dbUpdateClaim(claim.id, { confirm_status: "confirmed" })
    await dbAddStockOut({
      sku_id:         claim.sku_id,
      machine_id:     claim.machine_id,
      quantity_packs: claim.quantity,
      withdrawn_at:   claim.claimed_at,
      note:           `[เคลม] ${claim.reason || ""} (${claim.product_status === "lost" ? "สูญหาย" : "ชำรุด"})`,
    })
    const [newClaims, newSO, newSB] = await Promise.all([getClaims(), getStockOut(), getStockBalance()])
    setClaims(newClaims)
    setStockOut(newSO)
    setStockBalance(newSB)
  }

  const deleteClaim = async (id) => {
    await dbDeleteClaim(id)
    setClaims(await getClaims())
  }

  const addSku = async (record) => {
    await dbAddSku(record)
    setSkus(await getSkus())
  }

  const deactivateSku = async (skuId) => {
    await dbDeactivateSku(skuId)
    setSkus(await getSkus())
  }

  // ── Derived ──
  const balMap   = Object.fromEntries(stockBalance.map(r => [r.sku_id, parseFloat(r.balance) || 0]))
  const lowCount = skus.filter(s => (balMap[s.sku_id] || 0) < 24).length

  // ── Auth / Loading / Error screens ──
  // if (authLoading) return <LoadingScreen/>
  // if (!session)    return <LoginPage/>   ← ซ่อน Login ชั่วคราว
  if (loading)     return <LoadingScreen/>
  if (dataError)   return <ErrorScreen msg={dataError} onRetry={loadAll}/>

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

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(n => {
            const Icon   = n.icon
            const active = page === n.id
            const isWithdrawal = n.id === "withdrawal"
            const isMachinePage = page.startsWith("machine_")
            const withdrawalActive = active || (isWithdrawal && isMachinePage)

            return (
              <div key={n.id}>
                <button onClick={() => {
                  if (isWithdrawal) {
                    setWithdrawalExpanded(!withdrawalExpanded)
                    setPage(n.id)
                    setSideOpen(false)
                  } else {
                    setPage(n.id)
                    setSideOpen(false)
                  }
                }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                    ${withdrawalActive ? "bg-blue-600 text-white shadow-sm" : active ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
                  <Icon size={18}/>
                  <span>{n.label}</span>
                  {n.id === "stock" && lowCount > 0 && (
                    <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold ${active?"bg-white/20 text-white":"bg-amber-100 text-amber-600"}`}>
                      {lowCount}
                    </span>
                  )}
                  {isWithdrawal && machines.length > 0 && (
                    <span className="ml-auto">
                      {withdrawalExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                    </span>
                  )}
                </button>

                {/* เมนูตู้ย่อย */}
                {isWithdrawal && withdrawalExpanded && machines.length > 0 && (
                  <div className="ml-6 mt-1 space-y-0.5">
                    {machines.map(m => {
                      const machActive = page === `machine_${m.machine_id}`
                      return (
                        <button key={m.machine_id}
                          onClick={() => { setPage(`machine_${m.machine_id}`); setSideOpen(false) }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
                            ${machActive ? "bg-orange-100 text-orange-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`}>
                          <StatusDot status={m.status}/>
                          <span>{m.name}</span>
                          <span className="ml-auto text-xs text-gray-400">{m.location}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100 space-y-3">
          {/* User info */}
          {session && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-blue-600">
                  {(profile?.display_name || session.user.email)[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {profile?.display_name || session.user.email}
                </p>
                <p className="text-xs text-gray-400">
                  {profile?.role === "admin" ? "Admin" : "User"}
                </p>
              </div>
            </div>
          )}
          {/* Connection + logout */}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500"/>
            <span>Live Data</span>
            <RefreshCw size={11} className="cursor-pointer hover:text-blue-500" onClick={loadAll}/>
            {session && (
              <button onClick={() => authSignOut()}
                className="ml-auto flex items-center gap-1 text-gray-400 hover:text-red-500 transition-colors">
                <LogOut size={12}/>
                <span>ออก</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 lg:px-6 sticky top-0 z-20">
          <button onClick={() => setSideOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
            <Menu size={20} className="text-gray-600"/>
          </button>
          <span className="font-semibold text-gray-700 text-sm">
            {page.startsWith("machine_")
              ? `เบิกเติมตู้ › ${machines.find(m => `machine_${m.machine_id}` === page)?.name || ""}`
              : NAV.find(n => n.id === page)?.label}
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
            <Clock size={12}/> <RealtimeClock/>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {page === "dashboard"  && <PageDashboard stockIn={stockIn} stockOut={stockOut} stockBalance={stockBalance} skus={skus}/>}
          {page === "stock"      && <PageStock     stockIn={stockIn} stockBalance={stockBalance} skus={skus} onAddStockIn={addStockIn} onUpdateStockIn={updateStockIn} onDeleteStockIn={deleteStockIn} onAddSku={addSku} onDeactivateSku={deactivateSku} onRecalcAvgCost={async (skuId) => { await recalcAvgCost(skuId); setSkus(await getSkus()) }}/>}
          {page === "withdrawal" && <PageWithdrawal machines={machines} stockOut={stockOut} stockIn={stockIn} stockBalance={stockBalance} skus={skus} onAddStockOut={addStockOut} onDeleteStockOut={deleteStockOut}/>}
          {page === "machstock"  && <PageMachineStockView machines={machines} machineStock={machineStock} skus={skus} onRefresh={loadAll}/>}
          {page === "sales"      && <PageSales     machines={machines} sales={sales} skus={skus} claims={claims} onRefresh={loadAll}/>}
          {page === "claims"     && <PageClaims    machines={machines} skus={skus} claims={claims} onAddClaim={addClaim} onConfirmClaim={confirmClaim} onDeleteClaim={deleteClaim}/>}
          {page === "analytics"  && <PageAnalytics sales={sales} skus={skus}/>}
          {page === "users"      && <PageUsers     currentProfile={profile}/>}
          {page.startsWith("machine_") && (() => {
            const m = machines.find(mc => `machine_${mc.machine_id}` === page)
            return m ? <PageMachineHistory machine={m} stockOut={stockOut} skus={skus}/> : null
          })()}
        </main>
      </div>
    </div>
  )
}
