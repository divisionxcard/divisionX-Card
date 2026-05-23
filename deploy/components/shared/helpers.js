import { THAI_MONTHS, SKU_SERIES_ORDER } from "./constants"

export const fmt   = (n) => (n ?? 0).toLocaleString("th-TH")
export const fmtB  = (n) => `฿${(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const today = () => new Date().toISOString().slice(0, 10)

// แปลง ISO timestamp (UTC) → "YYYY-MM-DD" ตามเวลาไทย (Asia/Bangkok = UTC+7)
// ใช้กับ sold_at จาก VMS ที่เป็น UTC · กันวันเลื่อนเที่ยงคืน BKK
export const toBkkDate = (iso) => {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  // shift เพิ่ม 7 ชม. แล้วใช้ UTC parts เพื่อหลีกเลี่ยง timezone ของ browser
  const bkk = new Date(d.getTime() + 7 * 3600 * 1000)
  return bkk.toISOString().slice(0, 10)
}

export const getSkuSeries = (skuId) => {
  if (!skuId) return "ZZ"
  if (skuId.startsWith("OP"))  return "OP"
  if (skuId.startsWith("PRB")) return "PRB"
  if (skuId.startsWith("EB"))  return "EB"
  return "ZZ"
}

export const sortSkus = (list) => [...list].sort((a, b) => {
  const sa = SKU_SERIES_ORDER[getSkuSeries(a.sku_id)] ?? 9
  const sb = SKU_SERIES_ORDER[getSkuSeries(b.sku_id)] ?? 9
  if (sa !== sb) return sa - sb
  return (a.sku_id || "").localeCompare(b.sku_id || "")
})

// เรียง: วันที่ล่าสุดก่อน → แล้วตาม Series (OP→PRB→EB) → แล้วตาม SKU ID
export const sortByDateThenSku = (a, b, dateField) => {
  const dateA = a[dateField] || a.created_at || ""
  const dateB = b[dateField] || b.created_at || ""
  const dateCmp = dateB.localeCompare(dateA)
  if (dateCmp !== 0) return dateCmp
  const seriesA = SKU_SERIES_ORDER[getSkuSeries(a.sku_id)] ?? 9
  const seriesB = SKU_SERIES_ORDER[getSkuSeries(b.sku_id)] ?? 9
  if (seriesA !== seriesB) return seriesA - seriesB
  return (a.sku_id || "").localeCompare(b.sku_id || "")
}

// แสดงจำนวนเป็น "X กล่อง Y ซอง" (ซ่อน 0 กล่อง / 0 ซอง)
export const fmtBoxPack = (packs, ppb) => {
  if (!packs || packs === 0) return "0 ซอง"
  const boxes = Math.floor(packs / ppb)
  const rem   = packs % ppb
  if (boxes === 0) return `${fmt(rem)} ซอง`
  if (rem   === 0) return `${fmt(boxes)} กล่อง`
  return `${fmt(boxes)} กล่อง ${rem} ซอง`
}

export function getLastNDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

export function fmtDayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00")
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`
}

export function convertToPacks(qty, unit, sku) {
  if (unit === "pack")   return qty
  if (unit === "box")    return qty * sku.packs_per_box
  if (unit === "cotton") return qty * (sku.boxes_per_cotton || 12) * sku.packs_per_box
  return qty
}

// ── Ksher Payment Gateway Fees ─────────────────────────────────────────
// VMS contract: 1.5% · WW contract: 0.5% (default = vms if brand unknown)
export const KSHER_FEE_BY_BRAND = { vms: 0.015, worldwide: 0.005 }
const DEFAULT_KSHER_FEE = 0.015

export function ksherFeePct(brand) {
  return KSHER_FEE_BY_BRAND[brand] ?? DEFAULT_KSHER_FEE
}

export function calcKsherFee(gross, brand) {
  return (gross || 0) * ksherFeePct(brand)
}

// สร้าง map { machine_id → brand } จาก machines list
export function buildBrandMap(machines) {
  const map = {}
  for (const m of machines || []) map[m.machine_id] = m.brand || "vms"
  return map
}
