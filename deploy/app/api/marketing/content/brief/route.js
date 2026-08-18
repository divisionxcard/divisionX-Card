// บรีฟสั่งทำภาพ — POST /api/marketing/content/brief { id }
//
// คืนข้อความก้อนเดียวที่เจ้าของก๊อปไปวางใน ChatGPT ได้ทันที เพื่อให้มันออกแบบภาพโพสต์
//
// ทำไมต้องมี: ทดสอบแล้วพบว่าเอาแคปชั่นไปวางเฉย ๆ ได้ดีไซน์สวยก็จริง แต่โมเดล
// "สร้างสินค้าขึ้นมาเอง" ทุกครั้ง — ซองการ์ดที่ไม่มีอยู่จริง ชื่อชุดที่ไม่มี
// และเอาโลโก้ DivisionX ไปแปะบนซองของ Bandai ซึ่งเป็นเรื่องเครื่องหมายการค้า
// บรีฟนี้จึงล็อกสองอย่าง: ข้อเท็จจริงจากฐานข้อมูล และรายการรูปจริงที่ต้องแนบ
//
// ⚠️ รันฝั่งเซิร์ฟเวอร์ ไม่ใช่ผ่าน Hermes ในเครื่องเจ้าของ — จะได้กดใช้จากมือถือได้ด้วย
// ใช้กฎชุดเดียวกับที่ Hermes ใช้ (tasks/content_voice.json) จึงได้ผลแนวเดียวกัน
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../../../lib/apiAuth"
import { askGeminiText } from "../../../../../lib/geminiText"
import { readFile } from "fs/promises"
import path from "path"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PUBLIC = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`

async function loadJson(name) {
  try { return JSON.parse(await readFile(path.join(process.cwd(), "tasks", name), "utf-8")) }
  catch { return null }
}

// ── ข้อเท็จจริงจากฐานข้อมูล — ส่วนที่ทำให้ต่างจากการพิมพ์บรีฟเอง ──
async function gatherFacts() {
  const since = new Date(Date.now() - 7 * 864e5).toISOString()
  const [{ data: machines }, { data: sales }, { data: stock }, { data: skus }] = await Promise.all([
    db.from("machines").select("machine_id").eq("status", "active"),
    db.from("sales").select("sku_id,quantity_sold,grand_total").gte("sold_at", since),
    db.from("machine_stock").select("sku_id,remain").eq("is_occupied", true),
    db.from("skus").select("sku_id,name,image_url").eq("is_active", true),
  ])

  const bySku = {}
  for (const s of sales || []) {
    if (!s.sku_id) continue
    bySku[s.sku_id] = (bySku[s.sku_id] || 0) + Number(s.grand_total || 0)
  }
  const top = Object.entries(bySku).sort((a, b) => b[1] - a[1]).slice(0, 3)

  // ของที่หมดหน้าตู้ทุกช่อง — ห้ามให้ภาพไปเชียร์
  const totals = {}
  for (const r of stock || []) {
    if (!r.sku_id) continue
    totals[r.sku_id] = (totals[r.sku_id] || 0) + (r.remain || 0)
  }
  const soldOut = Object.entries(totals).filter(([, v]) => v === 0).map(([k]) => k)

  const imageOf = {}
  for (const s of skus || []) if (s.image_url) imageOf[s.sku_id] = s.image_url

  return { branches: (machines || []).length, top, soldOut, imageOf }
}

// ⚠ ห้ามยิง Gemini ตรง ๆ ที่นี่ — ต้องผ่าน askGeminiText ที่ลองซ้ำและสลับโมเดลให้
// เจอจริงตอนทดสอบครั้งแรก: ยิงครั้งเดียวแล้วได้ 503 ทันที บรีฟหลุดไปใช้ตัวสำรองทั้งที่ไม่จำเป็น
async function askGemini(prompt) {
  try {
    const { text } = await askGeminiText(prompt, { temperature: 0.7 })
    return text || null
  } catch {
    return null   // ล้มจริง ๆ ค่อยตกไปใช้บรีฟที่ประกอบจากข้อมูลตรง ๆ
  }
}

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const id = parseInt(body.id, 10)
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 })

  const { data: content, error } = await db.from("marketing_content")
    .select("id,caption,source_sku,content_format").eq("id", id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!content) return NextResponse.json({ error: `ไม่พบรายการ id=${id}` }, { status: 404 })

  const voice = await loadJson("content_voice.json") || {}
  const { branches, top, soldOut, imageOf } = await gatherFacts()
  const caption = (content.caption || "").trim()
  if (!caption) return NextResponse.json({ error: "ชิ้นนี้ยังไม่มีแคปชั่น — ให้ AI เขียนก่อน" }, { status: 409 })

  // รูปที่ต้องแนบ: ของ SKU ที่โพสต์พูดถึงมาก่อน แล้วตามด้วยตัวขายดี
  const wanted = [content.source_sku, ...top.map(([sku]) => sku)]
    .filter((s, i, a) => s && a.indexOf(s) === i && imageOf[s] && !soldOut.includes(s))
    .slice(0, 3)
  const refs = wanted.map(s => ({ sku: s, url: imageOf[s] }))

  const skeleton = `เขียน "บรีฟสั่งทำภาพ" ภาษาไทย ที่เจ้าของจะก๊อปไปวางใน ChatGPT เพื่อให้ออกแบบภาพโพสต์ Facebook 1:1

