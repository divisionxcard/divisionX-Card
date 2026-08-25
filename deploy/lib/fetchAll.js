// ดึงข้อมูลจาก Supabase ให้ครบทุกแถว
//
// ⚠️ ทำไมต้องมี — กับดักที่ทำให้ตัวเลขผิดแบบไม่มี error:
//   PostgREST ตั้ง max-rows ไว้ที่ 1000 และ **`.limit(5000)` เอาชนะไม่ได้**
//   ทดสอบจริง 25 ส.ค. 2026: ขอ limit=5000 จาก sales 30 วัน (4,730 แถว) ได้กลับมา 1,000 แถว
//   ไม่มี error ไม่มีคำเตือน — โค้ดที่เขียน .limit(5000) ไว้ดูเหมือนกันไว้แล้วแต่ไม่ได้กัน
//
//   ผลที่เกิดจริง: skuPicker.js จัดอันดับซองขายดีจากข้อมูล 21% ของที่มี
//   → อันดับผิด **ทุกอันดับ** (เห็น OP 16 เป็นที่ 1 ทั้งที่จริงคือ OP 13)
//   → โปสเตอร์เชียร์สินค้าผิดตัวมาตลอด
//
// ⚠️ ไฟล์กลาง — ห้ามก๊อปตรรกะนี้ไปวางซ้ำ
//    โปรเจกต์นี้เคยเจ็บกับ SKU mapper ที่ถูกก๊อปไป 6 ไฟล์แล้วแก้ไม่ครบ

const PAGE = 1000

/**
 * ดึงครบทุกแถว โดยวนขอทีละหน้าจนได้น้อยกว่าที่ขอ
 *
 * @param {() => object} build ฟังก์ชันที่ **สร้าง query ใหม่ทุกครั้ง**
 *   ต้องเป็นฟังก์ชัน ไม่ใช่ตัว query สำเร็จรูป เพราะ PostgrestBuilder ใช้ซ้ำไม่ได้
 *   (await แล้วมันจบไปเลย เรียก .range() ทับรอบสองจะไม่ทำงาน)
 *
 *   ตัวอย่าง: fetchAll(() => db.from("sales").select("sku_id").gte("sold_at", since))
 *
 * @param {object} [o]
 * @param {number} [o.max] เพดานกันวนไม่จบ ถ้าเกินจะหยุดแล้วคืนเท่าที่ได้
 * @returns {Promise<Array>}
 * @throws ต่อ error จาก Supabase ขึ้นไป — ผู้เรียกตัดสินใจเองว่าจะกลืนหรือไม่
 */
export async function fetchAll(build, { max = 100_000 } = {}) {
  const out = []
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

export default fetchAll
