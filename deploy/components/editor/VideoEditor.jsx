"use client"
// VideoEditor — เชลล์ของห้องตัดต่อ: โหลดงาน · จัด layout · top bar · คีย์ลัด ·
// ร่างอัตโนมัติ (localStorage) · สั่งเรนเดอร์+โพลสถานะ
//
// ไฟล์นี้ "ถือกระเป๋า" อย่างเดียว — กติกาการแก้เนื้อหาทั้งหมดอยู่ใน editorStore
// (ดู CONTRACT.md) ลูกทั้งสี่รับ { state, dispatch, api } ผ่าน props เท่านั้น
import { useReducer, useState, useEffect, useRef, useMemo, useCallback } from "react"
import {
  Undo2, Redo2, Download, X, AlertTriangle, Magnet, Frame, Loader2,
} from "lucide-react"
import {
  reducer, buildPlanForRender, subAt, fmtTime, NUDGE,
} from "./editorStore"
import PreviewPlayer from "./PreviewPlayer"
import Timeline from "./Timeline"
import SubtitleCards from "./SubtitleCards"
import InspectorPanel from "./InspectorPanel"
import styles from "./VideoEditor.module.css"

// เวลาแบบไทยสั้น ๆ — ใช้ทั้งการ์ดเลือกงานและแถบร่าง
const fmtDate = (v) => {
  try {
    return new Date(v).toLocaleString("th-TH",
      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  } catch { return "" }
}

// ── กู้ร่างจาก localStorage ──
// ทำไมต้องห่อ reducer แทนที่จะยิง LOAD_PROJECT ตรง ๆ: payload กู้ได้แค่
// timing/subtitles/edit (ยัดผ่าน plan.edit) แต่ frameFor กับธง dirty อยู่นอก
// โครง payload — initFromProject ตั้งค่าใหม่เองเสมอ จึงต้องทับต่อท้ายที่นี่
// action นี้เชลล์ยิงเองที่เดียว ลูก ๆ ไม่รู้จัก (ไม่อยู่ใน CONTRACT โดยเจตนา)
const DRAFT_RESTORE = "SHELL_DRAFT_RESTORE"

function shellReducer(state, action) {
  if (action.type === DRAFT_RESTORE) {
    const base = reducer(state, { type: "LOAD_PROJECT", payload: action.payload })
    const d = action.draft || {}
    return {
      ...base,
      // ทับเฉพาะคีย์ที่ร่างเก็บครบและรูปทรงถูก — ร่างเสีย (เขียนค้างครึ่งทาง/คนละเวอร์ชัน)
      // ให้ตกกลับไปใช้ของจริงทีละคีย์ ดีกว่าพังทั้งก้อน
      timing: Array.isArray(d.timing) && d.timing.length
        ? d.timing.map(t => ({ ...t })) : base.timing,
      subtitles: Array.isArray(d.subtitles) && d.subtitles.length
        ? d.subtitles.map(c => ({ ...c })) : base.subtitles,
      edit: d.edit ? {
        scenes: { ...(d.edit.scenes || {}) },
        headline: d.edit.headline || null,
        sub_style: d.edit.sub_style || null,
        logo: d.edit.logo || null,
      } : base.edit,
      frameFor: Array.isArray(d.frameFor) && d.frameFor.length === base.frameFor.length
        ? [...d.frameFor] : base.frameFor,
      voice: typeof d.voice === "string" && d.voice ? d.voice : base.voice,
      voiceStyle: typeof d.voiceStyle === "string" ? d.voiceStyle : base.voiceStyle,
      ui: { ...base.ui, dirty: true },   // ร่างคือของที่ยังไม่ได้เรนเดอร์เสมอ
    }
  }
  return reducer(state, action)
}

export default function VideoEditor({ project }) {
  // ไม่มี ?project= = ยังไม่รู้จะตัดคลิปไหน → หน้าเลือกงานก่อน
  // แยก component เพื่อไม่ให้ hook ทั้งชุดของห้องถูกเรียกตอนที่ยังไม่มีงาน
  return project ? <EditorRoom project={project} /> : <ProjectPicker />
}

// ── หน้าเลือกงาน (ไม่มี ?project=) ──
function ProjectPicker() {
  const [list, setList] = useState(null)      // null = กำลังโหลด
  const [error, setError] = useState(null)

  useEffect(() => {
    let dead = false
    fetch("/api/video/local/projects")
      .then(async (res) => {
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
        if (!dead) setList(j.projects || [])
      })
      .catch((e) => { if (!dead) setError(String(e?.message || e)) })
    return () => { dead = true }
  }, [])

  return (
    <div className={styles.screen}>
      <div className={styles.screenMid}>
        <a className={styles.back} href="/video">← กลับหน้าโรงงานวิดีโอ</a>
        <h1 className={styles.pageTitle}>ห้องตัดต่อวิดีโอ</h1>
        <p className={styles.muted}>
          เลือกงานที่จะแก้ — รายการนี้คืองานเรนเดอร์บนเครื่องนี้ (.video-work)
          ใช้ได้เฉพาะตอนรัน dev เท่านั้น
        </p>

        {error && (
          <div className={styles.errBox}>
            <AlertTriangle size={16} />
            <div>โหลดรายชื่องานไม่ได้: {error}</div>
          </div>
        )}
        {!error && list === null && <p className={styles.muted}>กำลังโหลดรายชื่องาน…</p>}
        {!error && list?.length === 0 && (
          <p className={styles.muted}>
            ยังไม่มีงานที่ตัดต่อได้ — สร้างคลิปจากหน้า /video ให้เรนเดอร์จบสักรอบก่อน
          </p>
        )}

        <div className={styles.cards}>
          {(list || []).map((p) => (
            <a key={p.name} className={styles.card}
               href={`/video/editor?project=${encodeURIComponent(p.name)}`}>
              <div className={styles.cardName}>{p.name}</div>
              <div className={styles.cardMeta}>
                <span>{p.duration != null ? fmtTime(p.duration) : "—"} นาที</span>
                <span>{p.segments != null ? `${p.segments} ฉาก` : "—"}</span>
                {p.hasVideo && <span className={styles.badge}>มี mp4</span>}
              </div>
              <div className={styles.cardTime}>แก้ล่าสุด {fmtDate(p.updated_at)}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── ห้องตัดต่อจริง (มี ?project= แล้ว) ──
function EditorRoom({ project }) {
  const [state, dispatch] = useReducer(shellReducer, null)
  const [loadError, setLoadError] = useState(null)
  const [draft, setDraft] = useState(null)      // ร่างที่เจอใน localStorage รอถามผู้ใช้
  const [tab, setTab] = useState("subs")        // จอแคบ: ซับ | ปรับแต่ง

  const payloadRef = useRef(null)               // payload ล่าสุดจาก GET project — ฐานของการกู้ร่าง
  const stateRef = useRef(null)                 // ให้ api/คีย์ลัดอ่าน state ล่าสุดโดยไม่ re-bind
  const pollRef = useRef(null)
  stateRef.current = state

  const draftKey = "ve-draft-" + project

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])
  useEffect(() => () => stopPoll(), [stopPoll])

  // โหลด (และโหลดซ้ำ) ตัวงาน — ล้มเหลวตอนยังไม่มี state = จอ error เต็ม
  // ล้มเหลวตอนมี state แล้ว (เช่นโหลดผลหลังเรนเดอร์) = กล่องแดง อย่าทิ้งงานบนจอ
  const loadProject = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch(`/api/video/local/project?name=${encodeURIComponent(project)}`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || `โหลดงานไม่สำเร็จ (HTTP ${res.status})`)
      payloadRef.current = j
      dispatch({ type: "LOAD_PROJECT", payload: j })
      try {
        const raw = localStorage.getItem("ve-draft-" + project)
        setDraft(raw ? JSON.parse(raw) : null)
      } catch { setDraft(null) }   // ร่างเสีย/อ่านไม่ได้ — เมินแล้วใช้ของจริง
    } catch (e) {
      const msg = String(e?.message || e)
      if (stateRef.current) {
        dispatch({ type: "RENDER_STATUS",
                   payload: { running: false, error: "โหลดผลใหม่ไม่สำเร็จ: " + msg } })
      } else {
        setLoadError(msg)
      }
    }
  }, [project])

  useEffect(() => { loadProject() }, [loadProject])

  // ร่างอัตโนมัติ — เซฟเฉพาะตอน dirty (โหลดใหม่ ๆ ยังไม่แก้อะไร ไม่ควรมีร่างงอกเอง)
  // debounce 800ms: พิมพ์ซับรัว ๆ ไม่ควรเขียน localStorage ทุกตัวอักษร
  useEffect(() => {
    const s = state
    if (!s || !s.ui.dirty) return
    const id = setTimeout(() => {
      try {
        localStorage.setItem("ve-draft-" + s.project, JSON.stringify({
          saved_at: Date.now(),
          timing: s.timing, subtitles: s.subtitles, edit: s.edit, frameFor: s.frameFor,
          voice: s.voice, voiceStyle: s.voiceStyle,
        }))
      } catch { /* localStorage เต็ม/ถูกปิด — ร่างเป็นของแถม ห้ามทำห้องพัง */ }
    }, 800)
    return () => clearTimeout(id)
  }, [state?.timing, state?.subtitles, state?.edit, state?.frameFor,
      state?.voice, state?.voiceStyle, state?.ui.dirty])

  const restoreDraft = () => {
    if (!payloadRef.current || !draft) return
    dispatch({ type: DRAFT_RESTORE, payload: payloadRef.current, draft })
    setDraft(null)
  }
  const discardDraft = () => {
    try { localStorage.removeItem(draftKey) } catch {}
    setDraft(null)
  }

  // ── api ที่ส่งให้ลูกทุกตัว ──
  const api = useMemo(() => {
    const startPoll = () => {
      stopPoll()
      let busy = false        // กัน fetch ซ้อนตอนเซิร์ฟเวอร์ dev ตอบช้ากว่า 1.5 วิ
      pollRef.current = setInterval(async () => {
        if (busy) return
        busy = true
        try {
          const res = await fetch(
            `/api/video/local/render-status?name=${encodeURIComponent(project)}`)
          const st = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(st?.error || `HTTP ${res.status}`)
          if (st.error) {
            stopPoll()
            dispatch({ type: "RENDER_STATUS", payload: {
              running: false, step: st.step || 0, message: st.message, error: st.error } })
          } else if (st.done) {
            stopPoll()
            // การแก้ถูกอบลง plan.json แล้ว — ร่างหมดหน้าที่ ลบทิ้งก่อนโหลดกลับ
            // ไม่งั้นแถบ "มีฉบับร่าง" จะเด้งถามทั้งที่ของตรงกันเป๊ะ
            try { localStorage.removeItem("ve-draft-" + project) } catch {}
            setDraft(null)
            dispatch({ type: "RENDER_STATUS", payload: {
              running: false, done: true, step: st.total || 6, total: st.total || 6,
              message: "เสร็จแล้ว — กำลังโหลดผลใหม่…", error: null } })
            await loadProject()
          } else {
            dispatch({ type: "RENDER_STATUS", payload: {
              running: true, step: st.step || 0, total: st.total || 6,
              message: st.message, error: null } })
          }
        } catch {
          // โพลพลาดครั้งเดียว (dev server สะดุด/compile อยู่) ไม่ใช่เรนเดอร์พัง — รอรอบหน้า
        } finally { busy = false }
      }, 1500)
    }

    return {
      async render() {
        const s = stateRef.current
        if (!s || s.ui.rendering.running) return
        dispatch({ type: "RENDER_STATUS", payload: {
          running: true, step: 0, total: 6, message: "กำลังส่งงาน…", error: null } })
        try {
          const res = await fetch("/api/video/local/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: s.project, plan: buildPlanForRender(s) }),
          })
          const j = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(j?.error || `สั่งเรนเดอร์ไม่สำเร็จ (HTTP ${res.status})`)
          startPoll()
        } catch (e) {
          dispatch({ type: "RENDER_STATUS",
                     payload: { running: false, error: String(e?.message || e) } })
        }
      },

      async uploadLogo(file) {
        // ชื่อปลายทางตายตัวเป็น logo.<ext> — อัปใหม่ทับของเก่า ไม่งอกไฟล์รก ๆ ในโฟลเดอร์งาน
        const m = /\.(png|jpe?g|webp)$/i.exec(file?.name || "")
        const ext = m ? m[0].toLowerCase() : ".png"
        const res = await fetch(
          `/api/video/local/upload?name=${encodeURIComponent(project)}` +
          `&file=${encodeURIComponent("logo" + ext)}`,
          { method: "POST", body: file })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j?.error || "อัปโหลดโลโก้ไม่สำเร็จ")
        return j.file
      },

      reload: () => loadProject(),
    }
  }, [project, loadProject, stopPoll])

  // ── คีย์ลัด — ผูกกับ window ครั้งเดียว อ่าน state ผ่าน ref ──
  useEffect(() => {
    const onKey = (e) => {
      const s = stateRef.current
      if (!s) return
      const el = e.target
      const tag = el?.tagName
      // กำลังพิมพ์อยู่ = คีย์เป็นของช่องพิมพ์ ไม่ใช่ของห้อง (รวม IME ไทยที่ compose ค้าง)
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
          el?.isContentEditable || e.isComposing) return

      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? "REDO" : "UNDO" })
        return
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault(); dispatch({ type: "REDO" }); return
      }
      if (mod || e.altKey) return

      if (e.code === "Space") {
        if (tag === "BUTTON" || tag === "A") return   // Space บนปุ่ม = กดปุ่ม อย่าแย่งกัน
        e.preventDefault()
        dispatch({ type: s.ui.playing ? "PAUSE" : "PLAY" })
        return
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault()
        const by = (e.shiftKey ? 0.5 : NUDGE) * (e.key === "ArrowLeft" ? -1 : 1)
        dispatch({ type: "SEEK", t: s.ui.t + by })
        return
      }
      if (e.key === "s" || e.key === "S") {
        const i = subAt(s.subtitles, s.ui.t)
        if (i >= 0) dispatch({ type: "SUB_SPLIT", index: i, at: s.ui.t })
        return
      }
      if (e.key === "m" || e.key === "M") {
        const sel = s.ui.selected
        if (sel.kind === "sub" && sel.index != null) {
          dispatch({ type: "SUB_MERGE", index: sel.index })
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ── จอสถานะก่อนเข้าห้อง ──
  if (loadError && !state) {
    return (
      <div className={styles.screen}>
        <div className={styles.screenMid}>
          <h2 className={styles.pageTitle}>เปิดงาน "{project}" ไม่ได้</h2>
          <p className={styles.muted}>{loadError}</p>
          <p className={styles.muted}>
            เช็คว่า dev server รันอยู่ และโฟลเดอร์ .video-work/{project} มี timing.json
            (งานต้องเรนเดอร์จบอย่างน้อยหนึ่งรอบถึงจะตัดต่อได้)
          </p>
          <div className={styles.group}>
            <a className="dx-btn dx-btn-secondary" href="/video/editor">← กลับไปเลือกงาน</a>
            <button className="dx-btn dx-btn-ghost" onClick={() => loadProject()}>ลองใหม่</button>
          </div>
        </div>
      </div>
    )
  }
  if (!state) {
    return (
      <div className={styles.screen}>
        <div className={`${styles.screenMid} ${styles.muted}`}>
          <Loader2 size={18} className={styles.spin} /> กำลังโหลดงาน {project}…
        </div>
      </div>
    )
  }

  const r = state.ui.rendering
  return (
    <div className={styles.room}>
      {/* ── top bar ── */}
      <header className={styles.top}>
        <a className={styles.back} href="/video" title="กลับหน้าโรงงานวิดีโอ">← กลับ</a>

        <div className={styles.title}>
          {state.project}
          {state.ui.dirty &&
            <span className={styles.dirtyDot} title="ยังไม่ได้เรนเดอร์" />}
        </div>

        <div className={styles.group}>
          <button className={styles.iconBtn} title="ย้อนกลับ (Ctrl+Z)"
                  disabled={!state.undo.length}
                  onClick={() => dispatch({ type: "UNDO" })}>
            <Undo2 size={15} />
          </button>
          <button className={styles.iconBtn} title="ทำซ้ำ (Ctrl+Y)"
                  disabled={!state.redo.length}
                  onClick={() => dispatch({ type: "REDO" })}>
            <Redo2 size={15} />
          </button>
        </div>

        <div className={styles.group}>
          <button className={`${styles.iconBtn} ${state.ui.snap ? styles.on : ""}`}
                  title="ดูดติดจุดใกล้เคียงตอนลากบน timeline"
                  onClick={() => dispatch({ type: "TOGGLE_SNAP" })}>
            <Magnet size={14} /> สแนป
          </button>
          <button className={`${styles.iconBtn} ${state.ui.safeArea ? styles.on : ""}`}
                  title="เส้นขอบเขตปลอดภัยบนพรีวิว (กัน UI ของ TikTok/Reels ทับ)"
                  onClick={() => dispatch({ type: "TOGGLE_SAFE" })}>
            <Frame size={14} /> เซฟโซน
          </button>
        </div>

        <div className={styles.spacer} />

        {r.running ? (
          <div className={styles.prog} title={r.message || ""}>
            <div className={styles.progFill}
                 style={{ width: `${Math.round((r.step / (r.total || 6)) * 100)}%` }} />
            <span className={styles.progText}>
              ขั้น {r.step}/{r.total || 6} · {r.message || "กำลังเรนเดอร์…"}
            </span>
          </div>
        ) : (
          <button className="dx-btn dx-btn-primary" onClick={() => api.render()}>
            เรนเดอร์ 🎬
          </button>
        )}

        {state.assets.videoUrl && (
          <a className="dx-btn dx-btn-ghost" href={state.assets.videoUrl}
             download={`${state.project}.mp4`} title="ดาวน์โหลดผลเรนเดอร์รอบล่าสุด">
            <Download size={14} /> mp4
          </a>
        )}

        {/* เจ้าของไม่ใช่มืออาชีพ — คีย์ลัดต้องมองเห็น ไม่ใช่ต้องท่อง */}
        <div className={styles.keys}>
          <kbd>Space</kbd> เล่น/หยุด · <kbd>←</kbd><kbd>→</kbd> ขยับ 0.1s
          (<kbd>Shift</kbd> 0.5) · <kbd>Ctrl+Z</kbd> ย้อน · <kbd>S</kbd> แบ่งซับ ·
          <kbd>M</kbd> รวมซับ
        </div>
      </header>

      {/* ── แถบร่างค้าง ── */}
      {draft && (
        <div className={styles.draftBar}>
          <span>
            มีฉบับร่างที่ยังไม่ได้เรนเดอร์
            {draft.saved_at ? ` (บันทึกเอง ${fmtDate(draft.saved_at)})` : ""}
          </span>
          <button className="dx-btn dx-btn-secondary" onClick={restoreDraft}>กู้ร่าง</button>
          <button className="dx-btn dx-btn-ghost" onClick={discardDraft}>ทิ้งร่าง</button>
        </div>
      )}

      {/* ── กล่องแดงตอนเรนเดอร์พัง — ท้าย log อ่านได้ตรงนี้เลย ไม่ต้องไปเปิดไฟล์ ── */}
      {r.error && (
        <div className={styles.errBox}>
          <AlertTriangle size={16} />
          <div className={styles.errBody}>
            <strong>เรนเดอร์ไม่สำเร็จ</strong>
            <pre>{r.error}</pre>
          </div>
          <button className={styles.iconBtn} title="ปิดข้อความ"
                  onClick={() => dispatch({ type: "RENDER_STATUS", payload: { error: null } })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── ผังกลาง: ซ้ายซับ · กลางพรีวิว · ขวา inspector ──
           จอแคบ <1100px: CSS ยุบเป็นคอลัมน์เดียว โผล่แถบแท็บใต้พรีวิว
           (data-tab คุมว่าฝั่งไหนโชว์ — จอกว้างไม่สน attribute นี้เลย) */}
      <div className={styles.main} data-tab={tab}>
        <aside className={styles.left}>
          <SubtitleCards state={state} dispatch={dispatch} api={api} />
        </aside>
        <section className={styles.center}>
          <PreviewPlayer state={state} dispatch={dispatch} api={api} />
        </section>
        <div className={styles.tabs}>
          <button className={`${styles.tabBtn} ${tab === "subs" ? styles.on : ""}`}
                  onClick={() => setTab("subs")}>ซับ</button>
          <button className={`${styles.tabBtn} ${tab === "inspect" ? styles.on : ""}`}
                  onClick={() => setTab("inspect")}>ปรับแต่ง</button>
        </div>
        <aside className={styles.right}>
          <InspectorPanel state={state} dispatch={dispatch} api={api} />
        </aside>
      </div>

      {/* ── timeline เต็มกว้างด้านล่าง ── */}
      <div className={styles.bottom}>
        <Timeline state={state} dispatch={dispatch} api={api} />
      </div>
    </div>
  )
}
