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

// หลักการเขียนเชิงวิชาชีพ — แยกไฟล์จาก voice เพราะเปลี่ยนคนละจังหวะกัน
// voice = เราเป็นใคร (เปลี่ยนตอนรีแบรนด์) · craft = ฝีมือการเขียน (เป็นหลักสากล แทบไม่เปลี่ยน)
// ถ้าไฟล์หาย/พัง ต้องยังเขียนได้ตามปกติ แค่ไม่มีหลักกำกับ — ห้ามพังทั้งฟีเจอร์
async function loadCraft() {
  try {
    const p = path.join(process.cwd(), "tasks", "content_craft.json")
    return JSON.parse(await readFile(p, "utf-8"))
  } catch { return null }
}

// ประกอบเฉพาะส่วนที่ตรงกับรูปแบบโพสต์รอบนี้
//
// ทำไมไม่ยัดทั้งไฟล์: craft มีหลายพันตัวอักษร ถ้าใส่หมดทุกครั้ง
// (ก) qwen/gemini-flash จะจมข้อมูลจนลืมโจทย์จริง (ข) เปลืองโควตา
// (ค) ให้ framework มาทั้ง 8 แบบพร้อมกัน = ไม่ได้บังคับให้ใช้แบบไหนเลย
// หยิบทีละอันทำให้แต่ละรูปแบบ "เขียนคนละท่า" จริง ๆ ซึ่งคือเป้าหมายของทั้งเรื่อง
function craftBlock(craft, format, platform) {
  if (!craft) return ""
  const parts = []

  if (craft.principles?.length) {
    parts.push("หลักการเขียนที่ต้องยึดทุกโพสต์:\n" +
      craft.principles.map(p => `- ${p}`).join("\n"))
  }

  const hook = craft.hooks?.[format?.hook]
  if (hook) {
    parts.push(`วิธีเปิดเรื่องรอบนี้ — ${hook.label}:\n` +
      `${hook.how}` +
      (hook.watch_out ? `\nระวัง: ${hook.watch_out}` : ""))
  }

  const fw = craft.frameworks?.[format?.framework]
  if (fw) {
    parts.push(`โครงสร้างที่ต้องใช้ — ${fw.label}:\n` +
      fw.steps.map((s, i) => `${i + 1}) ${s}`).join("\n") +
      (fw.watch_out ? `\nระวัง: ${fw.watch_out}` : ""))
  }

  const plat = craft.platform?.[platform]
  if (plat) parts.push(`ธรรมเนียมของแพลตฟอร์มนี้:\n${plat}`)

  if (craft.cta?.rules?.length) {
    parts.push("คำชวนท้ายโพสต์:\n" + craft.cta.rules.map(r => `- ${r}`).join("\n"))
  }
  if (craft.avoid?.length) {
    parts.push("ห้ามทำ (ทำแล้วเอ็นเกจเมนต์ตก):\n" + craft.avoid.map(a => `- ${a}`).join("\n"))
  }

  return parts.join("\n\n")
}

// summary ของข่าวจาก Google News RSS เป็น <a href> ล้วน ไม่มีเนื้อข่าวเลย (เช็กแล้ว 28/28 ชิ้น)
// ถ้าปล่อยเข้า prompt เป็น "รายละเอียดเพิ่ม" = ยัดขยะให้โมเดลอ่าน
// ล้าง tag ทิ้งแล้วเหลืออะไรที่อ่านได้จริงค่อยส่ง
function cleanSummary(s) {
  if (!s) return null
  if (s.startsWith("ปก:")) return null              // tiktok เก็บ url รูปปกไว้ตรงนี้
  const txt = s.replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ").trim()
  // ต้องมีเนื้อความจริงพอสมควร ไม่ใช่เศษคำที่เหลือจากการล้าง tag
  return txt.length >= 25 ? txt : null
}

