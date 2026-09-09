// POST /api/video/local/render — สั่งเรนเดอร์ใหม่ในเครื่องจากห้องตัดต่อ
// body: { name, plan }  (plan ทั้งก้อนรวม edit — ตาม CONTRACT.md ข้อ 2.4)
//
// spawn แบบปล่อยมือ (detached) เพราะเรนเดอร์ใช้ ~25 วินาทีถึงหลายนาที
// ยาวเกินจะถือ request ค้างไว้ — หน้าเว็บตามผลเอาจาก render-status แทน
import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { spawn } from "child_process"
import { localOnly, projectDir } from "../_guard"

const REPO = path.resolve(process.cwd(), "..")
const PYTHON = path.join(REPO, ".venv-image", "Scripts", "python.exe")
const SCRIPT = path.join(REPO, "deploy", "agents", "video", "make_video.py")

function pidAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

export async function POST(req) {
  const gate = localOnly()
  if (gate) return gate

  let body
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 })
  }
  const dir = projectDir(body?.name)
  if (!dir) return NextResponse.json({ error: "ชื่อโปรเจกต์ไม่ถูกต้อง" }, { status: 400 })
  const plan = body?.plan
  if (!plan?.script) {
    return NextResponse.json({ error: "plan ต้องมี script" }, { status: 400 })
  }
  // ชื่อในแผนต้องตรงกับโฟลเดอร์ — กติกาเดียวกับ CHECK constraint ใน migration 075
  plan.project = body.name

  fs.mkdirSync(dir, { recursive: true })

  // กันกดเรนเดอร์ซ้อน — สองโปรเซสเขียนไฟล์เดียวกันคือได้คลิปพังโดยไม่มี error
  const pidFile = path.join(dir, "render.pid")
  if (fs.existsSync(pidFile)) {
    const old = parseInt(fs.readFileSync(pidFile, "utf8"))
    if (old && pidAlive(old)) {
      return NextResponse.json(
        { error: "งานนี้กำลังเรนเดอร์อยู่แล้ว — รอให้จบก่อน" }, { status: 409 })
    }
  }
  if (!fs.existsSync(PYTHON)) {
    return NextResponse.json(
      { error: `ไม่พบ python ที่ ${PYTHON} — เครื่องนี้ยังไม่ได้ตั้ง .venv-image` },
      { status: 500 })
  }

  const planPath = path.join(dir, "plan.json")
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf8")

  const logPath = path.join(dir, "render.log")
  const logFd = fs.openSync(logPath, "w")           // ทับของเก่า — log คือของรอบล่าสุดเสมอ
  const child = spawn(
    PYTHON, [SCRIPT, "--plan", planPath, "--out", path.join(dir, `${body.name}.mp4`)],
    {
      cwd: REPO,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",                  // log มีภาษาไทย — ไม่ตั้งแล้ว cp1252 พัง
        HF_HUB_OFFLINE: "1",                        // โมเดล whisper อยู่ในเครื่องแล้ว ห้ามออกเน็ต
        HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
      },
    })
  fs.closeSync(logFd)
  fs.writeFileSync(pidFile, String(child.pid), "utf8")
  child.unref()

  return NextResponse.json({ started: true })
}
