// สั่งสร้างโปสเตอร์ — POST /api/marketing/content/poster { id, sku? }
//
// ทำไมต้องยิงไป GitHub Actions แทนที่จะสร้างตรงนี้:
//   ตัวอักษรไทยต้องใช้ text shaping ของเบราว์เซอร์จริง (Chromium) ซึ่ง Vercel
//   ไม่มีให้ · next/og (Satori) ที่ใช้ได้บน Vercel ทิ้งวรรณยุกต์เมื่อซ้อนบนสระบน
//   "ที่" กลายเป็น "ที" — ทดสอบยืนยันแล้ว ใช้ไม่ได้จริง
//
// เป็นงาน async — route นี้แค่สั่งแล้วจบ ภาพจะโผล่ใน media_url เมื่อ workflow เสร็จ
// (ราว 1-2 นาที) หน้าเว็บต้องกดรีเฟรชเอง เหมือนปุ่ม sync สต็อก
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../../../lib/apiAuth"

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
            ...(body.sku ? { sku: String(body.sku) } : {}),
          },
        }),
      }
    )

    if (res.status === 204) {
      return NextResponse.json({
        success: true,
        message: "สั่งสร้างโปสเตอร์แล้ว — ใช้เวลาราว 1-2 นาที แล้วกดรีเฟรช",
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
