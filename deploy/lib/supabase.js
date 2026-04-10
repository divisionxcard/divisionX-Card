import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Auth ──────────────────────────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getProfile(userId) {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single()
  return data
}

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
    .order("created_at", { ascending: false })
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

// ── Sales Summary by Machine (pagination เพื่อดึงครบทุก record) ──
export async function getSalesByMachine(days = 30) {
  const from = new Date()
  from.setDate(from.getDate() - days)
  const all = []
  let offset = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from("sales")
      .select("machine_id, sku_id, transaction_id, product_name_raw, grand_total, quantity_sold, sold_at")
      .gte("sold_at", from.toISOString())
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    all.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
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

// ── เพิ่ม SKU ใหม่ ────────────────────────────────────────────
export async function addSku(record) {
  const { data, error } = await supabase
    .from("skus")
    .insert([record])
    .select()
    .single()
  if (error) throw error
  return data
}

// ── อัปเดตต้นทุนเฉลี่ยเคลื่อนที่ (Moving Average Cost) ────────
export async function updateSkuAvgCost(skuId, avgCost) {
  const { error } = await supabase
    .from("skus")
    .update({ avg_cost: avgCost })
    .eq("sku_id", skuId)
  if (error) throw error
}

// ── ปิดใช้งาน SKU (soft delete) ──────────────────────────────
export async function deactivateSku(skuId) {
  const { error } = await supabase
    .from("skus")
    .update({ is_active: false })
    .eq("sku_id", skuId)
  if (error) throw error
}

// ── Machine Stock (สต็อกหน้าตู้ จาก VMS) ─────────────────────
export async function getMachineStock() {
  const { data, error } = await supabase
    .from("machine_stock")
    .select("*")
    .order("machine_id")
    .order("slot_number")
  if (error) throw error
  return data
}
