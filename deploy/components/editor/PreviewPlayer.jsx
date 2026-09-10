"use client"
// PreviewPlayer — เวทีพรีวิว 9:16 ประกอบสดจาก frames + voice.wav + ซับ HTML
//
// หัวใจของห้องตัดต่อทั้งห้อง: พรีวิวไม่ใช่ mp4 — <audio> เสียงพากย์คือนาฬิกาหลัก
// หนึ่งเดียว ภาพ/ซับ/พาดหัว "ตาม" เวลาเสียงทุกเฟรม การแก้ทุกอย่างจึงเห็นผลทันที
// โดยไม่ต้องเรนเดอร์ · mp4 ที่เบิร์นซับแล้วมีไว้ดูในโหมด "ผลจริงล่าสุด" เท่านั้น
// (เอาซับ HTML ไปซ้อนบน mp4 จะเห็นซับสองชั้น — CONTRACT.md ห้ามไว้)

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styles from "./PreviewPlayer.module.css"
import {
  clamp, fmtTime, sceneAt, subAt, totalOf,
  effectiveMotion, effectiveTransition, PAN_MIN_ZOOM,
} from "./editorStore"

// ── ค่าที่ต้องสะท้อนฝั่งเรนเดอร์จริงแบบเป๊ะ ๆ ──
// ที่มา: agents/video/subtitle.py (STYLES, stroke 9px, padding 84, headline H*0.52)
// และ compose.py (โลโก้ pad 28) — แก้ฝั่งโน้นเมื่อไหร่ต้องแก้ที่นี่ด้วย
// ไม่งั้นพรีวิวจะโกหกตาแล้วคนตัดจะเลื่อนซับหนีปัญหาที่ไม่มีจริง
const FRAME_W = 1080
const FRAME_H = 1920
const STROKE_W = 9                                // ความหนาขอบตัวอักษรบนเฟรม 1080
const PAD_X = 84                                  // padding ซ้าย-ขวาของแถวซับ
const LOGO_PAD = 28                               // ระยะโลโก้จากขอบจอ
const HEAD_BOTTOM = Math.round(FRAME_H * 0.52)    // จุดวางพาดหัว (ตรง render_headline)
const PAL = {
  brand: { fill: "#ffffff", stroke: "#0a1a3a", accent: "#3ddcff" },
  plain: { fill: "#ffffff", stroke: "#000000", accent: "#ffffff" },
  punch: { fill: "#ffe14d", stroke: "#101010", accent: "#3ddcff" },
}

// *คำ* → <em> สีเน้น — regex เดียวกับ _EM ใน subtitle.py
// แตกเป็น React element ตรง ๆ ไม่ใช้ innerHTML จะได้ไม่ต้องกังวลเรื่อง escape เลย
function emphasize(text) {
  const parts = String(text ?? "").split(/\*(.+?)\*/g)
  return parts.map((p, i) => (i % 2 ? <em key={i}>{p}</em> : p))
}

// transform ของแต่ละท่ากล้อง ณ สัดส่วนเวลา p (0-1) ในฉาก — กระจกของ
// _motion_exprs ใน compose.py: ทิศทางและระยะต้องตรงกัน ไม่งั้นพรีวิวโกหกตา
// elapsed (วินาทีในฉาก) ใช้เฉพาะ punch ที่พุ่งตามเวลาจริงไม่ใช่สัดส่วน
function motionTransform(motion, zoom, p, elapsed) {
  if (!zoom || zoom <= 0) return "scale(1)"          // สวิตช์ "ภาพนิ่ง" ชนะทุกท่า
  const k = 1 + Math.max(zoom, PAN_MIN_ZOOM)          // ซูมค้างของท่าแพน/ไต่
  const t = (50 * (k - 1)) / k                        // % เลื่อนสูงสุดโดยขอบภาพยังไม่โผล่
  switch (motion) {
    case "still":                                     // ฉากกราฟิก — เฟรมนิ่งไม่ต้องขยับ
      return "scale(1)"
    case "zoom-out":
      return `scale(${(1 + zoom * (1 - p)).toFixed(4)})`
    case "punch": {
      const q = Math.min(1, Math.max(0, elapsed) / 0.35)
      return `scale(${(1 + zoom * q).toFixed(4)})`
    }
    case "pan-lr":
      return `scale(${k.toFixed(4)}) translateX(${(t * (1 - 2 * p)).toFixed(3)}%)`
    case "pan-rl":
      return `scale(${k.toFixed(4)}) translateX(${(t * (2 * p - 1)).toFixed(3)}%)`
    case "drift-down":
      return `scale(${k.toFixed(4)}) translateY(${(t * (1 - 2 * p)).toFixed(3)}%)`
    case "drift-up":
      return `scale(${k.toFixed(4)}) translateY(${(t * (2 * p - 1)).toFixed(3)}%)`
    default:                                          // zoom-in — ท่าพื้นฐาน
      return `scale(${(1 + zoom * p).toFixed(4)})`
  }
}

