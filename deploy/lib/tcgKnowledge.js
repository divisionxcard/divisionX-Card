// ความรู้ทางการของค่ายที่เหลือ — Dragon Ball · Yu-Gi-Oh · KAYOU (Naruto, My Little Pony)
//
// รวมไว้ไฟล์เดียวเพราะทั้งสามใช้โครงเดียวกัน (เลือกชุด → หยิบการ์ดเด่น → ต่อคำเตือน)
// ต่างจาก One Piece/Pokémon ที่แยกไฟล์ เพราะสองตัวนั้นมีตรรกะเฉพาะตัวเยอะกว่ามาก
//
// ไฟล์ข้อมูลสร้างด้วย (snapshot รันเดือนละครั้งพอ):
//   py -3 deploy/agents/dbfw_kb.py     → dbfw_cards.json · dbfw_faq.json
//   py -3 deploy/agents/kayou_kb.py    → kayou_cards.json
//   py -3 deploy/agents/ygo_kb.py      → ygo_cards.json
//
// ⚠️ แต่ละค่ายมีข้อห้ามคนละแบบ ฝังไว้ท้ายบล็อกแล้ว **ห้ามตัดออกเพื่อประหยัดที่ใน prompt**
//   Dragon Ball  ข้อความเป็นไทยทางการ ใช้ได้เต็มที่ · ซองในตู้เป็นฉบับญี่ปุ่น
//   Yu-Gi-Oh     ชื่อการ์ดเป็นญี่ปุ่นล้วน ห้ามยกไปเขียนแคปชั่นตรง ๆ
//   KAYOU        เป็นการ์ดสะสม ไม่ใช่เกมการ์ด · ยังไม่ผูกกับ SKU ห้ามระบุว่าชุดไหนอยู่ในตู้
import { readFile } from "fs/promises"
import path from "path"

// เก็บ promise ไม่ใช่ผลลัพธ์ — คำขอที่เข้าพร้อมกันตอน instance ยังเย็นจะได้ไม่อ่านไฟล์ซ้ำ
let _dbfwCards = null
let _dbfwFaq = null
let _kayou = null
let _ygo = null
let _ua = null

