"use client"
// Marketing OS — หน้า /marketing (เฟส 1+2)
//
// ธีสิสการออกแบบ: หน้านี้เป็น "กล่องรออนุมัติ" ไม่ใช่ dashboard
// เปิดมาต้องเห็นทันทีว่าวันนี้มีอะไรรอกด แล้วเคลียร์ให้หมดในไม่กี่นาที
// ตัวเลขอยู่ล่างสุด อ่านสัปดาห์ละครั้ง
//
// เฟส 1 = โซน A (อนุมัติคอนเทนต์) · เฟส 2 = โซน C (สายพาน) + D (ตัวเลข)
// โซน B (ตอบคอมเมนต์) เป็นเฟส 3 — ยังขึ้นเป็นการ์ดอธิบายว่าติดอะไรอยู่
import { useState, useEffect, useCallback } from "react"
import {
  Megaphone, RefreshCw, Check, X, Pencil, Clock, AlertTriangle,
  Wallet, Package, Receipt, TrendingUp, Trophy, MessageSquare, Lock,
  Lightbulb, Newspaper, Youtube, BarChart3, ExternalLink, Sparkles, Music2, Plus,
  Image as ImageIcon, Send, Copy,
} from "lucide-react"
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceDot,
} from "recharts"
import { supabase } from "../lib/supabase"
import KpiCard from "./shared/KpiCard"

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

