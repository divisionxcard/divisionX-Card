// โพสต์คอนเทนต์ขึ้นเพจ Facebook จริง — POST /api/marketing/content/publish { id }
//
// ปิดวงจรสุดท้ายของหน้า /marketing · เดิมต้อง "ก๊อปแคปชั่น → เปิดเพจ → วาง → โพสต์ →
// กลับมากดโพสต์แล้ว" 5 ขั้นด้วยมือ ผลคือคอนเทนต์ 19 ชิ้นได้โพสต์จริงแค่ 1 ชิ้น
// คอขวดอยู่ที่ขั้นตอนคนทำ ไม่ใช่ที่ตัวคอนเทนต์
//
// GET  → เช็กว่าต่อเพจไหนอยู่ ใช้ได้ไหม (ให้หน้าเว็บโชว์สถานะก่อนกดโพสต์)
// POST → โพสต์จริง · { id, dryRun? }
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../../../lib/apiAuth"
import { checkPage, fbConfig } from "../../../../../lib/facebook"
import { publishOne } from "../../../../../lib/publishContent"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TABLE = "marketing_content"

export async function GET(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error
  const cfg = fbConfig()
  if (!cfg.ready) {
    return NextResponse.json({
      connected: false,
      error: "ยังไม่ได้ตั้งค่า Facebook",
      need: [!cfg.pageId && "FB_PAGE_ID", !cfg.token && "FB_PAGE_ACCESS_TOKEN"].filter(Boolean),
      how: "ดูขั้นตอนที่ wiki/marketing/auto-posting-level3-setup.md",
    })
  }
  try {
    return NextResponse.json({ connected: true, page: await checkPage() })
  } catch (err) {
    return NextResponse.json({ connected: false, error: err.message }, { status: err.status || 502 })
  }
}

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const id = parseInt(body.id, 10)
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 })
  const dryRun = body.dryRun === true

  const { data: item, error: readErr } = await db.from(TABLE).select("*").eq("id", id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!item) return NextResponse.json({ error: `ไม่พบรายการ id=${id}` }, { status: 404 })

  // ด่านกันพลาดทั้งชุด + การโพสต์ + บันทึก DB อยู่ใน lib/publishContent.js
  // ใช้ตัวเดียวกับตัวตั้งเวลาโพสต์ เพื่อให้ด่านเหมือนกันเป๊ะทั้งสองทาง
  //
  // ไม่ส่ง requireSchedule — ทางนี้คนกดเองและเห็นป้ายผลตรวจบนหน้าจอแล้ว
  // ถ้าเขายังยืนยันทั้งที่ผู้ตรวจค้าน นั่นคือการตัดสินใจของเขา ระบบไม่ขวาง
  const result = await publishOne(db, item, { dryRun })
  if (result.error) {
    const { status, ...rest } = result
    return NextResponse.json(rest, { status: status || 500 })
  }
  return NextResponse.json(result)
}
