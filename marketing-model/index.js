// ── marketing-model · จุดเข้าใช้งานหลัก ─────────────────────────────────
//
// โมดูลนี้แปลง "โจทย์การตลาด" หนึ่งชุด เป็นชุดคอนเทนต์พร้อมใช้:
// พาดหัว · แคปชั่น · บรีฟภาพ · สคริปต์วิดีโอ · แฮชแท็ก · CTA · ช่องทาง · payload สำหรับ automation
//
// หลักการออกแบบสามข้อ:
//
// 1. **ทำงานได้โดยไม่มีเน็ตและไม่มี API key**
//    `runMarketingModel(input)` เป็นฟังก์ชันธรรมดา ไม่ async ไม่เรียกใคร
//    ได้ผลลัพธ์ภาษาไทยที่ใช้ได้จริงทันที · LLM เป็น "ตัวยกระดับ" ไม่ใช่เงื่อนไขบังคับ
//    เหตุผล: หน้าเว็บต้องมีของให้ผู้ใช้เห็นทันทีที่กด ไม่ใช่หมุนรอ แล้วพังถ้าโควตาหมด
//
// 2. **ไม่รู้จัก provider ใด ๆ**
//    ถ้าจะใช้ LLM ให้ส่ง fetcher เข้ามาเอง (ดู runMarketingModelWithLLM)
//    โมดูลนี้ไม่มี key ไม่มี endpoint ไม่มี SDK
//
// 3. **ผลลัพธ์เดิมสำหรับอินพุตเดิม**
//    ความหลากหลายของถ้อยคำมาจาก hash ของอินพุต ไม่ใช่ Math.random
//    → ทดสอบได้ · ผู้ใช้ไม่งงว่าทำไมกดซ้ำแล้วเปลี่ยน
//
// ⚠️ โมดูลนี้ทำงานฝั่งไหนก็ได้ (เบราว์เซอร์/Node) เพราะไม่แตะ fs, env, network
//    แต่ "การเรียก LLM จริง" ต้องทำฝั่ง server เท่านั้น — อย่าเอา API key มาไว้ฝั่งเว็บ

import {
  CHANNELS, CONTENT_TYPES, TONES, OBJECTIVES, HASHTAGS, ASSET_TYPES,
  BEATS, OBJECTIVE_QUESTIONS, VISUAL_DEVICES, IMAGE_RULES, VIDEO_BEAT_GUIDE,
  HEADLINES, HEADLINES_BY_CONTENT,
} from "./templates.js"
import { checkText, checkStructure, formatWarnings, SEVERITY } from "./rules.js"
import {
  pickStable, recommendChannel, suggestSchedule, scoreCaption, scoreChannels, checkDuplicate,
} from "./scoring.js"
import {
  buildAllPrompts, buildCaptionPrompt, buildImageBriefPrompt, buildVideoScriptPrompt,
} from "./prompts.js"

// ── ตัวช่วยจับคู่ค่าที่ผู้ใช้พิมพ์อิสระ เข้ากับตัวเลือกที่ระบบรู้จัก ──────
// ผู้ใช้พิมพ์ "ติ๊กต็อก" / "TikTok" / "tiktok" ต้องได้ผลเดียวกัน
// และถ้าจับไม่ได้เลย ต้องมีค่าปริยาย + เตือน ไม่ใช่พัง
function matchByAlias(value, dict, fallbackKey) {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return { key: fallbackKey, matched: false }
  if (dict[raw]) return { key: raw, matched: true }
  for (const [key, spec] of Object.entries(dict)) {
    if (key.toLowerCase() === raw) return { key, matched: true }
    const names = [spec.label, ...(spec.aliases || [])].filter(Boolean)
    for (const n of names) {
      const low = String(n).toLowerCase()
      if (raw === low || raw.includes(low) || low.includes(raw)) return { key, matched: true }
    }
  }
  return { key: fallbackKey, matched: false }
}

