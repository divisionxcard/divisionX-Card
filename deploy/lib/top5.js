// ซีรีส์ "ส่อง 5 ใบเด็ด" — เลือก 5 การ์ดของชุดที่ขายในตู้ จัดอันดับด้วยราคาตลาดจริง
//
// ทำไม (10 ต.ค. 2026): โพสต์ที่ได้ผลที่สุดของเพจคือ "5 อันดับการ์ดราคาสูง [ชุด OP16]" แบบที่ทีมทำเอง
//   ส่วนโพสต์ที่ AI เขียนได้ 0–1 รีแอ็กชันเพราะไม่มีข้อมูลการ์ดจริงให้เล่า (ดู worklog 2026-10-10)
//   เจ้าของเลือกให้นำร่องซีรีส์นี้ก่อน: การ์ดจริงจากคลัง + ราคาจาก card2price + รูปการ์ดจริง
//
// ⚠️ ใช้ราคาเฉพาะเวอร์ชันที่อยู่ในชุดนี้ (series_id ตรงกัน) — ใบเดียวกันพิมพ์ซ้ำหลายชุดได้
// ⚠️ ชื่อและระดับความหายากเอาจากคลังทางการของเรา ไม่ใช่จาก card2price (เขาใส่ระดับไม่ตรงบางใบ)
// ⚠️ ราคาเป็นของแคปชั่นเท่านั้น โปสเตอร์ใช้แค่รูปและชื่อ (กติกาที่เจ้าของเลือก)
import { loadCards, findSet } from "./opcgKnowledge"
import { fetchCardPrices, fetchCardPrice, priceBackedBySales } from "./cardPrice"

export const TOP_N = 5

// ที่เก็บ "5 ใบที่ใช้เขียนจริง" ของแต่ละโพสต์ — โปสเตอร์ต้องใช้ชุดเดียวกับแคปชั่นเป๊ะ
// ไม่คำนวณใหม่ตอนทำโปสเตอร์ เพราะราคาใน card2price ขยับได้ระหว่างเขียนกับทำภาพ → อันดับไม่ตรงกัน
// เก็บเป็นไฟล์ใน Storage แทนคอลัมน์ใหม่ — ไม่ต้องรอใครรัน migration (คอลัมน์ variants ใช้ไม่ได้:
// route variants เขียนทับทั้งคอลัมน์) · ⚠️ deploy/agents/poster_render.py อ่าน path เดียวกันนี้
export const TOP5_BUCKET = "marketing"
export const top5Path = (contentId) => `series/top5-${contentId}.json`
const CANDIDATE_RARITY = ["SEC", "L", "SR"]     // ลำดับนี้ใช้เติมตอนราคาไม่พอด้วย
const MAX_PER_CARD = 2                          // ใบเดียวกันไม่เกิน 2 เวอร์ชัน ไม่งั้น 5 อันดับเป็นลูฟี่ทั้งหมด
const MAX_CANDIDATES = 20                       // เพดานจำนวนหน้าที่เปิดใน card2price ต่อการเขียนหนึ่งครั้ง

// รูปการ์ดจากเว็บทางการ asia-th — แหล่งรูปที่เจ้าของอนุมัติ (15 ก.ย. 2026) · ชื่อไฟล์ = รหัสเวอร์ชัน
const OP_IMAGE_BASE = "https://asia-th.onepiece-cardgame.com/images/cardlist/card/"

// ⚠️ card2price ใช้รูปจาก asia-th เฉพาะชุดเก่า — ชุดใหม่ (OP-17 · 10 ต.ค. 2026) ลิงก์รูปเป็นของแหล่งอื่น
//    เดิมตัดทิ้งทุกใบที่ไม่มีรูป asia-th → OP-17 ได้ 0 ใบ ทั้งที่เว็บทางการมีรูปครบ
//    จึงลองหารูปใบเดียวกันบนเว็บทางการเอง แต่ต้องเช็กว่ามีจริงก่อนใช้ (เลขเวอร์ชันของตลาดญี่ปุ่น
//    อาจไม่ตรงกับเว็บเอเชีย) — ไม่มีก็ข้ามใบนั้น รูปผิดใบแย่กว่าไม่มีใบนั้น
async function officialImage(v, cache, probe) {
  if (v.image) return v.image
  if (!/^[A-Z]{2,4}\d{2}-\d{3}(_[a-z]\d+)?$/.test(v.code || "")) return null
  if (cache.has(v.code)) return cache.get(v.code)
  const url = `${OP_IMAGE_BASE}${v.code}.png`
  let ok = false
  try { ok = await probe(url) } catch { ok = false }
  cache.set(v.code, ok ? url : null)
  return ok ? url : null
}

