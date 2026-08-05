// ให้ AI เขียนแคปชั่นจริงจากไอเดีย — POST /api/marketing/content/generate { id }
//
// ไอเดียที่เก็บมาเป็นแค่ "ข้อมูลอ้างอิง" ตัวนี้เปลี่ยนให้เป็นแคปชั่นที่อ่านแล้วตรวจได้เลย
// แล้วเลื่อนสถานะ draft → pending (เข้ากล่องรออนุมัติ)
//
// ⚠️ ใช้ Ollama ที่ localhost — รันได้เฉพาะตอนเปิดเว็บบนเครื่องที่มี Ollama
//    ถ้า deploy ขึ้น Vercel จะต่อไม่ได้ (serverless อยู่คนละเครื่อง) → คืน 503 พร้อมบอกเหตุผล
//    ทางแก้ถ้าอยากให้ทำงานบน Vercel: ใส่ ANTHROPIC_API_KEY แล้วต่อ Claude แทน (ดู TODO ล่างสุด)
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"
import { requireAdmin } from "../../../../../lib/apiAuth"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// โทนแบรนด์อยู่ในไฟล์ JSON เพื่อให้ปรับเสียงได้โดยไม่ต้องแก้โค้ด
async function loadVoice() {
  const p = path.join(process.cwd(), "tasks", "content_voice.json")
  return JSON.parse(await readFile(p, "utf-8"))
}

function buildPrompt(voice, idea, content, sku) {
  const rules = voice.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
  const phrases = voice.catchphrases.map(p => `- "${p}"`).join("\n")

  // ตัวอย่างภาษาไทยเป็นตัวแปรสำคัญที่สุด — qwen เป็นโมเดลจีน สั่งเป็นข้อความอย่างเดียว
  // ยังเขียนออกมาเป็นจีนอยู่ดี (ทดสอบแล้ว) · ใส่ตัวอย่างช่วยทั้งภาษาและความเร็ว
  const example = voice.example
    ? `\nตัวอย่างแคปชั่นที่ถูกต้อง (ใช้เป็นแบบอย่างของ "ภาษา/โทน" เท่านั้น ห้ามลอกเนื้อหา):\n---\n${voice.example}\n---\n`
    : ""

  const system = `คุณเป็นคนเขียนคอนเทนต์ให้ ${voice.brand}
สโลแกน: "${voice.slogan}" · กลุ่มเป้าหมาย: ${voice.audience}
โทนเสียง: ${voice.tone}

**ภาษา: เขียนเป็นภาษาไทยเท่านั้น** ห้ามใช้ภาษาจีน ญี่ปุ่น หรืออังกฤษเป็นประโยค
(ชื่อการ์ด/ชุด เช่น "One Piece OP-13" เป็นอังกฤษได้)

วลีติดปากของแบรนด์ (หยิบใช้ตามบริบท ไม่ต้องยัดทุกอัน):
${phrases}

กฎเข้ม:
${rules}
${example}
ตอบกลับเป็น "ตัวแคปชั่นล้วน ๆ" เท่านั้น ห้ามมีคำอธิบาย ห้ามมีหัวข้อ ห้ามครอบด้วยเครื่องหมายคำพูด`

  const facts = [
    `หัวข้อ/ที่มา: ${idea?.title || content.source_reason || "-"}`,
    idea?.angle ? `มุมที่อยากเล่า: ${idea.angle}` : null,
    idea?.summary && !idea.summary.startsWith("ปก:") ? `รายละเอียดเพิ่ม: ${idea.summary}` : null,
    sku ? `สินค้าที่โยงถึง: ${sku.name} (${sku.sku_id})` : null,
    `แพลตฟอร์ม: ${content.platform === "line" ? "LINE OA" : "Facebook เพจ"}`,
  ].filter(Boolean).join("\n")

  // คำสั่งภาษาย้ำท้ายสุด — โมเดลให้น้ำหนักกับสิ่งที่อยู่ท้าย prompt มากกว่า
  const user = `เขียนแคปชั่น 1 ชิ้นจากข้อมูลนี้:

${facts}

อย่าลอกหัวข้อข่าวมาตรง ๆ ให้เอาแก่นของเรื่องมาเล่าใหม่ในมุมของตู้ DivisionX

⚠️ เขียนเป็นภาษาไทยเท่านั้น`

  return { system, user }
}

const ollamaHost = (voice) =>
  process.env.OLLAMA_HOST || voice.ollama_host || "http://localhost:11434"

// เช็กก่อนว่าต่อติดไหม (timeout สั้น) — แยกให้ชัดระหว่าง "ต่อไม่ได้" กับ "เขียนนานเกินไป"
// ถ้าไม่แยก ตอน generate ช้าแล้ว abort จะขึ้นข้อความว่า "เปิดแอป Ollama ก่อน" ทั้งที่เปิดอยู่
async function probeOllama(voice) {
  const host = ollamaHost(voice)
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { ok: false, reason: `Ollama ตอบ ${res.status}`, host }
    const json = await res.json()
    const models = (json.models || []).map(m => m.name)
    const want = process.env.OLLAMA_MODEL || voice.ollama_model
    if (want && !models.includes(want)) {
      return { ok: false, host, models,
        reason: `ไม่พบโมเดล "${want}" บนเครื่องนี้ (มีอยู่: ${models.join(", ") || "ไม่มีเลย"}) — ` +
                `รัน \`ollama pull ${want}\` หรือแก้ ollama_model ใน deploy/tasks/content_voice.json` }
    }
    return { ok: true, host, models }
  } catch (e) {
    return { ok: false, host, reason:
      `ต่อ Ollama ที่ ${host} ไม่ได้ — เปิดแอป Ollama บนเครื่องที่รันเว็บนี้ก่อน ` +
      `(ถ้าเปิดหน้าเว็บจาก Vercel จะใช้ไม่ได้ เพราะ Ollama อยู่บนเครื่องคุณคนละที่กับ server)` }
  }
}

