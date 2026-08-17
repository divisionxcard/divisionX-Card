// เก็บผลลัพธ์โพสต์จากเพจ Facebook — POST /api/marketing/metrics-collect
//
// ยิงจาก GitHub Actions ทุก 6 ชม. (.github/workflows/marketing-metrics.yml)
// เก็บเป็นสแนปช็อตลงตาราง post_metrics — หนึ่งแถวต่อหนึ่งครั้งที่เก็บ ไม่ทับของเก่า
// เพราะเอนเกจโตตามเวลา ต้องมีหลายจุดถึงจะเทียบ "24 ชม.แรก" ข้ามโพสต์ได้
//
// ครอบ **ทุกโพสต์บนเพจ** ไม่ใช่แค่ที่โพสต์ผ่านระบบเรา — โพสต์ที่เจ้าของทำด้วยมือ
// ก็มีค่าให้เรียนรู้ และตอนเริ่มใช้ ของในระบบยังไม่มีเลยแม้แต่ชิ้นเดียว
//
// ใช้ secret เดียวกับตัวตั้งเวลาโพสต์ (AUTOPOST_SECRET) — เป็นงานเบื้องหลังชุดเดียวกัน
// ไม่มี secret = 503 ไม่ทำอะไร
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { fbConfig } from "../../../../lib/facebook"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const V = process.env.FB_API_VERSION || "v26.0"
const BASE = `https://graph.facebook.com/${V}`

// จำนวนโพสต์ล่าสุดที่ไปเก็บต่อรอบ — เพจโพสต์ไม่กี่ชิ้นต่อสัปดาห์ 25 ครอบเดือนกว่า
const MAX_POSTS = 25

// ฟิลด์ที่ยืนยันแล้วว่าอ่านได้จริงด้วย pages_read_engagement (ทดสอบ 2026-08-17)
const POST_FIELDS = [
  "id", "created_time", "message", "permalink_url",
  "likes.summary(true).limit(0)",
  "comments.summary(true).limit(0)",
  "reactions.summary(true).limit(0)",
  "shares",
].join(",")

// metric ที่ v26 ยังรับอยู่ · post_impressions / post_engaged_users ถูกปลดไปแล้ว
// ถ้าวันหนึ่ง Meta คืนมาให้เพิ่มที่นี่ที่เดียว
const INSIGHT_METRICS = ["post_clicks", "post_video_views"]

