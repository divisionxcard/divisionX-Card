"use client"
// Marketing OS — หน้า /marketing (เฟส 1+2)
//
// ธีสิสการออกแบบ: หน้านี้เป็น "กล่องรออนุมัติ" ไม่ใช่ dashboard
// เปิดมาต้องเห็นทันทีว่าวันนี้มีอะไรรอกด แล้วเคลียร์ให้หมดในไม่กี่นาที
// ตัวเลขอยู่ล่างสุด อ่านสัปดาห์ละครั้ง
//
// เฟส 1 = โซน A (อนุมัติคอนเทนต์) · เฟส 2 = โซน C (สายพาน) + D (ตัวเลข)
// โซน B (ตอบคอมเมนต์) เป็นเฟส 3 — ยังขึ้นเป็นการ์ดอธิบายว่าติดอะไรอยู่
import { useState, useEffect, useCallback, useRef } from "react"
import {
  Megaphone, RefreshCw, Check, X, Pencil, Clock, AlertTriangle,
  Wallet, Package, Receipt, TrendingUp, Trophy, MessageSquare, Lock,
  Lightbulb, Newspaper, Youtube, BarChart3, ExternalLink, Sparkles, Music2, Plus,
  Image as ImageIcon, Send, Copy, Maximize2, Calendar as CalendarIcon, Download,
} from "lucide-react"
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceDot,
} from "recharts"
import { supabase } from "../lib/supabase"
import KpiCard from "./shared/KpiCard"
import PostCalendar from "./marketing/PostCalendar"

const PLATFORM_LABEL = { fb: "FB เพจ", line: "LINE OA", ig: "Instagram", tiktok: "TikTok" }
const SLOT_LABEL = { morning: "เช้า", evening: "เย็น" }
const baht = (n) => (n ?? 0).toLocaleString("th-TH")

// แหล่งที่มาของไอเดีย — ไอคอนช่วยให้สแกนเร็วว่าอันไหนข่าวนอก อันไหนข้อมูลเราเอง
const IDEA_SOURCE = {
  news:     { icon: Newspaper, label: "ข่าว/เทรนด์", cls: "bg-sky-50 text-sky-700" },
  tiktok:   { icon: Music2,    label: "TikTok",      cls: "bg-pink-50 text-pink-600" },
  youtube:  { icon: Youtube,   label: "YouTube",     cls: "bg-red-50 text-red-600" },
  internal: { icon: BarChart3, label: "ข้อมูลเราเอง", cls: "bg-emerald-50 text-emerald-700" },
  comment:  { icon: MessageSquare, label: "เสียงลูกค้า", cls: "bg-purple-50 text-purple-700" },
  manual:   { icon: Pencil,    label: "เพิ่มเอง",    cls: "bg-gray-100 text-gray-600" },
}

// ── สถานะสายพาน ────────────────────────────────────────────────────────
const PIPE_STATE = {
  success:   { dot: "bg-green-500",  text: "ผ่าน",     cls: "text-green-600" },
  failure:   { dot: "bg-red-500",    text: "ล้ม",      cls: "text-red-600 font-semibold" },
  cancelled: { dot: "bg-gray-400",   text: "ยกเลิก",   cls: "text-gray-500" },
  in_progress:{ dot: "bg-amber-400 animate-pulse", text: "กำลังทำ", cls: "text-amber-600" },
  queued:    { dot: "bg-amber-300",  text: "รอคิว",    cls: "text-amber-600" },
  never:     { dot: "bg-gray-300",   text: "ยังไม่เคยรัน", cls: "text-gray-400" },
  unknown:   { dot: "bg-gray-300",   text: "ไม่ทราบ",  cls: "text-gray-400" },
}

// ── เมนูซ้าย ───────────────────────────────────────────────────────────
// เดิมทุกโซนกองอยู่หน้าเดียว เลื่อนยาวมาก — กว่าจะถึงตัวเลขต้องผ่านการ์ดคอนเทนต์ทุกใบ
// แยกเป็นหน้าย่อยตามแบบที่เจ้าของเอามาให้ดู (heroaiengine)
//
// ⚠️ จุดที่ต้องระวังตอนแยก: ข้อดีเดิมของหน้าเดียวคือ "เปิดมาเห็นทันทีว่ามีอะไรรอกด"
// พอแยกหน้าแล้วของที่อยู่หน้าอื่นจะหายไปจากสายตา → **ตัวเลขคงค้างต้องติดบนเมนูเสมอ**
// ไม่งั้นจะแลกความสะดวกมาด้วยการลืมงาน ซึ่งแย่กว่าเดิม
const NAV = [
  { group: "วันนี้", items: [
    { key: "ideas",   label: "ไอเดียวันนี้",   icon: Lightbulb,     tone: "bg-amber-500" },
    { key: "approve", label: "รออนุมัติ",      icon: Megaphone,     tone: "bg-blue-600" },
    { key: "ready",   label: "รอโพสต์",        icon: Send,          tone: "bg-emerald-600" },
    { key: "calendar", label: "ปฏิทินโพสต์",   icon: CalendarIcon },
  ] },
  { group: "ดูผล", items: [
    { key: "metrics", label: "ตัวเลข",         icon: TrendingUp },
  ] },
  { group: "ระบบ", items: [
    { key: "system",  label: "สายพานการผลิต",  icon: Clock,         tone: "bg-red-600" },
    { key: "replies", label: "ตอบคอมเมนต์",    icon: MessageSquare, soon: "เฟส 3" },
  ] },
]