async function askOllama(voice, prompt, signal) {
  const host = ollamaHost(voice)
  const model = process.env.OLLAMA_MODEL || voice.ollama_model || "qwen2.5:14b"
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      options: { temperature: 0.8 },
    }),
    signal,
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  return { text: (json.message?.content || "").trim(), model }
}

// เก็บกวาดผลลัพธ์: บางครั้งโมเดลครอบด้วย quote หรือแถมหัวข้อมาให้
function tidy(text) {
  let t = (text || "").trim()
  t = t.replace(/^```[\w]*\s*|\s*```$/g, "").trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("«") && t.endsWith("»"))) {
    t = t.slice(1, -1).trim()
  }
  t = t.replace(/^(แคปชั่น|caption)\s*[:：]\s*/i, "").trim()
  return t
}

// เช็กภาษา — เคยเจอ Ollama เขียนโพสต์ภาษาญี่ปุ่นทั้งโพสต์หลุดเข้าคิวมาแล้ว
function looksThai(text) {
  const thai = (text.match(/[฀-๿]/g) || []).length
  const cjk = (text.match(/[぀-ヿ一-鿿]/g) || []).length
  return thai >= 20 && thai > cjk
}

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const id = parseInt(body.id, 10)
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 })

  try {
    const { data: content, error: e0 } = await db.from("marketing_content")
      .select("*, idea:marketing_ideas!marketing_content_idea_id_fkey(id,title,angle,summary,url,related_sku)")
      .eq("id", id).maybeSingle()
    if (e0) throw e0
    if (!content) return NextResponse.json({ error: `ไม่พบรายการ id=${id}` }, { status: 404 })

    const idea = content.idea || null
    let sku = null
    const skuId = content.source_sku || idea?.related_sku
    if (skuId) {
      const { data } = await db.from("skus").select("sku_id,name").eq("sku_id", skuId).maybeSingle()
      sku = data
    }

    const voice = await loadVoice()

    // เช็กการเชื่อมต่อ + ว่ามีโมเดลจริงไหม ก่อนเริ่มงานยาว
    const probe = await probeOllama(voice)
    if (!probe.ok) {
      return NextResponse.json({ error: probe.reason, host: probe.host }, { status: 503 })
    }

    const prompt = buildPrompt(voice, idea, content, sku)

    // qwen2.5:14b บนเครื่องทั่วไปใช้เวลาราว 15-60 วิ · รอบแรกที่โหลดโมเดลเข้าแรมนานกว่านั้นได้
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 180000)
    let out
    try {
      out = await askOllama(voice, prompt, ac.signal)
    } catch (e) {
      // ต่อติดแล้ว (ผ่าน probe มา) → ที่พังตรงนี้คือ "เขียนไม่เสร็จ" ไม่ใช่ "ต่อไม่ได้"
      const timedOut = ac.signal.aborted
      return NextResponse.json({
        error: timedOut
          ? `โมเดล ${probe.models?.join("/") || ""} เขียนไม่เสร็จใน 3 นาที — ` +
            `ลองเปลี่ยนเป็นโมเดลเล็กลง (qwen2.5:7b) ใน deploy/tasks/content_voice.json`
          : `Ollama ตอบผิดพลาด: ${String(e).slice(0, 200)}`,
      }, { status: 504 })
    } finally { clearTimeout(timer) }

    const caption = tidy(out.text)
    if (!caption) {
      return NextResponse.json({ error: "โมเดลตอบว่าง — ลองกดเขียนใหม่อีกครั้ง" }, { status: 502 })
    }
    if (!looksThai(caption)) {
      // ไม่บันทึกลง DB — กันโพสต์ผิดภาษาหลุดเข้าคิวรออนุมัติ
      return NextResponse.json({
        error: "โมเดลเขียนออกมาไม่ใช่ภาษาไทย — ไม่บันทึก ลองกดเขียนใหม่",
        preview: caption.slice(0, 160),
      }, { status: 422 })
    }

    const { data: updated, error: e1 } = await db.from("marketing_content")
      .update({ caption, status: "pending", created_by: "ai" })
      .eq("id", id).select(
        "*, idea:marketing_ideas!marketing_content_idea_id_fkey(id,url,source,source_label)"
      ).maybeSingle()
    if (e1) throw e1

    return NextResponse.json({ ...updated, generated_by: out.model })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// TODO (ถ้าจะ deploy ให้ใช้บน Vercel ได้): เพิ่มทางเลือกเรียก Claude เมื่อ Ollama ต่อไม่ได้
// — ต้องมี ANTHROPIC_API_KEY และยอมรับค่าใช้จ่ายต่อครั้ง ตอนนี้เลือก Ollama ก่อนเพราะฟรี
