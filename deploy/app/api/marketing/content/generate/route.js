// ให้ AI เขียนแคปชั่นจริงจากไอเดีย — POST /api/marketing/content/generate { id }
//
// ไอเดียที่เก็บมาเป็นแค่ "ข้อมูลอ้างอิง" ตัวนี้เปลี่ยนให้เป็นแคปชั่นที่อ่านแล้วตรวจได้เลย
// แล้วเลื่อนสถานะ draft → pending (เข้ากล่องรออนุมัติ)
//
// เลือกผู้เขียนอัตโนมัติตามลำดับ (หรือบังคับด้วย AI_PROVIDER=claude|gemini|ollama):
//   1. ANTHROPIC_API_KEY → Claude   ทำงานทุกที่ · เสียเงินต่อครั้ง · คุณภาพสูงสุด
//   2. GEMINI_API_KEY    → Gemini   ทำงานทุกที่ · free tier 1,500 ครั้ง/วัน ไม่ต้องใช้บัตร
//   3. ไม่มี key เลย     → Ollama   ฟรี 100% · ใช้ได้เฉพาะเปิดเว็บจากเครื่องที่มี Ollama
//
// ทำไมต้องมีหลายทาง: Vercel เป็น serverless คนละเครื่องกับคอมที่รัน Ollama จึงต่อ
// localhost:11434 ไม่ได้เลย — บน production ต้องใช้ provider ที่เรียกผ่านเน็ตได้
//
// ⚠️ free tier ของทุกเจ้ามักเอา prompt ไปเทรนโมเดลต่อ — งานนี้ส่งแค่หัวข้อข่าวสาธารณะ
//    กับชื่อสินค้า ไม่มีข้อมูลลูกค้า/ยอดขาย จึงรับได้ · อย่าเอา provider ฟรีไปใช้กับข้อมูลลับ
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"
import Anthropic from "@anthropic-ai/sdk"
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

// ── Gemini — free tier 1,500 ครั้ง/วัน ไม่ต้องผูกบัตร (ทำงานบน Vercel ได้) ──
// เรียกผ่าน REST ตรง ๆ ไม่ลง SDK เพิ่ม — request shape ของ generateContent เรียบง่ายและนิ่ง
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

// ใช้ alias "-latest" เป็นค่าตั้งต้น — Google ปลดรุ่นเก่าออกจากผู้ใช้ใหม่เป็นระยะ
// (gemini-2.5-flash โดนไปแล้วทั้งที่ยังโผล่ใน ListModels) alias จะชี้รุ่นปัจจุบันเสมอ
const GEMINI_DEFAULT = "gemini-flash-latest"