แคปชั่นที่อนุมัติแล้ว:
${caption}

กติกาที่บรีฟต้องบังคับไว้ (ห้ามตัดออก):
- ใช้รูปสินค้าที่แนบมาเท่านั้น ห้ามวาดซองขึ้นใหม่ ห้ามเปลี่ยนสี ลาย หรือตัวหนังสือบนซอง
- ห้ามสร้างชุดการ์ดหรือสินค้าที่ไม่ได้อยู่ในรูปที่แนบ
- ห้ามเอาโลโก้ DivisionX ไปแปะบนซองการ์ด (DivisionX คือร้าน ไม่ใช่ผู้ผลิตการ์ด)
- ข้อความบนภาพต้องคัดจากแคปชั่นเท่านั้น ห้ามแต่งประโยคใหม่ ห้ามสะกดเอง
- ${(voice.rules || []).join("\n- ")}

ข้อเท็จจริงที่ห้ามเปลี่ยน:
- จำนวนสาขา ${branches} สาขา
- ชุดที่ขายดี 7 วันล่าสุด: ${top.map(([s, v]) => `${s} (${Math.round(v).toLocaleString()} บาท)`).join(" · ") || "ไม่มีข้อมูล"}
${soldOut.length ? `- ห้ามใส่ในภาพเพราะของหมดหน้าตู้: ${soldOut.join(" · ")}` : ""}

อัตลักษณ์ภาพของแบรนด์: ฟ้านีออนไฟฟ้า + สายฟ้า + โครเมียม บนพื้นกรมท่า (ไม่ใช่ดำ-ทอง)
โทนแบรนด์: ${voice.tone || ""}

โครงบรีฟที่ต้องเขียนออกมา:
1. โจทย์ของภาพ (อารมณ์ ใครคือคนดู)
2. โครงหน้าและองค์ประกอบ — ให้เล่าเรื่องตามแคปชั่น ไม่ใช่แค่วางสินค้ากลางภาพ
3. ข้อความที่จะขึ้นบนภาพ (คัดจากแคปชั่น แยกว่าอันไหนพาดหัว อันไหนรอง)
4. คำสั่งด้านสไตล์ภาพ — ส่วนนี้เขียนเป็นภาษาอังกฤษ เพราะโมเดลภาพเข้าใจดีกว่า
5. ข้อห้าม
6. รูปที่ต้องแนบ

