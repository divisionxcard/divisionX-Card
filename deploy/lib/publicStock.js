// ข้อมูลหน้า /stock (หน้าสาธารณะ "เช็กของในตู้") — ฟังก์ชันล้วน ไม่ยิงเน็ต ไม่แตะคีย์
//
// ทำไมแยกไฟล์: หน้า /stock เป็น server component ที่ดึงด้วย service key (lib/publicPageData)
//   แล้วส่งต่อให้ client component — ไฟล์นี้คือ "ด่านกรอง" ว่าอะไรออกจากเซิร์ฟเวอร์ได้บ้าง
//   ทุกอย่างที่คืนจาก buildStockView() จะไปอยู่ใน HTML/JS ที่ใครก็เปิดดูได้
//
// ⚠️ กติกาข้อมูล (ตรวจกับข้อมูลจริง 16 ต.ค. 2026):
//   - ส่งออกเฉพาะ: ชื่อสาขา/ชั้น/จุดสังเกต/คำค้นแผนที่/พิกัด · ชื่อสินค้าจาก skus.name · จำนวนคงเหลือ · เวลาซิงก์
//   - ห้ามส่ง machine_stock.product_name — เป็นชื่อดิบจากหลังบ้านตู้ (เช่น "The Revals" ที่สะกดผิด)
//   - ห้ามส่งราคา/ต้นทุนทุกชนิด (cost_price · avg_cost · sell_price) — เจ้าของอยากให้หน้านี้มีแค่ชื่อกับจำนวน
//   - ห้ามส่ง config อื่นของตู้ (machine_id_vendor · portal_url ฯลฯ) — หยิบเฉพาะคีย์ใน config.branch ที่ใช้
//   - status ของแต่ละยี่ห้อตู้ไม่เหมือนกัน (vms active/inactive · worldwide Normal/Sold Out · payif normal/low/out)
//     → ไม่ใช้ status เลย ใช้ remain ตัวเดียว · กรองช่องเหมือนหน้าสต็อกหน้าตู้ของแอดมิน (มีสินค้า + is_occupied)
//   - SKU เดียวอยู่ได้หลายช่อง → รวม remain ต่อ (ตู้, sku_id, unit) · ช่องที่ sku_id ว่างข้าม (map ไม่ติด)
//   - เวลาอัปเดตของตู้ = synced_at ล่าสุดของตู้นั้น (ตัวเลขเป็นยอด ณ เวลานั้น ไม่ใช่ตอนนี้)

// ลำดับ + ชื่อที่ลูกค้าเห็น — 6 ตัวแรกตรงกับหน้า /products · ค่ายที่ไม่อยู่ในรายการไปต่อท้าย
export const FRANCHISES = [
  { key: "OP", label: "One Piece", emoji: "🏴‍☠️" },
  { key: "PKM", label: "Pokémon", emoji: "⚡" },
  { key: "YGH", label: "Yu-Gi-Oh!", emoji: "🃏" },
  { key: "DB", label: "Dragon Ball", emoji: "🐉" },
  { key: "NRT", label: "Naruto", emoji: "🍥" },
  { key: "SL", label: "Solo Leveling", emoji: "⚔️" },
  { key: "MLP", label: "My Little Pony", emoji: "🦄" },
  { key: "MLBB", label: "Mobile Legends", emoji: "🎮" },
  { key: "TF", label: "Transformers", emoji: "🤖" },
]
const FR_INDEX = Object.fromEntries(FRANCHISES.map((f, i) => [f.key, i]))

// ชื่อไฟล์ใน bucket sku-images ที่ยอมให้ตัวย่อรูป (/api/sku-thumb) ไปดึง — ใช้ตัวเดียวกันทั้งสองฝั่ง
// ตัวอัปรูปในหน้าจัดการ SKU ตั้งชื่อเป็น "{sku}-{pack|box}-{เวลา}.{นามสกุล}" (ตัวอักษรอังกฤษ/ตัวเลข/_/-)
export const SKU_THUMB_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.(webp|png|jpe?g|gif|avif)$/i

/**
 * URL รูปของ SKU → ชื่อไฟล์ใน bucket sku-images (ให้ /api/sku-thumb ย่อ) · ไม่ใช่ไฟล์ใน bucket → null
 * null = หน้าเว็บโชว์ไอคอนแทนรูป (ไม่ยอมโหลดรูปเต็มขนาดจากที่อื่นแทน — หน้านี้ต้องเบา)
 */
export function thumbFile(url, supabaseUrl) {
  if (!url || !supabaseUrl) return null
  const prefix = `${String(supabaseUrl).replace(/\/+$/, "")}/storage/v1/object/public/sku-images/`
  if (!String(url).startsWith(prefix)) return null
  let f = String(url).slice(prefix.length).split("?")[0]
  try { f = decodeURIComponent(f) } catch { return null }
  return SKU_THUMB_FILE_RE.test(f) && !f.includes("..") ? f : null
}

// ลำดับในหมวด One Piece ตามที่แอดมินใช้ (OP → PRB → EB) — เหมือน sortSkus ใน components/shared/helpers
const SERIES_RANK = (skuId) =>
  skuId.startsWith("OP") ? 0 : skuId.startsWith("PRB") ? 1 : skuId.startsWith("EB") ? 2 : 0
const frRank = (code) => FR_INDEX[code] ?? FRANCHISES.length
const cmpSku = (a, b) =>
  frRank(a.franchise) - frRank(b.franchise)
  || String(a.franchise || "").localeCompare(String(b.franchise || ""))
  || SERIES_RANK(a.sku_id) - SERIES_RANK(b.sku_id)
  || a.sku_id.localeCompare(b.sku_id, "en", { numeric: true })

