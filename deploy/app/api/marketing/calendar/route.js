// ปฏิทินโพสต์ — GET /api/marketing/calendar?month=YYYY-MM
//
// คืนคอนเทนต์ที่ "มีวัน" ในเดือนนั้น จัดกลุ่มตามวันไว้ให้เลย + รายการที่ยังไม่ได้กำหนดวัน
//
// การตัดวันตามเวลาไทยอยู่ใน lib/thaiDate.js — ต้องใช้ตัวเดียวกับหน้าปฏิทินเป๊ะ ๆ
// ไม่งั้น API จัดโพสต์ไว้วันนึง หน้าเว็บวาดอีกวันนึง (ดูเหตุผลเต็ม ๆ ในไฟล์นั้น)
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../../lib/apiAuth"
import { thaiDay, thaiMonthNow, monthRange } from "../../../../lib/thaiDate"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TABLE = "marketing_content"

const FIELDS = "id,status,platform,slot,caption,media_url,post_url,post_id,source_sku," +
               "scheduled_at,posted_at,created_at,review_verdict,review_notes"

// ชิ้นนี้จะถูกโพสต์เองเมื่อถึงเวลาไหม — เงื่อนไขต้องตรงกับที่ publish-due ใช้เลือกของจริง
// ถ้าสองที่ไม่ตรงกัน ปฏิทินจะโชว์ว่า "จะโพสต์เอง" แต่ถึงเวลาแล้วเงียบ (หรือกลับกัน ซึ่งแย่กว่า)
// ดูด่านตัวจริงที่ lib/publishContent.js → blockReason()
function autoPostState(r) {
  if (r.posted_at || r.post_id) return { auto: false, why: null }
  if (!r.scheduled_at) return { auto: false, why: "ยังไม่ได้กำหนดเวลา" }
  if (!["approved", "scheduled"].includes(r.status)) {
    return { auto: false, why: "ยังไม่ได้อนุมัติ — ระบบจะไม่โพสต์จนกว่าจะกดอนุมัติ" }
  }
  if (r.review_verdict === "drop") {
    return { auto: false, why: "ผู้ตรวจระบุว่าไม่ควรใช้ชิ้นนี้ — ตัวตั้งเวลาจะข้ามไป" }
  }
  const holes = (r.caption || "").match(/\{[^}]{1,40}\}/g)
  if (holes) return { auto: false, why: `ยังมีช่องว่างค้าง: ${holes.join(", ")}` }
  return { auto: true, why: null }
}

export async function GET(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month") || thaiMonthNow()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: `month ต้องเป็นรูปแบบ YYYY-MM (ได้มา: ${month})` }, { status: 400 })
  }
  const { from, to } = monthRange(month)

  try {
    // ⚠️ select() ต้องมาก่อน filter เสมอ — from() คืน builder ที่ยังไม่มี .or/.eq/.in
    // (เคยพลาดตรงนี้มาแล้วจนหน้าเว็บพัง "p.from(...).in is not a function")
    const inMonth = `and(posted_at.gte.${from},posted_at.lt.${to}),` +
                    `and(scheduled_at.gte.${from},scheduled_at.lt.${to})`
    const { data, error } = await db.from(TABLE).select(FIELDS)
      .or(inMonth)
      .order("posted_at", { ascending: true, nullsFirst: false })
    if (error) throw error

    const days = {}
    for (const r of data || []) {
      // โพสต์ไปแล้วให้ยึดวันที่โพสต์จริงเป็นหลัก — วันที่จองไว้อาจไม่ใช่วันที่โพสต์จริง
      const posted = Boolean(r.posted_at)
      const key = thaiDay(posted ? r.posted_at : r.scheduled_at)
      if (!key || !key.startsWith(month)) continue
      const { auto, why } = autoPostState(r)
      ;(days[key] ||= []).push({
        ...r,
        kind: posted ? "posted" : (auto ? "auto" : "scheduled"),
        no_auto_reason: why,          // โชว์ในแผงรายละเอียด เมื่อจองวันไว้แต่จะไม่ยิงเอง
      })
    }

    // ของที่รอคิวอยู่แต่ยังไม่ได้ปักวัน — เอาไปโชว์ข้างปฏิทินให้ลากมาลงวันได้
    const { data: loose, error: e2 } = await db.from(TABLE).select(FIELDS)
      .in("status", ["approved", "pending"])
      .is("scheduled_at", null)
      .is("posted_at", null)
      .order("created_at", { ascending: false })
      .limit(50)
    if (e2) throw e2

    return NextResponse.json({
      month,
      days,
      unscheduled: loose || [],
      counts: {
        posted: Object.values(days).flat().filter(x => x.kind === "posted").length,
        auto: Object.values(days).flat().filter(x => x.kind === "auto").length,
        scheduled: Object.values(days).flat().filter(x => x.kind === "scheduled").length,
        unscheduled: (loose || []).length,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
