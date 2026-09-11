// ── ตรรกะการตัดสินใจ: เลือกช่องทาง · ให้คะแนนความเข้ากัน · สุ่มแบบคงที่ ──
//
// แยกออกมาจาก index.js เพราะนี่คือส่วนที่ "มีความเห็น" — เป็นกฎที่มาจาก
// ประสบการณ์ ไม่ใช่ข้อเท็จจริง ฉะนั้นเป็นจุดแรกที่ควรถูกแก้เมื่อมีข้อมูลจริง
// จากการยิงแอด (เช่น ถ้าพบว่า LINE OA ปิดการขายดีกว่าที่คิด ให้มาปรับน้ำหนักที่นี่)

import { CHANNELS } from "./templates.js"

// ── สุ่มแบบคงที่ ───────────────────────────────────────────────────────
// ทำไมไม่ใช้ Math.random: อินพุตเดียวกันต้องได้ผลเดิมเสมอ ไม่งั้นทดสอบไม่ได้
// และคนใช้จะงงว่าทำไมกดสองครั้งได้คนละอย่างทั้งที่กรอกเหมือนเดิม
// แต่ยังต้องมี "ความหลากหลาย" เมื่อเปลี่ยนหัวข้อ จึงใช้ hash ของอินพุตเป็นเมล็ด
export function hashSeed(str) {
  let h = 2166136261
  const s = String(str || "")
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** หยิบสมาชิกจาก array แบบคงที่ตามเมล็ด */
export function pickStable(arr, seed, offset = 0) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined
  return arr[(hashSeed(seed) + offset * 2654435761) % arr.length]
}

// ── น้ำหนักความเข้ากันของช่องทาง ───────────────────────────────────────
// ตัวเลข 0-3: 3 = เหมาะมาก · 0 = ใช้ได้แต่ไม่ใช่ที่แรกที่ควรลง
// ที่มาของน้ำหนัก: กลุ่มเจ้าของทรัพย์ตัวจริงอายุมากกว่าผู้ใช้ TikTok ทั่วไป
// ส่วนนักลงทุนและคนหาความรู้ยอมดูคลิปยาวกว่าและค้นหาข้อมูลเอง
const OBJECTIVE_FIT = {
  lead_owner:    { facebook: 3, "line-oa": 3, tiktok: 2, "youtube-shorts": 1, instagram: 1 },
  lead_seller:   { facebook: 3, "line-oa": 2, tiktok: 1, "youtube-shorts": 1, instagram: 1 },
  lead_investor: { facebook: 2, "line-oa": 3, instagram: 2, tiktok: 2, "youtube-shorts": 2 },
  awareness:     { tiktok: 3, facebook: 2, instagram: 2, "youtube-shorts": 2, "line-oa": 0 },
  education:     { tiktok: 3, "youtube-shorts": 3, facebook: 2, instagram: 1, "line-oa": 1 },
}

const CONTENT_FIT = {
  educate:              { tiktok: 3, "youtube-shorts": 3, facebook: 2, instagram: 1, "line-oa": 1 },
  "case-study":         { facebook: 3, "line-oa": 2, tiktok: 2, "youtube-shorts": 2, instagram: 1 },
  "property-highlight": { facebook: 3, instagram: 3, "line-oa": 2, tiktok: 2, "youtube-shorts": 1 },
  "behind-the-scenes":  { tiktok: 3, instagram: 2, facebook: 2, "youtube-shorts": 2, "line-oa": 0 },
  faq:                  { facebook: 3, "line-oa": 3, tiktok: 2, "youtube-shorts": 2, instagram: 1 },
}

/**
 * ให้คะแนนทุกช่องทางกับงานชิ้นนี้
 * @returns {Array<{id,label,score,reasons:string[]}>} เรียงจากคะแนนมากไปน้อย
 */
export function scoreChannels({ objective, contentType, channel }) {
  const rows = Object.values(CHANNELS).map(ch => {
    const byObj = OBJECTIVE_FIT[objective]?.[ch.id] ?? 1
    const byType = CONTENT_FIT[contentType]?.[ch.id] ?? 1
    const reasons = []
    if (byObj >= 3) reasons.push("ตรงกับกลุ่มเป้าหมายของวัตถุประสงค์นี้")
    if (byType >= 3) reasons.push("รูปแบบคอนเทนต์นี้ทำงานได้ดีบนช่องนี้")
    if (byObj <= 1 && byType <= 1) reasons.push("ไม่ใช่ช่องแรกที่ควรลงสำหรับงานชิ้นนี้")
    // ช่องที่ผู้ใช้เลือกเองได้แต้มพิเศษ — เขารู้บริบทที่เราไม่รู้ (เช่นมีฐานผู้ติดตามอยู่แล้ว)
    const chosen = ch.id === channel ? 1 : 0
    return { id: ch.id, label: ch.label, score: byObj + byType + chosen, reasons }
  })
  return rows.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
}

/**
 * ข้อความแนะนำช่องทางเป็นภาษาไทย — บอกทั้งช่องที่เลือกและช่องที่ควรทำซ้ำ
 */