// ขอบตัวอักษรด้วย text-shadow รอบทิศแทน -webkit-text-stroke —
// stroke ของบางเบราว์เซอร์กินไส้สระ/วรรณยุกต์ไทยจนตัวลีบ (จอพรีวิวเล็กยิ่งเห็นชัด)
// เฉียง 4 ทิศถอยระยะเข้ามาหน่อยให้ขอบดูกลม ไม่เป็นเหลี่ยมตอนตัวหนังสือหนา
function strokeShadow(color, w, k) {
  const o = Math.max(1, w)
  const d = Math.max(1, w * 0.7)
  return [
    `${o}px 0 0 ${color}`, `-${o}px 0 0 ${color}`,
    `0 ${o}px 0 ${color}`, `0 -${o}px 0 ${color}`,
    `${d}px ${d}px 0 ${color}`, `-${d}px ${d}px 0 ${color}`,
    `${d}px -${d}px 0 ${color}`, `-${d}px -${d}px 0 ${color}`,
    `0 ${6 * k}px ${18 * k}px rgba(0,0,0,.55)`,   // เงานุ่มชั้นนอก — ตรง template
  ].join(", ")
}

export default function PreviewPlayer({ state, dispatch, api }) {   // eslint-disable-line no-unused-vars
  const audioRef = useRef(null)
  const areaRef = useRef(null)       // พื้นที่รอบเวที — ไว้คำนวณขนาดเวทีที่ใหญ่สุดแต่ยัง 9:16
  const frontImgRef = useRef(null)   // รูปฉากปัจจุบัน — rAF จับ transform ตรง ๆ ไม่ผ่าน state

  // rAF loop อ่านค่าจาก ref เสมอ — ปิดปัญหา closure เก่าโดยไม่ต้อง restart loop ทุก render
  const stateRef = useRef(state)
  stateRef.current = state

  const [mode, setMode] = useState("live")            // "live" = ประกอบสด · "final" = mp4 รอบล่าสุด
  const [stageW, setStageW] = useState(0)             // ความกว้างเวทีจริง (px) — ฐานของทุกสัดส่วน
  const [scn, setScn] = useState({ cur: 0, prev: -1 })
  const [subIdx, setSubIdx] = useState(-1)
  const [headOn, setHeadOn] = useState(true)
  const scnRef = useRef(scn)
  const subRef = useRef(subIdx)
  const headRef = useRef(headOn)

  // พาดหัวที่มีผลจริง — ตรรกะเดียวกับ make_video.py: edit มีคีย์ text เมื่อไหร่
  // ให้เชื่อ edit ทันที (แม้ text ว่าง = ตั้งใจลบ) ไม่มีคีย์ค่อยถอยไปใช้ของ plan
  const headline = useMemo(() => {
    const he = state.edit?.headline
    const text = he && "text" in he ? he.text : state.plan?.headline
    if (!text || !String(text).trim()) return null
    return {
      text,
      seconds: Number(he?.seconds ?? state.plan?.headline_seconds ?? 3.0),
      size: Number(he?.size ?? 86),
    }
  }, [state.edit?.headline, state.plan])
  const headSecsRef = useRef(0)
  headSecsRef.current = headline ? headline.seconds : 0

  // สไตล์ซับที่มีผลจริง — edit.sub_style ทับ plan.style (ลำดับเดียวกับ make_video.py)
  const subStyle = useMemo(() => {
    const ss = state.edit?.sub_style || {}
    return {
      style: ss.style || state.plan?.style || "brand",
      size: Number(ss.size ?? 64),
      bottom: Number(ss.bottom ?? 430),
    }
  }, [state.edit?.sub_style, state.plan])

  // ── วาดหนึ่งเฟรม ณ เวลา t — ใช้ทั้งตอนเล่น (จาก audio) และตอนหยุด (จาก ui.t) ──
  const paint = useCallback((t) => {
    const s = stateRef.current
    const i = sceneAt(s.timing, t)
    if (i !== scnRef.current.cur) {
      scnRef.current = { cur: i, prev: scnRef.current.cur }
      setScn(scnRef.current)
    }
    // กล้องเคลื่อนสด: ท่าตาม effectiveMotion (คนเลือกชนะ auto) ตามสัดส่วนเวลาในฉาก
    const sc = s.timing[i]
    const el = frontImgRef.current
    if (el && sc) {
      const zoom = s.edit?.scenes?.[String(i)]?.zoom ?? 0.08
      const p = clamp((t - sc.start) / Math.max(0.001, sc.end - sc.start), 0, 1)
      el.style.transform = motionTransform(effectiveMotion(s, i), zoom, p, t - sc.start)
    }
    const si = subAt(s.subtitles, t)
    if (si !== subRef.current) { subRef.current = si; setSubIdx(si) }
    const on = t < headSecsRef.current
    if (on !== headRef.current) { headRef.current = on; setHeadOn(on) }
  }, [])

  // playing เปลี่ยน → คุมเครื่องเสียง (autoplay policy อาจปฏิเสธ — เงียบไว้ตามสัญญา)
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (state.ui.playing && mode === "live") a.play().catch(() => {})
    else a.pause()
  }, [state.ui.playing, mode])

  // ui.t เปลี่ยนจากภายนอก (คลิก timeline/การ์ด) → เซ็ต currentTime
  // เกณฑ์ 0.25 วิกันลูปสะท้อน: SEEK ที่เราส่งเองตอนเล่นจะต่างไม่ถึงนี้ เลยไม่เด้งกลับ
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (Math.abs(a.currentTime - state.ui.t) > 0.25) a.currentTime = state.ui.t
  }, [state.ui.t])

  // ── ลูปตอนเล่น: วาดจาก audio.currentTime ทุกเฟรม (แม่นระดับเฟรม)
  //    แต่ dispatch SEEK แบบหยาบ ≥100ms พอ — แค่ให้ playhead บน timeline ไหลตาม ──
  useEffect(() => {
    if (!state.ui.playing || mode !== "live") return
    let raf = 0
    let lastSent = 0
    const loop = () => {
      const a = audioRef.current
      if (a) {
        paint(a.currentTime)
        const now = performance.now()
        if (now - lastSent >= 100) {
          lastSent = now
          dispatch({ type: "SEEK", t: a.currentTime })
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      // จูนตำแหน่งสุดท้ายให้ตรงเป๊ะตอนหยุด — ไม่งั้น playhead ค้างหลังเสียงไว้ ~0.1 วิ
      const a = audioRef.current
      if (a) dispatch({ type: "SEEK", t: a.currentTime })
    }
  }, [state.ui.playing, mode, paint, dispatch])

  // ── ตอนหยุด: วาดจาก ui.t หลังทุก render — การแก้ซับ/ตัดฉาก/สลับภาพจะสะท้อนทันที
  //    (paint เช็คก่อน set เสมอ เลยไม่วนลูป — เรียกซ้ำค่าเดิมคือ no-op) ──
  useEffect(() => {
    if (state.ui.playing || mode !== "live") return
    paint(state.ui.t)
  })

  // ── ขนาดเวที: กว้างสุดที่ยังคง 9:16 ในพื้นที่ว่าง (สูงจาก aspect-ratio ใน css) ──
  useEffect(() => {
    if (mode !== "live") return
    const el = areaRef.current
    if (!el) return
    const fit = () => {
      const w = Math.floor(Math.min(el.clientWidth, (el.clientHeight * FRAME_W) / FRAME_H))
      setStageW(Math.max(0, w))
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    fit()
    return () => ro.disconnect()
  }, [mode])

  const togglePlay = () => dispatch({ type: state.ui.playing ? "PAUSE" : "PLAY" })
  const seekBy = (by) => dispatch({ type: "SEEK", t: state.ui.t + by })  // reducer clamp ให้เอง
  const gotoMode = (m) => {
    if (m === "final") {
      if (!state.assets.videoUrl) return
      if (state.ui.playing) dispatch({ type: "PAUSE" })   // หยุดเวทีสดก่อน ไม่ให้เสียงชนกับ mp4
    }
    setMode(m)
  }

  // ── ค่าที่ใช้วาด ──
  const total = totalOf(state.timing)
  const k = stageW / FRAME_W                       // ตัวคูณ px จริง ← px บนเฟรม 1080
  const pal = PAL[subStyle.style] || PAL.brand
  const textStyle = {
    color: pal.fill,
    textShadow: strokeShadow(pal.stroke, STROKE_W * k, k),
    "--accent": pal.accent,
  }
  const { cur, prev } = scn
  const sub = subIdx >= 0 ? state.subtitles[subIdx] || null : null
  const pendingOf = (i) => state.frameFor?.[i] === -1  // -1 = ภาพใหม่ที่ยังไม่เรนเดอร์ — เฟรมเก่าโกหก ห้ามโชว์
  const frameOf = (i) => {
    const fi = state.frameFor?.[i]
    return fi != null && fi >= 0 ? state.assets.frames?.[fi] || null : null
  }
  const prevZoom = state.edit?.scenes?.[String(prev)]?.zoom ?? 0.08
  // ชั้นหลังตรึงที่ท่าจบของฉากก่อนหน้า (p=1) — ไม่งั้นภาพเด้งกลับจุดเริ่มตอนโดนเฟดทับ
  const prevFreeze = prev >= 0
    ? motionTransform(effectiveMotion(state, prev), prevZoom, 1, 9) : null
  // ทรานสิชันเข้าฉากปัจจุบัน — คลาส CSS ตามชื่อ ไม่รู้จักตกกลับเป็น fade
  const trClass = styles["tr_" + effectiveTransition(state, cur)] || styles.layerFade
  const lg = state.edit?.logo
  const lgPad = LOGO_PAD * k
  const lgPos = {
    tl: { top: lgPad, left: lgPad },
    tr: { top: lgPad, right: lgPad },
    bl: { bottom: lgPad, left: lgPad },
    br: { bottom: lgPad, right: lgPad },
  }[lg?.pos || "tr"] || { top: lgPad, right: lgPad }

  return (
    <div className={styles.wrap}>
      {/* เสียงพากย์ — นาฬิกาหลักหนึ่งเดียวของพรีวิว */}
      <audio
        ref={audioRef}
        src={state.assets.voiceUrl || undefined}
        preload="auto"
        onEnded={() => { dispatch({ type: "PAUSE" }); dispatch({ type: "SEEK", t: 0 }) }}
      />

      {mode === "live" ? (
        <div ref={areaRef} className={styles.stageArea}>
          <div className={styles.stage} style={stageW ? { width: stageW } : undefined}>

            {/* ชั้นหลัง: ภาพฉากก่อนหน้า ค้างไว้ให้ชั้นหน้าเฟดทับ (crossfade ~0.3 วิ)
                ตรึง scale ปลายทางของมันไว้ ไม่งั้นภาพจะกระตุกเด้งกลับ 1 ตอนโดนเฟดทับ */}
            {prev >= 0 && prev !== cur && (
              <div className={styles.layer}>
                {pendingOf(prev) ? (
                  <div className={styles.pending}><span>ภาพใหม่ — รอเรนเดอร์</span></div>
                ) : frameOf(prev) ? (
                  <img
                    className={styles.frame}
                    src={frameOf(prev)}
                    alt=""
                    draggable={false}
                    style={{ transform: prevFreeze }}
                  />
                ) : null}
              </div>
            )}

            {/* ชั้นหน้า: ฉากปัจจุบัน — key ตาม index เพื่อให้ทรานสิชันเริ่มใหม่ทุกครั้งที่เปลี่ยนฉาก */}
            <div key={`sc${cur}`} className={prev >= 0 ? `${styles.layer} ${trClass}` : styles.layer}>
              {pendingOf(cur) ? (
                <div className={styles.pending}><span>ภาพใหม่ — รอเรนเดอร์</span></div>
              ) : frameOf(cur) ? (
                <img
                  ref={frontImgRef}
                  className={styles.frame}
                  src={frameOf(cur)}
                  alt=""
                  draggable={false}
                />
              ) : null}
            </div>

            {/* พาดหัวช่วงต้นคลิป — สไตล์เดียวกับซับแต่ตัวใหญ่กว่า วางกลางค่อนบน */}
            {headline && headOn && k > 0 && (
              <div
                className={`${styles.headWrap} ${styles.popIn}`}
                style={{ bottom: `${(HEAD_BOTTOM / FRAME_H) * 100}%`, padding: `0 ${PAD_X * k}px`,
                         "--pop": `${(24 * k).toFixed(1)}px` }}
              >
                <div className={styles.subText} style={{ ...textStyle, fontSize: headline.size * k }}>
                  {emphasize(headline.text)}
                </div>
              </div>
            )}

            {/* ซับ HTML สด — ตำแหน่ง/ขนาดเทียบสัดส่วนเฟรม 1080×1920 เสมอ */}
            {sub && k > 0 && (
              <div
                key={`sub${subIdx}`}
                className={`${styles.subWrap} ${styles.popIn}`}
                style={{ bottom: `${(subStyle.bottom / FRAME_H) * 100}%`, padding: `0 ${PAD_X * k}px`,
                         "--pop": `${(16 * k).toFixed(1)}px` }}
              >
                <div className={styles.subText} style={{ ...textStyle, fontSize: subStyle.size * k }}>
                  {emphasize(sub.text)}
                </div>
              </div>
            )}

            {/* โลโก้ — มุมและระยะขอบตรงกับ overlay ของ compose.py */}
            {lg?.file && k > 0 && (
              <img
                className={styles.logo}
                src={`/api/video/local/asset?name=${encodeURIComponent(state.project)}&file=${encodeURIComponent(lg.file)}`}
                alt=""
                draggable={false}
                style={{ ...lgPos, width: (lg.size ?? 140) * k, opacity: lg.opacity ?? 0.9 }}
              />
            )}

            {/* เส้นประ safe area — โซนที่ UI ของ TikTok บังจริง */}
            {state.ui.safeArea && (
              <div className={styles.safe}>
                <div className={styles.safeTop}><span>บน 8% — ชื่อคลิป/สถานะ</span></div>
                <div className={styles.safeRight}><span>ขวา 12% — ปุ่ม TikTok</span></div>
                <div className={styles.safeBottom}><span>ล่าง 18% — แคปชัน/UI</span></div>
              </div>
            )}

            {/* ปุ่มเล่นโปร่งกลางจอ — หายตอนเล่น แต่ทั้งเวทียังคลิกเพื่อหยุดได้ */}
            <button
              type="button"
              className={styles.playOverlay}
              onClick={togglePlay}
              aria-label={state.ui.playing ? "หยุดชั่วคราว" : "เล่น"}
            >
              {!state.ui.playing && <span className={styles.playGlyph}>▶</span>}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.stageArea}>
          {/* ผลจริงล่าสุด: mp4 ที่เบิร์นซับแล้ว — ห้ามซ้อนซับ HTML ทับ (จะเห็นสองชั้น) */}
          <video className={styles.finalVideo} controls src={state.assets.videoUrl || undefined} />
        </div>
      )}

      {/* แถบควบคุมล่าง */}
      <div className={styles.bar}>
        <span className={styles.time}>{fmtTime(state.ui.t)} / {fmtTime(total)}</span>
        <div className={styles.nudges}>
          <button type="button" className="dx-btn dx-btn-ghost" onClick={() => seekBy(-1)} disabled={mode !== "live"}>-1วิ</button>
          <button type="button" className="dx-btn dx-btn-ghost" onClick={() => seekBy(1)} disabled={mode !== "live"}>+1วิ</button>
        </div>
        <div className={styles.modeSwitch}>
          <button
            type="button"
            className={mode === "live" ? `${styles.modeBtn} ${styles.modeOn}` : styles.modeBtn}
            onClick={() => gotoMode("live")}
            title="ประกอบสดจากภาพ+เสียง — แก้แล้วเห็นทันที"
          >🎬 สด</button>
          <button
            type="button"
            className={mode === "final" ? `${styles.modeBtn} ${styles.modeOn}` : styles.modeBtn}
            disabled={!state.assets.videoUrl}
            title={state.assets.videoUrl
              ? "mp4 ที่เบิร์นซับแล้วจากการเรนเดอร์รอบล่าสุด"
              : "ยังไม่มีไฟล์ mp4 — กดเรนเดอร์ก่อนถึงจะดูผลจริงได้"}
            onClick={() => gotoMode("final")}
          >📼 ผลจริงล่าสุด</button>
        </div>
      </div>
    </div>
  )
}
