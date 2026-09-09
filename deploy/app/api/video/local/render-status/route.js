// GET /api/video/local/render-status?name=X — หน้าเว็บโพลดูความคืบหน้าการเรนเดอร์
// อ่านจาก render.log ที่ make_video พิมพ์ [n/6] ทีละขั้น — ไม่ต้องมีท่อพิเศษอะไร
import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { localOnly, projectDir } from "../_guard"

function pidAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

export async function GET(req) {
  const gate = localOnly()
  if (gate) return gate

  const name = new URL(req.url).searchParams.get("name")
  const dir = projectDir(name)
  if (!dir || !fs.existsSync(dir)) {
    return NextResponse.json({ error: "ไม่พบโปรเจกต์" }, { status: 404 })
  }

  const logPath = path.join(dir, "render.log")
  const pidFile = path.join(dir, "render.pid")
  if (!fs.existsSync(logPath)) {
    return NextResponse.json({ running: false, step: 0, total: 6, done: false,
                               message: null, error: null, log: "" })
  }

  const log = fs.readFileSync(logPath, "utf8")
  const pid = fs.existsSync(pidFile) ? parseInt(fs.readFileSync(pidFile, "utf8")) : null
  const running = !!(pid && pidAlive(pid))

  // ความคืบหน้า = บรรทัด [n/6] ล่าสุด · ข้อความ = เนื้อหลัง ] ของบรรทัดนั้น
  let step = 0, message = null
  const steps = [...log.matchAll(/\[(\d)\/6\]\s*(.*)/g)]
  if (steps.length) {
    const lastM = steps[steps.length - 1]
    step = parseInt(lastM[1])
    message = lastM[2].trim()
  }

  const ok = log.includes("เสร็จแล้ว:")
  let error = null
  if (!running && !ok && log.trim()) {
    // จบแล้วแต่ไม่มีบรรทัดสำเร็จ = พัง — ส่งท้าย log ให้พอเห็นสาเหตุโดยไม่ต้องเปิดไฟล์
    error = log.trim().split("\n").slice(-8).join("\n")
  }

  return NextResponse.json({
    running, step, total: 6, message,
    done: !running && ok,
    error,
    log: log.slice(-4000),        // กัน log ยาว ๆ บวม response — เอาท้ายพอ
  })
}
