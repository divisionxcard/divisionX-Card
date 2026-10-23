// คลังไฟล์ของห้องตัดต่อ — วิดีโอ/รูป/เสียงที่อัปโหลดจากภายนอก (23 ต.ค. 2026)
//
//   GET  /api/video/assets            → { items: [{ path, url, name, kind, size, created_at, folder }] }
//   POST /api/video/assets { name, type, size }
//                                      → { path, token, url }  ลิงก์อัปโหลดแบบลงชื่อ (ใช้ครั้งเดียว)
//
// ⚠️ ไฟล์ไม่ผ่าน route นี้ — Vercel รับ body ได้แค่ 4.5 MB แต่คลิปมือถือหลักร้อย MB
//    route ออกลิงก์อัปโหลดให้ แล้วเบราว์เซอร์ส่งไฟล์ตรงเข้า Supabase Storage
//    (supabase.storage.from("marketing").uploadToSignedUrl(path, token, file))
// เจ้าของเลือก "เก็บทุกอย่างตลอด" — ไม่มีลบอัตโนมัติ · ไม่มีปุ่มลบในเวอร์ชันแรก
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireMarketing } from "../../../../lib/apiAuth"

export const dynamic = "force-dynamic"

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const BUCKET = "marketing"
const UPLOADS = "video-uploads"
// คลิป Google Flow ที่เจ้าของทำ (agents/video/broll_import.py) — โชว์ในคลังให้หยิบไปตัดต่อได้ด้วย
const FOLDERS = [UPLOADS, "video-broll"]
const MAX_BYTES = 1024 * 1024 * 1024           // 1 GB ต่อไฟล์ (เพดานของ Supabase อาจต่ำกว่านี้ — ตอบ error ให้เห็นเอง)

const KINDS = {
  video: ["mp4", "mov", "webm", "m4v"],
  image: ["jpg", "jpeg", "png", "webp"],
  audio: ["mp3", "wav", "m4a", "aac", "ogg"],
}
const extOf = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]{2,5})$/) || [])[1] || ""
const kindOf = (ext) => Object.keys(KINDS).find(k => KINDS[k].includes(ext)) || null

function publicUrl(path) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
}

export async function GET(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  const items = []
  for (const folder of FOLDERS) {
    const { data, error } = await db.storage.from(BUCKET)
      .list(folder, { limit: 500, sortBy: { column: "created_at", order: "desc" } })
    if (error) return NextResponse.json({ error: `อ่านคลัง ${folder} ไม่ได้: ${error.message}` }, { status: 500 })
    for (const f of data || []) {
      const kind = kindOf(extOf(f.name))
      if (!kind || !f.id) continue                 // โฟลเดอร์ย่อย / ไฟล์ชนิดอื่น
      const path = `${folder}/${f.name}`
      items.push({
        path, url: publicUrl(path), folder, kind,
        // ชื่อไฟล์จริงต่อท้ายหลังเลขสุ่ม (20261023-ab12cd-ชื่อเดิม.mp4) — โชว์ชื่อเดิมให้คนจำได้
        name: folder === UPLOADS ? f.name.replace(/^\d{8}-[a-z0-9]{6}-/, "") : f.name,
        size: f.metadata?.size || null, created_at: f.created_at,
      })
    }
  }
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return NextResponse.json({ items })
}

export async function POST(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const ext = extOf(name)
  const kind = kindOf(ext)
  if (!kind) {
    return NextResponse.json({ error: `ชนิดไฟล์ .${ext || "?"} ใช้ไม่ได้ — รับ ${Object.values(KINDS).flat().join(" ")}` }, { status: 400 })
  }
  const size = Number(body.size) || 0
  if (size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024 / 1024} GB` }, { status: 400 })
  }
  // ชื่อใน Storage: วันที่ + เลขสุ่ม + ชื่อเดิมที่ล้างแล้ว (ไทย/ช่องว่างกลายเป็น URL ที่ต้อง encode — เก็บแค่ a-z0-9)
  const d = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "")
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, "0")
  const base = name.slice(0, -(ext.length + 1)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || kind
  const path = `${UPLOADS}/${d}-${rand}-${base}.${ext}`
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) return NextResponse.json({ error: `ออกลิงก์อัปโหลดไม่ได้: ${error.message}` }, { status: 500 })
  return NextResponse.json({ path: data.path || path, token: data.token, url: publicUrl(path), kind })
}
