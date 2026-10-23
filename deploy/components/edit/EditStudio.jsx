"use client"
// ห้องตัดต่อบนเว็บ (/video/editor) — 23 ต.ค. 2026
// เจ้าของ: "ทำหน้าโรงงานวิดีโอให้ใช้งานง่าย รองรับการตัดต่อได้ทุกรูปแบบ พร้อมรองรับการอัปโหลดไฟล์วิดีโอจากภายนอก"
//
// เชลล์ถือ: สิทธิ์ (admin/marketing) · คลังไฟล์ · ร่างงาน (Storage marketing/video-edits) · สั่งสร้างคลิป + ติดตามงาน
// ลูก: Library (ซ้าย) · Preview (กลาง) · Inspector (ขวา) · Tracks (ล่าง) — แก้เนื้อหาผ่าน reducer ใน timelineState เท่านั้น
// สัญญาข้อมูล: deploy/agents/video/TIMELINE.md · เรนเดอร์จริงบน GitHub Actions (agents/video/hf_timeline.py)
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { ArrowLeft, Save, Clapperboard, FolderOpen, Loader2, X, CheckCircle2, AlertTriangle, FilePlus2 } from "lucide-react"
import { supabase, getSkus, getProfile } from "../../lib/supabase"
import { LIMITS } from "../../lib/videoTimeline"
import { reducer, initState, totals, timelineForRender, fmt } from "./timelineState"
import Library from "./Library"
import Preview from "./Preview"
import Tracks from "./Tracks"
import Inspector from "./Inspector"
import s from "./edit.module.css"

const POLL_MS = 7000
const AUTOSAVE_MS = 4000
const fmtDate = (v) => {
  try { return new Date(v).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) } catch { return "" }
}
const STATUS_TH = { queued: "รอคิวเครื่องเรนเดอร์", rendering: "กำลังสร้างคลิป", done: "เสร็จแล้ว", failed: "ไม่สำเร็จ" }

// ชื่องานฝั่งเรนเดอร์ (a-z0-9-_ ≤ 64) — ไม่ซ้ำทุกครั้งที่กด เพราะ route กันงานค้างชื่อเดียวกัน
function projectName() {
  const d = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "")
  return `edit-${d}-${Math.random().toString(36).slice(2, 7)}`
}

