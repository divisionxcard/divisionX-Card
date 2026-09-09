// GET /api/video/local/asset?name=X&file=... — สตรีมไฟล์สื่อจากโฟลเดอร์งาน
//
// ⚠️ ต้องรองรับ Range header จริง ๆ ไม่ใช่ทางเลือก — <video>/<audio> ใช้ Range
//    ตอน seek ถ้าเสิร์ฟแบบก้อนเดียว เสียงจะเลื่อนไปจุดอื่นไม่ได้ และ timeline
//    ทั้งห้องตัดต่อพึ่งการ seek ของ <audio> เป็นนาฬิกาหลัก
//
// ไม่ gate auth — แท็ก <video src>/<audio src> แนบ Authorization header ไม่ได้
// ความปลอดภัยมาจาก localOnly() (dev เท่านั้น) + จำกัดชื่อโปรเจกต์ + กัน traversal
import fs from "fs"
import { Readable } from "stream"
import { localOnly, projectDir, safeFile } from "../_guard"

const MIME = {
  ".mp4": "video/mp4", ".wav": "audio/wav", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".json": "application/json", ".log": "text/plain; charset=utf-8",
}

export async function GET(req) {
  const gate = localOnly()
  if (gate) return gate

  const url = new URL(req.url)
  const dir = projectDir(url.searchParams.get("name"))
  const full = dir && safeFile(dir, url.searchParams.get("file"))
  if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return new Response("not found", { status: 404 })
  }

  const ext = full.slice(full.lastIndexOf(".")).toLowerCase()
  const type = MIME[ext] || "application/octet-stream"
  const size = fs.statSync(full).size
  const range = req.headers.get("range")

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    let start = m && m[1] ? parseInt(m[1]) : 0
    let end = m && m[2] ? parseInt(m[2]) : size - 1
    if (isNaN(start) || start >= size) start = 0
    if (isNaN(end) || end >= size) end = size - 1
    const stream = Readable.toWeb(fs.createReadStream(full, { start, end }))
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        // ไฟล์ในโฟลเดอร์งานถูกเขียนทับตอนเรนเดอร์ใหม่ — cache แล้วจะเห็นของเก่า
        "Cache-Control": "no-store",
      },
    })
  }

  return new Response(Readable.toWeb(fs.createReadStream(full)), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  })
}
