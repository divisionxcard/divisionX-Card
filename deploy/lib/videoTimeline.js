// ไทม์ไลน์ของห้องตัดต่อ (plan.engine = "timeline") — ตัวตรวจ/ล้างข้อมูล + ตัวคำนวณเวลา ใช้ร่วมกันสองฝั่ง:
//   app/api/video/render/route.js  ตรวจก่อนจองงาน (ประกอบ plan ใหม่จากคีย์ที่รู้จักเท่านั้น)
//   components/edit/*              หน้าห้องตัดต่อ (ความยาวคลิป · ตำแหน่งบนไทม์ไลน์)
// สัญญาข้อมูล: deploy/agents/video/TIMELINE.md · ฝั่ง runner ตรวจซ้ำใน agents/video/hf_timeline.normalize
// ⚠️ แก้รูปทรงที่นี่ต้องแก้ hf_timeline.py กับ TIMELINE.md พร้อมกัน

export const LIMITS = { clips: 40, overlays: 40, seconds: 180, text: 200, script: 3000 }
export const TEXT_STYLES = ["bold", "gold", "neon", "box"]
export const ANIMS = ["pop", "slide", "fade", "float", "none"]
export const TRANSITIONS = ["cut", "flash", "zoom"]
export const MOTIONS = ["none", "zoomin", "zoomout"]
export const FITS = ["cover", "contain"]
export const VOICES = ["Aoede", "Kore", "Puck", "Charon"]
export const TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-3.8-flash-tts"]
export const VOICE_TAIL = 0.6

const num = (v, lo, hi, d) => {
  const x = Number(v)
  return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d
}
const pick = (v, opts, d) => (opts.includes(v) ? v : d)
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "")
// ผูกกับบรรทัดเสียงพากย์ (26 ต.ค. 2026 · สตอรี่บอร์ด) — เลขบรรทัด 0 = บรรทัดแรกของบทพากย์
// runner ตั้งเวลาให้ตรงจังหวะพูดจริงหลังทำเสียง (hf_timeline.anchor) · ในหน้าเว็บเป็นแค่เวลาประมาณ
export const MAX_LINES = 60
const lineOf = (v) => (Number.isInteger(v) && v >= 0 && v < MAX_LINES ? v : null)

