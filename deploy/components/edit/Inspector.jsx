"use client"
// แผงตั้งค่าด้านขวา — เปลี่ยนตามของที่เลือก (คลิป · รูป · ตัวหนังสือ · ภาพทับ · โลโก้ · เสียงพากย์ · เพลง)
// ไม่ได้เลือกอะไร = ตั้งค่าทั้งงาน + คีย์ลัด
// ทุกช่องส่ง coalesce มากับ action → ลากแถบเลื่อน/พิมพ์ต่อเนื่อง = ย้อนกลับขั้นเดียว
import { useState } from "react"
import { Film, Image as ImageIcon, Type, Layers, Mic, Music, Trash2, Copy, Settings2, Upload, Check, Loader2, Sparkles } from "lucide-react"
import {
  clipLen, TEXT_STYLES, ANIMS, TRANSITIONS, MOTIONS, LAYERS, TINTS, VOICES, TTS_MODELS, LIMITS,
  LAYER_TH, MOTION_TH, CUT_TH as TRANS_TH, ANIM_TH, TINT_TH, PAINT_THB, promptKit,
} from "../../lib/videoTimeline"
import { probeSeconds } from "./Library"
import { selected, estimateVoice, totals, fmt } from "./timelineState"
import s from "./edit.module.css"

const STYLE_TH = { bold: "ขาวหนา", gold: "ทอง", neon: "นีออน", box: "กล่อง" }
// ท่าที่ใช้ได้เฉพาะตัวหนังสือ / เฉพาะภาพทับ (26 ต.ค. 2026)
const TEXT_ANIMS = ANIMS.filter(a => !["slam", "spin", "tilt"].includes(a))
const IMG_ANIMS = ANIMS.filter(a => !["punch", "type", "words"].includes(a))
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const VOICE_TH = { Puck: "Puck · ชายสดใส", Kore: "Kore · หญิงหนักแน่น", Aoede: "Aoede · หญิงนุ่ม", Charon: "Charon · ชายทุ้ม" }
const MODEL_TH = { "gemini-2.5-flash-preview-tts": "2.5 (รุ่นเก่า · ปิดบริการ 17 พ.ย.)", "gemini-3.8-flash-tts": "3.8 (ค่าเริ่มต้น)" }
const COLORS = ["#ffffff", "#3ddcff", "#ffc24a", "#ff5277", "#3ee08f"]

function Chips({ value, options, labels, onPick }) {
  return (
    <div className={s.chips}>
      {options.map(o => (
        <button key={o} className={`${s.chip} ${value === o ? s.chipOn : ""}`} onClick={() => onPick(o)}>{labels?.[o] ?? o}</button>
      ))}
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, show }) {
  return (
    <div className={s.field}>
      <span className={s.lab}>{label}<b>{show ? show(value) : value}</b></span>
      <input className={s.range} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function Num({ label, value, min, max, step = 0.1, onChange }) {
  return (
    <div className={s.field}>
      <label>{label}</label>
      <input className={s.input} type="number" min={min} max={max} step={step} value={+Number(value).toFixed(2)}
             onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v))) }} />
    </div>
  )
}

