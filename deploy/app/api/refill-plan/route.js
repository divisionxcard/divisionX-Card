// บันทึก "ใบจัดของสั่งไปเท่าไหร่" ตอนกดพิมพ์ (migration 073)
//
// POST /api/refill-plan  { source, stock_synced_at, lines: [{machine_id, sku_id, product_name, is_box, planned_qty, remain, capacity}] }
//
// ทำไมต้องเก็บ: ระบบบันทึกแค่ "เติมเข้าจริงเท่าไหร่" (slot_refill_events)
// แต่ไม่เคยเก็บว่า "ใบสั่งไปเท่าไหร่" → SKU ที่สั่งแล้วเติมไม่ได้เลยจะไม่มีแถวสักแถว
// ของที่ขนกลับจึงหายไปจากข้อมูลทั้งก้อน หาสาเหตุย้อนหลังไม่ได้
//
// ⚠️ เส้นนี้ห้ามทำให้การพิมพ์ล้ม — ฝั่งหน้าเว็บเรียกแบบ fire-and-forget
//    ถ้าบันทึกไม่ได้ก็แค่ไม่มีข้อมูลไว้เทียบ ไม่ใช่เหตุให้แอดมินพิมพ์ใบไม่ได้
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { requireUser } from "../../../lib/apiAuth"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SOURCES = ["stock_report", "refill_prep"]

export async function POST(req) {
  // คนเติมของไม่ใช่ admin ทุกคน — แค่ต้อง login (ไม่งั้นคนที่ใช้ใบจริงจะบันทึกไม่ได้)
  const gate = await requireUser(req)
  if (gate.error) return gate.error

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body ไม่ใช่ JSON" }, { status: 400 })
  }

  const source = SOURCES.includes(body?.source) ? body.source : "stock_report"
  const lines = Array.isArray(body?.lines) ? body.lines : []
  // ใบที่ไม่มีรายการอะไรเลย ไม่ต้องเก็บ (กดพิมพ์ตอนตู้เต็มหมด)
  const rows = lines
    .filter(l => l && l.machine_id && Number(l.planned_qty) > 0)
    .map(l => ({
      plan_id: body.plan_id || crypto.randomUUID(),
      planned_by: gate.user.id,
      planned_by_name: gate.profile?.username || null,
      source,
      machine_id: String(l.machine_id),
      sku_id: l.sku_id || null,
      product_name: l.product_name || null,
      is_box: !!l.is_box,
      planned_qty: Math.round(Number(l.planned_qty)),
      remain_at_plan: Number.isFinite(Number(l.remain)) ? Math.round(Number(l.remain)) : null,
      capacity_at_plan: Number.isFinite(Number(l.capacity)) ? Math.round(Number(l.capacity)) : null,
      stock_synced_at: body.stock_synced_at || null,
    }))

  if (rows.length === 0) return NextResponse.json({ saved: 0 })

  // ทุกแถวของใบเดียวกันต้องใช้ plan_id เดียว — crypto.randomUUID() ใน map จะได้คนละตัว
  const planId = rows[0].plan_id
  rows.forEach(r => { r.plan_id = planId })

  const { error } = await db.from("refill_plans").insert(rows)
  if (error) {
    // ยังไม่ได้รัน migration 073 → บอกให้ชัด แต่ไม่ทำให้ฝั่งหน้าเว็บพัง
    const hint = /refill_plans/.test(error.message || "")
      ? " — ยังไม่ได้รัน migration 073_refill_plans.sql"
      : ""
    return NextResponse.json({ error: (error.message || "insert failed") + hint }, { status: 500 })
  }
  return NextResponse.json({ saved: rows.length, plan_id: planId })
}
