// ร่างงานของห้องตัดต่อ — เก็บเป็น JSON ใน Storage (marketing/video-edits/<id>.json) · 23 ต.ค. 2026
//
//   GET /api/video/edits          → { items: [{ id, name, updated_at, clips, seconds }] }   ร่างล่าสุด 40 ชิ้น
//   GET /api/video/edits?id=…     → { id, name, timeline, updated_at, job_id? }
//   PUT /api/video/edits { id?, name, timeline, job_id? } → { id, updated_at }
//
// ทำไมไม่ใช่ตาราง: ไม่ต้องรัน migration + RLS ใหม่ (กติกาโปรเจกต์) · ร่างเป็นของก้อนเดียวที่อ่าน/เขียนทั้งก้อนอยู่แล้ว
// ⚠️ bucket marketing อ่านได้สาธารณะ — ร่างมีแค่ลิงก์ไฟล์สาธารณะกับข้อความบนคลิป ห้ามใส่ข้อมูลลับ/อีเมลลงร่าง
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireMarketing } from "../../../../lib/apiAuth"
import { cleanTimeline, layout } from "../../../../lib/videoTimeline"

export const dynamic = "force-dynamic"

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const BUCKET = "marketing"
const DIR = "video-edits"
const ID_RE = /^e-[a-z0-9-]{4,40}$/

async function readEdit(id) {
  const { data, error } = await db.storage.from(BUCKET).download(`${DIR}/${id}.json`)
  if (error || !data) return null
  try { return JSON.parse(await data.text()) } catch { return null }
}

export async function GET(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  const id = new URL(req.url).searchParams.get("id")
  if (id) {
    if (!ID_RE.test(id)) return NextResponse.json({ error: "id ไม่ถูกรูปแบบ" }, { status: 400 })
    const e = await readEdit(id)
    return e ? NextResponse.json(e) : NextResponse.json({ error: "ไม่พบร่างนี้" }, { status: 404 })
  }
  const { data, error } = await db.storage.from(BUCKET)
    .list(DIR, { limit: 40, sortBy: { column: "updated_at", order: "desc" } })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const files = (data || []).filter(f => f.id && f.name.endsWith(".json"))
  const items = (await Promise.all(files.map(async f => {
    const e = await readEdit(f.name.slice(0, -5))
    if (!e) return null
    const clips = e.timeline?.clips || []
    return { id: e.id, name: e.name, updated_at: e.updated_at, job_id: e.job_id || null,
             clips: clips.length, seconds: Math.round(layout(clips).total) }
  }))).filter(Boolean)
  return NextResponse.json({ items })
}

export async function PUT(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const id = typeof body.id === "string" && ID_RE.test(body.id)
    ? body.id
    : `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  // ร่างยังไม่ต้องครบ (คลิปว่างก็บันทึกได้) — ตรวจเต็มตอนสั่งเรนเดอร์ที่ /api/video/render
  const t = body.timeline && typeof body.timeline === "object" ? body.timeline : {}
  const cleaned = (t.clips || []).length ? cleanTimeline(t) : { timeline: { version: 1, clips: [], overlays: [], voice: null } }
  if (cleaned.error) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const doc = {
    id,
    name: (typeof body.name === "string" && body.name.trim().slice(0, 80)) || "งานตัดต่อไม่มีชื่อ",
    timeline: cleaned.timeline,
    job_id: typeof body.job_id === "string" ? body.job_id.slice(0, 64) : null,
    updated_at: new Date().toISOString(),
    updated_by: gate.user.id,
  }
  const { error } = await db.storage.from(BUCKET).upload(`${DIR}/${id}.json`,
    new Blob([JSON.stringify(doc)], { type: "application/json" }), { upsert: true, contentType: "application/json" })
  if (error) return NextResponse.json({ error: `บันทึกร่างไม่ได้: ${error.message}` }, { status: 500 })
  return NextResponse.json({ id, updated_at: doc.updated_at })
}
