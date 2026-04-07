// =============================================================
// DivisionX Card — TypeScript Type Definitions
// =============================================================

export type MachineStatus = 'active' | 'inactive'
export type SkuSeries = 'OP' | 'PRB' | 'EB'
export type StockUnit = 'pack' | 'box' | 'cotton'
export type MovementType = 'stock_in' | 'stock_out'

// ─── Machine ──────────────────────────────────────────────────
export interface Machine {
  id: number
  machine_id: string       // e.g., "machine_1"
  name: string             // e.g., "ตู้ที่ 1"
  location: string | null
  status: MachineStatus
  created_at: string
  updated_at: string
}

// ─── SKU ──────────────────────────────────────────────────────
export interface Sku {
  id: number
  sku_id: string           // e.g., "OP 01", "PRB 01"
  name: string
  series: SkuSeries
  packs_per_box: number    // OP/EB=12, PRB=10
  boxes_per_cotton: number // always 12
  sell_price: number       // ราคาขายต่อซอง
  cost_price: number       // ต้นทุนต่อซอง
  is_active: boolean
}

// ─── Stock In ─────────────────────────────────────────────────
export interface StockIn {
  id: number
  sku_id: string
  source: string
  unit: StockUnit
  quantity: number
  quantity_packs: number
  unit_cost: number
  total_cost: number
  purchased_at: string
  note: string | null
  created_by: string | null
}

// ─── Stock Out ────────────────────────────────────────────────
export interface StockOut {
  id: number
  sku_id: string
  machine_id: string
  quantity_packs: number
  withdrawn_at: string
  note: string | null
  created_by: string | null
}

// ─── Sales ───────────────────────────────────────────────────
export interface Sale {
  id: number
  machine_id: string
  sku_id: string
  quantity_sold: number
  revenue: number
  sold_at: string
  synced_at: string
  vms_ref: string | null
}

// ─── View Types ──────────────────────────────────────────────
export interface StockBalance {
  sku_id: string
  name: string
  series: SkuSeries
  sell_price: number
  cost_price: number
  total_packs_in: number
  total_packs_out: number
  balance_packs: number
}

export interface DailySales {
  sale_date: string
  machine_id: string
  sku_id: string
  total_qty: number
  total_revenue: number
}

export interface MonthlySales {
  sale_month: string
  machine_id: string
  sku_id: string
  total_qty: number
  total_revenue: number
}

export interface StockMovement {
  movement_type: MovementType
  ref_id: number
  sku_id: string
  sku_name: string
  machine_id: string | null
  packs: number
  description: string
  moved_at: string
  created_by: string | null
}
