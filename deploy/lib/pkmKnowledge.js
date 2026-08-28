// ความรู้ทางการ Pokémon TCG — ใช้ให้ระบบเขียนคอนเทนต์อ้างของจริงแทนการเดา
//
// ที่มา: asia.pokemon-card.com/th (เว็บทางการ Pokémon TCG ภาษาไทย)
// ไฟล์ข้อมูลสร้างด้วย `py -3 deploy/agents/pkm_kb.py` — snapshot รันเดือนละครั้งพอ
//
// ⚠️⚠️ ต่างจาก One Piece อย่างสำคัญ — อ่านก่อนแก้ไฟล์นี้
//
//   ซองที่เราขายเป็นการ์ด **ภาษาญี่ปุ่น** (ยืนยันจากรูปซองจริงครบทั้ง 3 ซอง 24 ส.ค. 2026)
//   แต่ข้อมูลชุดนี้มาจาก **ไลน์ภาษาไทย** — เกมเดียวกันแต่คนละการพิมพ์
//
//   ที่ใช้ได้เต็มที่ : ชื่อการ์ด · ค่าสถานะ · ท่าต่อสู้ · ความสามารถ · กฎการเล่น
//   ที่ห้ามใช้      : เลขการ์ด · รหัสชุด · บอกว่าใบไหนอยู่ในซองไหน
//
//   เหตุผลข้อสุดท้าย: ไลน์ไทยรวมชุดญี่ปุ่นสองชุดเป็นชุดเดียว
//   MA5 "เงามืดคุกคาม" = M4 ニンジャスピナー + M5 アビスアイ (83+81=164)
//   แต่เราขายเป็น 2 สินค้าแยกกัน → ข้อมูลไทยแยกไม่ออก
//
//   บล็อกที่ส่งเข้า prompt จึง **ไม่ใส่เลขการ์ดเลย** และปิดท้ายด้วยคำเตือนเสมอ
import { readFile } from "fs/promises"
import path from "path"

// เก็บ promise ไม่ใช่ผลลัพธ์ — คำขอที่เข้าพร้อมกันตอน instance ยังเย็นจะได้ไม่อ่านไฟล์ซ้ำ
let _cards = null
let _rules = null

