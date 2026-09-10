"use client"
// Timeline — แถบเวลาล่างของห้องตัดต่อ: ruler / ฉาก / เสียง / พาดหัว / ซับ / เพลง
//
// หลักการลากที่ต้องรักษาไว้ (ดู CONTRACT.md ข้อ 3):
// - SEEK ลากได้ลื่น dispatch ทุก pointermove เพราะไม่เข้า undo stack
// - แต่ CUT_NUDGE / SUB_NUDGE / SUB_EDIT เข้า undo — ระหว่างลากจึงเก็บ offset
//   ไว้ในตัวเอง (dragRef + drag state สำหรับวาด ghost) แล้ว dispatch "ครั้งเดียว"
//   ตอน pointerup ไม่งั้นกด undo ทีจะย้อนทีละ pixel จนใช้ไม่ได้จริง
// - snap ทำตอนลากฝั่งเรา ไม่ใช่ใน reducer เพราะเป้าดูด (จุดตัด/ขอบซับ/วินาทีเต็ม)
//   เป็นเรื่องของมุมมอง ไม่ใช่กติกาของข้อมูล

import { useEffect, useMemo, useRef, useState } from "react"
import styles from "./Timeline.module.css"
import {
  PPS_BASE, MIN_SCENE, MIN_SUB, clamp, round3, fmtTime, totalOf,
} from "./editorStore"

// ── แคชเสียงระดับ module — decode ครั้งเดียวต่อ url แล้วใช้ซ้ำทุก mount/zoom ──
// (decodeAudioData กิน CPU เป็นวินาที ถ้า decode ใหม่ทุกครั้งที่ zoom จะกระตุกทั้งจอ)
const waveCache = new Map() // url → Promise<Float32Array ช่องซ้าย>
let audioCtx = null
function loadWave(url) {
  if (!waveCache.has(url)) {
    waveCache.set(url, (async () => {
      const res = await fetch(url)
      const raw = await res.arrayBuffer()
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
      const buf = await audioCtx.decodeAudioData(raw)
      return buf.getChannelData(0)
    })())
  }
  return waveCache.get(url)
}

// เพดานความกว้าง canvas ของเบราว์เซอร์ ~32767px — คลิปยาว × zoom สูงชนได้จริง
// เกินแล้ววาดไม่ขึ้นแบบเงียบ ๆ จึงวาดที่ความละเอียดต่ำกว่าแล้วให้ CSS ยืดแทน
const CANVAS_MAX = 32000

function drawWave(canvas, data, widthPx, height) {
  const W = Math.max(1, Math.min(Math.round(widthPx), CANVAS_MAX))
  canvas.width = W
  canvas.height = height
  const g = canvas.getContext("2d")
  g.clearRect(0, 0, W, height)
  g.fillStyle = "rgba(61, 220, 255, 0.6)" // ฟ้านีออนโปร่ง 60% ตามสเปก
  const mid = height / 2
  const amp = height / 2 - 2
  const N = data.length
  const bw = 2 // หนึ่ง bucket ≈ 2px — ละเอียดพอเห็นช่องเงียบ ไม่หนักเครื่อง
  for (let x = 0; x < W; x += bw) {
    const i0 = Math.floor((x / W) * N)
    const i1 = Math.max(i0 + 1, Math.floor(((x + bw) / W) * N))
    // bucket ใหญ่มากตอน zoom ต่ำ — สุ่มก้าวข้ามบ้าง ตามองไม่ออกแต่เร็วขึ้นมาก
    const step = Math.max(1, Math.floor((i1 - i0) / 200))
    let lo = 0, hi = 0
    for (let i = i0; i < i1; i += step) {
      const v = data[i]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    g.fillRect(x, mid - hi * amp, bw - 1, Math.max(1, (hi - lo) * amp))
  }
}

// waveform เป็น component แยก — วาดใหม่เฉพาะตอน url/ความกว้างเปลี่ยน
// ไม่ต้องวาดซ้ำตอน playhead ขยับ (ซึ่งเกิด 30 ครั้ง/วินาทีตอนเล่น)
function WaveTrack({ url, widthPx, height }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!url || !ref.current) return
    let dead = false
    loadWave(url)
      .then((data) => { if (!dead && ref.current) drawWave(ref.current, data, widthPx, height) })
      .catch(() => waveCache.delete(url)) // ไฟล์/เน็ตพัง — ลบทิ้งให้รอบหน้าลองใหม่ได้
    return () => { dead = true }
  }, [url, widthPx, height])
  return <canvas ref={ref} className={styles.wave} style={{ width: widthPx, height }} height={height} />
}

