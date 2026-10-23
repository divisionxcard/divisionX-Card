// /diary — ไดอารี่งานของเจ้าของ (เดิมเปิดได้แค่ผ่าน claude.ai · ย้ายมาบนเว็บ 24 ต.ค. 2026)
// ฟอนต์ชุดเดียวกับหน้าเดิม ผ่าน next/font = เสิร์ฟจากเว็บเราเอง (ไม่ต้องเพิ่ม Google Fonts ในหน้า /privacy)
// ไม่ให้เครื่องมือค้นหาเก็บ — เป็นสมุดส่วนตัว (ตัวหน้าเองก็ต้องล็อกอินแอดมินก่อนถึงจะเห็นเนื้อหา)
import { Anuphan, Bai_Jamjuree, JetBrains_Mono } from "next/font/google"
// สมุดมีธีมสว่าง/มืดของตัวเอง — ถอด dx-theme ของเว็บออก (ไม่งั้นช่องรหัสผ่าน/autofill โดนทาสีกรมท่าทับ) · ท่าเดียวกับ /marketing
import MarketingTheme from "../marketing/theme"

const body = Anuphan({ subsets: ["thai", "latin"], weight: ["400", "500", "600"], variable: "--df-body", display: "swap" })
const display = Bai_Jamjuree({ subsets: ["thai", "latin"], weight: ["500", "600", "700"], variable: "--df-display", display: "swap" })
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--df-mono", display: "swap" })

export const metadata = {
  title: "ไดอารี่งาน DivisionX",
  robots: { index: false, follow: false },
}

export default function DiaryLayout({ children }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: 'document.body.classList.remove("dx-theme")' }} />
      <MarketingTheme />
      <div className={`${body.variable} ${display.variable} ${mono.variable}`}>{children}</div>
    </>
  )
}
