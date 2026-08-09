// อัปโหลดรูปเข้าคอนเทนต์ — POST /api/marketing/content/upload (multipart: id, file)
//
// ทำไมต้องมี: เจ้าของอยากได้ภาพคุณภาพระดับที่ ChatGPT ทำให้ โดยไม่ต้องจ่ายเพิ่ม
// ทางที่ถูกที่สุดคือ **ใช้ ChatGPT Plus ที่จ่ายรายเดือนอยู่แล้ว** สร้างภาพเอง
// แล้วเอาไฟล์เข้าระบบ — แต่เดิมหน้าเว็บรับได้แค่ "วางลิงก์" ซึ่งใช้กับไฟล์ในเครื่องไม่ได้
//
// ทดสอบทางฟรีแบบสร้างอัตโนมัติแล้ว (Pollinations ไม่ต้องมี key ได้ภาพใน 2 วิ)
// แต่มันวาดสินค้าขึ้นเองที่ไม่ใช่ของเรา และมีตัวหนังสือมั่วทั้งที่สั่งห้าม → ใช้จริงไม่ได้
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../../../lib/apiAuth"

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const db = createClient(SB_URL, SB_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const BUCKET = "marketing"
const MAX_BYTES = 12 * 1024 * 1024
const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  let form
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: "ต้องส่งเป็น multipart/form-data" }, { status: 400 })
  }

  const id = parseInt(form.get("id"), 10)
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 })

  const file = form.get("file")
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 })
  }

  // ตรวจจาก MIME ที่เบราว์เซอร์ส่งมา — พอสำหรับที่นี่เพราะ route นี้ admin เท่านั้น
  // และ bucket เป็น public read อย่างเดียว ไม่ได้ execute อะไร
  const type = (file.type || "").split(";")[0]
  if (!OK_TYPES.includes(type)) {
    return NextResponse.json({
      error: `ชนิดไฟล์ไม่รองรับ: ${type || "ไม่ทราบ"}`,
      hint: "รองรับ PNG · JPG · WEBP · GIF",
    }, { status: 415 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({
      error: `ไฟล์ใหญ่เกินไป (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      hint: `จำกัดที่ ${MAX_BYTES / 1024 / 1024} MB — ย่อรูปก่อนอัปโหลด`,
    }, { status: 413 })
  }

  try {
    const { data: exists } = await db.from("marketing_content").select("id").eq("id", id).maybeSingle()
    if (!exists) return NextResponse.json({ error: `ไม่พบรายการ id=${id}` }, { status: 404 })

    const buf = Buffer.from(await file.arrayBuffer())
    const ext = type === "image/png" ? "png"
      : type === "image/webp" ? "webp"
      : type === "image/gif" ? "gif" : "jpg"
    // timestamp ในชื่อไฟล์ — อัปทับใหม่แล้วได้ URL ใหม่ ไม่ต้องสู้กับ CDN cache
    const key = `upload/${id}-${Date.now()}.${ext}`

    const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: "POST",
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": type, "x-upsert": "true",
      },
      body: buf,
    })
    if (!up.ok) {
      const t = await up.text().catch(() => "")
      throw new Error(`อัปโหลดเข้า Storage ไม่สำเร็จ (${up.status}) ${t.slice(0, 150)}`)
    }

    const publicUrl = `${SB_URL}/storage/v1/object/public/${BUCKET}/${key}`
    const { data: updated, error } = await db.from("marketing_content")
      .update({ media_url: publicUrl, media_type: "image" })
      .eq("id", id)
      .select("*, idea:marketing_ideas!marketing_content_idea_id_fkey(id,url,source,source_label)")
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({ ...updated, uploaded: { bytes: buf.length, type } })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
