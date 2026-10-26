// Cloudflare R2 — คลังวิดีโอ/รูปการตลาด (23 ต.ค. 2026) · ฝั่ง Python คู่กันที่ deploy/agents/r2.py (แก้วิธีเซ็นต้องแก้สองที่)
//
// ทำไมย้ายออกจาก Supabase Storage: แพ็กเกจฟรีมี Storage 1 GB + ดาวน์โหลด 5 GB/เดือน ใช้ร่วมกับฐานข้อมูลทั้งองค์กร
// ถ้าไฟล์หนักกินเกิน → โปรเจกต์โดนจำกัด (402) → ซิงค์ยอดขาย/สต็อกรายวันตายตาม · R2 เก็บฟรี 10 GB ดาวน์โหลดฟรีไม่จำกัด
//
// bucket เป็นส่วนตัว (ลิงก์ r2.dev จำกัดความเร็ว Cloudflare ห้ามใช้จริง) → ลิงก์ถาวรของไฟล์คือ
//   https://division-x-card.vercel.app/media/<key>  → app/media/[...key]/route.js ตอบ 302 ไปลิงก์ลงชื่อที่ยังไม่หมดอายุ
// ลิงก์ที่ส่งให้คนนอกดึงเอง (Facebook/IG) ใช้ directUrl() = ลิงก์ลงชื่อตรง ไม่ผ่าน redirect
//
// env: R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET (Vercel env + deploy/.env.local)
import crypto from "node:crypto"

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://division-x-card.vercel.app").replace(/\/+$/, "")
export const MEDIA_BASE = `${SITE}/media/`
// ลิงก์เดิมใน Supabase (ก่อนย้าย) — key เดียวกันทุกตัว (ย้ายแบบรักษา path)
const LEGACY = () => `${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")}/storage/v1/object/public/marketing/`
// ไม่เปิดผ่าน /media: ร่างงานตัดต่อ · ไดอารี่งาน (เปิดได้ทาง /api/diary เฉพาะแอดมิน) · ไฟล์ทดสอบ
export const PRIVATE_PREFIXES = ["video-edits/", "diary/", "_selftest/", "research/"]   // research/ = ประวัติสตอรี่บอร์ด/กล่องส่งแอด (26 ต.ค.)

function cfg() {
  const acc = (process.env.R2_ACCOUNT_ID || "").trim()
  const ak = (process.env.R2_ACCESS_KEY_ID || "").trim()
  const sk = (process.env.R2_SECRET_ACCESS_KEY || "").trim()
  if (!acc || !ak || !sk) throw new Error("ยังไม่ได้ตั้งคีย์ R2 (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)")
  return { acc, ak, sk, bucket: (process.env.R2_BUCKET || "dvx-media").trim() }
}

export const r2Configured = () => { try { cfg(); return true } catch { return false } }

// RFC 3986 — encodeURIComponent ปล่อย !'()* ผ่าน ซึ่ง SigV4 ต้อง encode
const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())
const hmac = (k, m) => crypto.createHmac("sha256", k).update(m, "utf8").digest()

export function validKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= 400 && !key.includes("..")
    && !key.startsWith("/") && /^[A-Za-z0-9._\-/ ]+$/.test(key)
}

// ลิงก์ลงชื่อ (query SigV4 · region auto) — expires วินาที ≤ 7 วัน
export function presign(method, key = "", { expires = 3600, query = {} } = {}) {
  const { acc, ak, sk, bucket } = cfg()
  const host = `${acc}.r2.cloudflarestorage.com`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const day = amzDate.slice(0, 8)
  const scope = `${day}/auto/s3/aws4_request`
  const uri = "/" + enc(bucket) + (key ? "/" + key.split("/").map(enc).join("/") : "")
  const params = {
    ...query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${ak}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(Math.max(Math.floor(expires), 1), 604800)),
    "X-Amz-SignedHeaders": "host",
  }
  const qs = Object.keys(params).sort().map(k => `${enc(k)}=${enc(params[k])}`).join("&")
  const canonical = [method.toUpperCase(), uri, qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n")
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, crypto.createHash("sha256").update(canonical).digest("hex")].join("\n")
  const kSign = hmac(hmac(hmac(hmac("AWS4" + sk, day), "auto"), "s3"), "aws4_request")
  const sig = crypto.createHmac("sha256", kSign).update(toSign).digest("hex")
  return `https://${host}${uri}?${qs}&X-Amz-Signature=${sig}`
}

export async function putObject(key, body, contentType = "application/octet-stream") {
  const res = await fetch(presign("PUT", key, { expires: 900 }), { method: "PUT", body, headers: { "Content-Type": contentType } })
  if (!res.ok) throw new Error(`R2 PUT ${key} → ${res.status} ${(await res.text()).slice(0, 160)}`)
  return mediaUrl(key)
}

export async function getObject(key) {
  const res = await fetch(presign("GET", key, { expires: 300 }), { cache: "no-store" })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`R2 GET ${key} → ${res.status}`)
  return res
}

export async function deleteObject(key) {
  const res = await fetch(presign("DELETE", key, { expires: 300 }), { method: "DELETE" })
  if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${key} → ${res.status}`)
}

const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")

// [{ key, size, modified }] ไล่หน้าให้ครบ (ListObjectsV2) — max = เพดานรวม
export async function listObjects(prefix = "", max = 2000) {
  const out = []
  let token = null
  do {
    const query = { "list-type": "2", "max-keys": "1000", prefix }
    if (token) query["continuation-token"] = token
    const res = await fetch(presign("GET", "", { expires: 300, query }), { cache: "no-store" })
    if (!res.ok) throw new Error(`R2 LIST ${prefix} → ${res.status}`)
    const xml = await res.text()
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const g = (t) => (m[1].match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || ""
      out.push({ key: unxml(g("Key")), size: Number(g("Size")) || 0, modified: g("LastModified") })
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? unxml((xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) || [])[1] || "") : null
  } while (token && out.length < max)
  return out
}

export const mediaUrl = (key) => MEDIA_BASE + key.split("/").map(encodeURIComponent).join("/")

// ลิงก์ไฟล์ของเรา (แบบใหม่ /media/ ของโดเมนไหนก็ได้ หรือแบบเดิมใน Supabase) → key · ไม่ใช่ของเรา = null
export function keyOf(url) {
  if (typeof url !== "string") return null
  let rest = null
  if (url.startsWith(MEDIA_BASE)) rest = url.slice(MEDIA_BASE.length)
  else if (LEGACY() && url.startsWith(LEGACY())) rest = url.slice(LEGACY().length)
  else {
    const m = url.match(/^https?:\/\/(?:localhost(?::\d+)?|[a-z0-9-]+\.vercel\.app)\/media\/(.+)$/)
    if (m) rest = m[1]
  }
  if (rest == null) return null
  const key = decodeURIComponent(rest.split("?")[0])
  return validKey(key) ? key : null
}

// ลิงก์ที่ให้คนนอกดึงตรง (Facebook/IG/Telegram) — ไฟล์ของเรา = ลิงก์ลงชื่อ R2 · อย่างอื่นคืนเดิม
export function directUrl(url, expires = 6 * 3600) {
  const key = keyOf(url)
  if (!key || !r2Configured()) return url
  return presign("GET", key, { expires })
}