// พิกัดต้องเป็นตัวเลขและอยู่ในกรอบประเทศไทยคร่าว ๆ — ค่าแปลก ๆ ถือว่าไม่มี (สาขานั้นไปอยู่ท้ายตอน "ใกล้ฉัน")
const coord = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null)

/**
 * แถวดิบจากฐานข้อมูล → ข้อมูลที่ส่งให้หน้าเว็บ (serialisable ทั้งก้อน)
 *
 * @param {object} p
 * @param {Array} p.machines   machines?select=machine_id,config (status=active)
 * @param {Array} p.stockRows  machine_stock?select=machine_id,sku_id,unit,remain,is_occupied,synced_at
 * @param {Array} p.skuRows    skus?select=sku_id,name,franchise,set_code,image_url,image_url_box
 * @param {string} p.supabaseUrl
 * @param {number} p.now       เวลาที่สร้างหน้า (ms)
 * @returns {{generatedAt:number, hasStock:boolean, franchises:object, skus:Array, branches:Array, unknownSkus:string[]}}
 *   unknownSkus มีไว้ให้ฝั่งเซิร์ฟเวอร์ log — ผู้เรียกต้องไม่ส่งต่อให้หน้าเว็บ
 */
export function buildStockView({ machines = [], stockRows = [], skuRows = [], supabaseUrl, now = Date.now() }) {
  const picked = machines
    .map((m) => ({ id: m?.machine_id, b: m?.config?.branch }))
    .filter((x) => x.id && x.b && x.b.public === true && x.b.display_name)
    .sort((a, b) => (a.b.order ?? 999) - (b.b.order ?? 999) || String(a.id).localeCompare(String(b.id)))
  const ids = new Set(picked.map((x) => x.id))
  const skuById = new Map(skuRows.filter((s) => s?.sku_id).map((s) => [s.sku_id, s]))

  const agg = new Map()      // machine_id → Map("sku|unit" → {sku, unit, remain})
  const latest = new Map()   // machine_id → synced_at ล่าสุด (ms)
  const unknown = new Set()
  let rowsForPublic = 0
  for (const r of stockRows) {
    if (!ids.has(r?.machine_id)) continue
    rowsForPublic++
    const t = Date.parse(r.synced_at)
    if (Number.isFinite(t) && t > (latest.get(r.machine_id) ?? -Infinity)) latest.set(r.machine_id, t)
    if (!r.sku_id || r.is_occupied === false) continue
    if (!skuById.has(r.sku_id)) { unknown.add(r.sku_id); continue }
    const unit = r.unit === "box" ? "box" : "pack"
    let m = agg.get(r.machine_id)
    if (!m) agg.set(r.machine_id, (m = new Map()))
    const key = `${r.sku_id}|${unit}`
    const cur = m.get(key) || { sku: r.sku_id, unit, remain: 0 }
    cur.remain += Math.max(0, Math.trunc(Number(r.remain) || 0))
    m.set(key, cur)
  }

  // ตาราง SKU — เฉพาะตัวที่อยู่ในตู้สาธารณะ เรียงตามลำดับแสดง · สินค้าในตู้อ้างด้วยเลขแถว (ไม่ส่ง sku_id ออกไป)
  const used = new Set()
  for (const m of agg.values()) for (const v of m.values()) used.add(v.sku)
  const skuList = [...used].map((id) => skuById.get(id)).sort(cmpSku)
  const skuIndex = new Map(skuList.map((s, i) => [s.sku_id, i]))
  const skus = skuList.map((s) => {
    const pack = thumbFile(s.image_url, supabaseUrl)
    return {
      name: String(s.name || s.sku_id),
      fr: s.franchise || "",
      code: s.set_code || "",
      pack,
      box: thumbFile(s.image_url_box, supabaseUrl) || pack,   // ไม่มีรูปกล่อง → ใช้รูปซองของชุดเดียวกัน
    }
  })

  const franchises = {}
  for (const s of skus) {
    if (franchises[s.fr] !== undefined) continue
    const f = FRANCHISES.find((x) => x.key === s.fr)
    franchises[s.fr] = f ? { label: f.label, emoji: f.emoji } : { label: s.fr || "อื่น ๆ", emoji: "🎴" }
  }

  const branches = picked.map(({ id, b }) => {
    const items = [...(agg.get(id)?.values() || [])]
      .map((v) => ({ s: skuIndex.get(v.sku), u: v.unit, r: v.remain }))
      .sort((x, y) => x.s - y.s || (x.u === "box") - (y.u === "box"))   // ซองก่อนกล่องของชุดเดียวกัน
    const at = latest.get(id)
    return {
      id: String(id),
      name: String(b.display_name),
      floor: b.floor ? String(b.floor) : "",
      landmark: b.landmark ? String(b.landmark) : "",
      maps: String(b.maps || b.display_name),
      lat: coord(b.lat, 5, 21),
      lng: coord(b.lng, 97, 106),
      syncedAt: Number.isFinite(at) ? new Date(at).toISOString() : null,
      items,
    }
  })

  return {
    generatedAt: now,
    hasStock: rowsForPublic > 0,
    franchises,
    skus,
    branches,
    unknownSkus: [...unknown],
  }
}

export default { FRANCHISES, SKU_THUMB_FILE_RE, thumbFile, buildStockView }
