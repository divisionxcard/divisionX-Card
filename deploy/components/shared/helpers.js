import { THAI_MONTHS, SKU_SERIES_ORDER } from "./constants"

export const fmt   = (n) => (n ?? 0).toLocaleString("th-TH")
export const fmtB  = (n) => `฿${(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const today = () => new Date().toISOString().slice(0, 10)

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
