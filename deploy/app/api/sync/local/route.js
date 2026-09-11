// ── ปุ่มซิงค์จากเครื่องนี้ — ทางสำรองตอน GitHub Actions ใช้ไม่ได้ ──
//
// ปุ่ม "ดึงข้อมูล VMS/WW/Payif" ปกติยิงไปสั่ง workflow บน GitHub ซึ่งระหว่าง
// บัญชีโดนแฟล็ก (ก.ย. 2026) ใช้ไม่ได้ทั้งหมด — เส้นนี้รัน scripts/sync_local.py
// (ตัวเดียวกับที่ workflow รัน) บนเครื่อง dev แทน · มีเฉพาะตอน `next dev`
// บน Vercel ตอบ 404 เหมือนกลุ่ม /api/video/local/* (เหตุผลเดียวกัน: spawn
// โปรเซสในเครื่อง + ไม่เปิดพื้นผิวโจมตีบน production)
//
// POST {job: "all"|"stock"|"sales"}  → เริ่มซิงค์ (409 ถ้ากำลังรันอยู่)
// GET                                → {running, done, ok, log}
import { spawn } from "child_process"
import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { localOnly } from "../../video/local/_guard"

const REPO = path.resolve(process.cwd(), "..")
const LOG = path.join(REPO, ".sync-local.log")
const PID = path.join(REPO, ".sync-local.pid")
const PYTHON = path.join(REPO, ".venv-image", "Scripts", "python.exe")
const SCRIPT = path.join(REPO, "scripts", "sync_local.py")

const JOBS = { all: [], stock: ["--stock"], sales: ["--sales"] }

function pidAlive() {
  try {
    const pid = parseInt(fs.readFileSync(PID, "utf-8").trim(), 10)
    if (!pid) return false
    process.kill(pid, 0)          // สัญญาณ 0 = แค่เช็คว่ามีโปรเซสนี้ไหม
    return true
  } catch {
    return false
  }
}

export async function POST(req) {
  const gate = localOnly()
  if (gate) return gate
  if (pidAlive()) {
    return NextResponse.json(
      { error: "มีงานซิงค์กำลังรันอยู่ — รอให้จบก่อน" }, { status: 409 })
  }
  const body = await req.json().catch(() => ({}))
  const args = JOBS[body.job ?? "all"]
  if (!args) {
    return NextResponse.json({ error: "job ต้องเป็น all | stock | sales" }, { status: 400 })
  }

  const out = fs.openSync(LOG, "w")          // ล้าง log เก่าทุกครั้งที่เริ่มรอบใหม่
  const child = spawn(PYTHON, [SCRIPT, ...args], {
    cwd: REPO,
    detached: true,                          // อยู่รอดแม้ dev server ถูก restart
    stdio: ["ignore", out, out],
  })
  fs.writeFileSync(PID, String(child.pid))
  child.unref()
  fs.closeSync(out)   // ลูกได้สำเนา fd ไปแล้ว — ฝั่งเราต้องปิด ไม่งั้นถือไฟล์ log ค้าง
  return NextResponse.json({ started: true, job: body.job ?? "all" })
}

export async function GET() {
  const gate = localOnly()
  if (gate) return gate
  const running = pidAlive()
  let log = ""
  try { log = fs.readFileSync(LOG, "utf-8") } catch {}
  // จบแล้วหรือยัง ดูจากท่อน "สรุป" ที่ sync_local พิมพ์ปิดท้ายเสมอ
  const done = !running && log.includes("สรุป")
  const ok = done && log.includes("ครบทุกงาน")
  const tail = log.length > 2500 ? log.slice(-2500) : log
  return NextResponse.json({ running, done, ok, log: tail })
}
