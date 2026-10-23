// /media/<key> — ลิงก์ถาวรของไฟล์ใน Cloudflare R2 (bucket ส่วนตัว) · 23 ต.ค. 2026
// ตอบ 302 ไปลิงก์ลงชื่อที่ยังไม่หมดอายุ (12 ชม.) · CDN ของ Vercel เก็บคำตอบไว้ 1 ชม. → ฟังก์ชันไม่ต้องรันทุกครั้งที่มีคนเปิดรูป
// ตัวไฟล์ไม่ผ่าน Vercel (ไม่กินแบนด์วิดท์ของเรา) · ร่างงานตัดต่อ/ไฟล์ทดสอบไม่เปิดทางนี้ (PRIVATE_PREFIXES)
// ⚠️ ลิงก์ที่ส่งให้ Facebook/IG ดึงเอง ใช้ directUrl() ใน lib/r2.js แทน (ไม่ต้องพึ่งการตาม redirect ของเขา)
import { NextResponse } from "next/server"
import { presign, validKey, PRIVATE_PREFIXES, r2Configured } from "../../../lib/r2"

export const dynamic = "force-dynamic"

export async function GET(_req, { params }) {
  let key = ""
  try { key = (params.key || []).map(s => decodeURIComponent(s)).join("/") } catch { key = "" }
  if (!validKey(key) || PRIVATE_PREFIXES.some(p => key.startsWith(p))) {
    return new NextResponse("not found", { status: 404 })
  }
  if (!r2Configured()) return new NextResponse("storage not configured", { status: 503 })
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: presign("GET", key, { expires: 12 * 3600 }),
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}
