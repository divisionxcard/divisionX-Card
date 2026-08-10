// /marketing ใช้โทนสว่าง ต่างจากส่วนอื่นของเว็บที่เป็นกรมท่า (เจ้าของขอ 2026-08-10)
//
// ธีมมืดทั้งเว็บมาจาก <body className="dx-theme"> ใน app/layout.jsx ซึ่งเป็น server
// component — เปลี่ยนตาม path ไม่ได้ จึงต้องถอดคลาสฝั่ง client
//
// <script> ตรงนี้รันตั้งแต่เบราว์เซอร์ parse ถึงบรรทัดนี้ คือ "ก่อน" เนื้อหาข้างล่าง
// จะถูกวาด → ไม่เห็นจอวาบมืดแวบนึงก่อนเปลี่ยนเป็นสว่าง
// ส่วนการคืนคลาสตอนออกจากหน้าอยู่ใน theme.jsx (ดูเหตุผลในนั้น)
import MarketingTheme from "./theme"

export default function MarketingLayout({ children }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: 'document.body.classList.remove("dx-theme")' }} />
      <MarketingTheme />
      {children}
    </>
  )
}
