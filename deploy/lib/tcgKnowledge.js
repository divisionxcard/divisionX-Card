// ความรู้ทางการของค่ายที่เหลือ — Dragon Ball · Yu-Gi-Oh · Solo Leveling · KAYOU (Naruto, My Little Pony,
// Transformers, Mobile Legends)
//
// รวมไว้ไฟล์เดียวเพราะทั้งสามใช้โครงเดียวกัน (เลือกชุด → หยิบการ์ดเด่น → ต่อคำเตือน)
// ต่างจาก One Piece/Pokémon ที่แยกไฟล์ เพราะสองตัวนั้นมีตรรกะเฉพาะตัวเยอะกว่ามาก
//
// ไฟล์ข้อมูลสร้างด้วย (snapshot รันเดือนละครั้งพอ):
//   py -3 deploy/agents/dbfw_kb.py     → dbfw_cards.json · dbfw_faq.json
//   py -3 deploy/agents/kayou_kb.py    → kayou_cards.json
//   ygo_cards.json — ⛔ ygo_kb.py เลิกใช้ 24 ต.ค. 2026 (ข้อตกลง Konami ห้ามเครื่องมืออัตโนมัติ) · ข้อมูลเดิมใช้ต่อ · ชุดใหม่กรอกเอง
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
let _kayouSea = null

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

