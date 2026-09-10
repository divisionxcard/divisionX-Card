// ── สมองของห้องตัดต่อ — state เดียว reducer เดียว ทุก component พิงไฟล์นี้ ──
//
// กติกาสำคัญที่ทุกคนต้องเข้าใจก่อนแก้:
//
// 1. "เสียงคือนาฬิกา ภาพคือผู้ตาม" — เสียงพากย์เป็นก้อนเดียวต่อเนื่อง แก้ไม่ได้
//    จากห้องนี้ สิ่งที่แก้ได้คือ จุดตัดภาพ / ซับ / ภาพประกอบ ซึ่งล้วนอ้างเวลาบนเสียง
//    ดังนั้นการ "สลับฉาก" คือสลับ*ภาพ* ไม่ใช่สลับเสียง (เสียงจะเล่าเรียงเดิมเสมอ)
//
// 2. undo เก็บเฉพาะส่วนที่แก้ได้ (timing/subtitles/edit/frameFor) — ไม่เก็บ ui
//    เพราะกด undo แล้วภาพเด้งไปตำแหน่ง playhead เก่าคือความรำคาญ ไม่ใช่การย้อนงาน
//
// 3. ห้ามลง dependency ใหม่ — useReducer ธรรมดาพอ และทำให้ทั้งห้องพกไปไหนก็ได้
//
// โครง state / ชื่อ action ตรงกับ CONTRACT.md — แก้ที่นี่ต้องแก้ที่นั่นด้วย

// ── ค่าคงที่ร่วม (import จากที่นี่ที่เดียว) ──
export const FPS = 30
export const MIN_SCENE = 0.35     // ฉากสั้นสุด — ตรงกับ compose.py (max(0.5,·) กับ xfade)
export const MIN_SUB = 0.25       // ซับสั้นกว่านี้อ่านไม่ทันและลากบนจอไม่ถูก
export const PPS_BASE = 40        // px ต่อวินาทีของ timeline ที่ zoom = 1
export const NUDGE = 0.1          // ปุ่มขยับละเอียด (วินาที) · กด Shift = 0.5

// เสียงที่ยิงทดสอบกับภาษาไทยผ่านแล้วจริง (9 ก.ย. 2026) — ตัวอื่นของ Gemini มีอีก
// แต่ยังไม่ได้ลอง อย่าเพิ่มมั่ว เพิ่มได้เมื่อฟังตัวอย่างแล้วเท่านั้น
export const VOICES = [
  { id: "Aoede",      label: "เอโอดี",      desc: "หญิง · สบาย ๆ เป็นกันเอง" },
  { id: "Leda",       label: "ลีดา",        desc: "หญิง · วัยรุ่น สดใส" },
  { id: "Callirrhoe", label: "คัลลิร์โฮ",   desc: "หญิง · นุ่ม ชิลล์" },
  { id: "Zephyr",     label: "เซเฟอร์",     desc: "หญิง · สว่าง กระตือรือร้น" },
  { id: "Sulafat",    label: "ซูลาฟัต",     desc: "หญิง · อบอุ่น" },
]

export const SUB_STYLES = [
  { id: "brand", label: "แบรนด์",  desc: "ขาว ขอบกรมท่า เน้นคำเป็นฟ้านีออน" },
  { id: "plain", label: "เรียบ",   desc: "ขาว ขอบดำ แบบสากล" },
  { id: "punch", label: "จัดเต็ม", desc: "เหลือง ขอบดำ สายตาจับก่อนใคร" },
]

export const LOGO_POS = [
  { id: "tl", label: "บนซ้าย" }, { id: "tr", label: "บนขวา" },
  { id: "bl", label: "ล่างซ้าย" }, { id: "br", label: "ล่างขวา" },
]

// ── ตัวช่วยเวลา ──
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const round3 = (v) => Math.round(v * 1000) / 1000