// ฉากที่ AI ออกแบบ — คัดลอกพร้อมต์ไปทำกับ AI ฟรีตัวอื่น แล้วอัปไฟล์กลับมาแทน (26 ต.ค. 2026)
function GenKit({ clip, api, dispatch }) {
  const [busy, setBusy] = useState("")
  const [err, setErr] = useState("")
  const [done, setDone] = useState("")
  const [show, setShow] = useState("")
  const kit = promptKit(clip.gen)
  if (!kit) return null
  const pending = clip.src.startsWith("gen:")
  const copy = async (k) => {
    try { await navigator.clipboard.writeText(kit[k]); setDone(k); setTimeout(() => setDone(""), 1800) } catch { setShow(k) }
  }
  const replace = async (file) => {
    setErr(""); setBusy("อัปโหลด…")
    try {
      const isVideo = (file.type || "").startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name)
      let seconds = null
      if (isVideo) { const u = URL.createObjectURL(file); seconds = await probeSeconds(u); URL.revokeObjectURL(u) }
      const tk = await api("assets", { method: "POST", body: JSON.stringify({ name: file.name, type: file.type, size: file.size }) })
      const put = await fetch(tk.upload_url, { method: "PUT", body: file, headers: { "Content-Type": tk.content_type || file.type } })
      if (!put.ok) throw new Error(`อัปโหลดไม่ผ่าน (${put.status})`)
      const need = clipLen(clip)
      const patch = tk.kind === "video"
        ? { kind: "video", src: tk.url, in: 0, out: +Math.max(0.5, Math.min(seconds || need, need)).toFixed(2), speed: 1, volume: 0, fit: "cover", name: file.name,
            ...(seconds ? { seconds: +seconds.toFixed(2) } : {}) }
        : { kind: "image", src: tk.url, dur: need, fit: "cover", name: file.name }
      dispatch({ type: "REPLACE_MEDIA", id: clip.id, patch })
    } catch (e) { setErr(e.message || String(e)) } finally { setBusy("") }
  }
  return (
    <div className={s.field}>
      <span className={s.lab}><Sparkles size={13} /> ฉากที่ AI ออกแบบ</span>
      <p className={s.hint}>
        {pending ? (clip.src === "gen:paint" ? `ตอนทำคลิป: ใช้ภาพในคลังที่ตรงเรื่อง ไม่มีค่อยวาดใหม่ (~${PAINT_THB} บาท)` : "ตอนทำคลิป: หาฟุตเทจจริงฟรี")
          : "ใช้ไฟล์ที่อัปมาแล้ว"}{kit.note ? ` — ${kit.note}` : ""}
      </p>
      <div className={s.row2}>
        <button className={s.btn} onClick={() => copy("image")}>{done === "image" ? <Check size={14} /> : <ImageIcon size={14} />} {done === "image" ? "คัดลอกแล้ว" : "พร้อมต์ภาพ"}</button>
        <button className={s.btn} onClick={() => copy("video")}>{done === "video" ? <Check size={14} /> : <Film size={14} />} {done === "video" ? "คัดลอกแล้ว" : "พร้อมต์วิดีโอ"}</button>
      </div>
      {show && <textarea className={s.input} style={{ minHeight: 120, fontSize: 12 }} readOnly value={kit[show]} onFocus={e => e.target.select()} />}
      <label className={s.btn} style={{ cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
        {busy ? <Loader2 size={14} /> : <Upload size={14} />} {busy || (pending ? "อัปภาพ/วิดีโอมาแทน" : "เปลี่ยนไฟล์")}
        <input type="file" hidden disabled={!!busy} accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov,.m4v"
               onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) replace(f) }} />
      </label>
      {err && <p className={s.hint} style={{ color: "#ff8080" }}>{err}</p>}
      <p className={s.hint}>เอาพร้อมต์ไปทำกับ Gemini · Google Flow · Meta AI · Kling ได้ฟรี แล้วอัปไฟล์กลับมาที่นี่</p>
    </div>
  )
}

