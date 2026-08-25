// สั่งสร้างโปสเตอร์ — POST /api/marketing/content/poster { id, sku? }
//
// ทำไมต้องยิงไป GitHub Actions แทนที่จะสร้างตรงนี้:
//   ตัวอักษรไทยต้องใช้ text shaping ของเบราว์เซอร์จริง (Chromium) ซึ่ง Vercel
//   ไม่มีให้ · next/og (Satori) ที่ใช้ได้บน Vercel ทิ้งวรรณยุกต์เมื่อซ้อนบนสระบน
//   "ที่" กลายเป็น "ที" — ทดสอบยืนยันแล้ว ใช้ไม่ได้จริง
//
// เป็นงาน async — route นี้แค่สั่งแล้วจบ ภาพจะโผล่ใน media_url เมื่อ workflow เสร็จ (ราว 1-2 นาที)
// หน้าเว็บมีตัวคอยเช็กผลให้เอง (pollPoster ใน MarketingOS) — คนไม่ต้องกดรีเฟรช
// ระหว่างรอจะเห็นอนิเมชั่นโหลด + ตัวเลขวินาทีเดินขึ้นในช่องรูป แล้วรูปโผล่เองเมื่อเสร็จ
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdmin } from "../../../../../lib/apiAuth"
import { detectFranchise } from "../../../../../lib/franchiseDetect"
import { topSkusByFranchise } from "../../../../../lib/skuPicker"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const REPO = process.env.GH_REPO || "divisionxcard/divisionX-Card"
const WORKFLOW = "poster-render.yml"

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  const token = process.env.GH_PAT
  if (!token) {
    return NextResponse.json({
      error: "ยังไม่ได้ตั้ง GH_PAT",
      hint: "ต้องมีเพื่อสั่ง GitHub Actions — ตัวเดียวกับที่ปุ่ม sync สต็อกใช้",
    }, { status: 503 })
  }

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const id = parseInt(body.id, 10)
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 })

  // ── หา SKU ที่จะเอารูปไปแปะ ──
  //
  // ⚠️ ไอเดียที่มาจากข่าวไม่มี source_sku (ยืนยันแล้ว #35 #36 #37 เป็น null)
  //    เดิมเทมเพลตจึงไม่รู้ว่าจะแปะรูปอะไร ตกไปใช้รูปตู้ ไม่มีซองในภาพเลย
  //    ตอนนี้เดาค่ายจากแคปชั่นแล้วหยิบซองขายดีของค่ายนั้น — ได้รูปจริงเป๊ะ 100%
  //
  //    ทำที่นี่ไม่ใช่ใน poster_render.py เพราะตัวเดาค่ายเป็น JS อยู่แล้ว
  //    ถ้าไปเขียนซ้ำฝั่ง Python จะกลายเป็นสองสำเนาที่แก้ไม่พร้อมกัน
  let sku = body.sku ? String(body.sku) : null
  if (!sku) {
    try {
      const { data: c } = await db.from("marketing_content")
        .select("caption,source_sku,source_reason,idea:marketing_ideas!marketing_content_idea_id_fkey(title)")
        .eq("id", id).maybeSingle()
      sku = c?.source_sku || null
      if (!sku) {
        const fr = detectFranchise(c?.caption, c?.idea?.title, c?.source_reason)
        if (fr) {
          const [pick] = await topSkusByFranchise(db, { franchise: fr, limit: 1 })
          // ยอมใช้เฉพาะที่ตรงค่ายจริง — ถ้าค่ายนั้นไม่มีรูป ปล่อยว่างดีกว่าแปะผิดค่าย
          if (pick?.franchise === fr) sku = pick.sku_id
        }
      }
    } catch { /* อ่านไม่ได้ก็ปล่อยว่าง workflow จะใช้รูปตู้แทน */ }
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            content_id: String(id),
            ...(sku ? { sku } : {}),
          },
        }),
      }
    )

    if (res.status === 204) {
      return NextResponse.json({
        success: true,
        // ⚠️ ห้ามบอกให้ "กดรีเฟรช" — หน้าเว็บมีตัวคอยเช็กผลให้เองแล้ว (ดู pollPoster ใน MarketingOS)
        // ข้อความเดิมเขียนไว้ตั้งแต่ยังไม่มีตัวคอยเช็ก แล้วลืมแก้ตอนเพิ่มเข้าไป
        // ผลคือคนอ่านแล้วนั่งกดรีเฟรชเอง ทั้งที่ระบบทำให้อยู่ — และไม่รู้ว่าต้องกดตอนไหน
        message: "สั่งสร้างโปสเตอร์แล้ว — รูปจะขึ้นเองเมื่อเสร็จ (ราว 1-2 นาที) ไม่ต้องกดอะไร",
      })
    }

    const detail = await res.text().catch(() => "")
    // 404 ที่นี่มักแปลว่า workflow ยังไม่ถูก merge เข้า main (GitHub หา file ไม่เจอ)
    // ไม่ใช่เรื่องสิทธิ์ — บอกให้ชัดจะได้ไม่ไปไล่หา token ผิดที่
    if (res.status === 404) {
      return NextResponse.json({
        error: "GitHub หา workflow ไม่เจอ",
        hint: `ต้อง push ${WORKFLOW} ขึ้น main ก่อน แล้ว GitHub ถึงจะรู้จัก`,
      }, { status: 404 })
    }
    return NextResponse.json({ error: `GitHub ตอบ ${res.status}`, detail: detail.slice(0, 250) },
                             { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
