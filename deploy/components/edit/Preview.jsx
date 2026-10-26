"use client"
// จอพรีวิวของห้องตัดต่อ — เล่นไทม์ไลน์ในเบราว์เซอร์ (ตำแหน่ง/ขนาดเดียวกับตอนเรนเดอร์ 1080×1920)
// ไม่ใช่ของจริงร้อยเปอร์เซ็นต์: เสียงพากย์/ซับ/เอฟเฟกต์เสียงเกิดตอนเรนเดอร์ — ซับบนจอนี้เป็นค่าประมาณจากความยาวบรรทัด
// ของทับที่เลือกอยู่ลากย้ายบนจอได้ (ส่งตำแหน่งออกไปครั้งเดียวตอนปล่อยเมาส์ — ไม่งั้นประวัติย้อนกลับเต็มด้วยการลากทีละพิกเซล)
import { useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause, SkipBack } from "lucide-react"
import { clipLen, LAYER_TH } from "../../lib/videoTimeline"
import { totals, fmt, estimateVoice } from "./timelineState"
import s from "./edit.module.css"

const W = 1080, H = 1920

// sku:XXX → URL รูปจริงจาก skus (ชั้นบนส่ง map มา) · โลโก้ในเทมเพลต → ไฟล์เดียวกันใน public/
export function srcOf(src, skuImg) {
  if (typeof src === "string" && src.startsWith("sku:")) return skuImg?.[src.slice(4)] || ""
  if (typeof src === "string" && src.startsWith("assets/brand/")) return "/logo-white.png"
  // รูปในเทมเพลตที่ตัวเขียนสตอรี่บอร์ดใช้ (26 ต.ค. 2026) — ไฟล์จริงอยู่ฝั่งเครื่องเรนเดอร์ หน้าเว็บใช้รูปย่อใน public/
  if (src === "assets/machine-hero.jpg") return "/machine/machine-hero.jpg"
  if (typeof src === "string" && /^assets\/branches\/[a-z0-9]+\.jpg$/.test(src)) return `/video-assets/branches/${src.slice(16)}`
  return src
}

function captionAt(script, t) {
  const lines = String(script || "").split("\n").map(x => x.trim()).filter(Boolean)
  let acc = 0
  for (const l of lines) {
    const d = l.length / 13 + 0.45
    if (t >= acc && t < acc + d) return l
    acc += d
  }
  return ""
}

