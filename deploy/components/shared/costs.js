// ต้นทุนต่อซองตาม "วันที่ขาย" — ฟังก์ชันล้วน ไม่มี React (ทดสอบ: node scripts/test_costs_web.mjs)
//
// กติกาเดียวกับ deploy/agents/daily_sales_digest.py (Costs.on) — แก้ที่หนึ่งต้องแก้อีกที่ด้วย
//   1. ตาราง sku_costs (migration 083): ของ SKU นั้น เอาแถวล่าสุดที่ effective_from <= วันที่ขาย
//      (เทียบสตริง 'YYYY-MM-DD') → ใช้ cost_per_pack ของแถวนั้น (ถึงจะเป็น 0 ก็ใช้ 0 ไม่ถอยไปหา skus)
//   2. ไม่มีแถวไหนถึงวันนั้นเลย → skus.avg_cost > 0 ? avg_cost : (cost_price > 0 ? cost_price : 0)
//   3. ไม่รู้ต้นทุน = 0 เหมือนหน้าเว็บเดิม (ตัวสรุปทาง Telegram แยกเตือนแทน — หน้าเว็บไม่แตะ)
//
// แถวฐาน 2000-01-01 = ทุนที่หน้าเว็บเคยใช้ → กำไรก่อน 1 ส.ค. 2026 ออกมาเท่าเดิมทุกบาท
// วันที่ขายบนหน้าเว็บเป็นวันที่ไทยอยู่แล้ว (toBkkDate ใน DivisionXApp.jsx) ส่งมาตรง ๆ ได้เลย
// แถวกล่อง: หน้าเว็บแปลงจำนวนเป็นซองไว้แล้ว → ต้นทุน = costOn × จำนวนซอง

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// skuCosts = แถวจาก getSkuCosts() (ยังไม่มีตาราง = []) · skus = รายการ SKU ที่หน้านั้นใช้อยู่
export function buildCostIndex(skuCosts, skus) {
  const rows = (skuCosts || [])
    .filter(r => r && r.sku_id && r.effective_from)
    .map(r => ({ sku_id: r.sku_id, eff: String(r.effective_from).slice(0, 10), cost: num(r.cost_per_pack) }))
  // เรียงตามวันมีผล — sort ของ JS เสถียร วันซ้ำกันคงลำดับเดิม (แถวหลังชนะ เหมือนฝั่ง Python)
  rows.sort((a, b) => (a.eff < b.eff ? -1 : a.eff > b.eff ? 1 : 0))

  const hist = new Map()
  for (const r of rows) {
    if (!hist.has(r.sku_id)) hist.set(r.sku_id, [])
    hist.get(r.sku_id).push([r.eff, r.cost])
  }

  // ทุนสำรองจาก skus — ตัวแรกที่เจอชนะ (เหมือน skus.find เดิม)
  const fallback = new Map()
  for (const s of skus || []) {
    if (!s || !s.sku_id || fallback.has(s.sku_id)) continue
    const avg = num(s.avg_cost)
    const cp = num(s.cost_price)
    fallback.set(s.sku_id, avg > 0 ? avg : (cp > 0 ? cp : 0))
  }
  return { hist, fallback }
}

// ต้นทุนต่อซองของ skuId ณ วันที่ไทย bkkDate ('YYYY-MM-DD') — ไม่รู้ = 0
export function costOn(index, skuId, bkkDate) {
  const day = String(bkkDate || "").slice(0, 10)
  const rows = index?.hist?.get(skuId)
  let hit = null
  if (rows && day) {
    for (const [eff, cost] of rows) {
      if (eff <= day) hit = cost
      else break
    }
  }
  if (hit !== null) return hit
  return index?.fallback?.get(skuId) || 0
}