// ── ตัดพาดหัวไทยโดยไม่ตัดกลางคำ ────────────────────────────────────────
// ยกมาจากระบบต้นทาง (ดู README หัวข้อ "logic ที่ยกมา")
// ภาษาไทยไม่เว้นวรรคระหว่างคำ แต่เว้นที่ขอบวลี → ช่องว่างคือจุดตัดที่ปลอดภัย
// และห้ามจบพาดหัวด้วยสระหน้า (เ แ โ ใ ไ) หรือตัดหน้าสระบน/ล่าง เพราะคำจะขาดครึ่ง
export const HEAD_MAX = 30
export const SUB_MAX = 62
const HEAD_HARD = 46
const COMBINING = /[ัิ-ฺ็-๎]/
const LEADING_VOWEL = /[เ-ไ]/
const CONJ = ["แต่", "เพราะ", "จนกว่า", "จนถึง", "แล้ว", "ถ้า", "หาก", "ซึ่ง", "จึง", "ก่อนที่", "หลังจาก", "พร้อม"]
const SEP = /[—–·:|…]/

function cutThai(s, limit) {
  const t = String(s || "").trim()
  if (t.length <= limit) return { head: t, rest: "" }

  // 1) ตัวคั่นชัดเจน — ผู้เขียนตั้งใจแบ่งความตรงนั้นอยู่แล้ว
  for (let i = Math.min(limit, t.length - 1); i > limit * 0.4; i--) {
    if (SEP.test(t[i])) return { head: t.slice(0, i).trim(), rest: t.slice(i + 1).trim() }
  }
  // 2) คำเชื่อมที่มีช่องว่างนำหน้า (ต้องมีช่องว่าง ไม่งั้น "แต่" จะไปเจอใน "ตั้งแต่")
  let best = -1
  for (const c of CONJ) {
    let from = 0
    for (;;) {
      const at = t.indexOf(" " + c, from)
      if (at < 0 || at > limit) break
      if (at > best && at > limit * 0.35) best = at
      from = at + 1
    }
  }
  if (best > 0) return { head: t.slice(0, best).trim(), rest: t.slice(best).trim() }
  // 3) ช่องว่างธรรมดา = ขอบวลีในภาษาไทย
  const sp = t.lastIndexOf(" ", limit)
  if (sp > limit * 0.35) return { head: t.slice(0, sp).trim(), rest: t.slice(sp).trim() }
  // 4) ยืดไปหาช่องว่างถัดไป ดีกว่าตัดกลางคำ
  const next = t.indexOf(" ", limit)
  if (next > 0 && next <= HEAD_HARD) return { head: t.slice(0, next).trim(), rest: t.slice(next).trim() }
  // 5) ไม่มีช่องว่างเลย — ถอยจนจุดตัดไม่ผ่ากลางคำ
  let i = Math.min(limit, t.length)
  while (i > 1 && (COMBINING.test(t[i] || "") || LEADING_VOWEL.test(t[i - 1]))) i--
  return { head: t.slice(0, i).trim(), rest: t.slice(i).trim() }
}

