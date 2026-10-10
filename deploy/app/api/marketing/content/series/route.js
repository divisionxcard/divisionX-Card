// ซีรีส์ประจำ — สร้างโพสต์ที่ "คนเลือกชุดเอง" ไม่ได้ตั้งต้นจากไอเดีย
//
// GET  /api/marketing/content/series?series=top5  → ชุดที่ทำซีรีส์นี้ได้ (มีขายในตู้ + มีในคลังการ์ด)
// POST /api/marketing/content/series { series: "top5", sku: "OP 13" } → ร่างใหม่ (content_format = top5)
//      แล้วหน้าเว็บสั่ง /content/generate { id } ต่อเอง แบบเดียวกับตอนกดเลือกไอเดีย
//
// ทำไมแยกจาก POST /content (10 ต.ค. 2026): ซีรีส์ "ส่อง 5 ใบเด็ด" ต้องกำหนดรูปแบบตั้งแต่สร้าง
//   ตัวเขียนอ่าน content_format = top5 แล้วบังคับใช้รูปแบบนี้ตลอด (ดู generate/route.js → manualFmt)
//   ส่วน POST /content รับร่างที่คนเขียนเอง ไม่มีเรื่องรูปแบบ — ไม่ควรเปิดให้ใครตั้งค่าเองผ่านทางนั้น
//
// admin/marketing เท่านั้น · ตรวจ SKU กับตารางจริง + คลังการ์ดก่อนเสมอ
// (source_sku ไปตัดสินว่าจะดึงการ์ดชุดไหน ใส่ผิดคือได้ 5 ใบของอีกชุด)
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { requireMarketing } from "../../../../../lib/apiAuth"
import { loadCards, findSet } from "../../../../../lib/opcgKnowledge"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SERIES = {
  top5: { label: "ส่อง 5 ใบเด็ด", format: "top5", franchise: "OP" },
}

// ชุดที่ทำซีรีส์ได้: SKU ที่ยังขาย + ค่ายตรง + มีชุดนี้ในคลังการ์ด (ไม่มีคลัง = ไม่มี 5 ใบให้เล่า)
async function eligibleSets(series) {
  const cfg = SERIES[series]
  const [{ data: skus, error }, cards] = await Promise.all([
    db.from("skus").select("sku_id,name,set_code,franchise")
      .eq("is_active", true).eq("franchise", cfg.franchise),
    loadCards(),
  ])
  if (error) throw error
  const out = []
  for (const s of skus || []) {
    const set = findSet(cards, s.set_code || s.sku_id)
    if (set) out.push({ sku_id: s.sku_id, name: s.name, set_code: set.code, label: set.label })
  }
  // ชุดใหม่ขึ้นก่อน — OP ตามเลข แล้วค่อย EB/PRB (คนมักอยากส่องชุดล่าสุด)
  const key = (x) => {
    const m = /^([A-Z]+)(\d+)/.exec(x.set_code || "")
    return m ? [{ OP: 0, EB: 1, PRB: 2 }[m[1]] ?? 3, -parseInt(m[2], 10)] : [9, 0]
  }
  return out.sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1])
}

export async function GET(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  const series = new URL(req.url).searchParams.get("series") || "top5"
  if (!SERIES[series]) return NextResponse.json({ error: `ไม่รู้จักซีรีส์: ${series}` }, { status: 400 })
  try {
    return NextResponse.json({ series, label: SERIES[series].label, sets: await eligibleSets(series) })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const series = body.series || "top5"
  const cfg = SERIES[series]
  if (!cfg) return NextResponse.json({ error: `ไม่รู้จักซีรีส์: ${series}` }, { status: 400 })

  const skuId = String(body.sku || "").trim()
  try {
    const sets = await eligibleSets(series)
    const pick = sets.find(s => s.sku_id === skuId)
    if (!pick) {
      return NextResponse.json({
        error: `ทำซีรีส์ ${cfg.label} กับ ${skuId || "(ไม่ได้เลือก)"} ไม่ได้`,
        hint: "เลือกได้เฉพาะซอง One Piece ที่ยังขายในตู้และมีในคลังการ์ด",
      }, { status: 400 })
    }
    // caption เป็น NOT NULL — ใส่ข้อความรอไว้ ตัวเขียนเขียนทับตอนสั่ง generate
    const { data, error } = await db.from("marketing_content").insert({
      caption: `⏳ ${cfg.label} · ${pick.name} — รอ AI เขียน`,
      platform: "fb",
      status: "draft",
      source_reason: `ซีรีส์ ${cfg.label} · ${pick.name}`,
      source_sku: pick.sku_id,
      content_format: cfg.format,
      created_by: "human",
    }).select("*, sku:skus(sku_id,name,image_url,image_url_box)").single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
