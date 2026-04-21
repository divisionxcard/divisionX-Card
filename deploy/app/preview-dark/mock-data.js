// Mock data สำหรับ /preview-dark route
// มี shape เหมือน production data (stockIn, stockOut, stockBalance, skus)
// ใช้แค่ดู preview — ไม่ต่อ Supabase

import { SKUS } from "../../components/shared/constants"

export const MOCK_SKUS = SKUS.map((s, i) => ({
  ...s,
  avg_cost: s.cost_price * (1 + (i % 5) * 0.02),
  is_active: true,
  image_url: null,
}))

// สมมติ balance ต่อ SKU — ให้มีทั้ง full, low, empty
const MOCK_BALANCES = {
  "OP 01": 192, "OP 02": 100, "OP 03": 218, "OP 04": 0, "OP 05": 0,
  "OP 06": 170, "OP 07": 458, "OP 08": 413, "OP 09": 328, "OP 10": 285,
  "OP 11": 311, "OP 12": 240, "OP 13": 582, "OP 14": 412, "OP 15": 398,
  "PRB 01": 140, "PRB 02": 316,
  "EB 01": 144, "EB 02": 0, "EB 03": 296, "EB 04": 416,
}

export const MOCK_STOCK_BALANCE = MOCK_SKUS.map(s => {
  const balance = MOCK_BALANCES[s.sku_id] ?? 100
  const total_in = balance + Math.round(balance * 0.4)
  const total_out = total_in - balance
  return {
    sku_id: s.sku_id,
    balance,
    total_in,
    total_out,
  }
})

// สร้าง mock lots — 2-3 lot ต่อ SKU
export const MOCK_STOCK_IN = MOCK_SKUS.flatMap((s, skuIdx) => {
  const bal = MOCK_BALANCES[s.sku_id] ?? 100
  const base = Math.ceil((bal + bal * 0.4) / 3)
  return [
    {
      id: skuIdx * 10 + 1,
      sku_id: s.sku_id,
      lot_number: `LOT-20260415-${String(skuIdx + 1).padStart(2, "0")}`,
      quantity_packs: base,
      quantity: Math.ceil(base / s.packs_per_box),
      unit: "box",
      source: "Supplier A",
      purchased_at: "2026-04-15",
      created_at: "2026-04-15T10:00:00Z",
      total_cost: base * s.cost_price,
      note: "",
    },
    {
      id: skuIdx * 10 + 2,
      sku_id: s.sku_id,
      lot_number: `LOT-20260408-${String(skuIdx + 1).padStart(2, "0")}`,
      quantity_packs: base,
      quantity: Math.ceil(base / s.packs_per_box),
      unit: "box",
      source: "Supplier B",
      purchased_at: "2026-04-08",
      created_at: "2026-04-08T10:00:00Z",
      total_cost: base * s.cost_price * 1.02,
      note: "",
    },
    {
      id: skuIdx * 10 + 3,
      sku_id: s.sku_id,
      lot_number: `LOT-20260330-${String(skuIdx + 1).padStart(2, "0")}`,
      quantity_packs: base,
      quantity: Math.ceil(base / s.packs_per_box),
      unit: "box",
      source: "Supplier A",
      purchased_at: "2026-03-30",
      created_at: "2026-03-30T10:00:00Z",
      total_cost: base * s.cost_price * 0.98,
      note: "",
    },
  ]
})

// stock_out ปลอม — หักให้ balance ตรง
export const MOCK_STOCK_OUT = MOCK_SKUS.flatMap((s, skuIdx) => {
  const bal = MOCK_BALANCES[s.sku_id] ?? 100
  const total_in = bal + Math.round(bal * 0.4)
  const total_out = total_in - bal
  if (total_out <= 0) return []
  return [{
    id: skuIdx,
    sku_id: s.sku_id,
    lot_number: `LOT-20260408-${String(skuIdx + 1).padStart(2, "0")}`,
    machine_id: "chukes01",
    quantity_packs: total_out,
    withdrawn_at: "2026-04-20T10:00:00Z",
    note: `[${total_out}ซอง]`,
    created_by: "Mock",
  }]
})
