// แฮชแท็กชื่อเพจ — ทุกโพสต์ต้องมี #DivisionXCard (เจ้าของสั่ง 10 ต.ค. 2026)
//
// ทำไมต้องเป็นโค้ด ไม่ใช่แค่กฎใน prompt:
//   คำว่า #DivisionXCard เคยอยู่ในตัวอย่างโพสต์ (content_voice.json → example) ที่เดียว
//   ซึ่งถูกปิดไว้สำหรับรูปแบบที่มีโครงเอง → #52/#53 (ส่อง 5 ใบเด็ด) ไม่มีเลย
//   แต่ถึงตัวอย่างอยู่ครบ AI ก็ยังลืมได้ (#33 · #47 ซึ่ง #47 ขึ้นเพจไปแล้วโดยไม่มี)
//   → กฎในข้อความช่วยให้ AI วางเองตั้งแต่แรก · ฟังก์ชันนี้คือตัวรับประกัน
//
// ใช้กับ: ตอน AI เขียนเสร็จ · ตอนคนแก้/สร้างเอง · ตอนกดอนุมัติ · ตอนแปลงไป IG/TikTok
//        · และด่านสุดท้ายก่อนโพสต์ขึ้นเพจ (publishContent.js) ซึ่งครอบโพสต์ที่ค้างคิวอยู่แล้วด้วย
//
// ตำแหน่ง:
//   - มีแถวแฮชแท็ก → วางหน้าสุดของแถว เหมือนที่ทีมทำบนเพจมาตลอด (37 จาก 50 โพสต์)
//   - แท็กเขียนต่อท้ายประโยค → ต่อท้ายแท็กตัวสุดท้าย (ไม่แทรกหน้า — ดูข้อ 2 ข้างล่าง)
//   - ไม่มีแฮชแท็กเลย → ขึ้นแถวใหม่ท้ายโพสต์
// ⚠️ มีแท็กอยู่แล้วต้องไม่เพิ่มบรรทัด — ส่อง 5 ใบเด็ดจำกัด 18 บรรทัด และตัวตรวจ Hermes นับบรรทัดจริง

export const BRAND_TAG = "#DivisionXCard"

// LINE ไม่ใช้แฮชแท็ก · สคริปต์วิดีโอถูกอ่านออกเสียงทุกบรรทัด → ไม่เติมให้
export const TAGGED_PLATFORMS = new Set(["fb", "ig", "tiktok"])

