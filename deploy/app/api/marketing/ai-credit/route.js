// เครดิต OpenAI คงเหลือ — GET อ่านยอด · POST บันทึกยอดที่อ่านจากหน้าเว็บมา
//
// ═══ ทำไมต้องคำนวณเอา ไม่ดึงยอดคงเหลือตรง ๆ ═══
// OpenAI ไม่เปิดให้อ่านยอดคงเหลือผ่าน API เลย ทดสอบยิงจริง 28 ส.ค. 2026:
//
//   GET /dashboard/billing/credit_grants
//     → 403 "must be made with a session key (that is, it can only be made from the browser)"
//   GET /v1/organization/costs        → 403 "Missing scopes: api.usage.read"
//   GET /v1/organization/usage/images → 403 "Missing scopes: api.usage.read"
//
// สองตัวหลังใช้ได้ถ้าเป็น **Admin key** (sk-admin-...) ซึ่งสร้างแยกจาก key ปกติที่
// ใช้เรียกโมเดล · แต่ให้ได้แค่ "ใช้ไปเท่าไหร่" ไม่มีทางรู้ "เหลือเท่าไหร่" จาก API
//
//   คงเหลือ = ยอดที่เจ้าของอ่านจากหน้าเว็บ ณ เวลาหนึ่ง − costs ตั้งแต่เวลานั้น
//
// ⚠️ ห้ามเอา OPENAI_API_KEY มาใช้แทน OPENAI_ADMIN_KEY — คนละสิทธิ์กัน
//    key ปกติจะได้ 403 missing scope ซึ่งอ่านแล้วเหมือน key ผิด ทั้งที่ key ถูก
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdmin } from "../../../../lib/apiAuth"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const COSTS_URL = "https://api.openai.com/v1/organization/costs"

// bucket ของ costs กว้าง 1 วันเสมอ (API รองรับแค่ "1d") · 180 = เพดานต่อหน้า
// ขอมากไว้ก่อนเพื่อลดจำนวนรอบ แล้ววนต่อด้วย next_page ถ้ายังไม่หมด
const PAGE_LIMIT = 180
const MAX_PAGES = 24          // กันวนไม่จบถ้า API เปลี่ยนพฤติกรรม (~12 ปีของ bucket รายวัน)

/**
 * รวมค่าใช้จ่ายทั้งองค์กรตั้งแต่ startTime (unix seconds) ถึงตอนนี้
 *
 * ⚠️ นับ "ทั้งองค์กร" ตั้งใจให้เป็นแบบนี้ — ไม่ได้กรองเฉพาะค่าสร้างภาพ
 *    เพราะสิ่งที่กินเครดิตมีมากกว่าโปสเตอร์ (ตรวจปรู๊ฟใช้โมเดลอ่านภาพ ·
 *    เขียนแคปชั่นตอนสลับไปใช้ OpenAI · กดจาก playground เอง)
 *    ตัวเลขที่เจ้าของอยากรู้คือ "เงินในบัญชีเหลือเท่าไหร่" ไม่ใช่ "โปสเตอร์กินไปเท่าไหร่"
 */
async function fetchSpend(key, startTime, signal) {
  let page = null
  let total = 0
  let days = 0

  for (let i = 0; i < MAX_PAGES; i++) {
    const u = new URL(COSTS_URL)
    u.searchParams.set("start_time", String(startTime))
    u.searchParams.set("limit", String(PAGE_LIMIT))
    if (page) u.searchParams.set("page", page)

    const r = await fetch(u, { headers: { Authorization: `Bearer ${key}` }, signal })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      const msg = j?.error?.message || j?.error || `HTTP ${r.status}`
      throw Object.assign(new Error(String(msg)), { status: r.status })
    }

    // { object: "page", data: [ { results: [ { amount: { value, currency } } ] } ], has_more, next_page }
    //
    // ยืนยันกับของจริงแล้ว 28 ส.ค. 2026 (30 วัน → 31 bucket · has_more=false · limit=180 ผ่าน):
    //   { object: "bucket", start_time, end_time, start_time_iso, end_time_iso,
    //     results: [ { amount: { currency: "usd", value: 0.728766 },
    //                  project_id, api_key_id, line_item, ... } ] }
    // วันที่ไม่มีค่าใช้จ่ายจะได้ bucket ที่ results เป็น [] — วนแล้วบวก 0 เอง ไม่ต้องดักแยก
    for (const bucket of j.data || []) {
      days++
      for (const res of bucket.results || []) total += Number(res?.amount?.value || 0)
    }
    if (!j.has_more || !j.next_page) break
    page = j.next_page
  }
  return { total, days }
}

