// ราคาตลาดการ์ดจาก TCGCSV (tcgcsv.com) — สำเนาราคา TCGplayer (ตลาดสหรัฐฯ) ที่อัปเดตทุกวัน
//
// ทำไม (22 ต.ค. 2026): "ส่อง 5 ใบเด็ด" ขยายไปทุกค่าย แต่ card2price มีแค่ One Piece
//   เจ้าของเลือก TCGCSV สำหรับค่ายอื่น (ตัวเลือกร้านญี่ปุ่น yuyu-tei/cardrush ไม่เลือก — เงื่อนไขห้ามเผยแพร่ซ้ำ)
//   ครอบคลุม: Pokémon ญี่ปุ่น (cat 85) · Dragon Ball FW ฉบับอังกฤษ (cat 80) · Union Arena Solo Leveling
//   ฉบับอังกฤษ (cat 81 · UE17BT เลขการ์ดตรงกับ UA51BT) · ไม่มี Yu-Gi-Oh OCG และไม่มี KAYOU
//
// กติกาของ TCGCSV (FAQ/เอกสาร ตรวจ 22 ต.ค.): ดึงได้ ไม่ต้องขออนุญาต · ใส่ User-Agent ของเรา · เว้น ~100ms
//   · เช็ก last-updated.txt · ห้ามยิงจากหน้าเว็บที่ผู้ใช้เปิดโดยตรง (เราเรียกฝั่งเซิร์ฟเวอร์ตอนเขียนโพสต์ + แคชในตัว)
//   · ห้ามโหลดไฟล์ archive ซ้ำทุกวัน (เราไม่ใช้ archive)
//
// ⚠️ ราคาเป็น USD ของตลาดสหรัฐฯ · DB/SL เป็นราคาการ์ด "ฉบับอังกฤษ" ส่วนซองในตู้เราเป็นฉบับญี่ปุ่น (ภาพเดียวกัน)
//    ผู้เขียนต้องบอกแหล่ง + ตลาด + วันที่ทุกครั้ง (ดู lib/top5.js → top5Knowledge)
// ⚠️ marketPrice = ราคาที่ขายได้จริงช่วงหลัง (ตามเอกสาร TCGCSV) — ใบที่ไม่มี marketPrice ถือว่าไม่มีราคาที่เชื่อได้

const BASE = "https://tcgcsv.com/tcgplayer"
const UA = { "User-Agent": "DivisionXCard/1.0 (+https://division-x-card.vercel.app)", Accept: "application/json" }
const GAP_MS = 150

// set_code ของเรา → ตัวย่อกลุ่มบน TCGplayer (หา groupId จาก /groups เอง ไม่ฮาร์ดโค้ดเลข)
export const TCGCSV_SETS = {
  PKM: { cat: 85, groups: { M2A: "M2a", M4: "m4", M5: "M5" }, market: "Pokémon ฉบับญี่ปุ่น", sameLanguage: true },
  DB: {
    cat: 80, market: "Dragon Ball Fusion World ฉบับอังกฤษ", sameLanguage: false,
    groups: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`FB0${i + 1}`, `FB0${i + 1}`])),
  },
  SL: { cat: 81, groups: { UA51: "UE17BT", UA51BT: "UE17BT" }, market: "Union Arena Solo Leveling ฉบับอังกฤษ (UE17BT)", sameLanguage: false },
  // One Piece = ทางสำรองเมื่อ card2price เก่าเกิน 14 วัน (เจ้าของเลือก 22 ต.ค. 2026 · ดู lib/top5.js → opFromTcgcsv)
  // ⚠️ OP14 / OP15 บน TCGplayer ชื่อกลุ่ม "OP14-EB04" / "OP15-EB04" (ฉบับอังกฤษรวมการ์ด EB04 ไว้ในซองเดียวกัน)
  //    ไม่มีกลุ่ม "OP14" ตรง ๆ — เจอตอนรันตัวจับคู่ 22 ต.ค. · EB04 เองไม่ใส่ (ฉบับเอเชียเป็นซองแยก ราคาคนละตลาด)
  OP: {
    cat: 68, market: "One Piece ฉบับอังกฤษ", sameLanguage: false,
    groups: {
      ...Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`OP${String(i + 1).padStart(2, "0")}`, `OP${String(i + 1).padStart(2, "0")}`])),
      OP14: "OP14-EB04", OP15: "OP15-EB04",
      EB01: "EB01", EB02: "EB02", EB03: "EB03", PRB01: "PRB-01", PRB02: "PRB-02",
    },
  },
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const norm = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "")

