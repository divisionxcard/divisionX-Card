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
import { checkPage, publishToPage, permalink, fbConfig } from "../../../../../lib/facebook"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TABLE = "marketing_content"
// ช่องว่างที่ AI ทิ้งไว้ให้คนเติม เช่น {ชื่อสาขา} — regex เดียวกับ holesIn() ในหน้าเว็บ
const HOLE = /\{[^}]{1,40}\}/g

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

  // ── ด่านกันพลาด — เรียงจากที่ย้อนกลับไม่ได้ไปหาที่ย้อนได้ ──

  // 1) เคยโพสต์แล้ว · Facebook ไม่กันโพสต์ซ้ำให้ ยิงสองครั้งได้สองโพสต์
  //    เช็กจาก post_id ไม่ใช่ status เพราะ status แก้ด้วยมือได้จากหน้าเว็บ
  if (item.post_id) {
    return NextResponse.json({
      error: "ชิ้นนี้โพสต์ขึ้นเพจไปแล้ว", post_id: item.post_id, post_url: item.post_url,
    }, { status: 409 })
  }

  // 2) ต้องผ่านการอนุมัติก่อน — ปุ่มโพสต์อยู่ในโซน "รอโพสต์" อยู่แล้ว
  //    แต่ route ต้องกันเองด้วย เผื่อมีคนยิง API ตรง
  if (!["approved", "scheduled"].includes(item.status)) {
    return NextResponse.json({
      error: `ต้องอนุมัติก่อนถึงจะโพสต์ได้ (ตอนนี้สถานะ "${item.status}")`,
    }, { status: 409 })
  }

  // 3) ยังมีช่องว่างค้าง — โพสต์ออกไปแล้วลบไม่ได้ ต้องกันตั้งแต่ตรงนี้
  const holes = (item.caption || "").match(HOLE) || []
  if (holes.length) {
    return NextResponse.json({
      error: `ยังมีช่องว่างที่ต้องเติมก่อนโพสต์: ${holes.join(", ")}`,
    }, { status: 400 })
  }

  // ── โพสต์จริง ──
  let result
  try {
    result = await publishToPage({
      caption: item.caption,
      imageUrl: item.media_url || null,
      publish: !dryRun,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message, fbCode: err.fbCode }, { status: err.status || 502 })
  }

  // โหมดทดสอบ — อัปรูปขึ้นแต่ไม่ขึ้นเพจ ไม่แตะ DB
  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, photoId: result.photoId,
      note: "อัปรูปขึ้น Facebook แล้วแต่ไม่ได้เผยแพร่ · จะหายเองใน ~24 ชม. · DB ไม่ถูกแก้",
    })
  }

  const post_id = result.postId || result.photoId
  const post_url = await permalink(post_id)

  const { data, error } = await db.from(TABLE).update({
    status: "posted",
    posted_at: new Date().toISOString(),
    post_id,
    post_url,
  }).eq("id", id).select().maybeSingle()

  // ⚠️ โพสต์ขึ้นเพจไปแล้ว แต่บันทึกลง DB ไม่สำเร็จ — ห้ามคืนแค่ error เปล่า ๆ
  // ไม่งั้นคนจะกดซ้ำแล้วได้โพสต์ซ้ำบนเพจจริง · ต้องส่ง post_id กลับไปให้เห็น
  if (error) {
    return NextResponse.json({
      error: `โพสต์ขึ้นเพจสำเร็จแล้ว แต่บันทึกลงฐานข้อมูลไม่สำเร็จ — อย่ากดโพสต์ซ้ำ (${error.message})`,
      post_id, post_url, needsManualFix: true,
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item: data, post_id, post_url })
}