export function recommendChannel({ objective, contentType, channel }) {
  const ranked = scoreChannels({ objective, contentType, channel })
  const best = ranked[0]
  const chosen = ranked.find(r => r.id === channel) || best
  const second = ranked.find(r => r.id !== chosen.id)

  const parts = []
  if (chosen.id === best.id) {
    parts.push(`${chosen.label} เหมาะกับงานชิ้นนี้ที่สุดแล้ว`)
  } else {
    parts.push(`${chosen.label} ใช้ได้ แต่ ${best.label} น่าจะได้ผลกว่าสำหรับวัตถุประสงค์นี้`)
  }
  if (chosen.reasons.length) parts.push(chosen.reasons[0])

  const ch = CHANNELS[chosen.id]
  if (ch) {
    parts.push(`รูปแบบสื่อที่ควรใช้: ${ch.media}`)
    parts.push(`เวลาที่คนอยู่ในแพลตฟอร์มเยอะ: ${ch.bestTimes.join(" · ")}`)
  }
  if (second) parts.push(`ถ้าจะทำซ้ำอีกช่อง แนะนำ ${second.label}`)
  return parts.join(" · ")
}

/**
 * เวลาที่ควรตั้งโพสต์ — คืนช่วงแรกของช่องนั้น
 * ตั้งใจคืนเป็น "ช่วงเวลา" ไม่ใช่ timestamp เพราะโมดูลนี้ไม่ควรรู้เรื่อง timezone
 * ของระบบปลายทาง ให้ฝั่ง AssetX แปลงเป็นเวลาจริงเอง
 */
export function suggestSchedule(channelId) {
  const ch = CHANNELS[channelId]
  if (!ch || !ch.bestTimes?.length) return undefined
  return ch.bestTimes[0]
}

/**
 * คะแนนคุณภาพคร่าว ๆ ของแคปชั่นที่ได้ — ไว้ให้หน้าเว็บโชว์เป็นสัญญาณ
 * ไม่ใช่การตัดสิน แค่ชี้จุดที่มักพลาด
 */
export function scoreCaption(caption, channelId) {
  const ch = CHANNELS[channelId]
  const text = String(caption || "")
  const first = text.split("\n")[0] || ""
  const checks = []
  let score = 100

  if (!first.trim()) { score -= 40; checks.push("ไม่มีบรรทัดเปิด") }
  if (ch && first.length > ch.hookChars) {
    score -= 15
    checks.push(`บรรทัดเปิดยาว ${first.length} ตัว เกินระยะที่คนเห็นก่อนกดดูเพิ่ม (${ch.hookChars})`)
  }
  if (ch && text.length > ch.captionMax) {
    score -= 15
    checks.push(`ยาวเกินระยะที่คนอ่านจบบน ${ch.label}`)
  }
  if (!/[?？]/.test(text) && !/(ทัก|สอบถาม|ติดต่อ|ดูเพิ่ม|กดติดตาม)/.test(text)) {
    score -= 10
    checks.push("ไม่มีทั้งคำถามและคำชวนให้ทำอะไรต่อ")
  }
  if (text.split("\n").filter(Boolean).length < 2) {
    score -= 10
    checks.push("เป็นย่อหน้าเดียวยาว ๆ อ่านบนมือถือยาก")
  }
  return { score: Math.max(0, score), checks }
}

// ── วัดความซ้ำของแคปชั่น ───────────────────────────────────────────────
//
// ทำไมต้อง 4-gram ระดับตัวอักษร ไม่ใช่เทียบทั้งสตริงหรือเทียบคำ:
//   ภาษาไทยไม่เว้นวรรคระหว่างคำ การตัดคำจึงไม่แน่นอน · การเทียบทั้งสตริง
//   แพ้ทันทีเมื่อสลับประโยคหรือเปลี่ยนชื่อทรัพย์ · 4-gram ทนทั้งสองอย่าง
//
// ⚠️ ต้องถอดแฮชแท็กและอีโมจิก่อนเทียบ — สองโพสต์ที่ต่างแค่อีโมจิคือ "ซ้ำ"
//    ในสายตาคนอ่าน (เคสจริงจากระบบต้นทาง: สองชิ้นต่างกันแค่ชื่อรุ่นสินค้า วัดได้ 88%)
export const SIMILAR_LIMIT = 0.5

function normalizeForCompare(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/#\S+/g, " ")
    .replace(/[^฀-๿a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function grams(s, n = 4) {
  const t = normalizeForCompare(s).replace(/ /g, "")
  const set = new Set()
  for (let i = 0; i + n <= t.length; i++) set.add(t.slice(i, i + n))
  return set
}

/** ความคล้ายของข้อความสองก้อน 0-1 (Jaccard บน 4-gram) */
export function similarity(a, b) {
  const A = grams(a), B = grams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / (A.size + B.size - inter)
}

/**
 * แคปชั่นใหม่ซ้ำกับของเก่าไหม
 * @param {string} caption
 * @param {Array<{id?:any, caption:string}>|string[]} recent โพสต์ล่าสุด (แนะนำ 8 ชิ้น)
 * @returns {{similar:boolean, score:number, match:object|null}}
 *
 * ⚠️ ตั้งใจ "ไม่ทิ้งอัตโนมัติ" — คืนผลให้หน้าเว็บขึ้นป้ายเตือนแล้วให้คนตัดสิน
 *    (ระบบต้นทางเรียนมาแล้วว่าการทิ้งเองทำให้ของที่ใช้ได้หายไปเงียบ ๆ)
 */
export function checkDuplicate(caption, recent = [], limit = SIMILAR_LIMIT) {
  let best = { similar: false, score: 0, match: null }
  for (const item of recent) {
    const text = typeof item === "string" ? item : item?.caption
    if (!text) continue
    const score = similarity(caption, text)
    if (score > best.score) {
      best = { similar: score >= limit, score: Math.round(score * 100) / 100, match: item }
    }
  }
  return best
}

export default {
  hashSeed, pickStable, scoreChannels, recommendChannel, suggestSchedule, scoreCaption,
  similarity, checkDuplicate, SIMILAR_LIMIT,
}
