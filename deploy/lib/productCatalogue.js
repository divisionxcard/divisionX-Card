// รายการสินค้าจริงทั้งหมดที่เราขาย — ป้อนให้ตัวเขียนคอนเทนต์ทุกครั้ง
//
// ⚠️ ทำไมต้องมี (24 ส.ค. 2026):
//   ตัวเขียนแคปชั่นเห็นสินค้าแค่ "ตัวเดียว" ที่คอนเทนต์ผูกไว้ ไม่รู้เลยว่าเราขายอะไรอีก
//   ผลคือมันแต่งสินค้าที่เราไม่มีขึ้นมาเปรียบเทียบ — เคสจริง:
//
//     "เลือกแบบไหนดีระหว่างซองญี่ปุ่นลายใหม่ล่าสุด
//      กับซองคอลเลกชันคลาสสิกที่นักสะสมตามหามานาน"
//
//   แต่โปเกมอนที่เราขายมีแค่ 3 ชุด (M2a · M4 · M5) เป็นชุดใหม่ทั้งหมด
//   **ไม่มีของคลาสสิกเลยสักชุด** → ลูกค้าอ่านแล้วมาที่ตู้ก็ไม่เจอ
//
//   ต่อให้ภาพถูกค่ายแล้ว โพสต์ก็ยังสัญญาสิ่งที่ไม่มีอยู่จริง
//   ต้องแก้ที่ตัวเขียน ไม่ใช่ตัวสร้างภาพ
import { FRANCHISE_LABEL } from "./franchiseDetect"

// เรียงตามความสำคัญทางธุรกิจ — One Piece คือเครื่องยนต์หลัก
const ORDER = ["OP", "DB", "PKM", "YGH", "NRT", "MLP", "SL", "MLBB", "TF"]

const LANG_LABEL = { JA: "ญี่ปุ่น", EN: "อังกฤษ", TH: "ไทย", CN: "จีน" }

/**
 * ก้อนรายการสินค้าสำหรับใส่ prompt
 *
 * @param {object} db  Supabase client (service role)
 * @param {object} [o]
 * @param {string} [o.focus] รหัสค่ายที่โพสต์นี้พูดถึง — จะกางรายละเอียดเฉพาะค่ายนั้น
 * @returns {Promise<string>} "" ถ้าอ่านข้อมูลไม่ได้ (ปล่อยให้เขียนต่อได้ ไม่ล้มทั้งงาน)
 */
export async function catalogueBlock(db, { focus = null } = {}) {
  let skus, stock
  try {
    const [a, b] = await Promise.all([
      db.from("skus")
        .select("sku_id,name,franchise,set_code,language")
        .eq("is_active", true),
      db.from("machine_stock").select("sku_id,machine_id"),
    ])
    if (a.error) throw a.error
    skus = a.data || []
    stock = b.data || []
  } catch {
    return ""
  }
  if (!skus.length) return ""

  // ตู้ไหนมีสินค้าตัวไหนอยู่บ้างตอนนี้ — ใช้บอกว่า "มีให้กดจริง" หรือ "ยังไม่ลงตู้"
  const inMachines = {}
  for (const r of stock) {
    if (!r.sku_id) continue
    ;(inMachines[r.sku_id] ||= new Set()).add(r.machine_id)
  }

  const byFr = {}
  for (const s of skus) (byFr[s.franchise] ||= []).push(s)

  const frKeys = Object.keys(byFr).sort(
    (x, y) => (ORDER.indexOf(x) + 1 || 99) - (ORDER.indexOf(y) + 1 || 99))

  const lines = []
  for (const fr of frKeys) {
    const list = byFr[fr].sort((a, b) => a.sku_id.localeCompare(b.sku_id, "en"))
    const langs = [...new Set(list.map(s => LANG_LABEL[s.language] || s.language).filter(Boolean))]
    const head = `${FRANCHISE_LABEL[fr] || fr} — ${list.length} รายการ` +
      (langs.length ? ` · ซอง${langs.join("/")}` : "")

    // กางรายละเอียดเฉพาะค่ายที่โพสต์นี้พูดถึง ค่ายอื่นย่อไว้กัน prompt บวม
    if (focus && fr !== focus) {
      lines.push(`${head}: ${list.map(s => s.set_code || s.sku_id).join(" · ")}`)
      continue
    }
    lines.push(head)
    for (const s of list) {
      const n = inMachines[s.sku_id]?.size || 0
      lines.push(`  ${s.name}` + (s.set_code ? ` [${s.set_code}]` : "") +
        (n ? ` · มีในตู้ ${n} ตู้` : " · ยังไม่ได้ลงตู้ตอนนี้"))
    }
  }

  const total = skus.length
  return "\n━━━ สินค้าทั้งหมดที่เราขายจริง (" + total + " รายการ) ━━━\n" +
    lines.join("\n") +
    "\n\n⚠️ นี่คือรายการทั้งหมด — **ห้ามเอ่ยถึงสินค้า ชุด รุ่น หรือเวอร์ชันที่ไม่อยู่ในนี้**\n" +
    "ห้ามเปรียบเทียบกับของที่เราไม่ได้ขาย · ห้ามบอกว่ามีของเก่า ของคลาสสิก ของสะสมหายาก " +
    "หรือชุดพิเศษ ถ้ามันไม่อยู่ในรายการข้างบน\n" +
    "ถ้าอยากเขียนแนวเปรียบเทียบ ให้เทียบระหว่างสินค้าที่มีอยู่จริงในรายการนี้เท่านั้น\n" +
    "สินค้าที่ขึ้นว่า \"ยังไม่ได้ลงตู้ตอนนี้\" ห้ามชวนลูกค้าไปกดที่ตู้ — พูดถึงได้แต่ต้องไม่สัญญาว่ามี\n"
}

export default { catalogueBlock }
