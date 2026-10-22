// "ส่อง 5 ใบเด็ด" ของค่ายที่ไม่ใช่ One Piece — เลือก 5 ใบ + หารูปทางการ + ราคา (ถ้ามีแหล่ง)
//
// ทำไม (22 ต.ค. 2026): เจ้าของสั่งให้ทำซีรีส์นี้ได้ทุกค่าย และเลือกเอง:
//   ราคา = TCGCSV (ตลาดสหรัฐฯ · USD) สำหรับ Pokémon / Dragon Ball / Solo Leveling (ดู lib/tcgcsv.js)
//   รูปการ์ด = เว็บทางการของแต่ละค่าย (ยอมรับความเสี่ยงเอง · memory project_pack_image_rights)
//   ค่ายที่ไม่มีแหล่งราคา (KAYOU: Naruto · My Little Pony · MLBB · Transformers) = จัดตามระดับความหายาก
//
// ⚠️ Yu-Gi-Oh ยังทำไม่ได้: ไม่มีแหล่งราคา OCG ที่ดึงได้ถูกกติกา · รูปบนเว็บ Konami เปิดได้เฉพาะในเซสชัน
//    (200×290 มีคำว่า SAMPLE) · ชื่อการ์ดมีแต่ภาษาญี่ปุ่น · ข้อตกลง Konami ห้ามใช้เครื่องมืออัตโนมัติ
//    → pickTop5Franchise คืน { blocked } ให้หน้าเว็บบอกเหตุผล ไม่แต่งข้อมูลขึ้นเอง
//
// ผลลัพธ์รูปแบบเดียวกับ One Piece (lib/top5.js → pickTop5) + ฟิลด์เพิ่มที่ top5Knowledge / top5_poster.py อ่าน:
//   rankBasis "price"|"rarity" · currency · source/sourceLabel · market · sameLanguage · notes[] · posterMode
//   item.rarityLabel · item.tag (ป้ายสั้นบนโปสเตอร์) · item.variantLabel
import { readFile } from "fs/promises"
import path from "path"
import { loadDbfwCards, loadUaCards, loadKayouCards, loadKayouSeaCards } from "./tcgKnowledge"
import { fetchSetPrices } from "./tcgcsv"

export const TOP_N = 5
const MAX_PER_NAME = 2          // ชื่อเดียวกันไม่เกิน 2 ใบ ไม่งั้น 5 อันดับเป็นตัวละครเดียวทั้งหมด

// ⚠️ path ต้องเป็นสตริงตรง ๆ — Next ไล่หาไฟล์ที่ต้องแพ็กจากการอ่านโค้ด (บทเรียนเดียวกับ tcgKnowledge.js)
let _pkmJp = null
export function loadPkmJpCards() {
  _pkmJp ??= readFile(path.join(process.cwd(), "tasks", "pkm_jp_cards.json"), "utf-8")
    .then(JSON.parse).catch(() => null)
  return _pkmJp
}

const norm = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
const short = (s, n = 140) => {
  const t = String(s || "").replace(/\s+/g, " ").trim()
  return t.length > n ? t.slice(0, n) + "…" : t
}

const headOk = async (url) => {
  try {
    const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0 (compatible; DivisionXCard/1.0)" },
                                 signal: AbortSignal.timeout(10000) })
    return r.ok && /image\//.test(r.headers.get("content-type") || "")
  } catch { return false }
}

function capByName(list, n = TOP_N) {
  const out = [], per = {}
  for (const x of list) {
    if (out.length >= n) break
    const k = String(x.name || "").toLowerCase()
    if ((per[k] || 0) >= MAX_PER_NAME) continue
    per[k] = (per[k] || 0) + 1
    out.push(x)
  }
  return out
}

