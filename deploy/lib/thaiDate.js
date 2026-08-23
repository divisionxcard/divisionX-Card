// วันที่ตามเวลาไทย — ใช้ร่วมกันระหว่าง API ปฏิทินกับหน้าปฏิทิน
//
// ทำไมต้องอยู่ไฟล์เดียว: ทั้งสองฝั่งต้องตัดวันด้วยกฎเดียวกันเป๊ะ ๆ ไม่งั้นวันเหลื่อมกัน
// เช่น API จัดโพสต์ไว้วันที่ 8 แต่หน้าเว็บวาดช่องวันที่ 7 → คนกดหาไม่เจอ
// ถ้าก๊อปโค้ดไปวางสองที่ พอแก้ทีหลังจะแก้ไม่ครบแล้วเหลื่อมกันเงียบ ๆ
//
// posted_at / scheduled_at เก็บเป็น timestamptz (UTC) แต่คนไทยอ่านปฏิทินตามเวลาไทย
// โพสต์ตี 1 ของวันที่ 8 (ไทย) = 18:00 UTC ของวันที่ 7 → ถ้าตัดวันด้วย UTC จะไปโผล่วันที่ 7
// ไทยไม่มี DST เลยบวกค่าคงที่ 7 ชม. ได้เลย ไม่ต้องใช้ตาราง timezone

export const TH_OFFSET_MS = 7 * 60 * 60 * 1000

/** 'YYYY-MM-DD' ตามเวลาไทย · รับได้ทั้ง ISO string และ Date · ค่าที่ใช้ไม่ได้คืน null */
export function thaiDay(input) {
  if (!input) return null
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t + TH_OFFSET_MS).toISOString().slice(0, 10)
}

/** 'YYYY-MM' ของวันนี้ตามเวลาไทย */
export const thaiMonthNow = () => thaiDay(new Date()).slice(0, 7)

/**
 * 'DD/MM HH:mm' ตามเวลาไทย — ใช้กับป้ายบอกเวลา sync ล่าสุด
 *
 * ⚠️ ห้ามเอา ISO string มา .slice() แล้วโชว์ตรง ๆ — นั่นคือเวลา UTC
 *    เคสจริง 24 ส.ค. 2026: ป้ายเขียน 'VMS · 2026-08-23 18:07' ขณะที่นาฬิกาบนหน้าจอ
 *    เขียน '24 ส.ค. 01:10' ต่างกัน 7 ชม.พอดี เจ้าของเลยนึกว่าซิงค์ไม่อัปเดต
 *    ทั้งที่อัปเดตไปแล้วจริง ๆ
 */
export function thaiDateTime(input, { withYear = false } = {}) {
  if (!input) return null
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime()
  if (Number.isNaN(t)) return null
  const d = new Date(t + TH_OFFSET_MS)
  const iso = d.toISOString()
  const [y, m, day] = iso.slice(0, 10).split("-")
  return `${day}/${m}${withYear ? `/${y}` : ""} ${iso.slice(11, 16)} น.`
}

/** ขอบเดือนตามเวลาไทย → ISO (UTC) ที่เอาไปเทียบกับคอลัมน์ timestamptz ได้ตรง ๆ */
export function monthRange(month) {
  const [y, m] = month.split("-").map(Number)
  const from = new Date(Date.UTC(y, m - 1, 1) - TH_OFFSET_MS).toISOString()
  const to = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - TH_OFFSET_MS).toISOString()
  return { from, to }
}

/** ช่องทั้งหมดของตารางเดือน เริ่มสัปดาห์วันจันทร์ · null = ช่องว่างหัว/ท้ายแถว */
export function monthCells(month) {
  const [y, m] = month.split("-").map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  // getUTCDay(): 0=อาทิตย์ · ปฏิทินไทยเริ่มวันจันทร์ จึงเลื่อนฐาน
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const cells = new Array(lead).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`)
  while (cells.length % 7) cells.push(null)
  return cells
}

/** เลื่อนเดือน — ข้ามปีให้ถูกต้อง */
export function shiftMonth(month, by) {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/** เวลาที่จะเก็บลง scheduled_at เมื่อคนเลือก "วัน" จากปฏิทิน
 *  ตรึงไว้ 10:00 น. ไทย — ปฏิทินสนใจแค่วัน แต่คอลัมน์เป็น timestamptz
 *  ถ้าเก็บเที่ยงคืนไทย (= 17:00 UTC ของวันก่อนหน้า) เวลาเปิดดูใน DB ตรง ๆ จะงงว่าทำไมวันไม่ตรง
 */
export const scheduleAt = (day) =>
  day ? new Date(new Date(`${day}T10:00:00Z`).getTime() - TH_OFFSET_MS).toISOString() : null
