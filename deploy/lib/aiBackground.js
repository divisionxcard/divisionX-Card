// พื้นหลังโปสเตอร์จาก AI — ภาพที่ "ไม่มีอะไรต้องถูกต้อง" ล้วน ๆ ให้ AI ทำ ส่วนการ์ด/ตัวอักษรให้เทมเพลตวาง
//
// ใช้กับซีรีส์ "ส่อง 5 ใบเด็ด" (เจ้าของเลือก 10 ต.ค. 2026: เทมเพลตวางการ์ดจริง + AI วาดพื้นหลัง)
// ภาพนี้ถูกอัปไว้ใน marketing/aibg/ แล้ว deploy/agents/top5_poster.py เอาไปปูหลัง (รับเฉพาะโฟลเดอร์นี้)
//
// กติกาการเรียก OpenAI ลอกมาจาก askOpenAI ใน app/api/marketing/content/image/route.js — แก้ที่หนึ่งต้องดูอีกที่:
//   - ตัวกรองเนื้อหาบล็อกแบบสุ่ม → ยิงรุ่นเดิมซ้ำ ไม่ข้ามไปรุ่นสำรอง
//   - error ที่ชี้พารามิเตอร์ (error.param ≠ model) ต้องโยนออก ห้ามเลื่อนรุ่นเงียบ ๆ
//     (เคยทำให้ภาพทุกใบมาจากรุ่นสำรองโดยไม่มีใครรู้ — ดู skill dvx-image กับดักข้อ 1)
//   - เลื่อนรุ่นเฉพาะรุ่นที่ไม่มี/ถูกปลด
import { readFile } from "fs/promises"
import path from "path"

const OPENAI_BASE = "https://api.openai.com/v1"
const MODERATION_RETRY = 2

// ⚠️ path ต้องเป็นสตริงตรง ๆ ทีละไฟล์ ห้ามส่งชื่อไฟล์เป็นตัวแปรผ่าน helper
//    Next ไล่หาไฟล์ที่ต้องแพ็กขึ้น Vercel จากการอ่านโค้ด ถ้าเป็นตัวแปรมันมองไม่เห็น
//    → ไฟล์หายบน production ทั้งที่รันบนเครื่องผ่าน (บทเรียนเดียวกับ lib/opcgKnowledge.js)
const readImageStyle = () => readFile(path.join(process.cwd(), "tasks", "image_style.json"), "utf-8")
  .then(JSON.parse).catch(() => null)
const readFranchiseStyle = () => readFile(path.join(process.cwd(), "tasks", "franchise_style.json"), "utf-8")
  .then(JSON.parse).catch(() => null)

/** prompt พื้นหลังของซีรีส์ 5 ใบเด็ด — โซนที่จะวางการ์ด/พาดหัวต้องเรียบและมืด */
export async function top5BackgroundPrompt(franchise = "OP") {
  const fr = (await readFranchiseStyle())?.franchises?.[franchise]
  const decor = fr?.decor || "abstract deep-navy atmosphere with soft light"
  // ⚠️ ห้ามบรรยาย "โซนที่จะวางของ" เป็นรูปทรง — ลองแล้ว 10 ต.ค. 2026 เขียนว่า
  //    "a 2x2 grid area on the right half" โมเดลวาดแผ่นกระจกเรืองแสง 2×2 ลงไปจริง ๆ
  //    (กับดักเดียวกับ skill dvx-image ข้อห้า: คำในบรีฟถูกวาดตรงตัว)
  //    บอกแค่ว่า "ลายอยู่ที่ขอบ ตรงกลางมืดและว่าง" พอ
  return [
    "Square 1:1 background artwork, used as the backdrop of a poster. Other elements will be placed on top later.",
    "Composition: the decorative motifs live ONLY along the outer edges and in the four corners, and fade into darkness.",
    "The whole middle of the picture is calm, nearly empty deep-navy space with only a soft, diffuse cyan glow.",
    "The top edge stays especially dark.",
    `Motifs for the edges and corners: ${decor}.`,
    "Brand palette: deep navy (#0A1628) ground, electric cyan (#00D4FF) light accents and rim light, gold (#E0B457) as a secondary glow.",
    "Style: cinematic digital painting, depth, gentle light rays, subtle film grain.",
    "",
    "HARD RULES — never break:",
    "- No text, letters, numbers, symbols, logos, watermarks or signatures anywhere.",
    "- No characters, people, faces, hands or creatures, and no franchise character in any form.",
    "- No trading cards, booster packs, products, vending machines or devices.",
    "- No frame or border. Full-bleed artwork.",
  ].join("\n")
}

/**
 * วาดพื้นหลัง → { buf, mime, model, attempts } · ล้มเหลวโยน error ที่มี attempts
 * @param {object} [o]
 * @param {number} [o.deadline] เวลา (ms epoch) ที่ต้องเลิกยิง — กันเกินเพดานของ route
 */
export async function generateBackground(prompt, { deadline = Date.now() + 200_000 } = {}) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error("ไม่มี OPENAI_API_KEY")
  const style = (await readImageStyle()) || {}
  const models = [process.env.OPENAI_IMAGE_MODEL || style.openai_model, ...(style.openai_model_fallbacks || [])]
    .filter(Boolean)
  const size = style.openai_size || "1024x1024"
  const quality = style.openai_quality || "high"

  const plan = []
  models.forEach((m, i) => { for (let k = 0; k < (i === 0 ? MODERATION_RETRY + 1 : 1); k++) plan.push(m) })
  const dead = new Set(), attempts = []

  for (const model of plan) {
    if (dead.has(model)) continue
    const left = deadline - Date.now()
    if (left < 40_000) { attempts.push(`${model}: เวลาไม่พอ (${Math.round(left / 1000)} วิ)`); break }
    let res, json
    try {
      res = await fetch(`${OPENAI_BASE}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
        signal: AbortSignal.timeout(Math.max(20_000, left)),
      })
      json = await res.json().catch(() => ({}))
    } catch (e) {
      attempts.push(`${model}: ${String(e.message || e).slice(0, 120)}`)
      continue
    }
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`
      attempts.push(`${model}: ${msg.slice(0, 160)}`)
      if (json?.error?.code === "moderation_blocked" || /safety system/i.test(msg)) continue
      const badParam = json?.error?.param
      if (res.status === 400 && badParam && badParam !== "model") {
        throw Object.assign(new Error(msg), { attempts })
      }
      if (res.status === 404 || (res.status === 400 && /model|not found|does not exist|unsupported/i.test(msg))) {
        dead.add(model); continue
      }
      throw Object.assign(new Error(msg), { attempts })
    }
    const b64 = json?.data?.[0]?.b64_json
    if (!b64) { attempts.push(`${model}: ไม่มีภาพกลับมา`); continue }
    attempts.push(`${model}: สำเร็จ`)
    return { buf: Buffer.from(b64, "base64"), mime: "image/png", model, attempts, usage: json.usage || null }
  }
  throw Object.assign(new Error("วาดพื้นหลังไม่สำเร็จ"), { attempts })
}
