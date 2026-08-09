// แปลงคอนเทนต์ชิ้นเดียวไปหลายช่องทาง — POST /api/marketing/content/variants { id }
//
// เดิม 1 แถว = 1 ช่องทาง อยากลง FB + IG + TikTok ต้องกดสร้างใหม่ 3 รอบ
// แล้วก็ได้แคปชั่นเดียวกันเป๊ะเพราะโจทย์เดียวกัน — ซึ่งผิด แต่ละช่องมีธรรมเนียมคนละแบบ
//
// แนวคิดนี้ได้จาก heroaiengine ที่เจ้าของเอามาให้ดู: สร้างครั้งเดียวได้
// FB/IG/TikTok/สคริปต์วิดีโอ พร้อมกัน แล้วปรับแยกกันได้
//
// ยิงครั้งเดียวให้โมเดลเขียนครบทุกช่องพร้อมกัน (ไม่ยิงแยกช่องละครั้ง) เพราะ
//   1. โมเดลเห็นทุกช่องพร้อมกัน จึงบังคับให้ "ห้ามเปิดประโยคเหมือนกัน" ได้จริง
//   2. ประหยัดโควตา — Gemini free tier ติดลิมิตต่อนาที ยิง 3 ครั้งชนง่ายมาก
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

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

// ช่องที่จะสร้างเพิ่ม — Facebook คือ caption หลักอยู่แล้ว ไม่ต้องทำซ้ำ
const TARGETS = [
  { key: "ig", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "script", label: "สคริปต์วิดีโอสั้น" },
]

async function loadJson(name) {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "tasks", name), "utf-8"))
  } catch { return null }
}

function buildPrompt(voice, craft, content) {
  const rules = (voice.rules || []).map((r, i) => `${i + 1}. ${r}`).join("\n")
  const vrules = (craft?.variants_rule || []).map(r => `- ${r}`).join("\n")
  const platRules = TARGETS
    .map(t => `**${t.key}** (${t.label}): ${craft?.platform?.[t.key] || "-"}`)
    .join("\n")

  const system = `คุณเป็นนักเขียนคอนเทนต์มืออาชีพให้ ${voice.brand}
โทนเสียง: ${voice.tone}
**ภาษา: เขียนเป็นภาษาไทยเท่านั้น**

กฎเข้ม:
${rules}`

  const user = `นี่คือโพสต์ Facebook ที่อนุมัติแล้ว:
---
${content.caption}
---

แปลงเรื่องเดียวกันนี้ไปอีก 3 ช่องทาง

ธรรมเนียมของแต่ละช่อง:
${platRules}

กฎการแปลง:
${vrules}

ตอบเป็น JSON เท่านั้น ห้ามมีคำอธิบายอื่น ห้ามครอบด้วย \`\`\`
{"ig":"...","tiktok":"...","script":"..."}

⚠️ เขียนเป็นภาษาไทยเท่านั้น · ตัวเลขและข้อเท็จจริงต้องตรงกับโพสต์ต้นฉบับทุกตัว`

  return { system, user }
}

function parseVariants(text) {
  let t = (text || "").trim().replace(/^```[a-z]*\s*|\s*```$/gi, "")
  const m = t.match(/\{[\s\S]*\}/)
  if (!m) return null
  let obj
  try { obj = JSON.parse(m[0]) } catch { return null }
  const out = {}
  for (const t2 of TARGETS) {
    const v = typeof obj[t2.key] === "string" ? obj[t2.key].trim() : ""
    if (v) out[t2.key] = v
  }
  return Object.keys(out).length ? out : null
}

// เคยเจอโมเดลเขียนโพสต์ภาษาญี่ปุ่นทั้งโพสต์หลุดเข้าคิวมาแล้ว — ตรวจก่อนบันทึกเสมอ
function looksThai(text) {
  const thai = (text.match(/[฀-๿]/g) || []).length
  const cjk = (text.match(/[぀-ヿ一-鿿]/g) || []).length
  return thai >= 15 && thai > cjk
}

async function askClaude(voice, prompt) {
  const client = new Anthropic()
  const model = process.env.ANTHROPIC_MODEL || voice.claude_model || "claude-opus-5"
  const res = await client.messages.create({
    model, max_tokens: 2048, output_config: { effort: "low" },
    system: prompt.system, messages: [{ role: "user", content: prompt.user }],
  })
  if (res.stop_reason === "refusal") throw new Error("Claude ปฏิเสธคำขอนี้")
  return res.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim()
}

async function askGemini(voice, prompt) {
  const model = process.env.GEMINI_MODEL || voice.gemini_model || "gemini-flash-latest"
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
      // 3 ช่องพร้อมกัน + thinking กินโควตา output ด้วย — เผื่อไว้มากกว่าตอนเขียนช่องเดียว
      generationConfig: { temperature: 0.85, maxOutputTokens: 4096 },
    }),
    signal: AbortSignal.timeout(90000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(json?.error?.message || `HTTP ${res.status}`)
    e.status = res.status
    throw e
  }
  const cand = json?.candidates?.[0]
  const text = (cand?.content?.parts || []).map(p => p.text).filter(Boolean).join("\n").trim()
  if (!text && cand?.finishReason === "MAX_TOKENS") {
    throw new Error("โมเดลใช้โควตาไปกับการคิดจนไม่เหลือเขียน — ลองใหม่อีกครั้ง")
  }
  return text
}

