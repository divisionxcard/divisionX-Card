// ต่อกับ Facebook Graph API — โพสต์ขึ้นเพจ DivisionX Card
//
// ทำไมแยกเป็นไฟล์ ไม่ยัดใน route: อนาคตจะมีตัวตั้งเวลาโพสต์ (GitHub Actions / cron)
// ที่ต้องใช้ตรรกะเดียวกันเป๊ะ ๆ — ถ้าก๊อปโค้ดไปวางอีกที่ พอแก้บั๊กจะแก้ไม่ครบทั้งสองทาง
//
// สิ่งที่ยืนยันจากเอกสาร Meta แล้ว (ไม่ได้เดา):
//   POST /{page-id}/photos   url=<รูป> caption=<ข้อความ>   → { id, post_id }
//   POST /{page-id}/feed     message=<ข้อความ>             → { id }
//   published=false บน /photos = อัปแล้วไม่ขึ้นเพจ อยู่บนเซิร์ฟเวอร์ ~24 ชม. (ใช้ทดสอบได้)
//   caption คือพารามิเตอร์ที่ถูกต้องของ /photos — message ถูก deprecate ไปแล้ว
//   สิทธิ์ที่ต้องมี: pages_manage_posts, pages_read_engagement (+ pages_manage_engagement)
//   Page token ที่ได้จาก long-lived user token → ไม่มีวันหมดอายุ (แต่เพิกถอนได้)

const DEFAULT_VERSION = "v26.0"

export function fbConfig() {
  const pageId = (process.env.FB_PAGE_ID || "").trim()
  const token = (process.env.FB_PAGE_ACCESS_TOKEN || "").trim()
  const version = (process.env.FB_API_VERSION || DEFAULT_VERSION).trim()
  return { pageId, token, version, ready: Boolean(pageId && token) }
}

// แปลรหัส error ของ Meta เป็นภาษาที่บอกได้ว่า "ต้องไปทำอะไรต่อ"
// ข้อความดิบของ Meta เป็นอังกฤษและกว้างมาก เช่น "Invalid OAuth access token"
// ซึ่งไม่บอกว่าให้ไปออก token ใหม่ยังไง — คนใช้จะติดตรงนี้แล้วไปต่อไม่ได้
function explain(err) {
  const code = err?.code
  const sub = err?.error_subcode
  const raw = err?.message || "ไม่ทราบสาเหตุ"
  if (code === 190) {
    if (sub === 463) return `Page Access Token หมดอายุแล้ว — ออกใหม่ด้วย scripts/fb-token.mjs (${raw})`
    if (sub === 460) return `Token ใช้ไม่ได้แล้วเพราะเจ้าของบัญชีเปลี่ยนรหัสผ่าน — ต้องออก token ใหม่ (${raw})`
    return `Page Access Token ไม่ถูกต้องหรือถูกเพิกถอน — ออกใหม่ด้วย scripts/fb-token.mjs (${raw})`
  }
  if (code === 200 || code === 10) {
    return `Token ไม่มีสิทธิ์โพสต์ — ตอนขอ token ต้องติ๊ก pages_manage_posts และ pages_read_engagement ด้วย (${raw})`
  }
  if (code === 100) return `พารามิเตอร์ไม่ถูกต้อง — มักเกิดจาก FB_PAGE_ID ผิด หรือรูปเปิดจากภายนอกไม่ได้ (${raw})`
  if (code === 368) return `เพจถูกจำกัดชั่วคราวจากการโพสต์ถี่เกินไป — เว้นระยะแล้วลองใหม่ (${raw})`
  if (code === 4 || code === 17 || code === 32) return `ยิง API ถี่เกินโควตา — รอสักครู่แล้วลองใหม่ (${raw})`
  if (code === 1609005) return `Facebook ดึงรูปจาก URL ไม่สำเร็จ — เช็กว่ารูปเปิดสาธารณะได้จริง (${raw})`
  return raw
}