// Transformers Overdrive · MLBB Hand of Destiny 002 — อ่านจากภาพทางการ KAYOU ฝั่งเอเชีย (ไม่มีตัวดึงอัตโนมัติ)
export function loadKayouSeaCards() {
  _kayouSea ??= readFile(path.join(process.cwd(), "tasks", "kayou_sea_cards.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _kayouSea
}

export function loadUaCards() {
  _ua ??= readFile(path.join(process.cwd(), "tasks", "ua_cards.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _ua
}

/** ค่ายที่ไฟล์นี้ดูแล — ใช้เช็คก่อนเรียก จะได้ไม่โหลดไฟล์ฟรี */
export const TCG_FRANCHISES = new Set(["DB", "YGH", "NRT", "MLP", "SL", "TF", "MLBB"])

// คำที่บอกว่าโพสต์นี้พูดถึงค่ายไหน เผื่อคอนเทนต์ไม่ได้ผูก SKU
const HINTS = [
  ["DB", /dragon\s*ball|ดราก้อนบอล|ดราก้อน\s*บอล|fusion\s*world|โกคู|เบจิต้า/i],
  ["YGH", /yu-?gi-?oh|ยูกิ|ยูกิโอ|遊戯王/i],
  ["NRT", /naruto|นารูโตะ|นินจา|อุซึมากิ/i],
  ["MLP", /my\s*little\s*pony|โพนี่|ลิตเติ้ลโพนี่/i],
  ["SL", /solo\s*level|โซโล\s*เลเวล|ระดับข้าคือ|union\s*arena|ยูเนียน\s*อารีน่า/i],
  ["TF", /transformers|ทรานส์ฟอร์เมอร์ส?|ออพติมัส|optimus\s*prime|overdrive/i],
  ["MLBB", /mobile\s*legends?|\bmlbb\b|โมบายเลเจนด์|hand\s*of\s*destiny/i],
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

const normSet = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "")

// ชื่อการ์ดจากระดับแรก ๆ ที่เว็บทางการจัดแสดง — ไล่ทีละระดับตามลำดับนั้น ไม่ใช่ตามลำดับการ์ดในไฟล์
// (การ์ดในไฟล์เรียงจากระดับต่ำขึ้นสูง ถ้าไล่ตามการ์ด MLBB จะได้ UR ก่อน SP)
// ⚠️ ลำดับบนเว็บไม่ใช่ "หายากสุดก่อน" เสมอ — MLP BP01 มี C/U อยู่กลางรายการ จึงใช้คำว่า "ระดับแรก ๆ ที่เว็บจัดแสดง"
function kayouHeadliners(series, tiers = 2, limit = 6) {
  const seen = new Set(), out = []
  for (const t of (series?.rarity_tiers || []).slice(0, tiers)) {
    for (const c of series?.cards || []) {
      if (c.rarity !== t.name || !c.name || seen.has(c.name)) continue
      seen.add(c.name); out.push(`${c.name} [${c.rarity}]`)
      if (out.length >= limit) return out
    }
  }
  return out
}

function tierLines(series) {
  return (series?.rarity_tiers || []).map(t =>
    `  ${t.name}${t.full ? ` (${t.full})` : ""} — ${t.count} ใบ` +
    `${t.art_theme ? ` · ธีม ${t.art_theme}` : ""}`).join("\n")
}

/**
 * ⚠️ 22 ต.ค. 2026 — จับคู่ซีรีส์ทางการกับสินค้าในตู้ได้แล้ว (our_set_code · เทียบรูปกล่องจริง)
 *    ชุดที่จับคู่ได้ = เล่าเจาะชุดนั้นได้ และบอกได้ว่าอยู่ในตู้ · ไม่ระบุชุด = ภาพรวมแบบเดิม
 * ⚠️ MLP Booster Pack BP01 เป็น "Trading Card Game" (กล่องเขียน CARD GAME) — เดิมบล็อกนี้เขียนทุกชุดว่า
 *    "การ์ดสะสม ไม่ใช่เกมการ์ด" ซึ่งผิดกับชุดนี้ · ตอนนี้ดูจาก product_type ของซีรีส์
 */
async function kayouBlock(franchise, setCode, topic, maxChars) {
  const data = await loadKayouCards()
  const ipName = KAYOU_IP[franchise]
  if (!data?.series?.length || !ipName) return ""
  const mine = data.series.filter(s => s.ip_name === ipName)
  if (!mine.length) return ""

  const code = normSet(setCode)
  const ours = code ? mine.find(s => normSet(s.our_set_code) === code) : null
  const parts = []
  let focus

  if (ours) {
    focus = ours
    parts.push(`ชุดที่อยู่ในตู้เรา: ${ours.line} · ${ours.title} [รหัสทางการ ${ours.code_prefix}] — ` +
      `${ours.card_count} ใบ · ${ours.rarity_tiers?.length || 0} ระดับความหายาก` +
      (ours.match_confidence === "medium"
        ? "\n  (จับคู่จากหน้ากล่อง · ชื่อไลน์บนเว็บอเมริกาไม่ตรงกับหน้ากล่องเอเชีย — ให้เรียกตามหน้ากล่อง)"
        : ""))
  } else {
    // เรียงตามจำนวนการ์ด — ไลน์ใหญ่คือไลน์หลักที่คนรู้จัก
    const top = [...mine].sort((a, b) => b.card_count - a.card_count).slice(0, 5)
    focus = top[0]
    parts.push("ไลน์สินค้าทางการ (เรียงตามขนาดชุด):\n" +
      top.map(s => `  ${s.line} · ${s.title} [${s.code_prefix}] — ${s.card_count} ใบ · ` +
        `${s.rarity_tiers?.length || 0} ระดับความหายาก${s.our_set_code ? " · มีในตู้เรา" : ""}`).join("\n"))
  }

  // ระดับความหายาก — ลูกค้าถามข้อนี้บ่อยที่สุด
  if (focus?.rarity_tiers?.length) {
    parts.push(`ระดับความหายากของ ${focus.line} ${focus.title} (ตามลำดับที่เว็บทางการจัดแสดง):\n` + tierLines(focus))
  }
  const heads = kayouHeadliners(focus)
  if (heads.length) parts.push(`การ์ดจากระดับแรก ๆ ที่เว็บจัดแสดง: ${heads.join(" · ")}`)
  const rates = focus?.editions?.find(e => e.pull_rates?.length)
  if (rates) {
    parts.push(`อัตราออกการ์ดของกล่อง "${rates.label}" (ฉบับอเมริกา):\n` +
      rates.pull_rates.map(p => `  ${p.per_pack} → ${p.detail}`).join("\n"))
  }

  let body = parts.join("\n\n")
  if (body.length > maxChars) body = body.slice(0, maxChars).replace(/\n[^\n]*$/, "")
  const isGame = /trading card game/i.test(focus?.product_type || "")
  return `\n━━━ ข้อมูลทางการ ${ipName} (KAYOU) ━━━\n` + body +
    `\n\nที่มา: เว็บทางการ KAYOU · ดึงเมื่อ ${data?._source?.fetched_at || "-"}\n` +
    (isGame
      ? "⚠️ ชุดนี้เป็น**เกมการ์ดที่เล่นได้** (กล่องเขียน CARD GAME) แต่คลังเรายังไม่มีกฎการเล่น — ห้ามอธิบายวิธีเล่นเอง\n"
      : "⚠️ นี่คือ**การ์ดสะสม ไม่ใช่เกมการ์ด** — ไม่มีกฎการเล่น ห้ามชวนลูกค้าว่าเอาไปแข่งได้\n") +
    `⚠️ KAYOU เป็นผู้ผลิตที่ถือไลเซนส์ ไม่ใช่เจ้าของ ${ipName} ` +
    "ห้ามเขียนว่าเป็นสินค้าของเจ้าของการ์ตูนโดยตรง\n" +
    (ours
      ? ""
      : "⚠️ ไม่ได้ระบุชุด — **ห้ามระบุว่าไลน์ไหนหรือชุดไหนมีขายในตู้** ยกเว้นที่ขึ้นว่า \"มีในตู้เรา\"\n") +
    "⚠️ อัตราออกการ์ดเป็นของกล่องฉบับอเมริกา อาจไม่ตรงกับกล่องที่เราขาย (จำนวนซองต่อกล่องก็ต่างกัน) — " +
    "ห้ามโฆษณาตัวเลขนี้ว่าเป็นของกล่องในตู้เรา\n"
}

// ─────────────────────────────────────────────────────────────────────────
// KAYOU ฝั่งเอเชีย — Transformers Overdrive · MLBB Hand of Destiny 002
// ─────────────────────────────────────────────────────────────────────────
// ไม่มีบนเว็บ KAYOU หลัก · ข้อมูลอ่านจากภาพทางการบน id./th.kayouofficial.com (22 ต.ค. 2026)
// ดู tasks/kayou_sea_cards.json → _important
const SEA_FRANCHISE = { TF: "Transformers", MLBB: "Mobile Legends: Bang Bang" }

async function seaBlock(franchise, setCode, maxChars) {
  const data = await loadKayouSeaCards()
  const ip = SEA_FRANCHISE[franchise]
  const s = data?.series?.find(x => x.ip_name === ip)
  if (!s) return ""
  const parts = [`ชุด ${s.title}${s.subtitle ? ` — "${s.subtitle}"` : ""} · ${s.product_type}` +
    ` · รหัสบนการ์ด ${s.code_prefix}`]
  if (s.rarity_tiers?.length) {
    parts.push(`ระดับความหายาก${franchise === "TF" ? " (ตามตารางทางการ · อัตราออกจากตารางทางการ)" : " (ลำดับตามหน้าเว็บทางการ — ไม่ใช่ลำดับความหายากที่ยืนยัน)"}:\n` +
      s.rarity_tiers.map(t => `  ${t.name}${t.full ? ` (${t.full})` : ""} — ${t.count} ใบ` +
        `${t.official_pull_rate ? ` · ${t.official_pull_rate}` : ""}` +
        `${t.art_theme ? ` · ${t.art_theme}` : ""}`).join("\n"))
  }
  const heads = kayouHeadliners(s, 2, 8)
  if (heads.length) parts.push(`การ์ดจากระดับแรก ๆ ที่เว็บจัดแสดง: ${heads.join(" · ")}`)

  let body = parts.join("\n\n")
  if (body.length > maxChars) body = body.slice(0, maxChars).replace(/\n[^\n]*$/, "")
  const warn = franchise === "TF"
    ? "⚠️ มี 2 เวอร์ชันกล่อง (001A 238 แบบ · 001B 239 แบบ มีบัตรแลกรางวัลเพิ่ม 1 ใบ) ยังไม่รู้ว่าตู้เราเป็นแบบไหน — ห้ามพูดถึงบัตรแลกรางวัล\n" +
      "⚠️ ตารางทางการเขียนส่วนประกอบในซองขัดกันเอง — ห้ามบอกว่าซองหนึ่ง \"การันตี\" ได้อะไร\n" +
      "⚠️ เลขซีเรียลของ XR☆/OR☆/LR☆ มาจากร้านค้า ไม่ใช่ทางการ — ห้ามอ้าง\n"
    : "⚠️ ไม่มีอัตราออกการ์ดและลำดับความหายากทางการ — ห้ามบอกว่าระดับไหนหายากที่สุด ห้ามอ้างอัตราออก\n" +
      "⚠️ ชื่อชุดทางการคือ \"Stargazer\" (ไม่ใช่ Decisive Peak) · การ์ด SP มี 10 ใบ 9 ราศี (ไม่ใช่ 12 ราศี)\n"
  return `\n━━━ ข้อมูลทางการ ${ip} (KAYOU) ━━━\n` + body +
    `\n\nที่มา: เว็บทางการ KAYOU ฝั่งเอเชีย (id./th.kayouofficial.com) · อ่านจากภาพทางการ ${data?._source?.fetched_at || "-"}\n` +
    "⚠️ นี่คือ**การ์ดสะสม ไม่ใช่เกมการ์ด** — ห้ามชวนว่าเอาไปเล่นแข่งได้\n" +
    `⚠️ KAYOU เป็นผู้ผลิตที่ถือไลเซนส์ ไม่ใช่เจ้าของ ${ip} ห้ามเขียนว่าเป็นสินค้าของเจ้าของ IP โดยตรง\n` +
    "⚠️ ชื่อการ์ดสะกดตามที่พิมพ์บนการ์ด ห้ามแก้ตัวสะกดเอง\n" + warn
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
 * @param {string} [o.franchise] ค่าจาก skus.franchise (DB/YGH/NRT/MLP/SL/TF/MLBB)
 * @param {string} [o.setCode]   ค่าจาก skus.set_code
 * @param {string} [o.topic]     หัวข้อคอนเทนต์ ใช้เดาค่ายเมื่อไม่ได้ผูก SKU
 */
export async function tcgKnowledgeBlock({ franchise, setCode, topic = "", maxChars = 2000 } = {}) {
  const fr = TCG_FRANCHISES.has(franchise) ? franchise : franchiseFromText(topic)
  if (!fr) return ""
  try {
    if (fr === "DB") return await dbBlock(setCode, topic, maxChars)
    if (fr === "YGH") return await ygoBlock(setCode, topic, maxChars)
    if (fr === "NRT" || fr === "MLP") return await kayouBlock(fr, setCode, topic, maxChars)
    if (fr === "TF" || fr === "MLBB") return await seaBlock(fr, setCode, maxChars)
    if (fr === "SL") return await uaBlock(setCode, topic, maxChars)
  } catch {
    return ""     // ไฟล์หายหรือรูปแบบเปลี่ยน — ปล่อยให้เขียนคอนเทนต์ต่อได้โดยไม่มีบล็อกนี้
  }
  return ""
}

export default {
  loadDbfwCards, loadDbfwFaq, loadKayouCards, loadKayouSeaCards, loadYgoCards, loadUaCards,
  TCG_FRANCHISES, franchiseFromText,
  notableDbCards, notableYgoCards, tcgKnowledgeBlock,
}