const headOk = async (url) => {
  const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0 (compatible; DivisionXCard/1.0)" },
                               signal: AbortSignal.timeout(10000) })
  return r.ok && /image\//.test(r.headers.get("content-type") || "")
}

const RARITY_TH = {
  SEC: "SEC (ซีเคร็ทแรร์ ระดับสูงสุดของการ์ดปกติ)",
  L: "Leader (การ์ดผู้นำ)",
  SR: "SR (ซูเปอร์แรร์)",
}

const shortAbility = (s, n = 140) => {
  const t = String(s || "").replace(/\s+/g, " ").trim()
  return t.length > n ? t.slice(0, n) + "…" : t
}

/**
 * เลือก 5 อันดับของชุด — คืน null ถ้าหาชุดไม่เจอ
 * @param {string} setKey  set_code หรือ sku_id เช่น "OP13" / "OP 13"
 * @param {object} [o]
 * @param {Function} [o.fetchPrices]  ฉีดตัวดึงราคาเองได้ (ทดสอบโดยไม่ยิงเน็ต)
 */
export async function pickTop5(setKey, {
  now = Date.now(), fetchPrices = fetchCardPrices, fetchOne = fetchCardPrice, probe = headOk,
} = {}) {
  const cards = await loadCards()
  const set = findSet(cards, setKey)
  if (!set) return null

  const rankOf = (c) => CANDIDATE_RARITY.indexOf(String(c.rarity || "").toUpperCase())
  const candidates = set.cards
    .filter(c => rankOf(c) >= 0)
    .sort((a, b) => rankOf(a) - rankOf(b))
    .slice(0, MAX_CANDIDATES)
  const kb = Object.fromEntries(candidates.map(c => [c.code, c]))

  const prices = await fetchPrices(candidates.map(c => c.code), { now })
  const sid = String(set.series_id || "")

  // ทุกเวอร์ชันของทุกใบที่อยู่ในซองชุดนี้ + มีราคาใบดิบที่ยังสด (รูปค่อยหาตอนเลือก — เช็กเฉพาะใบที่จะใช้)
  const pool = []
  for (const c of candidates) {
    for (const v of prices[c.code]?.variants || []) {
      if (v.seriesId !== sid || !v.raw || !v.rawFresh) continue
      pool.push({ c, v })
    }
  }
  pool.sort((x, y) => y.v.raw - x.v.raw)

  const imgCache = new Map()
  const picked = [], perCard = {}
  const unbacked = []                    // ราคาที่ไม่มีการซื้อขายจริงรองรับ — เก็บไว้รายงาน ไม่เอาไปใช้
  for (const { c, v } of pool) {
    if (picked.length >= TOP_N) break
    if ((perCard[c.code] || 0) >= MAX_PER_CARD) continue
    // ราคาต้องมีการซื้อขายจริงรองรับ — เปิดหน้าของเวอร์ชันนั้นเอง (ใบปกติใช้หน้าที่ดึงมาแล้ว)
    // ⚠️ card2price มีราคาเวอร์ชันแพงที่ซ้ำกับใบอื่นทุกบาทและไม่มีประวัติขายเลย (ดู cardPrice.js)
    //    ถ้าไม่ตรวจ OP-17 จะขึ้นว่า Xebec ราคา ฿100,158 ซึ่งเป็นตัวเลขของเอส OP-13
    const own = v.variant ? await fetchOne(v.code, { now }) : prices[c.code]
    if (!priceBackedBySales(v.raw, own)) { unbacked.push(v.code); continue }
    const image = await officialImage(v, imgCache, probe)
    if (!image) continue                 // หารูปทางการของเวอร์ชันนี้ไม่เจอ = ไม่เอา ดีกว่ารูปผิดใบ
    perCard[c.code] = (perCard[c.code] || 0) + 1
    picked.push(item(c, { ...v, image }, true))
  }

  // ราคาไม่พอ 5 → เติมด้วยการ์ดหายากของชุดที่ยังไม่ถูกเลือก (ไม่มีราคา แต่ยังมีเรื่องให้เล่า)
  // ลองใบปกติก่อน แล้วค่อยเวอร์ชันอื่น — ต้องเป็นเวอร์ชันที่อยู่ในชุดนี้และหารูปทางการเจอ
  for (const c of candidates) {
    if (picked.length >= TOP_N) break
    if (perCard[c.code]) continue
    const vs = (prices[c.code]?.variants || []).filter(x => x.seriesId === sid)
      .sort((a, b) => (a.variant ? 1 : 0) - (b.variant ? 1 : 0))
    // card2price ไม่มีหน้านี้เลย → ลองใบปกติจากรหัสในคลังเอง (ชุดของเราเอง ใบปกติคือรหัสนี้เสมอ)
    if (!vs.length && c.code.startsWith(set.code.replace(/^([A-Z]+)(\d+)$/, "$1$2"))) {
      vs.push({ code: c.code, variant: null, image: null, ghost: false })
    }
    for (const v of vs) {
      const image = await officialImage(v, imgCache, probe)
      if (!image) continue
      perCard[c.code] = 1
      picked.push(item(c, { ...v, image }, false))
      break
    }
  }

  const dates = picked.filter(p => p.priced).map(p => p.rawAt).sort()
  return {
    set: { code: set.code, label: set.label, sku: set.our_sku_id || null, seriesId: sid },
    items: picked.map((p, i) => ({ rank: i + 1, ...p })),
    priced: picked.filter(p => p.priced).length,
    priceAsOf: dates.length ? dates[dates.length - 1] : null,
    unbacked,                            // รหัสที่ราคาไม่มีการซื้อขายจริงรองรับ (ตัดทิ้งแล้ว)
    source: "card2price.com",
    pickedAt: new Date(now).toISOString(),
  }

  function item(c, v, priced) {
    return {
      code: v.code,
      baseCode: c.code,
      variant: v.variant,
      ghost: v.ghost,
      name: c.name,
      rarity: c.rarity,
      type: c.type || null,
      color: c.color || null,
      cost: c.cost ?? null,
      power: c.power ?? null,
      traits: c.traits || null,
      ability: shortAbility(c.ability),
      raw: priced ? v.raw : null,
      rawAt: priced ? v.rawAt : null,
      priced,
      image: v.image,
    }
  }
}