// แหล่งไฟล์ที่ยอมให้เครื่องเรนเดอร์โหลด — คลังไฟล์ของเรา · รูปซอง (sku:) · ไฟล์ในเทมเพลต
// ห้ามลิงก์ภายนอก: ไม่งั้นใครก็ใช้ runner ของเราดาวน์โหลดอะไรก็ได้
// คลังไฟล์ = Cloudflare R2 ผ่านหน้า /media/ ของเว็บ (23 ต.ค. 2026 · lib/r2.js) · ลิงก์ Supabase เดิมยังรับ (ร่างงานเก่า)
export const MEDIA_PREFIX = `${(process.env.NEXT_PUBLIC_SITE_URL || "https://division-x-card.vercel.app").replace(/\/+$/, "")}/media/`
export function storagePrefix(base) {
  const b = (base || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  return `${b}/storage/v1/object/public/marketing/`
}
const ours = (s, base) => s.startsWith(MEDIA_PREFIX) || s.startsWith(storagePrefix(base))
export function okSrc(s, base) {
  if (typeof s !== "string" || !s || s.length > 600 || s.includes("..")) return false
  if (ours(s, base)) return !s.slice(s.indexOf("/media/") + 7).startsWith("video-edits/")
  if (/^sku:[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/.test(s)) return true
  return /^assets\/[A-Za-z0-9._/-]{1,120}$/.test(s)
}

export function clipLen(c) {
  if (c.kind === "image") return num(c.dur, 0.3, 60, 3)
  const a = num(c.in, 0, 36000, 0)
  const b = num(c.out, a + 0.2, 36000, a + 5)
  return (b - a) / num(c.speed, 0.25, 4, 1)
}

// เวลาเริ่มของแต่ละคลิปในแทร็กหลัก + ความยาวรวม (ไม่รวมเสียงพากย์)
export function layout(clips) {
  let t = 0
  const starts = clips.map(c => { const s = t; t += clipLen(c); return s })
  return { starts, total: t }
}

// ล้างไทม์ไลน์ → { timeline } หรือ { error } · base = URL ของ Supabase (ฝั่งเบราว์เซอร์ส่งเอง)
export function cleanTimeline(raw, base) {
  if (!raw || typeof raw !== "object") return { error: "ต้องส่ง timeline เป็น object" }
  const clipsIn = Array.isArray(raw.clips) ? raw.clips : []
  if (!clipsIn.length) return { error: "ไทม์ไลน์ต้องมีคลิปหรือรูปอย่างน้อย 1 ชิ้น" }
  if (clipsIn.length > LIMITS.clips) return { error: `คลิปในแทร็กหลักได้ไม่เกิน ${LIMITS.clips} ชิ้น` }
  const clips = []
  for (const [i, c] of clipsIn.entries()) {
    if (!c || typeof c !== "object") return { error: `คลิปที่ ${i + 1} ไม่ถูกรูปแบบ` }
    if (!okSrc(c.src, base)) return { error: `คลิปที่ ${i + 1}: ใช้ได้เฉพาะไฟล์ในคลังของเรา (อัปโหลดเข้าคลังก่อน)` }
    const kind = c.kind === "image" ? "image" : "video"
    const row = {
      id: str(c.id, 24) || `c${i + 1}`, kind, src: c.src,
      fit: pick(c.fit, FITS, kind === "video" ? "cover" : "contain"),
      fx: num(c.fx, 0, 1, 0.5), fy: num(c.fy, 0, 1, 0.5), zoom: num(c.zoom, 1, 2, 1),
      transition: pick(c.transition, TRANSITIONS, "cut"),
    }
    // ข้อมูลประกอบหน้าเว็บ (ชื่อไฟล์ · ความยาวไฟล์จริง) — ร่างงานต้องเก็บไว้ ไม่งั้นเปิดมาแก้ต่อแล้วไม่รู้ว่าตัดได้ถึงไหน
    if (str(c.name, 80)) row.name = str(c.name, 80)
    if (Number(c.seconds) > 0) row.seconds = num(c.seconds, 0.1, 36000, 0)
    if (kind === "video") {
      row.in = num(c.in, 0, 36000, 0)
      row.out = num(c.out, row.in + 0.2, 36000, row.in + 5)
      row.speed = num(c.speed, 0.25, 4, 1)
      row.volume = num(c.volume, 0, 2, 1)
    } else {
      row.dur = num(c.dur, 0.3, 60, 3)
      row.motion = pick(c.motion, MOTIONS, "zoomin")
    }
    if (lineOf(c.line) !== null) row.line = c.line
    clips.push(row)
  }
  const ovIn = Array.isArray(raw.overlays) ? raw.overlays : []
  if (ovIn.length > LIMITS.overlays) return { error: `ของทับได้ไม่เกิน ${LIMITS.overlays} ชิ้น` }
  const overlays = []
  for (const [i, o] of ovIn.entries()) {
    if (!o || !["text", "image", "logo"].includes(o.type)) continue
    const row = {
      id: str(o.id, 24) || `o${i + 1}`, type: o.type,
      start: num(o.start, 0, LIMITS.seconds, 0), end: num(o.end, -1, LIMITS.seconds, -1),
      x: num(o.x, 0, 1, 0.5), y: num(o.y, 0, 1, 0.5), anim: pick(o.anim, ANIMS, o.type === "logo" ? "none" : "pop"),
    }
    if (o.type === "text") {
      row.text = str(o.text, LIMITS.text)
      if (!row.text) continue
      row.size = num(o.size, 28, 220, 90)
      row.style = pick(o.style, TEXT_STYLES, "bold")
      row.color = typeof o.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(o.color) ? o.color : "#ffffff"
    } else if (o.type === "image") {
      if (!okSrc(o.src, base)) return { error: `ภาพทับชิ้นที่ ${i + 1}: ใช้ได้เฉพาะไฟล์ในคลังของเรา หรือรูปซอง` }
      row.src = o.src
      row.w = num(o.w, 0.05, 1, 0.45)
    } else {
      row.x = num(o.x, 0, 1, 0.88); row.y = num(o.y, 0, 1, 0.05); row.w = num(o.w, 0.05, 0.5, 0.14)
    }
    if (lineOf(o.line) !== null) {
      row.line = o.line
      if (Number.isInteger(o.span) && o.span > 1) row.span = Math.min(o.span, 10)
    }
    overlays.push(row)
  }
  let voice = null
  if (raw.voice && typeof raw.voice === "object" && str(raw.voice.script, LIMITS.script)) {
    voice = {
      script: str(raw.voice.script, LIMITS.script),
      voice: pick(raw.voice.voice, VOICES, "Puck"),
      style: str(raw.voice.style, 200) || null,
      tts_model: pick(raw.voice.tts_model, TTS_MODELS, null),
    }
  }
  let music = null
  if (raw.music && typeof raw.music === "object" && typeof raw.music.src === "string") {
    const src = raw.music.src
    if (!(/^lib:[a-z0-9_-]{1,40}$/.test(src) || ours(src, base))) {
      return { error: "เพลง: ใช้ได้เฉพาะเพลงในคลังที่มีใบอนุญาต หรือไฟล์ที่อัปโหลดเข้าคลัง" }
    }
    music = { src, volume: num(raw.music.volume, 0, 1, 0.22) }
  }
  const { total } = layout(clips)
  if (total > LIMITS.seconds) return { error: `แทร็กหลักยาว ${total.toFixed(0)} วิ — ได้ไม่เกิน ${LIMITS.seconds} วิ` }
  return {
    timeline: {
      version: 1, clips, overlays, voice,
      captions: { on: raw.captions?.on !== false },
      music, sfx: raw.sfx !== false,
    },
  }
}
