// ── ด่านกันเส้นทาง "ห้องตัดต่อในเครื่อง" ไม่ให้มีตัวตนบน production ──
//
// กลุ่ม /api/video/local/* อ่าน-เขียนไฟล์ในเครื่องและ spawn โปรเซส python
// ซึ่งบน Vercel ทำไม่ได้อยู่แล้ว (serverless ไม่มี .video-work ไม่มี ffmpeg ไม่มี GPU)
// แต่ "ทำไม่ได้" ไม่พอ — ต้องตอบ 404 ไปเลยเพื่อไม่ให้ endpoint โผล่เป็นพื้นผิวโจมตี
//
// เหตุผลที่เช็ค NODE_ENV ไม่ใช่ hostname: Next ตั้งให้เองตอน `next dev` (development)
// กับตอน build บน Vercel (production) — ไม่ต้องพึ่ง env ที่คนต้องจำไปตั้ง
import { NextResponse } from "next/server"
import path from "path"

export function localOnly() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
  return null
}

// โฟลเดอร์งานของโรงงานวิดีโอ — cwd ของ dev server คือ deploy/ จึงถอยขึ้นหนึ่งชั้น
export const WORK_ROOT = process.env.VIDEO_WORK_DIR
  || path.resolve(process.cwd(), "..", ".video-work")

// ชื่อโปรเจกต์ถูกใช้ต่อเป็น path — จำกัดอักขระที่นี่ที่เดียว ทุก route ต้องเรียกก่อนใช้
const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/

export function projectDir(name) {
  if (!NAME_RE.test(name || "")) return null
  return path.join(WORK_ROOT, name)
}

// กัน path traversal ของพารามิเตอร์ file= — ต้อง resolve แล้วยังอยู่ใต้โฟลเดอร์งานจริง
export function safeFile(dir, file) {
  if (!file || file.includes("..")) return null
  const full = path.resolve(dir, file)
  if (!full.startsWith(path.resolve(dir) + path.sep)) return null
  return full
}
