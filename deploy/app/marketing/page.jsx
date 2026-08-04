"use client"
// /marketing — Marketing OS console (เฟส 1+2)
// แยก route ออกจาก DivisionXApp.jsx ที่ใหญ่มากอยู่แล้ว แต่ใช้ auth เดียวกัน (admin เท่านั้น)
import MarketingOS from "../../components/MarketingOS"

export default function MarketingPage() {
  return <MarketingOS />
}
