"use client"
import { useState, useEffect, useCallback, Fragment } from "react"
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts"
import {
  Package, TrendingUp, ShoppingCart, AlertTriangle,
  PlusCircle, MinusCircle, BarChart2, Home, Menu, X,
  CheckCircle, Clock, Search, RefreshCw, ArrowUpCircle, Loader2,
  Pencil, Trash2, ChevronDown, ChevronUp, Layers,
  LogOut, UserPlus, Users, Shield, Eye, EyeOff, Monitor,
  Send, ClipboardList, Boxes
} from "lucide-react"
import {
  supabase,
  getStockBalance, getStockIn, getStockOut,
  addStockIn as dbAddStockIn, addStockOut as dbAddStockOut,
  updateStockIn as dbUpdateStockIn,
  updateStockOut as dbUpdateStockOut,
  deleteStockIn as dbDeleteStockIn,
  deleteStockOut as dbDeleteStockOut,
  getMachines, getSalesByMachine,
  getSkus, addSku as dbAddSku, deactivateSku as dbDeactivateSku, updateSkuAvgCost,
  signIn as authSignIn, signOut as authSignOut, getProfile, resetPassword, updatePassword,
  getMachineStock,
  getClaims, addClaim as dbAddClaim, updateClaim as dbUpdateClaim, deleteClaim as dbDeleteClaim,
  logLoginEvent,
  getMachineAssignments, addMachineAssignment as dbAddMachineAssignment, deleteMachineAssignment as dbDeleteMachineAssignment,
  getStockTransfers, addStockTransfer as dbAddStockTransfer, deleteStockTransfer as dbDeleteStockTransfer,
  getAllProfiles,
} from "../lib/supabase"
import {
  SKUS, SERIES_COLOR, CHART_COLORS, THAI_MONTHS, SKU_SERIES_ORDER, UNIT_LABEL,
} from "./shared/constants"
import {
  fmt, fmtB, today,
  getSkuSeries, sortSkus, sortByDateThenSku,
  fmtBoxPack, getLastNDays, fmtDayLabel, convertToPacks,
} from "./shared/helpers"
import KpiCard from "./shared/KpiCard"
import { Badge, StatusDot } from "./shared/ui"
import PageMachineHistory from "./pages/PageMachineHistory"
import PageRefillPrep from "./pages/PageRefillPrep"
import PageMyStock from "./pages/PageMyStock"
import PageUsers from "./pages/PageUsers"
import PageAnalytics from "./pages/PageAnalytics"
import PageSales from "./pages/PageSales"
import PageClaims from "./pages/PageClaims"
import PageDashboard from "./pages/PageDashboard"
import PageMachineStockView from "./pages/PageMachineStockView"
import PageTransfer from "./pages/PageTransfer"
import PageWithdrawal from "./pages/PageWithdrawal"