export default function Preview({ tl, t, onTime, skuImg, playing, setPlaying, sel, onSelect, onOverlayMove }) {
  const wrap = useRef(null)
  const vid = useRef(null)
  const [scale, setScale] = useState(0.3)
  const tot = useMemo(() => totals(tl), [tl])
  const clock = useRef({ t0: 0, start: 0 })
  const [now, setNow] = useState(t)
  const [drag, setDrag] = useState(null)        // { id, x, y, px, py, ox, oy } ระหว่างลาก

  // ย่อเวที 1080×1920 ให้พอดีกล่อง
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setScale(Math.max(0.08, Math.min(r.width / W, r.height / H)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // หัวอ่านจากภายนอก (คลิกไทม์ไลน์) → ตามทันทีตอนหยุดอยู่
  useEffect(() => { if (!playing) setNow(t) }, [t, playing])

  // นาฬิกาตอนเล่น — ส่งเวลาออกไปให้ไทม์ไลน์ทุก ~0.1 วิ (ไม่ re-render ทั้งห้องทุกเฟรม)
  useEffect(() => {
    if (!playing) return
    clock.current = { t0: performance.now(), start: now >= tot.total - 0.05 ? 0 : now }
    let raf, last = 0
    const tick = (ts) => {
      const cur = clock.current.start + (ts - clock.current.t0) / 1000
      if (cur >= tot.total) { setNow(tot.total); onTime(tot.total); setPlaying(false); return }
      setNow(cur)
      if (ts - last > 100) { onTime(cur); last = ts }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  const idx = tot.starts.findIndex((st, k) => now >= st && now < st + clipLen(tl.clips[k]))
  const clip = idx >= 0 ? tl.clips[idx] : null
  const local = clip ? now - tot.starts[idx] : 0

  // วิดีโอ: ตั้งตำแหน่ง/ความเร็ว · ตอนเล่นปล่อยให้เล่นเอง แก้เมื่อคลาดเกิน 0.25 วิ
  useEffect(() => {
    const v = vid.current
    if (!v || !clip || clip.kind !== "video") return
    const want = clip.in + local * (clip.speed || 1)
    if (Math.abs(v.currentTime - want) > (playing ? 0.25 : 0.04)) {
      try { v.currentTime = want } catch { /* ยังโหลดไม่เสร็จ */ }
    }
    v.playbackRate = clip.speed || 1
    v.volume = Math.min(1, clip.volume ?? 1)
    v.muted = (clip.volume ?? 1) <= 0.001
    if (playing && v.paused) v.play().catch(() => {})
    if (!playing && !v.paused) v.pause()
  })

  // ── ลากของทับบนจอ ──
  const down = (e, o) => {
    e.stopPropagation()
    onSelect({ kind: "overlay", id: o.id })
    if (playing) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ id: o.id, x: o.x ?? 0.5, y: o.y ?? 0.5, px: e.clientX, py: e.clientY, ox: o.x ?? 0.5, oy: o.y ?? 0.5 })
  }
  const move = (e) => {
    if (!drag) return
    const x = Math.max(0, Math.min(1, drag.ox + (e.clientX - drag.px) / (W * scale)))
    const y = Math.max(0, Math.min(1, drag.oy + (e.clientY - drag.py) / (H * scale)))
    setDrag({ ...drag, x, y })
  }
  const up = () => {
    if (!drag) return
    if (Math.abs(drag.x - drag.ox) + Math.abs(drag.y - drag.oy) > 0.002) {
      onOverlayMove(drag.id, { x: +drag.x.toFixed(3), y: +drag.y.toFixed(3) })
    }
    setDrag(null)
  }

  // กล้อง — ค่าประมาณของท่าในเทมเพลตเรนเดอร์ (timeline.template.html) · ของจริงลื่นกว่านี้
  const P = clip ? Math.min(1, local / Math.max(0.1, clipLen(clip))) : 0
  const M = clip?.motion || (clip?.kind === "image" ? "zoomin" : "none")
  const cam = !clip ? { s: 1 } : M === "zoomin" ? { s: 1 + 0.08 * P } : M === "zoomout" ? { s: 1.08 - 0.08 * P }
    : M === "panleft" ? { s: 1.15, x: 46 - 92 * P } : M === "panright" ? { s: 1.15, x: -46 + 92 * P } : M === "rise" ? { s: 1.15, y: 70 - 140 * P }
    : M === "drift" ? { s: 1.06 + 0.07 * P, r: -1.4 + 2.8 * P, x: 22 - 44 * P } : M === "push" ? { s: 1 + 0.16 * Math.min(1, local / 0.7) + 0.06 * P }
    : M === "shake" ? { s: 1.06 + 0.04 * P, x: local < 0.3 ? Math.sin(local * 90) * 14 : 0 } : { s: 1 }
  const zoom = clip ? (clip.zoom || 1) * cam.s : 1
  const flash = clip && idx > 0 && ["flash", "ring", "bolt"].includes(clip.transition) && local < 0.3 ? 1 - local / 0.3 : 0
  const punch = clip && idx > 0 && clip.transition === "zoom" && local < 0.38 ? 0.14 * (1 - local / 0.38) : 0
  const whip = clip && idx > 0 && clip.transition === "whip" && local < 0.26 ? 760 * (1 - local / 0.26) : 0
  const mediaStyle = clip ? {
    objectFit: clip.fit || "cover",
    objectPosition: `${(clip.fx ?? 0.5) * 100}% ${(clip.fy ?? 0.5) * 100}%`,
  } : {}
  const cap = tl.voice?.script && tl.captions?.on !== false && now < estimateVoice(tl.voice.script) ? captionAt(tl.voice.script, now) : ""

  return (
    <div className={s.previewBox}>
      <div ref={wrap} className={s.stageWrap}>
        <div className={s.stageFrame} style={{ width: W * scale, height: H * scale }}>
          <div className={s.stage} style={{ width: W, height: H, transform: `scale(${scale})` }}
               onPointerMove={move} onPointerUp={up} onPointerCancel={up}
               onPointerDown={() => onSelect(null)}>
            <div className={s.stageBg} />
            {clip && (
              <div className={s.clipLayer} style={{ transform: `translate(${(cam.x || 0) + whip}px, ${cam.y || 0}px) rotate(${cam.r || 0}deg) scale(${zoom + punch})` }}>
                {clip.src.startsWith("gen:") ? (
                  // ฉากที่ AI ออกแบบ — ไฟล์จริงหาตอนทำคลิป (หรืออัปมาแทนที่แผงขวา)
                  <div className={s.genPh}>
                    <b>{clip.src === "gen:paint" ? "🎨 ภาพที่ AI ออกแบบ" : "🎞️ ฟุตเทจจริง"}</b>
                    <span>{clip.gen?.note || clip.gen?.query || ""}</span>
                    <small>หาไฟล์ตอนทำคลิป · หรืออัปไฟล์มาแทนที่แผงขวา</small>
                  </div>
                ) : <>
                  {clip.fit === "contain" && clip.kind === "image" && (
                    <img className={s.fill} src={srcOf(clip.src, skuImg)} alt="" />
                  )}
                  {clip.kind === "video"
                    ? <video ref={vid} key={clip.src} className={s.media} style={mediaStyle} src={clip.src} playsInline preload="auto" />
                    : <img className={s.media} style={mediaStyle} src={srcOf(clip.src, skuImg)} alt="" />}
                </>}
              </div>
            )}
            {clip?.layer && clip.layer !== "none" && <div className={s.fxBadge}>✦ {LAYER_TH[clip.layer]}</div>}
            {!tl.clips.length && <div className={s.stageEmpty}>เพิ่มคลิปหรือรูป<br />จากคลังด้านซ้าย</div>}
            {tl.overlays.map(o => {
              const end = o.end < 0 ? tot.total : o.end
              const isSel = sel?.kind === "overlay" && sel.id === o.id
              // ของที่เลือกอยู่โชว์ค้างไว้แม้หัวอ่านอยู่นอกช่วง — จะได้ลากจัดตำแหน่งได้โดยไม่ต้องเลื่อนหาเวลา
              if ((now < o.start || now >= end) && !(isSel && !playing)) return null
              // ท่าตอนโผล่เล่นเฉพาะตอนกดเล่น — หยุดอยู่ = โชว์เต็มตัว (ไม่งั้นหยุดตรงจุดเริ่มพอดีจะเห็นแค่เฟรมแรกที่จางหาย)
              // ของที่เลือกแต่อยู่นอกช่วงเวลา = จาง ๆ ให้รู้ว่าตอนนี้ยังไม่โผล่
              const k = Math.min(1, Math.max(0, (now - o.start) / 0.34))
              const inRange = now >= o.start && now < end
              const enter = !inRange ? { opacity: 0.45 }
                : !playing ? {}
                : o.anim === "pop" ? { transform: `scale(${0.55 + 0.45 * k})`, opacity: k }
                : o.anim === "slide" ? { transform: `translateY(${80 * (1 - k)}px)`, opacity: k }
                : o.anim === "fade" ? { opacity: Math.min(1, Math.max(0, (now - o.start) / 0.4)) } : {}
              const d = drag?.id === o.id ? drag : null
              const pos = { left: (d ? d.x : o.x ?? 0.5) * W, top: (d ? d.y : o.y ?? 0.5) * H }
              const cls = `${s.ov} ${isSel && !playing ? s.ovDrag : ""}`
              if (o.type === "text") {
                return (
                  <div key={o.id} className={`${cls} ${s.ovText} ${s["st_" + (o.style || "bold")]}`}
                       style={{ ...pos, fontSize: o.size || 90, "--c": o.color || "#fff" }}
                       onPointerDown={(e) => down(e, o)}>
                    <span className={s.ovIn} style={enter}>{o.text}</span>
                  </div>
                )
              }
              const w = (o.type === "logo" ? (o.w || 0.14) : (o.w || 0.45)) * W
              const src = o.type === "logo" ? "/logo-white.png" : srcOf(o.src, skuImg)
              return (
                <div key={o.id} className={cls} style={{ ...pos, width: w }} onPointerDown={(e) => down(e, o)}>
                  <img className={`${s.ovIn} ${s.ovPic}`} style={enter} src={src} alt="" draggable={false} />
                </div>
              )
            })}
            {flash > 0 && <div className={s.flash} style={{ opacity: flash * 0.85 }} />}
            {cap && <div className={s.cap}><span>{cap}</span></div>}
          </div>
        </div>
      </div>
      <div className={s.transport}>
        <button className={s.iconBtn} title="กลับไปต้นคลิป (Home)" onClick={() => { setPlaying(false); setNow(0); onTime(0) }}>
          <SkipBack size={16} />
        </button>
        <button className={`${s.iconBtn} ${s.play}`} title="เล่น/หยุด (Space)" onClick={() => setPlaying(!playing)}
                disabled={!tl.clips.length}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <span className={s.timecode}>{fmt(now)} / {fmt(tot.total)}</span>
        {tot.voice > tot.clipsTotal + 0.3 && tl.clips.length > 0 && (
          <span className={s.warnChip} title="เสียงพากย์ยาวกว่าคลิป — ท้ายคลิปจะเป็นพื้นกรมท่า">
            เสียงพากย์ยาวกว่าภาพ {(tot.voice - tot.clipsTotal).toFixed(1)} วิ
          </span>
        )}
      </div>
      <p className={s.previewNote}>พรีวิวยังไม่มีเสียงพากย์/เพลง · ซับเป็นค่าประมาณ — ของจริงได้ตอนกด "สร้างคลิป"</p>
    </div>
  )
}
