// หา SKU จากข้อความแคปชั่น — เดาเองเมื่อมั่นใจ ถามเมื่อไม่มั่นใจ
//
// ⚠️ ทำไมต้องมี (27 ส.ค. 2026):
//   คอนเทนต์ #40 เขียนถึง "Pokémon M5 Abyss Eye [M5]" ชัดเจน แต่ source_sku ว่าง
//   → ตอนสร้างโปสเตอร์ ระบบไม่รู้ว่าต้องใช้ซองไหนเป็นภาพอ้างอิง
//
// ⚠️ ทำไมไม่เดาให้หมดทุกกรณี:
//   รูปซองถูกส่งให้โมเดลภาพเป็น "ภาพอ้างอิงที่ต้องลอกตรง ๆ ห้ามวาดใหม่"
//   เดาผิด = ได้โปสเตอร์ที่โชว์สินค้าผิดตัวแบบดูดีมาก จนไม่มีใครเอะใจ
//   → เจอหลายตัวเมื่อไหร่ ต้องคืน ambiguous ให้คนเลือก ไม่ใช่หยิบตัวแรก
//
// วัดกับแคปชั่นจริง 34 ชิ้น: มั่นใจ 38% · กำกวม 15% · ไม่เจอ 47%
// ที่มั่นใจ ตรงกับที่คนผูกไว้ 7/7 ไม่ขัดกันเลยสักครั้ง
// (สคริปต์วัด: scratchpad/test_skudetect.mjs — คืน exit 1 ถ้ามีเคสขัดกัน)

/** ยุบให้เทียบได้ข้ามรูปแบบการเขียน — 'OP-17' 'OP 17' 'op17' → 'op17' */
function norm(s) {
  return String(s || "").replace(/[\s\-_.]/g, "").toLowerCase()
}

// รหัสชุดที่คนเขียนใช้จริงในแคปชั่น
const PATTERNS = [
  /\[([A-Za-z]{1,4}[-\s]?\d{1,3}[a-z]?)\]/g,                     // [M5] [OP-17] [M2a]
  /\b((?:OP|EB|PRB|FB|UA|HOD|SEA|BP)[-\s]?\d{1,3})\b/gi,         // OP-17 · FB09 · PRB 02
  /\b(M\d[a-z]?)\b/g,                                            // M5 · M2a (Pokémon)
]

// รายการย่อแบบมีสแลช — "OP13/15/16" หมายถึงสามชุด ไม่ใช่ชุดเดียว
//
// ⚠️ ถ้าไม่กางออก regex ปกติจะจับได้แค่ OP13 แล้วบอกว่า "มั่นใจ" ทั้งที่แคปชั่น
//    พูดถึงสามตัว → ระบบจะไปหยิบซอง OP13 มาทำโปสเตอร์ให้โพสต์ที่พูดถึงสามชุด
//    เจอจริงกับคอนเทนต์ #8 ตอนทดสอบ
const SLASH_LIST = /\b([A-Za-z]{2,4})[-\s]?(\d{1,3})((?:\s*\/\s*\d{1,3})+)/g

function expandSlashLists(text) {
  const extra = []
  for (const m of String(text || "").matchAll(SLASH_LIST)) {
    const prefix = m[1]
    for (const n of (m[2] + m[3]).match(/\d{1,3}/g) || []) extra.push(prefix + n)
  }
  return extra.length ? `${text} ${extra.join(" ")}` : String(text || "")
}

/**
 * หา SKU ที่แคปชั่นพูดถึง
 *
 * @param {string} text แคปชั่นเต็ม
 * @param {Array<{sku_id:string,name:string,set_code:string,franchise:string}>} skus
 *        SKU ที่ยัง is_active — ผู้เรียกดึงมาเอง (ฟังก์ชันนี้ไม่แตะฐานข้อมูล)
 * @returns {{status:"sure"|"ambiguous"|"none", matches:Array, hint:string}}
 */
export function detectSku(text, skus = []) {
  const t = expandSlashLists(text)
  const byCode = new Map()
  for (const s of skus) {
    if (!s?.set_code) continue
    const k = norm(s.set_code)
    if (!byCode.has(k)) byCode.set(k, [])
    byCode.get(k).push(s)
  }

  const seen = new Set()
  const hits = []
  for (const re of PATTERNS) {
    re.lastIndex = 0
    for (const m of t.matchAll(re)) {
      for (const s of byCode.get(norm(m[1])) || []) {
        if (!seen.has(s.sku_id)) { seen.add(s.sku_id); hits.push(s) }
      }
    }
  }

  // ไม่เจอรหัสชุด → ลองชื่อเต็มของสินค้า (เช่น "Pokemon Ninja")
  if (!hits.length) {
    const nt = norm(t)
    for (const s of skus) {
      if (s?.name && norm(s.name).length >= 6 && nt.includes(norm(s.name))) {
        if (!seen.has(s.sku_id)) { seen.add(s.sku_id); hits.push(s) }
      }
    }
  }

  if (hits.length === 1) {
    return { status: "sure", matches: hits,
             hint: `แคปชั่นเอ่ยถึง ${hits[0].set_code || hits[0].name} ชัดเจนตัวเดียว` }
  }
  if (hits.length > 1) {
    return { status: "ambiguous", matches: hits,
             hint: `แคปชั่นเอ่ยถึง ${hits.length} ชุด — เลือกเองว่าจะใช้ซองไหนทำภาพ: ` +
                   hits.map(h => h.sku_id).join(" · ") }
  }
  return { status: "none", matches: [],
           hint: "แคปชั่นไม่ได้เอ่ยชื่อชุดไหนเจาะจง — ภาพจะใช้ตู้จริงเป็นตัวเอกแทน" }
}

export default { detectSku }
