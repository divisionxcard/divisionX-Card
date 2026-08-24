// เดาว่าข้อความนี้พูดถึงการ์ดค่ายไหน — ใช้ร่วมกันทุกที่ ห้ามก๊อปไปวางซ้ำ
//
// ⚠️ ทำไมต้องมีไฟล์กลาง: โปรเจกต์นี้เคยเจ็บมาแล้วกับ SKU mapper ที่ถูกก๊อป
//    ไปวางใน 6 ไฟล์ แล้วแก้ไม่ครบจนยอดขายไปรวมกับ SKU ผิดตัวแบบเงียบ ๆ
//    (ดู skill dvx-sku) — ตัวเดานี้จะไม่ซ้ำรอยนั้น
//
// เคสที่ทำให้ต้องมี (24 ส.ค. 2026):
//   โปสเตอร์แคปชั่นโปเกมอน #PokemonTCG แต่ซองในภาพเป็น One Piece ทั้งสามซอง
//   เพราะตอนคอนเทนต์ไม่ผูก SKU ระบบหยิบ "3 SKU ขายดีที่สุด" มาเป็นรูปอ้างอิง
//   ซึ่งเป็น One Piece หมด (OP คือ 22 จาก 47 SKU และครองอันดับขายดี)
//   โมเดลจึงลอกซอง One Piece มาวางบนโพสต์โปเกมอน

// เรียงจากเจาะจงไปกว้าง — ตัวแรกที่ตรงชนะ
// (Solo Leveling ต้องมาก่อน generic เพราะคำว่า "การ์ด" อยู่ในทุกโพสต์)
const HINTS = [
  ["OP",   /one\s*piece|onepiece|วันพีซ|วันพีช|ลูฟี่|โซโล่?จัง|โซโร|เอซ|ชานุกส์|กol?d\s*roger/i],
  ["PKM",  /pok[eé]mon|โปเกมอน|โปเกม่อน|ปิกาจู|ปิกาชู|พิคาชู|อีวุย/i],
  ["DB",   /dragon\s*ball|dragonball|ดราก้อน\s*บอล|fusion\s*world|โกคู|เบจิต้า|โกฮัง|ฟรีเซอร์/i],
  ["YGH",  /yu-?gi-?oh|yugioh|ยูกิโอ|ยูกิ|遊戯王|บลูอายส์|แบล็ค\s*เมจิเชียน/i],
  ["NRT",  /naruto|นารูโตะ|นารุโตะ|ซาสึเกะ|อุซึมากิ|คาคาชิ/i],
  ["SL",   /solo\s*level|โซโล\s*เลเวล|union\s*arena|ยูเนียน\s*อารีน่า|ซองจินอู/i],
  ["MLP",  /my\s*little\s*pony|ลิตเติ้ล\s*โพนี่|โพนี่/i],
  ["MLBB", /mobile\s*legends|mlbb|โมบาย\s*เลเจนด์/i],
  ["TF",   /transformers|ทรานส์ฟอร์เมอร์|ออโต้บอท/i],
]

/**
 * @param {...string} texts ข้อความที่จะตรวจ (แคปชั่น · ชื่อไอเดีย · หัวข้อ)
 * @returns {string|null} รหัสค่ายตาม skus.franchise หรือ null ถ้าเดาไม่ออก
 */
export function detectFranchise(...texts) {
  const t = texts.filter(Boolean).join(" ")
  if (!t.trim()) return null
  return HINTS.find(([, re]) => re.test(t))?.[0] || null
}

/** ชื่อที่คนไทยเรียก — ใช้เขียนลงบรีฟให้โมเดลเข้าใจว่าโพสต์นี้เรื่องอะไร */
export const FRANCHISE_LABEL = {
  OP: "One Piece Card Game",
  PKM: "Pokémon TCG",
  DB: "Dragon Ball Super Card Game Fusion World",
  YGH: "Yu-Gi-Oh! OCG",
  NRT: "Naruto (KAYOU)",
  SL: "UNION ARENA — Solo Leveling",
  MLP: "My Little Pony (KAYOU)",
  MLBB: "Mobile Legends (KAYOU)",
  TF: "Transformers (KAYOU)",
}

export default { detectFranchise, FRANCHISE_LABEL }