function thaiAgo(iso) {
  if (!iso) return "—"
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "เมื่อกี้"
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`
  return `${Math.floor(hrs / 24)} วันที่แล้ว`
}

export default function MarketingOS() {
  const [token, setToken] = useState(null)
  const [authState, setAuthState] = useState("checking")   // checking | ok | anon | forbidden
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")

  const [ideas, setIdeas] = useState({ items: [], counts: {}, by_source: {} })
  const [content, setContent] = useState({ items: [], counts: {} })
  // อนุมัติแล้วแต่ยังไม่ได้โพสต์ — แยก state จาก content เพราะเป็นคนละคิว คนละปุ่ม
  const [ready, setReady] = useState({ items: [] })
  const [pipeline, setPipeline] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [days, setDays] = useState(7)
  const [dismissingId, setDismissingId] = useState(null)
  const [dismissText, setDismissText] = useState("")
  const [pasteUrl, setPasteUrl] = useState("")
  const [pasting, setPasting] = useState(false)
  const [perSource, setPerSource] = useState(3)   // เด็ดสุดกี่ชิ้นต่อช่องทาง
  const [generating, setGenerating] = useState(new Set())   // id ที่ AI กำลังเขียนแคปชั่นให้

  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState("")
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectText, setRejectText] = useState("")
  const [busyId, setBusyId] = useState(null)

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
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
    return json
  }, [])

  const loadAll = useCallback(async () => {
    if (!token) return
    setLoading(true); setErr("")
    const [i, c, p, m, a] = await Promise.allSettled([
      api(`ideas?status=new&per_source=${perSource}`),
      api("content?status=draft,pending"),
      api("pipeline"),
      api(`metrics?days=${days}`),
      api("content?status=approved"),
    ])
    if (i.status === "fulfilled") setIdeas(i.value)
    if (c.status === "fulfilled") setContent(c.value)
    if (p.status === "fulfilled") setPipeline(p.value)
    if (m.status === "fulfilled") setMetrics(m.value)
    // กันของที่โพสต์ไปแล้วหลุดเข้ามา (status ค้างเป็น approved แต่มี posted_at)
    if (a.status === "fulfilled") setReady({ items: (a.value.items || []).filter(x => !x.posted_at) })
    const failed = [i, c, p, m, a].filter(r => r.status === "rejected")
    if (failed.length) setErr(failed.map(f => f.reason.message).join(" · "))
    setLoading(false)
  }, [api, token, days, perSource])

  useEffect(() => { if (authState === "ok") loadAll() }, [authState, loadAll])

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
    } catch (e) { setErr(e.message) } finally { setBusyId(null) }
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
        // route ไม่ได้ embed sku กลับมา — คงของเดิมไว้ ไม่งั้นปุ่ม "ใช้รูป SKU" หายหลังกดเขียน
        items: (c.items || []).map(i => (i.id === contentId ? { ...updated, sku: i.sku } : i)),
      }))
    } catch (e) {
      setErr(e.message)   // ร่างยังอยู่ในคิว กดเขียนใหม่ได้
    } finally {
      setGenerating(s => { const n = new Set(s); n.delete(contentId); return n })
    }
  }, [api])

  // ── ไอเดีย: กดเลือก → สร้างร่าง แล้วให้ AI เขียนแคปชั่นต่อทันที ──
  async function ideaAction(id, action, reason) {
    setBusyId(`idea-${id}`)
    try {
      const res = await api("ideas", {
        method: "PATCH",
        body: JSON.stringify({ id, action, reason }),
      })
      setIdeas(s => ({ ...s, items: s.items.filter(x => x.id !== id) }))
      if (action === "pick" && res.content) {
        // เอาร่างขึ้นกล่องอนุมัติก่อน แล้วค่อยให้ AI เขียนแคปชั่นทับ
        // (ไม่รอ generate ให้เสร็จ ไม่งั้นปุ่มค้างเป็นนาที)
        setContent(c => ({ ...c, items: [res.content, ...(c.items || [])] }))
        generate(res.content.id)
      }
    } catch (e) { setErr(e.message) } finally { setBusyId(null) }
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
    } catch (e) { setErr(e.message) } finally { setPasting(false) }
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
    } catch (e) { setErr(e.message) } finally { setBusyId(null) }
  }
  // เอากลับมาแก้ — เผลออนุมัติ หรือแคปชั่นยังมีช่องว่างค้าง
  async function unapprove(id) {
    setBusyId(id)
    try {
      const back = await api("content", { method: "PATCH", body: JSON.stringify({ id, status: "pending" }) })
      setReady(s => ({ items: (s.items || []).filter(i => i.id !== id) }))
      setContent(c => ({ ...c, items: [back, ...(c.items || [])] }))
    } catch (e) { setErr(e.message) } finally { setBusyId(null) }
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

  return (
    <Shell onRefresh={loadAll} loading={loading}>
      {err && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{err}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 space-y-5">
        {/* ── สถานี 1 · ไอเดียวันนี้ ──
            AI ไปหาข่าว/เทรนด์ + อ่านข้อมูลขายของเราเอง มาวางบนโต๊ะ คนแค่สแกนแล้วเลือก */}
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
                        {idea.angle && (
                          <p className="text-xs text-gray-600 mt-1">
                            <span className="text-gray-400">มุมที่จะเล่า:</span> {idea.angle}
                          </p>
                        )}
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
                              onClick={() => ideaAction(idea.id, "pick")}
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

        {/* ── สถานี 2 · กล่องอนุมัติ ── */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <Megaphone size={16} className="text-blue-600" />
            รออนุมัติ
            <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs">{pending.length}</span>
          </h2>

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
                      รูปมาจาก SKU จริงใน Supabase Storage ไม่ใช่ AI สร้าง
                      (คนซื้อการ์ดอยากเห็นของจริง และ AI ไม่รู้ว่าการ์ดชุดนั้นหน้าตายังไง) */}
                  <div className="sm:w-36 shrink-0">
                    {item.media_url ? (
                      <div className="relative group">
                        <img src={item.media_url} alt=""
                          className="w-full sm:w-36 h-36 object-contain rounded-xl bg-black/20 border border-gray-200" />
                        <button
                          onClick={() => patch(item.id, { media_url: "" })}
                          title="เอารูปออก"
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="w-full sm:w-36 h-36 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 text-center px-2">
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
                        <button
                          onClick={() => {
                            const u = window.prompt("วางลิงก์รูป (https://...)")
                            if (u) patch(item.id, { media_url: u })
                          }}
                          className="text-[11px] text-gray-400 underline">
                          วางลิงก์เอง
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500 mb-2">
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
                    <p className="text-sm text-gray-800 whitespace-pre-wrap mb-2">{item.caption}</p>
                  )}

                  {/* บรรทัดนี้คือหัวใจ — บอกว่าทำไม AI ถึงเสนอชิ้นนี้ ตัดสินใจได้ใน 2 วินาที */}
                  {item.source_reason && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mb-2">
                      💡 จาก: {item.source_reason}
                    </p>
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

        {/* ── สถานี 3 · รอโพสต์ ──
            ปลายทางของวงจร: อนุมัติแล้ว → ก๊อปไปโพสต์ → กดยืนยัน
            ต้องมีขั้นนี้ ไม่งั้น posted_at ว่างตลอด แล้วกราฟ "โพสต์ช่วยไหม" ในโซน D
            ก็ไม่มีข้อมูลจะคำนวณ · Telegram ก็จะส่งซ้ำเรื่อย ๆ เพราะไม่รู้ว่าโพสต์ไปแล้ว */}
        {(ready.items || []).length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Send size={16} className="text-emerald-600" />
              รอโพสต์
              <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-xs">
                {ready.items.length}
              </span>
            </h2>
            <p className="text-xs text-gray-400 mb-2">
              ก๊อปไปโพสต์แล้วกด “โพสต์แล้ว” · ตัวที่ยังไม่กดจะถูกส่งซ้ำเข้า Telegram ทุกเช้า
            </p>

            <div className="space-y-3">
              {ready.items.map(item => {
                const holes = holesIn(item.caption)
                return (
                  <article key={item.id}
                    className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
                    {item.media_url && (
                      <img src={item.media_url} alt=""
                        className="w-full sm:w-24 h-24 object-cover rounded-xl border border-gray-100 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {PLATFORM_LABEL[item.platform] || item.platform}
                        </span>
                        <span className="text-gray-300">#{item.id}</span>
                        {item.source_sku && <span className="text-gray-400">{item.source_sku}</span>}
                      </div>

                      {holes.length > 0 && (
                        <div className="mb-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200
                                        text-amber-800 rounded-lg px-2.5 py-1.5 text-xs">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                          <span>ยังมีช่องว่างต้องเติมก่อนโพสต์: <b>{holes.join(", ")}</b></span>
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
                        <button
                          disabled={busyId === item.id}
                          onClick={() => markPosted(item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600
                                     text-white text-sm font-medium disabled:opacity-50">
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
          </section>
        )}
        </div>

        <div className="space-y-4">
          {/* ── โซน B · ยังไม่เปิด (เฟส 3) ── */}
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <MessageSquare size={16} className="text-gray-400" /> ตอบเอง
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

          {/* ── โซน C · สายพาน ── */}
          <section>
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
        </div>
      </div>

      {/* ── โซน D · ตัวเลข ── */}
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
    </Shell>
  )
}

function Shell({ children, onRefresh, loading }) {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Megaphone size={20} className="text-blue-600" />
          <div className="flex-1">
            <h1 className="font-bold text-gray-800 leading-tight">Marketing OS</h1>
            <p className="text-xs text-gray-400">DivisionX Card · การตลาดออนไลน์</p>
          </div>
          <a href="/" className="text-xs text-gray-500 hover:text-gray-700">← กลับหน้าหลัก</a>
          {onRefresh && (
            <button onClick={onRefresh} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm disabled:opacity-50">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> รีเฟรช
            </button>
          )}
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 py-5">{children}</div>
    </main>
  )
}
