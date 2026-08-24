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
import { planVisual, ideaToPrompt } from "../../../../../lib/artDirector"
import { detectFranchise, FRANCHISE_LABEL } from "../../../../../lib/franchiseDetect"

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
// ── หาว่าแคปชั่นพูดถึงสาขาไหน ──
//
// 24 ส.ค. 2026 — เจ้าของถามว่าควรให้ Hermes ไปค้นข้อมูลสถานที่จริงบนเน็ตก่อนบรีฟไหม
// ตรวจแล้วพบว่าเรามีข้อมูลที่แม่นกว่าเน็ตอยู่แล้วใน `machines.config.branch`
// — ชั้นจริง + จุดสังเกตจริงที่คนไปติดตั้งตู้จดไว้เอง เช่น "ชั้น 6 หน้าร้าน Karun Thai Tea"
// ซึ่งไม่มีทางหาเจอในอินเทอร์เน็ต แต่ข้อมูลชุดนี้ไม่เคยถูกส่งเข้าบรีฟเลยสักครั้ง
// บรีฟรู้แค่ตัวเลข "12 สาขา" → โปสเตอร์ #35 จึงวาดตู้ไว้นอกห้างริมถนนหน้าไอคอนสยาม
const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, "")

// ชื่อที่คนเขียนเป็นอักษรโรมันบ่อย — ชื่อไทยจับได้เองจาก display_name อยู่แล้ว
const BRANCH_ALIASES = {
  "ไอคอนสยาม": ["iconsiam", "icon siam"],
  "เดอะมอลล์บางกะปิ": ["the mall bangkapi"],
  "ซีคอนบางแค": ["seacon bangkae"],
}

/** @returns {object|null} สาขาที่แคปชั่นเอ่ยถึง — null = โพสต์ไม่ได้ระบุสาขา */
function matchBranch(machines, text) {
  const hay = norm(text)
  if (!hay) return null
  for (const m of machines || []) {
    const b = m.config?.branch
    if (!b?.display_name) continue
    const keys = [b.display_name, ...(BRANCH_ALIASES[b.display_name] || [])]
    if (keys.some(k => hay.includes(norm(k)))) return { ...b, machine_id: m.machine_id }
  }
  return null
}