async function getJson(url, timeoutMs = 20000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) })
  if (!r.ok) throw new Error(`TCGCSV ${r.status} ${url.replace(BASE, "")}`)
  return r.json()
}

// แคชในตัว instance — ตัวเขียนเรียกซ้ำตอนเขียนใหม่ (ซ้ำเกินเกณฑ์) ภายในไม่กี่วินาที ไม่ต้องดึงใหม่
const cache = new Map()
const TTL = 6 * 3600 * 1000
async function cached(key, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}

/** วันที่ข้อมูลชุดล่าสุดของ TCGCSV (ทั้งฐานข้อมูลใช้วันเดียวกัน) → "YYYY-MM-DD" หรือ null */
export async function tcgcsvUpdatedAt() {
  return cached("updated", async () => {
    try {
      const r = await fetch("https://tcgcsv.com/last-updated.txt", { headers: UA, signal: AbortSignal.timeout(10000) })
      const t = (await r.text()).trim()
      const d = new Date(t)
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
    } catch { return null }
  })
}

async function findGroup(cat, abbr) {
  const groups = await cached(`groups-${cat}`, () => getJson(`${BASE}/${cat}/groups`))
  const want = norm(abbr)
  const g = (groups.results || []).find(x => norm(x.abbreviation) === want)
  // ชื่อกลุ่ม Pokémon มีตัวย่อนำหน้า ("M5: Abyss Eye") — ตัดออกให้เหลือชื่อชุด
  return g ? { id: g.groupId, name: String(g.name || "").replace(/^[^:]+:\s*/, "") } : null
}

const ext = (p, name) => p.extendedData?.find(e => e.name === name)?.value ?? null

/**
 * การ์ดทุกใบในชุด + ราคาตลาด — คืน null ถ้าค่ายนี้/ชุดนี้ไม่มีใน TCGCSV หรือดึงไม่ได้
 * ไม่ทำให้งานเขียนล้ม (ขั้นเสริม) · กล่อง/ซอง/เคส (ไม่มีเลขการ์ด) ถูกตัดทิ้ง
 * @returns {{market, sameLanguage, updatedAt, groupId, groupName, cards: {productId,name,number,rarity,subType,market,low,mid,ext}[]}|null}
 */
export async function fetchSetPrices(franchise, setCode) {
  const cfg = TCGCSV_SETS[franchise]
  const abbr = cfg?.groups[norm(setCode)]
  if (!abbr) return null
  try {
    const g = await findGroup(cfg.cat, abbr)
    if (!g) return null
    const gid = g.id
    return await cached(`set-${cfg.cat}-${gid}`, async () => {
      const products = await getJson(`${BASE}/${cfg.cat}/${gid}/products`)
      await sleep(GAP_MS)
      const prices = await getJson(`${BASE}/${cfg.cat}/${gid}/prices`)
      const byId = {}
      for (const r of prices.results || []) (byId[r.productId] ??= []).push(r)
      const cards = []
      for (const p of products.results || []) {
        const number = ext(p, "Number")
        if (!number) continue                         // กล่อง ซอง เคส ของแถม
        // ใบเดียวกันมีหลาย subType (Holofoil/Normal/Reverse) — เอาตัวที่มี marketPrice สูงสุด
        const best = (byId[p.productId] || [])
          .filter(r => Number(r.marketPrice) > 0)
          .sort((a, b) => b.marketPrice - a.marketPrice)[0]
        cards.push({
          productId: p.productId,
          name: p.name,
          number,
          rarity: ext(p, "Rarity"),
          subType: best?.subTypeName || null,
          market: best ? Math.round(best.marketPrice * 100) / 100 : null,
          low: best?.lowPrice ?? null,
          mid: best?.midPrice ?? null,
          ext: Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value])),
        })
      }
      return {
        market: cfg.market,
        sameLanguage: cfg.sameLanguage,
        updatedAt: await tcgcsvUpdatedAt(),
        groupId: gid,
        groupName: g.name,
        cards,
      }
    })
  } catch {
    return null
  }
}

export default { TCGCSV_SETS, fetchSetPrices, tcgcsvUpdatedAt }
