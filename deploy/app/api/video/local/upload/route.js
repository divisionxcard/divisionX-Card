// POST /api/video/local/upload?name=X&file=logo.png — อัปโหลดไฟล์เข้าโฟลเดอร์งาน
// ใช้กับโลโก้และภาพที่ถ่ายเอง (อ้างต่อใน plan ว่า file:ชื่อไฟล์ หรือ edit.logo.file)
import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { localOnly, projectDir, safeFile } from "../_guard"

const OK_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"])
const MAX = 5 * 1024 * 1024      // 5MB — เท่าที่โลโก้/ภาพนิ่งควรจะเป็น เกินนี้คือส่งผิดไฟล์

export async function POST(req) {
  const gate = localOnly()
  if (gate) return gate

  const url = new URL(req.url)
  const dir = projectDir(url.searchParams.get("name"))
  const fileName = url.searchParams.get("file") || ""
  // บังคับชื่อไฟล์ชั้นเดียว — ไฟล์อัปโหลดอยู่ระดับบนของโฟลเดอร์งานเสมอ
  const flat = path.basename(fileName)
  const ext = path.extname(flat).toLowerCase()
  const full = dir && flat === fileName && OK_EXT.has(ext) && safeFile(dir, flat)
  if (!full) {
    return NextResponse.json(
      { error: "ชื่อไฟล์ไม่ถูกต้อง — .png .jpg .webp เท่านั้น และห้ามมีโฟลเดอร์" },
      { status: 400 })
  }

  const buf = Buffer.from(await req.arrayBuffer())
  if (!buf.length) return NextResponse.json({ error: "ไฟล์ว่าง" }, { status: 400 })
  if (buf.length > MAX) {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5MB" }, { status: 413 })
  }

  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(full, buf)
  return NextResponse.json({ file: flat, bytes: buf.length })
}