async function graph(path, params) {
  const q = new URLSearchParams({ ...params, access_token: fbConfig().token })
  const res = await fetch(`${BASE}/${path}?${q}`, { signal: AbortSignal.timeout(30000) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json?.error?.message || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return json
}

// insights ล้มไม่ควรทำให้ทั้งโพสต์เก็บไม่ได้ — ไลก์/คอมเมนต์/แชร์สำคัญกว่า clicks
async function insightsOf(postId) {
  try {
    const r = await graph(`${postId}/insights`, { metric: INSIGHT_METRICS.join(",") })
    const out = {}
    for (const m of r.data || []) out[m.name] = m.values?.[0]?.value ?? null
    return out
  } catch {
    return {}
  }
}

export async function POST(req) {
  const secret = process.env.AUTOPOST_SECRET
  if (!secret) {
    return NextResponse.json({
      error: "ยังไม่ได้เปิดใช้งานเก็บสถิติ (ไม่มี AUTOPOST_SECRET)",
    }, { status: 503 })
  }
  const h = req.headers.get("authorization") || ""
  const given = h.startsWith("Bearer ") ? h.slice(7).trim() : ""
  if (!given || given.length !== secret.length || given !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const cfg = fbConfig()
  if (!cfg.ready) {
    return NextResponse.json({
      error: "ยังไม่ได้ตั้งค่า Facebook",
      need: [!cfg.pageId && "FB_PAGE_ID", !cfg.token && "FB_PAGE_ACCESS_TOKEN"].filter(Boolean),
    }, { status: 503 })
  }

  let posts
  try {
    const r = await graph(`${cfg.pageId}/posts`, { fields: POST_FIELDS, limit: String(MAX_POSTS) })
    posts = r.data || []
  } catch (err) {
    // token ตายคือสาเหตุที่พบบ่อยที่สุด — บอกให้ชัดว่าต้องไปกู้ ไม่ใช่ปล่อยให้เดา
    return NextResponse.json({
      error: `อ่านโพสต์จากเพจไม่ได้: ${err.message}`,
      hint: "ถ้าเป็น OAuthException ให้กู้ token ตาม wiki/marketing/auto-posting-level3-setup.md",
    }, { status: err.status === 400 ? 502 : (err.status || 502) })
  }

  // ผูกกับคอนเทนต์ในระบบถ้ามี — โพสต์ที่ทำด้วยมือจะได้ content_id = null ซึ่งยอมรับได้
  const ids = posts.map(p => p.id)
  const linked = {}
  if (ids.length) {
    const { data } = await db.from("marketing_content")
      .select("id,post_id").in("post_id", ids)
    for (const c of data || []) linked[c.post_id] = c.id
  }

  const now = Date.now()
  // ปัดชั่วโมงฝั่งเรา แล้วส่งเป็นคอลัมน์จริง — index ใช้ date_trunc() ไม่ได้
  // เพราะ date_trunc กับ timestamptz เป็น STABLE ไม่ใช่ IMMUTABLE (ดูคอมเมนต์ใน migration 067)
  const capturedHour = new Date(new Date(now).setMinutes(0, 0, 0)).toISOString()
  const rows = posts.map(p => {
    const postedAt = p.created_time ? new Date(p.created_time) : null
    return {
      post_id: p.id,
      captured_hour: capturedHour,
      content_id: linked[p.id] ?? null,
      posted_at: postedAt?.toISOString() ?? null,
      message: (p.message || "").slice(0, 500),
      permalink: p.permalink_url || null,
      likes: p.likes?.summary?.total_count ?? null,
      reactions: p.reactions?.summary?.total_count ?? null,
      comments: p.comments?.summary?.total_count ?? null,
      shares: p.shares?.count ?? 0,
      age_hours: postedAt ? Number(((now - postedAt.getTime()) / 3.6e6).toFixed(2)) : null,
    }
  })

  // ดึง insights แบบขนาน แต่ทีละก้อนเล็ก ๆ เพื่อไม่ให้โดน rate limit ของ Graph API
  for (let i = 0; i < rows.length; i += 5) {
    const chunk = rows.slice(i, i + 5)
    const got = await Promise.all(chunk.map(r => insightsOf(r.post_id)))
    chunk.forEach((r, k) => {
      r.clicks = got[k].post_clicks ?? null
      r.video_views = got[k].post_video_views ?? null
    })
  }

  // ชนกับ unique index (post_id + ชั่วโมงเดียวกัน) = เคยเก็บไปแล้วในชั่วโมงนี้ ไม่ใช่ error
  // ignoreDuplicates ทำให้กดรันซ้ำในชั่วโมงเดียวกันไม่พังและไม่บวมข้อมูล
  const { data: saved, error } = await db.from("post_metrics")
    .upsert(rows, { onConflict: "post_id,captured_hour", ignoreDuplicates: true })
    .select("id")

  if (error) {
    return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${error.message}` }, { status: 500 })
  }

  const top = [...rows].sort((a, b) => (b.reactions || 0) - (a.reactions || 0))[0]
  return NextResponse.json({
    ok: true,
    collected: rows.length,
    saved: saved?.length ?? rows.length,
    linked_to_system: rows.filter(r => r.content_id).length,
    top_post: top ? {
      post_id: top.post_id, reactions: top.reactions,
      comments: top.comments, shares: top.shares,
      message: (top.message || "").slice(0, 60),
    } : null,
    note: "ไม่มี reach/impressions เพราะ Meta ปลด metric ออกจาก Graph API v26",
  })
}