/**
 * ข้อเท็จจริงสรุปที่คำนวณไว้ให้ — โมเดลห้ามคำนวณเอง
 *
 * ⚠️ ทดสอบจริง 10 ต.ค. 2026 (gpt-5.4 · OP-13): ตะขอเขียนว่า "มี 4 ใบทะลุหลักหมื่น"
 *    ทั้งที่ทั้ง 5 ใบเกิน ฿10,000 (ถูกสุด ฿25,751) — ตะขอคือบรรทัดที่คนอ่านมากที่สุด
 *    และเป็นที่ที่โมเดลชอบสรุปตัวเลขเองที่สุด จึงนับให้เสร็จแล้วสั่งให้ใช้แค่นี้
 */
export function top5Summary(t) {
  const priced = (t?.items || []).filter(it => it.priced && it.raw)
  if (!priced.length) return []
  const fmt = (n) => `฿${n.toLocaleString("en-US")}`
  const out = []
  const hi = Math.max(...priced.map(p => p.raw)), lo = Math.min(...priced.map(p => p.raw))
  out.push(priced.length === t.items.length
    ? `ราคาของทั้ง ${priced.length} ใบอยู่ระหว่าง ${fmt(lo)} ถึง ${fmt(hi)}`
    : `มีราคาตลาด ${priced.length} จาก ${t.items.length} ใบ อยู่ระหว่าง ${fmt(lo)} ถึง ${fmt(hi)}`)
  for (const [th, label] of [[100000, "หลักแสน (เกิน ฿100,000)"], [10000, "หลักหมื่นขึ้นไป (เกิน ฿10,000)"],
                             [1000, "หลักพันขึ้นไป (เกิน ฿1,000)"]]) {
    const n = priced.filter(p => p.raw >= th).length
    // ⚠️ อย่าเขียนว่า "จาก N ใบที่ระบบส่งมา/ที่มีราคา" — โมเดลลอกวลีจากข้อมูลไปลงโพสต์ตรง ๆ
    //    (ทดสอบ 10 ต.ค.: "มีการ์ดหลักแสน 2 ใบ จาก 5 ใบที่ระบบส่งมา")
    if (n) out.push(`ใบที่ราคา${label}: ${n} ใบ`)
  }
  if (priced.length >= 2 && lo > 0) {
    const x = hi / lo
    if (x >= 2) out.push(`อันดับแพงสุดราคาราว ${x >= 10 ? Math.round(x) : x.toFixed(1)} เท่าของใบที่ถูกสุดในรายการ`)
  }
  const byName = {}
  for (const it of t.items) byName[it.name] = (byName[it.name] || 0) + 1
  out.push(`ตัวละครในรายการ: ${Object.entries(byName).map(([n, c]) => `${n} ${c} ใบ`).join(" · ")}`)
  return out
}

