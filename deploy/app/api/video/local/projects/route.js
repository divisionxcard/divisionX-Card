// GET /api/video/local/projects — รายชื่องานเรนเดอร์ในเครื่อง (.video-work/*)
// ใช้เปิดหน้าแรกของห้องตัดต่อ: เลือกว่าจะแก้คลิปไหน
import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { localOnly, WORK_ROOT } from "../_guard"

export async function GET() {
  const gate = localOnly()
  if (gate) return gate

  let out = []
  try {
    const names = fs.readdirSync(WORK_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith("_"))
      .map(d => d.name)
    for (const name of names) {
      const dir = path.join(WORK_ROOT, name)
      const timingPath = path.join(dir, "timing.json")
      // ไม่มี timing.json = โฟลเดอร์ที่ยังเรนเดอร์ไม่จบสักครั้ง — ไม่มีอะไรให้ตัดต่อ
      if (!fs.existsSync(timingPath)) continue
      let duration = null, segs = null
      try {
        const t = JSON.parse(fs.readFileSync(timingPath, "utf8"))
        segs = (t.segments || []).length
        const last = (t.timing || [])[(t.timing || []).length - 1]
        duration = last ? last.end : null
      } catch { /* timing เสีย — ยังโชว์ในรายการได้ แค่ไม่มีตัวเลข */ }
      const mp4 = path.join(dir, `${name}.mp4`)
      out.push({
        name,
        hasVideo: fs.existsSync(mp4),
        duration,
        segments: segs,
        updated_at: fs.statSync(timingPath).mtime.toISOString(),
      })
    }
  } catch {
    // .video-work ยังไม่มีเลย (เครื่องที่ไม่เคยเรนเดอร์) — รายการว่างคือคำตอบที่ถูก
  }
  out.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
  return NextResponse.json({ projects: out })
}