function finish({ franchise, set, items, rankBasis, currency = null, source, sourceLabel, market = null,
                  sameLanguage = true, priceAsOf = null, notes = [], now }) {
  const ranked = items.slice(0, TOP_N).map((it, i) => ({ rank: i + 1, ...it }))
  return {
    set: { ...set, franchise },
    items: ranked,
    priced: ranked.filter(i => i.priced).length,
    priceAsOf,
    unbacked: [],
    rankBasis, currency, source, sourceLabel, market, sameLanguage, notes,
    posterMode: ranked.length && ranked.every(i => i.image) ? "cards" : "pack",
    pickedAt: new Date(now).toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Pokémon ฉบับญี่ปุ่น — ราคา TCGCSV (cat 85) · รูป + ความหายากจาก pokemon-card.com (tasks/pkm_jp_cards.json)
// ─────────────────────────────────────────────────────────────────────────
const PKM_RANK = { MUR: 0, SAR: 1, UR: 2, MA: 3, SR: 4, AR: 5, RR: 6, R: 7, U: 8, C: 9 }

async function pkmTop5(setCode, { now, probe }) {
  const jp = await loadPkmJpCards()
  const set = jp?.sets?.find(s => norm(s.code) === norm(setCode))
  if (!set) return null
  const byNum = Object.fromEntries(set.cards.filter(c => c.number).map(c => [c.number, c]))
  const tc = await fetchSetPrices("PKM", set.code)

  const priced = (tc?.cards || [])
    .filter(c => c.market && byNum[c.number])
    .sort((a, b) => b.market - a.market)
    .map(c => {
      const j = byNum[c.number]
      return {
        code: `${set.code} ${c.number}`, baseCode: c.number, variant: null, ghost: false,
        name: c.name.replace(/\s*-\s*\d{3}\/\d{3}\s*$/, "").trim(),
        rarity: j.rarity || c.rarity, rarityLabel: j.rarity_full || c.rarity,
        tag: j.rarity || "", variantLabel: null,
        type: c.ext?.Stage || null, color: c.ext?.CardType || null,
        cost: null, power: c.ext?.HP ? `HP ${c.ext.HP}` : null, traits: null, ability: null,
        raw: c.market, rawAt: tc.updatedAt, priced: true, image: j.image,
      }
    })
  let items = capByName(priced)
  // ราคาไม่พอ → เติมด้วยระดับความหายากสูงสุดที่ยังไม่ถูกเลือก (ไม่มีราคา)
  if (items.length < TOP_N) {
    // ชื่อภาษาอังกฤษจาก TCGCSV แม้ใบนั้นไม่มีราคา — ชื่อญี่ปุ่นห้ามขึ้นโปสเตอร์/แคปชั่น (ลูกค้าอ่านไม่ออก)
    const enName = Object.fromEntries((tc?.cards || [])
      .map(c => [c.number, c.name.replace(/\s*-\s*\d{3}\/\d{3}\s*$/, "").trim()]))
    const taken = new Set(items.map(i => i.baseCode))
    const rest = set.cards.filter(c => c.number && !taken.has(c.number) && PKM_RANK[c.rarity] != null &&
                                       c.image && enName[c.number])
      .sort((a, b) => PKM_RANK[a.rarity] - PKM_RANK[b.rarity] || (b.num || 0) - (a.num || 0))
      .map(c => ({ code: `${set.code} ${c.number}`, baseCode: c.number, variant: null, ghost: false,
                   name: enName[c.number], rarity: c.rarity, rarityLabel: c.rarity_full, tag: c.rarity,
                   variantLabel: null, raw: null, rawAt: null, priced: false, image: c.image }))
    items = capByName([...items, ...rest])
  }
  // รูปจากเว็บทางการ — เช็กว่าเปิดได้จริงเฉพาะใบที่ใช้
  for (const it of items) if (!(await probe(it.image))) it.image = null
  return finish({
    franchise: "PKM", now, items: items.filter(i => i.image).length >= TOP_N ? items.filter(i => i.image) : items,
    set: { code: set.code, label: set.name_ja, displayCode: set.code, title: tc?.groupName || set.name_ja,
           sku: set.our_sku_id || null },
    rankBasis: "price", currency: "USD", source: "tcgcsv",
    sourceLabel: "TCGplayer (ตลาดสหรัฐฯ) ผ่าน TCGCSV", market: tc?.market || "Pokémon ฉบับญี่ปุ่น",
    sameLanguage: true, priceAsOf: tc?.updatedAt || null,
    notes: [
      "ชื่อการ์ดใช้ตามรายการ (ภาษาอังกฤษ) ได้เลย · ระดับ MUR/SAR/SR/AR คือการ์ดลับที่เลขเกินจำนวนชุด",
      "ซองในตู้เป็นฉบับญี่ปุ่น และราคานี้เป็นของการ์ดฉบับญี่ปุ่นที่ซื้อขายในตลาดสหรัฐฯ",
    ],
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Dragon Ball Fusion World — ราคา TCGCSV (cat 80 · ฉบับอังกฤษ) · รูปทางการฉบับญี่ปุ่น
// ─────────────────────────────────────────────────────────────────────────
const DB_IMG = "https://www.dbs-cardgame.com/fw/images/cards/card/jp/"
const DB_RANK = { SCR: 0, L: 1, SR: 2, R: 3, PR: 3.5, UC: 4, C: 5 }
const DB_RARITY_TH = { SCR: "SCR (Secret Rare)", L: "Leader (การ์ดผู้นำ)", SR: "SR (Super Rare)", R: "R (Rare)",
                       UC: "UC (Uncommon)", C: "C (Common)", PR: "PR (Promo)" }

// ชื่อบน TCGplayer บอกเวอร์ชันในวงเล็บ — พาราเรล ★ = Alternate Art (_p1) · ★★ = Super Alternate Art (_p2)
// ⚠️ _p2 = ★★ ยืนยันจากเครื่องหมายบนรูปทางการ + เว็บราคาญี่ปุ่น ไม่ใช่จากช่องความหายากของเว็บ (เว็บเขียน SCR เหมือนกันหมด)
function dbVariant(name) {
  const tags = [...String(name).matchAll(/\(([^)]+)\)/g)].map(m => m[1].trim())
  if (!tags.length) return 0
  if (tags.length === 1 && /^super alternate art$/i.test(tags[0])) return 2
  if (tags.length === 1 && /^alternate art$/i.test(tags[0])) return 1
  return -1                                    // เวอร์ชันที่ไม่รู้จัก (Gold Stamped ฯลฯ) — ไม่เดา
}

async function dbTop5(setCode, { now, probe }) {
  const data = await loadDbfwCards()
  const set = data?.sets?.find(s => norm(s.code) === norm(setCode))
  if (!set) return null
  const byCode = Object.fromEntries(set.cards.map(c => [c.code, c]))
  const tc = await fetchSetPrices("DB", set.code)

  const mk = (c, v, price) => {
    const leader = c.card_type === "ผู้นำ"
    const file = `${c.code}${leader ? "_f" : ""}${v ? `_p${v}` : ""}.webp`
    const stars = v ? "★".repeat(v) : ""
    return {
      code: `${c.code}${v ? `_p${v}` : ""}`, baseCode: c.code, variant: v ? `p${v}` : null, ghost: false,
      name: c.name, rarity: `${c.rarity}${stars}`, rarityLabel: DB_RARITY_TH[c.rarity] || c.rarity,
      tag: `${c.rarity}${stars}${v ? " · พาราเรล" : ""}`,
      variantLabel: v === 2 ? "พาราเรล ★★ (ภาพพิเศษระดับสูงสุด)" : v === 1 ? "พาราเรล ★ (ภาพพิเศษ)" : "ใบปกติ",
      type: c.card_type || null, color: (c.colors || []).join("/") || null,
      cost: c.cost ?? null, power: c.power ? `พลัง ${c.power}` : null, traits: c.feature || null,
      ability: short((c.effect || "").split("\n")[0]),
      raw: price ?? null, rawAt: price ? tc?.updatedAt : null, priced: !!price, image: DB_IMG + file,
    }
  }

  const priced = []
  for (const p of (tc?.cards || []).filter(x => x.market).sort((a, b) => b.market - a.market)) {
    const c = byCode[p.number]
    const v = dbVariant(p.name)
    if (!c || v < 0 || v > (c.art_variants || 1) - 1) continue
    priced.push(mk(c, v, p.market))
  }
  let items = []
  for (const it of capByName(priced, TOP_N + 4)) {
    if (items.length >= TOP_N) break
    if (await probe(it.image)) items.push(it)
  }
  if (items.length < TOP_N) {
    const taken = new Set(items.map(i => i.code))
    const rest = set.cards.filter(c => DB_RANK[c.rarity] != null)
      .sort((a, b) => DB_RANK[a.rarity] - DB_RANK[b.rarity])
      .map(c => mk(c, 0, null)).filter(i => !taken.has(i.code))
    for (const it of rest) {
      if (items.length >= TOP_N) break
      if (await probe(it.image)) items.push(it)
    }
  }
  const title = (set.label || "").replace(/^.*?-\s*|\s*-.*$/g, "").trim() || set.label
  return finish({
    franchise: "DB", now, items,
    set: { code: set.code, label: set.label, displayCode: set.code.replace(/^FB(\d)/, "FB-$1"),
           title: tc?.groupName || title, sku: set.our_sku_id || null },
    rankBasis: "price", currency: "USD", source: "tcgcsv",
    sourceLabel: "TCGplayer (ตลาดสหรัฐฯ) ผ่าน TCGCSV", market: tc?.market || "Dragon Ball Fusion World ฉบับอังกฤษ",
    sameLanguage: false, priceAsOf: tc?.updatedAt || null,
    notes: [
      "ความสามารถการ์ดในรายการเป็นภาษาไทยจากเว็บทางการ สรุปได้ ห้ามแต่งเพิ่ม",
      "★ / ★★ คือเวอร์ชันพาราเรล (ภาพพิเศษ) ของการ์ดใบเดียวกัน ไม่ใช่การ์ดคนละใบ",
    ],
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Union Arena — Solo Leveling · ราคา TCGCSV (UE17BT ฉบับอังกฤษ เลขตรงกับ UA51BT) · รูปทางการฉบับญี่ปุ่น
// ─────────────────────────────────────────────────────────────────────────
const UA_IMG = "https://www.unionarena-tcg.com/jp/images/cardlist/card/"
const UA_BASE = { "Super Rare": "SR", Rare: "R", Uncommon: "U", Common: "C" }
const UA_RANK = { SR: 0, R: 1, U: 2, C: 3 }

async function slTop5(setCode, { now, probe }) {
  const data = await loadUaCards()
  const set = data?.sets?.find(s => norm(s.our_set_code) === norm(setCode) || norm(s.code) === norm(setCode))
  if (!set) return null
  const byCode = Object.fromEntries(set.cards.map(c => [c.code, c]))
  const tc = await fetchSetPrices("SL", set.our_set_code || "UA51")

  const mk = (c, suffix, rarity, enName, price) => ({
    code: `${c.code}${suffix}`, baseCode: c.code, variant: suffix ? suffix.slice(1) : null, ghost: false,
    name: enName || c.name, rarity, rarityLabel: rarity,
    tag: `${rarity}${suffix ? " · พาราเรล" : ""}`,
    variantLabel: suffix ? `พาราเรล ${rarity}` : "ใบปกติ",
    type: null, color: null, cost: null, power: c.bp ? `BP ${c.bp}` : null, traits: null, ability: null,
    raw: price ?? null, rawAt: price ? tc?.updatedAt : null, priced: !!price,
    image: `${UA_IMG}${c.code.replace("/", "_")}${suffix}.png`,
  })

  const priced = []
  for (const p of (tc?.cards || []).filter(x => x.market).sort((a, b) => b.market - a.market)) {
    const base = UA_BASE[String(p.rarity || "").replace(/\s*\d-Star$/i, "").trim()]
    if (!base) continue                           // Action Point / ของแถม — ไม่ใช่การ์ดในซอง
    const code = String(p.number).replace(/^UE17BT\//, `${set.code}/`)
    const c = byCode[code]
    if (!c) continue
    const stars = Number((/(\d)-Star/i.exec(p.rarity || "") || [])[1] || 0)
    const want = `${base}${"★".repeat(stars)}`
    const suffix = stars ? (c.parallels || []).find(x => x.rarity === want)?.suffix : ""
    if (suffix == null) continue                  // หาเวอร์ชันญี่ปุ่นที่ตรงระดับไม่เจอ = ไม่เดารูป
    const enName = p.name.replace(/\s*\([^)]*\)/g, "").trim()
    priced.push(mk(c, suffix, want, enName, p.market))
  }
  let items = []
  for (const it of capByName(priced, TOP_N + 4)) {
    if (items.length >= TOP_N) break
    if (await probe(it.image)) items.push(it)
  }
  if (items.length < TOP_N) {
    const taken = new Set(items.map(i => i.code))
    const rest = []
    for (const c of set.cards) {
      for (const pa of c.parallels || []) if (pa.rarity) rest.push(mk(c, pa.suffix, pa.rarity, null, null))
      if (UA_RANK[c.rarity] != null) rest.push(mk(c, "", c.rarity, null, null))
    }
    rest.sort((a, b) => (b.rarity.match(/★/g) || []).length - (a.rarity.match(/★/g) || []).length ||
                        UA_RANK[a.rarity.replace(/★/g, "")] - UA_RANK[b.rarity.replace(/★/g, "")])
    for (const it of rest.filter(i => !taken.has(i.code))) {
      if (items.length >= TOP_N) break
      if (await probe(it.image)) items.push(it)
    }
  }
  return finish({
    franchise: "SL", now, items,
    set: { code: set.code, label: set.label, displayCode: set.code, title: "Solo Leveling", sku: null },
    rankBasis: "price", currency: "USD", source: "tcgcsv",
    sourceLabel: "TCGplayer (ตลาดสหรัฐฯ) ผ่าน TCGCSV", market: tc?.market || "Solo Leveling ฉบับอังกฤษ",
    sameLanguage: false, priceAsOf: tc?.updatedAt || null,
    notes: [
      "ชื่อตัวละครในรายการเป็นชื่อภาษาอังกฤษจากฉบับอังกฤษ ใช้ได้เลย · ★ ยิ่งมากยิ่งเป็นเวอร์ชันพิเศษ",
      "UNION ARENA เป็นเกมการ์ดที่เล่นได้จริง แต่ห้ามอธิบายกฎเพิ่มจากที่ไม่มีในข้อมูล",
    ],
  })
}

// ─────────────────────────────────────────────────────────────────────────
// KAYOU — Naruto · My Little Pony · Mobile Legends · Transformers · ไม่มีแหล่งราคา → จัดตามระดับ
// ─────────────────────────────────────────────────────────────────────────
const KAYOU_SRC = {
  NRT: { load: loadKayouCards, ip: "Naruto" },
  MLP: { load: loadKayouCards, ip: "My Little Pony" },
  MLBB: { load: loadKayouSeaCards, ip: "Mobile Legends: Bang Bang" },
  TF: { load: loadKayouSeaCards, ip: "Transformers" },
}

async function kayouTop5(franchise, setCode, { now, probe }) {
  const src = KAYOU_SRC[franchise]
  const data = await src.load()
  const s = data?.series?.find(x => x.ip_name === src.ip && norm(x.our_set_code) === norm(setCode))
  if (!s) return null
  const picked = []
  // ไล่ตามลำดับระดับที่เว็บทางการจัดแสดง (ระดับแรก ๆ = ใบเด่น) · ชื่อเดียวกันใบเดียว
  const seen = new Set()
  for (const t of s.rarity_tiers || []) {
    for (const c of s.cards || []) {
      if (picked.length >= TOP_N) break
      if (c.rarity !== t.name || !c.name || seen.has(c.name.toLowerCase())) continue
      seen.add(c.name.toLowerCase())
      picked.push({
        code: c.code, baseCode: c.code, variant: null, ghost: false, name: c.name,
        rarity: c.rarity, rarityLabel: t.full ? `${t.name} (${t.full})` : t.name, tag: c.rarity,
        // NRT/MLP = ชื่อธีมอาร์ตทางการ · MLBB/TF = คำบรรยายที่อ่านจากภาพการ์ด (ไม่ใช่ชื่อทางการ)
        variantLabel: t.art_theme
          ? (src.load === loadKayouSeaCards ? `ลักษณะการ์ด: ${t.art_theme}` : `ธีมอาร์ต ${t.art_theme}`)
          : null,
        type: null, color: null, cost: null, power: null, traits: null, ability: null,
        raw: null, rawAt: null, priced: false, image: c.image || null,
      })
    }
    if (picked.length >= TOP_N) break
  }
  for (const it of picked) if (it.image && !(await probe(it.image))) it.image = null
  const isGame = /trading card game/i.test(s.product_type || "")
  const notes = [
    "ไม่มีแหล่งราคาที่ใช้ได้ — จัดตามลำดับระดับความหายากที่เว็บทางการจัดแสดง ห้ามพูดถึงราคาหรือมูลค่า",
    isGame ? "ชุดนี้เป็นเกมการ์ดที่เล่นได้ (กล่องเขียน CARD GAME) แต่ห้ามอธิบายวิธีเล่นเอง"
           : "เป็นการ์ดสะสม ไม่ใช่เกมการ์ด — ห้ามชวนว่าเอาไปเล่นแข่งได้",
    `KAYOU เป็นผู้ผลิตที่ถือไลเซนส์ ไม่ใช่เจ้าของ ${src.ip}`,
    "ห้ามบอกว่าซองหนึ่งจะได้ใบไหน หรืออ้างอัตราออกการ์ด (กล่องในตู้เราต่างจากฉบับบนเว็บ)",
  ]
  if (franchise === "MLBB") notes.push("ไม่มีลำดับความหายากทางการ — ห้ามบอกว่าระดับไหนหายากที่สุด ให้เรียกว่าใบเด่นของชุด")
  if (franchise === "TF") notes.push("ไม่มีรูปการ์ดรายใบ — โปสเตอร์ใช้รูปกล่องสินค้า · ห้ามอ้างเลขซีเรียล (มาจากร้านค้า)")
  return finish({
    franchise, now, items: picked,
    set: { code: s.code_prefix, label: s.title, displayCode: "",
           // ชื่อเต็มของไลน์ KAYOU เอเชียยาวเกินบรรทัดบนโปสเตอร์ ("Transformers-Energy Critical…-001A-SEA") → ใช้ short_title
           title: s.short_title || [s.line, s.title].filter(Boolean).join(" · "),
           sku: s.our_sku_id || null },
    rankBasis: "rarity", currency: null, source: "kayou",
    sourceLabel: "เว็บทางการ KAYOU", notes,
  })
}

/**
 * @param {string} franchise ค่าจาก skus.franchise
 * @param {string} setCode   skus.set_code
 * @returns {Promise<object|null|{blocked:string}>}
 */
export async function pickTop5Franchise(franchise, setCode, { now = Date.now(), probe = headOk } = {}) {
  const o = { now, probe }
  if (franchise === "PKM") return pkmTop5(setCode, o)
  if (franchise === "DB") return dbTop5(setCode, o)
  if (franchise === "SL") return slTop5(setCode, o)
  if (KAYOU_SRC[franchise]) return kayouTop5(franchise, setCode, o)
  if (franchise === "YGH") {
    return { blocked: "Yu-Gi-Oh ยังทำ 5 ใบเด็ดไม่ได้ — ไม่มีแหล่งราคาฉบับญี่ปุ่นที่ดึงได้ถูกกติกา รูปบนเว็บ Konami ใช้ไม่ได้ " +
                      "(เปิดได้เฉพาะในเว็บ ขนาดเล็กมีคำว่า SAMPLE) และชื่อการ์ดมีแต่ภาษาญี่ปุ่น" }
  }
  return null
}

/** ชุดที่ทำซีรีส์นี้ได้ไหม — เช็กแค่ว่ามีในคลัง (ไม่ยิงเน็ต) ใช้กับหน้าเลือกชุด */
export async function hasTop5Data(franchise, setCode) {
  const code = norm(setCode)
  if (!code) return false
  if (franchise === "PKM") return !!(await loadPkmJpCards())?.sets?.some(s => norm(s.code) === code)
  if (franchise === "DB") return !!(await loadDbfwCards())?.sets?.some(s => norm(s.code) === code)
  if (franchise === "SL") return !!(await loadUaCards())?.sets?.some(s => norm(s.our_set_code) === code || norm(s.code) === code)
  if (KAYOU_SRC[franchise]) {
    const d = await KAYOU_SRC[franchise].load()
    return !!d?.series?.some(s => s.ip_name === KAYOU_SRC[franchise].ip && norm(s.our_set_code) === code)
  }
  return false
}

export default { pickTop5Franchise, hasTop5Data, loadPkmJpCards }