/** บล็อกข้อมูลสำหรับ prompt ของคนเขียน — ทุกตัวเลขมีที่มาและวันที่ */
export function top5Knowledge(t) {
  if (!t?.items?.length) return ""
  const summary = top5Summary(t)
  const lines = t.items.map(it => {
    const ver = !it.variant ? "ใบปกติ"
      : `เวอร์ชันพาราเรล (ภาพพิเศษ)${it.ghost ? " แบบ ghost rare" : ""}`
    const price = it.priced
      ? `ราคาตลาดใบดิบ ฿${it.raw.toLocaleString("en-US")} (ณ ${it.rawAt})`
      : "ไม่มีราคาตลาดที่สดพอ — ห้ามพูดถึงราคาของใบนี้"
    const stat = [it.type, it.color, it.cost != null ? `คอสต์ ${it.cost}` : null,
      it.power != null ? `พลัง ${it.power}` : null].filter(Boolean).join(" · ")
    return `${it.rank}. ${it.name} (${it.code}) · ${RARITY_TH[it.rarity] || it.rarity} · ${ver}\n` +
      `   ${price}\n` +
      (stat ? `   ข้อมูลการ์ด: ${stat}${it.traits ? ` · คุณสมบัติ ${it.traits}` : ""}\n` : "") +
      (it.ability ? `   ความสามารถ: ${it.ability}\n` : "")
  })
  return `\n━━━ ข้อมูล "ส่อง 5 ใบเด็ด" — ชุด ${t.set.label} ━━━\n` +
    `เรียงตามราคาตลาดมือสองของใบดิบจาก card2price.com` +
    (t.priceAsOf ? ` (ข้อมูลล่าสุด ณ ${t.priceAsOf})` : "") + `\n\n` +
    lines.join("\n") +
    (summary.length
      ? `\nข้อเท็จจริงสรุป (นับและคำนวณไว้แล้ว — ถ้าจะสรุปเชิงตัวเลข ใช้เฉพาะข้อเหล่านี้ ห้ามนับหรือคำนวณเอง):\n` +
        summary.map(s => `- ${s}`).join("\n") + "\n"
      : "") +
    // มีราคาไม่ครบ = ใบท้าย ๆ ถูกเติมตามความหายาก ไม่ได้เรียงตามราคา — ต้องบอกให้ชัด
    // ไม่งั้นโมเดลจะเขียนว่า "5 อันดับราคาสูงสุด" ทั้งที่ 2 ใบหลังไม่มีราคาเลย (เจอกับ PRB-01: มีราคา 3 จาก 5)
    (t.priced < t.items.length
      ? `\n⚠️ ใบที่ไม่มีราคา (${t.items.filter(i => !i.priced).map(i => `#${i.rank}`).join(" ")}) ถูกเลือกเพราะความหายาก ไม่ได้จัดอันดับตามราคา — ` +
        `ห้ามเรียกทั้ง 5 ใบว่า "5 อันดับราคาสูงสุด" ให้เรียกใบเหล่านี้ว่าใบเด่นของชุดแทน\n`
      : "") +
    `\nกติกาเรื่องราคา (ห้ามละเมิด):\n` +
    // ⚠️ บรรทัดเครดิตต้องมีเฉพาะตอนมีราคาจริง — เดิมสั่งทุกครั้ง โพสต์ #52 (OP-17 ไม่มีราคาสักใบ)
    //    จึงปิดท้ายด้วย "อ้างอิงราคาตลาดจาก card2price ณ วันที่ดึงข้อมูล" ทั้งที่ไม่มีราคาในโพสต์เลย
    (t.priced > 0
      ? `- ใช้เฉพาะราคาในรายการนี้ ห้ามเดาหรือปัดเลขเอง และห้ามพยากรณ์ว่าราคาจะขึ้นหรือลง\n` +
        // #53 เขียนว่า "2 ใบที่ขยับไปอยู่ระดับหลักแสนแล้ว" — ประวัติจริงบน card2price คือ "ร่วง" ทั้งคู่
        // (฿398k → ฿257k · ฿160k → ฿100k) · ราคาที่ส่งให้เป็นจุดเดียว จึงห้ามเล่าทิศทางย้อนหลังด้วย
        `- ราคาในรายการเป็นตัวเลข ณ วันเดียว ไม่มีประวัติราคา — ห้ามเล่าทิศทางที่ผ่านมา (ขยับขึ้น/พุ่ง/ร่วง/ทะลุ…แล้ว) ให้บอกแค่ว่าอยู่ระดับไหน\n` +
        `- ราคาขึ้นลงตามกระแส ให้เขียนว่าเป็นราคาตลาด "ช่วงนี้" หรือ "ณ วันที่" ไม่ใช่ราคาตายตัว\n` +
        `- ท้ายโพสต์ต้องมีบรรทัดเครดิต: อ้างอิงราคาตลาดจาก card2price ณ ${t.priceAsOf}\n`
      : `- รอบนี้ไม่มีราคาที่เชื่อถือได้เลย — ห้ามพูดถึงราคาหรือมูลค่าการ์ด และห้ามใส่บรรทัดเครดิตราคา\n`) +
    `- ห้ามโยงว่าซื้อซองหรือกดตู้แล้วจะได้ใบนี้ หรือจะได้เงิน — ตู้ขายซองปิดผนึกธรรมดา ทุกซองคือการลุ้น\n` +
    `- เวอร์ชันพาราเรลให้เรียกว่า "เวอร์ชันพาราเรล" หรือ "ภาพพิเศษ" ห้ามเขียนรหัส p1/p2 ลงในโพสต์\n` +
    // #52 เขียน Luffy EB04-061 ว่า "ยิ่งไลฟ์น้อยยิ่งกดดัน" — ตัวบทจริงคือเกณฑ์เดียว (ไลฟ์ ≤1 → คอสต์ -1)
    // และความสามารถตอนลงสนามเป็นสายตั้งรับ ([บล็อกเกอร์]) ไม่ใช่สายกดดัน · คนเล่นจริงจับผิดได้ทันที
    `- ความสามารถการ์ด: สรุปจากตัวบทที่ให้ไว้ตรง ๆ เงื่อนไขเป็นเกณฑ์ตายตัว ห้ามเขียนเป็น "ยิ่ง…ยิ่ง…" ` +
    `และห้ามตีความว่าเป็นสายบุก/สายตั้งรับถ้าตัวบทไม่ได้บอก\n`
}
