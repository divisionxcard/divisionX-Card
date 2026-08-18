// ตรวจปรู๊ฟตัวอักษรไทยบนภาพโปสเตอร์ — POST /api/marketing/content/proof
//
// ทำไมต้องมี: ภาพที่ให้ AI ออกแบบ (ChatGPT หรือ gpt-image) สะกดไทยเพี้ยนเป็นครั้งคราวเสมอ
// เจอจริง: "กันโหดบาก" (ม→บ) · "เปิด 24 ซบ." (ช→ซ) · "สะดวกกว่ไปตามหา" (สระ า หาย)
// สั่งย้ำในพรอมต์แค่ไหนก็ไม่หาย เพราะโมเดลภาพวาดตัวอักษรเป็น "รูป" ไม่ได้พิมพ์
//
// ⚠️ ตัวนี้เป็น "ตาที่สอง" ไม่ใช่การรับประกัน — วัดจริงแล้วจับได้ราวครึ่งหนึ่งของจุดที่ผิด
// (พลาดพาดหัวตัวใหญ่ที่สุดได้ด้วย เพราะโมเดลภาษาอ่านคำคุ้นเคยแล้วเติมให้ถูกเอง)
// คนยังต้องซูมดูพาดหัวเองก่อนโพสต์ ข้อความที่ส่งกลับไปจึงย้ำเรื่องนี้ทุกครั้ง
//
// ภาพถูกซอยเป็นแถบและขยายมาจากฝั่งเบราว์เซอร์แล้ว (canvas) — ที่นี่รับเป็น data URL
// เหตุผลที่ไม่ซอยฝั่ง server: จะต้องลงไลบรารีประมวลผลภาพเพิ่มบน Vercel โดยไม่จำเป็น
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../../../lib/apiAuth"
import { readFile } from "fs/promises"
import path from "path"

const OPENAI_BASE = "https://api.openai.com/v1"
// gpt-4.1 อ่านไทยได้ดีกว่า 4o-mini ชัดเจนในการทดสอบ และถูกกว่ารุ่นใหญ่มาก
const MODEL = process.env.PROOF_MODEL || "gpt-4.1"

async function loadVoice() {
  try {
    const raw = await readFile(path.join(process.cwd(), "tasks", "content_voice.json"), "utf8")
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function buildInstruction(caption, phrases) {
  return `คุณคือคนตรวจปรู๊ฟภาษาไทยของโปสเตอร์โฆษณา ภาพที่เห็นคือส่วนหนึ่งของโปสเตอร์ที่ถูกขยายแล้ว

ทำสองขั้นตามลำดับ ห้ามข้าม:

ขั้นที่ 1 — ถอดตัวอักษรตามที่ "เห็นจริงในภาพ" ทีละตัว
ห้ามแก้คำให้ถูกเอง ห้ามเดาว่าน่าจะหมายถึงอะไร
ถ้าเห็น "บ" ให้เขียน "บ" แม้จะรู้ว่าคำที่ถูกควรเป็น "ม"
นี่คือขั้นที่สำคัญที่สุด เพราะปกติโมเดลจะเผลออ่านให้เป็นคำที่ถูกโดยอัตโนมัติ แล้วจับที่ผิดไม่ได้เลย

ขั้นที่ 2 — เทียบสิ่งที่ถอดได้กับข้อความที่อนุมัติ

ข้อความที่อนุมัติ (แคปชั่นของโพสต์นี้):
${caption}

วลีติดปากของแบรนด์ที่ใช้ได้เสมอ:
${phrases}

ตอบ JSON: {"lines":["ข้อความที่ถอดได้"],"problems":[{"found":"...","should_be":"...","why":"..."}]}

กฎ:
- ผิดคือ: สะกดผิด สระหรือวรรณยุกต์หาย/เกิน/ลอยผิดที่ ตัวอักษรที่ไม่ประกอบเป็นคำ
  หรือข้อความที่เพิ่มข้อเท็จจริงใหม่ (ราคา ส่วนลด จำนวนสาขา คำรับประกันว่ามีของ)
- ไม่ผิด: ตัดข้อความให้สั้นลง ขึ้นบรรทัดใหม่ สลับลำดับ ใช้วลีติดปากแบรนด์
- ตรวจเฉพาะตัวหนังสือที่กราฟิกวางทับบนภาพ
  ห้ามตรวจตัวหนังสือที่เป็นส่วนของวัตถุในรูปถ่าย (ข้อความบนซองการ์ด ป้ายบนตู้ ป้ายในห้าง)
- ถ้าอ่านไม่ชัดจริง ๆ อย่าเดาว่าผิด ให้ปล่อยผ่าน`
}

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      error: "ยังไม่ได้ตั้ง OPENAI_API_KEY",
      hint: "ตรวจปรู๊ฟใช้โมเดลอ่านภาพของ OpenAI — ต้องมี key และเครดิตในบัญชี",
    }, { status: 503 })
  }

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const { tiles, caption } = body || {}
  if (!Array.isArray(tiles) || !tiles.length) {
    return NextResponse.json({ error: "ต้องส่ง tiles (ภาพที่ซอยแล้ว) มาอย่างน้อย 1 ชิ้น" }, { status: 400 })
  }
  if (!caption) return NextResponse.json({ error: "ต้องส่งแคปชั่นมาเทียบ" }, { status: 400 })

  const voice = await loadVoice()
  const instruction = buildInstruction(caption, (voice.catchphrases || []).join(" / "))

  async function checkTile(dataUrl) {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      signal: AbortSignal.timeout(120000),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`
      const e = new Error(msg)
      e.status = res.status
      throw e
    }
    try { return JSON.parse(json.choices[0].message.content) } catch { return {} }
  }

  try {
    const results = await Promise.all(tiles.slice(0, 4).map(checkTile))
    const problems = results.flatMap(r => r.problems || [])
    const lines = results.flatMap(r => r.lines || [])

    // ตัดจุดซ้ำ — แถบที่ซ้อนกันทำให้ข้อความคาบเกี่ยวถูกตรวจสองรอบ
    const seen = new Set()
    const unique = problems.filter(p => {
      const k = `${p.found}|${p.should_be}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    return NextResponse.json({
      ok: true,
      verdict: unique.length ? "fix" : "pass",
      problems: unique,
      lines_read: lines.length,
      note: unique.length
        ? "เจอจุดที่น่าจะผิด — ซูมดูของจริงอีกทีก่อนตัดสิน"
        : "ไม่พบที่ผิด แต่ตัวตรวจจับได้ราวครึ่งเดียวเท่านั้น — ซูมอ่านพาดหัวตัวใหญ่เองอีกครั้งก่อนโพสต์",
    })
  } catch (e) {
    if (e.status === 429) {
      return NextResponse.json({
        error: "บัญชี OpenAI ไม่มีเครดิตเหลือ",
        hint: "เติมเครดิตที่ platform.openai.com → Billing (ChatGPT Plus ใช้กับ API ไม่ได้)",
      }, { status: 402 })
    }
    return NextResponse.json({ error: `ตรวจไม่สำเร็จ: ${e.message}` }, { status: e.status || 502 })
  }
}
