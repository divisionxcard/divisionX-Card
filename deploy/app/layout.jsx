import "./globals.css"

// ค่าเริ่มต้นของทุกหน้าที่ไม่ตั้งเอง — รวมหน้าล็อกอิน "/" ที่คนนอกอาจได้ลิงก์ไปเปิด (แท็บเบราว์เซอร์ · ตัวอย่างลิงก์ในแชต)
// จึงไม่บอกว่าข้างในเป็นระบบหลังบ้าน (เจ้าของขอ 17 ต.ค. 2026 · เดิม "ระบบจัดการสต็อกและวิเคราะห์ยอดขาย")
// หน้าสาธารณะ /branches /stock /how-to /products ตั้ง title ของตัวเองอยู่แล้ว
export const metadata = {
  title: "DivisionX Card",
  description: "DivisionX Card — ตู้กดการ์ดเกมอัตโนมัติ",
}

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body className="dx-theme">{children}</body>
    </html>
  )
}