// ป้ายเวลาบน ruler — "0:05" พอ ไม่เอาทศนิยมให้รก (เวลาละเอียดดูที่ tooltip ตอนลาก)
const rulerLabel = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`

export default function Timeline({ state, dispatch, api }) {
  const { timing, subtitles, assets, frameFor } = state
  const { t, zoom, snap: snapOn, selected, playing } = state.ui
  const pps = PPS_BASE * zoom
  const total = totalOf(timing)
  const totalPx = Math.max(1, Math.round(total * pps))

  const scrollerRef = useRef(null)
  const contentRef = useRef(null)
  // dragRef = ความจริงล่าสุดระหว่างลาก (handler อ่านได้ไม่ติด stale closure)
  // drag state = สำเนาไว้ให้ React วาด ghost/tooltip — สองอันนี้ต้องอัปเดตคู่กัน
  const dragRef = useRef(null)
  const [drag, setDrag] = useState(null)

  // ── เครื่องมือแปลงพิกัด/ดูด ──
  const posToT = (clientX) => {
    const rect = contentRef.current.getBoundingClientRect()
    return clamp((clientX - rect.left) / pps, 0, total)
  }

  // เป้าดูดคงที่ตลอดการลาก (สร้างครั้งเดียวตอน pointerdown เก็บใน dragRef)
  const buildTargets = (skipCut, skipSub) => {
    const out = []
    for (let i = 1; i < timing.length; i++) if (i !== skipCut) out.push(timing[i].start)
    subtitles.forEach((c, i) => { if (i !== skipSub) out.push(c.start, c.end) })
    return out
  }

  // ระยะดูด ≤8px แปลงเป็นวินาทีตาม zoom ปัจจุบัน — วินาทีเต็มเช็คแยกไม่ต้อง list
  const trySnap = (tt, targets) => {
    let best = null
    let bd = 8 / pps
    for (const g of targets) {
      const d = Math.abs(g - tt)
      if (d < bd) { bd = d; best = g }
    }
    const sec = Math.round(tt)
    if (sec >= 0 && sec <= total && Math.abs(sec - tt) < bd) best = sec
    return best
  }

  // ── วงจรชีวิตการลาก (pointer capture ทำให้ move/up วิ่งเข้า element เดิมเสมอ) ──
  const beginDrag = (e, data) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = data
    if (data.type !== "seek") setDrag(data)
  }

  const onSeekDown = (e) => {
    beginDrag(e, { type: "seek" })
    dispatch({ type: "SEEK", t: posToT(e.clientX) })
  }

  // จับหัว playhead ไม่ seek ทันที — หัวจับกว้าง 13px ถ้า seek ตรง pointer เลย
  // เวลาจะกระโดดนิดหนึ่งทุกครั้งที่แค่เอื้อมไปจับ (ขยับจริงค่อยว่ากันตอน move)
  const onPlayheadDown = (e) => beginDrag(e, { type: "seek" })

  const onCutDown = (e, i) => {
    e.stopPropagation()
    beginDrag(e, {
      type: "cut", index: i, x0: e.clientX, orig: timing[i].start,
      // กรอบเดียวกับ reducer (MIN_SCENE ทั้งสองฝั่ง) — ghost จะได้ไม่โกหกว่าไปได้ไกลกว่าจริง
      lo: timing[i - 1].start + MIN_SCENE,
      hi: (i + 1 < timing.length ? timing[i + 1].start : total) - MIN_SCENE,
      by: 0, snapT: null, targets: buildTargets(i, -1),
    })
  }

  const onSubEdgeDown = (e, i, edge) => {
    e.stopPropagation()
    const c = subtitles[i]
    beginDrag(e, {
      type: "sub-edge", index: i, edge, x0: e.clientX,
      orig: edge === "start" ? c.start : c.end,
      lo: edge === "start" ? 0 : c.start + MIN_SUB,
      hi: edge === "start" ? c.end - MIN_SUB : total,
      by: 0, snapT: null, targets: buildTargets(-1, i),
    })
  }

  const onChipDown = (e, i) => {
    const c = subtitles[i]
    beginDrag(e, {
      type: "sub-move", index: i, x0: e.clientX, s0: c.start, e0: c.end,
      by: 0, snapT: null, targets: buildTargets(-1, i),
    })
  }

  const onDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    if (d.type === "seek") { dispatch({ type: "SEEK", t: posToT(e.clientX) }); return }
    const dt = (e.clientX - d.x0) / pps
    const nd = { ...d, snapT: null }
    if (d.type === "sub-move") {
      let by = clamp(dt, -d.s0, total - d.e0)
      if (snapOn) {
        // เลื่อนทั้งใบ — ลองดูดขอบหน้าเข้าเป้าก่อน ไม่ติดค่อยลองขอบหลัง
        const gs = trySnap(d.s0 + by, d.targets)
        const ge = gs == null ? trySnap(d.e0 + by, d.targets) : null
        if (gs != null) { by = gs - d.s0; nd.snapT = gs }
        else if (ge != null) { by = ge - d.e0; nd.snapT = ge }
        by = clamp(by, -d.s0, total - d.e0)
      }
      nd.by = round3(by)
    } else {
      let tt = d.orig + dt
      if (snapOn) {
        const g = trySnap(tt, d.targets)
        if (g != null) { tt = g; nd.snapT = g }
      }
      tt = clamp(tt, d.lo, d.hi)
      if (nd.snapT != null && nd.snapT !== tt) nd.snapT = null // ดูดแล้วโดนกรอบทับ = ไม่ได้ดูดจริง
      nd.by = round3(tt - d.orig)
    }
    dragRef.current = nd
    setDrag(nd)
  }

  const onDragEnd = () => {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d || d.type === "seek") return
    if (d.type === "cut") {
      if (d.by) dispatch({ type: "CUT_NUDGE", index: d.index, by: d.by })
    } else if (d.type === "sub-edge") {
      if (d.by) dispatch({ type: "SUB_NUDGE", index: d.index, edge: d.edge, by: d.by })
    } else if (d.type === "sub-move") {
      if (Math.abs(d.by * pps) < 3) {
        // ขยับไม่ถึง 3px = ตั้งใจคลิกเลือก ไม่ใช่ลาก — อย่าสร้างก้าว undo เปล่า ๆ
        dispatch({ type: "SELECT", kind: "sub", index: d.index })
        dispatch({ type: "SEEK", t: d.s0 })
      } else if (d.by) {
        dispatch({
          type: "SUB_EDIT", index: d.index,
          patch: { start: round3(d.s0 + d.by), end: round3(d.e0 + d.by) },
        })
      }
    }
  }

  // ── ruler: ยิ่ง zoom สูง ขีดยิ่งถี่ (1 → 0.5 → 0.1 วินาที) เลขทุก 5 วิ ──
  const ticks = useMemo(() => {
    if (!total) return []
    const minor = pps >= 160 ? 0.1 : pps >= 80 ? 0.5 : 1
    const out = []
    for (let k = 0, n = Math.floor(total / minor); k <= n; k++) {
      const tm = round3(k * minor)
      const isSec = Math.abs(tm - Math.round(tm)) < 1e-6
      out.push({ tm, px: tm * pps, isSec, isMajor: isSec && Math.round(tm) % 5 === 0 })
    }
    return out
  }, [total, pps])

  // ── autoscroll: เล่นจน playhead พ้นขอบขวา → พากลับมาช่วงต้นจอให้ตามอ่านต่อได้ ──
  useEffect(() => {
    if (!playing) return
    const sc = scrollerRef.current
    if (!sc) return
    const px = t * pps
    if (px > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = Math.max(0, px - 60)
  }, [t, playing, pps])

  const fitZoom = () => {
    const sc = scrollerRef.current
    if (!sc || !total) return
    dispatch({ type: "SET_ZOOM", zoom: (sc.clientWidth - 24) / (total * PPS_BASE) })
  }

  if (!timing.length) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty}>ยังไม่มีข้อมูลเวลา — รอโหลดโปรเจกต์หรือเรนเดอร์รอบแรกก่อน</div>
      </div>
    )
  }

  // พาดหัว: ค่าที่แก้ในห้องทับค่าใน plan · plan เก่าบางใบเก็บเป็น string เฉย ๆ
  const hlRaw = state.edit.headline ?? state.plan?.headline
  const hl = typeof hlRaw === "string" ? { text: hlRaw } : hlRaw
  const hlOn = !!(hl && hl.text)

  // เวลาที่ tooltip ควรโชว์ระหว่างลาก (จุดที่กำลังจะปล่อยจริง หลัง snap+clamp แล้ว)
  const tipT = !drag || drag.type === "seek" ? null
    : drag.type === "sub-move" ? drag.s0 + drag.by
    : drag.orig + drag.by

  return (
    <div className={styles.wrap}>
      {/* มุมซ้ายบน: zoom / fit / snap ตามสเปกข้อ 9 */}
      <div className={styles.toolbar}>
        <button type="button" className={styles.tbtn} title="ซูมออก"
          onClick={() => dispatch({ type: "SET_ZOOM", zoom: zoom * 0.8 })}>−</button>
        <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        <button type="button" className={styles.tbtn} title="ซูมเข้า"
          onClick={() => dispatch({ type: "SET_ZOOM", zoom: zoom * 1.25 })}>+</button>
        <button type="button" className={styles.tbtn} title="ซูมให้เห็นทั้งคลิปพอดีจอ"
          onClick={fitZoom}>พอดีจอ</button>
        <button type="button" title="ดูดเข้าจุดตัด/ขอบซับ/วินาทีเต็ม ตอนลาก"
          className={`${styles.tbtn} ${snapOn ? styles.tbtnOn : ""}`}
          onClick={() => dispatch({ type: "TOGGLE_SNAP" })}>
          ดูด{snapOn ? " ✓" : ""}
        </button>
        <span className={styles.timecode}>{fmtTime(t)} / {fmtTime(total)}</span>
      </div>

      <div className={styles.scroller} ref={scrollerRef}>
        <div className={styles.content} ref={contentRef} style={{ width: totalPx + 80 }}>

          {/* 1. ruler — คลิก/ลาก = SEEK (dispatch ระหว่างลากได้ ไม่เข้า undo) */}
          <div className={styles.ruler}
            onPointerDown={onSeekDown} onPointerMove={onDragMove}
            onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
            {ticks.map((k, idx) => (
              <span key={idx}
                className={`${styles.tick} ${k.isMajor ? styles.tickMajor : k.isSec ? styles.tickSec : styles.tickMinor}`}
                style={{ left: k.px }}>
                {k.isMajor && <em className={styles.tickLabel}>{rulerLabel(k.tm)}</em>}
              </span>
            ))}
          </div>

          {/* 2. แทร็กฉาก — บล็อกรูปย่อจากการเรนเดอร์รอบก่อน + จุดตัดลากได้ */}
          <div className={styles.sceneTrack}>
            {timing.map((sc, i) => {
              const fi = frameFor?.[i] ?? i
              const img = fi >= 0 ? assets.frames?.[fi] : null
              const sel = selected.kind === "scene" && selected.index === i
              return (
                <div key={i}
                  className={`${styles.scene} ${sel ? styles.sceneSel : ""}`}
                  style={{
                    left: sc.start * pps,
                    width: Math.max(2, (sc.end - sc.start) * pps),
                    ...(img ? { backgroundImage: `url(${img})` } : {}),
                  }}
                  onClick={() => {
                    dispatch({ type: "SELECT", kind: "scene", index: i })
                    dispatch({ type: "SEEK", t: sc.start })
                  }}>
                  {!img && <span className={styles.waiting}>รอเรนเดอร์</span>}
                  <span className={styles.sceneNum}>{i + 1}</span>
                </div>
              )
            })}
            {/* จุดตัด = ขอบซ้ายของฉาก i≥1 — แยกเป็น handle ทับขอบ จะได้กดโดนง่าย */}
            {timing.map((sc, i) => i === 0 ? null : (
              <div key={`cut${i}`} className={styles.cutHandle}
                style={{ left: sc.start * pps }}
                onPointerDown={(e) => onCutDown(e, i)}
                onPointerMove={onDragMove} onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                onClick={(e) => e.stopPropagation()} />
            ))}
          </div>

          {/* 3. แทร็กเสียง — เส้นจุดตัดทับ waveform ไว้เล็งให้ตัดลงช่องเงียบ */}
          <div className={styles.audioTrack}>
            {assets.voiceUrl && <WaveTrack url={assets.voiceUrl} widthPx={totalPx} height={42} />}
            {timing.slice(1).map((sc, k) => (
              <span key={k} className={styles.audioCut} style={{ left: sc.start * pps }} />
            ))}
          </div>

          {/* 4. แทร็กพาดหัว */}
          <div className={styles.headTrack}>
            {hlOn && (
              <div
                className={`${styles.headBlock} ${selected.kind === "headline" ? styles.headSel : ""}`}
                style={{ width: Math.max(24, (hl.seconds ?? 3) * pps) }}
                onClick={() => dispatch({ type: "SELECT", kind: "headline", index: null })}>
                {hl.text}
              </div>
            )}
          </div>

          {/* 5. แทร็กซับ — ชิปลากได้ทั้งใบ/ทีละขอบ · ตำแหน่งระหว่างลากคือ ghost */}
          <div className={styles.subTrack}>
            {subtitles.map((c, i) => {
              let s = c.start
              let en = c.end
              if (drag && drag.index === i) {
                if (drag.type === "sub-move") { s += drag.by; en += drag.by }
                else if (drag.type === "sub-edge") {
                  if (drag.edge === "start") s = drag.orig + drag.by
                  else en = drag.orig + drag.by
                }
              }
              const active = t >= c.start && t < c.end
              const sel = selected.kind === "sub" && selected.index === i
              const dragging = drag && drag.index === i && String(drag.type).startsWith("sub")
              return (
                <div key={i}
                  className={[
                    styles.chip,
                    active && styles.chipActive,
                    sel && styles.chipSel,
                    dragging && styles.chipDrag,
                  ].filter(Boolean).join(" ")}
                  style={{ left: s * pps, width: Math.max(14, (en - s) * pps) }}
                  onPointerDown={(e) => onChipDown(e, i)}
                  onPointerMove={onDragMove} onPointerUp={onDragEnd}
                  onPointerCancel={onDragEnd}>
                  {c.text}
                  <span className={`${styles.subEdge} ${styles.subEdgeL}`}
                    onPointerDown={(e) => onSubEdgeDown(e, i, "start")}
                    onPointerMove={onDragMove} onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd} />
                  <span className={`${styles.subEdge} ${styles.subEdgeR}`}
                    onPointerDown={(e) => onSubEdgeDown(e, i, "end")}
                    onPointerMove={onDragMove} onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd} />
                </div>
              )
            })}
          </div>

          {/* 6. แทร็กเพลง — จองที่ไว้ก่อน (sticky ให้ข้อความไม่หนีตอน scroll) */}
          <div className={styles.musicTrack}>
            <span className={styles.musicText}>ยังไม่มีเพลง — เลือกได้ในเวอร์ชันถัดไป</span>
          </div>

          {/* ghost จุดตัดระหว่างลาก + เส้นวาบเป้าดูด + tooltip เวลา */}
          {drag && drag.type === "cut" && (
            <span className={styles.ghostLine} style={{ left: (drag.orig + drag.by) * pps }} />
          )}
          {drag && drag.snapT != null && (
            <span className={styles.snapLine} style={{ left: drag.snapT * pps }} />
          )}
          {tipT != null && (
            <span className={styles.tip} style={{ left: tipT * pps }}>{fmtTime(tipT)}</span>
          )}

          {/* 8. playhead — เส้นทะลุทุกแทร็ก + หัวจับสามเหลี่ยมลาก seek ได้ */}
          <div className={styles.playhead} style={{ left: t * pps }}>
            <span className={styles.playHandle}
              onPointerDown={onPlayheadDown} onPointerMove={onDragMove}
              onPointerUp={onDragEnd} onPointerCancel={onDragEnd} />
          </div>

        </div>
      </div>
    </div>
  )
}
