// สถานะงานเรนเดอร์วิดีโอ — GET /api/video/jobs
//
//   GET /api/video/jobs                                    → งานล่าสุด 50 ใบ ใหม่สุดอยู่บน
//   GET /api/video/jobs?id=6f0c...                         → งานใบเดียว (มี plan เต็มมาด้วย)
//   GET /api/video/jobs?status=queued,rendering&limit=20&project=op17-intro
//
// มีไว้ให้หน้าเว็บ poll ระหว่างรอ — คลิปหนึ่งใช้เวลาหลายนาที (TTS อย่างเดียว ~3-4 นาที)
// คนกดสั่งแล้วต้องเห็นว่าไปถึงไหน ไม่ใช่จอค้างเปล่า ๆ เหมือนตอนโปสเตอร์ยุคแรก
//
// requireUser ไม่ใช่ requireAdmin — คนสั่งต้องเป็น admin (ดู /api/video/render)
// แต่ "ดูสถานะ" ให้คนที่ล็อกอินแล้วดูได้ จะได้ไม่ต้องรบกวนแอดมินถามว่าเสร็จยัง
//
// ⚠️ ชื่อคอลัมน์และค่าสถานะยึดตาม backend/database/migrations/075_video_jobs.sql
//    id เป็น **uuid** ไม่ใช่เลขรัน · สถานะกลางคือ 'rendering' ไม่ใช่ 'running'
//    · ไม่มี started_at/finished_at มีแค่ created_at กับ updated_at (trigger เซ็ตให้)
//    ฉบับแรกของไฟล์นี้เดาไว้ผิดทั้งสามอย่าง ผลคือ select พัง 500 ทุกครั้งที่เรียก
//    และ ?id= ที่รับ uuid ไม่ได้ ทำให้หน้ารอผลไม่มีทางถามสถานะงานตัวเองได้เลย
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireUser } from "../../../../lib/apiAuth"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TABLE = "video_jobs"
const STATUSES = ["queued", "rendering", "done", "failed"]

// id เป็น uuid — ต้องคัดรูปแบบเองก่อนส่งให้ PostgREST
// ถ้าปล่อยค่ามั่ว ๆ ผ่านไป Postgres จะตอบ "invalid input syntax for type uuid"
// ซึ่งกลายเป็น 500 ของเรา ทั้งที่ความจริงคือคนเรียกส่ง id ผิดรูปแบบ (400)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// คอลัมน์สำหรับ "รายการ" — จงใจไม่ดึง plan มาด้วย
// plan เป็น JSONB ที่มีสคริปต์เต็ม ๆ ดึง 50 ใบพร้อมกันคือ payload บวมโดยไม่มีใครใช้
// (หน้ารายการโชว์แค่ชื่อ project กับสถานะ) · อยากได้ plan ให้ถามเป็นใบ ๆ ด้วย ?id=
const LIST_COLS =
  "id, project, status, content_id, video_url, duration_seconds, error, " +
  "created_at, updated_at"

export async function GET(req) {
  const gate = await requireUser(req)
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)

  try {
    // ── ใบเดียว ── ตัวที่หน้าเว็บเรียกซ้ำ ๆ ตอนรอผล
    const idParam = (searchParams.get("id") || "").trim()
    if (searchParams.get("id") !== null) {
      if (!UUID_RE.test(idParam)) {
        return NextResponse.json({ error: "id ต้องเป็น uuid" }, { status: 400 })
      }
      const { data, error } = await db.from(TABLE)
        .select(`${LIST_COLS}, plan`)
        .eq("id", idParam)
        .maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: `ไม่พบงาน id=${idParam}` }, { status: 404 })
      return NextResponse.json(data)
    }

    // ── รายการ ──
    // เพดาน 100: PostgREST คืนได้สูงสุด 1000 แถวแล้วตัดเงียบ ๆ โดยไม่ฟ้อง
    // หน้านี้เป็นแค่กล่องงานล่าสุด ไม่ใช่รายงานย้อนหลัง — ถ้าวันไหนต้องอ่านทั้งตาราง
    // ต้องไปใช้ fetchAll (deploy/lib/fetchAll.js) ไม่ใช่ดัน limit ให้สูงขึ้น
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 100)

    const statusParam = searchParams.get("status")
    let wanted = []
    if (statusParam && statusParam !== "all") {
      wanted = statusParam.split(",").map(s => s.trim()).filter(Boolean)
      const bad = wanted.filter(s => !STATUSES.includes(s))
      if (bad.length) {
        return NextResponse.json({ error: `status ไม่ถูกต้อง: ${bad.join(", ")}` }, { status: 400 })
      }
    }

    // ⚠️ ลำดับ chain ต้องเป็น from().select() ก่อนเสมอ แล้วค่อย eq/in/order
    //    สลับเป็น from().eq().select() คือ TypeError ทันที (เจอมาแล้ว)
    //
    // เรียงตาม created_at แล้วต่อท้ายด้วย id — id เป็น uuid v4 ซึ่งสุ่มล้วน เรียงเดี่ยว ๆ
    // ไม่ได้แปลว่าใหม่/เก่า · ที่ต้องมี id ต่อท้ายเพราะสองใบที่สั่งติดกันมี created_at
    // เท่ากันได้ ถ้าไม่มีตัวตัดสินลำดับจะสลับไปมาเองทุกรอบ poll (หน้าเว็บกระพริบ
    // โดยไม่มีอะไรเปลี่ยนจริง) · uuid เป็นตัวตัดสินที่ "มั่ว แต่คงที่" ซึ่งพอสำหรับงานนี้
    let q = db.from(TABLE).select(LIST_COLS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit)
    if (wanted.length) q = wanted.length > 1 ? q.in("status", wanted) : q.eq("status", wanted[0])
    const project = (searchParams.get("project") || "").trim()
    if (project) q = q.eq("project", project)

    const { data, error } = await q
    if (error) throw error

    // ไม่นับยอดรวมแต่ละสถานะให้ที่นี่ — route นี้ถูก poll ซ้ำทุกไม่กี่วินาที
    // query ที่สองต่อรอบคือค่าใช้จ่ายที่จ่ายทิ้งเปล่า ๆ · ฝั่งหน้าเว็บนับจาก items เอาเองได้
    return NextResponse.json({ items: data || [] })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
