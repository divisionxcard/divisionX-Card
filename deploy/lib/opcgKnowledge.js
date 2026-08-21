// ความรู้ทางการ One Piece Card Game — ใช้ให้ระบบเขียนคอนเทนต์อ้างของจริงแทนการเดา
//
// ที่มา: asia-th.onepiece-cardgame.com (เว็บทางการฉบับไทย)
// ไฟล์ข้อมูลสร้างด้วย `py -3 deploy/agents/opcg_kb.py` — snapshot รันเดือนละครั้งพอ
//
// ⚠️ ห้ามยัดทั้งไฟล์เข้า prompt — opcg_cards.json ใหญ่หลาย MB
//    ใช้ knowledgeBlock() ที่หยิบเฉพาะส่วนที่เกี่ยวกับโพสต์รอบนั้น
//    (บทเรียนเดียวกับ craftBlock ใน generate/route.js — ยัดหมดแล้วโมเดลจมข้อมูล)
import { readFile } from "fs/promises"
import path from "path"

// เก็บ "promise" ไม่ใช่ "ผลลัพธ์" — ถ้าเก็บผลลัพธ์ คำขอที่เข้ามาพร้อมกันตอน instance ยังเย็น
// จะเห็นค่าเป็น null เหมือนกันหมดแล้วต่างคนต่างอ่าน+parse ไฟล์ 3.2 MB ซ้ำ
let _rules = null
let _cards = null

// ⚠️ path ต้องเขียนเป็นสตริงตรง ๆ ในแต่ละฟังก์ชัน ห้ามส่งชื่อไฟล์เป็นตัวแปรผ่าน helper
//    Next ไล่หาไฟล์ที่ต้องแพ็กขึ้น Vercel จากการอ่านโค้ด ถ้าเป็นตัวแปรมันมองไม่เห็น
//    แล้วไฟล์จะหายตอน deploy ทั้งที่รันบนเครื่องผ่าน (แบบเดียวกับ loadVoice ใน generate/route.js)