// ─────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────
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
  const [mode,     setMode]     = useState("login") // "login" | "forgot"
  const [success,  setSuccess]  = useState("")

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await authSignIn(email, password)
    } catch {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    if (!email) { setError("กรุณากรอกอีเมล"); return }
    setLoading(true)
    try {
      await resetPassword(email)
      setSuccess("ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย")
    } catch {
      setError("ไม่สามารถส่งอีเมลได้ กรุณาตรวจสอบอีเมลอีกครั้ง")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="DivisionX Card" className="w-24 h-24 object-contain rounded-2xl mb-3"/>
          <h1 className="text-xl font-bold text-gray-800">DivisionX Card</h1>
          <p className="text-sm text-gray-400 mt-1">{mode === "login" ? "ระบบจัดการสต็อก" : "รีเซ็ตรหัสผ่าน"}</p>
        </div>

        {mode === "login" ? (
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
            <button type="button" onClick={() => { setMode("forgot"); setError(""); setSuccess("") }}
              className="w-full text-xs text-gray-400 hover:text-blue-500 transition-colors mt-2">
              ลืมรหัสผ่าน?
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">อีเมลที่ลงทะเบียน</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="example@email.com" required autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>
            )}
            {success && (
              <p className="text-xs text-green-600 bg-green-50 border border-green-100 px-3 py-2 rounded-lg">{success}</p>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              {loading && <Loader2 size={16} className="animate-spin"/>}
              {loading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
            </button>
            <button type="button" onClick={() => { setMode("login"); setError(""); setSuccess("") }}
              className="w-full text-xs text-gray-400 hover:text-blue-500 transition-colors mt-2">
              กลับไปหน้าเข้าสู่ระบบ
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE: RESET PASSWORD (ตั้งรหัสผ่านใหม่)
// ─────────────────────────────────────────────
function ResetPasswordPage({ onDone }) {
  const [newPw,    setNewPw]    = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")
  const [success,  setSuccess]  = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    if (newPw.length < 6) { setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return }
    if (newPw !== confirmPw) { setError("รหัสผ่านไม่ตรงกัน"); return }
    setLoading(true)
    try {
      await updatePassword(newPw)
      setSuccess(true)
      setTimeout(() => onDone(), 2000)
    } catch {
      setError("ไม่สามารถเปลี่ยนรหัสผ่านได้ กรุณาลองใหม่")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="DivisionX Card" className="w-24 h-24 object-contain rounded-2xl mb-3"/>
          <h1 className="text-xl font-bold text-gray-800">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-sm text-gray-400 mt-1">กรุณากรอกรหัสผ่านใหม่</p>
        </div>

        {success ? (
          <div className="text-center">
            <CheckCircle size={40} className="text-green-500 mx-auto mb-3"/>
            <p className="text-sm text-green-600 font-medium">เปลี่ยนรหัสผ่านสำเร็จ!</p>
            <p className="text-xs text-gray-400 mt-1">กำลังเข้าสู่ระบบ...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">รหัสผ่านใหม่</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)}
                  placeholder="••••••••" required autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 pr-10"/>
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">ยืนยันรหัสผ่านใหม่</label>
              <input type={showPw ? "text" : "password"} value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                placeholder="••••••••" required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              {loading && <Loader2 size={16} className="animate-spin"/>}
              {loading ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
            </button>
          </form>
        )}
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
              {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
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
  const [historySkuIn, setHistorySkuIn] = useState("")
  const [lotSkuFilter, setLotSkuFilter] = useState("")

  const filterLots = (list) => {
    const sorted = [...list].sort((a, b) => sortByDateThenSku(a, b, "purchased_at"))
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
            {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
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
        {[{key:"balance",label:"สต็อกคงเหลือ"},{key:"addin",label:"รับสินค้าเข้า"},{key:"history",label:"ประวัติการรับ"},{key:"lothistory",label:"ประวัติ Lot"},{key:"skus",label:"จัดการ SKU"}].map(t => (
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
                  {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
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
              <div className="flex flex-wrap gap-2 items-center">
                <select value={lotSkuFilter} onChange={e => setLotSkuFilter(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="">ทุก SKU</option>
                  {skus.filter(s => s.is_active !== false).sort((a,b) => {
                    const order = {OP:1, EB:2, PRB:3}
                    return (order[a.series]||9) - (order[b.series]||9) || a.sku_id.localeCompare(b.sku_id)
                  }).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id}</option>)}
                </select>
                <LotFilterBar/>
              </div>
            </div>
            {(() => {
              const byDate = filterLots(stockIn)
              const filteredLots = lotSkuFilter ? byDate.filter(r => r.sku_id === lotSkuFilter) : byDate
              return filteredLots.length === 0 ? (
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
            <div className="flex flex-wrap gap-2 items-center">
              <select value={historySkuIn} onChange={e => setHistorySkuIn(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="">ทุก SKU</option>
                {skus.filter(s => s.is_active !== false).sort((a,b) => {
                  const order = {OP:1, EB:2, PRB:3}
                  return (order[a.series]||9) - (order[b.series]||9) || a.sku_id.localeCompare(b.sku_id)
                }).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id}</option>)}
              </select>
              <LotFilterBar/>
            </div>
          </div>
          {(() => {
            const byDate = filterLots(stockIn)
            const filteredHistory = historySkuIn ? byDate.filter(r => r.sku_id === historySkuIn) : byDate
            return filteredHistory.length === 0 ? (
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
                      {r.created_by && <p className="text-xs text-gray-400 mt-0.5">โดย: {r.created_by}</p>}
                    </div>
                  )
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["วันที่","เลขที่ Lot","SKU","Supplier","หน่วย","จำนวน","ซอง","ต้นทุน/หน่วย","ต้นทุน/ซอง","มูลค่า Lot","หมายเหตุ","ผู้บันทึก"].map(h => (
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
                          <td className="py-2 pr-3 text-gray-400 text-xs">{r.note || "—"}</td>
                          <td className="py-2 text-gray-500 text-xs whitespace-nowrap">{r.created_by || "—"}</td>
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
      {tab === "lothistory" && (() => {
        // คำนวณ FIFO balance ต่อ lot โดยใช้ total_out จาก stockBalance
        const skuTotalOutMap = Object.fromEntries(stockBalance.map(b => [b.sku_id, parseFloat(b.total_out) || 0]))
        const stockInBySku = {}
        stockIn.forEach(r => {
          if (!stockInBySku[r.sku_id]) stockInBySku[r.sku_id] = []
          stockInBySku[r.sku_id].push(r)
        })
        const depletedLots = []
        Object.entries(stockInBySku).forEach(([skuId, lots]) => {
          const sorted = [...lots].sort((a,b) => (a.purchased_at||"").localeCompare(b.purchased_at||"") || (a.id||0)-(b.id||0))
          let remainOut = skuTotalOutMap[skuId] || 0
          sorted.forEach(lot => {
            const used = Math.min(lot.quantity_packs || 0, remainOut)
            remainOut -= used
            if ((lot.quantity_packs || 0) - used <= 0) depletedLots.push(lot)
          })
        })
        depletedLots.sort((a,b) => (b.purchased_at||"").localeCompare(a.purchased_at||""))
        const filtered = depletedLots.filter(lot => {
          const sku = skus.find(s => s.sku_id === lot.sku_id)
          if (seriesSel !== "ทั้งหมด" && sku?.series !== seriesSel) return false
          if (search && !lot.sku_id.toLowerCase().includes(search.toLowerCase()) && !(lot.lot_number||"").toLowerCase().includes(search.toLowerCase())) return false
          return true
        })
        const totalValue = filtered.reduce((a,r) => a + (parseFloat(r.total_cost)||0), 0)
        const totalPacks  = filtered.reduce((a,r) => a + (r.quantity_packs||0), 0)
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-wrap gap-3 mb-4 items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-700">ประวัติ Lot ที่ใช้หมดแล้ว</h2>
                <p className="text-xs text-gray-400 mt-0.5">{filtered.length} Lot · มูลค่ารวม {fmtB(totalValue)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา Lot / SKU..."
                    className="pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                </div>
                <div className="flex gap-1">
                  {["ทั้งหมด","OP","PRB","EB"].map(s => (
                    <button key={s} onClick={() => setSeriesSel(s)}
                      className={`px-2.5 py-1.5 text-xs rounded-lg font-medium transition-all ${seriesSel===s?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">ยังไม่มี Lot ที่ใช้หมด</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs text-gray-400 font-medium">Lot</th>
                      <th className="text-left py-2 text-xs text-gray-400 font-medium">SKU</th>
                      <th className="text-left py-2 text-xs text-gray-400 font-medium">วันที่รับ</th>
                      <th className="text-left py-2 text-xs text-gray-400 font-medium">แหล่งที่มา</th>
                      <th className="text-right py-2 text-xs text-gray-400 font-medium">จำนวน</th>
                      <th className="text-right py-2 text-xs text-gray-400 font-medium">ต้นทุน/ซอง</th>
                      <th className="text-right py-2 text-xs text-gray-400 font-medium">มูลค่า Lot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((lot, i) => {
                      const cpp = (lot.quantity_packs||0) > 0 ? (parseFloat(lot.total_cost)||0) / lot.quantity_packs : 0
                      const sku = skus.find(s => s.sku_id === lot.sku_id)
                      const seriesColor = sku?.series==="OP" ? "bg-blue-100 text-blue-700" : sku?.series==="PRB" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                      return (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2.5">
                            <span className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{lot.lot_number || "—"}</span>
                          </td>
                          <td className="py-2.5">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${seriesColor}`}>{lot.sku_id}</span>
                          </td>
                          <td className="py-2.5 text-xs text-gray-600">{lot.purchased_at?.slice(0,10) || "—"}</td>
                          <td className="py-2.5 text-xs text-gray-500 max-w-[160px] truncate">{lot.source || "—"}</td>
                          <td className="py-2.5 text-right text-xs text-gray-700">{fmt(lot.quantity_packs)} ซอง</td>
                          <td className="py-2.5 text-right text-xs font-medium text-purple-600">{fmtB(cpp.toFixed(2))}</td>
                          <td className="py-2.5 text-right text-xs font-semibold text-gray-800">{fmtB(lot.total_cost)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={4} className="py-2.5 px-1 text-xs font-semibold text-gray-600">รวม {filtered.length} Lot</td>
                      <td className="py-2.5 text-right text-xs font-semibold text-gray-700">{fmt(totalPacks)} ซอง</td>
                      <td></td>
                      <td className="py-2.5 text-right text-xs font-bold text-gray-800">{fmtB(totalValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )
      })()}

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

// NAV
// ─────────────────────────────────────────────
const NAV_BASE = [
  { id:"dashboard",  label:"ภาพรวม",         icon:Home          },
  { id:"stock",      label:"จัดการสต็อก",    icon:Package       },
  { id:"withdrawal", label:"เบิกเติมตู้",     icon:ArrowUpCircle },
  { id:"transfer",   label:"แจกจ่ายสินค้า",  icon:Send,  adminOnly:true },
  { id:"mystock",    label:"สต็อกของฉัน",    icon:Boxes         },
  { id:"refillprep", label:"เตรียมของเติมตู้", icon:ClipboardList },
  { id:"machstock",  label:"สต็อกหน้าตู้",   icon:Monitor       },
  { id:"sales",      label:"ยอดขาย",         icon:ShoppingCart  },
  { id:"claims",     label:"เคลม/คืนเงิน",  icon:AlertTriangle },
  { id:"analytics",  label:"วิเคราะห์ SKU",  icon:BarChart2     },
]
const NAV_ADMIN_ITEMS = [
  { id:"users",     label:"จัดการผู้ใช้",  icon:Users },
]

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
  const [resetMode,   setResetMode]   = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) getProfile(session.user.id).then(setProfile)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "SIGNED_OUT") {
        // บันทึก logout ก่อน clear state (ใช้ state ก่อนหน้า)
        setSession(prev => {
          if (prev?.user) logLoginEvent(prev.user.id, prev.user.email, null, "logout")
          return null
        })
        setProfile(null)
      } else if (_event === "PASSWORD_RECOVERY") {
        setSession(session)
        setResetMode(true)
      } else {
        setSession(session)
        if (session?.user) {
          getProfile(session.user.id).then((p) => {
            setProfile(p)
            if (_event === "SIGNED_IN") {
              logLoginEvent(session.user.id, session.user.email, p?.display_name, "login")
            }
          })
        } else { setProfile(null) }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const isAdmin = profile?.role === "admin"
  const NAV = isAdmin ? [...NAV_BASE, ...NAV_ADMIN_ITEMS] : NAV_BASE.filter(n => !n.adminOnly)

  // ── Data State ──
  const [machines,            setMachines]            = useState([])
  const [skus,                setSkus]                = useState(SKUS)
  const [stockIn,             setStockIn]             = useState([])
  const [stockOut,            setStockOut]             = useState([])
  const [stockBalance,        setStockBalance]        = useState([])
  const [sales,               setSales]               = useState([])
  const [machineStock,        setMachineStock]        = useState([])
  const [claims,              setClaims]              = useState([])
  const [transfers,           setTransfers]           = useState([])
  const [machineAssignments,  setMachineAssignments]  = useState([])
  const [allProfiles,         setAllProfiles]         = useState([])
  const [loading,             setLoading]             = useState(true)
  const [dataError,     setDataError]     = useState(null)

  // ── Load All Data from Supabase ──
  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      setDataError(null)
      const [machData, skuData, siData, soData, sbData, salesData, msData, claimsData, tfData, maData, profData] = await Promise.all([
        getMachines(),
        getSkus(),
        getStockIn(),
        getStockOut(),
        getStockBalance(),
        getSalesByMachine(30),
        getMachineStock(),
        getClaims(),
        getStockTransfers().catch(() => []),
        getMachineAssignments().catch(() => []),
        getAllProfiles().catch(() => []),
      ])
      setMachines(machData)
      if (skuData?.length) setSkus(skuData)
      setStockIn(siData)
      setStockOut(soData)
      setStockBalance(sbData)
      setMachineStock(msData || [])
      setClaims(claimsData || [])
      setTransfers(tfData || [])
      setMachineAssignments(maData || [])
      setAllProfiles(profData || [])
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
    const createdBy = profile?.display_name || session?.user?.email || null
    await dbAddStockIn({ ...record, created_by: createdBy })
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
    const createdBy = profile?.display_name || session?.user?.email || null
    const userId = session?.user?.id || null
    await dbAddStockOut({ ...record, created_by: createdBy, withdrawn_by_user_id: userId })
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

  const updateStockOut = async (id, record) => {
    await dbUpdateStockOut(id, record)
    const [newSO, newSB] = await Promise.all([getStockOut(), getStockBalance()])
    setStockOut(newSO)
    setStockBalance(newSB)
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
    const createdBy = profile?.display_name || session?.user?.email || null
    const userId = session?.user?.id || null
    await dbAddClaim({ ...record, confirm_status: status, created_by: createdBy, managed_by_user_id: userId })
    setClaims(await getClaims())
  }

  const confirmClaim = async (claim) => {
    // ยืนยันเคลม → เปลี่ยนสถานะเท่านั้น ไม่ตัด stock (ของออกจากคลังไปแล้วตอนเบิกเติมตู้)
    await dbUpdateClaim(claim.id, { confirm_status: "confirmed" })
    setClaims(await getClaims())
  }

  const deleteClaim = async (id) => {
    await dbDeleteClaim(id)
    setClaims(await getClaims())
  }

  // ── Transfer Operations ──
  const addTransfer = async (record) => {
    const createdBy = profile?.display_name || session?.user?.email || null
    await dbAddStockTransfer({ ...record, created_by: createdBy })
    setTransfers(await getStockTransfers())
  }

  const deleteTransfer = async (id) => {
    await dbDeleteStockTransfer(id)
    const [newT, newSB] = await Promise.all([getStockTransfers(), getStockBalance()])
    setTransfers(newT)
    setStockBalance(newSB)
  }

  // ── Machine Assignment Operations ──
  const addAssignment = async (record) => {
    await dbAddMachineAssignment(record)
    setMachineAssignments(await getMachineAssignments())
  }

  const removeAssignment = async (id) => {
    await dbDeleteMachineAssignment(id)
    setMachineAssignments(await getMachineAssignments())
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
  if (authLoading) return <LoadingScreen/>
  if (resetMode)   return <ResetPasswordPage onDone={() => setResetMode(false)}/>
  if (!session)    return <LoginPage/>
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
            <img src="/logo.png" alt="DivisionX Card" className="w-9 h-9 object-contain rounded-lg"/>
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
          {page === "withdrawal" && <PageWithdrawal machines={machines} stockOut={stockOut} stockIn={stockIn} stockBalance={stockBalance} skus={skus} onAddStockOut={addStockOut} onDeleteStockOut={deleteStockOut} transfers={transfers} machineAssignments={machineAssignments} session={session} profile={profile}/>}
          {page === "transfer"   && <PageTransfer  stockIn={stockIn} stockOut={stockOut} stockBalance={stockBalance} skus={skus} transfers={transfers} profiles={allProfiles} onAddTransfer={addTransfer} onDeleteTransfer={deleteTransfer}/>}
          {page === "mystock"    && <PageMyStock   transfers={transfers} stockOut={stockOut} skus={skus} profile={profile} session={session} profiles={allProfiles} machines={machines} machineAssignments={machineAssignments} onDeleteTransfer={deleteTransfer}/>}
          {page === "refillprep" && <PageRefillPrep machines={machines} machineStock={machineStock} machineAssignments={machineAssignments} transfers={transfers} stockOut={stockOut} skus={skus} profile={profile} session={session} profiles={allProfiles} onAddStockOut={addStockOut} onUpdateStockOut={updateStockOut} onDeleteStockOut={deleteStockOut}/>}
          {page === "machstock"  && <PageMachineStockView machines={machines} machineStock={machineStock} skus={skus} onRefresh={loadAll}/>}
          {page === "sales"      && <PageSales     machines={machines} sales={sales} skus={skus} claims={claims} onRefresh={loadAll}/>}
          {page === "claims"     && <PageClaims    machines={machines} skus={skus} claims={claims} onAddClaim={addClaim} onConfirmClaim={confirmClaim} onDeleteClaim={deleteClaim} machineAssignments={machineAssignments} session={session}/>}
          {page === "analytics"  && <PageAnalytics sales={sales} skus={skus}/>}
          {page === "users"      && <PageUsers     currentProfile={profile} machines={machines} machineAssignments={machineAssignments} allProfiles={allProfiles} onAddAssignment={addAssignment} onRemoveAssignment={removeAssignment}/>}
          {page.startsWith("machine_") && (() => {
            const m = machines.find(mc => `machine_${mc.machine_id}` === page)
            return m ? <PageMachineHistory machine={m} stockOut={stockOut} skus={skus} machines={machines} session={session} profile={profile} onUpdateStockOut={updateStockOut} onDeleteStockOut={deleteStockOut}/> : null
          })()}
        </main>
      </div>
    </div>
  )
}
