// ไดอารี่งานของเจ้าของ — GET รายการวัน · PATCH ติ๊กข้อค้าง (24 ต.ค. 2026)
//
//   GET   /api/diary                          → { days: [ {date, title, story, stories, decisions, pending, …} ] } ใหม่สุดก่อน
//   PATCH /api/diary { date, pid, done }      → { day }   ติ๊ก/เอาติ๊กออกข้อค้างข้อเดียว
//
// เจ้าของขอเปิดดูได้โดยไม่ต้องผ่าน claude.ai — หน้าเดิมเป็น Artifact บน claude.ai (ArtifactData คอลเลกชัน days)
// ตัวจริงของแต่ละวันอยู่ scripts/diary/days/<date>.json ในรีโป · ส่งขึ้นที่นี่ด้วย scripts/diary/sync_r2.py
// (รวมติ๊กจากทั้งสองที่แบบ "ติ๊กที่ไหนก็นับ") · เก็บในคลัง R2 diary/days/ ซึ่งหน้า /media ไม่เปิดให้ (PRIVATE_PREFIXES)
// เฉพาะแอดมิน — ไม่ใช่ข้อมูลลับ (ไฟล์ต้นฉบับอยู่ในรีโปสาธารณะ ซึ่งห้ามมียอดขาย/อีเมล/คีย์อยู่แล้ว) แต่เป็นสมุดส่วนตัวของเจ้าของ
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../lib/apiAuth"
import { getObject, listObjects, putObject } from "../../../lib/r2"

export const dynamic = "force-dynamic"

const DIR = "diary/days/"
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function readDay(date) {
  const res = await getObject(`${DIR}${date}.json`)
  if (!res) return null
  try { return await res.json() } catch { return null }
}

export async function GET(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error
  try {
    const keys = (await listObjects(DIR, 2000)).map(f => f.key).filter(k => DATE_RE.test(k.slice(DIR.length, -5)))
    const days = []
    // อ่านทีละ 8 ไฟล์ — ปีหนึ่งมีไม่เกิน ~365 ไฟล์ ไม่ต้องมีดัชนีแยก
    for (let i = 0; i < keys.length; i += 8) {
      const batch = await Promise.all(keys.slice(i, i + 8).map(k => readDay(k.slice(DIR.length, -5)).catch(() => null)))
      days.push(...batch.filter(d => d && DATE_RE.test(d.date)))
    }
    days.sort((a, b) => b.date.localeCompare(a.date))
    return NextResponse.json({ days }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    return NextResponse.json({ error: `เปิดสมุดไม่ได้: ${e.message}` }, { status: 500 })
  }
}

export async function PATCH(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const { date, pid } = body || {}
  if (!DATE_RE.test(String(date || "")) || typeof pid !== "string" || !pid || pid.length > 80) {
    return NextResponse.json({ error: "ต้องส่ง date (YYYY-MM-DD) และ pid" }, { status: 400 })
  }
  try {
    const day = await readDay(date)
    if (!day) return NextResponse.json({ error: "ไม่พบวันนี้ในสมุด" }, { status: 404 })
    const hit = (day.pending || []).find(p => p.id === pid)
    if (!hit) return NextResponse.json({ error: "ไม่พบข้อนี้" }, { status: 404 })
    hit.done = !!body.done
    hit.done_at = hit.done ? new Date().toISOString() : null
    await putObject(`${DIR}${date}.json`, JSON.stringify(day), "application/json")
    return NextResponse.json({ day })
  } catch (e) {
    return NextResponse.json({ error: `บันทึกการติ๊กไม่สำเร็จ: ${e.message}` }, { status: 500 })
  }
}
