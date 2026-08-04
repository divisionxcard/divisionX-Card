// ไอเดียคอนเทนต์ — สถานี 1 ของหน้า /marketing
//
// GET   /api/marketing/ideas?status=new  → ไอเดียที่ AI เก็บมา เรียงตามคะแนน
// PATCH /api/marketing/ideas             → กด "เริ่มทำคอนเทนต์" (pick) หรือ "ไม่เอา" (dismiss)
//
// pick จะสร้างแถวใน marketing_content สถานะ draft ให้ด้วย แล้วโยง idea ↔ content เข้าหากัน
// (ตัวเขียนแคปชั่นจริงใช้ Ollama ซึ่งรันในเครื่องเท่านั้น — เว็บทำได้แค่ตั้งต้นให้)
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../../lib/apiAuth"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const STATUSES = ["new", "picked", "dismissed"]

export async function GET(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || "new"
  const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10) || 30, 100)

  if (status !== "all" && !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status ไม่ถูกต้อง: ${status}` }, { status: 400 })
  }

  try {
    let q = db.from("marketing_ideas").select("*")
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit)
    if (status !== "all") q = q.eq("status", status)
    const { data, error } = await q
    if (error) throw error

    const { data: all } = await db.from("marketing_ideas").select("status,source")
    const counts = {}, bySource = {}
    for (const r of all || []) {
      counts[r.status] = (counts[r.status] || 0) + 1
      if (r.status === "new") bySource[r.source] = (bySource[r.source] || 0) + 1
    }
    return NextResponse.json({ items: data || [], counts, by_source: bySource })
  } catch (err) {
    // ยังไม่ได้ apply migration 060 → ให้หน้าเว็บแสดงข้อความแทนที่จะพังทั้งหน้า
    if (/marketing_ideas/.test(err.message || "")) {
      return NextResponse.json({ items: [], counts: {}, by_source: {},
        warning: "ยังไม่ได้สร้างตาราง marketing_ideas (migration 060)" })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── POST: วางลิงก์คลิปที่เห็นว่าไวรัลแล้วเก็บเป็นไอเดีย ─────────────────
//
// ทำไมต้องมีทางนี้: TikTok ไม่มี RSS สาธารณะ · Creative Center API ตอบ "no permission"
// · official API ต้องสมัครและรออนุมัติ — การไล่หาคลิปไวรัลอัตโนมัติจึงยังทำไม่ได้
// สิ่งที่ทำได้คือตอนเลื่อนเจอเองแล้ววางลิงก์ ระบบดึงชื่อ/ผู้โพสต์/ปกให้ผ่าน oEmbed
// (oEmbed เป็นช่องทางสาธารณะที่ตัวแพลตฟอร์มเปิดให้ใช้เอง ไม่ใช่การ scrape)
const OEMBED = [
  { test: /tiktok\.com/i,               source: "tiktok",
    api: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}` },
  { test: /(youtube\.com|youtu\.be)/i,  source: "youtube",
    api: (u) => `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json` },
]

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  const url = (body.url || "").trim()
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "ต้องเป็นลิงก์ที่ขึ้นต้นด้วย http(s)://" }, { status: 400 })
  }

  const provider = OEMBED.find(p => p.test.test(url))
  let title = body.title?.trim() || null
  let author = null, thumb = null

  if (provider) {
    try {
      const res = await fetch(provider.api(url), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DivisionX/1.0)" },
        signal: AbortSignal.timeout(12000),
      })
      if (res.ok) {
        const meta = await res.json()
        title = title || meta.title || null
        author = meta.author_name || null
        thumb = meta.thumbnail_url || null
      }
    } catch {
      // oEmbed ล้มไม่ควรทำให้เพิ่มไอเดียไม่ได้ — แค่ไม่มีชื่ออัตโนมัติ
    }
  }

  if (!title) {
    return NextResponse.json(
      { error: "ดึงชื่อคลิปไม่ได้ (คลิปอาจเป็นส่วนตัวหรือถูกลบ) — ใส่ title มาด้วย" },
      { status: 422 })
  }

  try {
    const { data, error } = await db.from("marketing_ideas").insert({
      status: "new",
      source: provider?.source || "manual",
      source_label: author ? `${provider ? provider.source : "ลิงก์"} · @${author}` : "วางลิงก์เอง",
      title: title.slice(0, 300),
      summary: thumb ? `ปก: ${thumb}` : null,
      url,
      // คนวางเองแปลว่าเห็นว่าน่าสนใจอยู่แล้ว — ให้คะแนนสูงกว่าที่ระบบเก็บมา
      score: 6,
      angle: body.angle?.trim() || "ทำคลิปสั้นเกาะกระแสนี้ — เปิดซองที่ตู้ ตัดต่อสไตล์คลิปต้นทาง",
      relevance: "คนเห็นเองแล้ววางลิงก์ไว้",
      external_key: `manual:${url.slice(0, 180)}`,
    }).select().single()
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "ลิงก์นี้เก็บไว้แล้ว" }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  const id = parseInt(body.id, 10)
  const action = body.action
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 })
  if (!["pick", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "action ต้องเป็น pick หรือ dismiss" }, { status: 400 })
  }

  try {
    const { data: idea, error: e0 } = await db.from("marketing_ideas")
      .select("*").eq("id", id).maybeSingle()
    if (e0) throw e0
    if (!idea) return NextResponse.json({ error: `ไม่พบไอเดีย id=${id}` }, { status: 404 })

    if (action === "dismiss") {
      const { data, error } = await db.from("marketing_ideas")
        .update({ status: "dismissed", dismiss_reason: body.reason || null })
        .eq("id", id).select().maybeSingle()
      if (error) throw error
      return NextResponse.json({ idea: data })
    }

    // ── pick: ตั้งต้นร่างคอนเทนต์จากไอเดีย ──
    if (idea.status === "picked" && idea.content_id) {
      return NextResponse.json({ error: "ไอเดียนี้เริ่มทำไปแล้ว" }, { status: 409 })
    }

    // caption ตอนนี้เป็น "โจทย์" ให้คนหรือ Ollama เขียนต่อ — ไม่ใช่แคปชั่นจริง
    const brief = [
      `[ร่างจากไอเดีย] ${idea.title}`,
      idea.angle ? `\nมุมที่จะเล่า: ${idea.angle}` : "",
      idea.url ? `\nอ้างอิง: ${idea.url}` : "",
      "\n\n(ยังไม่ใช่แคปชั่นจริง — รันตัวเขียนแคปชั่นในเครื่อง หรือแก้เองแล้วอนุมัติ)",
    ].join("")

    const { data: content, error: e1 } = await db.from("marketing_content").insert({
      status: "draft",
      platform: body.platform || "fb",
      caption: brief,
      source_reason: idea.relevance
        ? `${idea.title} · ${idea.relevance}`
        : idea.title,
      source_sku: idea.related_sku || null,
      idea_id: idea.id,
      created_by: "ai",
    }).select().single()
    if (e1) throw e1

    const { data: updated, error: e2 } = await db.from("marketing_ideas")
      .update({ status: "picked", content_id: content.id })
      .eq("id", id).select().maybeSingle()
    if (e2) throw e2

    return NextResponse.json({ idea: updated, content })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
