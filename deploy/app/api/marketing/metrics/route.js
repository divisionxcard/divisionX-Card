// ตัวเลข — โซน D ของหน้า /marketing
//
// GET /api/marketing/metrics?days=7 → KPI + ยอดรายวัน + หมุดวันที่โพสต์
//
// ยังไม่มีค่าโฆษณา (เฟส 4) → ไม่คำนวณ ROAS/กำไรสุทธิ และไม่แสดงช่องเปล่าหลอกตา
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../../lib/apiAuth"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TH_OFFSET_MS = 7 * 60 * 60 * 1000

// วันไทยของ timestamp UTC (คืน "YYYY-MM-DD")
const thDate = (iso) => new Date(new Date(iso).getTime() + TH_OFFSET_MS).toISOString().slice(0, 10)
// ขอบเขต UTC ของวันไทย — ใช้ยิงเข้า PostgREST
const utcBound = (thDay, endExclusive = false) => {
  const d = new Date(`${thDay}T00:00:00.000Z`).getTime() - TH_OFFSET_MS
  return new Date(d + (endExclusive ? 86400000 : 0)).toISOString()
}
const addDays = (thDay, n) => {
  const d = new Date(`${thDay}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// PostgREST คืนสูงสุด 1000 แถวต่อครั้ง — ต้องวนดึงเอง
// ⚠ ห้ามเรียก .select() เฉย ๆ กับ sales: 7 วันก็เกิน 1000 แถวแล้ว (ยอดจะต่ำกว่าจริงแบบเงียบ ๆ)
const PAGE = 1000
async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) return out
  }
}

export async function GET(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "7", 10) || 7, 1), 90)

  const today = thDate(new Date().toISOString())
  const start = addDays(today, -(days - 1))
  const prevStart = addDays(start, -days)     // ช่วงก่อนหน้าความยาวเท่ากัน — ไว้เทียบ %

  try {
    const [rows, prevRows, { data: machines }] = await Promise.all([
      fetchAll(() => db.from("sales")
        .select("machine_id,sku_id,quantity_sold,grand_total,sold_at,transaction_id")
        .gte("sold_at", utcBound(start)).lt("sold_at", utcBound(today, true))
        .order("id", { ascending: true })),
      fetchAll(() => db.from("sales").select("grand_total")
        .gte("sold_at", utcBound(prevStart)).lt("sold_at", utcBound(start))
        .order("id", { ascending: true })),
      db.from("machines").select("machine_id,name,location,id").eq("status", "active"),
    ])

    const mname = Object.fromEntries((machines || [])
      .map(m => [m.machine_id, m.name || m.location || m.machine_id]))

    const revenue = (rows || []).reduce((s, r) => s + Number(r.grand_total || 0), 0)
    const packs = (rows || []).reduce((s, r) => s + Number(r.quantity_sold || 0), 0)
    const txns = new Set((rows || []).map(r => r.transaction_id).filter(Boolean)).size
    const prevRevenue = (prevRows || []).reduce((s, r) => s + Number(r.grand_total || 0), 0)
    const deltaPct = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null

    // ── ยอดรายวัน (เติมวันที่ไม่มีขายเป็น 0 เพื่อไม่ให้กราฟขาดช่วง) ──
    const byDay = {}
    for (let i = 0; i < days; i++) byDay[addDays(start, i)] = { revenue: 0, packs: 0 }
    for (const r of rows || []) {
      const d = thDate(r.sold_at)
      if (byDay[d]) {
        byDay[d].revenue += Number(r.grand_total || 0)
        byDay[d].packs += Number(r.quantity_sold || 0)
      }
    }

    // ── หมุดวันที่โพสต์ (เอามาวางทับกราฟ ตอบว่า "โพสต์แล้วยอดขึ้นไหม") ──
    // ทนกรณียังไม่ได้ apply migration 059 — โซน D ต้องใช้ได้ก่อนโดยไม่ต้องรอตาราง
    const { data: posts } = await db.from("marketing_content")
      .select("posted_at,platform,caption")
      .not("posted_at", "is", null)
      .gte("posted_at", utcBound(start))
      .then(r => (r.error ? { data: [] } : r))
    const postsByDay = {}
    for (const p of posts || []) {
      const d = thDate(p.posted_at)
      ;(postsByDay[d] = postsByDay[d] || []).push({
        platform: p.platform,
        caption: (p.caption || "").slice(0, 60),
      })
    }

    const daily = Object.entries(byDay).map(([date, v]) => ({
      date,
      label: date.slice(5).replace("-", "/"),
      revenue: Math.round(v.revenue),
      packs: v.packs,
      posts: (postsByDay[date] || []).length,
    }))

    // ── ยอดต่อตู้ ──
    const byMachine = {}
    for (const r of rows || []) {
      const a = (byMachine[r.machine_id] = byMachine[r.machine_id] || { revenue: 0, packs: 0 })
      a.revenue += Number(r.grand_total || 0)
      a.packs += Number(r.quantity_sold || 0)
    }
    const perMachine = Object.entries(byMachine)
      .map(([machine_id, a]) => ({
        machine_id, name: mname[machine_id] || machine_id,
        revenue: Math.round(a.revenue), packs: a.packs,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    // ── วันที่มีโพสต์ vs ไม่มีโพสต์ ──
    // ⚠ ตัวเลขนี้เป็นแค่ข้อสังเกต ไม่ใช่หลักฐาน — วันหยุด/ของเข้าใหม่ก็ดันยอดได้เหมือนกัน
    const withPost = daily.filter(d => d.posts > 0)
    const noPost = daily.filter(d => d.posts === 0)
    const avg = (arr) => arr.length ? Math.round(arr.reduce((s, d) => s + d.revenue, 0) / arr.length) : null
    const postLift = {
      days_with_post: withPost.length,
      days_without_post: noPost.length,
      avg_with_post: avg(withPost),
      avg_without_post: avg(noPost),
      reliable: withPost.length >= 3 && noPost.length >= 3,
      caveat: "เป็นข้อสังเกต ไม่ใช่หลักฐาน — วันหยุด/ของเข้าใหม่ก็ดันยอดได้",
    }

    return NextResponse.json({
      range: { from: start, to: today, days },
      kpi: {
        revenue: Math.round(revenue),
        packs,
        transactions: txns,
        revenue_per_day: Math.round(revenue / days),
        top_machine: perMachine[0] || null,
        revenue_delta_pct: deltaPct === null ? null : Math.round(deltaPct * 10) / 10,
      },
      daily,
      per_machine: perMachine,
      post_lift: postLift,
      pending_features: {
        ad_spend: "เฟส 4 — ต้องต่อ Meta MCP ก่อนถึงคำนวณ ROAS/กำไรสุทธิได้",
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