async function graph(path, { method = "GET", params = {}, version, token } = {}) {
  const cfg = fbConfig()
  const v = version || cfg.version
  const url = new URL(`https://graph.facebook.com/${v}/${path}`)
  const auth = token || cfg.token

  let res
  if (method === "GET") {
    for (const [k, val] of Object.entries(params)) if (val != null) url.searchParams.set(k, String(val))
    url.searchParams.set("access_token", auth)
    res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  } else {
    // ส่งเป็น form ไม่ใช่ JSON — Graph API รับ application/x-www-form-urlencoded
    // และแคปชั่นไทยยาว ๆ ใส่ใน query string จะชนลิมิตความยาว URL
    const form = new URLSearchParams()
    for (const [k, val] of Object.entries(params)) if (val != null) form.set(k, String(val))
    form.set("access_token", auth)
    res = await fetch(url, { method, body: form, signal: AbortSignal.timeout(120000) })
  }

  let json
  try { json = await res.json() } catch { json = null }
  if (!res.ok || json?.error) {
    const e = new Error(explain(json?.error))
    e.status = res.status
    e.fbCode = json?.error?.code
    e.fbTrace = json?.error?.fbtrace_id
    throw e
  }
  return json
}

/** เช็กว่า token ใช้ได้จริงและชี้ไปเพจไหน — ใช้ก่อนโพสต์จริงจะได้ไม่พังกลางทาง */
export async function checkPage() {
  const cfg = fbConfig()
  if (!cfg.ready) {
    throw Object.assign(new Error("ยังไม่ได้ตั้ง FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN"), { status: 400 })
  }
  const me = await graph(cfg.pageId, { params: { fields: "id,name,link,fan_count" } })
  return { id: me.id, name: me.name, link: me.link, followers: me.fan_count ?? null, version: cfg.version }
}

/**
 * โพสต์ขึ้นเพจ
 * @param {string} caption ข้อความโพสต์
 * @param {string} [imageUrl] รูปประกอบ — ต้องเปิดจากภายนอกได้ (Facebook เป็นคนไปดึงเอง)
 * @param {boolean} [publish=true] false = อัปแต่ไม่ขึ้นเพจ (ใช้ทดสอบ) — เฉพาะตอนมีรูป
 * @returns {{postId:string|null, photoId:string|null, published:boolean}}
 */
export async function publishToPage({ caption, imageUrl, publish = true }) {
  const cfg = fbConfig()
  if (!cfg.ready) {
    throw Object.assign(new Error("ยังไม่ได้ตั้ง FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN"), { status: 400 })
  }
  const text = (caption || "").trim()
  if (!text) throw Object.assign(new Error("แคปชั่นว่าง"), { status: 400 })

  if (imageUrl) {
    // มีรูป → /photos · Facebook จะไปดึงรูปจาก URL เอง (รูปต้องเปิดสาธารณะ)
    const r = await graph(`${cfg.pageId}/photos`, {
      method: "POST",
      params: { url: imageUrl, caption: text, published: publish ? "true" : "false" },
    })
    return { postId: r.post_id || null, photoId: r.id || null, published: publish }
  }

  // ไม่มีรูป → โพสต์ข้อความล้วน
  // หมายเหตุ: /feed ไม่มีโหมด "อัปแต่ไม่ขึ้นเพจ" แบบ /photos
  // published=false ของ /feed ต้องคู่กับ scheduled_publish_time เสมอ ซึ่งคนละเรื่องกัน
  if (!publish) {
    throw Object.assign(
      new Error("โหมดทดสอบ (ไม่ขึ้นเพจจริง) ใช้ได้เฉพาะโพสต์ที่มีรูป — โพสต์ข้อความล้วนจะขึ้นเพจทันที"),
      { status: 400 })
  }
  const r = await graph(`${cfg.pageId}/feed`, { method: "POST", params: { message: text } })
  return { postId: r.id || null, photoId: null, published: true }
}

/** ลิงก์เปิดโพสต์จริง — ขอจาก Graph API ไม่ประกอบ URL เอง เผื่อรูปแบบ facebook.com เปลี่ยน */
export async function permalink(postId) {
  if (!postId) return null
  try {
    const r = await graph(postId, { params: { fields: "permalink_url" } })
    return r.permalink_url || null
  } catch {
    // ลิงก์เป็นของแถม — โพสต์สำเร็จไปแล้ว ไม่ควรทำให้ทั้งงานล้มเพราะขอลิงก์ไม่ได้
    return null
  }
}
