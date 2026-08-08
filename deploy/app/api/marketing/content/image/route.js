// สร้างภาพประกอบให้คอนเทนต์ — POST /api/marketing/content/image { id }
//
// แนวคิด: ไม่ให้ AI "วาดการ์ดขึ้นมาเอง" เพราะมันไม่รู้ว่าชุด OP-13 หน้าตายังไง
// แต่ป้อน **รูปซองจริง** ที่เรามีอยู่ (39 SKU ใน Supabase Storage) เป็นภาพอ้างอิง
// แล้วให้มันจัดฉาก/แสง/พื้นหลังตามอัตลักษณ์แบรนด์รอบ ๆ ของจริงนั้น
// → ได้ทั้งสินค้าที่ถูกต้องและภาพที่ออกแบบมาแล้ว
//
// ต้องใช้ Gemini แบบเปิด billing — free tier ให้โควตาสร้างภาพ = 0 (ยิงจริงแล้วได้ 429 ทุกรุ่น)
// ตัวเขียนแคปชั่นยังใช้ free tier ได้ตามเดิม คนละโควตากัน
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

async function loadStyle() {
  const p = path.join(process.cwd(), "tasks", "image_style.json")
  return JSON.parse(await readFile(p, "utf-8"))
}

// รูปอ้างอิงต้องส่งเป็น base64 inline — ดึงจาก Storage (public bucket) แล้วแปลง
// จำกัดขนาดกัน payload บวมจนโดนปฏิเสธ · รูป SKU จริงอยู่ราว 30-150 KB อยู่แล้ว
const MAX_REF_BYTES = 4 * 1024 * 1024

async function fetchReference(url) {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const type = res.headers.get("content-type") || "image/jpeg"
    if (!type.startsWith("image/")) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > MAX_REF_BYTES) return null
    return { mimeType: type.split(";")[0], data: buf.toString("base64") }
  } catch {
    return null   // ไม่มีรูปอ้างอิงก็ยังสร้างได้ แค่เป็นภาพบรรยากาศแทน
  }
}

function buildPrompt(style, { scene, subject, hasRef }) {
  const parts = [
    hasRef
      ? `Product photography scene: ${scene}.`
      : `Brand atmosphere image (no specific product): ${scene.replace(/the product|product/gi, "a generic sealed foil card pack")}.`,
    subject ? `Context: ${subject}` : null,
    style.style,
    hasRef ? style.with_reference : null,
    `Strict constraints: ${(style.negative || []).join("; ")}.`,
  ].filter(Boolean)
  return parts.join("\n\n")
}

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      error: "ยังไม่ได้ตั้ง GEMINI_API_KEY",
      hint: "ใช้ key เดียวกับตัวเขียนแคปชั่น",
    }, { status: 503 })
  }

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const id = parseInt(body.id, 10)
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 })

  try {
    const { data: content, error: e0 } = await db.from("marketing_content")
      .select("*, idea:marketing_ideas!marketing_content_idea_id_fkey(id,title,related_sku)")
      .eq("id", id).maybeSingle()
    if (e0) throw e0
    if (!content) return NextResponse.json({ error: `ไม่พบรายการ id=${id}` }, { status: 404 })

    const style = await loadStyle()

    // หา SKU เพื่อเอารูปจริงมาเป็นภาพอ้างอิง — ซองก่อน ถ้าไม่มีค่อยกล่อง
    const skuId = content.source_sku || content.idea?.related_sku
    let sku = null
    if (skuId) {
      const { data } = await db.from("skus")
        .select("sku_id,name,image_url,image_url_box").eq("sku_id", skuId).maybeSingle()
      sku = data
    }
    const ref = await fetchReference(sku?.image_url || sku?.image_url_box)

    const scene = style.scenes?.[content.content_format] || style.scenes?.default || ""
    // ใช้บรรทัดแรกของแคปชั่นเป็นบริบทของฉาก — ไม่ส่งทั้งแคปชั่นเพราะแฮชแท็ก/emoji
    // ทำให้โมเดลไขว้เขวและบางทีพยายามเรนเดอร์ตัวหนังสือออกมา
    const subject = [sku?.name, (content.caption || "").split("\n")[0].replace(/#\S+/g, "").trim()]
      .filter(Boolean).join(" — ").slice(0, 200)

    const prompt = buildPrompt(style, { scene, subject, hasRef: !!ref })
    const model = process.env.GEMINI_IMAGE_MODEL || style.model || "gemini-3.1-flash-image"

    const parts = [{ text: prompt }]
    if (ref) parts.push({ inlineData: ref })

    const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          imageConfig: {
            aspectRatio: style.aspect_ratio || "1:1",
            imageSize: style.image_size || "1K",
          },
        },
      }),
      signal: AbortSignal.timeout(120000),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`
      // 429 ที่นี่มักไม่ใช่ "ใช้เกินโควตา" แต่คือ "free tier ไม่มีโควตาภาพเลย"
      // ต้องบอกให้ชัด ไม่งั้นจะนั่งรอพรุ่งนี้แล้วก็ยังพังเหมือนเดิม
      if (res.status === 429) {
        return NextResponse.json({
          error: "สร้างภาพไม่ได้ — บัญชี Gemini ยังไม่ได้เปิด billing",
          hint: "free tier ให้โควตาสร้างภาพ = 0 (คนละโควตากับตัวเขียนแคปชั่นซึ่งยังฟรีอยู่) " +
                "เปิดที่ Google AI Studio → Billing แล้วใช้ key เดิมได้เลย · ค่าใช้จ่ายราวภาพละ $0.045",
        }, { status: 402 })
      }
      if (/no longer available|not found|is not supported/i.test(msg)) {
        return NextResponse.json({
          error: `โมเดล "${model}" ใช้ไม่ได้แล้ว (${msg.slice(0, 120)})`,
          hint: 'แก้ "model" ใน deploy/tasks/image_style.json เป็น gemini-3.1-flash-image หรือ gemini-3.1-flash-lite-image',
        }, { status: 502 })
      }
      return NextResponse.json({ error: `Gemini: ${msg.slice(0, 250)}` }, { status: 502 })
    }

    const blocked = json?.promptFeedback?.blockReason
    if (blocked) {
      return NextResponse.json({
        error: `Gemini บล็อกคำขอนี้ (${blocked}) — ลองเปลี่ยนรูปแบบโพสต์แล้วสั่งใหม่`,
      }, { status: 422 })
    }

    const out = (json?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData)
    if (!out) {
      return NextResponse.json({
        error: "โมเดลไม่ได้ส่งภาพกลับมา — ลองกดใหม่อีกครั้ง",
        finish: json?.candidates?.[0]?.finishReason || null,
      }, { status: 502 })
    }

    const bytes = Buffer.from(out.inlineData.data, "base64")
    const mime = out.inlineData.mimeType || "image/png"
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png"
    // ใส่ timestamp ในชื่อไฟล์ — กดสร้างใหม่แล้วได้ URL ใหม่ ไม่ต้องสู้กับ CDN cache
    const key = `${style.path_prefix || "content"}/${id}-${Date.now()}.${ext}`
    const bucket = style.bucket || "marketing"

    const up = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": mime,
        "x-upsert": "true",
      },
      body: bytes,
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
        model,
        used_reference: !!ref,
        reference_sku: ref ? sku?.sku_id : null,
        bytes: bytes.length,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
