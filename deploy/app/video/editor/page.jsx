"use client"
// /video/editor — ห้องตัดต่อบนเว็บ (ตัวจริงอยู่ components/edit/EditStudio) · 23 ต.ค. 2026
// ?id=e-… = เปิดร่างงานเดิมมาแก้ต่อ (ร่างอยู่ Storage marketing/video-edits/)
// ห้องแก้คลิปที่เรนเดอร์ในเครื่อง (ของเดิมที่เคยอยู่ path นี้) ย้ายไป /video/local-editor
//
// ต้องห่อ <Suspense> เพราะ useSearchParams ใน App Router บังคับ — ไม่ห่อแล้ว next build พังตอน prerender
import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import EditStudio from "../../../components/edit/EditStudio"

function Shell() {
  const q = useSearchParams()
  // อ่าน id ครั้งเดียวตอนเปิดหน้า — ห้องเขียน ?id= ลง URL เองหลังบันทึกครั้งแรก (history.replaceState)
  // ซึ่ง Next 14.1+ ส่งต่อให้ useSearchParams ด้วย ถ้าผูกตามค่าล่าสุด ห้องจะโหลดใหม่ทั้งห้องกลางงาน (ประวัติย้อนกลับหาย)
  // เปิดร่างอื่น = ลิงก์ธรรมดา (โหลดหน้าใหม่) จึงไม่ต้องตาม
  const [id] = useState(() => q.get("id"))
  return <EditStudio editId={id && /^e-[a-z0-9-]{4,40}$/.test(id) ? id : null} />
}

export default function VideoEditorPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#081228", color: "#8aa2c8", display: "grid", placeItems: "center" }}>
        กำลังเปิดห้องตัดต่อ…
      </div>
    }>
      <Shell />
    </Suspense>
  )
}
