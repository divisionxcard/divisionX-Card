// ตรวจข้อความไทยก่อนบันทึก — กันอักษรที่ "หน้าตาเหมือนไทย แต่ไม่ใช่ไทย"
//
// ⚠️ เคสจริง 27 ส.ค. 2026 — คอนเทนต์ #40 หลังกดเขียนใหม่ได้แคปชั่น:
//       "อยากฟังสຽງฉีกซองดังกร๊อบ..."
//    คำที่ถูกคือ "เสียง" แต่โมเดลสะกดด้วย **อักษรลาว 2 ตัว**:
//       ຽ  U+0EBD  LAO SEMIVOWEL SIGN NYO
//       ງ  U+0E87  LAO LETTER NGO
//
//    อันตรายเพราะบล็อกลาว (U+0E80-U+0EFF) อยู่ติดกับไทย (U+0E00-U+0E7F) พอดี
//    รูปร่างจึงคล้ายกันมากจนตาคนอ่านผ่าน และตัวตรวจเดิม looksThai() ก็ปล่อยผ่าน
//    เพราะมันนับแค่ "ตัวไทยพอไหม" กับ "CJK เยอะกว่าไหม" — ลาวไม่เข้าเงื่อนไขไหนเลย
//
//    ถ้าหลุดไปโพสต์จะดูเหมือนพิมพ์ผิดธรรมดา และถ้าเอาไปให้ AI วาดบนภาพ
//    มันจะวาดตามที่เห็น กลายเป็นป้ายที่สะกดผิดถาวรบนโปสเตอร์

// บล็อกอักษรที่หน้าตาใกล้ไทยจนสับสนได้ — ต้องไม่มีเลยในข้อความของเรา
const CONFUSABLE = [
  { name: "ลาว", re: /[຀-໿]/g },
  { name: "เขมร", re: /[ក-៿]/g },
  { name: "พม่า", re: /[က-႟]/g },
]

/**
 * หาอักขระต่างภาษาที่ปนอยู่ในข้อความไทย
 *
 * @param {string} text
 * @returns {Array<{script:string, ch:string, code:string, at:number, context:string}>}
 *          ว่าง = สะอาด
 */
export function findForeignChars(text) {
  const s = String(text || "")
  const out = []
  for (const { name, re } of CONFUSABLE) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(s)) !== null) {
      out.push({
        script: name,
        ch: m[0],
        code: "U+" + m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0"),
        at: m.index,
        context: s.slice(Math.max(0, m.index - 10), m.index + 10).replace(/\n/g, " "),
      })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * ข้อความนี้ใช้ได้ไหม — คืน null ถ้าผ่าน หรือข้อความอธิบายถ้าไม่ผ่าน
 *
 * ⚠️ ตั้งใจให้ข้อความ error บอก "ตัวไหน ตรงไหน" ไม่ใช่แค่ "ไม่ผ่าน"
 *    เพราะอักขระพวกนี้มองด้วยตาไม่ออก คนแก้ต้องรู้ว่าจะไปแก้ตรงไหน
 */
export function checkThaiCaption(text) {
  const bad = findForeignChars(text)
  if (!bad.length) return null
  const scripts = [...new Set(bad.map(b => b.script))].join(" · ")
  const sample = bad.slice(0, 3)
    .map(b => `'${b.ch}' (${b.code}) ที่ "…${b.context}…"`)
    .join("  ·  ")
  return `พบอักษร${scripts}ปนในข้อความไทย ${bad.length} ตัว — ${sample}`
}

export default { findForeignChars, checkThaiCaption }
