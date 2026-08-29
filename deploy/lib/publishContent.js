// ตรรกะ "โพสต์คอนเทนต์ 1 ชิ้นขึ้นเพจ" ที่ใช้ร่วมกัน 2 ทาง:
//   - คนกดเอง        POST /api/marketing/content/publish        (ปุ่มในหน้า /marketing)
//   - ตัวตั้งเวลาโพสต์ POST /api/marketing/content/publish-due    (cron ยิงตามเวลาที่วางไว้)
//
// แยกออกมาเป็นโมดูลกลางตั้งแต่ต้น เพราะสองทางนี้ต้องมีด่านกันพลาด **ชุดเดียวกันเป๊ะ**
// ถ้าเขียนสองที่แล้ววันหนึ่งเพิ่มด่านใหม่ที่ทางเดียว ทางที่ลืมจะปล่อยของเสียขึ้นเพจ
// (บทเรียนเดิมของโปรเจกต์นี้: ตรรกะซ้ำสองชุดพังแบบเงียบ ๆ — ดู project_sku_mapping_two_scraper_maps)
import { publishToPage, permalink, photoImage } from "./facebook"

const TABLE = "marketing_content"
// ช่องว่างที่ AI ทิ้งไว้ให้คนเติม เช่น {ชื่อสาขา} — regex เดียวกับ holesIn() ในหน้าเว็บ
export const HOLE = /\{[^}]{1,40}\}/g

// ── ปลายทางที่โพสต์ได้จริงตอนนี้ ────────────────────────────────────────
//
// ⚠️ ตาราง marketing_content มีคอลัมน์ platform (fb · line · ig · tiktok) มาตั้งแต่ต้น
//    แต่ตัวโพสต์อ่านมันหรือไม่? **ไม่** — publishToPage ยิงเข้าเพจ Facebook เสมอ
//    แปลว่าถ้าตั้งชิ้นไหนเป็น line/ig/tiktok ไว้ มันจะไปโผล่บนเพจ Facebook แทน
//    ตรวจเจอ 29 ส.ค. 2026 ตอนคุยเรื่องต่อแพลตฟอร์มเพิ่ม · ยังไม่เคยเกิดจริง
//    เพราะทุกแถว (34/34) เป็น fb หมด — ใส่ด่านตอนที่ยังไม่มีของเสียคือจังหวะที่ถูก
//
// ⚠️ เพิ่มปลายทางใหม่ต้องแก้ที่นี่ที่เดียว แล้วต่อตัวส่งใน publishOne
//    อย่าไปเช็ค platform ในหน้าเว็บหรือใน route แทน — ด่านต้องอยู่ในโมดูลกลาง
//    ที่ทั้งทางกดเองและทางตั้งเวลาใช้ร่วมกัน (เหตุผลเดียวกับที่แยกไฟล์นี้ออกมาแต่แรก)
export const PUBLISHABLE = new Set(["fb"])

export const PLATFORM_LABEL = {
  fb: "Facebook เพจ", line: "LINE OA", ig: "Instagram", tiktok: "TikTok",
}

// คอลัมน์เป็น NOT NULL DEFAULT 'fb' อยู่แล้ว แต่กันไว้เผื่อแถวเก่า/ข้อมูลนำเข้า
export const platformOf = (item) => String(item?.platform || "fb").toLowerCase()