function buildPrompt(style, concept, facts, mode, hasRefs = false, idea = null, brandRules = [], fr = null, hasMachineRef = false, branch = null) {
  const wantsText = mode !== "art"
  const p = []

  p.push(
    "You are a senior graphic designer creating a square 1:1 social media poster " +
    "for a Thai trading-card vending machine brand. Output a finished, polished poster " +
    "in the style of high-energy Thai retail advertising — layered, dramatic lighting, " +
    "strong focal hierarchy. Not a plain product photo, not a minimal web card."
  )

  // กฎออกแบบที่ถอดจากงานจริงของแบรนด์ — tasks/art_direction.json
  // ⚠️ ต้องอยู่ *ก่อน* ไอเดียภาพ — ทดสอบ 20 ส.ค. 2026 วางกฎไว้ท้ายแล้วกฎกินไอเดีย
  //    (กฎข้อ "สินค้าต้องกินพื้นที่ ≥60%" ทำให้ภาพกลับไปเป็นซองลอยเฉย ๆ
  //     ทั้งที่ตัวคิดเสนอให้เล่าเป็นสองโลกของนักสะสมพร้อมมือคนจัดเด็ค/แฟ้มสะสม)
  //    โมเดลให้น้ำหนักกับสิ่งที่อยู่ท้ายพรอมต์มากกว่า จึงต้องให้ไอเดียปิดท้าย
  if (brandRules.length) {
    p.push("BRAND DESIGN RULES (obey unless they clash with THE ONE IDEA below):\n" +
      brandRules.map((r, i) => `${i + 1}. ${r}`).join("\n"))
  }

  // ⚠️ คอนเซปต์ค่าเริ่มต้นคือ treasure = "ล่าสมบัติ One Piece" ซึ่งผูกกับค่าย OP ทั้งก้อน
  //    ทั้ง label ("ล่าสมบัติ One Piece") mood และ decor (คลื่น สมอ เข็มทิศ เชือก)
  //    ตอนแรกแก้โดยตัดแค่ decor — ไม่พอ เพราะชื่อคอนเซปต์เองก็พาโมเดลไปทางเดิม
  //    ถ้าค่ายไม่ตรง ให้เหลือแค่ทิศทางสี ไม่ส่งชื่อ/อารมณ์/ลายไปเลย
  if (concept) {
    const conceptIsOnePiece = /one piece|ล่าสมบัติ/i.test(
      `${concept.label || ""} ${concept.mood || ""} ${(concept.decor || []).join(" ")}`)
    const conceptFits = !fr || !conceptIsOnePiece || fr.label === "One Piece"
    const palette =
      `Colour direction: background ${concept.palette?.bg}, primary accent ${concept.palette?.accent}, ` +
      `secondary accent ${concept.palette?.accent2}.`
    p.push(conceptFits
      ? `POSTER CONCEPT: ${concept.label} — ${concept.mood}.\n` +
        ((concept.decor || []).length ? `Visual elements to include: ${concept.decor.join(", ")}.\n` : "") +
        palette
      : palette)
  }

  p.push(`BRAND STYLE: ${style.style}`)
  p.push(
    // ⚠️ 20 ส.ค. 2026 — ประโยคนี้เคยเขียนว่า "a One Piece nautical theme" ลอย ๆ
    //    ผลคือโปสเตอร์ Dragonball FB-09 ออกมามีสมอ คลื่น เข็มทิศ นกนางนวลเต็มใบ
    //    ลายเดินเรือเป็นลายที่พิมพ์อยู่บน "ตัวตู้จริง" ไม่ใช่ธีมของโปสเตอร์
    //    ต้องผูกไว้กับตัวตู้เท่านั้น ห้ามให้ลามเป็นกรอบ/พื้นหลังของทั้งใบ
    "BRAND WORLD: the physical vending machine itself is navy blue, wrapped with white ocean " +
    "waves, a gold anchor, stars and seagulls. That nautical artwork belongs to the machine's " +
    "own body panels only — when the machine is in frame, draw it that way. It is NOT the " +
    "poster's theme and must never spread into the frame, border, or background. " +
    "Gold is a genuine brand colour."
  )

  // ⚠️ 24 ส.ค. 2026 — บรีฟเดิมบอกแค่ว่าตู้หน้าตายังไง ไม่เคยบอกว่ามันตั้งอยู่ที่ไหน
  //    ผลคือโปสเตอร์ #35 วาดตู้ตั้งอยู่ "นอกห้าง" ริมถนนตอนกลางคืนหน้าไอคอนสยาม
  //    ทั้งที่แคปชั่นเขียนว่า "เดินห้างชิล ๆ แวะมากดตรงนี้" — ขัดกันเองต่อหน้า
  //    ตู้ทั้ง 12 ตู้อยู่ในห้างทั้งหมด ไม่มีตู้ไหนอยู่นอกอาคารเลยสักตู้
  p.push(
    "SETTING — non-negotiable: every machine stands INSIDE a Thai shopping-mall concourse. " +
    "Polished indoor floor, warm mall ceiling lighting, softly blurred storefronts, " +
    "escalators or walkways behind. Never outdoors, never a street or sidewalk, never a " +
    "night sky, never a parking lot, never floating in an empty void or studio backdrop. " +
    "If a landmark is referenced it is the mall's INTERIOR, not its exterior facade." +
    // จุดสังเกตจริงของสาขานั้น ถ้าแคปชั่นเอ่ยชื่อห้างมา — ของจริงจากฐานข้อมูล ไม่ใช่ของที่โมเดลเดา
    (branch
      ? `\nTHIS POST NAMES A REAL BRANCH — draw THAT spot, not a generic mall: ` +
        `${branch.display_name}${branch.floor ? `, ${branch.floor}` : ""}` +
        `${branch.landmark ? `, จุดที่ตู้ตั้งอยู่คือ ${branch.landmark}` : ""}. ` +
        `Use those neighbouring shops and that floor's character as the background. ` +
        `Do not invent a different location for this branch.`
      : "")
  )

  // จาก #35 — ถือซองเรียงเป็นพัดได้ (เจ้าของชอบองค์ประกอบนี้) แต่ลายบนซอง
  // ต้องเป็นซองจริงของเรา ไม่ใช่ลายที่โมเดลแต่งขึ้นเอง
  p.push(
    "PACKS IN HAND: a hand may hold several packs fanned out — that composition is welcome. " +
    "But every pack must be one of the REAL products from the reference photos, copied " +
    "faithfully. Never invent pack artwork, never invent a card game that is not ours. " +
    "If several packs are shown they should be different real products, each recognisable."
  )

  // ตกแต่งตามค่ายของสินค้าที่โพสต์นี้พูดถึง — จาก skus.franchise (tasks/franchise_style.json)
  // เดิมไม่มีขั้นนี้ ทุกโพสต์จึงได้ลายเดินเรือเหมือนกันหมดไม่ว่าจะขาย Dragon Ball หรือ Pokemon
  if (fr?.decor) {
    p.push(
      `FRANCHISE ATMOSPHERE — this post is about ${fr.label}:\n${fr.decor}\n` +
      "Use this to set the mood, ornament and lighting of the whole poster. " +
      "Do not mix in motifs belonging to a different franchise."
    )
  }

  // ข้อเท็จจริง — ส่วนที่ทำให้ต่างจากการเปิด ChatGPT ทำมือ
  p.push("FACTS (the only numbers and names you may use):\n" + facts.join("\n"))
  p.push(style.facts_rule)

  // ⚠️ คำสั่งห้ามวาดสินค้าใหม่ — ต้องอยู่ในพรอมต์ทุกครั้งที่แนบรูปอ้างอิง
  // เดิมคีย์นี้มีอยู่ใน image_style.json แต่ไม่มีใครเรียก (dead config) มาตลอด
  // ซึ่งเป็นประโยคเดียวกับที่ทำให้รอบสั่ง ChatGPT ด้วยมือได้ซองจริง ส่วน API ได้ซองที่โมเดลวาดเอง
  if (hasRefs && style.with_reference) {
    p.push(
      "REFERENCE IMAGES: " + style.with_reference + "\n" +
      // ⚠️ 20 ส.ค. 2026 — เคยเข้าใจผิดว่าโมเดลแปะลายน้ำ "DIVISION X CARD" ลงบนซองเอง
      //    ที่จริง **รูปต้นทางของเรามีลายน้ำอยู่แล้ว** (ซีรีส์ OP กับ EB มีทุกใบ · FB/MLP/MLBB สะอาด)
      //    โมเดลแค่ลอกมาตามที่สั่ง
      //    เคยเขียนห้าม "overlay อะไรลงบนซอง" ซึ่งขัดกับคำสั่งให้ลอกให้เหมือน → ถอดออก
      //    คำสั่งที่ถูกต้องคือห้าม *เพิ่มของที่ไม่มีในรูปต้นฉบับ* ไม่ใช่ห้ามลอกของที่มี
      "Reproduce the pack exactly as it appears in the reference photo, including any " +
      "watermark or marking already printed on that photo. Do not ADD anything that is not " +
      "already there — no new logo, sticker, price tag, badge, or glow drawn onto the packaging." +
      // บอกให้ชัดว่ารูปไหนคือรูปอะไร ไม่งั้นโมเดลอาจเอาลายตู้ไปแปะบนซอง หรือกลับกัน
      (hasMachineRef
        ? "\n\nOne of the reference photos is our ACTUAL vending machine — a navy cabinet with a " +
          "glass front, six shelves of hanging card packs in numbered slots, a touchscreen on the " +
          "right, and a 'PUSH & PICK' collection flap at the bottom. If the machine appears in this " +
          "poster, match that real hardware: the real shelf layout, the real slot rails, the real " +
          "front panel. Do not invent a different machine or a generic snack vending machine.\n" +
          // ตู้จริงมีสินค้า 28-38 ชนิดต่อตู้ ไม่มีชนิดไหนเกิน 13% ของช่อง
          // เคยได้ภาพที่เป็นซองเดียวกันเต็มตู้ เจ้าของบอกว่า "ดูไม่น่าเชื่อถือ" — ถูกต้อง
          "IMPORTANT — the machine is stocked with MANY DIFFERENT products: roughly 30 distinct " +
          "card packs from several franchises across about 55 slots, so each shelf shows a mix of " +
          "clearly different pack designs and colors, and no single product ever fills a whole " +
          "shelf or the whole cabinet. Never draw the same pack repeated in every slot — a machine " +
          "stocked with one identical product looks fake. If the poster highlights one specific " +
          "product, show it in only a few slots among the varied rest."
        : "")
    )
  }

  if (wantsText) {
    p.push(style.thai_rule)
    // ⚠️ ปิดช่องที่โมเดลเติมข้อความเอง — ทดสอบ 19 ส.ค. 2026 พบว่ามันแถมป้ายไทย
    // ที่ไม่ได้อยู่ใน FACTS มา 2 บรรทัด รอบนั้นบังเอิญเขียนถูกและตรงเนื้อหา
    // แต่แปลว่าข้อความที่ไม่เคยผ่านด่านตรวจคำเว่อร์ขึ้นภาพได้ (ดู content_voice.json → overclaim)
    // facts_rule เดิมพูดถึงแค่ "ตัวเลข" ไม่ได้ห้ามคำ จึงต้องเขียนย้ำเป็นข้อห้ามเด็ดขาด
    p.push(
      "TEXT LOCK — read carefully:\n" +
      "The ONLY text allowed anywhere in this image is the exact strings listed under FACTS above, " +
      "copied character-for-character. Do NOT add any other word, label, badge, tagline, caption, " +
      "bullet point, price, sticker, button, or watermark — not in Thai, not in English, not anywhere, " +
      "however small or decorative. If a layout area looks empty, leave it empty or fill it with " +
      "artwork and lighting. An extra invented word makes the whole poster unusable."
    )
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

  // ไอเดียภาพปิดท้ายพรอมต์ — โมเดลให้น้ำหนักกับสิ่งที่อยู่ท้ายสุดมากที่สุด
  // ถ้าวางไว้ต้น ๆ กฎแบรนด์ 29 ข้อที่ตามมาจะกลบจนภาพกลับไปเป็นซองวางบนแท่นเหมือนเดิม
  if (idea) {
    p.push(idea + "\n\nThis idea outranks every stylistic preference above. " +
      "If a brand rule would flatten it into a plain product shot, follow the idea.")
  }
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
    const { data: machines } = await db.from("machines").select("machine_id,config").eq("status", "active")
    const branches = (machines || []).length

    const skuId = content.source_sku || content.idea?.related_sku
    let sku = null
    if (skuId) {
      const { data } = await db.from("skus")
        .select("sku_id,name,franchise,image_url,image_url_box").eq("sku_id", skuId).maybeSingle()
      sku = data
    }

    const caption = (content.caption || "").replace(/#\S+/g, "").trim()
    const lines = caption.split("\n").map(s => s.trim()).filter(Boolean)
    const facts = [
      `- Brand name: DivisionX Card (logo wordmark "DC")`,
      `- Number of branches (real, from database): ${branches}`,
      // ⚠️ ห้ามเขียนว่า open 24 hours ตรงนี้อีก — ตู้อยู่ในห้าง เปิด-ปิดตามเวลาห้าง
      //    เคยหลุดออกโปสเตอร์มาแล้ว 2 รอบ (ดู wiki/worklog/2026-08-21-24hour-claim-regression.md)
      `- Business: self-service trading-card vending machines inside Thai shopping malls, ` +
        `open every day during mall hours`,
      sku ? `- Product shown: ${sku.name} (${sku.sku_id}) — an authentic sealed booster pack` : null,
      lines.length ? `- Headline text to place (Thai, copy exactly): "${lines[0]}"` : null,
      lines.length > 1 ? `- Supporting line (Thai, copy exactly): "${lines[1]}"` : null,
      `- Trust badges to show: ของแท้ 100% · ไม่มีวันหยุด · ${branches} สาขา`,
    ].filter(Boolean)

    // ประกาศค่ายให้ชัดที่สุด — เคสจริง 24 ส.ค. 2026 โพสต์ #PokemonTCG
    // ได้ซอง One Piece ไปทั้งสามซอง เพราะไม่มีใครบอกโมเดลว่าโพสต์นี้เรื่องอะไร
    if (wantFr) {
      facts.unshift(
        `- THIS POST IS ABOUT: ${FRANCHISE_LABEL[wantFr] || wantFr}. ` +
        `Every card pack in the image must be from THIS card game only. ` +
        `Showing packs from any other franchise is a hard failure.`)
    }

    // ── รูปอ้างอิง: ซองจริง + ตู้จริง ──
    //
    // ⚠️ 24 ส.ค. 2026 — เดิมแนบรูปซองเฉพาะตอนที่คอนเทนต์ผูกกับ SKU
    //    โพสต์แนวบรรยากาศ (เช่น #35 "ไปเดินไอคอนสยามทีไร...") ไม่ผูก SKU
    //    โมเดลจึงไม่มีซองจริงให้ลอกเลย แล้วแต่งลายซองขึ้นเอง → เจ้าของบอกว่า "ไม่เนียน"
    //
    //    ถ้าไม่มี SKU ให้หยิบซองขายดีจริงมา 3 ตัวเป็นตัวอย่างแทน
    //    เลือกจากยอดขาย 30 วันจริง ไม่ใช่สุ่ม — จะได้เป็นของที่ลูกค้าเห็นในตู้จริง ๆ
    // เดาค่ายครั้งเดียว ใช้ทั้งการเลือกรูปอ้างอิงและการบรีฟตัวคิดไอเดียภาพ
    // ⚠️ ต้องอยู่นอกบล็อก else ด้านล่าง — ก่อนหน้านี้ตัวคิดไอเดียดูแต่ sku?.franchise
    //    พอคอนเทนต์ไม่ผูก SKU มันเลยไม่รู้ว่าโพสต์นี้เรื่องค่ายอะไร
    const wantFr = sku?.franchise
      || detectFranchise(caption, content.idea?.title, content.source_reason)

    const refs = []
    const packRef = await fetchRef(sku?.image_url || sku?.image_url_box)
    if (packRef) {
      refs.push(packRef)
    } else {
      // ⚠️ 24 ส.ค. 2026 — เดิมหยิบ "3 SKU ขายดีที่สุด" โดยไม่ดูค่าย
      //    ผลคือโพสต์โปเกมอน (#PokemonTCG) ได้ซอง One Piece ไปลอกทั้งสามซอง
      //    เพราะ OP เป็น 22 จาก 47 SKU และครองอันดับขายดี
      //    → ต้องกรองตามค่ายที่แคปชั่นพูดถึงก่อนเสมอ
      let { data: topSkus } = await db.from("skus")
        .select("sku_id,name,franchise,image_url,image_url_box")
        .eq("is_active", true).not("image_url", "is", null).limit(60)
      if (wantFr) {
        const same = (topSkus || []).filter(s => s.franchise === wantFr)
        // ถ้าค่ายนั้นไม่มีรูปซองเลย ยอมใช้ของทั้งหมดดีกว่าไม่มีรูปอ้างอิง
        // แต่ต้องบอกโมเดลให้ชัดว่าอย่าเอาลายพวกนี้ไปใช้ (ดู facts ด้านล่าง)
        if (same.length) topSkus = same
      }
      // เรียงตามยอดขาย 30 วัน แล้วเอา 3 ตัวแรกที่มีรูป
      const since = new Date(Date.now() - 30 * 864e5).toISOString()
      const { data: recent } = await db.from("sales")
        .select("sku_id,quantity_sold").gte("sold_at", since).limit(5000)
      const sold = {}
      for (const r of recent || []) sold[r.sku_id] = (sold[r.sku_id] || 0) + (r.quantity_sold || 0)
      const picked = (topSkus || [])
        .sort((a, b) => (sold[b.sku_id] || 0) - (sold[a.sku_id] || 0))
        .slice(0, 3)
      for (const s of picked) {
        const r = await fetchRef(s.image_url || s.image_url_box)
        if (r) refs.push(r)
      }
      if (picked.length) {
        const sameFr = !wantFr || picked.every(s => s.franchise === wantFr)
        facts.push(`- Real products available to show in the scene: ` +
          picked.map(s => s.name).join(" · "))
        if (wantFr && !sameFr) {
          // ค่ายที่โพสต์พูดถึงไม่มีรูปซองในระบบ — เตือนตรง ๆ ดีกว่าปล่อยให้ลอกผิดค่าย
          facts.push(`- ⚠️ WARNING: this post is about ${FRANCHISE_LABEL[wantFr] || wantFr} ` +
            `but the reference photos are from a DIFFERENT card game. ` +
            `Do NOT copy those pack designs. Show the machine, the mall, hands, ` +
            `or packaging seen from behind/at an angle instead — never invent ` +
            `${FRANCHISE_LABEL[wantFr] || wantFr} artwork.`)
        }
      }
    }
    const conceptsCfg = await loadJson("poster_concepts.json")
    const conceptKey = body.concept || conceptsCfg?.default || ""
    const concept = (conceptsCfg?.concepts || []).find(c => c.key === conceptKey) || null
    if (concept && !concept.available) {
      return NextResponse.json({
        error: `แนวคิด "${concept.label}" ยังใช้ไม่ได้`,
        hint: concept.blocked_why,
      }, { status: 422 })
    }
    const mode = body.mode || style.poster_mode || "full"

    // ── ขั้นคิดไอเดียภาพ (ก่อนวาด) ──
    // ค่าใช้จ่ายหลักหลักสตางค์ต่อครั้ง เทียบกับค่าวาด $0.17 → คุ้มมากถ้าช่วยให้ไม่ต้องวาดซ้ำ
    // ล้มแล้วไม่ทำให้ทั้งงานล้ม — planVisual คืน null แล้วเราวาดต่อแบบเดิม
    const artCfg = await loadJson("art_direction.json")
    const brandRules = artCfg?.rules || []

    // ธีมตามค่ายของสินค้า — ถ้าโพสต์ไม่ผูกกับ SKU ไหนเลยก็ใช้ค่ากลางที่ไม่มีลายค่ายใด
    const frCfg = await loadJson("franchise_style.json")
    const fr = wantFr ? (frCfg?.franchises || {})[wantFr] : null
    const frBlock = fr || (frCfg?.default ? { label: "แบรนด์กลาง", decor: frCfg.default } : null)

    const idea = await planVisual({
      caption,
      format: content.content_format,
      sku: sku?.name,
      franchise: fr?.label,
      rules: brandRules,
    })

    // ── รูปตู้จริง — ต้องตัดสินใจ *หลัง* ได้ไอเดียแล้ว ──
    // เดิมแนบเฉพาะตอน concept เป็น machine_luck/real_machine แต่หน้าเว็บไม่เคยส่ง concept มา
    // มันจึงตกไปที่ default ทุกครั้ง = โมเดลไม่เคยเห็นรูปตู้จริงเลยสักครั้ง วาดจากจินตนาการล้วน
    // นั่นคือสาเหตุที่เจ้าของบอกว่า "ช่องกับกล่องหน้าตู้ยังไม่ใช่ของจริง"
    //
    // เกณฑ์ใหม่: แนบเมื่อไอเดียภาพพูดถึงตู้/ช่อง — ตรงกับสิ่งที่จะวาดจริง
    // ไม่แนบพร่ำเพรื่อเพราะ gpt-image-2 ประมวลผลรูปอ้างอิงที่ fidelity สูงเสมอ ค่า input แพงขึ้นจริง
    const MACHINE_WORDS = /ตู้|ช่อง|หน้าตู้|กด(เอง|ซอง)|machine|vending|kiosk|slot|dispenser/i
    const ideaText = idea
      ? `${idea.big_idea || ""} ${idea.subject || ""} ${idea.composition || ""} ${idea.visual_device || ""}`
      : ""
    const wantsMachine = ["machine_luck", "real_machine"].includes(conceptKey) ||
                         MACHINE_WORDS.test(ideaText)
    if (wantsMachine) {
      const m = await localRef("machine/machine-hero.jpg")
      if (m) refs.push(m)
    }

    // แคปชั่นเอ่ยชื่อห้างไหน → ส่งชั้น+จุดสังเกตจริงของสาขานั้นเข้าบรีฟ
    const branch = matchBranch(machines, `${caption} ${content.idea?.title || ""}`)
    if (branch) console.log(`[image] แคปชั่นอ้างถึงสาขา ${branch.display_name} (${branch.machine_id})`)

    const prompt = buildPrompt(
      style, concept, facts, mode, refs.length > 0,
      idea ? ideaToPrompt(idea) : null,
      brandRules, frBlock, wantsMachine, branch,
    )

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
        // เห็นชัดว่ารอบนี้แนบรูปตู้จริงไปด้วยไหม — ถ้าภาพออกมาตู้ยังเพี้ยนทั้งที่แนบแล้ว
        // แปลว่าปัญหาอยู่ที่โมเดล ไม่ใช่ที่เราลืมแนบ
        machine_ref: wantsMachine,
        franchise: frBlock?.label || null,
        bytes: out.buf.length,
        // ถ้าโมเดลแรกพัง มันจะเลื่อนไปตัวถัดไปเงียบ ๆ — ต้องคืนออกมาให้เห็น
        // ไม่งั้นจะเข้าใจผิดว่ากำลังทดสอบโมเดลที่ตั้งไว้ ทั้งที่ได้ภาพจากตัวสำรอง
        fell_back_from: out.attempts?.length ? out.attempts : undefined,
        usage: out.usage || undefined,
        // ไอเดียภาพที่คิดได้ — คืนออกมาให้เห็นว่าภาพนี้ตั้งใจสื่ออะไร
        // ถ้าภาพออกมาไม่ตรงใจ จะได้รู้ว่าพลาดที่ขั้นคิด หรือขั้นวาด
        idea: idea ? {
          big_idea: idea.big_idea,
          visual_device: idea.visual_device,
          why_it_works: idea.why_it_works,
          model: idea._model,
        } : null,
        brand_rules_applied: brandRules.length,
      },
    })
  } catch (err) {
    return NextResponse.json({
      error: err.message,
      attempts: err.attempts?.length ? err.attempts : undefined,
    }, { status: 500 })
  }
}
