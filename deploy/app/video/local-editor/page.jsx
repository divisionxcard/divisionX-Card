"use client"
// /video/local-editor — ห้องแก้คลิปที่เรนเดอร์ในเครื่อง (เดิมอยู่ /video/editor · ย้าย 23 ต.ค. 2026 ให้ห้องตัดต่อบนเว็บใช้ชื่อนั้น)
// ตัวจริงอยู่ components/editor/VideoEditor · ใช้ /api/video/local ซึ่งทำงานเฉพาะตอน dev บนเครื่อง
//
// ต้องห่อ <Suspense> เพราะ useSearchParams ใน App Router บังคับ — ไม่ห่อแล้ว
// next build จะพังทั้ง route ตอน prerender (de-opt ไม่ได้ถ้าไม่มี boundary)
// fallback เป็นพื้นกรมท่าเพื่อไม่ให้จอวาบขาวก่อนเข้าห้องมืด
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import VideoEditor from "../../../components/editor/VideoEditor"

function EditorShell() {
  const q = useSearchParams()
  return <VideoEditor project={q.get("project")} />
}

export default function VideoEditorPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#081228", color: "#8aa2c8",
                    display: "grid", placeItems: "center" }}>
        กำลังเปิดห้องตัดต่อ…
      </div>
    }>
      <EditorShell />
    </Suspense>
  )
}