// ตรวจว่าชิ้นนี้โพสต์ได้ไหม — คืน null ถ้าผ่าน หรือ { error, status } ถ้าไม่ผ่าน
// เรียงจากความผิดที่ย้อนกลับไม่ได้ (โพสต์ซ้ำ) ไปหาที่ย้อนได้
export function blockReason(item, { requireSchedule = false } = {}) {
  // 1) เคยโพสต์แล้ว · Facebook ไม่กันโพสต์ซ้ำให้ ยิงสองครั้งได้สองโพสต์
  //    เช็กจาก post_id ไม่ใช่ status เพราะ status แก้ด้วยมือได้จากหน้าเว็บ
  if (item.post_id) {
    return { error: "ชิ้นนี้โพสต์ขึ้นเพจไปแล้ว", status: 409,
             post_id: item.post_id, post_url: item.post_url }
  }
  // 2) ปลายทางต้องเป็นที่ที่เราส่งได้จริง
  //    ผิดข้อนี้ = โพสต์ไปโผล่ผิดที่ ซึ่งย้อนกลับไม่ได้พอ ๆ กับโพสต์ซ้ำ จึงอยู่ต้น ๆ
  const platform = platformOf(item)
  if (!PUBLISHABLE.has(platform)) {
    return {
      error: `ชิ้นนี้ตั้งปลายทางไว้เป็น ${PLATFORM_LABEL[platform] || platform} ` +
             `ซึ่งระบบยังต่อไม่ได้ — ยังโพสต์อัตโนมัติให้ไม่ได้`,
      hint: `ตอนนี้ส่งได้เฉพาะ ${[...PUBLISHABLE].map(p => PLATFORM_LABEL[p] || p).join(" · ")} ` +
            `· เปลี่ยนปลายทางเป็น Facebook เพจ หรือคัดลอกไปโพสต์เองที่ ` +
            `${PLATFORM_LABEL[platform] || platform}`,
      status: 409,
      platform,
    }
  }

  // 3) ต้องผ่านการอนุมัติจากคนก่อน — ไม่มีทางอ้อม
  if (!["approved", "scheduled"].includes(item.status)) {
    return { error: `ต้องอนุมัติก่อนถึงจะโพสต์ได้ (ตอนนี้สถานะ "${item.status}")`, status: 409 }
  }
  // 4) ยังมีช่องว่างค้าง — โพสต์ออกไปแล้วลบไม่ได้ ต้องกันตั้งแต่ตรงนี้
  const holes = (item.caption || "").match(HOLE) || []
  if (holes.length) {
    return { error: `ยังมีช่องว่างที่ต้องเติมก่อนโพสต์: ${holes.join(", ")}`, status: 400 }
  }
  // 5) ผู้ตรวจบอกว่าไม่ควรใช้ชิ้นนี้ — คนอนุมัติอาจกดผ่านมาโดยไม่ได้อ่าน
  //    ทางที่คนกดเองไม่บล็อก (คนเห็นป้ายเตือนบนหน้าจอแล้วยังยืนยัน = การตัดสินใจของเขา)
  //    แต่ทางตั้งเวลาอัตโนมัติต้องบล็อก เพราะไม่มีใครดูอยู่ตอนมันยิง
  if (requireSchedule && item.review_verdict === "drop") {
    return { error: "ผู้ตรวจระบุว่าไม่ควรใช้ชิ้นนี้ (drop) — ตัวตั้งเวลาจะไม่โพสต์ให้", status: 409 }
  }
  // 6) โพสต์อัตโนมัติต้องมีเวลาที่ตั้งไว้จริง — กันกรณี query ผิดแล้วยิงของที่ยังไม่ถึงคิว
  if (requireSchedule && !item.scheduled_at) {
    return { error: "ยังไม่ได้กำหนดเวลาโพสต์", status: 400 }
  }
  return null
}

// โพสต์จริง + บันทึกผลลง DB · คืน { ok, post_id, post_url } หรือ { error, status, ... }
// dryRun = อัปรูปขึ้น Facebook แต่ไม่เผยแพร่ ไม่แตะ DB
export async function publishOne(db, item, { dryRun = false, requireSchedule = false } = {}) {
  const blocked = blockReason(item, { requireSchedule })
  if (blocked) return blocked

  let result
  try {
    result = await publishToPage({
      caption: item.caption,
      imageUrl: item.media_url || null,
      publish: !dryRun,
    })
  } catch (err) {
    return { error: err.message, fbCode: err.fbCode, status: err.status || 502 }
  }

  // โหมดทดสอบ — คืน URL รูปบนเซิร์ฟเวอร์ Facebook ด้วย เพราะคำถามจริงของคนกดคือ
  // "รูปกับแคปชั่นออกมาหน้าตายังไง" ไม่ใช่ "API ตอบ 200 ไหม"
  if (dryRun) {
    return {
      ok: true, dryRun: true,
      photoId: result.photoId,
      photoUrl: await photoImage(result.photoId),
      caption: item.caption,
      note: "อัปขึ้น Facebook แล้วแต่ไม่ได้เผยแพร่ · ไม่มีใครเห็นบนเพจ · Facebook ลบให้เองใน ~24 ชม.",
    }
  }

  const post_id = result.postId || result.photoId
  const post_url = await permalink(post_id)

  const { data, error } = await db.from(TABLE).update({
    status: "posted",
    posted_at: new Date().toISOString(),
    post_id,
    post_url,
  }).eq("id", item.id).select().maybeSingle()

  // ⚠️ ขึ้นเพจไปแล้วแต่บันทึกลง DB ไม่สำเร็จ — ห้ามคืนแค่ error เปล่า
  // ไม่งั้นจะมีคน (หรือ cron รอบถัดไป) ยิงซ้ำแล้วได้โพสต์ซ้ำบนเพจจริง
  if (error) {
    return {
      error: `โพสต์ขึ้นเพจสำเร็จแล้ว แต่บันทึกลงฐานข้อมูลไม่สำเร็จ — อย่าโพสต์ซ้ำ (${error.message})`,
      post_id, post_url, needsManualFix: true, status: 500,
    }
  }
  return { ok: true, item: data, post_id, post_url }
}