// ── กันเขียนซ้ำ ──────────────────────────────────────────────────────────
// ถอด emoji/แฮชแท็ก/ช่องว่างออกก่อนเทียบ เพราะสองโพสต์ที่ "ต่างแค่ emoji"
// คือซ้ำในสายตาคนอ่าน (เจอจริง: #1 กับ #3 ต่างกันแค่ FB-09 กับ FB-06)
function normalize(s) {
  return (s || "").toLowerCase()
    .replace(/#\S+/g, " ")
    .replace(/[^฀-๿a-z0-9]+/g, " ")
    .replace(/\s+/g, " ").trim()
}

// Jaccard บน 4-gram ระดับตัวอักษร — ทนการสลับคำ/เปลี่ยนชื่อ SKU มากกว่าเทียบทั้งสตริง
function similarity(a, b) {
  const gram = (s) => {
    const t = normalize(s), out = new Set()
    for (let i = 0; i + 4 <= t.length; i++) out.add(t.slice(i, i + 4))
    return out
  }
  const A = gram(a), B = gram(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / (A.size + B.size - inter)
}

function closestRecent(caption, recent) {
  let best = { score: 0, item: null }
  for (const r of recent) {
    const s = similarity(caption, r.caption)
    if (s > best.score) best = { score: s, item: r }
  }
  return best
}

// เลือกรูปแบบโพสต์ — เลี่ยงอันที่เพิ่งใช้ไปในแคปชั่นล่าสุด
// สุ่มจริง (ไม่ใช่ hash จาก id) เพื่อให้ปุ่ม "เขียนใหม่" ได้ของต่างจริง ๆ
//
// ⚠️ จุดที่เคยพลาด: ถ้า fallback เป็น "สุ่มจากทั้งหมด" ตอนที่ใช้ครบทุกแบบแล้ว
// พอหน้าต่าง recent (8) เต็มด้วยครบ 8 แบบพอดี มันจะรีเซ็ตกลับไปสุ่มมั่ว
// ทำให้ยังซ้ำติดกันอยู่ ~2% · แก้เป็นถอยไปเลี่ยงแค่ 3 อันล่าสุดแทน
// จะได้เหลือ pool เสมอและไม่มีวันหยิบซ้ำกับที่เพิ่งใช้
const AVOID_LAST = 3

function pickFormat(voice, recent) {
  const all = voice.content_formats || []
  if (!all.length) return null
  const seq = recent.map(r => r.format).filter(Boolean)   // ใหม่สุดอยู่หน้า
  const used = new Set(seq)
  let pool = all.filter(f => !used.has(f.key))
  if (!pool.length) {
    const lastFew = new Set(seq.slice(0, AVOID_LAST))
    pool = all.filter(f => !lastFew.has(f.key))
  }
  if (!pool.length) pool = all                            // กันกรณีมี format น้อยกว่า 4 อัน
  return pool[Math.floor(Math.random() * pool.length)]
}

function buildPrompt(voice, idea, content, sku, recent = [], format = null, craft = null) {
  const rules = voice.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
  const phrases = voice.catchphrases.map(p => `- "${p}"`).join("\n")

  // ตัวอย่างภาษาไทยเป็นตัวแปรสำคัญที่สุด — qwen เป็นโมเดลจีน สั่งเป็นข้อความอย่างเดียว
  // ยังเขียนออกมาเป็นจีนอยู่ดี (ทดสอบแล้ว) · ใส่ตัวอย่างช่วยทั้งภาษาและความเร็ว
  const example = voice.example
    ? `\nตัวอย่างแคปชั่นที่ถูกต้อง (ใช้เป็นแบบอย่างของ "ภาษา/โทน" เท่านั้น ห้ามลอกเนื้อหา):\n---\n${voice.example}\n---\n`
    : ""

  // หลักการเขียน — วางไว้ในระบบ (ไม่ใช่ user) เพราะเป็นตัวตนของคนเขียน ไม่ใช่โจทย์ของงานชิ้นนี้
  const craftText = craftBlock(craft, format, content.platform)
  const craftPart = craftText ? `\n━━━ หลักการเขียนเชิงวิชาชีพ ━━━\n${craftText}\n` : ""

  const system = `คุณเป็นนักเขียนคอนเทนต์มืออาชีพที่เขียนให้ ${voice.brand}
สโลแกน: "${voice.slogan}" · กลุ่มเป้าหมาย: ${voice.audience}
โทนเสียง: ${voice.tone}

**ภาษา: เขียนเป็นภาษาไทยเท่านั้น** ห้ามใช้ภาษาจีน ญี่ปุ่น หรืออังกฤษเป็นประโยค
(ชื่อการ์ด/ชุด เช่น "One Piece OP-13" เป็นอังกฤษได้)

วลีติดปากของแบรนด์ (หยิบใช้ตามบริบท ไม่ต้องยัดทุกอัน):
${phrases}

กฎเข้ม:
${rules}
${craftPart}${example}
ตอบกลับเป็น "ตัวแคปชั่นล้วน ๆ" เท่านั้น ห้ามมีคำอธิบาย ห้ามมีหัวข้อ ห้ามครอบด้วยเครื่องหมายคำพูด`

  const facts = [
    `หัวข้อ/ที่มา: ${idea?.title || content.source_reason || "-"}`,
    // angle จากตัวเก็บไอเดียเป็น template ซ้ำ ๆ (ข่าว One Piece 8 ชิ้นได้ข้อความเดียวกัน)
    // ใส่ไว้เป็นบริบทได้ แต่ต้องบอกชัดว่าห้ามลอก ไม่งั้นโมเดลจะคายมันกลับมาเป็นแคปชั่น
    // (เกิดจริงกับ #13 — แคปชั่นที่บันทึกไว้คือข้อความ angle เป๊ะ ๆ)
    idea?.angle ? `ทิศทางคร่าว ๆ (เป็นแค่บริบท ห้ามลอกข้อความนี้ไปใช้): ${idea.angle}` : null,
    cleanSummary(idea?.summary) ? `รายละเอียดเพิ่ม: ${cleanSummary(idea.summary)}` : null,
    sku ? `สินค้าที่โยงถึง: ${sku.name} (${sku.sku_id})` : null,
    `แพลตฟอร์ม: ${content.platform === "line" ? "LINE OA" : "Facebook เพจ"}`,
  ].filter(Boolean).join("\n")

  const fmt = format
    ? `\nรูปแบบโพสต์ที่ต้องใช้รอบนี้: **${format.label}**\n${format.brief}\n`
    : ""

  // ให้เห็นของเก่าเพื่อ "เลี่ยง" ไม่ใช่เพื่อ "เลียนแบบ" — ต้องบอกให้ชัด
  // ไม่งั้นโมเดลมองเป็นตัวอย่างแล้วเขียนคล้ายเดิมยิ่งกว่าเดิม
  const avoid = recent.length
    ? `\nโพสต์ที่เพิ่งลงไปแล้ว — **ห้ามเขียนซ้ำแนวนี้**:\n` +
      recent.map((r, i) => `${i + 1}. ${(r.caption || "").split("\n")[0].slice(0, 80)}`).join("\n") +
      `\n\nชิ้นใหม่ต้องต่างจากข้างบนทั้ง 3 อย่าง: ประโยคเปิด · โครงสร้าง · มุมที่เล่า\n` +
      `ถ้าเผลอเขียนคล้ายอันไหน ให้ทิ้งแล้วคิดใหม่\n`
    : ""

  // ให้ตรวจงานตัวเองก่อนส่ง — วางท้ายสุดเพราะเป็นขั้นสุดท้ายที่อยากให้ทำ
  // ย้ำว่าตรวจ "ในใจ" ไม่งั้นบางโมเดลจะพิมพ์คำตอบของ checklist ออกมาด้วย
  const check = craft?.self_check?.length
    ? `\nก่อนส่ง ตรวจในใจ (ห้ามพิมพ์คำตอบออกมา) — ถ้าข้อไหนไม่ผ่านให้แก้ก่อน:\n` +
      craft.self_check.map((c, i) => `${i + 1}. ${c}`).join("\n") + "\n"
    : ""

  // คำสั่งภาษาย้ำท้ายสุด — โมเดลให้น้ำหนักกับสิ่งที่อยู่ท้าย prompt มากกว่า
  const user = `เขียนแคปชั่น 1 ชิ้นจากข้อมูลนี้:

${facts}
${fmt}${avoid}
อย่าลอกหัวข้อข่าวมาตรง ๆ ให้เอาแก่นของเรื่องมาเล่าใหม่ในมุมของตู้ DivisionX
${check}
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

// แคปชั่นล่าสุดที่ยังมีชีวิต (ไม่นับที่ถูกทิ้ง) — ใช้เป็นรายการ "ห้ามเขียนซ้ำ"
//
// content_format มาจาก migration 062 · ถ้ายังไม่ได้รัน select จะ error
// เลยลองแบบมีคอลัมน์ก่อนแล้ว fallback — ฟีเจอร์กันซ้ำต้องใช้ได้ทันทีโดยไม่ต้องรอ migration
async function fetchRecent(limit) {
  const base = () => db.from("marketing_content")
    .in("status", ["posted", "approved", "pending"])
    .not("caption", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit)
  let { data, error } = await base().select("id,caption,content_format")
  if (error) ({ data } = await base().select("id,caption"))
  return (data || []).map(r => ({ ...r, format: r.content_format || null }))
}

// เกินเท่านี้ถือว่าซ้ำจนคนอ่านจับได้ — 0.5 มาจากลองกับ #1 vs #3 ที่ต่างกันแค่รหัส SKU
const SIMILAR_LIMIT = 0.5

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

    const [voice, craft] = await Promise.all([loadVoice(), loadCraft()])
    const recent = await fetchRecent(voice.recent_captions_shown || 8)
    const format = pickFormat(voice, recent)
    const prompt = buildPrompt(voice, idea, content, sku, recent, format, craft)

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

    let caption = tidy(out.text)
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

    // ── เขียนซ้ำของเก่า? ให้โอกาสแก้ตัวรอบเดียว ──
    // ไม่ throw ทิ้งเพราะผู้ใช้จะต้องมานั่งกดเองซ้ำ ๆ · แต่ก็ไม่บันทึกเงียบ ๆ
    // ถ้ายังซ้ำอยู่ ส่ง similar กลับไปให้การ์ดขึ้นเตือน แล้วให้คนตัดสิน
    let dup = closestRecent(caption, recent)
    let usedFormat = format
    let retried = false
    if (recent.length && dup.score >= SIMILAR_LIMIT) {
      retried = true
      const altFormat = pickFormat(voice, [...recent, { format: format?.key }])
      const harder = buildPrompt(voice, idea, content, sku, recent, altFormat, craft)
      harder.user +=
        `\n\n⚠️ รอบที่แล้วคุณเขียนออกมาคล้ายโพสต์เก่าถึง ${Math.round(dup.score * 100)}%:\n` +
        `"${(dup.item?.caption || "").split("\n")[0].slice(0, 90)}"\n` +
        `รอบนี้ต้องเปลี่ยน**ทั้งประโยคเปิดและมุมที่เล่า** ห้ามใช้โครงเดิม`
      try {
        const second =
          provider === "claude" ? await askClaude(voice, harder)
          : provider === "gemini" ? await askGemini(voice, harder)
          : await askOllama(voice, harder, AbortSignal.timeout(180000))
        const c2 = tidy(second.text)
        const d2 = closestRecent(c2, recent)
        // รับเฉพาะตอนที่ "ดีขึ้นจริง" — ไม่งั้นเก็บของรอบแรกไว้ดีกว่า
        if (c2 && looksThai(c2) && d2.score < dup.score) {
          caption = c2; dup = d2; out = second; usedFormat = altFormat
        }
      } catch { /* รอบสองล้มก็ใช้ของรอบแรก ดีกว่าไม่ได้อะไรเลย */ }
    }

    const EMBED = "*, idea:marketing_ideas!marketing_content_idea_id_fkey(id,url,source,source_label)"
    const base = { caption, status: "pending", created_by: "ai" }
    // content_format มาจาก migration 062 — ถ้ายังไม่ได้รันให้บันทึกแบบไม่มีคอลัมน์นี้
    let { data: updated, error: e1 } = await db.from("marketing_content")
      .update({ ...base, content_format: usedFormat?.key || null })
      .eq("id", id).select(EMBED).maybeSingle()
    if (e1) {
      ;({ data: updated, error: e1 } = await db.from("marketing_content")
        .update(base).eq("id", id).select(EMBED).maybeSingle())
    }
    if (e1) throw e1

    return NextResponse.json({
      ...updated,
      generated_by: out.model,
      provider,
      format: usedFormat ? { key: usedFormat.key, label: usedFormat.label } : null,
      retried,
      // การ์ดเอาไปขึ้นป้ายเตือนว่า "คล้ายของเก่า" ให้คนตรวจก่อนอนุมัติ
      similar: dup.score >= SIMILAR_LIMIT
        ? { score: Math.round(dup.score * 100), id: dup.item?.id,
            preview: (dup.item?.caption || "").split("\n")[0].slice(0, 90) }
        : null,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