export function fmtTime(t) {
  const s = Math.max(0, t || 0)
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`
}

// ความยาวคลิป = จุดจบของฉากสุดท้าย (ตรึงกับความยาวเสียงเสมอ)
export const totalOf = (timing) => (timing.length ? timing[timing.length - 1].end : 0)

// ฉาก/ซับ ณ เวลา t — ใช้ทั้ง preview และ timeline
export const sceneAt = (timing, t) => {
  for (let i = timing.length - 1; i >= 0; i--) if (t >= timing[i].start) return i
  return 0
}
export const subAt = (subs, t) => subs.findIndex(c => t >= c.start && t < c.end)

// ภาพที่มีให้เลือกในเครื่อง (ตรงกับ visuals.resolve ฝั่ง python)
export const VISUAL_CHOICES = [
  { id: "machine:hero",  label: "ตู้ — หน้าตรง" },
  { id: "machine:scene", label: "ตู้ — ในห้างจริง" },
]

// ── คลังท่ากล้อง/ทรานสิชัน — กระจกของ MOTIONS/TRANSITIONS ใน compose.py ──
// และตรรกะ auto เป็นกระจกของ _auto_motion/_auto_transition ใน make_video.py
// ⚠️ แก้ฝั่งไหนต้องแก้อีกฝั่งให้ตรงกัน ไม่งั้นพรีวิวสดจะเคลื่อนไม่เหมือนผลเรนเดอร์
export const MOTIONS = [
  { id: "auto",       label: "อัตโนมัติ — ระบบจัดให้" },
  { id: "zoom-in",    label: "ซูมเข้า" },
  { id: "zoom-out",   label: "ซูมออก (ถอยกล้อง)" },
  { id: "punch",      label: "พุ่งเข้าเร็วแล้วค้าง — เน้นของ" },
  { id: "pan-lr",     label: "กวาดซ้าย → ขวา" },
  { id: "pan-rl",     label: "กวาดขวา → ซ้าย" },
  { id: "drift-down", label: "ไต่ลงตามตัวตู้" },
  { id: "drift-up",   label: "ไต่ขึ้น" },
]
export const TRANSITIONS = [
  { id: "auto",        label: "อัตโนมัติ — สลับจังหวะให้" },
  { id: "fade",        label: "เฟดจาง" },
  { id: "slideleft",   label: "สไลด์ ←" },
  { id: "slideright",  label: "สไลด์ →" },
  { id: "slideup",     label: "สไลด์ ↑" },
  { id: "circleopen",  label: "วงกลมเปิด" },
  { id: "circleclose", label: "วงกลมหุบ" },
  { id: "wipeleft",    label: "ปาดจอ ←" },
  { id: "wiperight",   label: "ปาดจอ →" },
  { id: "smoothup",    label: "เลื่อนนุ่ม ↑" },
  { id: "radial",      label: "กวาดตามเข็ม" },
  { id: "hblur",       label: "เบลอละลาย" },
  { id: "fadeblack",   label: "มืดแล้วค่อยเข้า" },
]
export const PAN_MIN_ZOOM = 0.06   // ซูมค้างขั้นต่ำของท่าแพน/ไต่ (ตรง compose.py)

// ผู้กำกับอัตโนมัติ — ต้องให้ผลเท่ากับ _auto_motion ใน make_video.py ทุกกรณี
export function autoMotion(i, n, visual) {
  if (n > 1 && i === n - 1) return "zoom-out"
  if (i === 0) return "zoom-in"
  const v = visual || ""
  if (v.startsWith("sku:")) return i % 2 ? "punch" : "zoom-in"
  if (v === "machine:scene") return i % 2 ? "pan-rl" : "pan-lr"
  return ["drift-down", "zoom-in", "pan-lr"][i % 3]
}

const ACCENTS = ["slideleft", "circleopen", "slideright", "smoothup"]
export function autoTransition(i) {
  return i % 2 ? "fade" : ACCENTS[(Math.floor(i / 2) - 1) % ACCENTS.length]
}

// ค่าที่มีผลจริงของฉาก i (ของที่คนเลือกชนะ auto เสมอ)
export function effectiveMotion(state, i) {
  const m = state.edit.scenes?.[String(i)]?.motion
  if (m && m !== "auto") return m
  return autoMotion(i, state.timing.length, effectiveVisual(state, i))
}
export function effectiveTransition(state, i) {
  if (i <= 0) return null                       // ฉากแรกไม่มีรอยต่อเข้า
  const t = state.edit.scenes?.[String(i)]?.transition
  return t && t !== "auto" ? t : autoTransition(i)
}

// visual ที่มีผลจริงของฉาก i (edit ทับ plan)
export function effectiveVisual(state, i) {
  return state.edit.scenes?.[String(i)]?.visual
    ?? (state.plan?.visuals || [])[i]
    ?? "machine:hero"
}

// ── สร้าง state ตั้งต้นจาก payload ของ GET /api/video/local/project ──
export function initFromProject(payload) {
  const plan = payload.plan || {}
  const ed = plan.edit || {}
  const baseTiming = payload.timing?.timing || []
  const baseSubs = payload.timing?.subtitles || []
  const n = (payload.timing?.segments || []).length || baseTiming.length
  return {
    project: payload.name,
    plan,
    segments: payload.timing?.segments || [],
    timing: (ed.timing?.length ? ed.timing : baseTiming).map(t => ({ ...t })),
    subtitles: (ed.subtitles?.length ? ed.subtitles : baseSubs).map(c => ({ ...c })),
    edit: {
      scenes: { ...(ed.scenes || {}) },
      headline: ed.headline ? { ...ed.headline } : null,
      sub_style: ed.sub_style ? { ...ed.sub_style } : null,
      logo: ed.logo ? { ...ed.logo } : null,
    },
    // เฟรมพรีวิวของฉาก i คือรูปจากการเรนเดอร์รอบก่อน — สลับภาพแล้วให้รูปตามไปด้วย
    frameFor: Array.from({ length: n }, (_, i) => i),
    assets: {
      videoUrl: payload.videoUrl,
      voiceUrl: payload.voiceUrl,
      frames: payload.frames || [],
    },
    undo: [], redo: [],
    ui: {
      t: 0, playing: false, zoom: 1, snap: true, safeArea: false,
      selected: { kind: "scene", index: 0 },
      dirty: false,
      rendering: { running: false, step: 0, total: 6, message: null, error: null },
    },
  }
}

// ── undo/redo ── เก็บเฉพาะเนื้องาน (ดูกติกาข้อ 2 บนหัวไฟล์)
const snap = (s) => ({
  timing: s.timing.map(t => ({ ...t })),
  subtitles: s.subtitles.map(c => ({ ...c })),
  edit: JSON.parse(JSON.stringify(s.edit)),
  frameFor: [...s.frameFor],
})
const withUndo = (s, next) => ({
  ...s, ...next,
  undo: [...s.undo.slice(-49), snap(s)],       // 50 ก้าวพอ — เกินนั้นไม่มีใครกดจริง
  redo: [],
  ui: { ...s.ui, ...(next.ui || {}), dirty: true },
})

export function reducer(state, action) {
  const A = action
  switch (A.type) {

    case "LOAD_PROJECT":
      return initFromProject(A.payload)

    // ── การเล่น/มุมมอง (ไม่เข้า undo) ──
    case "SEEK":
      return { ...state, ui: { ...state.ui, t: clamp(A.t, 0, totalOf(state.timing)) } }
    case "PLAY":  return { ...state, ui: { ...state.ui, playing: true } }
    case "PAUSE": return { ...state, ui: { ...state.ui, playing: false } }
    case "SELECT":
      return { ...state, ui: { ...state.ui, selected: { kind: A.kind, index: A.index ?? null } } }
    case "SET_ZOOM":
      return { ...state, ui: { ...state.ui, zoom: clamp(A.zoom, 0.4, 6) } }
    case "TOGGLE_SNAP": return { ...state, ui: { ...state.ui, snap: !state.ui.snap } }
    case "TOGGLE_SAFE": return { ...state, ui: { ...state.ui, safeArea: !state.ui.safeArea } }
    case "RENDER_STATUS":
      return { ...state, ui: { ...state.ui, rendering: { ...state.ui.rendering, ...A.payload },
                               ...(A.payload.done ? { dirty: false } : {}) } }

    // ── ซับ ──
    case "SUB_EDIT": {
      const subs = state.subtitles.map((c, i) => i === A.index ? { ...c, ...A.patch } : c)
      return withUndo(state, { subtitles: subs })
    }
    case "SUB_NUDGE": {
      const subs = state.subtitles.map(c => ({ ...c }))
      const c = subs[A.index]
      if (!c) return state
      if (A.edge === "start") c.start = round3(clamp(c.start + A.by, 0, c.end - MIN_SUB))
      else c.end = round3(clamp(c.end + A.by, c.start + MIN_SUB, totalOf(state.timing)))
      return withUndo(state, { subtitles: subs })
    }
    case "SUB_SPLIT": {
      const i = A.index
      const c = state.subtitles[i]
      if (!c) return state
      const at = clamp(A.at, c.start + MIN_SUB, c.end - MIN_SUB)
      if (!(at > c.start && at < c.end)) return state
      // แบ่งข้อความตามสัดส่วนเวลา — ตัดที่ช่องว่างใกล้สุดถ้ามี จะได้ไม่ขาดกลางคำ
      const ratio = (at - c.start) / (c.end - c.start)
      let cut = Math.round(c.text.length * ratio)
      const sp = c.text.lastIndexOf(" ", cut)
      if (sp > 0 && cut - sp < 8) cut = sp
      const a = c.text.slice(0, cut).trim() || c.text
      const b = c.text.slice(cut).trim() || "…"
      const subs = [
        ...state.subtitles.slice(0, i),
        { ...c, text: a, end: round3(at) },
        { ...c, text: b, start: round3(at) },
        ...state.subtitles.slice(i + 1),
      ]
      return withUndo(state, { subtitles: subs })
    }
    case "SUB_MERGE": {
      const i = A.index
      const a = state.subtitles[i], b = state.subtitles[i + 1]
      if (!a || !b) return state
      const subs = [
        ...state.subtitles.slice(0, i),
        { ...a, text: `${a.text} ${b.text}`.trim(), end: b.end },
        ...state.subtitles.slice(i + 2),
      ]
      return withUndo(state, { subtitles: subs })
    }

    // ── จุดตัดฉาก ──
    // ขยับ "จุดเริ่มของฉาก index" (= จุดจบของฉากก่อนหน้า) — ฉากแรกขยับไม่ได้ (ตรึง 0)
    case "CUT_NUDGE": {
      const i = A.index
      if (i <= 0 || i >= state.timing.length) return state
      const timing = state.timing.map(t => ({ ...t }))
      const lo = timing[i - 1].start + MIN_SCENE
      const hi = (i + 1 < timing.length ? timing[i + 1].start : totalOf(timing)) - MIN_SCENE
      timing[i].start = round3(clamp(timing[i].start + A.by, lo, hi))
      timing[i - 1].end = timing[i].start
      return withUndo(state, { timing })
    }

    // ── ฉาก ──
    case "SCENE_SET": {
      const scenes = { ...state.edit.scenes }
      scenes[String(A.index)] = { ...(scenes[String(A.index)] || {}), ...A.patch }
      const next = { edit: { ...state.edit, scenes } }
      // เปลี่ยนภาพเป็นของใหม่ที่ยังไม่เคยเรนเดอร์ — เฟรมพรีวิวเดิมโกหกแล้ว
      if (A.patch.visual !== undefined) {
        const ff = [...state.frameFor]; ff[A.index] = -1        // -1 = รอเรนเดอร์
        next.frameFor = ff
      }
      return withUndo(state, next)
    }
    case "SCENE_SWAP": {
      const i = A.index, j = i + A.dir
      if (j < 0 || j >= state.timing.length) return state
      const vi = effectiveVisual(state, i), vj = effectiveVisual(state, j)
      const scenes = { ...state.edit.scenes }
      scenes[String(i)] = { ...(scenes[String(i)] || {}), visual: vj }
      scenes[String(j)] = { ...(scenes[String(j)] || {}), visual: vi }
      const ff = [...state.frameFor]
      ;[ff[i], ff[j]] = [ff[j], ff[i]]                          // รูปพรีวิวตามภาพไป
      return withUndo(state, { edit: { ...state.edit, scenes }, frameFor: ff })
    }

    // ── พาดหัว / สไตล์ซับ / โลโก้ ──
    case "HEADLINE_SET":
      return withUndo(state, { edit: { ...state.edit,
        headline: A.patch === null ? { text: "" }               // ลบพาดหัว = text ว่าง
                 : { ...(state.edit.headline || {}), ...A.patch } } })
    case "SUBSTYLE_SET":
      return withUndo(state, { edit: { ...state.edit,
        sub_style: { ...(state.edit.sub_style || {}), ...A.patch } } })
    case "LOGO_SET":
      return withUndo(state, { edit: { ...state.edit,
        logo: A.patch === null ? null : { ...(state.edit.logo || {}), ...A.patch } } })

    // ── undo / redo ──
    case "UNDO": {
      if (!state.undo.length) return state
      const prev = state.undo[state.undo.length - 1]
      return { ...state, ...prev,
        undo: state.undo.slice(0, -1),
        redo: [...state.redo, snap(state)],
        ui: { ...state.ui, dirty: true } }
    }
    case "REDO": {
      if (!state.redo.length) return state
      const next = state.redo[state.redo.length - 1]
      return { ...state, ...next,
        redo: state.redo.slice(0, -1),
        undo: [...state.undo, snap(state)],
        ui: { ...state.ui, dirty: true } }
    }

    default:
      return state
  }
}

// ── แปลง state → plan สำหรับ POST /api/video/local/render ──
// นี่คือครึ่งหลังของสัญญากับตัวเรนเดอร์ (make_video อ่าน plan.edit ตาม CONTRACT.md ข้อ 1)
export function buildPlanForRender(state) {
  const plan = JSON.parse(JSON.stringify(state.plan || {}))
  plan.project = state.project
  const headline = state.edit.headline
  plan.edit = {
    timing: state.timing.map(t => ({ index: t.index, start: t.start, end: t.end })),
    subtitles: state.subtitles.map(c => ({
      text: c.text, start: c.start, end: c.end, segment: c.segment ?? 0 })),
    ...(Object.keys(state.edit.scenes || {}).length ? { scenes: state.edit.scenes } : {}),
    ...(headline ? { headline } : {}),
    ...(state.edit.sub_style ? { sub_style: state.edit.sub_style } : {}),
    ...(state.edit.logo?.file ? { logo: state.edit.logo } : {}),
  }
  return plan
}
