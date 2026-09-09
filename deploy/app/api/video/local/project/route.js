// GET /api/video/local/project?name=X — ข้อมูลครบชุดของงานหนึ่งตัวสำหรับห้องตัดต่อ
// รูปทรง response ตาม CONTRACT.md ข้อ 2.2 — แก้ที่นี่ต้องแก้ที่นั่นด้วย
import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { localOnly, projectDir } from "../_guard"

export async function GET(req) {
  const gate = localOnly()
  if (gate) return gate

  const name = new URL(req.url).searchParams.get("name")
  const dir = projectDir(name)
  if (!dir || !fs.existsSync(dir)) {
    return NextResponse.json({ error: "ไม่พบโปรเจกต์" }, { status: 404 })
  }

  const read = (f) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }
    catch { return null }
  }
  const timing = read("timing.json")
  if (!timing) {
    return NextResponse.json(
      { error: "งานนี้ยังไม่เคยเรนเดอร์จบ — ไม่มี timing.json ให้ตัดต่อ" }, { status: 409 })
  }

  const asset = (file) =>
    `/api/video/local/asset?name=${encodeURIComponent(name)}&file=${encodeURIComponent(file)}`

  // เฟรมเรียงตามฉาก — ชื่อไฟล์ frame_XXX.png ตรงกับ index ฉากเสมอ (visuals.prepare)
  let frames = []
  try {
    frames = fs.readdirSync(path.join(dir, "frames"))
      .filter(f => /^frame_\d+\.png$/.test(f)).sort()
      .map(f => asset(`frames/${f}`))
  } catch { /* ไม่มีโฟลเดอร์ frames — พรีวิวจะโชว์พื้นเปล่าแทน */ }

  const mp4 = `${name}.mp4`
  return NextResponse.json({
    name,
    plan: read("plan.json"),          // null ได้ ถ้าเป็นงานยุคก่อนที่ยังไม่เก็บ plan
    timing,
    videoUrl: fs.existsSync(path.join(dir, mp4)) ? asset(mp4) : null,
    voiceUrl: fs.existsSync(path.join(dir, "voice.wav")) ? asset("voice.wav") : null,
    frames,
  })
}
