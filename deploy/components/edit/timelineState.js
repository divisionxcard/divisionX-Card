// สถานะของห้องตัดต่อ (ไทม์ไลน์) — reducer ล้วน ไม่มี side effect · สัญญาข้อมูล: deploy/agents/video/TIMELINE.md
// ทุกการแก้ผ่าน dispatch เท่านั้น → ย้อนกลับ/ทำซ้ำได้ทุกขั้น (เก็บประวัติ 60 ขั้น)
import { clipLen, layout, VOICE_TAIL } from "../../lib/videoTimeline"

const uid = (p) => `${p}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const HISTORY = 60

export function emptyTimeline() {
  return { version: 1, clips: [], overlays: [], voice: null, captions: { on: true }, music: null, sfx: true }
}

export function initState(doc) {
  return {
    id: doc?.id || null,
    name: doc?.name || "งานตัดต่อใหม่",
    tl: doc?.timeline ? { ...emptyTimeline(), ...doc.timeline } : emptyTimeline(),
    sel: null,                 // { kind: "clip"|"overlay"|"voice"|"music", id }
    t: 0,                      // ตำแหน่งหัวอ่าน (วินาทีบนไทม์ไลน์)
    dirty: false,
    past: [], future: [],
    lastKey: null, lastAt: 0,  // ตัวรวมการแก้ต่อเนื่อง (ดู commit)
  }
}

// ความยาวเสียงพากย์โดยประมาณ — ไทยราว 13 ตัวอักษร/วินาที + ช่วงหยุดระหว่างบรรทัด (ใกล้เคียง TTS จริง ±15%)
export function estimateVoice(script) {
  const lines = String(script || "").split("\n").map(s => s.trim()).filter(Boolean)
  if (!lines.length) return 0
  return lines.reduce((a, l) => a + l.length / 13 + 0.45, 0)
}

export function totals(tl) {
  const { starts, total } = layout(tl.clips)
  const voice = tl.voice?.script ? estimateVoice(tl.voice.script) : 0
  return { starts, clipsTotal: total, voice, total: Math.max(total, voice ? voice + VOICE_TAIL : 0, 0.5) }
}

// แก้ tl แล้วเก็บของเก่าไว้ย้อน
// key + at (ส่งมากับ action) = รวมการแก้ต่อเนื่องเป็นขั้นเดียว — ลากแถบเลื่อน/พิมพ์ทีละตัวอักษร
// จะได้ไม่กินประวัติ 60 ขั้นหมดในการลากครั้งเดียว (เวลามากับ action เพื่อให้ reducer ยังบริสุทธิ์)
const COALESCE_MS = 900
function commit(state, tl, extra = {}, a = null) {
  const key = a?.coalesce ? a.coalesce : null
  const at = a?.at || 0
  const same = key && key === state.lastKey && at - state.lastAt < COALESCE_MS
  return {
    ...state, ...extra, tl, dirty: true, lastKey: key, lastAt: at,
    past: same ? state.past : [...state.past.slice(-HISTORY + 1), state.tl], future: [],
  }
}

function mapClip(tl, id, fn) { return { ...tl, clips: tl.clips.map(c => (c.id === id ? fn(c) : c)) } }
function mapOv(tl, id, fn) { return { ...tl, overlays: tl.overlays.map(o => (o.id === id ? fn(o) : o)) } }

// คลิปใหม่จากไฟล์ในคลัง (asset = { url, kind, name, seconds? })
export function clipFromAsset(a) {
  if (a.kind === "image") {
    return { id: uid("c"), kind: "image", src: a.url, name: a.name, dur: 3, fit: "contain", motion: "zoomin", transition: "cut" }
  }
  const secs = Number(a.seconds) || 5
  return { id: uid("c"), kind: "video", src: a.url, name: a.name, in: 0, out: Math.min(secs, 60), seconds: secs,
           speed: 1, fit: "cover", fx: 0.5, fy: 0.5, zoom: 1, volume: 1, transition: "cut" }
}

// ── ผูกกับบรรทัดเสียงพากย์ (line/span · สตอรี่บอร์ด 26 ต.ค. 2026) ──
// ร่างจากตัวเขียนสตอรี่บอร์ดผูกแต่ละชิ้นกับบรรทัดบทพากย์ · runner ตั้งเวลาตามเสียงจริง (hf_timeline.anchor)
// คนแก้เวลา/ลากสลับ/หั่น/ทำซ้ำ = ถอดการผูก ให้เวลาที่คนจัดเป็นตัวจริง
const CLIP_TIMING = ["dur", "in", "out", "speed"]
const OV_TIMING = ["start", "end"]
function unanchor(o, patch, keys) {
  if (!o || (o.line === undefined && o.span === undefined)) return o
  if (patch && keys && !keys.some(k => k in patch)) return o
  const { line, span, ...rest } = o
  return rest
}

export function reducer(state, a) {
  const tl = state.tl
  switch (a.type) {
    case "LOAD": return initState(a.doc)
    // clean = false → มีการแก้ต่อระหว่างรอบันทึก ยังถือว่าค้างอยู่
    case "SAVED": return { ...state, id: a.id || state.id, dirty: a.clean === false ? state.dirty : false }
    case "RENAME": return { ...state, name: a.name, dirty: true }
    case "SELECT": return { ...state, sel: a.sel }
    case "SEEK": return { ...state, t: Math.max(0, a.t) }
    case "UNDO": {
      if (!state.past.length) return state
      const prev = state.past[state.past.length - 1]
      return { ...state, tl: prev, past: state.past.slice(0, -1), future: [state.tl, ...state.future], dirty: true, lastKey: null }
    }
    case "REDO": {
      if (!state.future.length) return state
      const [next, ...rest] = state.future
      return { ...state, tl: next, future: rest, past: [...state.past, state.tl], dirty: true, lastKey: null }
    }

    // ── แทร็กหลัก
    case "ADD_CLIP": {
      const c = a.clip
      const at = a.index ?? tl.clips.length
      const clips = [...tl.clips.slice(0, at), c, ...tl.clips.slice(at)]
      return commit(state, { ...tl, clips }, { sel: { kind: "clip", id: c.id } })
    }
    // คนปรับเวลาเอง = ปล่อยการผูกกับบรรทัดเสียงพากย์ (สตอรี่บอร์ด) — ไม่งั้นตอนเรนเดอร์ runner ตั้งเวลาทับที่คนจัดไว้
    case "UPDATE_CLIP": return commit(state, mapClip(tl, a.id, c => ({ ...unanchor(c, a.patch, CLIP_TIMING), ...a.patch })), {}, a)
    // เปลี่ยนไฟล์ของฉาก (อัปภาพ/วิดีโอจาก AI ตัวอื่นมาแทนฉากที่ AI ออกแบบ) — ไม่ใช่การจัดเวลาเอง จึงยังผูกกับเสียงพากย์ไว้
    case "REPLACE_MEDIA": return commit(state, mapClip(tl, a.id, c => ({ ...c, ...a.patch })), {}, a)
    case "MOVE_CLIP": {
      const from = tl.clips.findIndex(c => c.id === a.id)
      if (from < 0) return state
      const to = clamp(a.to, 0, tl.clips.length - 1)
      if (from === to) return state
      const clips = [...tl.clips]
      const [c] = clips.splice(from, 1)
      clips.splice(to, 0, unanchor(c))                    // ลากสลับลำดับ = เลขบรรทัดเดิมไม่มีความหมายแล้ว
      return commit(state, { ...tl, clips })
    }
    case "DELETE": {
      if (!state.sel) return state
      if (state.sel.kind === "clip") return commit(state, { ...tl, clips: tl.clips.filter(c => c.id !== state.sel.id) }, { sel: null })
      if (state.sel.kind === "overlay") return commit(state, { ...tl, overlays: tl.overlays.filter(o => o.id !== state.sel.id) }, { sel: null })
      if (state.sel.kind === "voice") return commit(state, { ...tl, voice: null }, { sel: null })
      if (state.sel.kind === "music") return commit(state, { ...tl, music: null }, { sel: null })
      return state
    }
    case "DUPLICATE": {
      if (state.sel?.kind === "clip") {
        const i = tl.clips.findIndex(c => c.id === state.sel.id)
        if (i < 0) return state
        const c = { ...unanchor(tl.clips[i]), id: uid("c") }
        return commit(state, { ...tl, clips: [...tl.clips.slice(0, i + 1), c, ...tl.clips.slice(i + 1)] }, { sel: { kind: "clip", id: c.id } })
      }
      if (state.sel?.kind === "overlay") {
        const o0 = tl.overlays.find(o => o.id === state.sel.id)
        if (!o0) return state
        const o = { ...unanchor(o0), id: uid("o"), y: clamp((o0.y ?? 0.5) + 0.06, 0, 1) }
        return commit(state, { ...tl, overlays: [...tl.overlays, o] }, { sel: { kind: "overlay", id: o.id } })
      }
      return state
    }
    // หั่นคลิปที่หัวอ่าน → สองชิ้น (วิดีโอแบ่งช่วง in/out · รูปแบ่งความยาว)
    case "SPLIT": {
      const { starts } = layout(tl.clips)
      const i = tl.clips.findIndex((c, k) => state.t > starts[k] + 0.1 && state.t < starts[k] + clipLen(c) - 0.1)
      if (i < 0) return state
      const c = tl.clips[i]
      const local = state.t - starts[i]
      let left, right
      if (c.kind === "video") {
        const cut = +(c.in + local * (c.speed || 1)).toFixed(2)
        left = { ...unanchor(c), out: cut }
        right = { ...unanchor(c), id: uid("c"), in: cut, transition: "cut" }
      } else {
        const d = +local.toFixed(2)
        left = { ...unanchor(c), dur: d }
        right = { ...unanchor(c), id: uid("c"), dur: +(c.dur - d).toFixed(2), transition: "cut" }
      }
      return commit(state, { ...tl, clips: [...tl.clips.slice(0, i), left, right, ...tl.clips.slice(i + 1)] },
                    { sel: { kind: "clip", id: right.id } })
    }

    // ── ของทับ
    case "ADD_OVERLAY": {
      const { total } = totals(tl)
      const start = clamp(a.start ?? state.t, 0, Math.max(0, total - 0.5))
      const o = { id: uid("o"), start, end: Math.min(start + (a.len || 3), Math.max(total, start + 1)), x: 0.5, y: 0.5, anim: "pop", ...a.overlay }
      return commit(state, { ...tl, overlays: [...tl.overlays, o] }, { sel: { kind: "overlay", id: o.id } })
    }
    case "UPDATE_OVERLAY": return commit(state, mapOv(tl, a.id, o => ({ ...unanchor(o, a.patch, OV_TIMING), ...a.patch })), {}, a)

    // ── เสียง/ซับ/เพลง
    case "SET_VOICE": return commit(state, { ...tl, voice: a.voice }, a.select ? { sel: { kind: "voice", id: "voice" } } : {}, a)
    case "SET_MUSIC": return commit(state, { ...tl, music: a.music }, a.select ? { sel: { kind: "music", id: "music" } } : {}, a)
    case "SET_FLAG": return commit(state, { ...tl, [a.key]: a.value })
    default: return state
  }
}

export function selected(state) {
  const s = state.sel
  if (!s) return null
  if (s.kind === "clip") return state.tl.clips.find(c => c.id === s.id) || null
  if (s.kind === "overlay") return state.tl.overlays.find(o => o.id === s.id) || null
  if (s.kind === "voice") return state.tl.voice
  if (s.kind === "music") return state.tl.music
  return null
}

// ไทม์ไลน์สำหรับส่งเรนเดอร์ — ตัดคีย์ที่ใช้แค่บนหน้าเว็บ (name/seconds) และแปลง end -1
export function timelineForRender(tl) {
  return {
    ...tl,
    clips: tl.clips.map(({ name, seconds, ...c }) => c),
    overlays: tl.overlays.map(({ name, ...o }) => o),
  }
}

export const fmt = (s) => {
  s = Math.max(0, Number(s) || 0)
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`
}
