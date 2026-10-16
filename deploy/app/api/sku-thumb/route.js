import sharp from "sharp"
import { SKU_THUMB_FILE_RE } from "../../../lib/publicStock"

// รูปย่อของซอง/กล่อง (ใช้ในหน้า /stock) — เปิดสาธารณะ ไม่ต้องล็อกอิน
//
// ทำไมต้องย่อเอง (16 ต.ค. 2026):
//   รูปต้นฉบับใน bucket sku-images เป็น WebP 1024×1024 ราว 110–165 KB ต่อรูป
//   หน้า /stock เปิดรายการของตู้หนึ่งสาขา = ~40–50 รูป → ~5–6 MB บนเน็ตมือถือในห้าง
//   next/image ช่วยไม่ได้ เพราะ next.config ตั้ง images.unoptimized = true ทั้งระบบ
//   (ตั้งแต่ เม.ย. 2026 แก้รูปไม่ขึ้นบนมือถือ — ไม่แตะ เพราะกระทบทุกหน้า)
//   ย่อเหลือ 96/144 px ได้ ~2–4 KB ต่อรูป (เล็กลง ~50 เท่า) · sharp มีใน dependencies อยู่แล้ว
//
// ⚠️ กันถูกใช้เป็นพร็อกซีดึงอะไรก็ได้: ดึงได้เฉพาะไฟล์ใน bucket สาธารณะ sku-images ของเราเอง
//    ชื่อไฟล์ต้องผ่าน SKU_THUMB_FILE_RE (อังกฤษ/ตัวเลข/_.- + นามสกุลรูป) · ขนาดออกมีแค่ 96 กับ 144
// แคช: CDN ของ Vercel เก็บ 1 วัน + ใช้ของเก่าระหว่างย่อใหม่ได้อีก 7 วัน — ตัวอัปรูปตั้งชื่อไฟล์ใหม่ทุกครั้ง
//      (มีเวลาในชื่อ) รูปใหม่จึงได้ URL ใหม่ทันที · ไฟล์ที่ทับชื่อเดิมจะเห็นภายใน ~1 วัน

const WIDTHS = new Set([96, 144])
const MAX_BYTES = 8 * 1024 * 1024
const CACHE_OK = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
const CACHE_MISS = "public, max-age=300, s-maxage=300"

const fail = (status, msg, cache = "no-store") =>
  new Response(msg, { status, headers: { "Cache-Control": cache, "Content-Type": "text/plain; charset=utf-8" } })

export async function GET(request) {
  const sp = new URL(request.url).searchParams
  const file = sp.get("f") || ""
  const w = Number(sp.get("w") || "96")
  if (!SKU_THUMB_FILE_RE.test(file) || file.includes("..") || !WIDTHS.has(w)) return fail(400, "bad request")

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return fail(500, "not configured")
  const src = `${base.replace(/\/+$/, "")}/storage/v1/object/public/sku-images/${encodeURIComponent(file)}`

  let res
  try {
    // cache: no-store — ไม่เก็บรูปต้นฉบับไว้ใน Data Cache ของ Next (ผลที่ย่อแล้วแคชที่ CDN อยู่แล้ว)
    res = await fetch(src, { cache: "no-store", signal: AbortSignal.timeout(10000) })
  } catch {
    return fail(502, "upstream error")
  }
  if (!res.ok) return fail(404, "not found", CACHE_MISS)
  if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) return fail(413, "too large")
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) return fail(413, "too large")

  try {
    const out = await sharp(buf, { limitInputPixels: 40_000_000 })
      .rotate()   // รูปถ่ายจากมือถือ (jpg) ที่มี EXIF หมุน
      .resize(w, w, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 72 })
      .toBuffer()
    return new Response(out, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": CACHE_OK,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return fail(422, "unsupported image", CACHE_MISS)
  }
}
