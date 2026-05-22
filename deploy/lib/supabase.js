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

// Lookup email จาก username (ผ่าน server-side endpoint ที่ใช้ service_role)
async function lookupEmailByUsername(username) {
  const res = await fetch("/api/auth/lookup-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  })
  if (!res.ok) throw new Error("not_found")
  const { email } = await res.json()
  if (!email) throw new Error("not_found")
  return email
}

// Login ด้วย username (lookup email → signInWithPassword)
export async function signInWithUsername(username, password) {
  const email = await lookupEmailByUsername(username)
  return signIn(email, password)
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/`,
  })
  if (error) throw error
}

// Reset password ด้วย username (lookup email → ส่งลิงก์ไป email จริง)
export async function resetPasswordByUsername(username) {
  const email = await lookupEmailByUsername(username)
  return resetPassword(email)
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

export async function getProfile(userId) {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single()
  return data
}

// ── Login History (ประวัติเข้า-ออกระบบ) ─────────────────────────
export async function logLoginEvent(userId, email, displayName, action = "login") {
  const { error } = await supabase
    .from("login_history")
    .insert([{
      user_id:      userId,
      email:        email,
      display_name: displayName || null,
      action:       action,
      user_agent:   typeof navigator !== "undefined" ? navigator.userAgent : null,
    }])
  if (error) console.error("Failed to log login event:", error)
}

export async function getLoginHistory(limit = 50) {
  const { data, error } = await supabase
    .from("login_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
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
  if (error) throw error
  return data
}

// ── Stock Out (ประวัติเบิก) ────────────────────────────────────
export async function getStockOut() {
  const { data, error } = await supabase
    .from("stock_out")
    .select("*")
    .order("withdrawn_at", { ascending: false })
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
export async function getSalesByMachine(daysOrDate = 30) {
  let from
  if (typeof daysOrDate === "number") {
    from = new Date()
    from.setDate(from.getDate() - daysOrDate)
  } else {
    from = new Date(daysOrDate)
  }
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

// ── แก้ไข Stock Out ───────────────────────────────────────────
export async function updateStockOut(id, record) {
  const { data, error } = await supabase
    .from("stock_out")
    .update(record)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── ลบ Stock Out ──────────────────────────────────────────────
export async function deleteStockOut(id) {
  const { error } = await supabase
    .from("stock_out")
    .delete()
    .eq("id", id)
  if (error) throw error
}

export async function deleteStockOutByClaim(claimId) {
  const { error } = await supabase
    .from("stock_out")
    .delete()
    .eq("from_claim_id", claimId)
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

// ── Upload รูป SKU เข้า Storage + UPDATE column ที่ระบุ ─────
// column = "image_url" (pack) หรือ "image_url_box" (box)
// path = "{sku_id sanitized}-{variant}-{timestamp}.{ext}" — กัน browser cache + แยก pack/box
export async function uploadSkuImage(skuId, file, currentUrl = null, column = "image_url") {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase()
  const safeName = skuId.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_")
  const variant = column === "image_url_box" ? "box" : "pack"
  const path = `${safeName}-${variant}-${Date.now()}.${ext}`

  const { error: upErr } = await supabase.storage
    .from("sku-images")
    .upload(path, file, { upsert: true, contentType: file.type || `image/${ext}` })
  if (upErr) throw upErr

  const { data: { publicUrl } } = supabase.storage
    .from("sku-images")
    .getPublicUrl(path)

  const { error: updErr } = await supabase
    .from("skus")
    .update({ [column]: publicUrl })
    .eq("sku_id", skuId)
  if (updErr) throw updErr

  // ลบไฟล์เก่า (best-effort — ถ้าลบไม่ได้ไม่ throw)
  if (currentUrl) {
    const m = currentUrl.match(/\/sku-images\/(.+)$/)
    if (m) {
      const oldPath = decodeURIComponent(m[1].split("?")[0])
      if (oldPath !== path) {
        await supabase.storage.from("sku-images").remove([oldPath]).catch(() => {})
      }
    }
  }

  return publicUrl
}

// ── ลบรูป SKU — clear column + remove file ───────────────────
export async function deleteSkuImage(skuId, currentUrl = null, column = "image_url") {
  if (currentUrl) {
    const m = currentUrl.match(/\/sku-images\/(.+)$/)
    if (m) {
      const path = decodeURIComponent(m[1].split("?")[0])
      await supabase.storage.from("sku-images").remove([path]).catch(() => {})
    }
  }
  const { error } = await supabase
    .from("skus")
    .update({ [column]: null })
    .eq("sku_id", skuId)
  if (error) throw error
}

// ── Claims (เคลม/คืนเงิน) ────────────────────────────────────
export async function getClaims() {
  const { data, error } = await supabase
    .from("claims")
    .select("*")
    .order("claimed_at", { ascending: false })
  if (error) throw error
  return data
}

export async function addClaim(record) {
  const { data, error } = await supabase
    .from("claims")
    .insert([record])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateClaim(id, updates) {
  const { data, error } = await supabase
    .from("claims")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteClaim(id) {
  const { error } = await supabase
    .from("claims")
    .delete()
    .eq("id", id)
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

// ── Machine Assignments (ผูกแอดมินกับตู้) ─────────────────────
export async function getMachineAssignments() {
  const { data, error } = await supabase
    .from("machine_assignments")
    .select("*")
    .eq("is_active", true)
    .order("machine_id")
  if (error) throw error
  return data
}

export async function addMachineAssignment(record) {
  const { data, error } = await supabase
    .from("machine_assignments")
    .insert([record])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteMachineAssignment(id) {
  const { error } = await supabase
    .from("machine_assignments")
    .delete()
    .eq("id", id)
  if (error) throw error
}

// ── Stock Transfers (แจกจ่ายสินค้าจากสต็อกหลัก → สต็อกย่อย) ──
export async function getStockTransfers() {
  const { data, error } = await supabase
    .from("stock_transfers")
    .select("*")
    .order("transferred_at", { ascending: false })
  if (error) throw error
  return data
}

export async function addStockTransfer(record) {
  const { data, error } = await supabase
    .from("stock_transfers")
    .insert([record])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteStockTransfer(id) {
  const { error } = await supabase
    .from("stock_transfers")
    .delete()
    .eq("id", id)
  if (error) throw error
}

export async function deleteStockTransfersByClaim(claimId) {
  const { error } = await supabase
    .from("stock_transfers")
    .delete()
    .eq("from_claim_id", claimId)
  if (error) throw error
}

// ── Profiles (ดึงรายชื่อ admin ทั้งหมด) ──────────────────────
export async function getAllProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("display_name")
  if (error) throw error
  return data
}

// ── Stock Withdrawal Requests (คำขอเบิกจาก main · T อนุมัติ) ──
export async function getWithdrawalRequests() {
  const { data, error } = await supabase
    .from("stock_withdrawal_requests")
    .select("*")
    .order("requested_at", { ascending: false })
  if (error) throw error
  return data
}

export async function addWithdrawalRequest(record) {
  const { data, error } = await supabase
    .from("stock_withdrawal_requests")
    .insert([record])
    .select()
    .single()
  if (error) throw error
  return data
}

// Atomic: insert stock_transfers + update request → approved
export async function approveWithdrawalRequest(requestId, lotNumber, resolvedBy) {
  const { data, error } = await supabase.rpc("approve_withdrawal_request", {
    p_request_id:  requestId,
    p_lot_number:  lotNumber,
    p_resolved_by: resolvedBy,
  })
  if (error) throw error
  return data
}

export async function rejectWithdrawalRequest(requestId, resolvedBy) {
  const { data, error } = await supabase
    .from("stock_withdrawal_requests")
    .update({
      status:      "rejected",
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cancelWithdrawalRequest(requestId) {
  const { data, error } = await supabase
    .from("stock_withdrawal_requests")
    .update({
      status:      "cancelled",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Ship Fails (ลูกค้าจ่ายเงินแต่เครื่องไม่ดันสินค้า) ─────────
export async function getShipFails() {
  const { data, error } = await supabase
    .from("ship_fails")
    .select("*")
    .order("sold_at", { ascending: false })
  if (error) throw error
  return data
}

export async function getPendingShipFailCount() {
  const { count, error } = await supabase
    .from("ship_fails")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
  if (error) throw error
  return count || 0
}

// Mark Ship Fail as resolved + บันทึก refunded_amount + note
export async function resolveShipFail(id, { refundedAmount, note, userId }) {
  const { data, error } = await supabase
    .from("ship_fails")
    .update({
      status: "resolved",
      verified_at: new Date().toISOString(),
      verified_by: userId || null,
      refunded_amount: refundedAmount ?? null,
      refunded_at: refundedAmount != null ? new Date().toISOString() : null,
      refunded_note: note || null,
    })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Re-open: กลับเป็น pending (เผื่อแก้ผิด)
export async function reopenShipFail(id) {
  const { data, error } = await supabase
    .from("ship_fails")
    .update({
      status: "pending",
      verified_at: null,
      verified_by: null,
      refunded_amount: null,
      refunded_at: null,
      refunded_note: null,
    })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Slot Products History (Layer 3-4) ────────────────────────
// Recent slot product changes (last N days · default 7)
// Returns "change events": pairs of closed period → newer period per slot
export async function getRecentSlotChanges(days = 7, { includeReviewed = false } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from("slot_products_history")
    .select("*")
    .or(`effective_to.gte.${since},effective_from.gte.${since}`)
    .order("machine_id", { ascending: true })
    .order("slot_number", { ascending: true })
    .order("effective_from", { ascending: false })
  if (error) throw error
  // Group by (machine_id, slot_number) → list of periods desc
  const grouped = {}
  for (const r of data || []) {
    const key = `${r.machine_id}::${r.slot_number}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(r)
  }
  const changes = []
  for (const key in grouped) {
    const periods = grouped[key]
    for (let i = 0; i < periods.length - 1; i++) {
      const newer = periods[i]
      const older = periods[i + 1]
      if (older.effective_to) {
        if (!includeReviewed && older.review_status === "confirmed") continue
        changes.push({
          history_id:        older.id,                // ID ของ row "closed period" (สำหรับ review)
          machine_id:        older.machine_id,
          slot_number:       older.slot_number,
          changed_at:        older.effective_to,
          old_product_name:  older.product_name,
          old_sku_id:        older.sku_id,
          old_product_id:    older.product_id,
          new_product_name:  newer.product_name,
          new_sku_id:        newer.sku_id,
          new_product_id:    newer.product_id,
          review_status:     older.review_status || "pending",
          review_note:       older.review_note,
          reviewed_at:       older.reviewed_at,
          // Layer 6 · Reconcile
          pending_qty:       older.pending_qty,
          disposition:       older.disposition,
          disposition_target: older.disposition_target,
          reconciled_at:     older.reconciled_at,
        })
      }
    }
  }
  changes.sort((a, b) => (b.changed_at || "").localeCompare(a.changed_at || ""))
  return changes
}

