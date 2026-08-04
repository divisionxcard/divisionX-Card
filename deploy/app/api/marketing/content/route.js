// คิวคอนเทนต์การตลาด — โซน A ของหน้า /marketing
//
// GET   /api/marketing/content?status=pending   → รายการร่างรออนุมัติ
// PATCH /api/marketing/content                  → อนุมัติ / แก้ / ทิ้ง
// POST  /api/marketing/content                  → เพิ่มร่างเอง (คนเขียน)
//
// admin เท่านั้น · ใช้ service key ฝั่ง server (ห้ามให้ browser แตะตารางนี้ตรง ๆ)
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../../lib/apiAuth"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TABLE = "marketing_content"
const STATUSES = ["draft", "pending", "approved", "scheduled", "posted", "rejected"]
const PLATFORMS = ["fb", "line", "ig", "tiktok"]

export async function GET(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  // รับได้หลายสถานะคั่นด้วย comma เช่น "draft,pending" — กล่องอนุมัติใช้แบบนั้น
  // (draft = ร่างที่ตั้งต้นจากไอเดีย ยังไม่มีแคปชั่นจริง · pending = AI เขียนเสร็จแล้ว)
  const status = searchParams.get("status") || "pending"
  const wanted = status.split(",").map(s => s.trim()).filter(Boolean)
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200)

  const bad = status === "all" ? [] : wanted.filter(s => !STATUSES.includes(s))
  if (bad.length) {
    return NextResponse.json({ error: `status ไม่ถูกต้อง: ${bad.join(", ")}` }, { status: 400 })
  }

  try {
    // ดึงไอเดียต้นทางมาด้วย (embed) — การ์ดจะได้มีลิงก์ "ดูต้นทาง"
    // โดยไม่ต้องแปะ URL ยาว ๆ ไว้ในตัวแคปชั่น
    let q = db.from(TABLE)
      .select("*, idea:marketing_ideas!marketing_content_idea_id_fkey(id,url,source,source_label)")
      .order("created_at", { ascending: false }).limit(limit)
    if (status !== "all") q = wanted.length > 1 ? q.in("status", wanted) : q.eq("status", wanted[0])
    const { data, error } = await q
    if (error) throw error

    // นับคงค้างแต่ละสถานะ — เอาไปโชว์เป็นตัวเลขบนหัวข้อโซน
    const { data: all } = await db.from(TABLE).select("status")
    const counts = {}
    for (const r of all || []) counts[r.status] = (counts[r.status] || 0) + 1

    return NextResponse.json({ items: data || [], counts })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  const id = parseInt(body.id, 10)
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 })

  const patch = { }
  // อนุมัติ / ทิ้ง
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status ไม่ถูกต้อง: ${body.status}` }, { status: 400 })
    }
    patch.status = body.status
    if (body.status === "approved" || body.status === "scheduled") {
      patch.approved_by = gate.user.id
      patch.reject_reason = null
    }
    if (body.status === "posted") patch.posted_at = new Date().toISOString()
  }
  // แก้เนื้อหาก่อนอนุมัติ
  if (body.caption !== undefined) {
    if (typeof body.caption !== "string" || !body.caption.trim()) {
      return NextResponse.json({ error: "caption ว่างไม่ได้" }, { status: 400 })
    }
    patch.caption = body.caption.trim()
  }
  if (body.platform !== undefined) {
    if (!PLATFORMS.includes(body.platform)) {
      return NextResponse.json({ error: `platform ไม่ถูกต้อง: ${body.platform}` }, { status: 400 })
    }
    patch.platform = body.platform
  }
  if (body.scheduled_at !== undefined) patch.scheduled_at = body.scheduled_at || null
  if (body.slot !== undefined) patch.slot = body.slot || null
  // เหตุผลที่ทิ้ง — เก็บไว้ป้อนกลับ prompt รอบหน้า
  if (body.reject_reason !== undefined) patch.reject_reason = body.reject_reason || null

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 })
  }

  try {
    const { data, error } = await db.from(TABLE).update(patch).eq("id", id).select().maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: `ไม่พบรายการ id=${id}` }, { status: 404 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  if (typeof body.caption !== "string" || !body.caption.trim()) {
    return NextResponse.json({ error: "ต้องมี caption" }, { status: 400 })
  }
  const platform = body.platform || "fb"
  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: `platform ไม่ถูกต้อง: ${platform}` }, { status: 400 })
  }

  try {
    const { data, error } = await db.from(TABLE).insert({
      caption: body.caption.trim(),
      platform,
      status: body.status && STATUSES.includes(body.status) ? body.status : "pending",
      slot: body.slot || null,
      scheduled_at: body.scheduled_at || null,
      media_url: body.media_url || null,
      media_type: body.media_type || null,
      source_reason: body.source_reason || null,
      source_sku: body.source_sku || null,
      created_by: "human",
    }).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
