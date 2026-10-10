// สั่งสร้างโปสเตอร์ — POST /api/marketing/content/poster { id, sku? }
//
// ทำไมต้องยิงไป GitHub Actions แทนที่จะสร้างตรงนี้:
//   ตัวอักษรไทยต้องใช้ text shaping ของเบราว์เซอร์จริง (Chromium) ซึ่ง Vercel
//   ไม่มีให้ · next/og (Satori) ที่ใช้ได้บน Vercel ทิ้งวรรณยุกต์เมื่อซ้อนบนสระบน
//   "ที่" กลายเป็น "ที" — ทดสอบยืนยันแล้ว ใช้ไม่ได้จริง
//
// เป็นงาน async — route นี้แค่สั่งแล้วจบ ภาพจะโผล่ใน media_url เมื่อ workflow เสร็จ (ราว 1-2 นาที)
// หน้าเว็บมีตัวคอยเช็กผลให้เอง (pollPoster ใน MarketingOS) — คนไม่ต้องกดรีเฟรช
// ระหว่างรอจะเห็นอนิเมชั่นโหลด + ตัวเลขวินาทีเดินขึ้นในช่องรูป แล้วรูปโผล่เองเมื่อเสร็จ
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireMarketing } from "../../../../../lib/apiAuth"
import { detectFranchise } from "../../../../../lib/franchiseDetect"
import { topSkusByFranchise } from "../../../../../lib/skuPicker"
import { generateBackground, top5BackgroundPrompt } from "../../../../../lib/aiBackground"
import { TOP5_BUCKET, top5Path } from "../../../../../lib/top5"

export const runtime = "nodejs"
// ซีรีส์ 5 ใบเด็ดวาดพื้นหลังด้วย AI ก่อนสั่ง workflow (~30 วิ ต่อภาพ) — เผื่อเวลาไว้
export const maxDuration = 300

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const REPO = process.env.GH_REPO || "divisionxcard/divisionX-Card"
const WORKFLOW = "poster-render.yml"

export async function POST(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error

  const token = process.env.GH_PAT
  if (!token) {
    return NextResponse.json({
      error: "ยังไม่ได้ตั้ง GH_PAT",
      hint: "ต้องมีเพื่อสั่ง GitHub Actions — ตัวเดียวกับที่ปุ่ม sync สต็อกใช้",
    }, { status: 503 })
  }

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const id = parseInt(body.id, 10)
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 })

  // ── ซีรีส์ "ส่อง 5 ใบเด็ด": คนละเทมเพลต (deploy/agents/top5_poster.py) ──
  // การ์ดจริง 5 ใบวางด้วย Chromium · AI วาดแค่พื้นหลัง (เจ้าของเลือก 10 ต.ค. 2026)
  const { data: row } = await db.from("marketing_content")
    .select("content_format").eq("id", id).maybeSingle()
  if (row?.content_format === "top5") return top5Poster(id, token)

  // ── หา SKU ที่จะเอารูปไปแปะ ──
  //
  // ⚠️ ไอเดียที่มาจากข่าวไม่มี source_sku (ยืนยันแล้ว #35 #36 #37 เป็น null)
  //    เดิมเทมเพลตจึงไม่รู้ว่าจะแปะรูปอะไร ตกไปใช้รูปตู้ ไม่มีซองในภาพเลย
  //    ตอนนี้เดาค่ายจากแคปชั่นแล้วหยิบซองขายดีของค่ายนั้น — ได้รูปจริงเป๊ะ 100%
  //
  //    ทำที่นี่ไม่ใช่ใน poster_render.py เพราะตัวเดาค่ายเป็น JS อยู่แล้ว
  //    ถ้าไปเขียนซ้ำฝั่ง Python จะกลายเป็นสองสำเนาที่แก้ไม่พร้อมกัน
  let sku = body.sku ? String(body.sku) : null
  if (!sku) {
    try {
      const { data: c } = await db.from("marketing_content")
        .select("caption,source_sku,source_reason,idea:marketing_ideas!marketing_content_idea_id_fkey(title)")
        .eq("id", id).maybeSingle()
      sku = c?.source_sku || null
      if (!sku) {
        const fr = detectFranchise(c?.caption, c?.idea?.title, c?.source_reason)
        if (fr) {
          const [pick] = await topSkusByFranchise(db, { franchise: fr, limit: 1 })
          // ยอมใช้เฉพาะที่ตรงค่ายจริง — ถ้าค่ายนั้นไม่มีรูป ปล่อยว่างดีกว่าแปะผิดค่าย
          if (pick?.franchise === fr) sku = pick.sku_id
        }
      }
    } catch { /* อ่านไม่ได้ก็ปล่อยว่าง workflow จะใช้รูปตู้แทน */ }
  }

  try {
    const res = await dispatch(token, { content_id: String(id), ...(sku ? { sku } : {}) })

    if (res.status === 204) {
      return NextResponse.json({
        success: true,
        // ⚠️ ห้ามบอกให้ "กดรีเฟรช" — หน้าเว็บมีตัวคอยเช็กผลให้เองแล้ว (ดู pollPoster ใน MarketingOS)
        // ข้อความเดิมเขียนไว้ตั้งแต่ยังไม่มีตัวคอยเช็ก แล้วลืมแก้ตอนเพิ่มเข้าไป
        // ผลคือคนอ่านแล้วนั่งกดรีเฟรชเอง ทั้งที่ระบบทำให้อยู่ — และไม่รู้ว่าต้องกดตอนไหน
        message: "สั่งสร้างโปสเตอร์แล้ว — รูปจะขึ้นเองเมื่อเสร็จ (ราว 1-2 นาที) ไม่ต้องกดอะไร",
      })
    }

    const detail = await res.text().catch(() => "")
    // 404 ที่นี่มักแปลว่า workflow ยังไม่ถูก merge เข้า main (GitHub หา file ไม่เจอ)
    // ไม่ใช่เรื่องสิทธิ์ — บอกให้ชัดจะได้ไม่ไปไล่หา token ผิดที่
    if (res.status === 404) {
      return NextResponse.json({
        error: "GitHub หา workflow ไม่เจอ",
        hint: `ต้อง push ${WORKFLOW} ขึ้น main ก่อน แล้ว GitHub ถึงจะรู้จัก`,
      }, { status: 404 })
    }
    return NextResponse.json({ error: `GitHub ตอบ ${res.status}`, detail: detail.slice(0, 250) },
                             { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function dispatch(token, inputs) {
  return fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs }),
  })
}

