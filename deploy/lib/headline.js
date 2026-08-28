// ตัดแคปชั่นให้เป็นพาดหัวสั้น + บรรทัดรอง ก่อนส่งให้โมเดลภาพเขียนลงโปสเตอร์
//
// ⚠️ ทำไมต้องมี (27 ส.ค. 2026):
//   เดิมส่งบรรทัดแรกของแคปชั่นทั้งดุ้นไปเป็น "Headline text to place"
//   วัดจากคิวจริง 20 ชิ้น: เฉลี่ย 77 ตัวอักษร ยาวสุด 108
//   ยัดลงกรอบ 1024x1024 แล้วตัวหนังสือต้องเล็กจนอ่านยาก และผิดกฎแบรนด์ตัวเอง
//   ที่เขียนว่าพาดหัวไม่เกิน 2 บรรทัด กับตัวอักษรหลักต้องใหญ่พอ
//
// ⚠️ และยิ่งข้อความยาว ความเสี่ยงที่โมเดลสะกดไทยเพี้ยนยิ่งสูง
//   ซึ่งเป็นข้อได้เปรียบเดียวที่ทำให้เลิกใช้เทมเพลตได้ — ไม่ควรเอาไปทิ้ง
//
// ⚠️ ภาษาไทยไม่เว้นวรรคระหว่างคำ แต่เว้นวรรคที่ขอบวลี
//   → "ไทย เว้นวรรค ไทย" คือจุดตัดที่ปลอดภัย
//   → "One Piece" มีอังกฤษประกบสองข้าง จึงไม่มีวันถูกตัดกลาง
//   (บทเรียนเดียวกับ deploy/agents/poster_render.py → split_head)

export const HEAD_MAX = 30
export const SUB_MAX = 62

// ยอมยาวเกินเพดานได้ถึงตรงนี้ ถ้าการตัดตรงเพดานจะทำให้คำขาดกลาง
export const HEAD_HARD = 46

// สระบน/ล่าง วรรณยุกต์ และตัวการันต์ — พวกนี้เกาะตัวพยัญชนะข้างหน้า
// ตัดตรงหน้าตัวพวกนี้เมื่อไหร่ คำจะขาดครึ่งทันที ("อื่น" → "อื" + "่น")
const COMBINING = /[ัิ-ฺ็-๎]/

// สระหน้า เ แ โ ใ ไ — เขียนไว้ "ก่อน" พยัญชนะที่มันออกเสียงคู่ด้วย
// จบพาดหัวด้วยตัวพวกนี้เมื่อไหร่ คือทิ้งสระเดี่ยวห้อยไว้แล้วคำที่เหลือไปขึ้นบรรทัดรอง
// เจอจริงตอนทดสอบ: "...มากขึ้นเ" + "รื่อยๆ" ซึ่งอ่านไม่ออกทั้งสองฝั่ง
const LEADING_VOWEL = /[เ-ไ]/

// คำเชื่อมที่ถ้าขึ้นต้นวลีใหม่ ตัดตรงนั้นได้ความหมายครบ
//
// ⚠️ ต้องมีช่องว่างนำหน้าเสมอ — ไทยไม่เว้นวรรคระหว่างคำ ถ้าไม่บังคับ
//    "แต่" จะไปเจอตัวที่อยู่ข้างใน "ตั้งแต่" แล้วตัดกลางคำ
const CONJ = ["แต่", "เพราะ", "จนกว่า", "จนถึง", "แล้ว", "ถ้า", "หาก",
              "ซึ่ง", "จึง", "ก่อนที่", "หลังจาก", "พร้อม"]

const SEP = /[—–·:|…]/

function cut(s, limit) {
  const t = s.trim()
  if (t.length <= limit) return { head: t, rest: "" }

  // 1) ตัวคั่นชัดเจน — ผู้เขียนตั้งใจแบ่งความตรงนั้นอยู่แล้ว
  for (let i = Math.min(limit, t.length - 1); i > limit * 0.4; i--) {
    if (SEP.test(t[i])) {
      return { head: t.slice(0, i).trim(), rest: t.slice(i + 1).trim() }
    }
  }

  // 2) คำเชื่อมที่มีช่องว่างนำหน้า
  let best = -1
  for (const c of CONJ) {
    let from = 0
    for (;;) {
      const at = t.indexOf(" " + c, from)
      if (at < 0 || at > limit) break
      if (at > best && at > limit * 0.35) best = at
      from = at + 1
    }
  }
  if (best > 0) return { head: t.slice(0, best).trim(), rest: t.slice(best).trim() }

  // 3) ช่องว่างธรรมดา — ในภาษาไทยคือขอบวลี
  const sp = t.lastIndexOf(" ", limit)
  if (sp > limit * 0.35) return { head: t.slice(0, sp).trim(), rest: t.slice(sp).trim() }

  // 4) ไม่มีจุดตัดในเพดาน — ยืดไปหาช่องว่างถัดไปแทนการตัดตรง ๆ
  //
  // ⚠️ ห้ามตัดกลางคำไทยเด็ดขาด พาดหัวยาวเกินไปหน่อยยังอ่านรู้เรื่อง
  //    แต่ "ถึงกับ" ที่ขาดเป็น "ถึงก" + "ับ" อ่านไม่ออกเลย
  //    เจอจริงตอนทดสอบกับคิว 34 ชิ้น: #22 #26 #32 #34 #36 ขาดกลางคำหมด
  const next = t.indexOf(" ", limit)
  if (next > 0 && next <= HEAD_HARD) {
    return { head: t.slice(0, next).trim(), rest: t.slice(next).trim() }
  }

  // 5) ยาวทั้งดุ้นไม่มีช่องว่างเลย — ถอยจนจุดตัดไม่ผ่ากลางคำ
  //
  // ต้องพ้นทั้งสองแบบ:
  //   - t[i]   เป็นสระบน/ล่างหรือวรรณยุกต์ = มันเกาะตัวที่เพิ่งตัดไป
  //   - t[i-1] เป็นสระหน้า (เ แ โ ใ ไ) = พาดหัวจะจบด้วยสระลอย ๆ
  let i = Math.min(limit, t.length)
  while (i > 1 && (COMBINING.test(t[i] || "") || LEADING_VOWEL.test(t[i - 1]))) i--
  return { head: t.slice(0, i).trim(), rest: t.slice(i).trim() }
}

/**
 * @param {string} caption แคปชั่นเต็ม (ยังมีแฮชแท็กได้ ฟังก์ชันนี้ตัดให้เอง)
 * @returns {{headline:string, sub:string}} sub เป็น "" ได้ถ้าไม่มีอะไรเหลือ
 */
export function splitHeadline(caption) {
  const clean = String(caption || "").replace(/#\S+/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return { headline: "", sub: "" }

  const first = cut(clean, HEAD_MAX)
  const headline = first.head

  // บรรทัดรองมาจากส่วนที่เหลือของประโยคแรก ถ้าไม่มีค่อยไปเอาย่อหน้าถัดไป
  let subSource = first.rest
  if (!subSource) {
    const paras = String(caption || "").split("\n").map(s => s.trim()).filter(Boolean)
    subSource = (paras[1] || "").replace(/#\S+/g, " ").replace(/\s+/g, " ").trim()
  }
  const sub = subSource ? cut(subSource, SUB_MAX).head : ""

  return { headline, sub }
}

export default { splitHeadline, HEAD_MAX, SUB_MAX }
