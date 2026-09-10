"use client"
// /video/editor — เปลือกบางของห้องตัดต่อ (ตัวจริงอยู่ components/editor/VideoEditor)
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
