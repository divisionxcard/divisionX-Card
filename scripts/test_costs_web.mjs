// ทดสอบต้นทุนตามวันที่ขายของหน้าเว็บ (deploy/components/shared/costs.js) — ฟังก์ชันล้วน ไม่ยิงเน็ต ไม่แตะ DB
//
// รัน: node scripts/test_costs_web.mjs   (คืน exit 1 ถ้ามีเคสพัง)
//
// เคสเดียวกับหมวด "ต้นทุนตามวันที่ขาย" ใน scripts/test_daily_digest.py (Costs.on ฝั่ง Python)
// ต่างกันจุดเดียวตามกติกา: ไม่รู้ทุน → ฝั่ง Python ได้ None (แยกเตือน) · หน้าเว็บได้ 0 (นับทุน 0 เหมือนเดิม)
// ⚠️ ตัวเลขทุนในไฟล์นี้แต่งขึ้นทั้งหมด — รีโปเป็นสาธารณะ ห้ามใส่ทุนจริง
import { pathToFileURL, fileURLToPath } from "node:url"

// อ้างจากตำแหน่งไฟล์เอง ไม่ hardcode path เครื่องใคร
const ROOT = fileURLToPath(new URL("..", import.meta.url))
const { buildCostIndex, costOn } = await import(pathToFileURL(`${ROOT}/deploy/components/shared/costs.js`).href)

let fails = 0
const check = (name, got, want) => {
  const ok = Object.is(got, want)
  if (!ok) fails++
  console.log(`${ok ? "✓" : "✗"} ${name}` + (ok ? "" : ` — ได้ ${JSON.stringify(got)} ต้องการ ${JSON.stringify(want)}`))
}

// ── เคสหลัก (โครงเดียวกับ test_daily_digest.py) ──
const skus = [
  { sku_id: "OP 13", avg_cost: 100.5, cost_price: 101 },
  { sku_id: "OP 16", avg_cost: 0, cost_price: 0 },
  { sku_id: "NEW", avg_cost: 0, cost_price: 99 },
  { sku_id: "OP 05", avg_cost: 300, cost_price: 280 },
]
const hist = [
  { sku_id: "OP 13", cost_per_pack: 100.5, effective_from: "2000-01-01" },
  { sku_id: "OP 13", cost_per_pack: 110, effective_from: "2026-08-01" },
  { sku_id: "OP 16", cost_per_pack: 0, effective_from: "2000-01-01" },
  { sku_id: "OP 16", cost_per_pack: 150, effective_from: "2026-08-01" },
  { sku_id: "OP 05", cost_per_pack: 300, effective_from: "2000-01-01" },
]
const c = buildCostIndex(hist, skus)
check("OP 13 ก่อนวันตัด = ทุนเดิม (แถวฐาน 2000-01-01)", costOn(c, "OP 13", "2026-07-31"), 100.5)
check("OP 13 วันตัดพอดี = ทุนใหม่", costOn(c, "OP 13", "2026-08-01"), 110)
check("OP 16 ก่อนวันตัด (เดิมไม่มีทุน) = 0 ไม่ถอยไปหา skus", costOn(c, "OP 16", "2026-07-01"), 0)
check("OP 16 หลังวันตัด = ทุนใหม่", costOn(c, "OP 16", "2026-10-29"), 150)
check("OP 05 ไม่มีแถวใหม่ = ทุนเดิมต่อไป", costOn(c, "OP 05", "2026-10-29"), 300)
check("SKU ใหม่ที่ยังไม่มีประวัติ = ใช้ cost_price", costOn(c, "NEW", "2026-10-29"), 99)
check("SKU ที่ไม่รู้จักเลย = 0", costOn(c, "??", "2026-10-29"), 0)

const cl = buildCostIndex(
  [{ sku_id: "LATE", cost_per_pack: 80, effective_from: "2026-08-01" }],
  [{ sku_id: "LATE", avg_cost: 0, cost_price: 70 }])
check("มีแค่แถวทุนใหม่ → ก่อนวันมีผลใช้ทุนใน skus", costOn(cl, "LATE", "2026-07-01"), 70)
check("มีแค่แถวทุนใหม่ → หลังวันมีผลใช้ทุนใหม่", costOn(cl, "LATE", "2026-09-01"), 80)

