// เลือกสินค้าที่จะเอารูปไปใช้ในโปสเตอร์ เมื่อคอนเทนต์ไม่ได้ผูกกับ SKU
//
// ⚠️ ทำไมต้องมี:
//   ไอเดียที่มาจากข่าวจะไม่มี source_sku (เจ้าของยืนยัน 25 ส.ค. 2026)
//   ตรวจแล้วคอนเทนต์ #35 #36 #37 เป็น null ทั้งหมด
//   ผลคือ:
//     ฝั่งเทมเพลต  — ไม่รู้ว่าจะแปะรูปอะไร ตกไปใช้รูปตู้ ไม่มีซองในภาพเลย
//     ฝั่ง AI      — ต้องเดาเอง เคยหยิบซองขายดีรวมซึ่งเป็น One Piece หมด
//                    แล้วเอาไปวางบนโพสต์โปเกมอน (แก้ไปแล้ว 24 ส.ค.)
//
// ⚠️ ไฟล์กลาง ห้ามก๊อปตรรกะนี้ไปวางซ้ำ — โปรเจกต์นี้เคยเจ็บกับ SKU mapper
//    ที่ถูกก๊อปไป 6 ไฟล์แล้วแก้ไม่ครบ จนยอดขายไปรวมกับ SKU ผิดตัวแบบเงียบ ๆ

import { fetchAll } from "./fetchAll"

/**
 * SKU ขายดีที่สุดของค่ายนั้น ที่มีรูปให้ใช้จริง
 *
 * เรียงตามยอดขาย 30 วันจริง ไม่ใช่สุ่ม — จะได้เป็นของที่ลูกค้าเห็นในตู้จริง ๆ
 * และไม่เชียร์ของที่ขายไม่ออก
 *
 * @param {object} db  Supabase client (service role)
 * @param {object} o
 * @param {string|null} o.franchise รหัสค่าย · null = เอาขายดีรวมทุกค่าย
 * @param {number} [o.limit=1]
 * @param {boolean} [o.needBox=false] ต้องมีรูปกล่องด้วยไหม
 * @returns {Promise<Array>} [] ถ้าอ่านข้อมูลไม่ได้ — ผู้เรียกต้องรับมือเองได้
 */
export async function topSkusByFranchise(db, { franchise = null, limit = 1, needBox = false } = {}) {
  try {
    let q = db.from("skus")
      .select("sku_id,name,franchise,set_code,image_url,image_url_box")
      .eq("is_active", true)
      .not("image_url", "is", null)
    if (franchise) q = q.eq("franchise", franchise)
    const { data: pool, error } = await q.limit(60)
    if (error) throw error

    let list = (pool || []).filter(s => !needBox || s.image_url_box)
    // ค่ายนั้นไม่มีของที่ใช้ได้ → ถอยไปเอาทุกค่าย ดีกว่าไม่มีรูปเลย
    // ผู้เรียกเช็ค franchise ของผลลัพธ์เองได้ว่าตรงไหม
    if (!list.length && franchise) {
      return topSkusByFranchise(db, { franchise: null, limit, needBox })
    }
    if (!list.length) return []

    const since = new Date(Date.now() - 30 * 864e5).toISOString()
    // ⚠️ เดิมใช้ .limit(5000) ซึ่ง **กันไม่ได้จริง** — PostgREST cap ที่ 1000 อยู่ดี
    //    ผลคือจัดอันดับจากข้อมูล 21% แล้วได้อันดับผิดทุกอันดับ (แก้ 25 ส.ค. 2026)
    const recent = await fetchAll(() => db.from("sales")
      .select("sku_id,quantity_sold").gte("sold_at", since))
    const sold = {}
    for (const r of recent || []) {
      sold[r.sku_id] = (sold[r.sku_id] || 0) + (r.quantity_sold || 0)
    }
    return list
      .sort((a, b) => (sold[b.sku_id] || 0) - (sold[a.sku_id] || 0))
      .slice(0, limit)
  } catch {
    return []
  }
}

// รหัสชุดเขียนได้หลายทรง: แคปชั่นเขียน "OP-14" · "op 14" · "OP14" แต่ skus.set_code เก็บ "OP14"
// ⚠️ 21 ต.ค. 2026 — เดิมเทียบสตริงตรง ๆ แคปชั่น #63 ("OP-14 / OP-16 / OP-17") จึงจับไม่ได้สักชุด
//    แล้วตกไปใช้ซองขายดีตัวอื่นเป็นรูปอ้างอิง = โปสเตอร์ถามเรื่อง OP-14 แต่โชว์ซองชุดอื่น
const normCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
// ตัวอักษร 2-4 ตัว + ตัวเลข 2-3 หลัก (OP14 · EB03 · PRB01 · FB09 · ST13) · \b กันไปจับกลางคำอังกฤษอื่น
const CODE_IN_TEXT = /\b[A-Z]{2,4}[\s-]?\d{2,3}\b/gi

/**
 * SKU ที่ข้อความเอ่ยถึง — ด้วยชื่อสินค้าตรงตัว หรือรหัสชุดทรงไหนก็ได้
 * (ฟังก์ชันล้วน — ทดสอบได้ · ลำดับผลตามลำดับใน skus ที่ส่งมา)
 *
 * @param {string} text  แคปชั่น/หัวข้อไอเดีย
 * @param {Array} skus   แถว skus ที่มี name/set_code
 */
export function skusNamedIn(text, skus) {
  const hay = String(text || "")
  const codes = new Set((hay.match(CODE_IN_TEXT) || []).map(normCode))
  return (skus || []).filter(s =>
    (s.name && hay.includes(s.name)) ||
    (s.set_code && (hay.includes(s.set_code) || codes.has(normCode(s.set_code)))))
}

export default { topSkusByFranchise, skusNamedIn }
