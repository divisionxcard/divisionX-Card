// ให้ AI ออกแบบภาพโปสเตอร์ — POST /api/marketing/content/image { id, mode? }
//
// เจ้าของดูผลจากเทมเพลต CSS ที่เราเขียนเองแล้วบอกว่า "ยังไม่ตรงตามความต้องการ"
// และเห็นว่าโปสเตอร์ที่ ChatGPT ทำให้ดีกว่ามาก จึงเลือกทางนี้
//
// ⚠️ สิ่งที่ทำให้ทางนี้ต่างจากการเปิด ChatGPT ทำมือ:
//   เราส่ง "ข้อมูลจริง" เข้าไปใน prompt ได้ — จำนวนสาขาที่นับจาก DB จริง ชื่อชุดจริง
//   แคปชั่นที่ผ่านการอนุมัติแล้ว และ **รูปซองจริง/ตู้จริงเป็นภาพอ้างอิง**
//   โมเดลจึงไม่มีเหตุผลต้องแต่งตัวเลขขึ้นเอง
//   (โปสเตอร์จาก ChatGPT ที่เจ้าของชอบมีราคาการ์ด 15,000/9,000 ซึ่งมันแต่งขึ้นมา
//    เพราะไม่รู้จักข้อมูลเรา — ข้อนี้แก้ได้ด้วยการต่อ API เท่านั้น)
//
// ต้องเติมเงินใน OpenAI API ก่อน — **ChatGPT Plus ที่จ่ายรายเดือนใช้กับ API ไม่ได้**
// เป็นคนละบิลคนละระบบ และ OpenAI API ไม่มี free tier
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"
import { requireAdmin } from "../../../../../lib/apiAuth"

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const db = createClient(SB_URL, SB_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
const OPENAI_BASE = "https://api.openai.com/v1"

async function loadJson(name) {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "tasks", name), "utf-8"))
  } catch { return null }
}

// ── รูปอ้างอิง ────────────────────────────────────────────────────────────
// จำกัดขนาดกัน payload บวมจนโดนปฏิเสธ · รูป SKU จริงอยู่ราว 30-150 KB, รูปตู้ ~210 KB
const MAX_REF_BYTES = 6 * 1024 * 1024

async function fetchRef(url) {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0]
    if (!type.startsWith("image/")) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > MAX_REF_BYTES) return null
    return { mimeType: type, buf }
  } catch { return null }
}

async function localRef(rel) {
  try {
    const p = path.join(process.cwd(), "public", rel)
    const buf = await readFile(p)
    if (!buf.length || buf.length > MAX_REF_BYTES) return null
    const mimeType = rel.endsWith(".png") ? "image/png" : "image/jpeg"
    return { mimeType, buf }
  } catch { return null }
}

// ── ประกอบ prompt ─────────────────────────────────────────────────────────
// โครง: บทบาท → แนวคิด → สไตล์แบรนด์ → ข้อเท็จจริง (ห้ามแต่ง) → ข้อความที่ต้องใส่ → ข้อห้าม
function buildPrompt(style, concept, facts, mode, hasRefs = false) {
  const wantsText = mode !== "art"
  const p = []

  p.push(
    "You are a senior graphic designer creating a square 1:1 social media poster " +
    "for a Thai trading-card vending machine brand. Output a finished, polished poster " +
    "in the style of high-energy Thai retail advertising — layered, dramatic lighting, " +
    "strong focal hierarchy. Not a plain product photo, not a minimal web card."
  )

  if (concept) {
    p.push(
      `POSTER CONCEPT: ${concept.label} — ${concept.mood}.\n` +
      `Visual elements to include: ${(concept.decor || []).join(", ")}.\n` +
      `Colour direction: background ${concept.palette?.bg}, primary accent ${concept.palette?.accent}, ` +
      `secondary accent ${concept.palette?.accent2}.`
    )
  }

  p.push(`BRAND STYLE: ${style.style}`)
  p.push(
    "BRAND WORLD: the real vending machine is navy blue wrapped with white ocean waves, " +
    "a gold anchor, stars and seagulls — a One Piece nautical theme. Gold is a genuine brand colour."
  )

  // ข้อเท็จจริง — ส่วนที่ทำให้ต่างจากการเปิด ChatGPT ทำมือ
  p.push("FACTS (the only numbers and names you may use):\n" + facts.join("\n"))
  p.push(style.facts_rule)

  // ⚠️ คำสั่งห้ามวาดสินค้าใหม่ — ต้องอยู่ในพรอมต์ทุกครั้งที่แนบรูปอ้างอิง
  // เดิมคีย์นี้มีอยู่ใน image_style.json แต่ไม่มีใครเรียก (dead config) มาตลอด
  // ซึ่งเป็นประโยคเดียวกับที่ทำให้รอบสั่ง ChatGPT ด้วยมือได้ซองจริง ส่วน API ได้ซองที่โมเดลวาดเอง
  if (hasRefs && style.with_reference) p.push("REFERENCE IMAGES: " + style.with_reference)

  if (wantsText) {
    p.push(style.thai_rule)
  } else {
    p.push(
      "IMPORTANT: render NO text of any kind. No letters, no words, no numbers, no logos. " +
      "Produce only the artwork, lighting and composition. Leave clear negative space in the " +
      "upper third and lower fifth where text will be placed later."
    )
  }

  // ⚠️ ห้ามยัด negative_no_text เข้าโหมดที่ต้องการตัวอักษร — เคยพลาดมาแล้ว (ดู _negative_note)
  const nos = [
    ...(style.negative_always || []),
    ...(wantsText ? [] : (style.negative_no_text || [])),
  ]
  p.push("STRICT CONSTRAINTS: " + nos.join("; ") + ".")
  return p.join("\n\n")
}