// ── ทุนสำรองจาก skus ──
const fb = buildCostIndex([], [
  { sku_id: "A", avg_cost: 45, cost_price: 40 },
  { sku_id: "B", avg_cost: 0, cost_price: 40 },
  { sku_id: "C", avg_cost: null, cost_price: null },
  { sku_id: "D" },
])
check("avg_cost > 0 มาก่อน cost_price", costOn(fb, "A", "2026-10-29"), 45)
check("avg_cost = 0 → cost_price", costOn(fb, "B", "2026-10-29"), 40)
check("avg_cost/cost_price เป็น null = 0", costOn(fb, "C", "2026-10-29"), 0)
check("ไม่มีฟิลด์ทุนเลย = 0", costOn(fb, "D", "2026-10-29"), 0)

// ── ข้อมูลเข้าแปลก ๆ ──
const shuffled = buildCostIndex([...hist].reverse(), skus)
check("แถวไม่เรียงมา → เรียงเองได้ผลเดิม (ก่อนตัด)", costOn(shuffled, "OP 13", "2026-07-31"), 100.5)
check("แถวไม่เรียงมา → เรียงเองได้ผลเดิม (หลังตัด)", costOn(shuffled, "OP 13", "2026-08-01"), 110)
const ts = buildCostIndex([{ sku_id: "T", cost_per_pack: "12.5", effective_from: "2026-08-01T00:00:00+00:00" }], [])
check("effective_from มีเวลาต่อท้าย → ตัดเหลือวัน · cost เป็นสตริงแปลงเป็นเลข", costOn(ts, "T", "2026-08-01"), 12.5)
check("วันที่ขายว่าง → ทุนใน skus", costOn(c, "NEW", ""), 99)
check("วันที่ขายว่าง ของที่มีประวัติ = ไม่เข้าแถวไหน → ถอยไปใช้ skus", costOn(c, "OP 13", ""), 100.5)
check("ยังไม่มีดัชนี (undefined) = 0", costOn(undefined, "OP 13", "2026-10-29"), 0)
check("skuCosts/skus เป็น null ก็ไม่พัง", costOn(buildCostIndex(null, null), "OP 13", "2026-10-29"), 0)
const dup = buildCostIndex([], [{ sku_id: "X", avg_cost: 10 }, { sku_id: "X", avg_cost: 20 }])
check("sku_id ซ้ำใน skus → ตัวแรกชนะ (เหมือน skus.find เดิม)", costOn(dup, "X", "2026-10-29"), 10)

// ── หน้าเว็บเดิม vs ใหม่: กำไรก่อน 1 ส.ค. ต้องเท่าเดิมทุกบาท ──
const oldCost = (id) => { const s = skus.find(sk => sk.sku_id === id); return s?.avg_cost || s?.cost_price || 0 }
const sales = [
  { sku_id: "OP 13", sold_at: "2026-05-03", quantity_sold: 3, revenue: 450 },
  { sku_id: "OP 05", sold_at: "2026-06-10", quantity_sold: 24, revenue: 9000 },   // กล่อง = แปลงเป็นซองแล้ว
  { sku_id: "NEW", sold_at: "2026-07-31", quantity_sold: 1, revenue: 150 },
  { sku_id: "OP 16", sold_at: "2026-07-15", quantity_sold: 2, revenue: 300 },
  { sku_id: "??", sold_at: "2026-07-20", quantity_sold: 1, revenue: 100 },
]
const profitOld = sales.reduce((a, r) => a + r.revenue - oldCost(r.sku_id) * (r.quantity_sold || 0), 0)
const profitNew = sales.reduce((a, r) => a + r.revenue - costOn(c, r.sku_id, r.sold_at) * (r.quantity_sold || 0), 0)
check("ก่อนวันตัด: กำไรสูตรใหม่ === สูตรเดิม", profitNew, profitOld)
const none = buildCostIndex([], skus)
const allOld = skus.every(s => costOn(none, s.sku_id, "2026-10-29") === oldCost(s.sku_id))
check("ยังไม่มีตาราง sku_costs ([]) → ทุนทุกตัวเท่าสูตรเดิม", allOld, true)

// ── หน้าวิเคราะห์: รวมต้นทุนรายแถว ไม่ใช่ซองรวม × ทุนตัวเดียว ──
const cross = [
  { sku_id: "OP 13", sold_at: "2026-07-31", quantity_sold: 2 },
  { sku_id: "OP 13", sold_at: "2026-08-01", quantity_sold: 3 },
]
const cogs = cross.reduce((a, r) => a + costOn(c, r.sku_id, r.sold_at) * (r.quantity_sold || 0), 0)
check("คร่อมวันตัด: 2 ซองทุนเดิม + 3 ซองทุนใหม่", cogs, 2 * 100.5 + 3 * 110)

console.log(fails ? `\n✗ พัง ${fails} เคส` : "\n✓ ผ่านทุกเคส")
process.exitCode = fails ? 1 : 0