/** แคปชั่น → {headline, sub} · sub เป็น "" ได้ */
export function splitHeadline(caption) {
  const clean = String(caption || "").replace(/#\S+/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return { headline: "", sub: "" }
  const first = cutThai(clean, HEAD_MAX)
  let subSource = first.rest
  if (!subSource) {
    const paras = String(caption || "").split("\n").map(s => s.trim()).filter(Boolean)
    subSource = (paras[1] || "").replace(/#\S+/g, " ").replace(/\s+/g, " ").trim()
  }
  return { headline: first.head, sub: subSource ? cutThai(subSource, SUB_MAX).head : "" }
}

// ── แปลงข้อมูลทรัพย์เป็นข้อความสเปก (ใช้เฉพาะค่าที่มีจริง) ──────────────
// ⚠️ ห้ามเดา ห้ามคำนวณต่อ ห้ามเติมหน่วยที่ไม่ได้ส่งมา
const SPEC_FIELDS = [
  { keys: ["areaRai", "rai", "ไร่"], fmt: v => `${v} ไร่` },
  { keys: ["areaNgan", "ngan", "งาน"], fmt: v => `${v} งาน` },
  { keys: ["areaWa", "wa", "ตารางวา", "sqwa"], fmt: v => `${v} ตารางวา` },
  { keys: ["areaSqm", "sqm", "ตารางเมตร"], fmt: v => `${v} ตารางเมตร` },
  { keys: ["deedType", "deed", "เอกสารสิทธิ์"], fmt: v => `เอกสารสิทธิ์ ${v}` },
  { keys: ["price", "ราคา"], fmt: v => `ราคา ${formatMoney(v)}` },
  { keys: ["pricePerWa"], fmt: v => `ตารางวาละ ${formatMoney(v)}` },
  { keys: ["roadWidth", "หน้ากว้าง", "width"], fmt: v => `หน้ากว้าง ${v} เมตร` },
  { keys: ["bedrooms", "ห้องนอน"], fmt: v => `${v} ห้องนอน` },
  { keys: ["bathrooms", "ห้องน้ำ"], fmt: v => `${v} ห้องน้ำ` },
  { keys: ["landmark", "nearby", "ใกล้"], fmt: v => `ใกล้ ${v}` },
  { keys: ["utilities", "สาธารณูปโภค"], fmt: v => `${v}` },
]

function formatMoney(v) {
  const n = Number(String(v).replace(/[, ]/g, ""))
  if (!Number.isFinite(n)) return String(v)
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(2).replace(/\.?0+$/, "")} ล้านบาท`
  }
  return `${n.toLocaleString("th-TH")} บาท`
}

function buildSpecs(propertyData) {
  if (!propertyData || typeof propertyData !== "object") return ""
  const parts = []
  for (const field of SPEC_FIELDS) {
    for (const k of field.keys) {
      const v = propertyData[k]
      if (v !== undefined && v !== null && v !== "") { parts.push(field.fmt(v)); break }
    }
  }
  return parts.join(" · ")
}

// ── ประกอบร่างอินพุต ───────────────────────────────────────────────────
function resolveInput(input = {}) {
  const objective = matchByAlias(input.objective, OBJECTIVES, "awareness")
  const contentType = matchByAlias(input.contentType, CONTENT_TYPES, "educate")
  const channel = matchByAlias(input.channel, CHANNELS, "facebook")
  const tone = matchByAlias(input.tone, TONES, "trustworthy")
  const asset = matchByAlias(input.assetType, ASSET_TYPES, "other")

  const objectiveSpec = OBJECTIVES[objective.key]
  const contentTypeSpec = CONTENT_TYPES[contentType.key]
  const channelSpec = CHANNELS[channel.key]
  const toneSpec = TONES[tone.key]
  const assetSpec = ASSET_TYPES[asset.key]

  return {
    objective: objective.key,
    contentType: contentType.key,
    channel: channel.key,
    tone: tone.key,
    assetType: asset.key,
    objectiveSpec, contentTypeSpec, channelSpec, toneSpec, assetSpec,
    objectiveLabel: objectiveSpec.label,
    audienceDefault: objectiveSpec.audienceDefault,
    assetLabel: input.assetType?.trim() || assetSpec.label,
    provinceLabel: input.province?.trim() || "พื้นที่ที่ให้บริการ",
    visualDevice: VISUAL_DEVICES[contentType.key] || VISUAL_DEVICES.educate,
    specs: buildSpecs(input.propertyData),
    unmatched: {
      objective: !objective.matched && !!input.objective,
      contentType: !contentType.matched && !!input.contentType,
      channel: !channel.matched && !!input.channel,
      tone: !tone.matched && !!input.tone,
    },
    seed: [input.objective, input.audience, input.offer, input.assetType,
           input.province, input.contentType, input.tone].join("|"),
  }
}

// ── ประกอบแคปชั่นจากโครง beat ──────────────────────────────────────────
function fillTokens(line, r, input) {
  return String(line || "")
    .replace(/\{asset\}/g, r.assetLabel)
    .replace(/\{province\}/g, r.provinceLabel)
    .replace(/\{offer\}/g, input.offer?.trim() || "ให้ทีมช่วยดูข้อมูลเบื้องต้นให้ก่อน")
    .replace(/\{specs\}/g, r.specs)
    .replace(/\{objectiveQuestion\}/g, OBJECTIVE_QUESTIONS[r.objective] || OBJECTIVE_QUESTIONS.education)
    .replace(/\s+/g, " ")
    .trim()
}

// beat ที่ตัดทิ้งได้เมื่อแคปชั่นยาวเกินระยะที่คนอ่านจบ
// เลือกจากบทบาท: ตัวขยายความตัดได้ · ตะขอ/ข้อกำกับกฎหมาย/CTA ตัดไม่ได้
const TRIMMABLE = new Set([
  "common_misunderstanding", "why_interesting", "location_context",
  "why_it_matters", "standard_we_keep", "detail", "problem",
])

// ช่องที่แคปชั่นสั้นมาก (TikTok / Shorts) — แคปชั่นไม่ใช่ที่เล่าเนื้อหา
// หน้าที่ของมันคือ "เสริมคลิป" ไม่ใช่เล่าซ้ำสิ่งที่พูดในคลิป
// เนื้อหาเต็ม (รวมบรรทัดกำกับกฎหมาย) อยู่ในสคริปต์วิดีโอแทน
const SHORT_FORM_MAX = 200

function buildCaption(input, r, cta) {
  const parts = []
  const shortForm = r.channelSpec.captionMax <= SHORT_FORM_MAX
  // โครงสั้น: ตะขอหนึ่งบรรทัด + ชวนทำต่อ จบ
  const beats = shortForm
    ? [r.contentTypeSpec.beats[0], "cta"]
    : r.contentTypeSpec.beats
  beats.forEach((beat, i) => {
    // beat ที่ต้องใช้ข้อมูลทรัพย์ แต่ไม่มีข้อมูล = ข้ามไป ดีกว่าโชว์ช่องว่าง
    if (beat === "key_specs" && !r.specs) return
    const picked = beat === "cta" ? cta : pickStable(BEATS[beat], r.seed, i)
    if (!picked) return
    const text = beat === "cta" ? picked : fillTokens(picked, r, input)
    if (text) parts.push({ beat, text })
  })

  // ยาวเกินระยะที่คนอ่านจบ = เสียเปล่าแม้เนื้อหาดี — ตัดตัวขยายความออกทีละอัน
  // จากท้ายมาหน้า (ท้ายคือส่วนที่คนอ่านถึงน้อยที่สุดอยู่แล้ว)
  const budget = r.channelSpec.captionMax
  const total = () => parts.reduce((n, p) => n + p.text.length + 2, 0)
  for (let i = parts.length - 1; i >= 0 && total() > budget; i--) {
    if (TRIMMABLE.has(parts[i].beat)) parts.splice(i, 1)
  }
  return parts.map(p => p.text).join("\n\n")
}

// พาดหัวมาจากคลังพาดหัวโดยตรง ไม่ใช่ตัดจากแคปชั่น
//
// ⚠️ ทำไมไม่ตัดจากบรรทัดแรกของแคปชั่น: พาดหัวคือ "ข้อความบนภาพ" ซึ่งต้องอ่าน
//    รู้เรื่องเมื่ออยู่เดี่ยว ๆ และต้องสั้นพอให้อ่านออกตอนย่อเป็นภาพเล็ก
//    บรรทัดแรกของแคปชั่นถูกเขียนมาให้ "ต่อ" กับบรรทัดถัดไป พอตัดมาลอย ๆ
//    มักได้เศษประโยค (เช่น "หลายคนถามว่า") ซึ่งไม่ได้ความอะไรเลย
//    splitHeadline ยังมีไว้ใช้กับแคปชั่นที่มาจาก LLM หรือที่คนเขียนเอง
function buildHeadline(input, r) {
  const pool = HEADLINES_BY_CONTENT[r.contentType] || HEADLINES[r.objective] || HEADLINES.awareness
  const picked = pickStable(pool, r.seed)
  const filled = fillTokens(picked || "", r, input)
  // เกินเพดานเมื่อไหร่ ให้ตัดด้วยกติกาไทย ไม่ตัดกลางคำ
  return filled.length <= HEAD_MAX ? filled : cutThai(filled, HEAD_MAX).head
}

function buildHashtags(input, r) {
  const ch = r.channelSpec
  if (!ch.hashtagCount) return []
  const pool = [
    ...HASHTAGS.byObjective[r.objective] || [],
    ...HASHTAGS.byAsset[r.assetType] || [],
    ...HASHTAGS.core,
  ]
  // จังหวัดเป็นแท็กที่ตรงกลุ่มที่สุด — คนหาทรัพย์ค้นด้วยชื่อพื้นที่เสมอ
  if (input.province?.trim()) {
    const p = input.province.trim().replace(/\s+/g, "")
    pool.unshift(`อสังหา${p}`, `ที่ดิน${p}`)
  }
  const seen = new Set()
  const out = []
  for (const tag of pool) {
    const clean = String(tag).replace(/^#/, "").replace(/\s+/g, "")
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
    if (out.length >= ch.hashtagCount) break
  }
  return out
}

// ── บรีฟภาพแบบไม่ใช้ LLM ───────────────────────────────────────────────
// เขียนเป็นภาษาอังกฤษเพราะโมเดลสร้างภาพเข้าใจอังกฤษดีกว่ามาก
// และจงใจปิดท้ายด้วยข้อห้ามเรื่องตัวอักษร เพราะเป็นจุดที่พังบ่อยที่สุด
function buildImagePrompt(input, r) {
  const subject = {
    land: "an open plot of land with clear boundary markers, rural Thai landscape",
    house: "a Thai suburban house exterior with its front yard",
    condo: "a modern Thai condominium building exterior",
    commercial: "a Thai commercial shophouse row",
    factory: "an industrial warehouse building in Thailand",
    other: "a Thai property consultation scene on a desk with documents",
  }[r.assetType] || "a Thai property consultation scene"

  const mood = {
    trustworthy: "clean, neutral, documentary photography, natural daylight",
    professional: "editorial photography, soft shadows, composed and calm",
    simple: "warm friendly natural light, approachable everyday feel",
    urgent: "clear bright daylight, straightforward and factual",
  }[r.tone] || "clean documentary photography, natural daylight"

  const ratio = r.channelSpec.media.includes("9:16") ? "vertical 9:16"
    : r.channelSpec.media.includes("4:5") ? "vertical 4:5" : "square 1:1"

  return [
    `${ratio} marketing photograph for a Thai real-estate consultancy.`,
    `Composition idea: ${r.visualDevice}.`,
    `Subject: ${subject}.`,
    `Mood: ${mood}.`,
    "Leave clean empty space in the upper third for a Thai headline to be overlaid later.",
    "NO text, NO letters, NO numbers, NO logos, NO watermarks anywhere in the image.",
    "No document numbers, no title-deed details, no recognisable faces.",
    "Photorealistic, not illustrated, not over-stylised.",
  ].join(" ")
}

// ── สคริปต์วิดีโอแบบไม่ใช้ LLM ─────────────────────────────────────────
// หนึ่งบรรทัด = หนึ่งฉาก (กติกาเดียวกับโรงงานวิดีโอของระบบต้นทาง)
function buildVideoScript(input, r, cta) {
  const beats = r.contentTypeSpec.videoBeats || ["hook", "detail", "cta"]
  const map = {
    hook: () => `${r.assetLabel}ใน${r.provinceLabel} เรื่องนี้หลายคนยังเข้าใจไม่ตรงกัน`,
    myth: () => "หลายคนคิดว่าทุกทางเลือกเหมือนกันหมด",
    truth: () => "จริง ๆ แล้วเงื่อนไขและระยะเวลาต่างกันมาก",
    how_to_check: () => "ก่อนเซ็นให้ดูสามอย่าง ระยะเวลา จำนวนเงินที่ต้องใช้ไถ่ถอน และค่าใช้จ่ายทั้งหมด",
    situation: () => `เจ้าของ${r.assetLabel}ใน${r.provinceLabel} ต้องการเงินก้อนในเวลาจำกัด`,
    process: () => "ทีมเริ่มจากตรวจเอกสารสิทธิ์ แล้วลงดูทำเลจริง",
    outcome: () => "จบด้วยทางเลือกที่เจ้าของเข้าใจเงื่อนไขครบก่อนตัดสินใจ",
    walkthrough: () => `พาดู${r.assetLabel}ตัวจริงกัน`,
    specs: () => r.specs || "รายละเอียดทรัพย์สอบถามเพิ่มเติมได้",
    location: () => `ทำเลอยู่ที่${r.provinceLabel}`,
    scene: () => `วันนี้ทีมลงพื้นที่${r.provinceLabel}`,
    standard: () => "สิ่งที่ยึดไว้เสมอคืออธิบายให้ครบก่อน ไม่เร่งให้ตัดสินใจ",
    question: () => OBJECTIVE_QUESTIONS[r.objective] || OBJECTIVE_QUESTIONS.education,
    answer: () => "ตอบสั้น ๆ คือทำได้ แต่ขึ้นกับเอกสารสิทธิ์และเงื่อนไขของแต่ละกรณี",
    detail: () => input.offer?.trim() || "ทีมช่วยดูข้อมูลเบื้องต้นให้ได้ก่อนตัดสินใจ",
    caveat: () => "ข้อมูลนี้เป็นความรู้ทั่วไป แต่ละกรณีมีเงื่อนไขต่างกัน",
    cta: () => cta,
  }
  return beats.map(b => (map[b] ? map[b]() : "")).filter(Boolean).join("\n")
}

function estimateVideoSeconds(r) {
  const beats = r.contentTypeSpec.videoBeats || []
  return beats.reduce((sum, b) => sum + (VIDEO_BEAT_GUIDE[b]?.seconds || 4), 0)
}

// ── ตัวหลัก ────────────────────────────────────────────────────────────
/**
 * สร้างชุดคอนเทนต์การตลาดจากโจทย์หนึ่งชุด (ทำงานทันที ไม่ต้องต่อเน็ต)
 *
 * @param {object} input ดู schema.md
 * @returns {{headline:string, caption:string, imagePrompt:string, videoScript:string,
 *            hashtags:string[], cta:string, channelRecommendation:string,
 *            automationPayload:object, warnings:string[], meta:object}}
 */
export function runMarketingModel(input = {}, opts = {}) {
  const r = resolveInput(input)

  const cta = r.objectiveSpec.ctaByChannel[r.channel]
    || r.objectiveSpec.ctaByChannel.facebook
  const caption = buildCaption(input, r, cta)
  const headline = buildHeadline(input, r)
  const sub = splitHeadline(caption).headline      // บรรทัดรองบนภาพ มาจากเนื้อแคปชั่น
  const hashtags = buildHashtags(input, r)
  const imagePrompt = buildImagePrompt(input, r)
  const videoScript = buildVideoScript(input, r, cta)
  const channelRecommendation = recommendChannel(r)

  const output = { headline, caption, imagePrompt, videoScript, hashtags, cta, channelRecommendation }

  // ── ด่านตรวจ ──
  const findings = [
    ...checkText(input.offer, "ข้อเสนอที่กรอกมา"),
    ...checkText(input.campaignContext ? JSON.stringify(input.campaignContext) : "", "บริบทแคมเปญ"),
    ...checkText(caption, "แคปชั่น"),
    ...checkText(videoScript, "สคริปต์วิดีโอ"),
    ...checkStructure({ input, resolved: r, output }),
  ]
  // อินพุตไม่ครบ/จับคู่ไม่ได้ ต้องบอก ไม่ใช่เงียบแล้วใช้ค่าปริยาย
  const missing = []
  if (!input.objective) missing.push("objective")
  if (!input.audience) missing.push("audience")
  if (!input.offer) missing.push("offer")
  if (!input.province) missing.push("province")
  if (missing.length) {
    findings.push({
      id: "missing_input", severity: SEVERITY.INFO, where: "อินพุต",
      message: `ไม่ได้ส่ง ${missing.join(", ")} มา ระบบใช้ค่าปริยายแทน ซึ่งทำให้ข้อความกว้างกว่าที่ควร`,
      fix: "กรอกให้ครบเพื่อให้ข้อความเจาะกลุ่มได้ตรงขึ้น",
    })
  }
  for (const [field, notMatched] of Object.entries(r.unmatched)) {
    if (notMatched) {
      findings.push({
        id: "unmatched_value", severity: SEVERITY.INFO, where: "อินพุต",
        message: `ค่า ${field} ที่ส่งมา ระบบจับคู่กับตัวเลือกที่รู้จักไม่ได้ จึงใช้ค่าปริยาย`,
        fix: "ดูรายการค่าที่รองรับใน schema.md",
      })
    }
  }

  const quality = scoreCaption(caption, r.channel)

  // เทียบกับโพสต์ล่าสุดถ้าผู้เรียกส่งมา — ตั้งใจ "เตือน" ไม่ใช่ "ทิ้งเอง"
  const dup = opts.recentCaptions?.length ? checkDuplicate(caption, opts.recentCaptions) : null
  if (dup?.similar) {
    findings.push({
      id: "duplicate_caption", severity: SEVERITY.WARN, where: "ความซ้ำ",
      message: `แคปชั่นนี้คล้ายโพสต์ที่เคยลงไปแล้ว ${Math.round(dup.score * 100)}%`,
      fix: "เปลี่ยนประโยคเปิดและมุมที่เล่า หรือเลือกรูปแบบคอนเทนต์อื่น",
    })
  }

  return {
    ...output,
    automationPayload: {
      channel: r.channel,
      postText: hashtags.length ? `${caption}\n\n${hashtags.map(h => "#" + h).join(" ")}` : caption,
      creativeBrief: [
        `แนวคิดภาพ: ${r.visualDevice}`,
        `สัดส่วน/สื่อ: ${r.channelSpec.media}`,
        `ข้อความบนภาพ (ซ้อนทีหลัง ห้ามให้โมเดลเขียน): ${headline}${sub ? " / " + sub : ""}`,
        `prompt สำหรับโมเดลสร้างภาพ: ${imagePrompt}`,
        `กฎที่ต้องเคารพ: ${IMAGE_RULES.slice(0, 3).join(" · ")}`,
      ].join("\n"),
      videoBrief: [
        `ความยาวโดยประมาณ: ${estimateVideoSeconds(r)} วินาที`,
        "กติกา: หนึ่งบรรทัด = หนึ่งฉาก · ทุกบรรทัดถูกอ่านออกเสียง · ต้องมีซับไทยเพราะคนส่วนใหญ่ดูแบบปิดเสียง",
        "สคริปต์:",
        videoScript,
      ].join("\n"),
      suggestedSchedule: suggestSchedule(r.channel),
    },
    warnings: formatWarnings(findings),
    // meta ไม่อยู่ในสัญญาหลัก แต่มีไว้ให้หน้าเว็บโชว์สถานะและให้ระบบอื่นตัดสินใจต่อ
    meta: {
      resolved: {
        objective: r.objective, contentType: r.contentType, channel: r.channel,
        tone: r.tone, assetType: r.assetType, province: input.province || null,
      },
      subHeadline: sub,
      specs: r.specs || null,
      captionQuality: quality,
      duplicate: dup,
      channelRanking: scoreChannels(r).map(c => ({ id: c.id, label: c.label, score: c.score })),
      findings,                               // แบบมีโครงสร้าง ไว้ให้ UI แสดงทีละข้อ
      blocking: findings.some(f => f.severity === SEVERITY.BLOCK),
      generatedBy: "template",                // เปลี่ยนเป็น "llm" เมื่อผ่าน applyGenerated
      version: 1,
    },
  }
}

/**
 * เวอร์ชันที่ให้ LLM ช่วยเขียน — ต้องส่ง fetcher เข้ามาเอง
 *
 * @param {object} input
 * @param {object} opts
 * @param {(p:{system:string,user:string}) => Promise<string|object>} opts.generate
 *        ฟังก์ชันที่รับ {system,user} แล้วคืน JSON (เป็น object หรือ string ก็ได้)
 *        **ต้องเรียกจากฝั่ง server เท่านั้น** เพราะต้องใช้ API key
 * @param {string[]} [opts.parts] เลือกว่าจะให้ LLM ช่วยส่วนไหน
 *        ค่าปริยาย ["caption","videoScript","imageBrief"]
 * @returns {Promise<object>} รูปแบบเดียวกับ runMarketingModel
 *
 * ถ้า LLM ล้มหรือคืนของผิดรูป จะตกกลับไปใช้ผลจากเทมเพลตเงียบ ๆ แล้วใส่คำเตือนแทน
 * (บทเรียนจากระบบต้นทาง: ขั้นเสริมพังต้องไม่ทำให้ทั้งงานพัง)
 */
export async function runMarketingModelWithLLM(input = {}, opts = {}) {
  const base = runMarketingModel(input)
  const generate = opts.generate
  if (typeof generate !== "function") {
    base.warnings.push("ℹ️ ข้อแนะนำ [LLM] ไม่ได้ส่งฟังก์ชัน generate มา จึงใช้ผลจากเทมเพลตอย่างเดียว")
    return base
  }
  const parts = opts.parts || ["caption", "videoScript", "imageBrief"]
  const r = resolveInput(input)
  const extraWarnings = []

  const ask = async (prompt, label) => {
    try {
      const raw = await generate({ system: prompt.system, user: prompt.user })
      const obj = typeof raw === "string" ? JSON.parse(stripFence(raw)) : raw
      if (!obj || typeof obj !== "object") throw new Error("ผลลัพธ์ไม่ใช่ JSON")
      return obj
    } catch (e) {
      extraWarnings.push({
        id: "llm_failed", severity: SEVERITY.INFO, where: `LLM · ${label}`,
        message: `เรียกโมเดลไม่สำเร็จ (${String(e?.message || e).slice(0, 120)}) จึงใช้ข้อความจากเทมเพลตแทน`,
        fix: "ตรวจ API key และโควตาฝั่ง server",
      })
      return null
    }
  }

  let used = false

  if (parts.includes("caption")) {
    const got = await ask(buildCaptionPrompt(input, r), "แคปชั่น")
    if (got?.caption) {
      base.caption = String(got.caption).trim()
      base.headline = String(got.headline || "").trim() || splitHeadline(base.caption).headline
      if (got.cta) base.cta = String(got.cta).trim()
      if (Array.isArray(got.hashtags) && got.hashtags.length) {
        base.hashtags = got.hashtags
          .map(h => String(h).replace(/^#/, "").replace(/\s+/g, ""))
          .filter(Boolean)
          .slice(0, r.channelSpec.hashtagCount || 5)
      }
      used = true
    }
  }

  if (parts.includes("videoScript")) {
    const got = await ask(buildVideoScriptPrompt(input, r), "สคริปต์วิดีโอ")
    if (got?.script) { base.videoScript = String(got.script).trim(); used = true }
  }

  if (parts.includes("imageBrief")) {
    const got = await ask(buildImageBriefPrompt(input, r, base.caption), "บรีฟภาพ")
    if (got?.image_prompt) {
      base.imagePrompt = String(got.image_prompt).trim()
      base.meta.bigIdea = got.big_idea || null
      used = true
    }
  }

  // ⚠️ ต้องตรวจซ้ำหลัง LLM เสมอ — โมเดลชอบเติมคำขายของที่ด่านแรกไม่เคยเห็น
  const findings = [
    ...checkText(base.caption, "แคปชั่น (จาก LLM)"),
    ...checkText(base.videoScript, "สคริปต์วิดีโอ (จาก LLM)"),
    ...checkStructure({ input, resolved: r, output: base }),
    ...extraWarnings,
  ]
  base.meta.findings = findings
  base.meta.blocking = findings.some(f => f.severity === SEVERITY.BLOCK)
  base.meta.generatedBy = used ? "llm" : "template"
  base.meta.captionQuality = scoreCaption(base.caption, r.channel)
  base.warnings = formatWarnings(findings)
  base.automationPayload.postText = base.hashtags.length
    ? `${base.caption}\n\n${base.hashtags.map(h => "#" + h).join(" ")}`
    : base.caption
  return base
}

// โมเดลชอบห่อ JSON ด้วย ```json — ลอกออกก่อน parse
function stripFence(s) {
  return String(s).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim()
}

/** ประกอบ prompt ทั้งชุดโดยไม่เรียกโมเดล — ให้ฝั่ง server เอาไปยิงเอง */
export function getPrompts(input = {}) {
  const r = resolveInput(input)
  const base = runMarketingModel(input)
  return buildAllPrompts(input, r, base.caption)
}

/** รายการค่าที่รองรับ — ให้หน้าเว็บเอาไปทำ dropdown ได้โดยไม่ต้อง hardcode */
export function getOptions() {
  const list = dict => Object.values(dict).map(v => ({ id: v.id, label: v.label }))
  return {
    objectives: list(OBJECTIVES),
    contentTypes: list(CONTENT_TYPES),
    channels: list(CHANNELS),
    tones: list(TONES),
    assetTypes: list(ASSET_TYPES),
  }
}

export { CHANNELS, CONTENT_TYPES, TONES, OBJECTIVES, ASSET_TYPES } from "./templates.js"
export { checkText, findForeignChars, canPublish, SAFER_PHRASES } from "./rules.js"
export { scoreChannels, recommendChannel, similarity, checkDuplicate } from "./scoring.js"
export { buildReviewPrompt } from "./prompts.js"

export default {
  runMarketingModel, runMarketingModelWithLLM, getPrompts, getOptions, splitHeadline,
}