// ── OpenAI ────────────────────────────────────────────────────────────────
// มีรูปอ้างอิง → /images/edits (ยึดซองจริง/ตู้จริง) · ไม่มี → /images/generations
async function askOpenAI(style, prompt, refs) {
  const key = process.env.OPENAI_API_KEY
  const models = [
    process.env.OPENAI_IMAGE_MODEL || style.openai_model,
    ...(style.openai_model_fallbacks || []),
  ].filter(Boolean)

  const size = style.openai_size || "1024x1024"
  const quality = style.openai_quality || "high"
  let lastErr = ""
  const attempts = []            // ไล่ให้เห็นว่าลองโมเดลไหนไปบ้างและพังเพราะอะไร

  for (const model of models) {
    try {
      let res
      if (refs.length) {
        // edits รับไฟล์แบบ multipart — ชื่อฟิลด์ image[] สำหรับหลายรูป
        const fd = new FormData()
        fd.append("model", model)
        fd.append("prompt", prompt)
        fd.append("size", size)
        fd.append("quality", quality)
        // gpt-image-2 ห้ามส่ง input_fidelity — เอกสารระบุตรง ๆ ว่ามันประมวลผลรูปอ้างอิงที่
        // fidelity สูงเสมออยู่แล้ว และ API จะไม่ยอมให้เปลี่ยน (ส่งไปแล้วโดนปฏิเสธ)
        // ตัวดัก error ด้านล่างจับเฉพาะข้อความที่มีคำว่า model/not found/unsupported
        // error เรื่องพารามิเตอร์จึงหลุดออกไปเป็น throw ทันที ไม่ fallback = ยิงไม่ติดเงียบ ๆ
        if (style.openai_input_fidelity && !/^gpt-image-2/.test(model)) {
          fd.append("input_fidelity", style.openai_input_fidelity)
        }
        refs.forEach((r, i) => {
          // ตั้งนามสกุลตามชนิดไฟล์จริง — รูปซองใน Supabase เป็น WebP
          // เดิมตั้งเป็น .jpg ให้ทุกอย่างที่ไม่ใช่ png ทำให้ชื่อไฟล์ขัดกับไบต์ข้างใน
          const ext = /png/.test(r.mimeType) ? "png"
            : /webp/.test(r.mimeType) ? "webp"
            : /jpe?g/.test(r.mimeType) ? "jpg" : "png"
          fd.append("image[]", new Blob([r.buf], { type: r.mimeType }), `ref${i}.${ext}`)
        })
        res = await fetch(`${OPENAI_BASE}/images/edits`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: fd,
          signal: AbortSignal.timeout(300000),
        })
      } else {
        res = await fetch(`${OPENAI_BASE}/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
          signal: AbortSignal.timeout(300000),
        })
      }

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = json?.error?.message || `HTTP ${res.status}`
        lastErr = `${model}: ${msg}`
        attempts.push(lastErr)
        // ชื่อโมเดลผิด/ถูกปลด → ลองตัวถัดไป · error อื่นให้หยุดเลย ไม่ต้องเผาเงินซ้ำ
        // ⚠️ เงื่อนไขนี้กว้างกว่าที่ตั้งใจ — คำว่า "model" โผล่ในข้อความ error แทบทุกแบบ
        //    ("... for this model") ทำให้ error เรื่องพารามิเตอร์ถูกกลืนแล้วเลื่อนโมเดลเงียบ ๆ
        //    เคยทำให้เข้าใจผิดว่าทดสอบ gpt-image-2 อยู่ ทั้งที่จริงตกไปใช้ gpt-image-1.5
        //    จึงเก็บ attempts ไว้คืนออกไปด้วยเสมอ จะได้รู้ว่าภาพที่ได้มาจากโมเดลไหนจริง ๆ
        if (/model|not found|does not exist|unsupported/i.test(msg) && res.status === 400) continue
        if (res.status === 404) continue
        throw Object.assign(new Error(msg), { status: res.status, json, attempts })
      }
      const b64 = json?.data?.[0]?.b64_json
      if (!b64) { lastErr = `${model}: ไม่มีภาพกลับมา`; attempts.push(lastErr); continue }
      // usage บอกต้นทุนจริงต่อภาพ — เอกสาร OpenAI ไม่มีสูตรคิด input token ของ gpt-image-2
      // ทางเดียวที่จะรู้ราคาจริงคืออ่านจากตรงนี้
      return { buf: Buffer.from(b64, "base64"), mime: "image/png", model, attempts, usage: json.usage || null }
    } catch (e) {
      if (e.status) throw e
      lastErr = `${model}: ${String(e.message || e).slice(0, 160)}`
      attempts.push(lastErr)
    }
  }
  throw Object.assign(new Error(`ลองครบทุกโมเดลแล้วไม่สำเร็จ — ${lastErr}`), { attempts })
}

// ── Gemini (ทางสำรอง) ─────────────────────────────────────────────────────
async function askGemini(style, prompt, refs) {
  const key = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_IMAGE_MODEL || style.model || "gemini-3.1-flash-image"
  const parts = [{ text: prompt }]
  for (const r of refs) {
    parts.push({ inlineData: { mimeType: r.mimeType, data: r.buf.toString("base64") } })
  }
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        imageConfig: { aspectRatio: style.aspect_ratio || "1:1", imageSize: style.image_size || "1K" },
      },
    }),
    signal: AbortSignal.timeout(180000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(json?.error?.message || `HTTP ${res.status}`)
    e.status = res.status
    throw e
  }
  const out = (json?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData)
  if (!out) throw new Error("โมเดลไม่ได้ส่งภาพกลับมา")
  return {
    buf: Buffer.from(out.inlineData.data, "base64"),
    mime: out.inlineData.mimeType || "image/png",
    model,
  }
}

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const id = parseInt(body.id, 10)
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 })

  const style = await loadJson("image_style.json")
  if (!style) return NextResponse.json({ error: "อ่าน tasks/image_style.json ไม่ได้" }, { status: 500 })

  const forced = (process.env.IMAGE_PROVIDER || style.provider || "").toLowerCase()
  const provider = forced || (process.env.OPENAI_API_KEY ? "openai"
                    : process.env.GEMINI_API_KEY ? "gemini" : "")

  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      error: "ยังไม่ได้ตั้ง OPENAI_API_KEY",
      hint: "⚠️ ChatGPT Plus ที่จ่ายรายเดือนใช้กับ API ไม่ได้ — คนละบิลคนละระบบ · " +
            "ต้องสร้าง API key ที่ platform.openai.com แล้วเติมเครดิตแยก (ไม่มี free tier) · " +
            "ได้ key แล้วใส่เป็น environment variable ชื่อ OPENAI_API_KEY ทั้งใน Vercel และ deploy/.env.local",
    }, { status: 503 })
  }
  if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้ง GEMINI_API_KEY" }, { status: 503 })
  }
  if (!provider) {
    return NextResponse.json({ error: "ไม่มี key ของผู้ให้บริการภาพเลย (OPENAI_API_KEY หรือ GEMINI_API_KEY)" }, { status: 503 })
  }

  try {
    const { data: content, error: e0 } = await db.from("marketing_content")
      .select("*, idea:marketing_ideas!marketing_content_idea_id_fkey(id,title,related_sku)")
      .eq("id", id).maybeSingle()
    if (e0) throw e0
    if (!content) return NextResponse.json({ error: `ไม่พบรายการ id=${id}` }, { status: 404 })

    // ── ข้อเท็จจริงจากฐานข้อมูล — ไม่ให้โมเดลเดาเอง ──
    const { data: machines } = await db.from("machines").select("machine_id").eq("status", "active")
    const branches = (machines || []).length

    const skuId = content.source_sku || content.idea?.related_sku
    let sku = null
    if (skuId) {
      const { data } = await db.from("skus")
        .select("sku_id,name,image_url,image_url_box").eq("sku_id", skuId).maybeSingle()
      sku = data
    }

    const caption = (content.caption || "").replace(/#\S+/g, "").trim()
    const lines = caption.split("\n").map(s => s.trim()).filter(Boolean)
    const facts = [
      `- Brand name: DivisionX Card (logo wordmark "DC")`,
      `- Number of branches (real, from database): ${branches}`,
      `- Business: self-service trading-card vending machines inside Thai shopping malls, open 24 hours`,
      sku ? `- Product shown: ${sku.name} (${sku.sku_id}) — an authentic sealed booster pack` : null,
      lines.length ? `- Headline text to place (Thai, copy exactly): "${lines[0]}"` : null,
      lines.length > 1 ? `- Supporting line (Thai, copy exactly): "${lines[1]}"` : null,
      `- Trust badges to show: ของแท้ 100% · เปิด 24 ชม. · ${branches} สาขา`,
    ].filter(Boolean)

    // ── รูปอ้างอิง: ซองจริง + ตู้จริง ──
    const refs = []
    const packRef = await fetchRef(sku?.image_url || sku?.image_url_box)
    if (packRef) refs.push(packRef)
    const conceptsCfg = await loadJson("poster_concepts.json")
    const conceptKey = body.concept || conceptsCfg?.default || ""
    const concept = (conceptsCfg?.concepts || []).find(c => c.key === conceptKey) || null
    if (concept && !concept.available) {
      return NextResponse.json({
        error: `แนวคิด "${concept.label}" ยังใช้ไม่ได้`,
        hint: concept.blocked_why,
      }, { status: 422 })
    }
    // ตู้จริงใส่เฉพาะแนวที่ต้องใช้ตู้ — ไม่งั้นเปลือง token และทำให้ภาพรก
    if (["machine_luck", "real_machine"].includes(conceptKey)) {
      const m = await localRef("machine/machine-hero.jpg")
      if (m) refs.push(m)
    }

    const mode = body.mode || style.poster_mode || "full"
    const prompt = buildPrompt(style, concept, facts, mode, refs.length > 0)

    let out
    try {
      out = provider === "openai"
        ? await askOpenAI(style, prompt, refs)
        : await askGemini(style, prompt, refs)
    } catch (e) {
      const msg = String(e.message || e)
      // 429 ที่ endpoint ภาพมักไม่ใช่ "ใช้เกินโควตา" แต่คือ "ยังไม่ได้เติมเงิน"
      if (e.status === 429 || /quota|billing|insufficient/i.test(msg)) {
        return NextResponse.json({
          error: provider === "openai"
            ? "สร้างภาพไม่ได้ — บัญชี OpenAI API ยังไม่มีเครดิต"
            : "สร้างภาพไม่ได้ — บัญชี Gemini ยังไม่ได้เปิด billing",
          hint: provider === "openai"
            ? "เติมเครดิตที่ platform.openai.com → Billing · ย้ำว่า ChatGPT Plus ใช้กับ API ไม่ได้"
            : "เปิด billing ที่ Google AI Studio",
        }, { status: 402 })
      }
      if (e.status === 401) {
        return NextResponse.json({ error: "key ใช้ไม่ได้ — ตรวจว่าคัดลอกครบและยังไม่ถูกเพิกถอน" }, { status: 401 })
      }
      return NextResponse.json({ error: `${provider}: ${msg.slice(0, 300)}` }, { status: 502 })
    }

    // ── เก็บลง Storage ── ชื่อไฟล์มี timestamp กดสร้างใหม่ได้ไม่ติด CDN cache
    const ext = out.mime.includes("jpeg") ? "jpg" : out.mime.includes("webp") ? "webp" : "png"
    const bucket = style.bucket || "marketing"
    const key = `${style.path_prefix || "content"}/${id}-${Date.now()}.${ext}`
    const up = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": out.mime, "x-upsert": "true",
      },
      body: out.buf,
    })
    if (!up.ok) {
      const t = await up.text().catch(() => "")
      throw new Error(`อัปโหลดเข้า Storage ไม่สำเร็จ (${up.status}) ${t.slice(0, 150)}`)
    }

    const publicUrl = `${SB_URL}/storage/v1/object/public/${bucket}/${key}`
    const { data: updated, error: e1 } = await db.from("marketing_content")
      .update({ media_url: publicUrl, media_type: "image" })
      .eq("id", id)
      .select("*, idea:marketing_ideas!marketing_content_idea_id_fkey(id,url,source,source_label)")
      .maybeSingle()
    if (e1) throw e1

    return NextResponse.json({
      ...updated,
      image: {
        provider, model: out.model, mode,
        concept: concept ? { key: concept.key, label: concept.label } : null,
        references: refs.length,
        bytes: out.buf.length,
        // ถ้าโมเดลแรกพัง มันจะเลื่อนไปตัวถัดไปเงียบ ๆ — ต้องคืนออกมาให้เห็น
        // ไม่งั้นจะเข้าใจผิดว่ากำลังทดสอบโมเดลที่ตั้งไว้ ทั้งที่ได้ภาพจากตัวสำรอง
        fell_back_from: out.attempts?.length ? out.attempts : undefined,
        usage: out.usage || undefined,
      },
    })
  } catch (err) {
    return NextResponse.json({
      error: err.message,
      attempts: err.attempts?.length ? err.attempts : undefined,
    }, { status: 500 })
  }
}