// ── โปสเตอร์ "ส่อง 5 ใบเด็ด" ──
// 1) ต้องมีข้อมูล 5 ใบที่ตัวเขียนเก็บไว้ (ใช้ชุดเดียวกับแคปชั่น — ดู lib/top5.js → top5Path)
// 2) AI วาดพื้นหลัง → อัปไว้ใน aibg/ (top5_poster.py รับพื้นหลังจากโฟลเดอร์นี้เท่านั้น)
// 3) สั่ง workflow เดิม (poster-render.yml) พร้อม template=top5
// วาดพื้นหลังไม่สำเร็จไม่ใช่เหตุให้หยุด — เทมเพลตมีพื้นแบรนด์ของมันเอง แค่บอกผู้ใช้ให้รู้
async function top5Poster(id, token) {
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  const probe = await fetch(`${SB_URL}/storage/v1/object/public/${TOP5_BUCKET}/${top5Path(id)}`,
                            { method: "HEAD" }).catch(() => null)
  if (!probe?.ok) {
    return NextResponse.json({
      error: "ยังไม่มีข้อมูล 5 ใบของโพสต์นี้",
      hint: "กด 'เขียนใหม่' หนึ่งครั้งให้ระบบดึงการ์ดและราคาเก็บไว้ก่อน แล้วค่อยกดทำโปสเตอร์",
    }, { status: 409 })
  }

  let bgUrl = null, bgNote = ""
  try {
    const bg = await generateBackground(await top5BackgroundPrompt("OP"),
                                        { deadline: Date.now() + 200_000 })
    const key = `aibg/top5-${id}-${Date.now()}.png`
    const up = await fetch(`${SB_URL}/storage/v1/object/${TOP5_BUCKET}/${key}`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": bg.mime, "x-upsert": "true" },
      body: bg.buf,
    })
    if (!up.ok) throw new Error(`อัปพื้นหลังไม่สำเร็จ (${up.status})`)
    bgUrl = `${SB_URL}/storage/v1/object/public/${TOP5_BUCKET}/${key}`
  } catch (e) {
    bgNote = ` · วาดพื้นหลังด้วย AI ไม่สำเร็จ (${String(e.message || e).slice(0, 80)}) ใช้พื้นแบรนด์แทน`
  }

  try {
    const res = await dispatch(token, { content_id: String(id), template: "top5", ...(bgUrl ? { bg: bgUrl } : {}) })
    if (res.status === 204) {
      return NextResponse.json({
        success: true,
        message: `สั่งทำโปสเตอร์ 5 ใบเด็ดแล้ว — รูปจะขึ้นเองเมื่อเสร็จ (ราว 1-2 นาที) ไม่ต้องกดอะไร${bgNote}`,
        background: bgUrl,
      })
    }
    const detail = await res.text().catch(() => "")
    return NextResponse.json({ error: `GitHub ตอบ ${res.status}`, detail: detail.slice(0, 250) },
                             { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
