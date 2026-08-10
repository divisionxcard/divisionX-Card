"use client"
import { useLayoutEffect } from "react"

/** ถอดธีมมืดออกตอนอยู่หน้า /marketing แล้วใส่คืนตอนออกจากหน้า
 *
 *  ทำไมต้องมีทั้งตัวนี้และ <script> ใน layout.jsx — มันแก้คนละจังหวะ:
 *    · <script> ทำงานตอนเบราว์เซอร์ parse HTML รอบแรก (กันจอวาบมืดก่อน React ทำงาน)
 *    · ตัวนี้ทำงานตอนเปลี่ยนหน้าฝั่ง client ซึ่ง React ไม่รัน script ที่ฝังไว้แบบนั้นให้
 *      และที่สำคัญกว่า — คืนคลาสให้ตอนออกจากหน้า ไม่งั้นกดกลับหน้าหลักแล้วจะขาวทั้งเว็บ
 */
export default function MarketingTheme() {
  useLayoutEffect(() => {
    const had = document.body.classList.contains("dx-theme")
    document.body.classList.remove("dx-theme")
    return () => { if (had) document.body.classList.add("dx-theme") }
  }, [])
  return null
}