async function askGemini(voice, prompt) {
  const key = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL || voice.gemini_model || GEMINI_DEFAULT
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
      // 2048 ไม่ใช่เพราะแคปชั่นยาว — แคปชั่นใช้จริงแค่ ~40 token
      // แต่รุ่นใหม่ "คิด" ก่อนตอบ และ thinking กินโควตา output ด้วย (วัดได้ ~550 token/ครั้ง)
      // ถ้าตั้ง 1024 แล้ววันไหนคิดนานกว่าปกติ จะได้ finishReason=MAX_TOKENS พร้อมข้อความว่าง
      // ปิด thinking ไม่ได้ — thinkingConfig.thinkingBudget=0 ถูกปฏิเสธในรุ่นนี้ (ทดสอบแล้ว)
      generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(60000),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`
    // 429 = ใช้เกินโควตาฟรีของวันนี้ — บอกให้ชัดว่าไม่ใช่ระบบพัง
    if (res.status === 429) {
      throw new Error(`ใช้โควตาฟรีของ Gemini ครบแล้ววันนี้ (${msg}) — รอพรุ่งนี้ หรือสลับไปใช้ Ollama บนเครื่อง`)
    }
    // Google ปลดรุ่นเก่าเป็นระยะ และ ListModels ยังโชว์อยู่ → probe จับไม่ได้ ต้องดักตรงนี้
    if (/no longer available|not found|is not supported/i.test(msg)) {
      throw new Error(
        `โมเดล "${model}" ใช้ไม่ได้แล้ว (${msg.slice(0, 120)}) — ` +
        `แก้ gemini_model ใน deploy/tasks/content_voice.json เป็น "${GEMINI_DEFAULT}" ` +
        `หรือ gemini-flash-lite-latest`)
    }
    throw new Error(msg)
  }
  // ถูกบล็อกด้วย safety filter — ไม่มี candidates กลับมา
  const blocked = json?.promptFeedback?.blockReason
  if (blocked) throw new Error(`Gemini บล็อกคำขอนี้ (${blocked}) — ลองแก้หัวข้อไอเดียแล้วสั่งใหม่`)

  const cand = json?.candidates?.[0]
  const text = (cand?.content?.parts || [])
    .map(p => p.text).filter(Boolean).join("\n").trim()

  // ตอบว่างเพราะโควตา output หมดไปกับ thinking — บอกทางแก้ให้ชัด ไม่ใช่แค่ "โมเดลตอบว่าง"
  if (!text && cand?.finishReason === "MAX_TOKENS") {
    throw new Error(
      `โมเดลใช้โควตาไปกับการคิดจนไม่เหลือเขียน (thinking ${json?.usageMetadata?.thoughtsTokenCount || "?"} token) — ` +
      `เพิ่ม maxOutputTokens ในโค้ด หรือสลับเป็น gemini-flash-lite-latest ที่คิดน้อยกว่า`)
  }
  return { text, model }
}

// เช็กเฉพาะว่า key ใช้ได้ไหม — **ไม่เช็กชื่อโมเดล**
//
// ทำไมไม่เช็ก: ListModels ยังคืนรุ่นที่ถูกปลดไปแล้วมาด้วย (เจอจริงกับ gemini-2.5-flash
// ที่ list ขึ้นแต่ generateContent ตอบ "no longer available to new users")
// probe ที่ผ่านทั้งที่ใช้จริงไม่ได้ = ให้ความมั่นใจผิด แย่กว่าไม่เช็กเลย
// ปล่อยให้ askGemini ดักจาก error จริงแทน (ข้อความชัดกว่าและถูกต้องเสมอ)
async function probeGemini() {
  try {
    const res = await fetch(`${GEMINI_BASE}/models`, {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) return { ok: true }
    const json = await res.json().catch(() => ({}))
    return { ok: false, reason: `Gemini API key ใช้ไม่ได้: ${json?.error?.message || res.status}` }
  } catch (e) {
    return { ok: false, reason: `ต่อ Gemini ไม่ได้: ${String(e.message || e).slice(0, 150)}` }
  }
}

// ── Claude — ใช้เมื่อมี ANTHROPIC_API_KEY (ทำงานบน Vercel ได้) ──────────
async function askClaude(voice, prompt) {
  const client = new Anthropic()   // อ่าน ANTHROPIC_API_KEY จาก env เอง
  const model = process.env.ANTHROPIC_MODEL || voice.claude_model || "claude-opus-5"
  const res = await client.messages.create({
    model,
    max_tokens: 1024,                        // แคปชั่นสั้น ไม่ต้องเผื่อเยอะ
    output_config: { effort: "low" },        // งานเขียนสั้น ไม่ต้องคิดหนัก — ประหยัดทั้งเวลาและเงิน
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  })
  // safety classifier ปฏิเสธได้ — ต้องเช็กก่อนอ่าน content ไม่งั้น content[0] จะพัง
  if (res.stop_reason === "refusal") {
    throw new Error("Claude ปฏิเสธคำขอนี้ (safety) — ลองแก้หัวข้อไอเดียแล้วสั่งใหม่")
  }
  const text = res.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim()
  return { text, model }
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
    const prompt = buildPrompt(voice, idea, content, sku)

    // บังคับด้วย AI_PROVIDER ได้ ไม่งั้นเลือกตัวแรกที่พร้อมใช้
    const forced = (process.env.AI_PROVIDER || "").toLowerCase()
    const provider = forced || (
      process.env.ANTHROPIC_API_KEY ? "claude"
      : process.env.GEMINI_API_KEY ? "gemini"
      : "ollama")

    let out
    if (provider === "claude") {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: "ตั้ง AI_PROVIDER=claude แต่ไม่มี ANTHROPIC_API_KEY" }, { status: 503 })
      }
      try {
        out = await askClaude(voice, prompt)
      } catch (e) {
        return NextResponse.json(
          { error: `Claude ตอบผิดพลาด: ${String(e.message || e).slice(0, 250)}` },
          { status: 502 })
      }
    } else if (provider === "gemini") {
      if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json({
          error: "ยังไม่ได้ตั้ง GEMINI_API_KEY",
          hint: "ขอฟรีที่ ai.google.dev (ใช้ Google account ไม่ต้องผูกบัตร) แล้วใส่เป็น environment variable",
        }, { status: 503 })
      }
      const probe = await probeGemini()
      if (!probe.ok) return NextResponse.json({ error: probe.reason }, { status: 503 })
      try {
        out = await askGemini(voice, prompt)
      } catch (e) {
        return NextResponse.json(
          { error: `Gemini: ${String(e.message || e).slice(0, 250)}` },
          { status: 502 })
      }
    } else {
      // เช็กการเชื่อมต่อ + ว่ามีโมเดลจริงไหม ก่อนเริ่มงานยาว
      const probe = await probeOllama(voice)
      if (!probe.ok) {
        return NextResponse.json({
          error: probe.reason,
          host: probe.host,
          hint: "ถ้าอยากให้ใช้ได้จากทุกที่ (รวมเว็บบน Vercel) ให้ตั้ง GEMINI_API_KEY " +
                "(ฟรี 1,500 ครั้ง/วัน · ขอที่ ai.google.dev ไม่ต้องผูกบัตร) " +
                "หรือ ANTHROPIC_API_KEY ถ้าต้องการคุณภาพสูงสุด",
        }, { status: 503 })
      }

      // qwen2.5:14b บนเครื่องทั่วไปใช้เวลาราว 15-60 วิ · รอบแรกที่โหลดโมเดลเข้าแรมนานกว่านั้นได้
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 180000)
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
    }

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

    return NextResponse.json({
      ...updated,
      generated_by: out.model,
      provider,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
