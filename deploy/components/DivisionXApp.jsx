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
  signInWithUsername as authSignIn, signOut as authSignOut, getProfile, resetPasswordByUsername, updatePassword,
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
import PageStock from "./pages/PageStock"

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
  const [username, setUsername] = useState("")
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
      await authSignIn(username.trim().toLowerCase(), password)
    } catch {
      setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    if (!username) { setError("กรุณากรอกชื่อผู้ใช้"); return }
    setLoading(true)
    try {
      await resetPasswordByUsername(username.trim().toLowerCase())
      setSuccess("ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลที่ลงทะเบียนแล้ว กรุณาตรวจสอบกล่องจดหมาย")
    } catch {
      setError("ไม่พบผู้ใช้นี้ในระบบ")
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
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">ชื่อผู้ใช้</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="username" required autoFocus
                autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
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
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">ชื่อผู้ใช้</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="username" required autoFocus
                autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              <p className="mt-1.5 text-[11px] text-gray-400">ระบบจะส่งลิงก์รีเซ็ตไปที่อีเมลที่ลงทะเบียนไว้</p>
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


// NAV
// ─────────────────────────────────────────────
const NAV_BASE = [
  { id:"dashboard",  label:"ภาพรวม",         icon:Home          },
  { id:"stock",      label:"จัดการสต็อก",    icon:Package       },
  { id:"withdrawal", label:"เบิกเติมตู้",     icon:ArrowUpCircle },
  { id:"transfer",   label:"แจกจ่ายสินค้า",  icon:Send,  adminOnly:true },
  { id:"mystock",    label:"สต็อกของฉัน",    icon:Boxes         },
  { id:"refillprep", label:"เตรียมของเติมตู้", icon:ClipboardList },
  { id:"claims",     label:"เคลม/คืนเงิน",  icon:AlertTriangle },
  { id:"machstock",  label:"สต็อกหน้าตู้",   icon:Monitor       },
  { id:"sales",      label:"ยอดขาย",         icon:ShoppingCart  },
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
  const [stockInitialTab, setStockInitialTab] = useState(null)

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
    const createdBy = profile?.display_name || profile?.username || session?.user?.email || null
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
    const createdBy = profile?.display_name || profile?.username || session?.user?.email || null
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
    // ทุกสถานะ (lost/damaged/returned) → "pending" รอ admin ยืนยัน
    //   confirm แล้วระบบจึงปรับสต็อก: damaged/lost → ตัด · returned → คืน
    const createdBy = profile?.display_name || profile?.username || session?.user?.email || null
    const userId = session?.user?.id || null
    await dbAddClaim({ ...record, confirm_status: "pending", created_by: createdBy, managed_by_user_id: userId })
    setClaims(await getClaims())
  }

  const confirmClaim = async (claim) => {
    // ยืนยันเคลม:
    //   damaged/lost → ตัดสต็อกของ user ที่บันทึก (สร้าง stock_out)
    //   returned     → คืนสต็อกให้ user (สร้าง transfer)
    await dbUpdateClaim(claim.id, { confirm_status: "confirmed" })
    const adminName = profile?.display_name || profile?.username || session?.user?.email || "admin"

    if ((claim.product_status === "damaged" || claim.product_status === "lost") && claim.managed_by_user_id) {
      const label = claim.product_status === "damaged" ? "ตัดชำรุด" : "ตัดสูญหาย"
      await dbAddStockOut({
        sku_id:               claim.sku_id,
        machine_id:           claim.machine_id,
        quantity_packs:       claim.quantity,
        withdrawn_at:         new Date().toISOString(),
        withdrawn_by_user_id: claim.managed_by_user_id,
        created_by:           adminName,
        note:                 `${label} จากเคลม #${claim.id}`,
        lot_number:           null,
      })
      const [newClaims, newStockOut, newSB] = await Promise.all([getClaims(), getStockOut(), getStockBalance()])
      setClaims(newClaims); setStockOut(newStockOut); setStockBalance(newSB)
      return
    }

    if (claim.product_status === "returned" && claim.managed_by_user_id) {
      // คืนสต็อกให้ user (เช่น user ลืมหยิบของไป) → สร้าง transfer record คืน
      await dbAddStockTransfer({
        sku_id:         claim.sku_id,
        quantity:       claim.quantity,
        quantity_packs: claim.quantity,
        unit:           "pack",
        to_user_id:     claim.managed_by_user_id,
        transferred_at: new Date().toISOString(),
        created_by:     adminName,
        note:           `คืนจากเคลม #${claim.id} (สถานะ: คืนสต็อก)`,
        lot_number:     null,
      })
      const [newClaims, newTransfers, newSB] = await Promise.all([getClaims(), getStockTransfers(), getStockBalance()])
      setClaims(newClaims); setTransfers(newTransfers); setStockBalance(newSB)
      return
    }

    setClaims(await getClaims())
  }

  const deleteClaim = async (id) => {
    await dbDeleteClaim(id)
    setClaims(await getClaims())
  }

  // ── Transfer Operations ──
  const addTransfer = async (record) => {
    const createdBy = profile?.display_name || profile?.username || session?.user?.email || null
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
                  setStockInitialTab(null)
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
                  {(profile?.display_name || profile?.username || session.user.email)[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {profile?.display_name || profile?.username || session.user.email}
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
          {page === "dashboard"  && <PageDashboard stockIn={stockIn} stockOut={stockOut} stockBalance={stockBalance} skus={skus} transfers={transfers} machineStock={machineStock} profile={profile} onAddLot={() => { setStockInitialTab("addin"); setPage("stock") }}/>}
          {page === "stock"      && <PageStock     stockIn={stockIn} stockBalance={stockBalance} skus={skus} initialTab={stockInitialTab} profile={profile} onAddStockIn={addStockIn} onUpdateStockIn={updateStockIn} onDeleteStockIn={deleteStockIn} onAddSku={addSku} onDeactivateSku={deactivateSku} onRecalcAvgCost={async (skuId) => { await recalcAvgCost(skuId); setSkus(await getSkus()) }}/>}
          {page === "withdrawal" && <PageWithdrawal machines={machines} stockOut={stockOut} stockIn={stockIn} stockBalance={stockBalance} skus={skus} onAddStockOut={addStockOut} onDeleteStockOut={deleteStockOut} transfers={transfers} machineAssignments={machineAssignments} session={session} profile={profile}/>}
          {page === "transfer"   && <PageTransfer  stockIn={stockIn} stockOut={stockOut} stockBalance={stockBalance} skus={skus} transfers={transfers} profiles={allProfiles} onAddTransfer={addTransfer} onDeleteTransfer={deleteTransfer}/>}
          {page === "mystock"    && <PageMyStock   transfers={transfers} stockOut={stockOut} stockIn={stockIn} skus={skus} profile={profile} session={session} profiles={allProfiles} machines={machines} machineAssignments={machineAssignments} onDeleteTransfer={deleteTransfer}/>}
          {page === "refillprep" && <PageRefillPrep machines={machines} machineStock={machineStock} machineAssignments={machineAssignments} transfers={transfers} stockOut={stockOut} skus={skus} profile={profile} session={session} profiles={allProfiles} onAddStockOut={addStockOut} onUpdateStockOut={updateStockOut} onDeleteStockOut={deleteStockOut}/>}
          {page === "machstock"  && <PageMachineStockView machines={machines} machineStock={machineStock} skus={skus} onRefresh={loadAll}/>}
          {page === "sales"      && <PageSales     machines={machines} sales={sales} skus={skus} claims={claims} onRefresh={loadAll}/>}
          {page === "claims"     && <PageClaims    machines={machines} skus={skus} claims={claims} onAddClaim={addClaim} onConfirmClaim={confirmClaim} onDeleteClaim={deleteClaim} machineAssignments={machineAssignments} session={session} profile={profile}/>}
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