async function latestReading() {
  const { data, error } = await db.from("ai_credit_readings")
    .select("id,balance_usd,read_at,note")
    .eq("provider", "openai")
    .order("read_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function GET(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  const key = process.env.OPENAI_ADMIN_KEY
  const as_of = new Date().toISOString()

  let reading = null
  try {
    reading = await latestReading()
  } catch (e) {
    // ยังไม่ได้รัน migration 070 — บอกให้ตรง ๆ ไม่ใช่ปล่อยเป็น 500 ลอย ๆ
    const missing = /relation .*ai_credit_readings.* does not exist|schema cache/i
      .test(String(e.message || ""))
    return NextResponse.json({
      provider: "openai", as_of,
      state: missing ? "no_table" : "db_error",
      error: missing ? "ยังไม่ได้สร้างตารางเก็บยอดเครดิต" : String(e.message || e),
      hint: missing
        ? "รัน backend/database/migrations/070_ai_credit_readings.sql ใน Supabase → SQL Editor"
        : undefined,
    })
  }

  if (!key) {
    return NextResponse.json({
      provider: "openai", as_of, reading,
      state: "no_admin_key",
      error: "ยังไม่ได้ตั้ง OPENAI_ADMIN_KEY",
      hint: "สร้าง Admin key ที่ platform.openai.com → Settings → API keys → Admin keys " +
            "(คนละตัวกับ key ที่ใช้เรียกโมเดล) แล้วใส่เป็น OPENAI_ADMIN_KEY " +
            "ทั้งใน deploy/.env.local และ Vercel → Environment Variables",
    })
  }

  // ไม่มียอดตั้งต้น = คำนวณคงเหลือไม่ได้ แต่ยังบอกได้ว่าเดือนนี้ใช้ไปเท่าไหร่
  // ซึ่งมีประโยชน์กว่าขึ้นว่างเปล่า และช่วยให้เห็นว่า key ใช้ได้จริงก่อนกรอกยอด
  const since = reading?.read_at
    ? Math.floor(new Date(reading.read_at).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 86400 * 30

  let spend
  try {
    spend = await fetchSpend(key, since, AbortSignal.timeout(25_000))
  } catch (e) {
    const st = e.status
    // ⚠️ กับดักที่เจอจริง 28 ส.ค. 2026: สร้าง key ใหม่จากหน้า "API keys" แล้วได้ sk-proj-
    //    มันเป็น key คนละตัวกับตัวเดิมจริง เลยดูเหมือนทำถูกแล้ว แต่ไม่มีสิทธิ์ api.usage.read
    //    Admin key อยู่คนละหน้าในแถบซ้าย (Settings → Admin keys ไม่ใช่ API keys)
    //    และสร้างได้เฉพาะ Organization Owner
    //
    // ไม่ดักที่ prefix ก่อนยิง เพราะถ้า OpenAI เปลี่ยนรูปแบบ key วันหลัง
    // ตัวดักจะไปห้าม key ที่ใช้ได้จริง — ปล่อยให้ยิงก่อน แล้วค่อยใช้ prefix ช่วยอธิบายตอนพัง
    const looksProject = key.startsWith("sk-proj-")
    return NextResponse.json({
      provider: "openai", as_of, reading,
      state: "provider_error",
      error: st === 401 ? "OPENAI_ADMIN_KEY ใช้ไม่ได้ (401)"
           : st === 403 ? (looksProject
               ? "key ที่ตั้งไว้ขึ้นต้นด้วย sk-proj- — เป็น API key ธรรมดา ไม่ใช่ Admin key"
               : "key ที่ตั้งไว้ไม่มีสิทธิ์ api.usage.read")
           : `อ่านค่าใช้จ่ายจาก OpenAI ไม่สำเร็จ — ${String(e.message || e).slice(0, 160)}`,
      hint: st === 403
        ? "สร้างที่ platform.openai.com/settings/organization/admin-keys — เป็นเมนู " +
          "\"Admin keys\" ในแถบซ้าย คนละหน้ากับ \"API keys\" · ค่าที่ได้ขึ้นต้นด้วย sk-admin- " +
          "· ต้องเป็น Organization Owner ถึงจะเห็นเมนูนี้ · อย่าเอาไปทับ OPENAI_API_KEY " +
          "เพราะ Admin key เรียกโมเดลไม่ได้"
        : undefined,
    })
  }

  const spent_usd = Math.round(spend.total * 10000) / 10000

  if (!reading) {
    return NextResponse.json({
      provider: "openai", as_of, reading: null,
      state: "no_reading",
      spent_usd, since_iso: new Date(since * 1000).toISOString(), days: spend.days,
      error: "ยังไม่ได้บันทึกยอดคงเหลือตั้งต้น",
      hint: "เปิด platform.openai.com → Billing แล้วเอายอดคงเหลือมากรอกไว้ครั้งเดียว " +
            "ระบบจะหักค่าใช้จ่ายให้เองหลังจากนั้น",
    })
  }

  const balance = Number(reading.balance_usd)
  return NextResponse.json({
    provider: "openai", as_of, reading,
    state: "ok",
    balance_usd: balance,
    spent_usd,
    remaining_usd: Math.round((balance - spent_usd) * 10000) / 10000,
    since_iso: new Date(since * 1000).toISOString(),
    days: spend.days,
    // ⚠️ bucket ของ costs กว้างวันละก้อน ถ้าบันทึกยอดกลางวัน ค่าใช้จ่ายของวันนั้น
    //    ก่อนหน้าที่จะบันทึกอาจถูกนับรวมมาด้วย — คลาดเคลื่อนได้ไม่เกินค่าใช้จ่าย 1 วัน
    //    แก้ได้ด้วยการบันทึกยอดใหม่อีกครั้ง ซึ่งรีเซ็ตจุดตั้งต้นให้เอง
    approximate: true,
  })
}

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  const balance = Number(body.balance_usd)
  if (!Number.isFinite(balance) || balance < 0) {
    return NextResponse.json({
      error: "ยอดคงเหลือต้องเป็นตัวเลขไม่ติดลบ",
      hint: "กรอกเป็นดอลลาร์ตามที่เห็นบนหน้า platform.openai.com → Billing เช่น 42.15",
    }, { status: 400 })
  }

  const { data, error } = await db.from("ai_credit_readings").insert({
    provider: "openai",
    balance_usd: balance,
    // ให้กรอกเวลาเองได้เผื่ออ่านยอดมาก่อนแล้วเพิ่งมากรอก · ไม่ส่งมาก็ใช้ตอนนี้
    read_at: body.read_at || new Date().toISOString(),
    note: body.note || null,
    created_by: gate.user?.id || null,
  }).select("id,balance_usd,read_at,note").maybeSingle()

  if (error) {
    const missing = /relation .*ai_credit_readings.* does not exist|schema cache/i
      .test(String(error.message || ""))
    return NextResponse.json({
      error: missing ? "ยังไม่ได้สร้างตารางเก็บยอดเครดิต" : error.message,
      hint: missing
        ? "รัน backend/database/migrations/070_ai_credit_readings.sql ใน Supabase → SQL Editor"
        : undefined,
    }, { status: missing ? 409 : 500 })
  }
  return NextResponse.json({ ok: true, reading: data })
}
