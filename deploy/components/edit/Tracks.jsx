"use client"
// แถบไทม์ไลน์ — ภาพหลัก (เรียงต่อกัน) · ของทับ (ช่วงเวลาอิสระ แยกแถวเมื่อซ้อนกัน) · เสียงพากย์ · เพลง
//
// การลากทุกแบบแก้ "สำเนาชั่วคราว" ของไทม์ไลน์ระหว่างลาก (คลิปหลังจุดที่ตัดเลื่อนตามให้เห็นทันที)
// แล้วค่อย dispatch ครั้งเดียวตอนปล่อย → ย้อนกลับได้เป็นขั้นเดียว
// ลากไม่ถึง 4 px = คลิก (เลือก + ย้ายหัวอ่านไปตรงนั้น)
import { useEffect, useMemo, useRef, useState } from "react"
import { Undo2, Redo2, Scissors, Copy, Trash2, Type, ZoomIn, Mic, Music, Film, Layers } from "lucide-react"
import { clipLen, layout, LIMITS } from "../../lib/videoTimeline"
import { totals, fmt } from "./timelineState"
import { srcOf } from "./Preview"

// สัญลักษณ์รอยต่อบนแถบคลิป (26 ต.ค. 2026 · รอยต่อ 8 แบบ)
const TRANS_MARK = { flash: "✦", zoom: "Z", whip: "»", bolt: "ϟ", glitch: "▦", wipe: "⟋", ring: "◎" }
import s from "./edit.module.css"

const HEAD = 92
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60]

// ของทับซ้อนเวลากัน → แยกแถว (แถวแรกที่ว่างพอ)
function assignLanes(overlays, total) {
  const ends = []
  const lane = {}
  ;[...overlays].sort((a, b) => a.start - b.start).forEach(o => {
    const end = o.end < 0 ? total : o.end
    let i = ends.findIndex(e => e <= o.start + 0.001)
    if (i < 0) { i = ends.length; ends.push(0) }
    ends[i] = end
    lane[o.id] = i
  })
  return { lane, count: Math.max(1, ends.length) }
}

// ใช้ผลการลากกับสำเนาไทม์ไลน์ (ยังไม่ commit)
function applyDrag(tl, d, k, tot) {
  if (!d || Math.abs(d.dx) < 4) return { tl, patch: null }
  const dt = d.dx / k
  if (d.mode === "trim-l" || d.mode === "trim-r") {
    const c = tl.clips.find(x => x.id === d.id)
    if (!c) return { tl, patch: null }
    let patch
    if (c.kind === "video") {
      const sp = c.speed || 1
      const max = c.seconds > 0 ? c.seconds : 36000
      patch = d.mode === "trim-r"
        ? { out: +clamp(c.out + dt * sp, c.in + 0.2, max).toFixed(2) }
        : { in: +clamp(c.in + dt * sp, 0, c.out - 0.2).toFixed(2) }
    } else {
      patch = { dur: +clamp((c.dur || 3) + (d.mode === "trim-r" ? dt : -dt), 0.3, 60).toFixed(2) }
    }
    return { tl: { ...tl, clips: tl.clips.map(x => (x.id === d.id ? { ...x, ...patch } : x)) }, patch }
  }
  if (d.mode.startsWith("ov-")) {
    const o = tl.overlays.find(x => x.id === d.id)
    if (!o) return { tl, patch: null }
    const endEff = o.end < 0 ? tot.total : o.end
    const snap = (v) => {
      for (const c of d.snaps) if (Math.abs(v - c) * k < 7) return c
      return v
    }
    let patch
    if (d.mode === "ov-move") {
      const len = endEff - o.start
      const st = +clamp(snap(o.start + dt), 0, Math.max(0, LIMITS.seconds - len)).toFixed(2)
      patch = o.end < 0 ? { start: Math.min(st, Math.max(0, tot.total - 0.3)) } : { start: st, end: +(st + len).toFixed(2) }
    } else if (d.mode === "ov-l") {
      patch = { start: +clamp(snap(o.start + dt), 0, endEff - 0.3).toFixed(2) }
    } else {
      const e = clamp(snap(endEff + dt), o.start + 0.3, LIMITS.seconds)
      patch = { end: e >= tot.total - 0.05 ? -1 : +e.toFixed(2) }
    }
    return { tl: { ...tl, overlays: tl.overlays.map(x => (x.id === d.id ? { ...x, ...patch } : x)) }, patch }
  }
  return { tl, patch: null }
}