// ทางสำรองตอนโควตาหมด — ใช้ได้เฉพาะเปิดเว็บจากเครื่องที่มี Ollama (Vercel ต่อไม่ถึง)
// format:"json" บังคับให้คายเป็น JSON ตั้งแต่ต้นทาง ลดโอกาส parse ไม่ออก
async function askOllama(voice, prompt) {
  const host = process.env.OLLAMA_HOST || voice.ollama_host || "http://localhost:11434"
  const model = process.env.OLLAMA_MODEL || voice.ollama_model || "qwen2.5:14b"
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, stream: false, format: "json",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      options: { temperature: 0.85 },
    }),
    signal: AbortSignal.timeout(240000),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const json = await res.json()
  return (json.message?.content || "").trim()
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
      .select("id,caption,status").eq("id", id).maybeSingle()
    if (e0) throw e0
    if (!content) return NextResponse.json({ error: `ไม่พบรายการ id=${id}` }, { status: 404 })
    if (!content.caption || content.caption.length < 20) {
      return NextResponse.json({
        error: "ยังไม่มีแคปชั่นให้แปลง",
        hint: 'กด "ให้ AI เขียน" ก่อน แล้วค่อยสร้างช่องอื่น',
      }, { status: 400 })
    }

    const [voice, craft] = await Promise.all([loadJson("content_voice.json"), loadJson("content_craft.json")])
    if (!voice) return NextResponse.json({ error: "อ่าน tasks/content_voice.json ไม่ได้" }, { status: 500 })

    // ลำดับเดียวกับตัวเขียนแคปชั่น — claude (เสียเงิน) → gemini (ฟรีมีลิมิต) → ollama (บนเครื่อง)
    const forced = (process.env.AI_PROVIDER || "").toLowerCase()
    const provider = forced || (process.env.ANTHROPIC_API_KEY ? "claude"
                     : process.env.GEMINI_API_KEY ? "gemini" : "ollama")

    const prompt = buildPrompt(voice, craft, content)
    const call = (p) => p === "claude" ? askClaude(voice, prompt)
                      : p === "gemini" ? askGemini(voice, prompt)
                      : askOllama(voice, prompt)
    let raw, used = provider
    try {
      raw = await call(provider)
    } catch (e) {
      const msg = String(e.message || e)
      // โควตา Gemini หมดแล้วยังมี Ollama บนเครื่องอยู่ → ลองต่อให้ ไม่ต้องให้คนมากดเอง
      // (เจอจริง: โควตารายวันหมดกลางงาน แล้วทุกปุ่มตายหมดทั้งที่มีทางออก)
      if (e.status === 429 && provider === "gemini" && !forced) {
        try {
          raw = await askOllama(voice, prompt)
          used = "ollama"
        } catch {
          return NextResponse.json({
            error: "โควตา Gemini หมด และต่อ Ollama บนเครื่องไม่ได้",
            hint: "รอโควตารีเซ็ต หรือเปิดแอป Ollama บนเครื่องที่รันเว็บนี้",
          }, { status: 429 })
        }
      } else if (e.status === 429) {
        return NextResponse.json({
          error: "ชนลิมิตของ Gemini — รอสักครู่แล้วกดใหม่",
          hint: "free tier จำกัดจำนวนคำขอต่อนาที ไม่ใช่แค่ต่อวัน",
        }, { status: 429 })
      } else {
        return NextResponse.json({ error: `${provider}: ${msg.slice(0, 250)}` }, { status: 502 })
      }
    }

    const variants = parseVariants(raw)
    if (!variants) {
      return NextResponse.json({
        error: "โมเดลตอบมาในรูปแบบที่อ่านไม่ออก — ลองกดใหม่",
        preview: (raw || "").slice(0, 160),
      }, { status: 502 })
    }

    const bad = Object.entries(variants).filter(([, v]) => !looksThai(v)).map(([k]) => k)
    if (bad.length) {
      return NextResponse.json({
        error: `ช่อง ${bad.join(", ")} เขียนออกมาไม่ใช่ภาษาไทย — ไม่บันทึก ลองกดใหม่`,
      }, { status: 422 })
    }

    // variants มาจาก migration 064 — ถ้ายังไม่ได้รันจะ error ให้บอกทางแก้ตรง ๆ
    const { data: updated, error: e1 } = await db.from("marketing_content")
      .update({ variants })
      .eq("id", id)
      .select("*, idea:marketing_ideas!marketing_content_idea_id_fkey(id,url,source,source_label)")
      .maybeSingle()
    if (e1) {
      if (/variants/i.test(e1.message || "")) {
        return NextResponse.json({
          error: "ตาราง marketing_content ยังไม่มีคอลัมน์ variants",
          hint: "เอา backend/database/migrations/064_marketing_content_variants.sql ไปรันใน Supabase SQL Editor ก่อน",
        }, { status: 503 })
      }
      throw e1
    }

    return NextResponse.json({ ...updated, generated: Object.keys(variants), provider: used })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
