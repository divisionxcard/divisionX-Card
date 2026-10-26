// กล่องส่งแอด — แอดที่คนยิงจริง → ถอดโครงคลิป → รูปแบบในคลัง (26 ต.ค. 2026)
//
// ทำไมต้องให้คนส่ง: เอกสาร Meta ระบุว่า Ad Library API คืนแอดขายของเฉพาะที่ "ยิงถึงยุโรป"
//   (Ads that did not reach any location in the EU will only return … social issues, elections or politics)
//   แอดที่ยิงเฉพาะไทยดูได้บนหน้าเว็บ Ad Library เท่านั้น · TikTok API มีแค่ยุโรปและให้นักวิจัย
//   ดึงอัตโนมัติ = ผิดข้อตกลงแพลตฟอร์ม → เจ้าของเลือก "กล่องส่งแอด" (ทีมเจอแอดน่าสนใจแล้วส่งเข้ามา)
// สัญญาณที่ใช้ได้: วันที่แอดเริ่มวิ่ง (Ad Library บอก) — วิ่งนาน = น่าจะคุ้มทุน (แอดขายของไม่มียอดคนดูให้)
//
//   GET                                     → { items: [แอดล่าสุด 30], extra: [รูปแบบที่เพิ่มจากกล่อง] }
//   POST { action:"upload", name, size }    → { key, upload_url, content_type }   (PUT ไฟล์ดิบตรงเข้า R2)
//   POST { action:"submit", link?, platform, page?, active_since?, note?, files:[key] } → แอด + ผลถอดโครง
//   POST { action:"analyze", id }           → ถอดโครงใหม่
//   POST { action:"adopt", id }             → เพิ่มรูปแบบที่ถอดได้เข้าคลัง (research/video-patterns-extra.json)
// ไฟล์ทั้งหมดอยู่ใต้ research/ (PRIVATE_PREFIXES — หน้า /media ไม่เปิด) · ไม่มีตารางใหม่ ไม่ต้องรัน migration
import { NextResponse } from "next/server"
import { requireMarketing } from "../../../../lib/apiAuth"
import { getObject, listObjects, presign, putObject } from "../../../../lib/r2"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const DIR = "research/ads"
const EXTRA = "research/video-patterns-extra.json"
const ID_RE = /^ad-[a-z0-9-]{4,40}$/
const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube", "other"]
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" }
const MAX = { image: 8 * 1024 * 1024, video: 18 * 1024 * 1024 }   // Gemini รับไฟล์แนบตรง (inline) รวมไม่เกิน ~20 MB
const extOf = (n) => (String(n).toLowerCase().match(/\.([a-z0-9]{2,5})$/) || [])[1] || ""
const kindOf = (ext) => (/^(mp4|mov|webm)$/.test(ext) ? "video" : MIME[ext] ? "image" : null)
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "")
const bkk = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

async function readJson(key, fallback = null) {
  const res = await getObject(key).catch(() => null)
  if (!res) return fallback
  try { return await res.json() } catch { return fallback }
}

function daysSince(d) {
  const t = Date.parse(d)
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 86400000)) : null
}

// ── ให้ Gemini ดูภาพ/คลิปแล้วถอดโครง ──
const GEMINI = "https://generativelanguage.googleapis.com/v1beta"
const CHAIN = ["gemini-flash-latest", "gemini-flash-lite-latest"]
async function askVision(parts, system) {
  let last
  for (const model of CHAIN) {
    for (let i = 0; i < 2; i++) {
      try {
        const res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
          body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 4096 } }),
          signal: AbortSignal.timeout(90000),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) {
          last = new Error(j?.error?.message || `HTTP ${res.status}`)
          if (res.status === 503 || res.status === 500 || (res.status === 429 && !/per day/i.test(last.message))) { await new Promise(r => setTimeout(r, 1500 * (i + 1))); continue }
          break
        }
        const text = (j?.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join("\n")
        if (text) return { text, model }
        last = new Error("โมเดลไม่ตอบข้อความ")
        break
      } catch (e) { last = e }
    }
  }
  throw last || new Error("ถอดโครงไม่สำเร็จ")
}

const SYSTEM = [
  "คุณเป็นนักวิเคราะห์โฆษณาวิดีโอสั้นให้ร้านตู้กดการ์ดสะสมในห้าง (DivisionX Card)",
  "งาน: ดูแอดที่แนบมา แล้วถอด \"โครง\" ของมัน — เปิดยังไง เล่ากี่จังหวะ ใช้ภาพ/ตัวหนังสือแบบไหน ปิดยังไง",
  "แล้วเสนอเป็นรูปแบบคลิปที่ร้านเราทำได้ด้วยของที่มี: รูปซองการ์ดจริง · รูปตู้ในห้าง · ภาพฉากบรรยากาศ · ตัวหนังสือบนจอ · เสียงพากย์",
  "ห้ามคัดลอกข้อความ สโลแกน ชื่อแบรนด์ หรือคำสัญญาของเขาลงในรูปแบบที่เสนอ — เอาแค่โครง",
  "ตอบเป็น JSON ล้วน ภาษาไทย",
].join("\n")