export default function Tracks({ state, dispatch, skuImg, playing, onSeek, onWant }) {
  const { tl, t, sel } = state
  const body = useRef(null)
  const [w, setW] = useState(800)
  const [zoom, setZoom] = useState(0)            // 0 = พอดีจอ · บวก = ขยาย
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  dragRef.current = drag

  useEffect(() => {
    const el = body.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const tot0 = useMemo(() => totals(tl), [tl])
  const fit = clamp((w - HEAD - 30) / Math.max(tot0.total, 6), 6, 200)
  const k = fit * Math.pow(1.6, zoom)            // px ต่อวินาที

  const live = useMemo(() => applyDrag(tl, drag, k, tot0), [tl, drag, k, tot0])
  const vtl = live.tl
  const tot = useMemo(() => (vtl === tl ? tot0 : totals(vtl)), [vtl, tl, tot0])
  const lanes = useMemo(() => assignLanes(tl.overlays, tot0.total), [tl.overlays, tot0.total])
  const width = Math.max(w - HEAD, (tot.total + 3) * k)

  // ── ลาก: ฟังทั้งหน้าต่าง (ลากเลยกรอบก็ยังตาม) ──
  useEffect(() => {
    if (!drag) return
    const mv = (e) => {
      const d = dragRef.current
      if (!d) return
      if (d.mode === "scrub") {
        const r = body.current.getBoundingClientRect()
        onSeek(clamp((e.clientX - r.left + body.current.scrollLeft - HEAD) / k, 0, tot0.total))
        return
      }
      setDrag({ ...d, dx: e.clientX - d.x0 })
    }
    const up = () => {
      const d = dragRef.current
      setDrag(null)
      if (!d || d.mode === "scrub") return
      if (Math.abs(d.dx) < 4) {                 // คลิก
        dispatch({ type: "SELECT", sel: d.sel })
        if (d.clickT != null) onSeek(d.clickT)
        return
      }
      if (d.mode === "move-clip") {
        if (d.target != null) dispatch({ type: "MOVE_CLIP", id: d.id, to: d.target })
        return
      }
      const { patch } = applyDrag(tl, d, k, tot0)
      if (!patch) return
      dispatch(d.mode.startsWith("ov-")
        ? { type: "UPDATE_OVERLAY", id: d.id, patch }
        : { type: "UPDATE_CLIP", id: d.id, patch })
      dispatch({ type: "SELECT", sel: d.sel })
    }
    window.addEventListener("pointermove", mv)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      window.removeEventListener("pointermove", mv)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.mode, drag?.id, k, tl])

  // หัวอ่านวิ่งเลยขอบตอนเล่น → เลื่อนตาม
  useEffect(() => {
    const el = body.current
    if (!el || !playing) return
    const x = HEAD + t * k
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + HEAD) el.scrollLeft = Math.max(0, x - HEAD - 60)
  }, [t, k, playing])

  const timeAt = (e) => {
    const r = body.current.getBoundingClientRect()
    return clamp((e.clientX - r.left + body.current.scrollLeft - HEAD) / k, 0, tot0.total)
  }
  const start = (e, d) => {
    e.stopPropagation()
    if (e.button && e.button !== 0) return
    setDrag({ x0: e.clientX, dx: 0, clickT: timeAt(e), ...d })
  }

  // ปลายทางตอนลากเรียงคลิป
  let dropX = null
  if (drag?.mode === "move-clip" && Math.abs(drag.dx) >= 4) {
    const i = tl.clips.findIndex(c => c.id === drag.id)
    const center = tot0.starts[i] + clipLen(tl.clips[i]) / 2 + drag.dx / k
    const others = tl.clips.filter(c => c.id !== drag.id)
    const L = layout(others)
    let target = 0
    others.forEach((c, j) => { if (L.starts[j] + clipLen(c) / 2 < center) target = j + 1 })
    drag.target = target
    dropX = (target < others.length ? L.starts[target] : L.total) * k
  }

  const step = STEPS.find(x => x * k >= 52) || 60
  const ticks = []
  for (let x = 0; x <= tot.total + 3; x += step) ticks.push(x)

  const isSel = (kind, id) => sel?.kind === kind && sel.id === id
  const snaps = [0, t, ...tot0.starts, tot0.clipsTotal, tot0.total]

  return (
    <div className={s.tracks}>
      <div className={s.tracksBar}>
        <button className={s.tool} title="ย้อนกลับ (Ctrl+Z)" disabled={!state.past.length} onClick={() => dispatch({ type: "UNDO" })}><Undo2 size={15} /></button>
        <button className={s.tool} title="ทำซ้ำ (Ctrl+Shift+Z)" disabled={!state.future.length} onClick={() => dispatch({ type: "REDO" })}><Redo2 size={15} /></button>
        <span className={s.sep} />
        <button className={s.tool} title="ตัดคลิปที่หัวอ่าน (S)" disabled={!tl.clips.length} onClick={() => dispatch({ type: "SPLIT" })}><Scissors size={15} /> ตัดตรงนี้</button>
        <button className={s.tool} title="ทำสำเนา (Ctrl+D)" disabled={!sel || sel.kind === "voice" || sel.kind === "music"} onClick={() => dispatch({ type: "DUPLICATE" })}><Copy size={15} /> สำเนา</button>
        <button className={s.tool} title="ลบ (Delete)" disabled={!sel} onClick={() => dispatch({ type: "DELETE" })}><Trash2 size={15} /> ลบ</button>
        <span className={s.sep} />
        <button className={s.tool} title="ใส่ตัวหนังสือที่หัวอ่าน (T)" onClick={() => dispatch({ type: "ADD_OVERLAY", overlay: { type: "text", text: "พิมพ์ข้อความ", style: "bold", size: 96, y: 0.25, anim: "pop" }, len: 3 })}>
          <Type size={15} /> ตัวหนังสือ
        </button>
        <span className={s.zoom}>
          <ZoomIn size={14} />
          <input type="range" min={-1} max={5} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="ซูมไทม์ไลน์" />
          <span style={{ fontFamily: "var(--dx-mono, monospace)" }}>{fmt(tot.total)}</span>
        </span>
      </div>

      <div ref={body} className={s.tracksBody}>
        <div className={s.lanesInner} style={{ width: HEAD + width }}>
          <div className={s.rulerRow}>
            <div className={s.head} />
            <div className={s.ruler} style={{ width }}
                 onPointerDown={(e) => { onSeek(timeAt(e)); setDrag({ mode: "scrub", x0: e.clientX, dx: 0 }) }}>
              {ticks.map(x => <span key={x} className={s.tick} style={{ left: x * k }}>{fmt(x).replace(/\.0$/, "")}</span>)}
            </div>
          </div>

          {/* ภาพหลัก */}
          <div className={s.row}>
            <div className={s.head}><Film size={13} />ภาพหลัก</div>
            <div className={s.lane} style={{ width }} onPointerDown={(e) => { onSeek(timeAt(e)); dispatch({ type: "SELECT", sel: null }) }}>
              {!vtl.clips.length && <span className={s.laneHint}>กดไฟล์ในคลังด้านซ้าย หรืออัปโหลดคลิป — คลิปจะเรียงต่อกันที่นี่</span>}
              {tot.voice > tot.clipsTotal + 0.3 && vtl.clips.length > 0 && (
                <div className={s.overflowZone} style={{ left: tot.clipsTotal * k, width: (tot.total - tot.clipsTotal) * k }}
                     title="ช่วงนี้ไม่มีภาพ (เสียงพากย์ยาวกว่า) — จะเป็นพื้นกรมท่า" />
              )}
              {vtl.clips.map((c, i) => {
                const left = tot.starts[i] * k
                const wpx = Math.max(6, clipLen(c) * k)
                const moving = drag?.mode === "move-clip" && drag.id === c.id && Math.abs(drag.dx) >= 4
                const thumb = c.kind === "image" && !c.src.startsWith("gen:") ? srcOf(c.src, skuImg) : null
                return (
                  <div key={c.id}
                       className={`${s.block} ${c.kind === "image" ? s.blockImage : s.blockClip} ${isSel("clip", c.id) ? s.blockSel : ""}`}
                       style={{ left, width: wpx, transform: moving ? `translateX(${drag.dx}px)` : undefined, opacity: moving ? 0.8 : 1, zIndex: moving ? 6 : undefined }}
                       title={`${c.name || c.src} · ${clipLen(c).toFixed(1)} วิ`}
                       onPointerDown={(e) => start(e, { mode: "move-clip", id: c.id, sel: { kind: "clip", id: c.id } })}>
                    {thumb && <span className={s.blockThumb} style={{ backgroundImage: `url("${thumb}")` }} />}
                    <span className={s.blockLabel}>{c.name || (c.kind === "image" ? "รูป" : "คลิป")} · {clipLen(c).toFixed(1)}s</span>
                    <span className={`${s.handle} ${s.handleL}`} title="ลากเพื่อตัดหัว"
                          onPointerDown={(e) => start(e, { mode: "trim-l", id: c.id, sel: { kind: "clip", id: c.id } })} />
                    <span className={`${s.handle} ${s.handleR}`} title="ลากเพื่อตัดท้าย"
                          onPointerDown={(e) => start(e, { mode: "trim-r", id: c.id, sel: { kind: "clip", id: c.id } })} />
                    {i > 0 && c.transition !== "cut" && <span className={s.transMark} style={{ left: 0 }}>{TRANS_MARK[c.transition] || "✦"}</span>}
                  </div>
                )
              })}
              {dropX != null && <span className={s.dropMark} style={{ left: dropX - 1 }} />}
            </div>
          </div>

          {/* ของทับ */}
          {Array.from({ length: lanes.count }, (_, li) => (
            <div key={li} className={s.row}>
              <div className={`${s.head} ${s.headSm}`}>{li === 0 ? <><Layers size={13} />ของทับ</> : ""}</div>
              <div className={`${s.lane} ${s.laneSm}`} style={{ width }} onPointerDown={(e) => { onSeek(timeAt(e)); dispatch({ type: "SELECT", sel: null }) }}>
                {li === 0 && !vtl.overlays.length && <span className={s.laneHint}>ตัวหนังสือ · ซองลอย · โลโก้ จะอยู่แถวนี้</span>}
                {vtl.overlays.filter(o => lanes.lane[o.id] === li).map(o => {
                  const end = o.end < 0 ? tot.total : o.end
                  const label = o.type === "text" ? `“${o.text.split("\n")[0]}”` : o.type === "logo" ? "โลโก้" : (o.src || "").replace(/^sku:/, "ซอง ")
                  const d = { id: o.id, sel: { kind: "overlay", id: o.id }, snaps }
                  return (
                    <div key={o.id}
                         className={`${s.block} ${o.type === "text" ? s.blockText : o.type === "logo" ? s.blockLogo : s.blockPic} ${isSel("overlay", o.id) ? s.blockSel : ""}`}
                         style={{ left: o.start * k, width: Math.max(8, (end - o.start) * k) }}
                         title={`${label} · ${o.start.toFixed(1)}–${end.toFixed(1)} วิ`}
                         onPointerDown={(e) => start(e, { mode: "ov-move", ...d })}>
                      <span className={s.blockLabel}>{label}</span>
                      <span className={`${s.handle} ${s.handleL}`} onPointerDown={(e) => start(e, { mode: "ov-l", ...d })} />
                      <span className={`${s.handle} ${s.handleR}`} onPointerDown={(e) => start(e, { mode: "ov-r", ...d })} />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* เสียงพากย์ */}
          <div className={s.row}>
            <div className={`${s.head} ${s.headSm}`}><Mic size={13} />พากย์</div>
            <div className={`${s.lane} ${s.laneSm}`} style={{ width }}>
              {vtl.voice
                ? <div className={`${s.block} ${s.blockVoice} ${isSel("voice", "voice") ? s.blockSel : ""}`}
                       style={{ left: 0, width: Math.max(40, (tot.voice || 1) * k), cursor: "pointer" }}
                       onPointerDown={(e) => { e.stopPropagation(); dispatch({ type: "SELECT", sel: { kind: "voice", id: "voice" } }) }}>
                    <span className={s.blockLabel}>{vtl.voice.script ? `${vtl.voice.voice} · ${vtl.voice.script.split("\n")[0]}` : "ยังไม่ได้พิมพ์บท — กดเพื่อพิมพ์"}</span>
                  </div>
                : <button className={s.laneBtn} onClick={() => dispatch({ type: "SET_VOICE", voice: { script: "", voice: "Puck", style: null, tts_model: null }, select: true })}>+ เสียงพากย์ AI</button>}
            </div>
          </div>

          {/* เพลง */}
          <div className={s.row}>
            <div className={`${s.head} ${s.headSm}`}><Music size={13} />เพลง</div>
            <div className={`${s.lane} ${s.laneSm}`} style={{ width }}>
              {vtl.music
                ? <div className={`${s.block} ${s.blockMusic} ${isSel("music", "music") ? s.blockSel : ""}`}
                       style={{ left: 0, width: tot.total * k, cursor: "pointer" }}
                       onPointerDown={(e) => { e.stopPropagation(); dispatch({ type: "SELECT", sel: { kind: "music", id: "music" } }) }}>
                    <span className={s.blockLabel}>{decodeURIComponent(vtl.music.src.split("/").pop()).replace(/^\d{8}-[a-z0-9]{6}-/, "")} · ดัง {Math.round(vtl.music.volume * 100)}%</span>
                  </div>
                : <button className={s.laneBtn} onClick={() => onWant("audio")}>+ เพลง</button>}
            </div>
          </div>

          <div className={s.playhead} style={{ left: HEAD + t * k }} />
        </div>
      </div>
    </div>
  )
}