เขียนออกมาเป็นข้อความพร้อมใช้ ไม่ต้องมีคำอธิบายนำ ไม่ต้องมีหัวข้อว่า "นี่คือบรีฟ"`

  let brief = await askGemini(skeleton)

  // ไม่มี key หรือโควตาหมด — ยังต้องได้บรีฟที่ใช้ได้ ไม่ใช่หน้าจอว่าง
  // ประกอบจากข้อมูลจริงตรง ๆ แทน (เนื้อหาหลักคือกติกากับข้อเท็จจริง ซึ่งไม่ต้องพึ่ง AI อยู่แล้ว)
  if (!brief) {
    brief = [
      "ออกแบบภาพโพสต์ Facebook 1:1 ให้ DivisionX Card — ตู้กดการ์ดสะสมอัตโนมัติในห้าง",
      "",
      "แคปชั่นของโพสต์นี้ (ใช้คัดข้อความขึ้นภาพ ห้ามแต่งใหม่):",
      caption,
      "",
      "กติกาเรื่องสินค้า:",
      "- ใช้รูปสินค้าที่แนบมาเท่านั้น ห้ามวาดซองขึ้นใหม่ ห้ามเปลี่ยนสี ลาย หรือตัวหนังสือบนซอง",
      "- ห้ามสร้างชุดการ์ดที่ไม่ได้อยู่ในรูปที่แนบ",
      "- ห้ามเอาโลโก้ DivisionX ไปแปะบนซองการ์ด",
      "",
      "ข้อเท็จจริงที่ห้ามเปลี่ยน:",
      `- ${branches} สาขา`,
      top.length ? `- ชุดขายดี 7 วันล่าสุด: ${top.map(([s]) => s).join(" · ")}` : "",
      soldOut.length ? `- ห้ามใส่ในภาพ (ของหมดหน้าตู้): ${soldOut.join(" · ")}` : "",
      "",
      "ข้อห้าม:",
      ...(voice.rules || []).map(r => `- ${r}`),
      "",
      "Style: Electric neon blue with lightning arcs and chrome accents on deep navy.",
      "High contrast, dramatic rim lighting, bold Thai display type readable in 3 seconds.",
      "NOT black-and-gold.",
    ].filter(Boolean).join("\n")
  }

  // ⚠️ ChatGPT เปิด URL เองไม่ได้ — ต้องเป็นไฟล์ที่ "อัปโหลดเข้าแชต" เท่านั้น
  // รอบแรกที่ทดสอบจริง มันปฏิเสธไม่ยอมสร้างภาพเลยเพราะได้มาแค่ลิงก์ (ซึ่งถูกต้องแล้ว)
  // บรีฟจึงต้องสั่งเป็นภาษาที่ตรงกับสิ่งที่คนต้องทำ ไม่ใช่แค่แปะลิงก์ไว้เฉย ๆ
  const machineUrl = `${PUBLIC}/marketing/machine/machine-scene.jpg`
  const refLines = refs.length
    ? refs.map((r, i) => `${i + 1}. ซอง ${r.sku}`).join("\n")
    : "1. (ไม่มีรูปซองในระบบสำหรับ SKU นี้ — ใช้รูปถ่ายเองแทน)"

  const attach =
    "📎 ก่อนสั่งทำภาพ ต้องอัปโหลดไฟล์รูปเข้าไปในแชตก่อน — วางแค่ลิงก์ใช้ไม่ได้\n" +
    "(กดปุ่ม \"ดาวน์โหลดรูปแนบ\" ในหน้า /marketing แล้วลากไฟล์ทั้งหมดเข้าแชต)\n\n" +
    "รูปที่ต้องแนบ:\n" + refLines + `\n${refs.length + 1}. รูปตู้ DivisionX จริง\n\n` +
    "ถ้ายังไม่ได้แนบครบ อย่าเพิ่งสร้างภาพ — เพราะจะกลายเป็นวาดซองขึ้นมาเองซึ่งผิดจากของจริง"

  return NextResponse.json({
    ok: true,
    brief: `${brief}\n\n${attach}`,
    download: [...refs.map(r => r.url), machineUrl],
    refs,
    facts: { branches, top: top.map(([sku, v]) => ({ sku, revenue: Math.round(v) })), sold_out: soldOut },
    generated_by: process.env.GEMINI_API_KEY ? "gemini" : "template",
  })
}