// ตัวพิมพ์เล็ก/ใหญ่ต่างกัน หรือ ＃ ตัวเต็ม ถือว่ามีแล้ว (แค่จัดตัวสะกดให้ตรง)
// แต่ #DivisionXCardTH ไม่นับ (แท็กคนละอัน) · ท้ายลิงก์ (https://…/#DivisionXCard) ก็ไม่นับ
// ⚠️ ตัดสินทีละคำ (คั่นด้วยช่องว่าง) แล้วข้ามคำที่เป็นลิงก์ — ห้ามใช้ lookbehind แบบ (?<![/\w])
//    ร่างก่อนใช้แล้วพลาด: "#1#divisionxcard" ไม่ถูกนับ → เติมแท็กแบรนด์พร้อมเว้นวรรค →
//    ตัวเดิมกลายเป็นแท็กจริงไปด้วย = ได้ 2 อัน และเรียกรอบสองแล้วผลเปลี่ยน (ตัวสุ่มทดสอบเจอ 62/200,000)
const BRAND_IN = /[#＃]divisionxcard(?![\p{L}\p{M}\p{N}_])/iu
const BRAND_IN_ALL = /[#＃]divisionxcard(?![\p{L}\p{M}\p{N}_])/giu
const isUrl = (w) => w.includes("://") || /^www\./iu.test(w)
const normaliseBrand = (s) => s.split(/(\s+)/u)
  .map(w => (isUrl(w) ? w : w.replace(BRAND_IN_ALL, BRAND_TAG))).join("")

// แท็กจริงต้องมีตัวอักษร — "#1" ในรายการจัดอันดับไม่ใช่แฮชแท็ก · ＃ ตัวเต็มนับเป็น # ด้วย
const TAG = /[#＃][^\s#＃]*\p{L}[^\s#＃]*/u
const TAGS_ALL = /[#＃][^\s#＃]+/gu
// คำเดียวที่เป็นแท็ก (ติดกันหลายอันได้ เช่น #OnePiece#OP17) — แยกด้วย split ไม่ใช้ regex
// แบบมี $ ปิดท้าย เพราะคำยาว ๆ ที่ไม่เข้าเงื่อนไขทำให้ regex นั้นย้อนรอยแบบกำลังสอง
const isTagWord = (w) => /^[#＃]/u.test(w) && w.slice(1).split(/[#＃]/u).every(seg => /\p{L}/u.test(seg))

// ปุ่มตัวเลขอีโมจิ (1️⃣ #️⃣) มีตัวเลขซ่อนอยู่ข้างใน — ลบทิ้งก่อนตรวจว่าเหลือข้อความไหม
const KEYCAP = /[0-9#*]\u{FE0F}?\u{20E3}/gu

// มีตัวหนังสือหรือตัวเลข = ข้อความ · ไม่มีเลย = ของตกแต่ง (อีโมจิ ธง ★ ♡ / | · ฯลฯ)
// ⚠️ อย่าเปลี่ยนเป็นรายชื่ออีโมจิที่ยอมรับ — ร่างแรกใช้ \p{Extended_Pictographic} + ตัวคั่นไม่กี่ตัว
//    แล้วพลาดธง 🇯🇵 · สีผิว 🙏🏻 · ★ ♡ · ตัวคั่น "/" → แถวแท็กไม่ถูกนับ แท็กแบรนด์หลุดไปขึ้นย่อหน้าใหม่
const WORDY = /[\p{L}\p{N}]/u
const isDecor = (s) => !WORDY.test(s.replace(KEYCAP, ""))

// บรรทัดแฮชแท็ก = มีแท็กจริง และพอลบแท็กออกแล้วเหลือแต่ของตกแต่ง
const isTagLine = (l) => TAG.test(l) && isDecor(l.replace(KEYCAP, "").replace(TAGS_ALL, ""))

// ตัวคั่นระหว่างแท็กที่ใช้ซ้ำได้ ("#A / #B" → "#DivisionXCard / #A / #B")
const SEPARATOR = /^\s*[/|·•,、，｜]\s*$/u

// ดูแค่ท้ายโพสต์ — แท็กที่โผล่กลางเนื้อ (หัวข้อ/ตัวเน้น) ไม่ใช่แถวแฮชแท็กของโพสต์
const TAIL_LINES = 3

export function wantsBrandTag(platform) {
  return TAGGED_PLATFORMS.has(String(platform || "fb").toLowerCase())
}

export function hasBrandTag(caption) {
  return String(caption ?? "").split(/\s+/u).some(w => !isUrl(w) && BRAND_IN.test(w))
}

// คืนแคปชั่นที่มี #DivisionXCard แน่นอน · เรียกซ้ำกี่รอบก็ได้ผลเดิม · ไม่ลบ/สลับตัวอักษรเดิม
export function ensureBrandTag(caption, platform = "fb") {
  if (typeof caption !== "string" || !caption.trim() || !wantsBrandTag(platform)) return caption
  if (hasBrandTag(caption)) return normaliseBrand(caption)

  // trimEnd ไม่ใช่ /\s+$/ — regex ตัวนั้นช้าแบบกำลังสองเมื่อเจอช่องว่างยาว ๆ กลางข้อความ
  const lines = caption.trimEnd().split("\n")
  const nl = caption.includes("\r\n") ? "\r\n" : "\n"   // ขึ้นบรรทัดแบบเดียวกับต้นฉบับ

  // 1) มีแถวแฮชแท็กอยู่ท้ายโพสต์ → แทรกหน้าแท็กตัวแรกของแถวนั้น
  for (let i = lines.length - 1, seen = 0; i >= 0 && seen < TAIL_LINES; i--) {
    if (!lines[i].trim()) continue
    seen++
    if (!isTagLine(lines[i])) continue
    const row = lines[i]
    const first = row.match(TAG)
    const rest = row.slice(first.index + first[0].length)
    const next = rest.search(TAG)
    const gap = next > 0 ? rest.slice(0, next) : ""
    const joiner = SEPARATOR.test(gap) ? gap : " "
    // ข้างหน้าไม่ใช่ช่องว่าง (เช่น "#2#OP17" หรือ "🔥#OP17") → เว้นวรรคก่อน แท็กแบรนด์จะได้เป็นแท็กแยกของมันเอง
    const before = row.slice(0, first.index)
    const pad = before && !/\s$/u.test(before) ? " " : ""
    lines[i] = before + pad + BRAND_TAG + joiner + row.slice(first.index)
    return lines.join("\n")
  }

  // 2) บรรทัดสุดท้ายจบด้วยแท็กที่เขียนต่อท้ายประโยค ("ลุ้นกัน #OnePiece #OP17 🔥" — เจอบ่อยใน TikTok)
  //    → ต่อท้ายแท็กตัวสุดท้าย (อีโมจิท้ายบรรทัดอยู่ที่เดิม)
  //    ⚠️ ไม่แทรกหน้าชุดแท็กเหมือนข้อ 1 — แท็กกลางประโยคอาจเป็นตัวเลือกให้โหวต
  //       "คอมเมนต์ #ทีมลูฟี่ หรือ #ทีมโซโล" แทรกหน้าแล้วกลายเป็น "หรือ #DivisionXCard #ทีมโซโล"
  //    ⚠️ ไล่ทีละคำ ห้ามใช้ regex แบบ (แท็ก+ช่องว่าง)+$ — quantifier ซ้อนกันย้อนรอยแบบทวีคูณ
  //       ร่างแรกวัดจริง 8 แท็ก 0.9 วิ · 10 แท็ก 56 วิ · 12 แท็กเกิน 60 วิ = ค้างทั้งหน้าเว็บและตัวโพสต์
  const last = lines.length - 1
  const words = lines[last].split(/(\s+)/u)        // วงเล็บ = เก็บช่องว่างไว้ ต่อกลับได้เหมือนเดิม
  for (let j = words.length - 1; j >= 0; j--) {
    const w = words[j]
    if (!w.trim()) continue
    if (isTagWord(w)) {
      words.splice(j + 1, 0, " ", BRAND_TAG)
      lines[last] = words.join("")
      return lines.join("\n")
    }
    if (!isDecor(w)) break                          // เจอข้อความก่อนเจอแท็ก = บรรทัดนี้ไม่ได้จบด้วยแท็ก
  }

  // 3) ไม่มีแฮชแท็กเลย → ขึ้นแถวใหม่ท้ายโพสต์
  return `${lines.join("\n")}${nl}${nl}${BRAND_TAG}`
}