function analysisPrompt(ad) {
  const days = daysSince(ad.active_since)
  return `ข้อมูลแอด:
- แพลตฟอร์ม: ${ad.platform}${ad.page ? ` · เพจ/แบรนด์: ${ad.page}` : ""}
- ${days != null ? `วิ่งมาแล้ว ${days} วัน (ตั้งแต่ ${ad.active_since})` : "ไม่ทราบว่าวิ่งมานานแค่ไหน"}
${ad.note ? `- หมายเหตุจากทีม: ${ad.note}\n` : ""}${ad.link ? `- ลิงก์: ${ad.link}\n` : ""}
ไฟล์แนบ: ${ad.files.length} ไฟล์ (${ad.files.map(f => f.kind).join(", ")}) — ถ้าเป็นภาพหลายภาพ ให้ถือว่าเรียงตามลำดับเวลาของแอด

ตอบ JSON รูปแบบนี้:
{"summary": "แอดนี้ขายอะไร พูดอะไร 1–2 ประโยค",
 "hook": "3 วินาทีแรกทำอะไร (ภาพ/คำ/เสียง)",
 "beats": [{"role": "hook", "what": "เกิดอะไรในช่วงนี้", "seconds": "0–3"}],
 "format": "ชนิดคลิป (คนพูดหน้ากล้อง · ภาพนิ่งหลายภาพ · ข้อความบนจอ · รีวิว · เปิดกล่อง · ฯลฯ)",
 "on_screen_text": "ลักษณะตัวหนังสือบนจอ",
 "cta": "ปิดท้ายชวนทำอะไร",
 "length_seconds": 0,
 "why_it_works": "ทำไมน่าจะได้ผล — ยึดสิ่งที่เห็นในแอด",
 "can_we_do": "ร้านเราทำแบบนี้ได้ไหมด้วยของที่มี ถ้าต้องถ่ายคนจริง/ถ่ายหน้าตู้ ให้บอกตรง ๆ",
 "pattern": {"name": "ชื่อรูปแบบสั้น ๆ", "why": "ทำไมรูปแบบนี้ได้ผล", "length": [16, 30],
             "beats": [{"role": "hook", "say": "เสียงพากย์ควรพูดอะไร (คำแนะนำ ไม่ใช่ข้อความเขา)", "screen": "ตัวหนังสือบนจอ", "visual": "pack|bg|branch|machine"}]}}
กติกา pattern: 4–6 ฉาก · ฉากสุดท้าย role = cta (ชวนเช็กของในตู้ที่หน้าเว็บก่อนไป) · visual เลือกจาก pack bg branch machine เท่านั้น
· ห้ามมีตัวเลขยอดขาย/เปอร์เซ็นต์ · ห้ามสัญญาของแถม/ส่วนลด`
}

async function analyze(ad) {
  const parts = []
  for (const f of ad.files) {
    const res = await getObject(f.key)
    if (!res) continue
    const buf = Buffer.from(await res.arrayBuffer())
    parts.push({ inline_data: { mime_type: f.content_type, data: buf.toString("base64") } })
  }
  if (!parts.length && !ad.note && !ad.link) throw new Error("ไม่มีไฟล์แนบหรือรายละเอียดให้ถอด")
  parts.push({ text: analysisPrompt(ad) })
  const { text, model } = await askVision(parts, SYSTEM)
  const m = text.match(/\{[\s\S]*\}/)
  let a = null
  try { a = m ? JSON.parse(m[0]) : null } catch { a = null }
  if (!a) throw new Error("AI ตอบไม่เป็น JSON — กดถอดใหม่อีกครั้ง")
  return { ...a, model, analyzed_at: new Date().toISOString() }
}

// รูปแบบจากแอด → ก้อนเดียวกับ tasks/video_patterns.json (ตัวเขียนสตอรี่บอร์ดอ่านรวมกัน)
function toPattern(ad) {
  const p = ad.analysis?.pattern
  if (!p?.name || !Array.isArray(p.beats) || p.beats.length < 3) return null
  const days = daysSince(ad.active_since)
  const VIS = /^(pack|bg|branch|machine)(\|(pack|bg|branch|machine))*$/
  return {
    id: `ad-${ad.id.slice(3, 15)}`,
    name: str(p.name, 40), why: str(p.why, 200),
    evidence: [{ src: "ad_box", what: `แอด${ad.page ? `ของ ${ad.page}` : ""} บน ${ad.platform}${ad.note ? ` · ${str(ad.note, 60)}` : ""}`,
      ...(days != null ? { days } : {}), seen: (ad.active_since || ad.created_at || "").slice(0, 7) }],
    fits: { sources: [], subtypes: [], needs_sku: false },
    length: Array.isArray(p.length) && p.length.length === 2 ? p.length.map(n => Math.max(8, Math.min(60, Number(n) || 20))) : [16, 30],
    beats: p.beats.slice(0, 7).map(b => ({
      role: str(b.role, 20) || "beat", say: str(b.say, 160), screen: str(b.screen, 60),
      visual: VIS.test(String(b.visual || "")) ? b.visual : "pack|bg", style: "bold",
    })),
    guard: ["trust_facts_only"],
    from_ad: ad.id, added_at: new Date().toISOString(),
  }
}

