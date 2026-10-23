// คลังไฟล์ของห้องตัดต่อ — วิดีโอ/รูป/เสียงที่อัปโหลดจากภายนอก (23 ต.ค. 2026)
//
//   GET  /api/video/assets            → { items: [{ path, url, name, kind, size, created_at, folder }] }
//   POST /api/video/assets { name, type, size }
//                                      → { path, upload_url, url, kind, content_type }  ลิงก์อัปโหลดแบบลงชื่อ (อายุ 1 ชม.)
//
// ไฟล์อยู่ Cloudflare R2 (lib/r2.js) — ไม่ใช่ Supabase Storage แล้ว (เปลี่ยนคืนเดียวกับวันที่ทำห้องนี้):
//   Supabase แพ็กเกจฟรีรับไฟล์ละ ≤ 50 MB และโควตาดาวน์โหลด 5 GB/เดือนใช้ร่วมกับฐานข้อมูล
//   คลิปที่เปิดพรีวิว/เรนเดอร์ซ้ำ ๆ กินโควตาจนโปรเจกต์โดนจำกัด → ซิงค์รายวันตาย · R2 ดาวน์โหลดฟรีไม่จำกัด
//
// ⚠️ ไฟล์ไม่ผ่าน route นี้ — Vercel รับ body ได้แค่ 4.5 MB · route ออกลิงก์ลงชื่อ แล้วเบราว์เซอร์ PUT ตรงเข้า R2
//    (bucket ต้องตั้ง CORS ให้โดเมนเว็บ + localhost:3000 — ตั้งในหน้า Cloudflare แล้ว)
// เจ้าของเลือก "เก็บทุกอย่างตลอด" — ไม่มีลบอัตโนมัติ · ไม่มีปุ่มลบในเวอร์ชันแรก
import { NextResponse } from "next/server"
import { requireMarketing } from "../../../../lib/apiAuth"
import { listObjects, mediaUrl, presign } from "../../../../lib/r2"

export const dynamic = "force-dynamic"

const UPLOADS = "video-uploads"
// คลิป Google Flow ที่เจ้าของทำ (agents/video/broll_import.py) — โชว์ในคลังให้หยิบไปตัดต่อได้ด้วย
const FOLDERS = [UPLOADS, "video-broll"]
const MAX_BYTES = 2 * 1024 * 1024 * 1024        // 2 GB ต่อไฟล์ (R2 รับ PUT ครั้งเดียวได้ถึง 5 GB) · คลิปใหญ่หน้าเว็บย่อเป็น 1080p ก่อน

const KINDS = {
  video: ["mp4", "mov", "webm", "m4v"],
  image: ["jpg", "jpeg", "png", "webp"],
  audio: ["mp3", "wav", "m4a", "aac", "ogg"],
}
const MIME = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/mp4", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg" }
const extOf = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]{2,5})$/) || [])[1] || ""
const kindOf = (ext) => Object.keys(KINDS).find(k => KINDS[k].includes(ext)) || null

export async function GET(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  try {
    const items = []
    for (const folder of FOLDERS) {
      for (const f of await listObjects(`${folder}/`, 2000)) {
        const name = f.key.slice(folder.length + 1)
        const kind = kindOf(extOf(name))
        if (!kind || name.includes("/")) continue
        items.push({
          path: f.key, url: mediaUrl(f.key), folder, kind,
          // ชื่อไฟล์จริงต่อท้ายหลังเลขสุ่ม (20261023-ab12cd-ชื่อเดิม.mp4) — โชว์ชื่อเดิมให้คนจำได้
          name: folder === UPLOADS ? name.replace(/^\d{8}-[a-z0-9]{6}-/, "") : name,
          size: f.size, created_at: f.modified,
        })
      }
    }
    items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    return NextResponse.json({ items })
  } catch (e) {
    return NextResponse.json({ error: `อ่านคลังไฟล์ไม่ได้: ${e.message}` }, { status: 500 })
  }
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
  // ชื่อในคลัง: วันที่ + เลขสุ่ม + ชื่อเดิมที่ล้างแล้ว (ไทย/ช่องว่างกลายเป็น URL ที่ต้อง encode — เก็บแค่ a-z0-9)
  const d = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "")
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, "0")
  const base = name.slice(0, -(ext.length + 1)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || kind
  const path = `${UPLOADS}/${d}-${rand}-${base}.${ext}`
  try {
    return NextResponse.json({
      path, kind, url: mediaUrl(path),
      upload_url: presign("PUT", path, { expires: 3600 }),
      content_type: MIME[ext] || "application/octet-stream",
    })
  } catch (e) {
    return NextResponse.json({ error: `ออกลิงก์อัปโหลดไม่ได้: ${e.message}` }, { status: 500 })
  }
}