function thaiAgo(iso) {
  if (!iso) return "—"
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "เมื่อกี้"
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`
  return `${Math.floor(hrs / 24)} วันที่แล้ว`
}

// ผลตรวจจาก AI ผู้ตรวจ (Hermes อ่านทุกชิ้นก่อนเจ้าของ · migration 066)
// สีสื่อความหมายอย่างเดียวไม่พอ — ใส่คำไทยกำกับด้วย เพราะเจ้าของอ่านบนมือถือกลางแดดบ่อย
const VERDICT = {
  pass: { label: "ผ่าน — โพสต์ได้เลย",  icon: Check,         cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  fix:  { label: "ควรแก้ก่อนโพสต์",     icon: AlertTriangle, cls: "text-orange-700 bg-orange-50 border-orange-200" },
  drop: { label: "ไม่ควรใช้ชิ้นนี้",    icon: X,             cls: "text-rose-700 bg-rose-50 border-rose-200" },
}

function ReviewNote({ verdict, notes }) {
  const v = VERDICT[verdict]
  if (!v) return null                      // verdict แปลก ๆ = ไม่แสดงดีกว่าแสดงผิด
  const Icon = v.icon
  return (
    <div className={`text-xs rounded-lg border px-2.5 py-1.5 mb-2 ${v.cls}`}>
      <div className="flex items-center gap-1.5 font-medium">
        <Icon size={13} /> ผู้ตรวจ: {v.label}
      </div>
      {notes && <p className="mt-1 leading-relaxed whitespace-pre-wrap opacity-90">{notes}</p>}
    </div>
  )
}

// แปลง error ให้แบนเนอร์อ่านได้ — รับทั้งข้อความเปล่าและ Error ที่ api() แนบ hint มา
//
// ⚠️ วิธีแก้จริงเกือบทุกเคสอยู่ใน hint ("เติมเครดิตที่ platform.openai.com → Billing")
//    ถ้าโยนทิ้ง ผู้ใช้เห็นแต่หัวข้อแล้วไม่รู้จะไปทำอะไรต่อ
function toErr(e) {
  if (!e) return ""
  if (typeof e === "string") return { msg: e }
  return { msg: e.message || String(e), hint: e.hint, code: e.code, attempts: e.attempts }
}

export default function MarketingOS() {
  const [token, setToken] = useState(null)
  const [authState, setAuthState] = useState("checking")   // checking | ok | anon | forbidden
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [notice, setNotice] = useState("")   // ข้อความบอกว่าสั่งงาน async ไปแล้ว
  // ผลการจับ SKU จากแคปชั่น {contentId: {status, hint, options, applied}}
  // เก็บแยกจาก item เพราะเป็นผลของ "การกดเขียนรอบนี้" ไม่ใช่ข้อมูลของคอนเทนต์
  const [skuAsk, setSkuAsk] = useState({})
  // ใบนี้กำลังวาดด้วยทางไหน {id: "ai" | "tpl"} — สองปุ่มใช้ธง imaging ร่วมกัน
  // ถ้าไม่แยก ข้อความระหว่างรอจะบอกเวลาผิดทางใดทางหนึ่งเสมอ (AI ~150 วิ · เทมเพลต ~60-120 วิ)
  const [imagingKind, setImagingKind] = useState({})
  // เครดิต OpenAI คงเหลือ — null = ยังไม่ได้โหลด · undefined ไม่ใช้ เพราะ Shell
  // ใช้ค่า undefined เป็นสัญญาณว่า "หน้านี้ไม่มีป้ายเครดิต" (จอ login/forbidden)
  const [credit, setCredit] = useState(null)
  const [preview, setPreview] = useState(null)   // url ภาพที่กำลังดูเต็มจอ
  const [downloading, setDownloading] = useState(false)
  const [proofing, setProofing] = useState(new Set())   // id ที่กำลังตรวจปรู๊ฟอยู่
  const [proof, setProof] = useState({})                // id → ผลตรวจ
  const [briefing, setBriefing] = useState(new Set())   // id ที่กำลังสร้างบรีฟ
  const [brief, setBrief] = useState(null)              // { id, text } บรีฟที่เปิดดูอยู่

  // โหลดรูปแนบทั้งชุดทีเดียว — เว้นจังหวะระหว่างไฟล์เพราะเบราว์เซอร์บล็อกการดาวน์โหลดรัว ๆ
  // จากหน้าเดียวกัน (ไฟล์แรกผ่าน ที่เหลือเงียบ) ซึ่งดูเหมือนปุ่มพังทั้งที่โค้ดถูก
  async function downloadAll(urls) {
    if (downloading) return
    setDownloading(true)
    try {
      for (const [i, u] of urls.entries()) {
        await downloadOne(u, i)
        await new Promise(r => setTimeout(r, 400))
      }
    } finally { setDownloading(false) }
  }

  async function downloadOne(url, i) {
    const res = await fetch(url)
    if (!res.ok) { setErr(`โหลดรูปไม่สำเร็จ: ${url.split("/").pop()}`); return }
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = objectUrl
    const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg")
    a.download = `ref-${i + 1}-${url.split("/").pop()?.split("?")[0] || `image.${ext}`}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
  }

  // ── ขอบรีฟสั่งทำภาพ ──
  // ก๊อปให้อัตโนมัติเลยตั้งแต่ได้ผล เพราะปลายทางคือเอาไปวางใน ChatGPT อยู่แล้ว
  // (ถ้าเบราว์เซอร์ไม่ให้เขียนคลิปบอร์ด ยังมีปุ่มก๊อปในกล่องให้กดเองอีกที)
  async function makeBrief(item) {
    if (briefing.has(item.id)) return
    setBriefing(s => new Set(s).add(item.id))
    try {
      const r = await api("content/brief", { method: "POST", body: JSON.stringify({ id: item.id }) })
      setBrief({ id: item.id, text: r.brief, by: r.generated_by, download: r.download || [] })
      try { await navigator.clipboard?.writeText(r.brief) } catch { /* ไม่ให้เขียนคลิปบอร์ดก็ไม่เป็นไร */ }
    } catch (e) {
      setErr(toErr(e))
    } finally {
      setBriefing(s => { const n = new Set(s); n.delete(item.id); return n })
    }
  }

  // ── ตรวจปรู๊ฟตัวอักษรบนภาพ ──
  // ซอยภาพเป็น 3 แถบซ้อนกันแล้วขยาย 2 เท่าก่อนส่ง — ตัวหนังสือไทยบนภาพ 1080px
  // เล็กเกินกว่าโมเดลจะแยกวรรณยุกต์ออก ส่งภาพเต็มไปจะได้ผลมั่วกว่าไม่ตรวจเลย
  // ทำในเบราว์เซอร์เพราะ canvas ทำได้อยู่แล้ว ไม่ต้องลงไลบรารีภาพบนเซิร์ฟเวอร์
  async function proofImage(item) {
    if (proofing.has(item.id)) return
    setProofing(s => new Set(s).add(item.id))
    setProof(p => ({ ...p, [item.id]: null }))
    try {
      const blob = await (await fetch(item.media_url)).blob()
      const bmp = await createImageBitmap(blob)
      const bands = [[0, 0.4], [0.3, 0.72], [0.62, 1]]
      const tiles = bands.map(([a, b]) => {
        const sy = Math.floor(bmp.height * a)
        const sh = Math.floor(bmp.height * (b - a))
        const cv = document.createElement("canvas")
        cv.width = bmp.width * 2
        cv.height = sh * 2
        const ctx = cv.getContext("2d")
        ctx.imageSmoothingQuality = "high"
        ctx.drawImage(bmp, 0, sy, bmp.width, sh, 0, 0, cv.width, cv.height)
        return cv.toDataURL("image/jpeg", 0.9)
      })
      const r = await api("content/proof", {
        method: "POST",
        body: JSON.stringify({ tiles, caption: item.caption || "" }),
      })
      setProof(p => ({ ...p, [item.id]: r }))
    } catch (e) {
      setProof(p => ({ ...p, [item.id]: { verdict: "fix", problems: [], error: e.message } }))
    } finally {
      setProofing(s => { const n = new Set(s); n.delete(item.id); return n })
    }
  }

  // ── ดาวน์โหลดรูปที่ดูอยู่ ──
  // ⚠ ใช้ <a download> กับ URL ของ Supabase ตรง ๆ ไม่ได้ผล — เบราว์เซอร์เมิน attribute
  //   download เมื่อลิงก์ข้ามโดเมน แล้วจะกลายเป็นเปิดแท็บใหม่หรือไม่เกิดอะไรเลย
  //   ต้องดึงเป็น blob มาก่อนแล้วค่อยสร้างลิงก์จาก object URL (วิธีเดียวกับที่หน้าเตรียมของใช้)
  async function downloadImage(url) {
    if (!url || downloading) return
    setDownloading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`โหลดรูปไม่สำเร็จ (HTTP ${res.status})`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objectUrl
      // ตั้งชื่อไฟล์ให้รู้ที่มา — เวลาโหลดหลายใบจะได้ไม่ชนกันเป็น image(1).png
      const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg")
      a.download = `divisionx-${new Date().toISOString().slice(0, 10)}-${Date.now() % 100000}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // ปล่อยหน่วยความจำหลังเบราว์เซอร์เริ่มโหลดแล้ว
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
    } catch (e) {
      setErr(`ดาวน์โหลดไม่สำเร็จ: ${e.message} — กดคลิกขวาที่รูปแล้วเลือกบันทึกรูปภาพแทนได้`)
    } finally {
      setDownloading(false)
    }
  }
  // ธงบอกว่ายังอยู่บนหน้านี้ไหม — ลูปรอผลโปสเตอร์ต้องหยุดเองถ้าคนปิดหน้าไปแล้ว
  // ไม่งั้นจะยิง API ต่อและ setState กับ component ที่ถูก unmount ไปแล้ว
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  // Esc ปิดภาพเต็มจอ — คนคาดหวังว่าปุ่มนี้ต้องใช้ได้กับ overlay ทุกแบบ
  useEffect(() => {
    if (!preview) return
    const onKey = (e) => { if (e.key === "Escape") setPreview(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [preview])

  const [ideas, setIdeas] = useState({ items: [], counts: {}, by_source: {} })
  const [content, setContent] = useState({ items: [], counts: {} })
  // อนุมัติแล้วแต่ยังไม่ได้โพสต์ — แยก state จาก content เพราะเป็นคนละคิว คนละปุ่ม
  const [ready, setReady] = useState({ items: [] })
  const [pipeline, setPipeline] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [days, setDays] = useState(7)
  // มุมที่เลือกไว้ต่อไอเดีย — ไม่ได้เลือก = ใช้มุมแรก
  const [pickedAngle, setPickedAngle] = useState({})
  const [dismissingId, setDismissingId] = useState(null)
  const [dismissText, setDismissText] = useState("")
  const [pasteUrl, setPasteUrl] = useState("")
  const [pasting, setPasting] = useState(false)
  const [perSource, setPerSource] = useState(3)   // เด็ดสุดกี่ชิ้นต่อช่องทาง
  const [generating, setGenerating] = useState(new Set())   // id ที่ AI กำลังเขียนแคปชั่นให้
  const [imaging, setImaging] = useState(new Set())         // id ที่กำลังสร้างภาพ/โปสเตอร์
  const [varying, setVarying] = useState(new Set())         // id ที่กำลังแปลงไปช่องอื่น
  const [tab, setTab] = useState({})                        // ช่องที่กำลังดูอยู่ต่อการ์ด
  // เวลาที่เริ่มสร้างของแต่ละ id — เอาไปโชว์ว่ารอมากี่วินาทีแล้ว
  // งานใช้เวลา 1-2 นาที ถ้าไม่มีตัวเลขเดินคนจะคิดว่าค้าง
  const [imagingSince, setImagingSince] = useState({})
  const [, tick] = useState(0)
  useEffect(() => {
    if (!imaging.size) return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [imaging])

  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState("")
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectText, setRejectText] = useState("")
  const [busyId, setBusyId] = useState(null)
  // สถานะการเชื่อมต่อเพจ Facebook — null = ยังไม่ได้เช็ก
  // ต้องรู้ "ก่อน" กดโพสต์ ไม่ใช่ไปรู้ตอนกดแล้วพัง (token หมดอายุคือเรื่องปกติของ Meta)
  const [fb, setFb] = useState(null)
  const [posted, setPosted] = useState(null)   // ลิงก์โพสต์ที่เพิ่งขึ้นเพจ
  const [dryRun, setDryRun] = useState(null)   // ผลทดสอบแบบไม่เผยแพร่
  // หน้าย่อยที่กำลังดู — ดู NAV ข้างบนว่าทำไมถึงแยกหน้า
  const [view, setView] = useState("ideas")
  const pasteRef = useRef(null)

  // ── auth ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const t = data?.session?.access_token
      if (!t) { setAuthState("anon"); return }
      setToken(t); setAuthState("ok")
    })
  }, [])

  const api = useCallback(async (path, opts = {}) => {
    // ⚠️ ต้องดึง token สดทุกครั้ง ห้ามใช้ตัวที่เก็บไว้ใน state ตอน mount
    //
    // access_token ของ Supabase หมดอายุใน ~1 ชม. · client ต่ออายุให้เองเบื้องหลัง
    // แต่ค่าที่ copy ไปเก็บใน state ไม่ได้ต่ออายุตาม → เปิดหน้าค้างไว้นาน ๆ แล้วกดปุ่ม
    // จะได้ 401 "unauthorized" ทั้งที่ยัง login อยู่ (เกิดจริง เจ้าของเจอตอนกดอนุมัติ)
    // getSession() คืนตัวล่าสุดเสมอ และต่ออายุให้ถ้าใกล้หมด
    const { data: s } = await supabase.auth.getSession()
    const fresh = s?.session?.access_token
    if (!fresh) {
      setAuthState("anon")
      throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่อีกครั้ง")
    }
    // ไม่ setToken ตรงนี้ — จะทำให้ api() ถูกสร้างใหม่ → loadAll ใหม่ → โหลดซ้ำโดยไม่จำเป็น
    // state token ใช้เป็นแค่ธง "ล็อกอินแล้ว" ตอน mount ไม่ได้ใช้ยิง request แล้ว
    const res = await fetch(`/api/marketing/${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${fresh}`,
        ...(opts.headers || {}),
      },
    })
    if (res.status === 401) {
      setAuthState("anon")
      throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่อีกครั้ง")
    }
    if (res.status === 403) { setAuthState("forbidden"); throw new Error("ต้องเป็น admin เท่านั้น") }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      // ⚠️ วิธีแก้จริงของ error เกือบทุกแบบในระบบนี้อยู่ใน hint ไม่ใช่ error
      //    เช่น "ChatGPT Plus ใช้กับ API ไม่ได้ คนละบิลคนละระบบ"
      //    เดิมอ่านแค่ json.error ทำให้คนเห็นแต่หัวข้อ ไม่รู้ว่าต้องไปทำอะไรต่อ
      const e = new Error(json.error || `HTTP ${res.status}`)
      Object.assign(e, { hint: json.hint, code: json.code,
                         attempts: json.attempts, status: res.status,
                         media_url: json.media_url })
      throw e
    }
    return json
  }, [])

  const loadAll = useCallback(async () => {
    if (!token) return
    setLoading(true); setErr("")
    const [i, c, p, m, a, f, cr] = await Promise.allSettled([
      api(`ideas?status=new&per_source=${perSource}`),
      api("content?status=draft,pending"),
      api("pipeline"),
      api(`metrics?days=${days}`),
      api("content?status=approved"),
      api("content/publish"),
      api("ai-credit"),
    ])
    if (i.status === "fulfilled") setIdeas(i.value)
    if (c.status === "fulfilled") setContent(c.value)
    if (p.status === "fulfilled") setPipeline(p.value)
    if (m.status === "fulfilled") setMetrics(m.value)
    // กันของที่โพสต์ไปแล้วหลุดเข้ามา (status ค้างเป็น approved แต่มี posted_at)
    if (a.status === "fulfilled") setReady({ items: (a.value.items || []).filter(x => !x.posted_at) })
    // ยังไม่ได้ตั้งค่า FB จะคืน 200 พร้อม connected:false · ต่อไม่ติดจริงถึงจะ reject
    setFb(f.status === "fulfilled" ? f.value : { connected: false, error: f.reason?.message })
    // ⚠️ ตัวอ่านเครดิตคืน 200 พร้อม state บอกปัญหาเสมอ (ไม่มี key / ยังไม่ได้รัน migration)
    //    ที่ reject จริงคือต่อไม่ติดเท่านั้น — เก็บเป็น state ของป้าย ไม่ใช่ error ของทั้งหน้า
    //    เครดิตอ่านไม่ได้ไม่ควรบังหน้าที่เหลือ ซึ่งยังทำงานได้ปกติ
    setCredit(cr.status === "fulfilled" ? cr.value
      : { state: "fetch_error", error: cr.reason?.message || "อ่านยอดเครดิตไม่สำเร็จ" })
    // ตัวเช็ก FB ไม่นับเป็น error ของทั้งหน้า — ไม่ได้ตั้งค่าไว้ก็ใช้หน้าอื่นได้ตามปกติ
    const failed = [i, c, p, m, a].filter(r => r.status === "rejected")
    if (failed.length) setErr(failed.map(f => f.reason.message).join(" · "))
    setLoading(false)
  }, [api, token, days, perSource])

  useEffect(() => { if (authState === "ok") loadAll() }, [authState, loadAll])

  // บันทึกยอดคงเหลือที่อ่านมาจากหน้า OpenAI แล้วดึงตัวเลขใหม่ทันที
  // ⚠️ ต้องอ่านซ้ำ ไม่ใช่เอาค่าที่เพิ่งกรอกไปแสดงเลย — ค่าใช้จ่ายของวันนี้
  //    ที่เกิดก่อนหน้าที่จะกรอกก็ถูกหักด้วย เลขที่ถูกจึงมาจากฝั่งเซิร์ฟเวอร์เท่านั้น
  // คืนก้อนใหม่กลับไปให้ป้าย เพื่อบอกได้ว่าบันทึกแล้วคำนวณคงเหลือได้จริงไหม
  const saveCredit = useCallback(async (balance_usd) => {
    await api("ai-credit", { method: "POST", body: JSON.stringify({ balance_usd }) })
    const fresh = await api("ai-credit")
    setCredit(fresh)
    return fresh
  }, [api])

  // ── การกระทำบนการ์ด ──
  // เปลี่ยน status = ออกจากคิว (อนุมัติ/ทิ้ง) · แก้อย่างอื่น (เช่นรูป) = อยู่ในคิวต่อ แค่อัปเดตในที่
  async function patch(id, body) {
    setBusyId(id)
    try {
      const updated = await api("content", { method: "PATCH", body: JSON.stringify({ id, ...body }) })
      setContent(c => body.status
        ? {
            ...c,
            items: c.items.filter(i => i.id !== id),
            counts: { ...c.counts, pending: Math.max(0, (c.counts.pending || 1) - 1) },
          }
        : {
            ...c,
            // PATCH ไม่ได้ embed sku/idea กลับมา — คงของเดิมไว้ ไม่งั้นปุ่ม "ใช้รูป SKU" หายไป
            items: c.items.map(i => (i.id === id ? { ...i, ...updated, sku: i.sku, idea: i.idea } : i)),
          })
    } catch (e) { setErr(toErr(e)) } finally { setBusyId(null) }
  }

  // ให้ AI เขียนแคปชั่นจริงจากไอเดีย (Ollama บนเครื่อง) — ใช้เวลา ~15-60 วินาที
  const generate = useCallback(async (contentId) => {
    setGenerating(s => new Set(s).add(contentId))
    try {
      const updated = await api("content/generate", {
        method: "POST", body: JSON.stringify({ id: contentId }),
      })
      setContent(c => ({
        ...c,
        // route คืน sku มาแล้ว (ตัวจับ SKU อาจเพิ่งเติม source_sku ให้รอบนี้)
        // แต่ถ้าไม่มีให้คงของเดิม ไม่งั้นปุ่ม "ใช้รูป SKU" หายหลังกดเขียน
        items: (c.items || []).map(i =>
          (i.id === contentId ? { ...updated, sku: updated.sku || i.sku } : i)),
      }))
      // เจอหลายชุด → ขึ้นให้เลือกบนการ์ด · เจอตัวเดียว → บอกว่าผูกให้แล้ว
      setSkuAsk(m => ({ ...m, [contentId]: updated.sku_detect || null }))
    } catch (e) {
      setErr(toErr(e))   // ร่างยังอยู่ในคิว กดเขียนใหม่ได้
    } finally {
      setGenerating(s => { const n = new Set(s); n.delete(contentId); return n })
    }
  }, [api])

  // เลือกซองที่จะใช้ทำภาพ เมื่อแคปชั่นเอ่ยถึงหลายชุด
  //
  // ทำไมไม่ให้ระบบเดาเอง: รูปซองถูกส่งให้โมเดลภาพเป็นภาพอ้างอิงที่ต้องลอกตรง ๆ
  // เดาผิด = โปสเตอร์โชว์สินค้าผิดตัวแบบดูดีมากจนไม่มีใครเอะใจตอนตรวจ
  // ไม่ห่อ useCallback เพราะต้องเรียก patch() ซึ่งปิดทับ api ที่เปลี่ยนตาม token
  // ห่อแล้ว deps ว่างจะจับ api ของ render แรกค้างไว้
  async function pickSku(contentId, skuId) {
    await patch(contentId, { source_sku: skuId })
    setSkuAsk(m => ({ ...m, [contentId]: null }))
  }

  // ── ให้ AI สร้างภาพประกอบ ──
  // ใช้รูป SKU จริงเป็นภาพอ้างอิง ไม่ได้ให้มันวาดการ์ดขึ้นเอง
  const makeImage = useCallback(async (contentId, force = false) => {
    setImaging(s => new Set(s).add(contentId))
    setImagingKind(m => ({ ...m, [contentId]: "ai" }))
    setImagingSince(m => ({ ...m, [contentId]: Date.now() }))
    try {
      const updated = await api("content/image", {
        method: "POST", body: JSON.stringify({ id: contentId, force }),
      })
      setContent(c => ({
        ...c,
        // คง sku ไว้เหมือน generate() — route ไม่ได้ embed กลับมา
        items: (c.items || []).map(i => (i.id === contentId ? { ...updated, sku: i.sku } : i)),
      }))
    } catch (e) {
      // เซิร์ฟเวอร์กันสร้างทับรูปเดิมไว้ เพราะทุกใบคือเงินจริง — ถามก่อนแล้วค่อยยืนยัน
      if (e.code === "already_has_image") {
        setImaging(s => { const n = new Set(s); n.delete(contentId); return n })
        if (window.confirm("ใบนี้มีรูปอยู่แล้ว — สร้างใหม่จะเสียค่าสร้างภาพเพิ่มอีกหนึ่งใบ ยืนยันไหม")) {
          return makeImage(contentId, true)
        }
        return
      }
      setErr(toErr(e))
    } finally {
      setImaging(s => { const n = new Set(s); n.delete(contentId); return n })
    }
  }, [api])

  // ── แปลงเรื่องเดียวไปหลายช่องทาง ──
  // ยิงครั้งเดียวให้โมเดลเขียน IG/TikTok/สคริปต์พร้อมกัน (ไม่ยิงแยกช่อง)
  // เพราะโมเดลเห็นทุกช่องพร้อมกันถึงจะบังคับ "ห้ามเปิดประโยคเหมือนกัน" ได้จริง
  // และประหยัดโควตา — Gemini free tier ติดลิมิตต่อนาที ยิง 3 ครั้งชนง่ายมาก
  const makeVariants = useCallback(async (contentId) => {
    setVarying(s => new Set(s).add(contentId))
    try {
      const updated = await api("content/variants", {
        method: "POST", body: JSON.stringify({ id: contentId }),
      })
      setContent(c => ({
        ...c,
        items: (c.items || []).map(i => (i.id === contentId ? { ...updated, sku: i.sku } : i)),
      }))
      setTab(t => ({ ...t, [contentId]: "ig" }))   // เด้งไปช่องแรกที่เพิ่งได้ ให้เห็นผลทันที
    } catch (e) {
      setErr(toErr(e))
    } finally {
      setVarying(s => { const n = new Set(s); n.delete(contentId); return n })
    }
  }, [api])

  // ── สั่งสร้างโปสเตอร์ (ฟรี ไม่ใช้ AI) ──
  // ยิงไป GitHub Actions เพราะต้องใช้ Chromium จริงเรนเดอร์ตัวอักษรไทย
  //
  // งานใช้เวลา 1-2 นาที · แทนที่จะให้คนนั่งกดรีเฟรชเอง ตัวนี้จะคอยเช็กให้
  // แล้วอัปเดตช่องภาพเองเมื่อเสร็จ
  //
  // เทียบกับ media_url "ก่อนสั่ง" ไม่ใช่เช็กแค่ว่ามีค่าไหม — เพราะกดสร้างใหม่
  // ทับของเดิมได้ ถ้าเช็กแค่ว่ามีค่ามันจะคิดว่าเสร็จตั้งแต่รอบแรก
  const POLL_EVERY = 8000
  const POLL_LIMIT = 4 * 60 * 1000      // เผื่อ GitHub Actions เข้าคิวนาน

  const makePoster = useCallback(async (contentId, beforeUrl) => {
    setImaging(s => new Set(s).add(contentId))
    setImagingKind(m => ({ ...m, [contentId]: "tpl" }))
    setImagingSince(m => ({ ...m, [contentId]: Date.now() }))
    try {
      const r = await api("content/poster", {
        method: "POST", body: JSON.stringify({ id: contentId }),
      })
      setNotice(r.message || "สั่งสร้างโปสเตอร์แล้ว — กำลังรอผล…")

      const started = Date.now()
      while (alive.current && Date.now() - started < POLL_LIMIT) {
        await new Promise(res => setTimeout(res, POLL_EVERY))
        if (!alive.current) return
        let fresh
        try {
          fresh = await api("content?status=draft,pending")
        } catch { continue }        // เน็ตสะดุดชั่วคราวไม่ควรทำให้เลิกรอ
        const found = (fresh.items || []).find(i => i.id === contentId)
        if (found && found.media_url && found.media_url !== (beforeUrl || null)) {
          setContent(c => ({
            ...c,
            items: (c.items || []).map(i => (i.id === contentId ? { ...found, sku: i.sku } : i)),
          }))
          setNotice("")
          return
        }
      }
      if (alive.current) {
        setNotice("รอเกิน 4 นาทีแล้วยังไม่เสร็จ — ดูสถานะที่แท็บ Actions บน GitHub หรือกดรีเฟรชเอง")
      }
    } catch (e) {
      setErr(toErr(e))
    } finally {
      setImaging(s => { const n = new Set(s); n.delete(contentId); return n })
    }
  }, [api])

  // ── อัปโหลดรูปจากเครื่อง ──
  // ทางที่ถูกที่สุดในการได้ภาพคุณภาพสูง: สร้างใน ChatGPT ที่จ่ายรายเดือนอยู่แล้ว
  // แล้วลากไฟล์เข้ามาที่นี่ · ของเดิมรับได้แค่ "วางลิงก์" ซึ่งใช้กับไฟล์ในเครื่องไม่ได้
  const uploadImage = useCallback(async (contentId, file) => {
    if (!file) return
    setImaging(s => new Set(s).add(contentId))
    setImagingSince(m => ({ ...m, [contentId]: Date.now() }))
    try {
      const { data: s } = await supabase.auth.getSession()
      const tok = s?.session?.access_token
      if (!tok) { setAuthState("anon"); throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่") }

      const fd = new FormData()
      fd.append("id", String(contentId))
      fd.append("file", file)
      // ไม่ผ่าน api() เพราะตัวนั้นตั้ง Content-Type: application/json ตายตัว
      // multipart ต้องให้เบราว์เซอร์ใส่ boundary เอง ห้ามกำหนดเอง
      const res = await fetch("/api/marketing/content/upload", {
        method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)

      setContent(c => ({
        ...c,
        items: (c.items || []).map(i => (i.id === contentId ? { ...json, sku: i.sku } : i)),
      }))
    } catch (e) {
      setErr(toErr(e))
    } finally {
      setImaging(s => { const n = new Set(s); n.delete(contentId); return n })
    }
  }, [])

  // ── ไอเดีย: กดเลือก → สร้างร่าง แล้วให้ AI เขียนแคปชั่นต่อทันที ──
  async function ideaAction(id, action, reason, angle) {
    setBusyId(`idea-${id}`)
    try {
      const res = await api("ideas", {
        method: "PATCH",
        body: JSON.stringify({ id, action, reason, angle }),
      })
      setIdeas(s => ({ ...s, items: s.items.filter(x => x.id !== id) }))
      if (action === "pick" && res.content) {
        // เอาร่างขึ้นกล่องอนุมัติก่อน แล้วค่อยให้ AI เขียนแคปชั่นทับ
        // (ไม่รอ generate ให้เสร็จ ไม่งั้นปุ่มค้างเป็นนาที)
        setContent(c => ({ ...c, items: [res.content, ...(c.items || [])] }))
        generate(res.content.id)
      }
    } catch (e) { setErr(toErr(e)) } finally { setBusyId(null) }
  }

  // วางลิงก์คลิปที่เห็นว่าไวรัล → ระบบดึงชื่อ/ผู้โพสต์ให้ผ่าน oEmbed
  async function addFromUrl() {
    const url = pasteUrl.trim()
    if (!url) return
    setPasting(true); setErr("")
    try {
      const created = await api("ideas", { method: "POST", body: JSON.stringify({ url }) })
      setIdeas(s => ({ ...s, items: [created, ...(s.items || [])] }))
      setPasteUrl("")
    } catch (e) { setErr(toErr(e)) } finally { setPasting(false) }
  }

  // อนุมัติ = ย้ายจากคิว "รออนุมัติ" ไป "รอโพสต์" — ต้องเด้งขึ้นกล่องล่างทันที
  // ไม่งั้นกดอนุมัติแล้วการ์ดหายไปเฉย ๆ เหมือนงานหลุดมือ (พฤติกรรมเดิม)
  const moveToReady = (id, extra = {}) => {
    const item = (content.items || []).find(i => i.id === id)
    if (item) setReady(s => ({ items: [{ ...item, ...extra, status: "approved" }, ...(s.items || [])] }))
  }
  const approve = (id) => { moveToReady(id); patch(id, { status: "approved" }) }
  const saveEdit = (id) => {
    moveToReady(id, { caption: editText })
    patch(id, { status: "approved", caption: editText })
    setEditingId(null)
  }
  const reject = (id) => {
    patch(id, { status: "rejected", reject_reason: rejectText.trim() || null })
    setRejectingId(null); setRejectText("")
  }

  // โพสต์แล้ว — route จะเซ็ต posted_at ให้เอง · ตัวเลข "โพสต์ช่วยไหม" ในโซน D พึ่งค่านี้
  async function markPosted(id) {
    setBusyId(id)
    try {
      await api("content", { method: "PATCH", body: JSON.stringify({ id, status: "posted" }) })
      setReady(s => ({ items: (s.items || []).filter(i => i.id !== id) }))
    } catch (e) { setErr(toErr(e)) } finally { setBusyId(null) }
  }
  // ── ทดสอบโดยไม่ขึ้นเพจ ──
  // อัปรูปขึ้น Facebook จริงด้วย published=false → ไม่มีใครเห็นบนเพจ หายเองใน 24 ชม.
  // เดินเส้นทางเดียวกับตอนโพสต์จริงทุกอย่าง ต่างแค่ไม่กดเผยแพร่
  // จึงพิสูจน์ได้ว่ารูป+แคปชั่นไทยส่งถึงจริง โดยไม่ต้องเสี่ยงกับเพจธุรกิจ
  async function testPost(item) {
    setBusyId(item.id)
    setDryRun(null)
    try {
      const r = await api("content/publish", {
        method: "POST", body: JSON.stringify({ id: item.id, dryRun: true }),
      })
      setDryRun({ ...r, id: item.id })
    } catch (e) { setErr(toErr(e)) } finally { setBusyId(null) }
  }

  // ── โพสต์ขึ้นเพจจริง ──
  // ต่างจาก markPosted ตรงที่ตัวนี้ยิงขึ้น Facebook เอง ไม่ต้องก๊อปไปวาง
  // ⚠️ กดแล้วขึ้นเพจสาธารณะทันที ลบเองไม่ได้จากตรงนี้ — ต้องถามยืนยันก่อนเสมอ
  async function publishNow(item) {
    const preview = (item.caption || "").slice(0, 90).replace(/\s+/g, " ")
    if (!confirm(`โพสต์ขึ้นเพจ Facebook จริงเลยไหม?\n\n"${preview}…"\n` +
                 `${item.media_url ? "พร้อมรูปประกอบ" : "ข้อความล้วน (ไม่มีรูป)"}\n\n` +
                 `โพสต์แล้วคนเห็นทันที และลบจากหน้านี้ไม่ได้`)) return
    setBusyId(item.id)
    try {
      const r = await api("content/publish", { method: "POST", body: JSON.stringify({ id: item.id }) })
      setReady(s => ({ items: (s.items || []).filter(i => i.id !== item.id) }))
      setPosted(r.post_url || null)
    } catch (e) {
      setErr(toErr(e))
    } finally { setBusyId(null) }
  }

  // เอากลับมาแก้ — เผลออนุมัติ หรือแคปชั่นยังมีช่องว่างค้าง
  async function unapprove(id) {
    setBusyId(id)
    try {
      const back = await api("content", { method: "PATCH", body: JSON.stringify({ id, status: "pending" }) })
      setReady(s => ({ items: (s.items || []).filter(i => i.id !== id) }))
      setContent(c => ({ ...c, items: [back, ...(c.items || [])] }))
    } catch (e) { setErr(toErr(e)) } finally { setBusyId(null) }
  }

  // ช่องว่างที่ยังไม่ได้เติม เช่น {ชื่อการ์ด} — ห้ามปล่อยให้โพสต์ทั้งอย่างนั้น
  const holesIn = (s) => (s || "").match(/\{[^}]{1,40}\}/g) || []

  // ── หน้าจอสถานะ ──
  if (authState === "checking") return <Shell><p className="text-gray-500">กำลังตรวจสิทธิ์…</p></Shell>
  if (authState === "anon") return (
    <Shell>
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <Lock className="mx-auto text-gray-400 mb-3" size={32} />
        <p className="font-semibold text-gray-800 mb-1">ต้องเข้าสู่ระบบก่อน</p>
        <p className="text-sm text-gray-500 mb-4">หน้านี้แสดงข้อมูลการตลาดภายใน</p>
        <a href="/" className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
          ไปหน้าเข้าสู่ระบบ
        </a>
      </div>
    </Shell>
  )
  if (authState === "forbidden") return (
    <Shell>
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <Lock className="mx-auto text-red-400 mb-3" size={32} />
        <p className="font-semibold text-gray-800">เฉพาะผู้ดูแลระบบ (admin)</p>
      </div>
    </Shell>
  )

  const pending = content.items || []
  const navCounts = {
    ideas:   (ideas.items || []).length,
    approve: pending.length,
    ready:   (ready.items || []).length,
    system:  pipeline?.failing || 0,
  }

  return (
    <Shell onRefresh={loadAll} loading={loading}
      credit={credit} onSaveCredit={saveCredit}
      nav={<NavRail view={view} setView={setView} counts={navCounts}
        onNew={() => { setView("ideas"); setTimeout(() => pasteRef.current?.focus(), 0) }} />}>
      {err && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div>{typeof err === "string" ? err : err.msg}</div>
            {err?.hint && <div className="mt-1 text-red-600/80 text-xs leading-relaxed">{err.hint}</div>}
            {err?.attempts?.length > 0 && (
              <details className="mt-1.5">
                <summary className="text-xs text-red-500 cursor-pointer">ดูว่าลองอะไรไปบ้าง</summary>
                <ul className="mt-1 text-xs text-red-500/90 space-y-0.5">
                  {err.attempts.map((a, i) => <li key={i}>· {a}</li>)}
                </ul>
              </details>
            )}
          </div>
          <button onClick={() => setErr("")} title="ปิด"
            className="shrink-0 text-red-400 hover:text-red-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── ดูภาพเต็มจอ ──
          โปสเตอร์เป็น 1080×1080 แต่ในการ์ดย่อเหลือ 144px ตรวจอะไรไม่ได้เลย
          ต้องเปิดดูเต็ม ๆ ก่อนอนุมัติ ไม่งั้นตัวหนังสือเพี้ยน/ตกขอบก็ไม่รู้ */}
      {/* กล่องบรีฟ — ให้เลือกข้อความได้ทั้งก้อนและก๊อปซ้ำได้ ไม่ต้องลากเมาส์เอง */}
      {brief && (
        <div onClick={() => setBrief(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 p-4 border-b border-gray-100">
              <Sparkles size={16} className="text-violet-600" />
              <span className="text-sm font-semibold text-gray-800">บรีฟสั่งทำภาพ · คอนเทนต์ #{brief.id}</span>
              <span className="text-[11px] text-gray-400">
                {brief.by === "gemini" ? "เขียนโดย AI" : "ประกอบจากข้อมูลจริง"} · ก๊อปให้แล้ว
              </span>
              <button onClick={() => setBrief(null)}
                className="ml-auto w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <textarea readOnly value={brief.text}
              onFocus={e => e.target.select()}
              className="flex-1 m-4 p-3 text-xs leading-relaxed border border-gray-200 rounded-xl
                         font-mono resize-none min-h-[45vh]" />
            <div className="flex items-center flex-wrap gap-2 px-4 pb-4">
              <button onClick={() => navigator.clipboard?.writeText(brief.text)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm">
                <Copy size={14} /> ก๊อปอีกครั้ง
              </button>
              {/* ⚠ ChatGPT เปิดลิงก์เองไม่ได้ ต้องอัปโหลดไฟล์เข้าแชต — ปุ่มนี้จึงจำเป็น
                  ไม่ใช่ของเสริม รอบแรกที่ทดสอบจริงมันปฏิเสธไม่ยอมทำภาพเพราะได้แค่ลิงก์ */}
              {brief.download?.length > 0 && (
                <button onClick={() => downloadAll(brief.download)} disabled={downloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">
                  <Download size={14} />
                  {downloading ? "กำลังโหลด…" : `ดาวน์โหลดรูปแนบ ${brief.download.length} ไฟล์`}
                </button>
              )}
              <span className="text-[11px] text-gray-400">
                ต้องลากไฟล์เข้าแชต ChatGPT ด้วย — วางแค่ลิงก์มันเปิดไม่ได้
              </span>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out">
          <img src={preview} alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-full object-contain rounded-xl shadow-2xl cursor-default" />
          <div className="absolute top-4 right-4 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}>
            <button onClick={() => downloadImage(preview)} disabled={downloading}
              className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm
                         flex items-center gap-1.5 disabled:opacity-50">
              <Download size={14} /> {downloading ? "กำลังโหลด…" : "ดาวน์โหลด"}
            </button>
            <a href={preview} target="_blank" rel="noreferrer"
              className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm
                         flex items-center gap-1.5">
              <ExternalLink size={14} /> เปิดแท็บใหม่
            </a>
            <button onClick={() => setPreview(null)}
              className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center">
              <X size={18} />
            </button>
          </div>
          <p className="absolute bottom-5 text-white/50 text-xs">กดพื้นที่ว่างหรือ Esc เพื่อปิด</p>
        </div>
      )}

      {/* งาน async ต้องบอกว่าสั่งไปแล้ว ไม่งั้นกดปุ่มแล้วเงียบ คนจะกดซ้ำ ๆ */}
      {notice && (
        <div className="mb-4 flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-3 text-sm">
          <Clock size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => { setNotice(""); loadAll() }}
            className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium shrink-0">
            รีเฟรช
          </button>
        </div>
      )}

      {/* ── สถานี 1 · ไอเดียวันนี้ ──
          AI ไปหาข่าว/เทรนด์ + อ่านข้อมูลขายของเราเอง มาวางบนโต๊ะ คนแค่สแกนแล้วเลือก */}
      {view === "ideas" && (
        <section>
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Lightbulb size={16} className="text-amber-500" />
              ไอเดียวันนี้
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs">
                {(ideas.items || []).length}
              </span>
            </h2>
            {/* chip บอก "แสดง/ทั้งหมด" ต่อช่องทาง — จะได้รู้ว่ายังมีของที่ถูกซ่อนอยู่ */}
            {Object.entries(ideas.by_source || {}).map(([s, total]) => {
              const shown = (ideas.items || []).filter(i => i.source === s).length
              return (
                <span key={s} className={`px-2 py-0.5 rounded text-xs ${IDEA_SOURCE[s]?.cls || "bg-gray-100 text-gray-600"}`}>
                  {IDEA_SOURCE[s]?.label || s} {shown}
                  {total > shown && <span className="opacity-60">/{total}</span>}
                </span>
              )
            })}
            {ideas.hidden > 0 && (
              <button onClick={() => setPerSource(p => (p === 3 ? 10 : 3))}
                className="ml-auto text-xs text-blue-500 hover:underline">
                {perSource === 3 ? `ดูเพิ่ม (ซ่อนอยู่ ${ideas.hidden})` : "แสดงแค่ 3 ต่อช่องทาง"}
              </button>
            )}
          </div>

          {/* วางลิงก์เอง — ทางเดียวที่เก็บ "คลิปไวรัลที่เห็นกับตา" ได้
              (TikTok ไม่มี RSS · Creative Center API ตอบ no permission) */}
          <div className="flex gap-2 mb-2">
            <input
              ref={pasteRef}
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addFromUrl() }}
              placeholder="วางลิงก์ TikTok / YouTube ที่เห็นว่าไวรัล แล้วกด Enter"
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
            <button onClick={addFromUrl} disabled={pasting || !pasteUrl.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 text-white text-sm disabled:opacity-40">
              <Plus size={14} /> {pasting ? "กำลังดึง…" : "เก็บไว้"}
            </button>
          </div>

          {ideas.warning ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              {ideas.warning} — รัน migration 060 แล้วสั่ง{" "}
              <code className="bg-white/60 px-1 rounded">idea_collector.py</code>
            </div>
          ) : (ideas.items || []).length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <Lightbulb className="mx-auto text-gray-300 mb-2" size={26} />
              <p className="text-gray-600 text-sm">ยังไม่มีไอเดียใหม่</p>
              <p className="text-xs text-gray-400 mt-1">ตัวเก็บไอเดียรันทุกเช้า 07:00 น.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(ideas.items || []).map(idea => {
                const src = IDEA_SOURCE[idea.source] || IDEA_SOURCE.manual
                const SrcIcon = src.icon
                return (
                  <article key={idea.id} className="bg-white rounded-xl border border-gray-100 p-3">
                    <div className="flex items-start gap-2.5">
                      <span className={`shrink-0 rounded-lg p-1.5 ${src.cls}`}><SrcIcon size={15} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[11px] text-gray-400">{idea.source_label || src.label}</span>
                          <span className="text-[11px] text-amber-600 font-medium">
                            คะแนน {Number(idea.score).toFixed(1)}
                          </span>
                          {idea.url && (
                            <a href={idea.url} target="_blank" rel="noreferrer"
                              className="text-[11px] text-blue-500 inline-flex items-center gap-0.5">
                              เปิดต้นทาง <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-800 leading-snug">{idea.title}</p>

                        {/* ── มุมที่จะเล่า ──
                            ไอเดียใหม่มี 3 มุมให้เลือก (AI คิดจากข่าวชิ้นนั้น) · ของเก่ามีมุมเดียว
                            เลือกมุมต่างกัน = ได้คอนเทนต์คนละแนวจากข่าวเดียวกัน
                            ซึ่งเป็นตัวแก้รากของปัญหาคอนเทนต์ซ้ำ (angle เดิมเป็น template ตายตัว) */}
                        {Array.isArray(idea.angles) && idea.angles.length > 0 ? (
                          <div className="mt-2">
                            <p className="text-[11px] text-gray-400 mb-1">เลือกมุมที่จะเล่า</p>
                            <div className="flex flex-col gap-1">
                              {idea.angles.map((a) => {
                                const on = (pickedAngle[idea.id] || idea.angles[0].label) === a.label
                                return (
                                  <button key={a.label}
                                    onClick={() => setPickedAngle(m => ({ ...m, [idea.id]: a.label }))}
                                    title={a.brief}
                                    className={`text-left rounded-lg px-2.5 py-1.5 border transition
                                      ${on ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                                    <span className={`text-xs font-medium ${on ? "text-blue-700" : "text-gray-700"}`}>
                                      {a.label}
                                    </span>
                                    <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">
                                      {a.brief}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ) : idea.angle ? (
                          <p className="text-xs text-gray-600 mt-1">
                            <span className="text-gray-400">มุมที่จะเล่า:</span> {idea.angle}
                          </p>
                        ) : null}
                        {idea.relevance && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{idea.relevance}</p>
                        )}

                        {dismissingId === idea.id ? (
                          <div className="flex gap-2 mt-2">
                            <input
                              value={dismissText}
                              onChange={e => setDismissText(e.target.value)}
                              placeholder="ไม่เอาเพราะอะไร?"
                              className="flex-1 text-xs border border-gray-300 rounded-lg px-2.5 py-1.5"
                              autoFocus
                            />
                            <button onClick={() => {
                              ideaAction(idea.id, "dismiss", dismissText.trim() || null)
                              setDismissingId(null); setDismissText("")
                            }} className="px-2.5 py-1.5 rounded-lg bg-gray-700 text-white text-xs">ไม่เอา</button>
                            <button onClick={() => setDismissingId(null)}
                              className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs">ยกเลิก</button>
                          </div>
                        ) : (
                          <div className="flex gap-2 mt-2">
                            <button
                              disabled={busyId === `idea-${idea.id}`}
                              onClick={() => ideaAction(idea.id, "pick", null,
                                pickedAngle[idea.id] || idea.angles?.[0]?.label || null)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium disabled:opacity-50">
                              <Sparkles size={13} /> เริ่มทำคอนเทนต์
                            </button>
                            <button onClick={() => setDismissingId(idea.id)}
                              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-xs">ไม่เอา</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── สถานี 2 · กล่องอนุมัติ ── */}
      {view === "approve" && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <Megaphone size={16} className="text-blue-600" />
            รออนุมัติ
            <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs">{pending.length}</span>
          </h2>

          {/* สรุปผลตรวจของทั้งกล่อง — ให้รู้ตั้งแต่ยังไม่เลื่อนว่าเหลือของดีให้หยิบกี่ชิ้น
              นับจากที่ตรวจแล้วเท่านั้น ที่ยังไม่ตรวจไม่นับ จะได้ไม่หลอกตาว่าเคลียร์แล้ว */}
          {pending.some(i => i.review_verdict) && (
            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
              {["pass", "fix", "drop"].map(k => {
                const n = pending.filter(i => i.review_verdict === k).length
                if (!n) return null
                const V = VERDICT[k]
                return (
                  <span key={k} className={`px-2 py-1 rounded-lg border ${V.cls}`}>
                    {V.label} · {n}
                  </span>
                )
              })}
              {pending.some(i => !i.review_verdict) && (
                <span className="px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-500">
                  ยังไม่ได้ตรวจ · {pending.filter(i => !i.review_verdict).length}
                </span>
              )}
            </div>
          )}

          {pending.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <Check className="mx-auto text-green-500 mb-2" size={28} />
              <p className="text-gray-700 font-medium">เคลียร์หมดแล้ว</p>
              <p className="text-sm text-gray-400 mt-1">
                ร่างใหม่มาจาก content_suggester ทุกเช้า
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map(item => (
                <article key={item.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                 <div className="flex flex-col sm:flex-row gap-3">
                  {/* ── ช่องภาพ — ดูตัวอย่างก่อนอนุมัติ ──
                      3 ทาง: รูป SKU จริง (ฟรี ทันที) · AI จัดฉากรอบรูปจริง (เสียเงิน) · วางลิงก์เอง
                      AI ไม่ได้ "วาดการ์ดขึ้นมาเอง" — มันได้รูปซองจริงเป็นภาพอ้างอิงแล้วจัดฉาก/แสงรอบ ๆ */}
                  <div className="sm:w-36 shrink-0 space-y-1.5">
                    {item.media_url ? (
                      <div className="relative group">
                        {/* ภาพย่อ 144px ดูรายละเอียดไม่ออก — กดแล้วเปิดดูเต็มจอ
                            ต้องดูให้ชัดก่อนอนุมัติ ไม่งั้นตัวหนังสือเพี้ยนก็ไม่รู้ */}
                        <img src={item.media_url} alt=""
                          onClick={() => setPreview(item.media_url)}
                          title="กดเพื่อดูเต็มจอ"
                          className="w-full sm:w-36 h-36 object-contain rounded-xl bg-black/20
                                     border border-gray-200 cursor-zoom-in" />
                        <div onClick={() => setPreview(item.media_url)}
                          className="absolute inset-0 rounded-xl bg-black/45 text-white text-[11px] font-medium
                                     flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100
                                     transition cursor-zoom-in">
                          <Maximize2 size={13} /> ดูเต็มจอ
                        </div>
                        <button
                          onClick={() => patch(item.id, { media_url: "" })}
                          title="เอารูปออก"
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className={`w-full sm:w-36 h-36 rounded-xl flex flex-col items-center justify-center
                                       gap-1.5 text-center px-2 relative overflow-hidden
                                       ${imaging.has(item.id)
                                          ? "border border-blue-300 bg-blue-50/60"
                                          : "border border-dashed border-gray-300"}`}>
                        {imaging.has(item.id) ? (
                          <>
                            {/* แถบแสงกวาด — บอกว่ายังทำงานอยู่แม้ตัวเลขจะเดินช้า */}
                            <div className="dx-shimmer absolute inset-0" />
                            {/* วงแหวนหมุน ทำจาก border ล้วน ไม่ต้องพึ่งไอคอนเพิ่ม */}
                            <div className="relative w-9 h-9 rounded-full border-[3px] border-blue-200
                                            border-t-blue-600 animate-spin" />
                            <span className="relative text-[11px] font-medium text-blue-700">
                              {imagingKind[item.id] === "tpl" ? "กำลังสร้างจากเทมเพลต…" : "AI กำลังวาด…"}
                            </span>
                            <span className="relative text-[10px] text-blue-500 tabular-nums">
                              {Math.floor((Date.now() - (imagingSince[item.id] || Date.now())) / 1000)} วินาที
                              <span className="text-blue-400">
                                {imagingKind[item.id] === "tpl" ? " · ปกติ 60-120 วิ" : " · ปกติ 150-200 วิ"}
                              </span>
                            </span>
                          </>
                        ) : (
                          <>
                            <ImageIcon size={20} className="text-gray-400" />
                            <span className="text-[11px] text-gray-400">ยังไม่มีภาพ</span>
                            {(item.sku?.image_url || item.sku?.image_url_box) && (
                              <button
                                onClick={() => patch(item.id, {
                                  media_url: item.sku.image_url || item.sku.image_url_box,
                                })}
                                className="text-[11px] text-blue-500 underline">
                                ใช้รูป {item.sku.sku_id}
                              </button>
                            )}
                            {/* อัปโหลดจากเครื่อง — ทางหลักสำหรับภาพที่สร้างจาก ChatGPT เอง */}
                            <label className="text-[11px] text-blue-600 underline cursor-pointer">
                              อัปโหลดรูป
                              <input type="file" accept="image/*" className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  e.target.value = ""   // เลือกไฟล์เดิมซ้ำได้
                                  uploadImage(item.id, f)
                                }} />
                            </label>
                            <button
                              onClick={() => {
                                const u = window.prompt("วางลิงก์รูป (https://...)")
                                if (u) patch(item.id, { media_url: u })
                              }}
                              className="text-[11px] text-gray-400 underline">
                              วางลิงก์เอง
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* บรีฟสั่งทำภาพ — ก๊อปไปวางใน ChatGPT ได้เลย
                        อยู่เหนือปุ่มสร้างโปสเตอร์เพราะเป็นทางที่เจ้าของใช้จริงมากกว่า */}
                    <button
                      disabled={briefing.has(item.id)}
                      onClick={() => makeBrief(item)}
                      title="สร้างบรีฟพร้อมข้อเท็จจริงจากฐานข้อมูล สำหรับเอาไปให้ ChatGPT ออกแบบภาพ"
                      className="w-full sm:w-36 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
                                 bg-violet-600 text-white text-[11px] font-medium disabled:opacity-50">
                      <Sparkles size={12} />
                      {briefing.has(item.id) ? "กำลังเขียน…" : "บรีฟทำรูป"}
                    </button>

                    {/* ตรวจปรู๊ฟตัวอักษรบนภาพ — ใช้กับภาพที่ทำจากที่อื่น (ChatGPT) ได้ด้วย
                        ซอยภาพ + ขยายในเบราว์เซอร์ก่อนส่ง เพราะตัวหนังสือไทยเล็กเกินกว่าจะอ่านจากภาพเต็ม */}
                    {item.media_url && (
                      <>
                        <button
                          disabled={proofing.has(item.id)}
                          onClick={() => proofImage(item)}
                          title="อ่านตัวอักษรบนภาพแล้วเทียบกับแคปชั่นที่อนุมัติ"
                          className="w-full sm:w-36 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
                                     bg-amber-500 text-white text-[11px] font-medium disabled:opacity-50">
                          <Check size={12} />
                          {proofing.has(item.id) ? "กำลังตรวจ…" : "ตรวจตัวอักษร"}
                        </button>
                        {proof[item.id] && (
                          <div className={`w-full sm:w-36 text-[10px] rounded-lg px-2 py-1.5 leading-relaxed
                            ${proof[item.id].verdict === "pass"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                            {proof[item.id].error ? (
                              <span>{proof[item.id].error}</span>
                            ) : proof[item.id].verdict === "pass" ? (
                              <span>ไม่พบที่ผิด — แต่ตัวตรวจจับได้ราวครึ่งเดียว ซูมอ่านพาดหัวเองอีกที</span>
                            ) : (
                              <>
                                <b>เจอ {proof[item.id].problems.length} จุด</b>
                                {proof[item.id].problems.map((p, i) => (
                                  <div key={i} className="mt-1">
                                    “{p.found}” → “{p.should_be}”
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* ทางหลัก — โปสเตอร์ทั้งใบจาก AI (สลับมาเป็นตัวหลัก 27 ส.ค. 2026)

                        เจ้าของสั่งเปลี่ยนเพราะเทมเพลตออกมาหน้าตาเหมือนกันหมดทุกชิ้น
                        เปลี่ยนแค่ข้อความกับรูปสินค้า ฉากกับองค์ประกอบไม่เคยต่าง

                        ทดสอบยิงจริง 4 ใบก่อนสลับ: ตัวอักษรไทยถูกทุกตัวรวมวรรณยุกต์กับสระบน/ล่าง
                        (เหตุผลเดียวที่เทมเพลตเคยจำเป็นคือ Satori ทำไทยเพี้ยน — หมดไปแล้ว)
                        ซองสินค้าลอกจากรูปจริงครบทุกจุด · ใช้เวลา 145-153 วินาทีต่อใบ */}
                    <button
                      disabled={imaging.has(item.id)}
                      onClick={() => makeImage(item.id)}
                      title="ให้ AI ออกแบบโปสเตอร์ทั้งใบจากแคปชั่น + รูปซองจริง · ราว 2-3 นาที · เสียค่าสร้างภาพต่อใบ"
                      className="w-full sm:w-36 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
                                 bg-blue-600 text-white text-[11px] font-medium disabled:opacity-50">
                      <Sparkles size={12} />
                      {imaging.has(item.id) ? "AI กำลังวาด… รออยู่"
                        : item.media_url ? "ให้ AI วาดใหม่" : "ให้ AI ออกแบบ"}
                    </button>

                    {/* ทางสำรอง — เทมเพลตแบรนด์ · ฟรี ตัวเลขมาจาก DB ตรง ๆ
                        เก็บไว้เพราะไม่เสียเงินและได้ผลแน่นอนเวลา OpenAI ล่ม
                        แต่หน้าตาตายตัวทุกใบ จึงไม่ใช่ทางหลักอีกต่อไป */}
                    <button
                      disabled={imaging.has(item.id)}
                      onClick={() => makePoster(item.id, item.media_url)}
                      title="สร้างจากเทมเพลตแบรนด์ · ฟรี · ราว 1-2 นาที · หน้าตาตายตัวทุกใบ"
                      className="w-full sm:w-36 flex items-center justify-center gap-1.5 px-2 py-1
                                 rounded-lg text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-50">
                      <ImageIcon size={11} />
                      เทมเพลต (ฟรี)
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500 mb-2">
                    {/* เลขแคปชั่น — ต้องเห็นตลอด เวลาคุยกับผู้ตรวจหรือแจ้งแก้จะได้อ้างตัวเดียวกัน
                        select-all เพื่อให้ดับเบิลคลิกแล้วคัดลอกได้ทันที */}
                    <span className="px-2 py-0.5 rounded bg-gray-900 text-white font-mono font-medium select-all">
                      #{item.id}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-gray-100 font-medium text-gray-700">
                      {PLATFORM_LABEL[item.platform] || item.platform}
                    </span>
                    {item.slot && <span>· {SLOT_LABEL[item.slot] || item.slot}</span>}
                    {item.created_by === "ai" && <span>· 🤖 AI ร่าง</span>}
                    {/* draft = ตั้งต้นจากไอเดีย ยังไม่มีแคปชั่นจริง — ต้องบอกให้ชัด
                        ไม่งั้นจะเผลออนุมัติโจทย์แทนแคปชั่น */}
                    {item.status === "draft" && !generating.has(item.id) && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                        ยังไม่มีแคปชั่นจริง
                      </span>
                    )}
                    {generating.has(item.id) && (
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium inline-flex items-center gap-1">
                        <Sparkles size={11} className="animate-pulse" /> AI กำลังเขียน…
                      </span>
                    )}
                    {/* รูปแบบที่สุ่มได้รอบนี้ — กด "เขียนใหม่" แล้วจะเปลี่ยนเป็นแบบอื่น */}
                    {item.format?.label && (
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium">
                        {item.format.label}
                      </span>
                    )}
                    {item.retried && (
                      <span className="text-gray-400">· เขียนใหม่ให้แล้ว 1 รอบ (รอบแรกซ้ำของเก่า)</span>
                    )}
                  </div>

                  {/* ยังคล้ายของเก่าอยู่แม้เขียนใหม่แล้ว — ให้คนตัดสิน ระบบไม่ทิ้งให้เอง
                      เพราะบางทีซ้ำโครงแต่เนื้อต่าง ซึ่งอาจตั้งใจก็ได้ */}
                  {item.similar && (
                    <div className="mb-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200
                                    text-amber-800 rounded-lg px-2.5 py-1.5 text-xs">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>
                        คล้ายโพสต์ #{item.similar.id} อยู่ <b>{item.similar.score}%</b> — โพสต์ซ้ำแนวเดิมเอ็นเกจเมนต์จะตก
                        <br />
                        <span className="text-amber-700/70">“{item.similar.preview}”</span>
                        <br />
                        กด <b>เขียนใหม่</b> เพื่อให้ AI ลองมุมอื่น
                      </span>
                    </div>
                  )}

                  {editingId === item.id ? (
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={6}
                      className="w-full text-sm border border-blue-300 rounded-lg p-3 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  ) : (
                    <>
                      {/* ── แท็บช่องทาง ──
                          เรื่องเดียวกันเขียนคนละแบบตามธรรมเนียมแต่ละช่อง
                          ขึ้นเฉพาะเมื่อสร้างช่องอื่นแล้ว ไม่งั้นรกเปล่า ๆ */}
                      {item.variants && Object.keys(item.variants).length > 0 && (
                        <div className="flex gap-1 mb-2">
                          {[["fb", "Facebook"], ["ig", "Instagram"], ["tiktok", "TikTok"], ["script", "สคริปต์"]]
                            .filter(([k]) => k === "fb" || item.variants[k])
                            .map(([k, label]) => {
                              const on = (tab[item.id] || "fb") === k
                              return (
                                <button key={k} onClick={() => setTab(t => ({ ...t, [item.id]: k }))}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition
                                    ${on ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                                  {label}
                                </button>
                              )
                            })}
                        </div>
                      )}

                      <p className="text-sm text-gray-800 whitespace-pre-wrap mb-2">
                        {(tab[item.id] && tab[item.id] !== "fb" && item.variants?.[tab[item.id]]) || item.caption}
                      </p>

                      {tab[item.id] && tab[item.id] !== "fb" && (
                        <button
                          onClick={() => navigator.clipboard?.writeText(item.variants?.[tab[item.id]] || "")}
                          className="mb-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-[11px]">
                          <Copy size={12} /> ก๊อปช่องนี้
                        </button>
                      )}
                    </>
                  )}

                  {/* บรรทัดนี้คือหัวใจ — บอกว่าทำไม AI ถึงเสนอชิ้นนี้ ตัดสินใจได้ใน 2 วินาที */}
                  {item.source_reason && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mb-2">
                      💡 จาก: {item.source_reason}
                    </p>
                  )}

                  {/* ผลตรวจจาก AI ผู้ตรวจ (Hermes) — อ่านก่อนตัดสินใจ
                      วางไว้เหนือปุ่มโดยตั้งใจ: เห็นข้อท้วงติงก่อนนิ้วไปถึงปุ่มอนุมัติ
                      ⚠ เป็นแค่ความเห็น ไม่ได้เปลี่ยนสถานะอะไร เจ้าของยังตัดสินเองทุกชิ้น */}
                  {item.review_verdict && (
                    <ReviewNote verdict={item.review_verdict} notes={item.review_notes} />
                  )}

                  {/* ลิงก์ต้นทางอยู่ตรงนี้ ไม่ใช่ในตัวแคปชั่น — URL ข่าวยาวมากจนอ่านแคปชั่นไม่ออก */}
                  {item.idea?.url && (
                    <a href={item.idea.url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-500 mb-3">
                      ดูต้นทาง <ExternalLink size={11} />
                    </a>
                  )}

                  {rejectingId === item.id ? (
                    <div className="flex gap-2">
                      <input
                        value={rejectText}
                        onChange={e => setRejectText(e.target.value)}
                        placeholder="ทิ้งเพราะอะไร? (ช่วยให้ AI ไม่เสนอแบบเดิมอีก)"
                        className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5"
                        autoFocus
                      />
                      <button onClick={() => reject(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm">ทิ้ง</button>
                      <button onClick={() => setRejectingId(null)}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm">ยกเลิก</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {editingId === item.id ? (
                        <>
                          <button disabled={busyId === item.id} onClick={() => saveEdit(item.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50">
                            <Check size={14} /> บันทึก + อนุมัติ
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm">ยกเลิก</button>
                        </>
                      ) : (
                        <>
                          <button disabled={busyId === item.id} onClick={() => approve(item.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50">
                            <Check size={14} /> อนุมัติ
                          </button>
                          <button onClick={() => { setEditingId(item.id); setEditText(item.caption) }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm">
                            <Pencil size={14} /> แก้
                          </button>
                          <button onClick={() => setRejectingId(item.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-sm">
                            <X size={14} /> ทิ้ง
                          </button>
                          {/* ให้ AI เขียน/เขียนใหม่ — ร่างที่ยังไม่มีแคปชั่นจริงจะเน้นปุ่มนี้ */}
                          <button
                            disabled={generating.has(item.id)}
                            onClick={() => generate(item.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50 ${
                              item.status === "draft"
                                ? "bg-blue-600 text-white font-medium"
                                : "bg-gray-100 text-gray-600"}`}>
                            <Sparkles size={14} />
                            {generating.has(item.id)
                              ? "กำลังเขียน…"
                              : item.status === "draft" ? "ให้ AI เขียน" : "เขียนใหม่"}
                          </button>
                          {/* แปลงไปช่องอื่น — ขึ้นเมื่อมีแคปชั่นจริงแล้วเท่านั้น
                              ยังเป็น draft (ยังไม่มีแคปชั่น) แปลงไปก็ไม่มีอะไรให้แปลง */}
                          <button
                            disabled={varying.has(item.id) || item.status === "draft"}
                            onClick={() => makeVariants(item.id)}
                            title="เขียนใหม่สำหรับ Instagram · TikTok · สคริปต์วิดีโอ จากเรื่องเดียวกัน"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm disabled:opacity-50">
                            <Send size={14} />
                            {varying.has(item.id)
                              ? "กำลังแปลง…"
                              : item.variants ? "แปลงใหม่" : "สร้างช่องอื่น"}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  </div>
                 </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── สถานี 3 · รอโพสต์ ──
          ปลายทางของวงจร: อนุมัติแล้ว → โพสต์ขึ้นเพจ (หรือก๊อปไปโพสต์เอง) → บันทึก
          ต้องมีขั้นนี้ ไม่งั้น posted_at ว่างตลอด แล้วกราฟ "โพสต์ช่วยไหม" ในหน้าตัวเลข
          ก็ไม่มีข้อมูลจะคำนวณ · Telegram ก็จะส่งซ้ำเรื่อย ๆ เพราะไม่รู้ว่าโพสต์ไปแล้ว */}
      {view === "ready" && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <Send size={16} className="text-emerald-600" />
            รอโพสต์
            {(ready.items || []).length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-xs">
                {ready.items.length}
              </span>
            )}
          </h2>

          {/* ── สถานะการต่อเพจ ──
              ⚠️ ต้องอยู่ "นอก" เงื่อนไขว่ามีของรอโพสต์ไหม
              ตอนแรกวางไว้ข้างในกล่องรายการ ผลคือวันที่ยังไม่มีของอนุมัติ (คิวว่าง)
              จะไม่เห็นสถานะเลย → ตั้งค่า Facebook เสร็จแล้วก็เช็กไม่ได้ว่าติดไหม
              ต้องรอมีของก่อนถึงจะรู้ ซึ่งกลับหัวกลับหาง */}
          {fb?.connected ? (
            <p className="text-xs text-gray-400 mb-2">
              ต่อกับเพจ{" "}
              <a href={fb.page?.link} target="_blank" rel="noreferrer"
                className="text-emerald-600 font-medium hover:underline">{fb.page?.name}</a>
              {" "}แล้ว
              {fb.page?.followers != null && ` · ผู้ติดตาม ${baht(fb.page.followers)}`}
              {" "}· กด “โพสต์ขึ้นเพจ” ยิงขึ้นได้เลย หรือก๊อปไปโพสต์เองแล้วกด “โพสต์แล้ว”
            </p>
          ) : (
            <div className="mb-2 flex items-start gap-1.5 bg-gray-50 border border-gray-200
                            text-gray-500 rounded-lg px-2.5 py-1.5 text-xs">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                ยังโพสต์อัตโนมัติไม่ได้ — {fb?.error || "ยังไม่ได้ตั้งค่า Facebook"} ·
                ระหว่างนี้ก๊อปไปโพสต์เองแล้วกด “โพสต์แล้ว” ได้ตามเดิม
                {" "}(วิธีตั้งค่าอยู่ที่ <code>wiki/marketing/auto-posting-level3-setup.md</code>)
              </span>
            </div>
          )}

          {(ready.items || []).length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <Send className="mx-auto text-gray-300 mb-2" size={28} />
              <p className="text-gray-700 font-medium">ไม่มีอะไรรอโพสต์</p>
              <p className="text-sm text-gray-400 mt-1">
                อนุมัติคอนเทนต์จากหน้า{" "}
                <button onClick={() => setView("approve")} className="text-blue-600 hover:underline">
                  รออนุมัติ
                </button>{" "}
                แล้วจะมาโผล่ที่นี่
              </p>
            </div>
          ) : (
            <>

            {posted && (
              <div className="mb-2 flex items-center gap-2 bg-emerald-50 border border-emerald-200
                              text-emerald-800 rounded-lg px-2.5 py-1.5 text-xs">
                <Check size={13} className="shrink-0" />
                <span>โพสต์ขึ้นเพจแล้ว</span>
                <a href={posted} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  เปิดดูโพสต์ →
                </a>
                <button onClick={() => setPosted(null)} className="ml-auto text-emerald-600">ปิด</button>
              </div>
            )}

            {/* ── ผลทดสอบแบบไม่เผยแพร่ ──
                โชว์รูปที่อยู่บนเซิร์ฟเวอร์ Facebook แล้วจริง ๆ (ไม่ใช่รูปต้นทางจาก Supabase)
                เพราะสิ่งที่ต้องพิสูจน์คือ "รูปส่งถึง Facebook ครบไหม" ถ้าโชว์รูปต้นทาง
                ต่อให้ส่งไม่ถึงก็ยังเห็นรูปสวย ๆ อยู่ดี = ทดสอบแล้วไม่ได้อะไร */}
            {dryRun && (
              <div className="mb-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-blue-800 mb-2">
                  <Check size={14} className="shrink-0" />
                  <span className="font-semibold">ทดสอบผ่าน · คอนเทนต์ #{dryRun.id}</span>
                  <button onClick={() => setDryRun(null)} className="ml-auto text-blue-600">ปิด</button>
                </div>
                <p className="text-[11px] text-blue-700 mb-2">{dryRun.note}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  {dryRun.photoUrl && (
                    <img src={dryRun.photoUrl} alt=""
                      onClick={() => setPreview(dryRun.photoUrl)}
                      title="รูปนี้ดึงมาจากเซิร์ฟเวอร์ Facebook แล้ว · กดดูเต็มจอ"
                      className="w-full sm:w-40 rounded-lg border border-blue-200 shrink-0 cursor-zoom-in" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] text-blue-500 mb-1">แคปชั่นที่จะโพสต์จริง</p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{dryRun.caption}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {ready.items.map(item => {
                const holes = holesIn(item.caption)
                return (
                  <article key={item.id}
                    className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
                    {item.media_url && (
                      <img src={item.media_url} alt=""
                        onClick={() => setPreview(item.media_url)}
                        title="กดเพื่อดูเต็มจอ"
                        className="w-full sm:w-24 h-24 object-cover rounded-xl border border-gray-100
                                   shrink-0 cursor-zoom-in" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 text-xs">
                        <span className="px-2 py-0.5 rounded bg-gray-900 text-white font-mono font-medium select-all">
                          #{item.id}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {PLATFORM_LABEL[item.platform] || item.platform}
                        </span>
                        {item.source_sku && <span className="text-gray-400">{item.source_sku}</span>}
                      </div>

                      {holes.length > 0 && (
                        <div className="mb-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200
                                        text-amber-800 rounded-lg px-2.5 py-1.5 text-xs">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                          <span>ยังมีช่องว่างต้องเติมก่อนโพสต์: <b>{holes.join(", ")}</b></span>
                        </div>
                      )}

                      {skuAsk[item.id]?.status === "ambiguous" && (
                        <div className="mb-2 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-2 text-xs">
                          <div className="flex items-start gap-1.5 text-indigo-900 mb-1.5">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            <span>แคปชั่นเอ่ยถึงหลายชุด — เลือกว่าจะใช้ซองไหนทำภาพ</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {skuAsk[item.id].options.map(o => (
                              <button key={o.sku_id} disabled={busyId === item.id}
                                onClick={() => pickSku(item.id, o.sku_id)}
                                className="px-2.5 py-1 rounded-lg bg-white border border-indigo-300
                                           text-indigo-800 font-medium hover:bg-indigo-600
                                           hover:text-white disabled:opacity-50">
                                {o.sku_id}
                              </button>
                            ))}
                            <button disabled={busyId === item.id}
                              onClick={() => setSkuAsk(m => ({ ...m, [item.id]: null }))}
                              className="px-2.5 py-1 rounded-lg text-indigo-600 hover:bg-indigo-100
                                         disabled:opacity-50">
                              ไม่ใช้ซองไหนเลย
                            </button>
                          </div>
                        </div>
                      )}

                      {skuAsk[item.id]?.applied && (
                        <div className="mb-2 flex items-start gap-1.5 bg-emerald-50 border border-emerald-200
                                        text-emerald-800 rounded-lg px-2.5 py-1.5 text-xs">
                          <Check size={13} className="mt-0.5 shrink-0" />
                          <span>ผูกซอง <b>{skuAsk[item.id].applied}</b> ให้จากชื่อชุดในแคปชั่นแล้ว</span>
                        </div>
                      )}

                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.caption}</p>

                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          disabled={busyId === item.id}
                          onClick={() => navigator.clipboard?.writeText(item.caption || "")}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm">
                          <Copy size={14} /> ก๊อปแคปชั่น
                        </button>
                        {/* ปุ่มหลักตอนต่อเพจได้ — ปิดไว้ถ้าแคปชั่นยังมีช่องว่างค้าง
                            route กันซ้ำอีกชั้นอยู่แล้ว แต่ปุ่มที่กดไม่ได้ตั้งแต่แรกชัดเจนกว่า */}
                        {fb?.connected && (
                          <>
                            <button
                              disabled={busyId === item.id || holes.length > 0}
                              onClick={() => publishNow(item)}
                              title={holes.length ? "เติมช่องว่างให้ครบก่อน" : "ยิงขึ้นเพจทันที"}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600
                                         text-white text-sm font-medium disabled:opacity-40">
                              <Send size={14} />
                              {busyId === item.id ? "กำลังโพสต์…" : "โพสต์ขึ้นเพจ"}
                            </button>
                            {/* โหมดทดสอบใช้ได้เฉพาะโพสต์ที่มีรูป — /feed ไม่มีวิธีอัปแบบไม่เผยแพร่
                                ซ่อนปุ่มไปเลยดีกว่าโชว์แล้วกดไม่ได้ */}
                            {item.media_url && (
                              <button
                                disabled={busyId === item.id}
                                onClick={() => testPost(item)}
                                title="อัปขึ้น Facebook จริงแต่ไม่เผยแพร่ — ไม่มีใครเห็นบนเพจ"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                           border border-blue-200 text-blue-600 text-sm
                                           disabled:opacity-40">
                                <Maximize2 size={14} />
                                {busyId === item.id ? "กำลังทดสอบ…" : "ทดสอบ (ไม่ขึ้นเพจ)"}
                              </button>
                            )}
                          </>
                        )}
                        <button
                          disabled={busyId === item.id}
                          onClick={() => markPosted(item.id)}
                          title="โพสต์เองแล้ว — แค่บันทึกว่าโพสต์ไปแล้ว"
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                                      disabled:opacity-50 ${fb?.connected
                                        ? "bg-gray-100 text-gray-600"
                                        : "bg-emerald-600 text-white"}`}>
                          <Check size={14} /> โพสต์แล้ว
                        </button>
                        <button
                          disabled={busyId === item.id}
                          onClick={() => unapprove(item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-sm">
                          <Pencil size={14} /> เอากลับไปแก้
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            </>
          )}
        </section>
      )}

      {/* ── ปฏิทินโพสต์ ──
          โหลดข้อมูลเองแยกจาก loadAll เพราะข้อมูลผูกกับ "เดือนที่กำลังดู"
          ถ้าเอาไปรวมใน loadAll จะต้องยกสถานะเดือนขึ้นมาไว้ตรงนี้โดยไม่จำเป็น */}
      {view === "calendar" && <PostCalendar api={api} onPreview={setPreview} />}

      {/* ── ตอบคอมเมนต์ · ยังไม่เปิด (เฟส 3) ── */}
      {view === "replies" && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <MessageSquare size={16} className="text-gray-400" /> ตอบคอมเมนต์
            <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 text-xs">เฟส 3</span>
          </h2>
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-5 text-sm text-gray-500">
            <p className="mb-2">
              กล่องคอมเมนต์/แชทที่ AI ตอบเองไม่ได้ จะมาโผล่ตรงนี้
            </p>
            <p className="text-xs text-gray-400">
              ยังทำไม่ได้เพราะต้องขอ permission อ่าน/ตอบคอมเมนต์จาก Meta ก่อน
            </p>
          </div>
        </section>
      )}

      {/* ── สายพานการผลิต ── */}
      {view === "system" && (
        <section className="max-w-2xl">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Clock size={16} className="text-blue-600" /> สายพานการผลิต
              {pipeline?.failing > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-xs">
                  {pipeline.failing} ล้ม
                </span>
              )}
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
              {pipeline?.warning && (
                <p className="p-3 text-xs text-amber-700 bg-amber-50">{pipeline.warning}</p>
              )}
              {(pipeline?.jobs || []).map(j => {
                const s = PIPE_STATE[j.state] || PIPE_STATE.unknown
                return (
                  <div key={j.key} className="flex items-center gap-2.5 px-3 py-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                    <span className="flex-1 text-sm text-gray-700 truncate">{j.label}</span>
                    <span className="text-xs text-gray-400 shrink-0">{thaiAgo(j.started_at)}</span>
                    {j.state === "failure" && j.url && (
                      <a href={j.url} target="_blank" rel="noreferrer"
                        className={`text-xs shrink-0 underline ${s.cls}`}>ดู log</a>
                    )}
                  </div>
                )
              })}
              {!pipeline && <p className="p-3 text-sm text-gray-400">กำลังโหลด…</p>}
            </div>
        </section>
      )}

      {/* ── ตัวเลข ── */}
      {view === "metrics" && (
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <TrendingUp size={16} className="text-blue-600" /> ตัวเลข
          </h2>
          <div className="flex gap-1">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${
                  days === d ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
                {d} วัน
              </button>
            ))}
          </div>
        </div>

        {metrics ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
              <KpiCard icon={Wallet} color="green" label="รายรับ"
                value={`${baht(metrics.kpi.revenue)} ฿`}
                sub={metrics.kpi.revenue_delta_pct === null ? `${metrics.range.days} วัน`
                  : `${metrics.kpi.revenue_delta_pct >= 0 ? "▲" : "▼"} ${Math.abs(metrics.kpi.revenue_delta_pct)}% เทียบช่วงก่อน`} />
              <KpiCard icon={Package} color="blue" label="ซองที่ขายได้"
                value={baht(metrics.kpi.packs)} sub={`${metrics.range.days} วัน`} />
              <KpiCard icon={Receipt} color="purple" label="ธุรกรรม"
                value={baht(metrics.kpi.transactions)} sub="นับจาก transaction_id" />
              <KpiCard icon={TrendingUp} color="amber" label="เฉลี่ยต่อวัน"
                value={`${baht(metrics.kpi.revenue_per_day)} ฿`} sub="ทุกตู้รวมกัน" />
              <KpiCard icon={Trophy} color="orange" label="ตู้ที่ขายดีสุด"
                value={metrics.kpi.top_machine ? `${baht(metrics.kpi.top_machine.revenue)} ฿` : "—"}
                sub={metrics.kpi.top_machine?.name || "ไม่มีข้อมูล"} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-700 mb-1">ยอดขายรายวัน + วันที่โพสต์</p>
                <p className="text-xs text-gray-400 mb-3">
                  จุดฟ้าคือวันที่มีโพสต์ออกไป — ดูว่ายอดขยับตามไหม
                </p>
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={metrics.daily} margin={{ top: 12, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                      <Tooltip
                        formatter={(v, n) => n === "revenue" ? [`${baht(v)} ฿`, "รายรับ"] : [v, n]}
                        labelFormatter={l => `วันที่ ${l}`} />
                      <Bar dataKey="revenue" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} dot={false} />
                      {metrics.daily.filter(d => d.posts > 0).map(d => (
                        <ReferenceDot key={d.date} x={d.label} y={d.revenue}
                          r={5} fill="#06b6d4" stroke="#fff" strokeWidth={2} />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">โพสต์ช่วยไหม</p>
                  {metrics.post_lift.days_with_post === 0 ? (
                    <p className="text-sm text-gray-400">
                      ยังไม่มีโพสต์ที่บันทึกไว้ในช่วงนี้ — อนุมัติแล้วกดว่าโพสต์แล้วถึงจะเริ่มนับ
                    </p>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs text-gray-500 w-24">วันที่มีโพสต์</span>
                        <span className="text-lg font-bold text-gray-800">
                          {baht(metrics.post_lift.avg_with_post)} ฿
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-xs text-gray-500 w-24">วันที่ไม่มี</span>
                        <span className="text-lg font-bold text-gray-400">
                          {baht(metrics.post_lift.avg_without_post)} ฿
                        </span>
                      </div>
                      <p className={`text-xs rounded-lg px-2.5 py-1.5 ${
                        metrics.post_lift.reliable ? "text-gray-500 bg-gray-50"
                                                   : "text-amber-700 bg-amber-50"}`}>
                        {metrics.post_lift.reliable
                          ? metrics.post_lift.caveat
                          : `ข้อมูลยังน้อยเกินจะสรุป (${metrics.post_lift.days_with_post} วันที่โพสต์) — ${metrics.post_lift.caveat}`}
                      </p>
                    </>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-500 mb-1">ROAS · กำไรสุทธิ</p>
                  <p className="text-xs text-gray-400">{metrics.pending_features.ad_spend}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-4 mt-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">ยอดขายต่อสาขา</p>
              <div className="space-y-1.5">
                {metrics.per_machine.slice(0, 8).map(m => {
                  const max = metrics.per_machine[0]?.revenue || 1
                  return (
                    <div key={m.machine_id} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-48 truncate shrink-0">{m.name}</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                        <div className="h-full bg-blue-400 rounded"
                          style={{ width: `${(m.revenue / max) * 100}%` }} />
                      </div>
                      <span className="text-xs text-gray-700 font-medium w-20 text-right shrink-0">
                        {baht(m.revenue)} ฿
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
            กำลังโหลดตัวเลข…
          </div>
        )}
      </section>
      )}
    </Shell>
  )
}

// ── แถบเมนู ───────────────────────────────────────────────────────────
// จอใหญ่ = คอลัมน์ซ้ายติดหนึบ · จอเล็ก = แถบเลื่อนแนวนอนด้านบน
// ตัวเลขคงค้างติดอยู่ทุกเมนู เพื่อไม่ให้ "แยกหน้า" กลายเป็น "ลืมงานที่อยู่หน้าอื่น"
// export ไว้เพื่อให้ทำหน้าตรวจชั่วคราวมาถ่ายภาพดูได้โดยไม่ต้องล็อกอิน
// (เจอบั๊ก 2 ตัวจากวิธีนี้: ตัวหนังสือ active อ่านไม่ออกบนธีมมืด + เมนูไม่ติดหนึบจริง)
export function NavRail({ view, setView, counts, onNew }) {
  return (
    <nav className="lg:sticky lg:top-[69px]">
      <button onClick={onNew}
        className="hidden lg:flex w-full items-center justify-center gap-1.5 mb-4 px-3 py-2.5
                   rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
        <Plus size={16} /> เพิ่มไอเดียเอง
      </button>

      <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible
                      -mx-4 px-4 lg:mx-0 lg:px-0 pb-1 lg:pb-0">
        {NAV.map(g => (
          <div key={g.group} className="flex lg:flex-col gap-1 shrink-0 lg:mb-3">
            <p className="hidden lg:block px-2 mb-0.5 text-[11px] font-semibold
                          text-gray-400 tracking-wide">{g.group}</p>
            {g.items.map(it => {
              const Icon = it.icon
              const n = counts[it.key] || 0
              const on = view === it.key
              // ⚠️ ห้ามใช้ text-gray-900 / bg-white/70 ตรงนี้ — ชั้นแปลงธีมมืดใน globals.css
              // แปลงเฉพาะ .text-gray-300..800 กับ .bg-white เป๊ะ ๆ · คลาสที่ไม่อยู่ในลิสต์
              // จะค้างเป็นสีจริงแล้วอ่านไม่ออกบนพื้นกรมท่า (เจอตอนถ่ายภาพมาตรวจ)
              return (
                <button key={it.key} onClick={() => setView(it.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm whitespace-nowrap
                              shrink-0 transition ${on
                                ? "bg-white border border-gray-200 text-gray-800 font-semibold shadow-sm"
                                : "text-gray-500 hover:bg-gray-100 border border-transparent"}`}>
                  <Icon size={16} className={on ? "text-blue-600" : "text-gray-400"} />
                  {it.label}
                  {n > 0 && (
                    <span className={`lg:ml-auto px-1.5 min-w-[20px] text-center rounded-full
                                      text-[11px] font-medium text-white ${it.tone || "bg-gray-400"}`}>
                      {n}
                    </span>
                  )}
                  {it.soon && (
                    <span className="lg:ml-auto px-1.5 rounded-full bg-gray-100 text-gray-400 text-[10px]">
                      {it.soon}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}

// ── ป้ายเครดิต OpenAI คงเหลือ ──
//
// ⚠️ ยอดคงเหลืออ่านจาก API ไม่ได้ — OpenAI เปิดให้เฉพาะ session key จากเบราว์เซอร์
//    (ทดสอบยิงจริง 28 ส.ค. 2026 · ดู app/api/marketing/ai-credit/route.js)
//    เลขที่เห็นคือ "ยอดที่เจ้าของกรอกไว้ − ค่าใช้จ่ายจาก costs API ตั้งแต่ตอนนั้น"
//    ถ้าเริ่มเพี้ยน กดเข้ามากรอกยอดจากหน้า OpenAI ใหม่ จุดตั้งต้นจะรีเซ็ตให้เอง
//
// ⚠️ ป้ายนี้ต้องกดได้เสมอ แม้ตอนที่ยังตั้งค่าไม่เสร็จ — เพราะทางแก้ทุกเคส
//    (ยังไม่มี admin key · ยังไม่ได้รัน migration · ยังไม่ได้กรอกยอด) อยู่ในกล่องนี้
//    ถ้าซ่อนป้ายตอนยังไม่พร้อม จะไม่มีทางรู้เลยว่าต้องไปทำอะไรต่อ
function CreditBadge({ credit, onSave }) {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)      // { text, ok } — ok=true คือข้อความยืนยัน ไม่ใช่ error

  const usd = (n) => `$${Number(n ?? 0).toFixed(2)}`
  const ok = credit?.state === "ok"
  const left = ok ? Number(credit.remaining_usd) : null

  // เกณฑ์สีเป็นค่าคร่าว ๆ ให้เห็นก่อนหมดจริง ไม่ได้ผูกกับราคาต่อภาพ
  // เพราะยังไม่ได้เก็บราคาต่อภาพไว้เทียบ (usage ที่ได้กลับมาทุกครั้งถูกทิ้ง ไม่ได้บันทึก)
  const tone = !ok ? "bg-gray-100 text-gray-500 border-gray-200"
    : left < 5 ? "bg-red-50 text-red-700 border-red-200"
    : left < 15 ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200"

  // ⚠️ ห้ามปิดกล่องเองหลังบันทึกสำเร็จ — เกิดจริง 28 ส.ค. 2026:
  //    บันทึกเข้า DB สำเร็จ แต่ฝั่งเซิร์ฟเวอร์ยังไม่มี OPENAI_ADMIN_KEY ป้ายจึงหน้าตาเดิมทุกอย่าง
  //    กล่องปิดไปเงียบ ๆ = เจ้าของไม่มีทางรู้ว่าสำเร็จ เลยกดซ้ำจนได้สองแถว
  //    บันทึกแล้วต้องยืนยันเสมอ และถ้ายังคำนวณคงเหลือไม่ได้ ต้องคาไว้ให้เห็นว่าติดอะไร
  async function save() {
    const n = Number(val)
    if (!Number.isFinite(n) || n < 0) {
      setMsg({ text: "กรอกเป็นตัวเลขดอลลาร์ เช่น 42.15" }); return
    }
    setSaving(true); setMsg(null)
    try {
      const after = await onSave(n)
      setVal("")
      setMsg(after?.state === "ok"
        ? { text: "✓ บันทึกแล้ว", ok: true }
        : { text: "✓ บันทึกยอดแล้ว — แต่ยังคำนวณคงเหลือไม่ได้ (ดูสาเหตุด้านบน)", ok: true })
    } catch (e) { setMsg({ text: e.message || String(e) }) } finally { setSaving(false) }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} title="เครดิต OpenAI คงเหลือ"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium ${tone}`}>
        <Wallet size={14} />
        {/* credit === null คือยังโหลดไม่เสร็จ — แยกจาก "ตั้งค่าไม่ครบ" ไม่งั้นตอนเปิดหน้า
            จะขึ้นว่ายังไม่ได้ตั้งค่าทุกครั้งแวบนึง ซึ่งอ่านแล้วนึกว่าค่าหาย */}
        {ok ? usd(left)
          : <span className="text-xs">{credit === null ? "…" : "ตั้งค่าเครดิต"}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg p-3 z-20 text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-800">เครดิต OpenAI</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>

          {ok && (
            <dl className="text-xs text-gray-600 space-y-1 mb-3">
              <div className="flex justify-between">
                <dt>ยอดที่บันทึกไว้</dt><dd className="font-mono">{usd(credit.balance_usd)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>ใช้ไปตั้งแต่นั้น</dt><dd className="font-mono">−{usd(credit.spent_usd)}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-1 font-semibold text-gray-800">
                <dt>คงเหลือ</dt><dd className="font-mono">{usd(left)}</dd>
              </div>
              <p className="text-[11px] text-gray-400 pt-1 leading-relaxed">
                บันทึกยอดไว้เมื่อ {new Date(credit.reading.read_at).toLocaleString("th-TH", {
                  dateStyle: "medium", timeStyle: "short",
                })}
                {" · "}เป็นตัวเลขประมาณ เพราะ OpenAI คิดค่าใช้จ่ายเป็นรายวัน
              </p>
            </dl>
          )}

          {!ok && (
            <div className="text-xs text-gray-600 mb-3 leading-relaxed">
              <p className="font-medium text-gray-700">{credit?.error || "ยังอ่านยอดไม่ได้"}</p>
              {credit?.hint && <p className="mt-1 text-gray-500">{credit.hint}</p>}
              {credit?.state === "no_reading" && (
                <p className="mt-1 text-gray-500">
                  key ใช้ได้แล้ว · 30 วันที่ผ่านมาใช้ไป {usd(credit.spent_usd)}
                </p>
              )}
            </div>
          )}

          {/* กรอกได้เสมอ ไม่ว่าสถานะไหน — เป็นทางแก้ของทั้ง no_reading และเลขเริ่มเพี้ยน */}
          <label className="block text-xs text-gray-500 mb-1">
            ยอดคงเหลือที่เห็นบนหน้า OpenAI ตอนนี้ (USD)
          </label>
          <div className="flex gap-1.5">
            <input value={val} onChange={e => setVal(e.target.value)} inputMode="decimal"
              placeholder="เช่น 42.15" disabled={saving}
              onKeyDown={e => e.key === "Enter" && save()}
              className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-sm" />
            <button onClick={save} disabled={saving || !val}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
              {saving ? "…" : "บันทึก"}
            </button>
          </div>
          {msg && (
            <p className={`mt-1.5 text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>
              {msg.text}
            </p>
          )}
          <a href="https://platform.openai.com/settings/organization/billing/overview"
            target="_blank" rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            เปิดหน้า Billing ของ OpenAI <ExternalLink size={11} />
          </a>
        </div>
      )}
    </div>
  )
}

export function Shell({ children, nav, onRefresh, loading, credit, onSaveCredit }) {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Megaphone size={20} className="text-blue-600" />
          <div className="flex-1">
            <h1 className="font-bold text-gray-800 leading-tight">Marketing OS</h1>
            <p className="text-xs text-gray-400">DivisionX Card · การตลาดออนไลน์</p>
          </div>
          <a href="/" className="text-xs text-gray-500 hover:text-gray-700">← กลับหน้าหลัก</a>
          {credit !== undefined && <CreditBadge credit={credit} onSave={onSaveCredit} />}
          {onRefresh && (
            <button onClick={onRefresh} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm disabled:opacity-50">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> รีเฟรช
            </button>
          )}
        </div>
      </header>
      {/* ⚠️ อย่าใส่ items-start ตรงนี้ — คอลัมน์เมนูจะสูงเท่าเนื้อเมนูพอดี
          แล้ว position:sticky จะไม่มีที่ให้เลื่อน (เลื่อนหน้าแล้วเมนูหลุดหายขึ้นไปเลย)
          ปล่อยให้ stretch เต็มความสูงแถว เมนูถึงจะค้างอยู่กับที่จริง — วัดด้วย Playwright แล้ว */}
      <div className="max-w-7xl mx-auto px-4 py-5 lg:flex lg:gap-6">
        {nav && <div className="lg:w-52 lg:shrink-0 mb-4 lg:mb-0">{nav}</div>}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </main>
  )
}
