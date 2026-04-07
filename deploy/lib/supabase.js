import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Stock Balance (คลังสินค้า) ────────────────────────────────
export async function getStockBalance() {
  const { data, error } = await supabase
    .from("v_stock_balance")
    .select("*")
    .order("sku_id")
  if (error) throw error
  return data
}

// ── Stock In (ประวัติรับสินค้า) ───────────────────────────────
export async function getStockIn() {
  const { data, error } = await supabase
    .from("stock_in")
    .select("*")
    .order("purchased_at", { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

// ── Stock Out (ประวัติเบิก) ────────────────────────────────────
export async function getStockOut() {
  const { data, error } = await supabase
    .from("stock_out")
    .select("*")
    .order("withdrawn_at", { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

// ── เพิ่ม Stock In ────────────────────────────────────────────
export async function addStockIn(record) {
  const { data, error } = await supabase
    .from("stock_in")
    .insert([record])
    .select()
    .single()
  if (error) throw error
  return data
}

// ── เพิ่ม Stock Out ───────────────────────────────────────────
export async function addStockOut(record) {
  const { data, error } = await supabase
    .from("stock_out")
    .insert([record])
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Daily Sales จาก VMS ───────────────────────────────────────
export async function getDailySales(days = 7) {
  const from = new Date()
  from.setDate(from.getDate() - days)
  const { data, error } = await supabase
    .from("v_daily_sales")
    .select("*")
    .gte("sale_date", from.toISOString().slice(0, 10))
    .order("sale_date", { ascending: false })
  if (error) throw error
  return data
}

// ── Sales Summary by Machine ──────────────────────────────────
export async function getSalesByMachine(days = 30) {
  const from = new Date()
  from.setDate(from.getDate() - days)
  const { data, error } = await supabase
    .from("sales")
    .select("machine_id, grand_total, quantity_sold, sold_at")
    .gte("sold_at", from.toISOString())
  if (error) throw error
  return data
}

// ── Top SKUs ──────────────────────────────────────────────────
export async function getTopSkus(days = 30) {
  const from = new Date()
  from.setDate(from.getDate() - days)
  const { data, error } = await supabase
    .from("sales")
    .select("sku_id, quantity_sold, grand_total, sold_at")
    .gte("sold_at", from.toISOString())
  if (error) throw error
  return data
}

// ── แก้ไข Stock In ───────────────────────────────────────────
export async function updateStockIn(id, record) {
  const { data, error } = await supabase
    .from("stock_in")
    .update(record)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── ลบ Stock In ───────────────────────────────────────────────
export async function deleteStockIn(id) {
  const { error } = await supabase
    .from("stock_in")
    .delete()
    .eq("id", id)
  if (error) throw error
}

// ── ลบ Stock Out ──────────────────────────────────────────────
export async function deleteStockOut(id) {
  const { error } = await supabase
    .from("stock_out")
    .delete()
    .eq("id", id)
  if (error) throw error
}

// ── Machines ──────────────────────────────────────────────────
export async function getMachines() {
  const { data, error } = await supabase
    .from("machines")
    .select("*")
    .order("machine_id")
  if (error) throw error
  return data
}

// ── SKUs ──────────────────────────────────────────────────────
export async function getSkus() {
  const { data, error } = await supabase
    .from("skus")
    .select("*")
    .eq("is_active", true)
    .order("sku_id")
  if (error) throw error
  return data
}