// ไฟล์หายหรือพัง ต้องไม่ทำให้เขียนคอนเทนต์ไม่ได้ — แค่ไม่มีข้อมูลอ้างอิงเสริม
export function loadRules() {
  _rules ??= readFile(path.join(process.cwd(), "tasks", "opcg_rules.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _rules
}

export function loadCards() {
  _cards ??= readFile(path.join(process.cwd(), "tasks", "opcg_cards.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _cards
}

// sku_id ในระบบเราเขียนเว้นวรรค ("OP 17") ส่วน set_code ไม่เว้น ("OP17")
function normCode(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}

// เลขชุดในระบบเราเขียนไม่เท่ากัน ("OP 1", "OP-01", "OP01") — เติมศูนย์ให้เป็นรูปเดียวก่อนเทียบ
function padCode(k) {
  return k.replace(/^([A-Z]+)(\d{1,2})$/, (_, a, n) => a + n.padStart(2, "0"))
}

/** หาชุดการ์ดจาก set_code / sku_id / ชื่อชุด */
export function findSet(cards, key) {
  if (!cards || !key) return null
  const k = padCode(normCode(key))
  if (!k) return null
  return cards.sets.find(s => normCode(s.code) === k)
      || cards.sets.find(s => padCode(normCode(s.our_sku_id)) === k)
      // ค้นจากชื่อชุดเป็นทางสุดท้าย และต้องยาวพอ ไม่งั้น "OP1" ไปโดน OP17 เงียบ ๆ
      || (k.length >= 5 ? cards.sets.find(s => normCode(s.label).includes(k)) : null)
      || null
}

// ⚠️ คีย์ต้องตรงกับค่า rarity ที่อยู่ในไฟล์จริง — ไฟล์ใช้ "SP CARD" ไม่ใช่ "SP"
// และการ์ดโปรโมเป็น "P" · ถ้าคีย์ไม่ตรง การ์ดตัวชูโรงจะตกอันดับท้ายสุดแบบไม่มีสัญญาณเตือน
const RARITY_RANK = { SEC: 0, "SP CARD": 1, SP: 1, L: 2, SR: 3, P: 3.5, R: 4, UC: 5, C: 6 }
const rank = c => RARITY_RANK[String(c.rarity || "").toUpperCase()] ?? 9

/**
 * การ์ดที่เอาไปพูดถึงในโพสต์ได้
 *
 * คนซื้อซองจากตู้สนใจ "ใบหายาก" ไม่ใช่ลีดเดอร์ที่ค่าสถานะเหมือนกันหมด
 * แต่ลีดเดอร์ก็ต้องมีบ้างเพื่อบอกว่าชุดนี้เล่นสีอะไรได้ → ให้โควตาลีดเดอร์ไม่เกิน 2 ใบ
 */
export function notableCards(set, limit = 8, leaderQuota = 2) {
  if (!set?.cards?.length) return []
  const byRarity = (a, b) => rank(a) - rank(b) || (b.art_variants || 0) - (a.art_variants || 0)
  const leaders = set.cards.filter(c => c.type === "LEADER").sort(byRarity)
  const rest = set.cards.filter(c => c.type !== "LEADER").sort(byRarity)
  const picked = [...leaders.slice(0, leaderQuota), ...rest]
  // ถ้าชุดไหนมีแต่ลีดเดอร์ (สตาร์ทเตอร์บางชุด) ก็เติมที่เหลือกลับเข้าไป ไม่ให้บล็อกว่าง
  if (picked.length < limit) picked.push(...leaders.slice(leaderQuota))
  return picked.slice(0, limit)
}

function cardLine(c) {
  const bits = [c.color, c.type === "LEADER" ? `ไลฟ์ ${c.life}` : c.cost ? `คอสต์ ${c.cost}` : null,
                c.power ? `พาวเวอร์ ${c.power}` : null].filter(Boolean)
  const arts = c.art_variants ? ` · อาร์ตพาราเรล ${c.art_variants} แบบ` : ""
  return `${c.code} ${c.name} (${c.rarity}/${c.type}${bits.length ? " · " + bits.join(" · ") : ""})${arts}`
}

// ศัพท์เกมที่ใช้เป็น "ตัวตัดคำ" แทนการพึ่ง regex
//
// ภาษาไทยไม่เว้นวรรคระหว่างคำ /[฀-๿]{3,}/ จึงคืนทั้งวลีมาเป็นก้อนเดียว
// หัวข้อจริงอย่าง "สอนมือใหม่จัดเด็คยังไง" เลยจับกฎไม่เจอสักข้อ ทั้งที่ไฟล์กฎมี 482 ข้อ
// — และมันเงียบ ไม่มี error บล็อกก็ยังดูปกติ แค่ไม่มีกฎอยู่ในนั้น
const GAME_TERMS = [
  "ลีดเดอร์", "คาแรกเตอร์", "อีเวนต์", "สเตจ", "ด้ง", "การ์ด", "เด็ค", "ไลฟ์", "คอสต์",
  "พาวเวอร์", "เคาน์เตอร์", "ทริกเกอร์", "บล็อก", "คีย์เวิร์ด", "ความสามารถ", "คุณสมบัติ",
  "เทิร์น", "เฟส", "แอเรีย", "สนาม", "มือ", "แทรช", "จั่ว", "ทิ้ง", "โจมตี", "แบทเทิล",
  "ดาเมจ", "KO", "เรสต์", "แอ็คทีฟ", "ธีมสี", "รหัสการ์ด", "แพ้", "ชนะ", "จบเกม",
  "เล่น", "กติกา", "เริ่มเกม", "จัดเด็ค", "ผู้เล่น", "ยอมแพ้", "เป้าหมาย", "เลือก",
]

// คำอังกฤษที่โผล่ในชื่อชุดแทบทุกชุด — ปล่อยไว้จะลากกฎที่ไม่เกี่ยวเข้ามาเต็มไปหมด
const STOPWORDS = new Set(["one", "piece", "the", "card", "cards", "pack", "booster", "starter",
  "deck", "premium", "extra", "limited", "promotion", "product", "set", "vol", "edition",
  "collection", "best", "new", "world", "his", "will", "and", "for", "with"])

/**
 * กฎที่เกี่ยวกับหัวข้อที่กำลังเขียน
 *
 * ถ่วงน้ำหนักตามความเฉพาะของคำ — "การ์ด" โผล่เกือบทุกข้อจึงแทบไม่บอกอะไร
 * ส่วน "ยอมแพ้" โผล่ไม่กี่ข้อ เจอเมื่อไหร่แปลว่าตรงเรื่องแน่
 * ถ้าให้คะแนนตามความยาวคำเฉย ๆ หัวข้อไหนมีคำว่า "การ์ด" จะได้กฎมั่ว ๆ ติดมาทุกครั้ง
 *
 * ข้อจำกัดที่รู้อยู่: จับได้เฉพาะเมื่อหัวข้อใช้ศัพท์เดียวกับที่กฎใช้
 * หัวข้ออย่าง "ใส่การ์ดซ้ำได้กี่ใบ" หากฎ 5-1-2-3 ไม่เจอ เพราะกฎเขียนว่า "รหัสการ์ดเดียวกัน"
 * กรณีแบบนี้จะคืนค่าว่าง (บล็อกไม่มีหัวข้อกฎ) ซึ่งปลอดภัยกว่าใส่กฎที่ไม่เกี่ยวเข้าไป
 */
export function relevantRules(rules, topic, limit = 5, minScore = 3) {
  if (!rules || !topic) return []
  const text = String(topic)
  const words = [
    ...(text.match(/[A-Za-z]{3,}/g) || []).filter(w => !STOPWORDS.has(w.toLowerCase())),
    ...GAME_TERMS.filter(t => text.includes(t)),
    ...(rules.keywords || []).map(k => k.keyword).filter(k => text.includes(k)),
  ]
  if (!words.length) return []
  const uniq = [...new Set(words.map(w => w.toLowerCase()))]

  const pool = rules.rules.filter(r => r.kind === "rule" && r.text.length > 30)
  const lower = pool.map(r => r.text.toLowerCase())
  // คำอังกฤษต้องตรงทั้งคำ ไม่งั้น "ace" ไปโดน "space" · คำไทยเทียบตรงได้เพราะไม่มีขอบเขตคำอยู่แล้ว
  const matcher = w => /^[a-z]+$/.test(w)
    ? (t => new RegExp(`\\b${w}\\b`).test(t))
    : (t => t.includes(w))

  const weights = uniq.map(w => {
    const hit = matcher(w)
    const df = lower.reduce((n, t) => n + (hit(t) ? 1 : 0), 0)
    return { w, hit, weight: df ? Math.max(Math.log(pool.length / df), 0.05) : 0 }
  }).filter(x => x.weight > 0)

  return pool
    .map((r, i) => ({
      r, score: weights.reduce((n, x) => n + (x.hit(lower[i]) ? x.weight * Math.min(x.w.length, 8) : 0), 0),
    }))
    .filter(x => x.score >= minScore)
    .sort((a, b) => b.score - a.score || a.r.text.length - b.r.text.length)
    .slice(0, limit)
    .map(x => x.r)
}

/** คีย์เวิร์ดที่ถูกเอ่ยถึงในข้อความ (เทียบกับหมวด 10 ของกฎทางการ) */
export function mentionedKeywords(rules, text, limit = 4) {
  if (!rules?.keywords || !text) return []
  return rules.keywords.filter(k => text.includes(k.keyword)).slice(0, limit)
}

/**
 * ก้อนข้อมูลอ้างอิงสำหรับใส่ prompt — สั้น ตรงเรื่อง และบอกที่มาเสมอ
 * คืน "" ถ้าไม่มีอะไรเกี่ยว เพื่อไม่ให้ prompt บวมฟรี ๆ
 *
 * maxChars คุมเฉพาะ "เนื้อข้อมูล" ไม่รวมหัวข้อกับคำเตือนท้ายบล็อก (~250 ตัวอักษร)
 * ตั้งใจให้เป็นแบบนี้ — คำเตือน "ห้ามแต่งเพิ่มเอง" ห้ามถูกตัดทิ้งเด็ดขาด
 */
export async function knowledgeBlock({ sku, setCode, topic = "", maxChars = 2200 } = {}) {
  const [rules, cards] = await Promise.all([loadRules(), loadCards()])
  if (!rules && !cards) return ""

  const parts = []
  const set = findSet(cards, setCode || sku)

  if (set) {
    // แยกให้ชัดว่า "การ์ดของชุดนี้" กับ "การ์ดพิมพ์ซ้ำจากชุดอื่นที่อยู่ในชุดนี้" คนละเลข
    // ไม่งั้นจะเขียนผิดว่า OP-17 มี 130 ใบ ทั้งที่รหัส OP17-xxx มี 119 ใบ
    const count = set.reprint_count
      ? `การ์ดรหัส ${set.code}-xxx ${set.own_set_count} ใบ · รวมที่พิมพ์ซ้ำจากชุดอื่นในชุดนี้ด้วยเป็น ${set.card_count} ใบ`
      : `ทั้งหมด ${set.card_count} ใบ`
    const head = `ชุด ${set.code || "-"} · ${set.label} · ${count}` +
      (set.in_our_machines ? " · ชุดนี้มีขายในตู้เรา" : " · ⚠ ชุดนี้เราไม่ได้ขาย อย่าเขียนว่ามีในตู้")
    const lines = notableCards(set).map(c => "  " + cardLine(c))
    parts.push(`การ์ดในชุด (ชื่อและค่าสถานะตามทางการ):\n${head}\n${lines.join("\n")}`)
  }

  // ชื่อชุดเป็นภาษาอังกฤษล้วนและไม่ใช่หัวข้อกฎ — ถ้าเอาไปรวม จะลากกฎที่ไม่เกี่ยวเข้ามา
  // แล้ววางไว้ใต้หัวข้อ "อ้างเลขข้อได้ตรง ๆ" ซึ่งเท่ากับชวนให้โมเดลอ้างเลขข้อมั่ว
  const topicText = String(topic || "")
  const rel = relevantRules(rules, topicText)
  if (rel.length) {
    parts.push("กฎทางการที่เกี่ยวข้อง (อ้างเลขข้อได้ตรง ๆ):\n" +
      rel.map(r => `  [ข้อ ${r.no}] ${r.text}`).join("\n"))
  }

  const kws = mentionedKeywords(rules, topicText)
  if (kws.length) {
    parts.push("คีย์เวิร์ดในเกม (คำนิยามทางการ):\n" +
      kws.map(k => `  [${k.keyword}] ${k.definition}`).join("\n"))
  }

  if (!parts.length) return ""

  const src = [
    rules && `กฎ v${rules._source.version} (${rules._source.official_updated})`,
    cards && `รายการการ์ด ดึง ${cards._source.fetched_at}`,
  ].filter(Boolean).join(" · ")

  let body = parts.join("\n\n")
  if (body.length > maxChars) body = body.slice(0, maxChars).replace(/\n[^\n]*$/, "")

  return "\n━━━ ข้อมูลทางการ One Piece Card Game ━━━\n" + body +
    `\n\nที่มา: เว็บทางการฉบับไทย · ${src}\n` +
    "ใช้ได้เฉพาะตัวเลข ชื่อการ์ด และเลขข้อกฎที่อยู่ในบล็อกนี้เท่านั้น " +
    "ห้ามแต่งเพิ่มเอง ถ้าไม่มีข้อมูลให้เลี่ยงการพูดถึงแทนการเดา\n"
}

export default { loadRules, loadCards, findSet, notableCards, relevantRules, mentionedKeywords, knowledgeBlock }