export async function GET(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  try {
    const files = (await listObjects(`${DIR}/`, 400)).filter(f => /^research\/ads\/ad-[^/]+\.json$/.test(f.key))
      .sort((a, b) => String(b.modified).localeCompare(String(a.modified))).slice(0, 30)
    const items = (await Promise.all(files.map(f => readJson(f.key)))).filter(Boolean)
    return NextResponse.json({ items, extra: await readJson(EXTRA, []) })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const action = body?.action

  try {
    if (action === "upload") {
      const ext = extOf(body.name)
      const kind = kindOf(ext)
      if (!kind) return NextResponse.json({ error: `ชนิดไฟล์ .${ext || "?"} ใช้ไม่ได้ — รับรูป jpg png webp หรือคลิป mp4 mov webm` }, { status: 400 })
      const size = Number(body.size) || 0
      if (size <= 0 || size > MAX[kind]) {
        return NextResponse.json({ error: kind === "video"
          ? "คลิปใหญ่เกิน 18 MB — ตัดให้สั้นลง (แค่ 10–30 วิแรกพอ) หรือส่งเป็นภาพแคปหลายภาพแทน"
          : "รูปใหญ่เกิน 8 MB" }, { status: 400 })
      }
      const key = `${DIR}/files/${bkk().replace(/-/g, "")}-${Math.random().toString(36).slice(2, 10)}.${ext}`
      return NextResponse.json({ key, kind, content_type: MIME[ext], upload_url: presign("PUT", key, { expires: 3600 }) })
    }

    if (action === "submit") {
      const files = (Array.isArray(body.files) ? body.files : []).slice(0, 6)
        .filter(k => typeof k === "string" && /^research\/ads\/files\/[a-z0-9-]+\.[a-z0-9]{2,5}$/.test(k))
        .map(k => ({ key: k, kind: kindOf(extOf(k)), content_type: MIME[extOf(k)] }))
      const link = str(body.link, 500)
      if (link && !/^https?:\/\//i.test(link)) return NextResponse.json({ error: "ลิงก์ต้องขึ้นต้นด้วย http(s)://" }, { status: 400 })
      if (!files.length && !link) return NextResponse.json({ error: "แนบภาพ/คลิปของแอด หรือใส่ลิงก์อย่างน้อย 1 อย่าง" }, { status: 400 })
      const since = str(body.active_since, 10)
      const ad = {
        id: `ad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        platform: PLATFORMS.includes(body.platform) ? body.platform : "other",
        page: str(body.page, 80), link, note: str(body.note, 300),
        active_since: /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : null,
        files, created_at: new Date().toISOString(), created_by: gate.user.id, status: "new",
      }
      await putObject(`${DIR}/${ad.id}.json`, JSON.stringify(ad), "application/json")
      try {
        ad.analysis = await analyze(ad)
        ad.status = "analyzed"
      } catch (e) {
        ad.analysis_error = e.message
      }
      await putObject(`${DIR}/${ad.id}.json`, JSON.stringify(ad), "application/json")
      return NextResponse.json(ad)
    }

    const id = str(body.id, 60)
    if (!ID_RE.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 })
    const ad = await readJson(`${DIR}/${id}.json`)
    if (!ad) return NextResponse.json({ error: "ไม่พบแอดนี้" }, { status: 404 })

    if (action === "analyze") {
      try {
        ad.analysis = await analyze(ad); ad.status = "analyzed"; delete ad.analysis_error
      } catch (e) { ad.analysis_error = e.message }
      await putObject(`${DIR}/${ad.id}.json`, JSON.stringify(ad), "application/json")
      return NextResponse.json(ad)
    }

    if (action === "adopt") {
      const p = toPattern(ad)
      if (!p) return NextResponse.json({ error: "ผลถอดยังไม่มีรูปแบบที่ใช้ได้ (ต้องมีอย่างน้อย 3 ฉาก) — กดถอดใหม่" }, { status: 422 })
      const extra = (await readJson(EXTRA, [])).filter(x => x?.id !== p.id)
      extra.unshift(p)
      await putObject(EXTRA, JSON.stringify(extra.slice(0, 60)), "application/json")
      ad.status = "adopted"; ad.pattern_id = p.id
      await putObject(`${DIR}/${ad.id}.json`, JSON.stringify(ad), "application/json")
      return NextResponse.json({ ad, pattern: p })
    }

    return NextResponse.json({ error: `ไม่รู้จัก action "${action}"` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
