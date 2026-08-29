// ตัวตั้งเวลาโพสต์ — POST /api/marketing/content/publish-due
//
// โพสต์คอนเทนต์ที่ "เจ้าของอนุมัติแล้ว + ถึงเวลาที่วางไว้ในปฏิทิน" ขึ้นเพจให้เอง
// ถูกยิงจาก GitHub Actions ทุก 15 นาที (.github/workflows/marketing-autopost.yml)
//
// ทำไมไม่ให้ Hermes ยิงจากเครื่องเจ้าของ: โพสต์ต้องขึ้นตามเวลาที่วางไว้แม้คอมปิด
// GitHub Actions รันบนคลาวด์ จึงไม่ผูกกับว่าเครื่องใครเปิดอยู่
//
// ⚠️ ปิดอยู่โดยปริยาย — ถ้าไม่ได้ตั้ง AUTOPOST_SECRET จะคืน 503 ไม่โพสต์อะไรเลย
// (ตั้ง env บน Vercel + GitHub secret ชื่อเดียวกัน = เปิดใช้งาน)
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { fbConfig } from "../../../../../lib/facebook"
import { publishOne, PUBLISHABLE, PLATFORM_LABEL } from "../../../../../lib/publishContent"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TABLE = "marketing_content"

// โพสต์ได้ไม่เกินกี่ชิ้นต่อรอบ — จำกัดความเสียหายถ้าวันหนึ่งตั้งเวลาผิดยกล็อต
// ต่อรอบ 15 นาที = เพดาน 8 โพสต์/ชม. ซึ่งมากกว่าที่เพจเราต้องใช้จริงหลายเท่า
const MAX_PER_RUN = 2

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 })
}

export async function POST(req) {
  const secret = process.env.AUTOPOST_SECRET
  if (!secret) {
    return NextResponse.json({
      error: "ยังไม่ได้เปิดใช้โพสต์อัตโนมัติ (ไม่มี AUTOPOST_SECRET)",
      how: "ตั้ง env AUTOPOST_SECRET บน Vercel และ GitHub secret ชื่อเดียวกัน",
    }, { status: 503 })
  }
  const h = req.headers.get("authorization") || ""
  const given = h.startsWith("Bearer ") ? h.slice(7).trim() : ""
  // เทียบความยาวก่อน แล้วค่อยเทียบค่า — กันเผลอเทียบ token เปล่ากับ secret เปล่า
  if (!given || given.length !== secret.length || given !== secret) return unauthorized()

  const cfg = fbConfig()
  if (!cfg.ready) {
    return NextResponse.json({
      error: "ยังไม่ได้ตั้งค่า Facebook",
      need: [!cfg.pageId && "FB_PAGE_ID", !cfg.token && "FB_PAGE_ACCESS_TOKEN"].filter(Boolean),
    }, { status: 503 })
  }

  let dryRun = false
  try { dryRun = (await req.json())?.dryRun === true } catch { /* ไม่มี body ก็ได้ */ }

  // ถึงคิวแล้ว = อนุมัติแล้ว + มีเวลาที่ตั้งไว้ + เวลานั้นมาถึงแล้ว + ยังไม่เคยขึ้นเพจ
  // เรียงเก่าก่อน เพื่อให้ของที่เลยกำหนดนานสุดได้ออกก่อน
  const nowIso = new Date().toISOString()
  const dueQuery = () => db.from(TABLE)
    .select("*")
    .in("status", ["approved", "scheduled"])
    .is("post_id", null)
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)

  // ⚠️ ต้องกรอง platform ตั้งแต่ใน query ไม่ใช่ปล่อยให้ blockReason ตีกลับทีหลัง
  //    เพราะรอบหนึ่งหยิบได้แค่ MAX_PER_RUN ชิ้น — ถ้ามีชิ้นที่ส่งไม่ได้ค้างคิวอยู่
  //    มันจะกินโควตาทั้งสองช่องทุกรอบ แล้วของที่โพสต์ได้จริงจะไม่มีวันได้ออก
  //    (blockReason ยังกันซ้ำอีกชั้นในโมดูลกลาง สำหรับทางที่คนกดเอง)
  const { data: due, error } = await dueQuery()
    .in("platform", [...PUBLISHABLE])
    .order("scheduled_at", { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ชิ้นที่ถึงเวลาแล้วแต่ปลายทางยังต่อไม่ได้ — ไม่ใช่ความล้มเหลว แต่ต้องเห็น
  // ไม่งั้นเจ้าของจะรอโพสต์ที่ไม่มีวันออก โดยไม่มีอะไรบอกสักอย่าง
  const { data: stuck } = await dueQuery().not("platform", "in", `(${[...PUBLISHABLE].join(",")})`)
  const waiting = (stuck || []).map(r => ({
    id: r.id,
    platform: r.platform,
    platform_label: PLATFORM_LABEL[r.platform] || r.platform,
    scheduled_at: r.scheduled_at,
  }))

  // ⚠ ต้องคืน "รูปเดียวกัน" กับตอนมีของถึงคิว — ครบทุก field รวมทั้ง failed
  // เคยพลาดมาแล้ว: ทางนี้เคยคืนแค่ posted แล้ว workflow ที่มองหา "failed":0
  // หาไม่เจอ จึงเตือนว่ามีชิ้นโพสต์ไม่สำเร็จทั้งที่ไม่มีอะไรล้มเลย
  // คำตอบที่รูปไม่คงที่ = คนอ่านผลผิด ต่อให้ตัวเลขทุกตัวถูก
  if (!due?.length) {
    return NextResponse.json({
      ok: true, checked_at: nowIso, dryRun, due: 0, posted: 0, failed: 0, results: [],
      waiting_unsupported: waiting.length, waiting,
    })
  }

  const results = []
  for (const item of due) {
    // ยิงทีละชิ้นและไม่หยุดทั้งรอบเมื่อชิ้นใดล้ม — ชิ้นที่เหลือไม่ควรตกคิวเพราะเพื่อนพัง
    const r = await publishOne(db, item, { dryRun, requireSchedule: true })
    results.push({
      id: item.id,
      scheduled_at: item.scheduled_at,
      ok: !!r.ok,
      post_url: r.post_url || null,
      error: r.error || null,
      needsManualFix: r.needsManualFix || false,
    })
  }

  const posted = results.filter(r => r.ok).length
  return NextResponse.json({
    ok: true, checked_at: nowIso, dryRun,
    due: due.length, posted, failed: results.length - posted,
    // ⚠️ ต้องมีทุกคำตอบ ไม่ใช่เฉพาะตอนมีของค้าง — คำตอบที่รูปไม่คงที่ทำให้คนอ่านผิด
    waiting_unsupported: waiting.length, waiting,
    results,
  })
}