// ⚠️ path ต้องเขียนเป็นสตริงตรง ๆ ห้ามส่งชื่อไฟล์ผ่านตัวแปร — Next ไล่หาไฟล์ที่ต้องแพ็ก
//    จากการอ่านโค้ด ถ้าเป็นตัวแปรมันมองไม่เห็นแล้วไฟล์จะหายตอน deploy
export function loadPkmCards() {
  _cards ??= readFile(path.join(process.cwd(), "tasks", "pkm_cards.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _cards
}

export function loadPkmRules() {
  _rules ??= readFile(path.join(process.cwd(), "tasks", "pkm_rules.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _rules
}

// skus.set_code เก็บรหัส **ญี่ปุ่น** (ของจริงบนซอง) แต่ไฟล์ข้อมูลเป็นรหัส **ไทย**
// ต้องมีตารางแปลง — และ M4 กับ M5 ชี้ไปชุดไทยเดียวกันเพราะไทยรวมสองชุดเข้าด้วยกัน
const JP_TO_TH = { M2A: "MA3", M4: "MA5", M5: "MA5" }

export function findPkmSet(cards, setCode) {
  if (!cards || !setCode) return null
  const k = String(setCode).toUpperCase().replace(/[^A-Z0-9]/g, "")
  const th = JP_TO_TH[k] || k
  return cards.sets.find(s => String(s.code).toUpperCase() === th) || null
}

/**
 * การ์ดที่เอาไปพูดถึงในโพสต์ได้
 *
 * ไฟล์นี้ไม่มีฟิลด์ระดับความหายาก (เว็บไม่ให้มา) — ใช้ "ชื่อลงท้าย ex" เป็นตัวชี้ตัวชูโรง
 * เพราะการ์ด ex คือใบที่คนเปิดซองตามหา แล้วเรียงต่อด้วย HP
 */
export function notablePkmCards(set, limit = 8) {
  if (!set?.cards?.length) return []
  const isEx = c => /\bex\b/i.test(c.name || "")
  const byHp = (a, b) => (b.hp || 0) - (a.hp || 0)
  const ex = set.cards.filter(isEx).sort(byHp)
  const rest = set.cards.filter(c => !isEx(c) && c.hp).sort(byHp)
  // ตัดชื่อซ้ำ — การ์ดชื่อเดียวกันคนละการพิมพ์ไม่ต้องโชว์ซ้ำในบล็อกเดียว
  const seen = new Set()
  return [...ex, ...rest].filter(c => {
    if (seen.has(c.name)) return false
    seen.add(c.name)
    return true
  }).slice(0, limit)
}

// ── การ์ดที่ "อนุญาตให้ปรากฏในภาพ" ──────────────────────────────────────
//
// ⚠️ ทำไมต้องแยกจาก notablePkmCards:
//   ตัวนั้นเลือก "ใบที่น่าพูดถึง" (ex · HP สูง) ซึ่งเหมาะกับแคปชั่น
//   แต่ภาพต้องการ "ใบที่วางในฉากนั้นได้จริงตามกติกา" ซึ่งคนละเกณฑ์กันเลย
//
//   เกิดจริง 28 ส.ค. 2026: โปสเตอร์ #37 สอนเรื่องวางโปเกมอนบนเบนช์
//   แล้วโมเดลวาดการ์ดขึ้นเอง 6 ใบ — ปิกาจูโผล่สองใบ HP ไม่เท่ากัน (60 กับ 70)
//   ซึ่งเป็นไปไม่ได้ · เจ้าของขอให้บรีฟ "ระบุเจาะจงว่าต้องใช้ใบไหน"
//
// ⚠️ stage สำคัญที่สุดสำหรับโพสต์สอนกฎ — บนเบนช์วางได้แค่ "พื้นฐาน"
//    ถ้าไม่กรอง โมเดลจะหยิบร่าง 2 ไปวางบนเบนช์ แล้วโพสต์สอนกฎก็สอนผิด
const STAGE_WORDS = {
  พื้นฐาน: /เบนช์|bench|พื้นฐาน|basic|เริ่มเกม|เทิร์นแรก|ตั้งโต๊ะ|วางโปเกมอน/i,
}

/**
 * รายชื่อการ์ดจริงที่ใช้ประกอบภาพได้ — คืน [] ถ้าไม่มีชุดตรง
 *
 * @param {object} set  ชุดจาก findPkmSet
 * @param {string} topic แคปชั่น/หัวข้อ ใช้เดาว่าฉากต้องการการ์ดขั้นไหน
 * @param {number} limit
 */
export function artworkPkmCards(set, topic = "", limit = 6) {
  if (!set?.cards?.length) return []

  // ฉากต้องการขั้นไหน — ไม่เข้าเงื่อนไขไหนเลยก็ไม่กรอง
  const wantStage = Object.keys(STAGE_WORDS).find(s => STAGE_WORDS[s].test(topic))
  let pool = set.cards.filter(c => c.category === "โปเกมอน" && c.hp)
  if (wantStage) pool = pool.filter(c => c.stage === wantStage)
  if (!pool.length) return []

  // ใบที่แคปชั่นเอ่ยชื่อไว้ต้องได้ไปก่อน — ภาพจะได้ตรงกับเรื่องที่เล่า
  const named = pool.filter(c => c.name && topic.includes(c.name))

  // ⚠️ เกณฑ์เรียงต่างกันตามงานของภาพ:
  //   ฉากสอนกติกา (มี wantStage) → เอาใบธรรมดา HP ต่ำก่อน
  //     เพราะภาพสอนตั้งโต๊ะที่เบนช์เต็มไปด้วย Mega ex 280 HP ไม่ใช่ภาพที่เกิดขึ้นจริง
  //     ตอนเริ่มเกม คนอ่านที่เล่นเป็นจะรู้สึกผิดที่ทันที
  //   ฉากอวดการ์ด (ไม่กรองขั้น) → ex และ HP สูงก่อน เพราะนั่นคือใบที่คนตามหา
  const isEx = c => /\bex\b/i.test(c.name || "")
  const rest = pool.filter(c => !named.includes(c)).sort((a, b) => wantStage
    ? (isEx(a) - isEx(b)) || (a.hp || 0) - (b.hp || 0)
    : (isEx(b) - isEx(a)) || (b.hp || 0) - (a.hp || 0))

  const seen = new Set()
  return [...named, ...rest].filter(c => {
    if (seen.has(c.name)) return false      // ชื่อซ้ำคนละการพิมพ์ = ใบเดียวกันในสายตาคนอ่าน
    seen.add(c.name)
    return true
  }).slice(0, limit)
}

// ตัดขึ้นบรรทัดที่ติดมาจากเว็บทางการออก — ในคลังเก็บเป็น \r\n กลางประโยค
const flat = s => String(s || "").replace(/\s+/g, " ").trim()

/**
 * @param {object} c การ์ด
 * @param {boolean} detail ใส่คำอธิบายท่า/ความสามารถเต็ม ๆ ไหม
 *
 * ⚠️ detail เพิ่ม 27 ส.ค. 2026 — เดิมส่งเข้า prompt แค่ "ชื่อท่า + แดเมจ"
 *    โพสต์แนวเจาะการ์ดรายใบจึงเขียนได้แค่ 'พร้อมความสามารถ เปลวไฟต้องสาป'
 *    แล้วจบ อธิบายไม่ได้ว่ามันทำอะไร ทั้งที่คลังมีข้อความเต็มอยู่ในฟิลด์ effect
 *    ซึ่งคือทั้งหมดของคุณค่าคอนเทนต์ให้ความรู้
 *
 * ⚠️ เปิด detail เฉพาะตอนโพสต์แนวความรู้ ไม่ใช่ทุกโพสต์ — การ์ดเด่น 8 ใบ
 *    คูณคำอธิบายเต็มจะกิน prompt เพิ่มหลายพันตัวอักษรโดยที่โพสต์ขายไม่ได้ใช้
 */
function cardLine(c, detail = false) {
  const bits = [
    c.category === "โปเกมอน" ? `HP ${c.hp}` : c.category,
    (c.types || []).join("/"),
    c.stage,
  ].filter(Boolean)
  // ⚠️ ไม่ใส่ collector_number เด็ดขาด — เลขไทยไม่ตรงกับเลขบนการ์ดญี่ปุ่นในซองเรา
  const head = `${c.name} (${bits.join(" · ")})`

  const skills = c.skills || []
  if (!detail) {
    const move = skills[0]
    const mv = move?.name ? ` · ท่า "${move.name}"${move.damage ? ` แดเมจ ${move.damage}` : ""}` : ""
    return head + mv
  }

  const lines = skills.slice(0, 3).map(s => {
    const dmg = s.damage ? ` แดเมจ ${s.damage}` : ""
    const eff = flat(s.effect)
    return `      - ${s.name}${dmg}` + (eff ? `: ${eff.slice(0, 200)}` : "")
  })
  const weak = c.weakness?.energy?.length
    ? `      - จุดอ่อน ${c.weakness.energy.join("/")} ${c.weakness.value || ""}`.trimEnd()
    : ""
  const evo = (c.evolution || []).length > 1
    ? `      - สายวิวัฒนาการ ${c.evolution.join(" → ")}` : ""
  return [head, ...lines, weak, evo].filter(Boolean).join("\n")
}

// ศัพท์เกมโปเกมอนที่ใช้เป็นตัวตัดคำ — ภาษาไทยไม่เว้นวรรค regex ตัดคำไม่ได้
// (บทเรียนเดียวกับ opcgKnowledge.js — หัวข้อที่พิมพ์ติดกันจะหากฎไม่เจอเลย)
const TERMS = [
  "โปเกมอน", "เทรนเนอร์", "พลังงาน", "ท่าต่อสู้", "ความสามารถ", "เบนช์", "ตำแหน่งต่อสู้",
  "การ์ดรางวัล", "หมดสภาพ", "เด็ค", "จุดอ่อน", "ความต้านทาน", "หนี", "วิวัฒนาการ",
  "แบตเทิล", "แดเมจ", "HP", "เทิร์น", "จั่ว", "สับ", "ทิ้ง", "โปรโม", "เทรดดิ้ง",
  "สภาวะ", "สับสน", "หลับ", "อัมพาต", "พิษ", "ไหม้", "เรกกูเลชัน", "ex",
]

/**
 * Q&A กฎที่ตรงกับหัวข้อ — ถ่วงน้ำหนักตามความเฉพาะของคำเหมือนฝั่ง One Piece
 *
 * ⚠️ ค่าตั้งต้นเอาเฉพาะ "กฎทั่วไป" (189 ข้อ) ไม่เอา "คำวินิจฉัยเฉพาะการ์ด" (888 ข้อ)
 *    เพราะคำวินิจฉัยเป็นเคสซับซ้อนของการ์ดใบใดใบหนึ่ง เช่น
 *    "ถ้า ปิปปีex ของลิเลีย มี [แฟรี่โซน] ทำงานอยู่ จุดอ่อนจะ x4 ไหม"
 *    ยาวมาก กินที่ในพรอมต์ และไม่ใช่สิ่งที่ลูกค้าถาม — คนถามว่า "จุดอ่อนคืออะไร"
 *    ส่งแบบนั้นเข้าไปคือทำให้โมเดลเขียนคอนเทนต์ที่มือใหม่อ่านไม่รู้เรื่อง
 */
export function relevantPkmQa(rules, topic, limit = 4, minScore = 3, generalOnly = true) {
  if (!rules?.qa?.length || !topic) return []
  const text = String(topic)
  const words = [...new Set([
    ...(text.match(/[A-Za-z]{3,}/g) || []).map(w => w.toLowerCase()),
    ...TERMS.filter(t => text.includes(t)).map(t => t.toLowerCase()),
  ])]
  if (!words.length) return []
  // ไฟล์รุ่นเก่ายังไม่มีฟิลด์ kind — ถ้าไม่มีก็ใช้ทั้งหมด ไม่งั้นจะได้ผลลัพธ์ว่างเปล่าเงียบ ๆ
  const hasKind = rules.qa.some(x => x.kind)
  const src = (generalOnly && hasKind)
    ? rules.qa.filter(x => x.kind === "กฎทั่วไป")
    : rules.qa
  if (!src.length) return []

  const pool = src.map(x => `${x.q} ${x.a}`.toLowerCase())
  const weights = words.map(w => {
    const df = pool.reduce((n, t) => n + (t.includes(w) ? 1 : 0), 0)
    return { w, weight: df ? Math.max(Math.log(pool.length / df), 0.05) : 0 }
  }).filter(x => x.weight > 0)

  return src
    .map((x, i) => ({
      x, score: weights.reduce((n, o) => n + (pool[i].includes(o.w) ? o.weight * Math.min(o.w.length, 8) : 0), 0),
    }))
    .filter(o => o.score >= minScore)
    .sort((a, b) => b.score - a.score || a.x.a.length - b.x.a.length)
    .slice(0, limit)
    .map(o => o.x)
}

/**
 * ก้อนข้อมูลอ้างอิงสำหรับใส่ prompt — คืน "" ถ้าไม่มีอะไรเกี่ยว
 * maxChars คุมเฉพาะเนื้อข้อมูล ไม่รวมคำเตือนท้ายบล็อก (คำเตือนห้ามถูกตัดเด็ดขาด)
 */
export async function pkmKnowledgeBlock({ setCode, topic = "", maxChars = 2000, detail = false } = {}) {
  const [cards, rules] = await Promise.all([loadPkmCards(), loadPkmRules()])
  if (!cards && !rules) return ""

  const parts = []
  const set = findPkmSet(cards, setCode)
  if (set) {
    const head = `ชุด ${set.name_th} · การ์ด ${set.card_count} ใบ` +
      (set.jp_code ? ` · ซองที่เราขายคือฉบับญี่ปุ่น ${set.jp_code}` : "")
    // โพสต์แนวความรู้ต้องการรายละเอียดลึกแต่ไม่ต้องการหลายใบ — เอาน้อยใบแต่ครบ
    const picked = notablePkmCards(set, detail ? 4 : 8)
    parts.push("การ์ดเด่นในชุด (ชื่อและค่าสถานะตามทางการ):\n" + head + "\n" +
      picked.map(c => "  " + cardLine(c, detail)).join("\n"))
  }

  const qa = relevantPkmQa(rules, topic)
  if (qa.length) {
    parts.push("กฎการเล่นทางการที่เกี่ยวข้อง:\n" +
      qa.map(x => `  ถาม: ${x.q}\n  ตอบ: ${x.a}`).join("\n"))
  }

  if (!parts.length) return ""

  let body = parts.join("\n\n")
  // โหมดรายละเอียดต้องการที่มากกว่า — คำอธิบายท่าต่อใบยาวกว่าบรรทัดเดียวหลายเท่า
  const cap = detail ? Math.max(maxChars, 3200) : maxChars
  if (body.length > cap) body = body.slice(0, cap).replace(/\n[^\n]*$/, "")

  return "\n━━━ ข้อมูลทางการ Pokémon เทรดดิ้งการ์ดเกม ━━━\n" + body +
    `\n\nที่มา: เว็บทางการภาษาไทย · ดึงเมื่อ ${cards?._source?.fetched_at || "-"}\n` +
    "⚠️ ข้อมูลนี้มาจากการ์ดฉบับภาษาไทย แต่ซองที่เราขายเป็น **ฉบับภาษาญี่ปุ่น** — " +
    "ใช้ชื่อการ์ด ค่าสถานะ ท่าต่อสู้ และกฎได้เต็มที่ " +
    "แต่ห้ามอ้างเลขการ์ด ห้ามบอกว่าลูกค้าจะเห็นชื่อไทยบนการ์ด " +
    "และห้ามบอกว่าการ์ดใบไหนอยู่ในซองไหน (ฉบับไทยรวมสองชุดญี่ปุ่นเป็นชุดเดียว)\n" +
    "ใช้ได้เฉพาะชื่อและตัวเลขที่อยู่ในบล็อกนี้ ห้ามแต่งเพิ่มเอง\n"
}

export default { loadPkmCards, loadPkmRules, findPkmSet, notablePkmCards, relevantPkmQa, pkmKnowledgeBlock }