export default function Inspector({ state, dispatch, api }) {
  const sel = state.sel
  const item = selected(state)
  const tot = totals(state.tl)
  const at = () => Date.now()
  const upClip = (patch, key) => dispatch({ type: "UPDATE_CLIP", id: item.id, patch, coalesce: `c:${item.id}:${key}`, at: at() })
  const upOv = (patch, key) => dispatch({ type: "UPDATE_OVERLAY", id: item.id, patch, coalesce: `o:${item.id}:${key}`, at: at() })
  const actions = (
    <div className={s.inspActions}>
      {sel?.kind !== "voice" && sel?.kind !== "music" && (
        <button className={s.btn} onClick={() => dispatch({ type: "DUPLICATE" })}><Copy size={14} /> ทำสำเนา</button>
      )}
      <button className={`${s.btn} ${s.btnDanger}`} onClick={() => dispatch({ type: "DELETE" })}><Trash2 size={14} /> ลบ</button>
    </div>
  )

  // ── ไม่ได้เลือก: ภาพรวมงาน ──
  if (!sel || !item) {
    return (
      <div className={s.insp}>
        <div className={s.inspHead}><Settings2 size={16} /> ภาพรวมงาน</div>
        <div className={s.note}>
          ความยาว <b>{fmt(tot.total)}</b> · ภาพ {state.tl.clips.length} ชิ้น · ของทับ {state.tl.overlays.length} ชิ้น
          {tot.total > LIMITS.seconds && <><br /><b style={{ color: "#ff4d6d" }}>ยาวเกิน {LIMITS.seconds} วิ — ตัดให้สั้นลงก่อนสร้างคลิป</b></>}
        </div>
        <label className={s.check}>
          <input type="checkbox" checked={state.tl.captions?.on !== false}
                 onChange={(e) => dispatch({ type: "SET_FLAG", key: "captions", value: { on: e.target.checked } })} />
          ซับไทยจากเสียงพากย์
        </label>
        <label className={s.check}>
          <input type="checkbox" checked={state.tl.sfx !== false}
                 onChange={(e) => dispatch({ type: "SET_FLAG", key: "sfx", value: e.target.checked })} />
          เสียงเอฟเฟกต์ตอนตัดภาพ/ตัวหนังสือโผล่
        </label>
        <div className={s.secTitle}>วิธีใช้เร็ว ๆ</div>
        <div className={s.note}>
          1. อัปโหลดคลิป/รูป หรือเลือกซองจากคลังซ้าย<br />
          2. ลากเรียงบนไทม์ไลน์ · ลากขอบคลิปเพื่อตัดหัวท้าย<br />
          3. ใส่ตัวหนังสือ · ลากตัวหนังสือบนจอเพื่อย้ายตำแหน่ง<br />
          4. เพิ่มเสียงพากย์ (พิมพ์บท) · ซับขึ้นเอง<br />
          5. กด <b>สร้างคลิป</b> — รอ 3–6 นาที ได้ไฟล์ MP4 พร้อมโพสต์
        </div>
        <div className={s.secTitle}>คีย์ลัด</div>
        <div className={s.keys}>
          <kbd>Space</kbd><span>เล่น / หยุด</span>
          <kbd>S</kbd><span>ตัดคลิปที่หัวอ่าน</span>
          <kbd>T</kbd><span>ใส่ตัวหนังสือ</span>
          <kbd>Delete</kbd><span>ลบของที่เลือก</span>
          <kbd>Ctrl+D</kbd><span>ทำสำเนา</span>
          <kbd>Ctrl+Z</kbd><span>ย้อนกลับ (Ctrl+Shift+Z ทำซ้ำ)</span>
          <kbd>← →</kbd><span>เลื่อนหัวอ่าน 0.1 วิ (Shift = 1 วิ)</span>
          <kbd>Ctrl+S</kbd><span>บันทึกร่าง</span>
        </div>
      </div>
    )
  }

  // ── คลิปวิดีโอ / รูปในแทร็กหลัก ──
  if (sel.kind === "clip") {
    const c = item
    const isVid = c.kind === "video"
    const max = c.seconds > 0 ? c.seconds : Math.max(c.out + 30, 60)
    const idx = state.tl.clips.findIndex(x => x.id === c.id)
    return (
      <div className={s.insp}>
        <div className={s.inspHead}>{isVid ? <Film size={16} /> : <ImageIcon size={16} />}{isVid ? "คลิปวิดีโอ" : c.kind === "hero" ? "ฉากเปิดตัวซอง" : "รูป"}<small>{c.kind === "hero" ? c.src.slice(5) : c.name}</small></div>
        {c.kind === "hero" && <p className={s.hint}>ซองพุ่งหมุน 3 มิติ → แสงโครเมียมกวาด → สั่นสะสมพลัง → ระเบิดแสง → การ์ดเรืองแสงกางพัด · จังหวะยืดหดตามความยาวฉาก (เหมาะ 3–5 วิ)</p>}
        <div className={s.note}>ยาวบนไทม์ไลน์ <b>{clipLen(c).toFixed(1)} วิ</b>{isVid && c.seconds > 0 && <> · ไฟล์จริง {c.seconds.toFixed(1)} วิ</>}</div>
        {isVid ? (
          <>
            <div className={s.row2}>
              <Num label="เริ่มที่ (วิ ในไฟล์)" value={c.in} min={0} max={c.out - 0.2} onChange={(v) => upClip({ in: v }, "in")} />
              <Num label="จบที่ (วิ ในไฟล์)" value={c.out} min={c.in + 0.2} max={max} onChange={(v) => upClip({ out: v }, "out")} />
            </div>
            <div className={s.field}>
              <span className={s.lab}>ความเร็ว</span>
              <Chips value={c.speed || 1} options={SPEEDS} labels={Object.fromEntries(SPEEDS.map(x => [x, `${x}x`]))} onPick={(v) => upClip({ speed: v }, "speed")} />
            </div>
            <Slider label="เสียงจากคลิป" value={c.volume ?? 1} min={0} max={2} step={0.05} show={(v) => (v <= 0.001 ? "ปิด" : `${Math.round(v * 100)}%`)}
                    onChange={(v) => upClip({ volume: v }, "volume")} />
          </>
        ) : (
          <>
            <Slider label="ความยาว" value={c.dur || 3} min={0.3} max={15} step={0.1} show={(v) => `${v.toFixed(1)} วิ`} onChange={(v) => upClip({ dur: v }, "dur")} />
          </>
        )}
        {c.gen && api && <GenKit clip={c} api={api} dispatch={dispatch} />}
        <div className={s.field}>
          <span className={s.lab}>กล้อง</span>
          <Chips value={c.motion || (isVid ? "none" : "zoomin")} options={MOTIONS} labels={MOTION_TH} onPick={(v) => upClip({ motion: v }, "motion")} />
        </div>
        <label className={s.check}>
          <input type="checkbox" checked={!!c.hype} onChange={(e) => upClip({ hype: e.target.checked || undefined }, "hype")} />
          ซับคำยักษ์กลางจอช่วงนี้ (จังหวะไวรัล)
        </label>
        <div className={s.field}>
          <span className={s.lab}>เอฟเฟกต์ซ้อน (ขยับตลอดฉาก)</span>
          <Chips value={c.layer || "none"} options={LAYERS} labels={LAYER_TH} onPick={(v) => upClip({ layer: v }, "layer")} />
        </div>
        {c.layer && c.layer !== "none" && (
          <div className={s.field}>
            <span className={s.lab}>สีเอฟเฟกต์</span>
            <div className={s.chips}>
              {Object.entries(TINTS).map(([k, hex]) => (
                <button key={k} className={`${s.chip} ${(c.tint || "cyan") === k ? s.chipOn : ""}`} title={TINT_TH[k]}
                        style={{ width: 30, height: 26, padding: 0, background: hex, borderColor: (c.tint || "cyan") === k ? "#fff" : undefined }}
                        aria-label={TINT_TH[k]} onClick={() => upClip({ tint: k }, "tint")} />
              ))}
            </div>
          </div>
        )}
        <div className={s.field}>
          <span className={s.lab}>จัดภาพ</span>
          <Chips value={c.fit} options={["cover", "contain"]} labels={{ cover: "เต็มจอ (ครอป)", contain: "ทั้งภาพ + พื้นเบลอ" }} onPick={(v) => upClip({ fit: v }, "fit")} />
        </div>
        {c.fit === "cover" && (
          <div className={s.row2}>
            <Slider label="ครอปซ้าย-ขวา" value={c.fx ?? 0.5} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => upClip({ fx: v }, "fx")} />
            <Slider label="ครอปบน-ล่าง" value={c.fy ?? 0.5} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => upClip({ fy: v }, "fy")} />
          </div>
        )}
        <Slider label="ซูม" value={c.zoom || 1} min={1} max={2} step={0.01} show={(v) => `${v.toFixed(2)}x`} onChange={(v) => upClip({ zoom: v }, "zoom")} />
        {idx > 0 && (
          <div className={s.field}>
            <span className={s.lab}>รอยต่อจากคลิปก่อนหน้า</span>
            <Chips value={c.transition || "cut"} options={TRANSITIONS} labels={TRANS_TH} onPick={(v) => upClip({ transition: v }, "transition")} />
          </div>
        )}
        <div className={s.row2}>
          <button className={s.btn} disabled={idx <= 0} onClick={() => dispatch({ type: "MOVE_CLIP", id: c.id, to: idx - 1 })}>← ย้ายไปก่อน</button>
          <button className={s.btn} disabled={idx >= state.tl.clips.length - 1} onClick={() => dispatch({ type: "MOVE_CLIP", id: c.id, to: idx + 1 })}>ย้ายไปหลัง →</button>
        </div>
        {actions}
      </div>
    )
  }

  // ── ของทับ ──
  if (sel.kind === "overlay") {
    const o = item
    const endEff = o.end < 0 ? tot.total : o.end
    const timing = (
      <>
        <div className={s.row2}>
          <Num label="โผล่ที่ (วิ)" value={+o.start.toFixed(2)} min={0} max={Math.max(0, endEff - 0.3)} onChange={(v) => upOv({ start: v }, "start")} />
          <Num label="หายที่ (วิ)" value={+endEff.toFixed(2)} min={o.start + 0.3} max={LIMITS.seconds} onChange={(v) => upOv({ end: v }, "end")} />
        </div>
        <label className={s.check}>
          <input type="checkbox" checked={o.end < 0} onChange={(e) => upOv({ end: e.target.checked ? -1 : +Math.min(tot.total, o.start + 3).toFixed(2) }, "endall")} />
          อยู่ถึงท้ายคลิป
        </label>
        <div className={s.row2}>
          <Slider label="ซ้าย-ขวา" value={o.x ?? 0.5} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => upOv({ x: v }, "x")} />
          <Slider label="บน-ล่าง" value={o.y ?? 0.5} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => upOv({ y: v }, "y")} />
        </div>
      </>
    )
    if (o.type === "text") {
      return (
        <div className={s.insp}>
          <div className={s.inspHead}><Type size={16} /> ตัวหนังสือ</div>
          <div className={s.field}>
            <label>ข้อความ (Enter = ขึ้นบรรทัดใหม่)</label>
            <textarea className={s.textarea} value={o.text} maxLength={LIMITS.text} onChange={(e) => upOv({ text: e.target.value }, "text")} />
          </div>
          <div className={s.field}>
            <span className={s.lab}>สไตล์</span>
            <Chips value={o.style || "bold"} options={TEXT_STYLES} labels={STYLE_TH} onPick={(v) => upOv({ style: v }, "style")} />
          </div>
          <Slider label="ขนาด" value={o.size || 90} min={28} max={220} step={1} show={(v) => `${v}px`} onChange={(v) => upOv({ size: v }, "size")} />
          {(o.style === "bold" || o.style === "box" || !o.style) && (
            <div className={s.field}>
              <span className={s.lab}>สีตัวอักษร</span>
              <div className={s.chips}>
                {COLORS.map(c => (
                  <button key={c} className={`${s.chip} ${o.color === c ? s.chipOn : ""}`} style={{ width: 30, height: 26, padding: 0, background: c, borderColor: o.color === c ? "#fff" : undefined }}
                          aria-label={c} onClick={() => upOv({ color: c }, "color")} />
                ))}
                <input type="color" value={o.color || "#ffffff"} onChange={(e) => upOv({ color: e.target.value }, "color")} style={{ width: 34, height: 26, border: 0, background: "none" }} />
              </div>
            </div>
          )}
          <div className={s.field}>
            <span className={s.lab}>ท่าตอนโผล่</span>
            <Chips value={o.anim || "pop"} options={TEXT_ANIMS} labels={ANIM_TH} onPick={(v) => upOv({ anim: v }, "anim")} />
          </div>
          {timing}
          <p className={s.hint}>ห้ามใส่ยอดขาย/ตัวเลขยอดในคลิป · ลากตัวหนังสือบนจอพรีวิวเพื่อย้ายได้เลย</p>
          {actions}
        </div>
      )
    }
    return (
      <div className={s.insp}>
        <div className={s.inspHead}>{o.type === "logo" ? <ImageIcon size={16} /> : <Layers size={16} />}{o.type === "logo" ? "โลโก้ร้าน" : "ภาพทับ"}<small>{o.src?.replace(/^sku:/, "ซอง ")}</small></div>
        <Slider label="ขนาด (กว้าง)" value={o.w || (o.type === "logo" ? 0.14 : 0.45)} min={0.05} max={o.type === "logo" ? 0.5 : 1} step={0.01}
                show={(v) => `${Math.round(v * 100)}% ของจอ`} onChange={(v) => upOv({ w: v }, "w")} />
        {o.type !== "logo" && (
          <div className={s.field}>
            <span className={s.lab}>ท่าตอนโผล่</span>
            <Chips value={o.anim || "pop"} options={IMG_ANIMS} labels={ANIM_TH} onPick={(v) => upOv({ anim: v }, "anim")} />
          </div>
        )}
        {timing}
        {o.type === "logo" && <p className={s.hint}>ใช้ไฟล์โลโก้จริง ไม่วาดใหม่ — สีขาว เหมาะกับพื้นเข้ม</p>}
        {actions}
      </div>
    )
  }

  // ── เสียงพากย์ ──
  if (sel.kind === "voice") {
    const v = item
    const set = (patch, key) => dispatch({ type: "SET_VOICE", voice: { ...v, ...patch }, coalesce: `v:${key}`, at: at() })
    const est = estimateVoice(v.script)
    const lines = v.script.split("\n").filter(x => x.trim()).length
    return (
      <div className={s.insp}>
        <div className={s.inspHead}><Mic size={16} /> เสียงพากย์ AI</div>
        <div className={s.field}>
          <label>บทพากย์ — 1 บรรทัด = ซับ 1 ท่อน<b>{v.script.length}/{LIMITS.script}</b></label>
          <textarea className={s.textarea} style={{ minHeight: 160 }} value={v.script} maxLength={LIMITS.script}
                    placeholder={"OP-17 มาถึงตู้แล้ว\nใครรอซองนี้อยู่ ไปเปิดกันได้เลย"}
                    onChange={(e) => set({ script: e.target.value }, "script")} />
        </div>
        <div className={s.note}>
          {lines} บรรทัด · ยาวราว <b>{est.toFixed(1)} วิ</b> (ของจริงอาจต่าง ±15%)
          {est > tot.clipsTotal + 0.3 && state.tl.clips.length > 0 && <><br /><b style={{ color: "#ffc24a" }}>ยาวกว่าภาพ {(est - tot.clipsTotal).toFixed(1)} วิ</b> — เพิ่มภาพหรือตัดบทให้สั้นลง</>}
        </div>
        <div className={s.field}>
          <label>เสียง</label>
          <select className={s.select} value={v.voice} onChange={(e) => set({ voice: e.target.value }, "voice")}>
            {VOICES.map(x => <option key={x} value={x}>{VOICE_TH[x] || x}</option>)}
          </select>
        </div>
        <div className={s.field}>
          <label>รุ่นเสียง</label>
          <select className={s.select} value={v.tts_model || ""} onChange={(e) => set({ tts_model: e.target.value || null }, "model")}>
            <option value="">ค่าเริ่มต้นของระบบ (3.8)</option>
            {TTS_MODELS.map(x => <option key={x} value={x}>{MODEL_TH[x] || x}</option>)}
          </select>
        </div>
        <div className={s.field}>
          <label>โทนการพูด (ไม่ใส่ก็ได้)</label>
          <input className={s.input} value={v.style || ""} maxLength={200} placeholder="เช่น ตื่นเต้น เร็ว ๆ เหมือนเล่าให้เพื่อนฟัง"
                 onChange={(e) => set({ style: e.target.value || null }, "style")} />
        </div>
        <label className={s.check}>
          <input type="checkbox" checked={state.tl.captions?.on !== false}
                 onChange={(e) => dispatch({ type: "SET_FLAG", key: "captions", value: { on: e.target.checked } })} />
          ใส่ซับไทยตามเสียง
        </label>
        <p className={s.hint}>ชื่อการ์ด/คำอังกฤษอ่านตามกฎออกเสียงของร้าน (DivisionX · Pokémon · OP-17) · ห้ามใส่ยอดขายในบท</p>
        {actions}
      </div>
    )
  }

  // ── เพลง ──
  if (sel.kind === "music") {
    const m = item
    return (
      <div className={s.insp}>
        <div className={s.inspHead}><Music size={16} /> เพลงประกอบ<small>{decodeURIComponent(m.src.split("/").pop())}</small></div>
        <audio src={m.src.startsWith("https://") ? m.src : undefined} controls style={{ width: "100%" }} />
        <Slider label="ความดัง" value={m.volume ?? 0.22} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => dispatch({ type: "SET_MUSIC", music: { ...m, volume: v }, coalesce: "m:vol", at: at() })} />
        <div className={`${s.note} ${s.warnNote}`}>เพลงหลบเสียงพากย์ให้เองตอนมีคนพูด · <b>ต้องมีสิทธิ์ใช้เพลงนี้</b> ไม่งั้นโพสต์โดนปิดเสียงหรือลบ</div>
        {actions}
      </div>
    )
  }
  return null
}