// ⚠️ path ต้องเขียนเป็นสตริงตรง ๆ ห้ามส่งชื่อไฟล์ผ่านตัวแปร — Next ไล่หาไฟล์ที่ต้องแพ็ก
//    จากการอ่านโค้ด ถ้าเป็นตัวแปรมันมองไม่เห็นแล้วไฟล์จะหายตอน deploy
export function loadDbfwCards() {
  _dbfwCards ??= readFile(path.join(process.cwd(), "tasks", "dbfw_cards.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _dbfwCards
}

export function loadDbfwFaq() {
  _dbfwFaq ??= readFile(path.join(process.cwd(), "tasks", "dbfw_faq.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _dbfwFaq
}

export function loadKayouCards() {
  _kayou ??= readFile(path.join(process.cwd(), "tasks", "kayou_cards.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _kayou
}

export function loadYgoCards() {
  _ygo ??= readFile(path.join(process.cwd(), "tasks", "ygo_cards.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _ygo
}

export function loadUaCards() {
  _ua ??= readFile(path.join(process.cwd(), "tasks", "ua_cards.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _ua
}

/** ค่ายที่ไฟล์นี้ดูแล — ใช้เช็คก่อนเรียก จะได้ไม่โหลดไฟล์ฟรี */
export const TCG_FRANCHISES = new Set(["DB", "YGH", "NRT", "MLP", "SL"])

// คำที่บอกว่าโพสต์นี้พูดถึงค่ายไหน เผื่อคอนเทนต์ไม่ได้ผูก SKU
const HINTS = [
  ["DB", /dragon\s*ball|ดราก้อนบอล|ดราก้อน\s*บอล|fusion\s*world|โกคู|เบจิต้า/i],
  ["YGH", /yu-?gi-?oh|ยูกิ|ยูกิโอ|遊戯王/i],
  ["NRT", /naruto|นารูโตะ|นินจา|อุซึมากิ/i],
  ["MLP", /my\s*little\s*pony|โพนี่|ลิตเติ้ลโพนี่/i],
  ["SL", /solo\s*level|โซโล\s*เลเวล|ระดับข้าคือ|union\s*arena|ยูเนียน\s*อารีน่า/i],
]

export function franchiseFromText(text) {
  const t = String(text || "")
  return HINTS.find(([, re]) => re.test(t))?.[0] || null
}

// ─────────────────────────────────────────────────────────────────────────
// Dragon Ball Fusion World
// ─────────────────────────────────────────────────────────────────────────
// หายากมาก → หายากน้อย · ตัวเลขน้อยคือเด่นกว่า
const DB_RARITY = { SCR: 0, L: 1, SR: 2, R: 3, PR: 3.5, UC: 4, C: 5 }

/**
 * การ์ดที่เอาไปพูดถึงในโพสต์ได้
 *
 * โควตาผู้นำแยกไว้ เพราะการ์ดผู้นำคือใบที่กำหนดว่าเด็คเล่นแนวไหน
 * ถ้าเรียงตามความหายากล้วน ผู้นำ (L) จะโดน SCR เบียดตกหมด
 * แล้วคอนเทนต์จะพูดถึงแต่การ์ดสวยโดยไม่แตะว่าชุดนี้เล่นยังไง
 */
export function notableDbCards(set, limit = 8, leaderQuota = 2) {
  if (!set?.cards?.length) return []
  const rank = c => DB_RARITY[c.rarity] ?? 9
  const withText = c => (c.effect ? 0 : 1)          // ใบที่มีข้อความทักษะเล่าได้มากกว่า
  const sort = (a, b) => rank(a) - rank(b) || withText(a) - withText(b)
  const leaders = set.cards.filter(c => c.card_type === "ผู้นำ").sort(sort).slice(0, leaderQuota)
  const taken = new Set(leaders.map(c => c.code))
  const rest = set.cards.filter(c => !taken.has(c.code)).sort(sort)
  return [...leaders, ...rest].slice(0, limit)
}

function dbCardLine(c) {
  const bits = [
    c.rarity,
    c.card_type,
    (c.colors || []).join("/"),
    c.power ? `พลัง ${c.power}` : null,
    c.cost ? `ค่าร่าย ${c.cost}` : null,
  ].filter(Boolean)
  const head = `${c.code} ${c.name}${bits.length ? ` — ${bits.join(" · ")}` : ""}`
  // ตัดทักษะให้สั้น ข้อความเต็มบางใบยาว 400 ตัวอักษร กินที่ใน prompt โดยไม่ช่วยอะไร
  const eff = (c.effect || "").split("\n")[0].slice(0, 130)
  return eff ? `${head}\n     ${eff}` : head
}

const HAS_THAI = /[฀-๿]/

/**
 * Q&A ทางการที่ตรงกับชุดนั้น — ของจริงจาก Bandai ตอบลูกค้าได้เลย
 *
 * ⚠️ ต้องกรองเอาเฉพาะคำตอบที่เป็นภาษาไทย — เว็บทางการแปลไม่ครบ
 *    มี 2 ข้อจาก 450 ที่คำตอบยังเป็นอังกฤษ ("Yes, you can." / "No, you cannot.")
 *    และสองข้อนั้นดันเป็นข้อที่ "สั้นที่สุด" พอดี ตัวเรียงตามความยาวจึงหยิบมันขึ้นมาก่อนเพื่อน
 *    ถ้าไม่กรอง คอนเทนต์ไทยจะมีประโยคอังกฤษโผล่มาแบบไม่มีเหตุผล
 */
function dbFaqFor(faq, setCode, limit = 2) {
  const s = faq?.series?.find(x => x.code === setCode)
  if (!s?.items?.length) return []
  // เอาข้อที่คำตอบสั้น อ่านจบใน 1 บรรทัด — เหมาะกับคอนเทนต์มากกว่าข้อยาว
  return [...s.items]
    .filter(x => x.answer && x.answer.length < 160 && HAS_THAI.test(x.answer))
    .sort((a, b) => a.answer.length - b.answer.length)
    .slice(0, limit)
}

async function dbBlock(setCode, topic, maxChars) {
  const [cards, faq] = await Promise.all([loadDbfwCards(), loadDbfwFaq()])
  if (!cards) return ""
  const code = String(setCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  const set = cards.sets?.find(s => String(s.code).toUpperCase() === code)
  const parts = []

  if (set) {
    parts.push(
      `ชุด ${set.label} · การ์ดของชุดนี้เอง ${set.own_set_count} ใบ` +
      (set.reprint_count ? ` (+ พิมพ์ซ้ำจากชุดอื่น ${set.reprint_count} ใบ)` : "") + "\n" +
      notableDbCards(set).map(c => "  " + dbCardLine(c)).join("\n"))
    const qa = dbFaqFor(faq, set.code)
    if (qa.length) {
      parts.push("คำถามที่ทางการตอบไว้ (ใช้ตอบลูกค้าได้เลย):\n" +
        qa.map(x => `  ถาม: ${x.question}\n  ตอบ: ${x.answer}`).join("\n"))
    }
  } else {
    const ours = (cards.sets || []).filter(s => s.in_our_machines)
    if (!ours.length) return ""
    parts.push("ชุด Dragon Ball Fusion World ที่มีขายในตู้เรา:\n" +
      ours.map(s => `  ${s.code} — ${s.label} (${s.own_set_count} ใบ)`).join("\n"))
  }

  let body = parts.join("\n\n")
  if (body.length > maxChars) body = body.slice(0, maxChars).replace(/\n[^\n]*$/, "")
  return "\n━━━ ข้อมูลทางการ Dragon Ball Super Card Game Fusion World ━━━\n" + body +
    `\n\nที่มา: เว็บทางการ Bandai ฉบับภาษาไทย · ดึงเมื่อ ${cards?._source?.fetched_at || "-"}\n` +
    "ข้อความทักษะข้างบนเป็นภาษาไทยทางการ ใช้อ้างได้เต็มที่ ห้ามแต่งเพิ่มเอง\n" +
    "⚠️ ซองที่ขายในตู้เราเป็นฉบับภาษาญี่ปุ่น — ห้ามบอกลูกค้าว่าการ์ดในซองเป็นภาษาไทย\n"
}

// ─────────────────────────────────────────────────────────────────────────
// Yu-Gi-Oh OCG
// ─────────────────────────────────────────────────────────────────────────
const YGO_RARITY = ["GMR", "PSE", "SE", "UL", "CR", "UR", "SR", "R", "N"]

export function notableYgoCards(set, limit = 6) {
  if (!set?.cards?.length) return []
  const rank = c => Math.min(...(c.rarities || ["N"]).map(r => {
    const i = YGO_RARITY.indexOf(r)
    return i < 0 ? 99 : i
  }))
  return [...set.cards].sort((a, b) => rank(a) - rank(b)).slice(0, limit)
}

async function ygoBlock(setCode, topic, maxChars) {
  const cards = await loadYgoCards()
  if (!cards?.sets?.length) return ""
  const code = String(setCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  const set = cards.sets.find(s =>
    String(s.our_set_code).toUpperCase() === code || String(s.code).toUpperCase() === code)

  const parts = []
  if (set) {
    parts.push(`ชุด ${set.official_name} (รหัสทางการ ${set.code}) · ${set.card_count} แบบ\n` +
      notableYgoCards(set).map(c =>
        `  ${c.name}${c.rarities ? ` [${c.rarities.join("/")}]` : ""}` +
        `${c.species ? ` ${c.species}` : ""}${c.atk ? ` ${c.atk}` : ""}`).join("\n"))
  } else {
    parts.push("ชุด Yu-Gi-Oh ที่มีขายในตู้เรา:\n" +
      cards.sets.map(s => `  ${s.official_name} (${s.code}) — ${s.card_count} แบบ`).join("\n"))
  }

  let body = parts.join("\n\n")
  if (body.length > maxChars) body = body.slice(0, maxChars).replace(/\n[^\n]*$/, "")
  return "\n━━━ ข้อมูลทางการ Yu-Gi-Oh OCG ━━━\n" + body +
    `\n\nที่มา: ฐานข้อมูลทางการ Konami · ดึงเมื่อ ${cards?._source?.fetched_at || "-"}\n` +
    "⚠️ ชื่อการ์ดข้างบนเป็น**ภาษาญี่ปุ่น** เพราะซองที่เราขายเป็นฉบับญี่ปุ่นจริง — " +
    "ห้ามยกชื่อญี่ปุ่นไปเขียนในแคปชั่นตรง ๆ ลูกค้าไทยอ่านไม่ออก " +
    "ให้เล่าเป็นธีมของชุดหรือชื่อตัวละครที่คนไทยรู้จักแทน (เช่น บลูอายส์ · แบล็คเมจิเชียน)\n"
}

// ─────────────────────────────────────────────────────────────────────────
// KAYOU — Naruto · My Little Pony
// ─────────────────────────────────────────────────────────────────────────
const KAYOU_IP = { NRT: "Naruto", MLP: "My Little Pony" }

async function kayouBlock(franchise, topic, maxChars) {
  const data = await loadKayouCards()
  const ipName = KAYOU_IP[franchise]
  if (!data?.series?.length || !ipName) return ""
  const mine = data.series.filter(s => s.ip_name === ipName)
  if (!mine.length) return ""

  // เรียงตามจำนวนการ์ด — ไลน์ใหญ่คือไลน์หลักที่คนรู้จัก
  const top = [...mine].sort((a, b) => b.card_count - a.card_count).slice(0, 5)
  const parts = ["ไลน์สินค้าทางการ (เรียงตามขนาดชุด):\n" +
    top.map(s => `  ${s.line} · ${s.title} [${s.code_prefix}] — ${s.card_count} ใบ · ` +
      `${s.rarity_tiers?.length || 0} ระดับความหายาก`).join("\n")]

  // ระดับความหายากจากไลน์ที่ใหญ่ที่สุด — ลูกค้าถามข้อนี้บ่อยที่สุด
  const big = top[0]
  if (big?.rarity_tiers?.length) {
    parts.push(`ระดับความหายากของ ${big.line} ${big.title} (หายากสุดอยู่บน):\n` +
      big.rarity_tiers.map(t =>
        `  ${t.name}${t.full ? ` (${t.full})` : ""} — ${t.count} ใบ` +
        `${t.art_theme ? ` · ธีม ${t.art_theme}` : ""}`).join("\n"))
  }
  const rates = big?.editions?.find(e => e.pull_rates?.length)
  if (rates) {
    parts.push(`อัตราออกการ์ดของกล่อง "${rates.label}":\n` +
      rates.pull_rates.map(p => `  ${p.per_pack} → ${p.detail}`).join("\n"))
  }

  let body = parts.join("\n\n")
  if (body.length > maxChars) body = body.slice(0, maxChars).replace(/\n[^\n]*$/, "")
  return `\n━━━ ข้อมูลทางการ ${ipName} (KAYOU) ━━━\n` + body +
    `\n\nที่มา: เว็บทางการ KAYOU · ดึงเมื่อ ${data?._source?.fetched_at || "-"}\n` +
    "⚠️ นี่คือ**การ์ดสะสม ไม่ใช่เกมการ์ด** — ไม่มีกฎการเล่น ห้ามชวนลูกค้าว่าเอาไปแข่งได้\n" +
    `⚠️ KAYOU เป็นผู้ผลิตที่ถือไลเซนส์ ไม่ใช่เจ้าของ ${ipName} ` +
    "ห้ามเขียนว่าเป็นสินค้าของเจ้าของการ์ตูนโดยตรง\n" +
    "⚠️ ยังไม่ได้จับคู่ไลน์พวกนี้กับสินค้าในตู้เรา — " +
    "**ห้ามระบุว่าไลน์ไหนหรือชุดไหนมีขายในตู้** ให้พูดถึงในภาพรวมเท่านั้น\n" +
    "⚠️ อัตราออกการ์ดข้างบนเป็นของกล่องฉบับอเมริกา อาจไม่ตรงกับกล่องที่เราขาย — " +
    "ห้ามโฆษณาตัวเลขนี้ว่าเป็นของกล่องในตู้เรา\n"
}

// ─────────────────────────────────────────────────────────────────────────
// UNION ARENA — Solo Leveling
// ─────────────────────────────────────────────────────────────────────────
const UA_RARITY = { SR: 0, R: 1, U: 2, C: 3, AP: 4 }

async function uaBlock(setCode, topic, maxChars) {
  const data = await loadUaCards()
  if (!data?.sets?.length) return ""
  const code = String(setCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  const set = data.sets.find(s =>
    String(s.our_set_code).toUpperCase() === code || String(s.code).toUpperCase() === code)
    || data.sets[0]

  const rank = c => UA_RARITY[c.rarity] ?? 9
  const top = [...set.cards].sort((a, b) => rank(a) - rank(b)).slice(0, 6)
  const parts = [
    `ชุด ${set.label} · การ์ด ${set.card_count} แบบ ` +
    `(หน้าเว็บนับอาร์ตพาราเรลแยกเป็น ${set.listed_entries} รายการ)\n` +
    top.map(c => `  ${c.code} ${c.name}` +
      `${c.rarity ? ` [${c.rarity}]` : ""}${c.bp ? ` · BP ${c.bp}` : ""}` +
      `${c.card_type ? ` · ${c.card_type}` : ""}`).join("\n"),
  ]
  // กฎทั่วไปของเกม — ลูกค้าที่ไม่เคยเล่นถามข้อพวกนี้บ่อยกว่ากฎเฉพาะการ์ด
  const g = (data.general_faq || []).filter(x => x.answer && x.answer.length < 120).slice(0, 2)
  if (g.length) {
    parts.push("กฎพื้นฐานที่ทางการตอบไว้:\n" +
      g.map(x => `  ถาม: ${x.question}\n  ตอบ: ${x.answer}`).join("\n"))
  }

  let body = parts.join("\n\n")
  if (body.length > maxChars) body = body.slice(0, maxChars).replace(/\n[^\n]*$/, "")
  return "\n━━━ ข้อมูลทางการ UNION ARENA (Solo Leveling) ━━━\n" + body +
    `\n\nที่มา: เว็บทางการ Bandai ฉบับญี่ปุ่น · ดึงเมื่อ ${data?._source?.fetched_at || "-"}\n` +
    "UNION ARENA เป็นเกมการ์ดที่เล่นแข่งได้จริง (ต่างจากการ์ดสะสมของ KAYOU)\n" +
    "⚠️ ชุดนี้ขายเฉพาะในญี่ปุ่น ไม่มีฉบับไทยหรือเอเชีย — ชื่อการ์ดและกฎข้างบนเป็น" +
    "**ภาษาญี่ปุ่น** ห้ามยกไปเขียนแคปชั่นตรง ๆ ให้เล่าเป็นชื่อตัวละครที่คนไทยรู้จัก" +
    "จากอนิเมะแทน (เช่น ซองจินอู)\n"
}

// ─────────────────────────────────────────────────────────────────────────
/**
 * ก้อนข้อมูลอ้างอิงสำหรับใส่ prompt — คืน "" ถ้าไม่มีอะไรเกี่ยว
 *
 * @param {object} o
 * @param {string} [o.franchise] ค่าจาก skus.franchise (DB/YGH/NRT/MLP)
 * @param {string} [o.setCode]   ค่าจาก skus.set_code
 * @param {string} [o.topic]     หัวข้อคอนเทนต์ ใช้เดาค่ายเมื่อไม่ได้ผูก SKU
 */
export async function tcgKnowledgeBlock({ franchise, setCode, topic = "", maxChars = 2000 } = {}) {
  const fr = TCG_FRANCHISES.has(franchise) ? franchise : franchiseFromText(topic)
  if (!fr) return ""
  try {
    if (fr === "DB") return await dbBlock(setCode, topic, maxChars)
    if (fr === "YGH") return await ygoBlock(setCode, topic, maxChars)
    if (fr === "NRT" || fr === "MLP") return await kayouBlock(fr, topic, maxChars)
    if (fr === "SL") return await uaBlock(setCode, topic, maxChars)
  } catch {
    return ""     // ไฟล์หายหรือรูปแบบเปลี่ยน — ปล่อยให้เขียนคอนเทนต์ต่อได้โดยไม่มีบล็อกนี้
  }
  return ""
}

export default {
  loadDbfwCards, loadDbfwFaq, loadKayouCards, loadYgoCards, loadUaCards,
  TCG_FRANCHISES, franchiseFromText,
  notableDbCards, notableYgoCards, tcgKnowledgeBlock,
}