export default function EditStudio({ editId }) {
  const [auth, setAuth] = useState("checking")          // checking | ok | anon | forbidden
  const [state, dispatch] = useReducer(reducer, null, () => initState(null))
  const [assets, setAssets] = useState([])
  const [skus, setSkus] = useState([])
  const [skuImg, setSkuImg] = useState({})
  const [playing, setPlaying] = useState(false)
  const [tab, setTab] = useState("files")
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [err, setErr] = useState(null)
  const [job, setJob] = useState(null)                  // { id, status, video_url, error }
  const [sending, setSending] = useState(false)
  const [drafts, setDrafts] = useState(null)            // null = ปิด · [] = รายการ
  const [loading, setLoading] = useState(!!editId)
  const stateRef = useRef(state)
  stateRef.current = state
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  // ── สิทธิ์: admin + marketing (ท่าเดียวกับ VideoStudio) ──
  useEffect(() => {
    let stop = false
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data?.session?.access_token ? data.session.user : null
      if (!user) { if (!stop) setAuth("anon"); return }
      let role
      try { role = (await getProfile(user.id))?.role } catch { role = undefined }
      if (!stop) setAuth(role && role !== "admin" && role !== "marketing" ? "forbidden" : "ok")
    }).catch(() => { if (!stop) setAuth("anon") })
    return () => { stop = true }
  }, [])

  // token สดทุกครั้ง — หน้านี้เปิดค้างรอเรนเดอร์ได้นานเกินอายุ token (~1 ชม.)
  const api = useCallback(async (path, opts = {}) => {
    const { data: ss } = await supabase.auth.getSession()
    const tok = ss?.session?.access_token
    if (!tok) { setAuth("anon"); throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่อีกครั้ง") }
    const res = await fetch(`/api/video/${path}`, {
      ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}`, ...(opts.headers || {}) },
    })
    if (res.status === 401) { setAuth("anon"); throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่อีกครั้ง") }
    if (res.status === 403) { setAuth("forbidden"); throw new Error("บัญชีนี้ไม่มีสิทธิ์ใช้ห้องตัดต่อ") }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const e = new Error(json.error || (res.status === 404 ? "ยังไม่มีปลายทางนี้บนเซิร์ฟเวอร์ (รอ deploy)" : `HTTP ${res.status}`))
      e.job = json.job_id ? { id: json.job_id, status: json.status } : null
      throw e
    }
    return json
  }, [])
  const onError = useCallback((e) => setErr(e?.message || String(e)), [])

  const reloadAssets = useCallback(() => {
    api("assets").then(j => { if (alive.current) setAssets(j.items || []) }).catch(onError)
  }, [api, onError])

  // ── โหลดของตั้งต้น: คลัง · ซอง · ร่าง (ถ้ามี ?id=) ──
  useEffect(() => {
    if (auth !== "ok") return
    reloadAssets()
    getSkus().then(rows => {
      if (!alive.current) return
      const list = (rows || []).filter(r => r.is_active !== false)
      setSkus(list)
      setSkuImg(Object.fromEntries(list.filter(r => r.image_url || r.image_url_box).map(r => [r.sku_id, r.image_url || r.image_url_box])))
    }).catch(() => {})
    if (editId) {
      api(`edits?id=${encodeURIComponent(editId)}`).then(doc => {
        if (!alive.current) return
        dispatch({ type: "LOAD", doc })
        setSavedAt(doc.updated_at)
        if (doc.job_id) api(`jobs?id=${doc.job_id}`).then(j => alive.current && setJob(j)).catch(() => {})
      }).catch(onError).finally(() => alive.current && setLoading(false))
    }
  }, [auth, editId, api, reloadAssets, onError])

  // ── บันทึกร่าง ──
  const save = useCallback(async (extra = {}) => {
    const st = stateRef.current
    setSaving(true)
    try {
      const r = await api("edits", { method: "PUT", body: JSON.stringify({ id: st.id, name: st.name, timeline: st.tl, ...extra }) })
      if (!alive.current) return r
      // ระหว่างรอบันทึกมีการแก้ต่อ → ยังถือว่าค้าง (SAVED ล้างธงเฉพาะเมื่อ tl เดิม)
      dispatch({ type: "SAVED", id: r.id, clean: stateRef.current.tl === st.tl && stateRef.current.name === st.name })
      setSavedAt(r.updated_at)
      if (!st.id && typeof window !== "undefined") {
        const u = new URL(window.location.href)
        u.searchParams.set("id", r.id)
        window.history.replaceState(null, "", u.toString())
      }
      return r
    } finally {
      if (alive.current) setSaving(false)
    }
  }, [api])

  // บันทึกอัตโนมัติ 4 วิหลังแก้ล่าสุด (เฉพาะงานที่มีของแล้ว — ไม่สร้างร่างเปล่าเกลื่อนคลัง)
  useEffect(() => {
    if (!state.dirty || saving || auth !== "ok") return
    if (!state.id && !state.tl.clips.length && !state.tl.overlays.length) return
    const h = setTimeout(() => { save().catch(onError) }, AUTOSAVE_MS)
    return () => clearTimeout(h)
  }, [state.dirty, state.tl, state.name, state.id, saving, auth, save, onError])

  // ปิดหน้าทั้งที่ยังไม่บันทึก → เตือน
  useEffect(() => {
    const h = (e) => { if (stateRef.current.dirty) { e.preventDefault(); e.returnValue = "" } }
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [])

  // ── ติดตามงานเรนเดอร์ ──
  useEffect(() => {
    if (!job?.id || job.status === "done" || job.status === "failed") return
    const h = setInterval(() => {
      api(`jobs?id=${job.id}`).then(j => alive.current && setJob(j)).catch(() => {})
    }, POLL_MS)
    return () => clearInterval(h)
  }, [job?.id, job?.status, api])

  // ── สร้างคลิป ──
  const render = async () => {
    setErr(null)
    const st = stateRef.current
    const tot = totals(st.tl)
    if (!st.tl.clips.length) return setErr("ใส่คลิปหรือรูปอย่างน้อย 1 ชิ้นก่อน")
    if (tot.total > LIMITS.seconds) return setErr(`คลิปยาว ${tot.total.toFixed(0)} วิ — ได้ไม่เกิน ${LIMITS.seconds} วิ`)
    const tl = { ...st.tl }
    if (tl.voice && !tl.voice.script.trim()) tl.voice = null          // เพิ่มช่องพากย์ไว้แต่ไม่ได้พิมพ์บท = ไม่มีเสียงพากย์
    setSending(true)
    setPlaying(false)
    try {
      const saved = await save()
      const r = await api("render", {
        method: "POST",
        body: JSON.stringify({ plan: { project: projectName(), engine: "timeline", timeline: timelineForRender(tl), edit_id: saved.id } }),
      })
      const id = r.job_id || r.id || r.job?.id
      setJob({ id, status: r.status || "queued" })
      await api("edits", { method: "PUT", body: JSON.stringify({ id: saved.id, name: stateRef.current.name, timeline: stateRef.current.tl, job_id: id }) }).catch(() => {})
    } catch (e) {
      setErr(e.message || String(e))
      if (e.job?.id) setJob(e.job)
    } finally {
      if (alive.current) setSending(false)
    }
  }

  const openDrafts = () => {
    setDrafts([])
    api("edits").then(j => alive.current && setDrafts(j.items || [])).catch((e) => { setDrafts(null); onError(e) })
  }
  const newEdit = () => {
    if (stateRef.current.dirty && !window.confirm("งานนี้ยังไม่ได้บันทึก — เริ่มงานใหม่เลยไหม")) return
    dispatch({ type: "LOAD", doc: null })
    setJob(null); setSavedAt(null)
    window.history.replaceState(null, "", "/video/editor")
  }

  // ── คีย์ลัด ──
  useEffect(() => {
    const h = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase()
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === "s") { e.preventDefault(); save().catch(onError); return }
      if (mod && k === "z") { e.preventDefault(); dispatch({ type: e.shiftKey ? "REDO" : "UNDO" }); return }
      if (mod && k === "y") { e.preventDefault(); dispatch({ type: "REDO" }); return }
      if (mod && k === "d") { e.preventDefault(); dispatch({ type: "DUPLICATE" }); return }
      if (mod) return
      if (e.key === " ") { e.preventDefault(); if (stateRef.current.tl.clips.length) setPlaying(p => !p); return }
      if (k === "s") { dispatch({ type: "SPLIT" }); return }
      if (k === "t") { dispatch({ type: "ADD_OVERLAY", overlay: { type: "text", text: "พิมพ์ข้อความ", style: "bold", size: 96, y: 0.25, anim: "pop" }, len: 3 }); return }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); dispatch({ type: "DELETE" }); return }
      if (e.key === "Escape") { dispatch({ type: "SELECT", sel: null }); return }
      if (e.key === "Home") { setPlaying(false); dispatch({ type: "SEEK", t: 0 }); return }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault()
        const d = (e.shiftKey ? 1 : 0.1) * (e.key === "ArrowLeft" ? -1 : 1)
        dispatch({ type: "SEEK", t: Math.min(totals(stateRef.current.tl).total, stateRef.current.t + d) })
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [save, onError])

  const onSeek = useCallback((t) => { setPlaying(false); dispatch({ type: "SEEK", t }) }, [])
  const onTime = useCallback((t) => dispatch({ type: "SEEK", t }), [])
  const onSelect = useCallback((sel) => dispatch({ type: "SELECT", sel }), [])
  const onOverlayMove = useCallback((id, patch) => dispatch({ type: "UPDATE_OVERLAY", id, patch }), [])
  const onWant = useCallback((t) => setTab(t), [])

  if (auth === "checking" || loading) return <div className={s.center}>กำลังเปิดห้องตัดต่อ…</div>
  if (auth === "anon") return <div className={s.center}><div>ต้องเข้าสู่ระบบก่อน<br /><a href="/" style={{ color: "#3ddcff" }}>ไปหน้าเข้าสู่ระบบ</a></div></div>
  if (auth === "forbidden") return <div className={s.center}>ห้องตัดต่อใช้ได้เฉพาะแอดมินและทีมการตลาด</div>

  const tot = totals(state.tl)
  const busy = job && (job.status === "queued" || job.status === "rendering")

  return (
    <div className={s.room}>
      <div className={s.top}>
        <a className={s.back} href="/video"><ArrowLeft size={15} /> โรงงานวิดีโอ</a>
        <input className={s.nameInput} value={state.name} maxLength={80} aria-label="ชื่องาน"
               onChange={(e) => dispatch({ type: "RENAME", name: e.target.value })} />
        <span className={`${s.saveState} ${state.dirty ? s.dirty : ""}`}>
          {saving ? "กำลังบันทึก…" : state.dirty ? "ยังไม่ได้บันทึก" : savedAt ? `บันทึกแล้ว ${fmtDate(savedAt)}` : ""}
        </span>
        <span className={s.spacer} />
        <button className={`${s.btn} ${s.btnGhost}`} onClick={newEdit} title="เริ่มงานใหม่"><FilePlus2 size={15} /> ใหม่</button>
        <button className={`${s.btn} ${s.btnGhost}`} onClick={openDrafts}><FolderOpen size={15} /> งานที่ทำไว้</button>
        <button className={s.btn} onClick={() => save().catch(onError)} disabled={saving}><Save size={15} /> บันทึก</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={render} disabled={sending || busy || !state.tl.clips.length}
                title={`สร้างไฟล์ MP4 ความยาว ${fmt(tot.total)}`}>
          {sending || busy ? <Loader2 size={15} className="animate-spin" /> : <Clapperboard size={15} />}
          {busy ? "กำลังสร้าง…" : "สร้างคลิป"}
        </button>
      </div>

      {err && (
        <div className={`${s.banner} ${s.bannerErr}`}>
          <AlertTriangle size={15} /> <span style={{ flex: 1 }}>{err}</span>
          <button className={s.iconBtn} style={{ width: 26, height: 26 }} onClick={() => setErr(null)} aria-label="ปิด"><X size={14} /></button>
        </div>
      )}
      {job && (
        <div className={`${s.banner} ${job.status === "done" ? s.bannerOk : job.status === "failed" ? s.bannerErr : s.bannerInfo}`}>
          {job.status === "done" ? <CheckCircle2 size={15} /> : job.status === "failed" ? <AlertTriangle size={15} /> : <Loader2 size={15} className="animate-spin" />}
          <span style={{ flex: 1 }}>
            {STATUS_TH[job.status] || job.status}
            {busy && " — ใช้เวลาราว 3–6 นาที ปิดหน้านี้ได้ งานยังเดินต่อ (ดูผลได้ที่หน้าโรงงานวิดีโอ)"}
            {job.status === "failed" && job.error && ` — ${String(job.error).slice(0, 220)}`}
          </span>
          {job.status === "done" && job.video_url && (
            <>
              <a href={job.video_url} target="_blank" rel="noreferrer">ดูคลิป</a>
              <a href={job.video_url} download>ดาวน์โหลด MP4</a>
            </>
          )}
          {!busy && <button className={s.iconBtn} style={{ width: 26, height: 26 }} onClick={() => setJob(null)} aria-label="ปิด"><X size={14} /></button>}
        </div>
      )}

      <div className={s.main}>
        <div className={`${s.col} ${s.colLib}`}>
          <Library api={api} dispatch={dispatch} state={state} assets={assets} reloadAssets={reloadAssets}
                   skus={skus} skuImg={skuImg} onError={onError} tab={tab} setTab={setTab} />
        </div>
        <div className={`${s.col} ${s.colMid}`}>
          <Preview tl={state.tl} t={state.t} onTime={onTime} skuImg={skuImg} playing={playing} setPlaying={setPlaying}
                   sel={state.sel} onSelect={onSelect} onOverlayMove={onOverlayMove} />
        </div>
        <div className={`${s.col} ${s.colInsp}`}>
          <Inspector state={state} dispatch={dispatch} />
        </div>
      </div>

      <Tracks state={state} dispatch={dispatch} skuImg={skuImg} playing={playing} onSeek={onSeek} onWant={onWant} />

      {drafts && (
        <div className={s.drafts} onClick={() => setDrafts(null)}>
          <div className={s.draftsBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <b style={{ flex: 1 }}>งานตัดต่อที่ทำไว้</b>
              <button className={s.iconBtn} onClick={() => setDrafts(null)} aria-label="ปิด"><X size={15} /></button>
            </div>
            {!drafts.length && <div className={s.empty}>กำลังโหลด… (หรือยังไม่มีงาน)</div>}
            {drafts.map(d => (
              <a key={d.id} className={s.draftRow} href={`/video/editor?id=${d.id}`} style={{ textDecoration: "none" }}
                 onClick={(e) => { if (stateRef.current.dirty && !window.confirm("งานนี้ยังไม่ได้บันทึก — เปิดงานอื่นเลยไหม")) e.preventDefault() }}>
                <Clapperboard size={18} />
                <span style={{ flex: 1 }}>{d.name}<br /><small>{d.clips} ชิ้น · {d.seconds} วิ · {fmtDate(d.updated_at)}{d.job_id ? " · เคยสร้างคลิปแล้ว" : ""}</small></span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