export async function getRecentSlotChangeCount(days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from("slot_products_history")
    .select("*", { count: "exact", head: true })
    .gte("effective_to", since)
    .eq("review_status", "pending")
  if (error) throw error
  return count || 0
}

// ── Active slot mappings + history (Layer 5) ─────────────────────
// คืน mapping ปัจจุบัน (effective_to IS NULL) ของทุกตู้ หรือเฉพาะตู้
export async function getActiveSlotMappings(machineId = null) {
  let q = supabase
    .from("slot_products_history")
    .select("*")
    .is("effective_to", null)
    .order("machine_id", { ascending: true })
    .order("slot_number", { ascending: true })
  if (machineId) q = q.eq("machine_id", machineId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// คืน history เต็มของ slot ใดตู้ใด (ทั้งปิดและ active)
export async function getSlotHistory(machineId, slotNumber) {
  const { data, error } = await supabase
    .from("slot_products_history")
    .select("*")
    .eq("machine_id", machineId)
    .eq("slot_number", slotNumber)
    .order("effective_from", { ascending: false })
  if (error) throw error
  return data || []
}

// Admin บันทึก slot change ด้วยตนเอง (ก่อน scraper ตรวจพบ)
//   - ปิด active row เดิม (effective_to = now)
//   - INSERT row ใหม่ (effective_from = now · status = confirmed · detected_by = 'manual')
export async function recordSlotChangeManual({
  machine_id, slot_number,
  new_product_id, new_product_name, new_sku_id, note,
}) {
  const now = new Date().toISOString()
  const { data: active } = await supabase
    .from("slot_products_history")
    .select("id")
    .eq("machine_id", machine_id)
    .eq("slot_number", slot_number)
    .is("effective_to", null)
    .maybeSingle()
  if (active) {
    const { error: upErr } = await supabase
      .from("slot_products_history")
      .update({
        effective_to:  now,
        review_status: "confirmed",
        review_note:   note || "Manual change by admin",
        reviewed_at:   now,
      })
      .eq("id", active.id)
    if (upErr) throw upErr
  }
  const { data, error } = await supabase
    .from("slot_products_history")
    .insert({
      machine_id, slot_number,
      product_id:    new_product_id,
      product_name:  new_product_name,
      sku_id:        new_sku_id,
      effective_from: now,
      detected_by:   "manual",
      review_status: "confirmed",
      review_note:   note || "Manual change by admin",
      reviewed_at:   now,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Review slot change event (อิงกับ row "closed period" — history_id)
//   status: 'confirmed' | 'flagged'
export async function reviewSlotChange(historyId, status, note = null) {
  if (!["confirmed", "flagged"].includes(status)) throw new Error("invalid review status")
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from("slot_products_history")
    .update({
      review_status: status,
      review_note:   note,
      reviewed_at:   new Date().toISOString(),
      reviewed_by:   user?.id || null,
    })
    .eq("id", historyId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Slot Reconciliation (Layer 6 · Migration 038) ─────────────────
// reconcileSlotChange(historyId, options)
//   options.disposition: 'returned' | 'transferred_to_admin' | 'moved_to_machine' | 'lost' | 'unknown'
//   options.qty: number (default = row.pending_qty)
//   options.targetMachineId, options.targetSlotNumber: สำหรับ moved_to_machine
//   options.targetAdminId (UUID): สำหรับ transferred_to_admin
//   options.note: optional string
//   options.lotNumber: optional (for transferred_to_admin)
//
// ฟังก์ชันจะ:
//   1) Insert stock movement (stock_in/stock_out/stock_transfers/claims) ตาม disposition
//   2) Update slot_products_history (disposition, disposition_target, reconciled_at)
export async function reconcileSlotChange(historyId, options = {}) {
  const { disposition, qty, targetMachineId, targetSlotNumber, targetAdminId, note, lotNumber } = options
  const validDispositions = ["returned","transferred_to_admin","moved_to_machine","lost","unknown"]
  if (!validDispositions.includes(disposition)) throw new Error("invalid disposition: " + disposition)

  // 1. Get history row
  const { data: row, error: e0 } = await supabase
    .from("slot_products_history")
    .select("id, machine_id, slot_number, sku_id, product_name, pending_qty, effective_to, disposition")
    .eq("id", historyId)
    .single()
  if (e0) throw e0
  if (!row.effective_to) throw new Error("ไม่สามารถ reconcile active row ได้ (effective_to=NULL)")
  if (row.disposition) throw new Error(`reconcile แล้ว · disposition='${row.disposition}'`)

  const { data: { user } } = await supabase.auth.getUser()
  const createdBy = user?.email || "system"
  const finalQty = (typeof qty === "number" && qty > 0) ? qty : (row.pending_qty || 0)

  // disposition='unknown' หรือ qty=0 → ไม่สร้าง movement · แค่ mark
  let movementRef = {}

  if (disposition !== "unknown" && finalQty > 0) {
    if (!row.sku_id) throw new Error("row ไม่มี sku_id · ไม่สามารถสร้าง stock movement ได้")

    if (disposition === "returned") {
      const { data, error } = await supabase
        .from("stock_in")
        .insert({
          sku_id:         row.sku_id,
          source:         `machine_return: ${row.machine_id} ช่อง ${row.slot_number}`,
          unit:           "pack",
          quantity:       finalQty,
          quantity_packs: finalQty,
          unit_cost:      0,
          total_cost:     0,
          note:           note || `Reconcile slot history #${historyId} → คืนกลาง`,
          created_by:     createdBy,
        })
        .select("id").single()
      if (error) throw error
      movementRef = { stock_in_id: data.id }
    }

    else if (disposition === "transferred_to_admin") {
      if (!targetAdminId) throw new Error("transferred_to_admin ต้องระบุ targetAdminId")
      const { data, error } = await supabase
        .from("stock_transfers")
        .insert({
          sku_id:         row.sku_id,
          lot_number:     lotNumber || null,
          to_user_id:     targetAdminId,
          unit:           "pack",
          quantity:       finalQty,
          quantity_packs: finalQty,
          note:           note || `Reconcile slot history #${historyId} → ถือไว้`,
          created_by:     createdBy,
        })
        .select("id").single()
      if (error) throw error
      movementRef = { stock_transfer_id: data.id, to_user_id: targetAdminId }
    }

    else if (disposition === "moved_to_machine") {
      if (!targetMachineId) throw new Error("moved_to_machine ต้องระบุ targetMachineId")
      const { data, error } = await supabase
        .from("stock_out")
        .insert({
          sku_id:         row.sku_id,
          machine_id:     targetMachineId,
          quantity_packs: finalQty,
          note:           note || `Reconcile slot history #${historyId} → ${targetMachineId}${targetSlotNumber ? " ช่อง " + targetSlotNumber : ""}`,
          created_by:     createdBy,
        })
        .select("id").single()
      if (error) throw error
      movementRef = { stock_out_id: data.id, target_machine_id: targetMachineId, target_slot_number: targetSlotNumber || null }
    }

    else if (disposition === "lost") {
      const { data, error } = await supabase
        .from("claims")
        .insert({
          machine_id:     row.machine_id,
          sku_id:         row.sku_id,
          quantity:       finalQty,
          refund_amount:  0,
          product_status: "damaged",
          reason:         "machine_loss_on_slot_change",
          note:           note || `Reconcile slot history #${historyId} → สูญหาย`,
          created_by:     createdBy,
        })
        .select("id").single()
      if (error) throw error
      movementRef = { claim_id: data.id }
    }
  }

  // 2. Update slot_products_history
  const { data: updated, error: eUpd } = await supabase
    .from("slot_products_history")
    .update({
      disposition,
      disposition_target: { ...movementRef, qty: finalQty, note: note || null },
      reconciled_at: new Date().toISOString(),
      reconciled_by: user?.id || null,
    })
    .eq("id", historyId)
    .select()
    .single()
  if (eUpd) throw eUpd

  return { history: updated, movement: movementRef, qty: finalQty }
}
