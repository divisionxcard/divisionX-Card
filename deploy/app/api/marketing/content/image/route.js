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
import { topSkusByFranchise } from "../../../../../lib/skuPicker"

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

// ── เลือกคอนเซปต์โปสเตอร์ให้เข้ากับรูปแบบโพสต์ ──
//
// ⚠️ 25 ส.ค. 2026 — เจ้าของบอกว่าโปสเตอร์ "หน้าตาซ้ำ ๆ" ทั้งที่แคปชั่นใช้ครบ 8 รูปแบบ
//    ไล่ดูแล้วพบว่าหน้าเว็บ **ไม่เคยส่ง concept มาเลยสักครั้ง** (grep ไม่เจอ)
//    ทุกใบจึงตกไปที่ค่าเริ่มต้น `treasure` เหมือนกันหมด — มี 10 คอนเซปต์ ใช้จริง 1
//    ซ้ำร้าย treasure เป็นธีม One Piece โดยเฉพาะ (คลื่น สมอ เข็มทิศ)
//    จึงเป็นเหตุผลที่โปสเตอร์ Dragon Ball เคยได้สมอกับนกนางนวล
//
// แต่ละรูปแบบโพสต์เข้ากับคอนเซปต์คนละชุด — เรียงตัวที่เข้าที่สุดไว้หน้า
const FORMAT_CONCEPTS = {
  news_hook: ["viral", "real_machine", "battle"],
  question:  ["viral", "machine_luck", "real_machine"],
  ranking:   ["battle", "luxury", "machine_luck"],
  beginner:  ["real_machine", "machine_luck", "unbox"],
  story:     ["unbox", "hidden_card", "real_machine"],
  fomo:      ["machine_luck", "viral", "battle"],
  compare:   ["battle", "luxury", "viral"],
  behind:    ["real_machine", "machine_luck", "unbox"],
}

function pickConcept(cfg, { format, franchise, id }) {
  const all = (cfg?.concepts || []).filter(c => c.available)
  if (!all.length) return null
  const byKey = Object.fromEntries(all.map(c => [c.key, c]))

  let keys = FORMAT_CONCEPTS[format] || all.map(c => c.key)
  // treasure ผูกกับ One Piece ทั้งก้อน — ค่ายอื่นห้ามใช้ ไม่งั้นได้สมอกับคลื่นผิดเรื่อง
  keys = keys.filter(k => byKey[k] && (k !== "treasure" || franchise === "OP"))
  if (franchise === "OP" && format === "story") keys = ["treasure", ...keys]
  if (!keys.length) keys = all.map(c => c.key).filter(k => k !== "treasure")
  if (!keys.length) return null

  // ใช้ id เป็นตัวหมุน — คอนเทนต์ชิ้นเดิมได้คอนเซปต์เดิมทุกครั้งที่กดสร้างใหม่
  // (ถ้าสุ่ม จะเทียบผลไม่ได้ว่าที่เปลี่ยนไปเพราะ prompt หรือเพราะคอนเซปต์)
  return byKey[keys[Math.abs(Number(id) || 0) % keys.length]]
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
    // ⚠️ ทุกคอนเซปต์มี layout กำหนดไว้ในไฟล์ตั้งแต่แรก แต่ไม่เคยมีใครอ่านเลย
    //    โปสเตอร์จึงถูกจัดวางแบบเดียวกันหมด ต่อให้เปลี่ยนคอนเซปต์
    //    ส่งเสมอแม้คอนเซปต์ไม่เข้ากับค่าย เพราะโครงจัดวางไม่ผูกกับธีมค่าย
    //    diagonal_clash = แบ่งทแยงสองฝั่งปะทะกัน (กิมมิคแบบ VS)
    const layoutLine = concept.layoutText
      ? `\nLAYOUT — arrange the poster this way: ${concept.layoutText}`
      : ""
    p.push((conceptFits
      ? `POSTER CONCEPT: ${concept.label} — ${concept.mood}.\n` +
        ((concept.decor || []).length ? `Visual elements to include: ${concept.decor.join(", ")}.\n` : "") +
        palette
      : palette) + layoutLine)
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
async function askOpenAI(style, prompt, refs, deadline = Infinity) {
  const key = process.env.OPENAI_API_KEY
  const models = [
    process.env.OPENAI_IMAGE_MODEL || style.openai_model,
    ...(style.openai_model_fallbacks || []),
  ].filter(Boolean)

  const size = style.openai_size || "1024x1024"
  const quality = style.openai_quality || "high"
  let lastErr = ""
  const attempts = []            // ไล่ให้เห็นว่าลองโมเดลไหนไปบ้างและพังเพราะอะไร
  let blockedTimes = 0           // โดนตัวกรองเนื้อหากี่ครั้ง — ใช้แยกข้อความตอนแพ้

  // ตัวกรองเนื้อหาของ OpenAI บล็อกแบบ "สุ่ม" ไม่ใช่ตามเนื้อหา
  //
  // พิสูจน์แล้ว 27 ส.ค. 2026: prompt เดียวกัน รูปอ้างอิงเดียวกัน ยิงครั้งแรกโดน
  // moderation_blocked (stage=output, category=other) ยิงซ้ำทันทีผ่านเลย
  // เจ้าของก็เจอกับคอนเทนต์ #40 ซึ่งเป็นแคปชั่นแกะซองโปเกมอนธรรมดา ไม่มีอะไรผิด
  //
  // ⚠️ ห้ามข้ามไปโมเดลสำรองเมื่อโดนบล็อก — ต้องยิงโมเดลเดิมซ้ำ
  //    เพราะปัญหาไม่ได้อยู่ที่โมเดล และตัวสำรองยึดรูปซองแย่กว่า (ทดสอบแล้ว)
  const MODERATION_RETRY = 2

  const plan = []
  models.forEach((m, i) => {
    // เฉพาะโมเดลหลักที่ยอมยิงซ้ำ — ตัวสำรองมีไว้เผื่อโมเดลหลักถูกปลด ไม่ใช่เผื่อโดนบล็อก
    const times = i === 0 ? MODERATION_RETRY + 1 : 1
    for (let k = 0; k < times; k++) plan.push({ model: m, retry: k })
  })
  const dead = new Set()         // โมเดลที่รู้แล้วว่าใช้ไม่ได้ ไม่ต้องยิงซ้ำให้เสียเวลา

  for (const { model, retry } of plan) {
    if (dead.has(model)) continue
    // ⚠️ เช็กก่อนยิง ไม่ใช่หลังยิง — เดิมไม่มีด่านนี้ พอโมเดลแรกช้า มันจะไล่ยิง
    //    ตัวสำรองต่อจนแพลตฟอร์มฆ่าทั้ง request แล้วผู้ใช้ได้ 504 เปล่า ๆ
    //    ไม่มีแม้แต่ attempts ที่อุตส่าห์เก็บไว้ เพราะ response ไม่เคยถูกส่ง
    const left = deadline - Date.now()
    if (left < MIN_GEN_MS) {
      attempts.push(`${model}: ไม่ได้ยิง — เหลือเวลา ${Math.round(left / 1000)} วิ ` +
                    `ไม่พอสร้างภาพ (ต้องการ ${MIN_GEN_MS / 1000} วิ)`)
      break
    }
    if (retry > 0) attempts.push(`${model}: ลองใหม่ครั้งที่ ${retry} หลังโดนตัวกรองบล็อก`)
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
          signal: AbortSignal.timeout(Math.max(20_000, deadline - Date.now())),
        })
      } else {
        res = await fetch(`${OPENAI_BASE}/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
          signal: AbortSignal.timeout(Math.max(20_000, deadline - Date.now())),
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
        // โดนตัวกรองเนื้อหา → ยิงโมเดลเดิมซ้ำ ไม่ใช่ข้ามไปตัวสำรอง
        // (คิว plan ใส่โมเดลหลักไว้ซ้ำแล้ว continue จึงวนกลับมาที่ตัวเดิม)
        if (json?.error?.code === "moderation_blocked" || /safety system/i.test(msg)) {
          blockedTimes++
          attempts[attempts.length - 1] = `${model}: ตัวกรองเนื้อหาบล็อก (ครั้งที่ ${blockedTimes})`
          continue
        }
        if (/model|not found|does not exist|unsupported/i.test(msg) && res.status === 400) {
          dead.add(model); continue
        }
        if (res.status === 404) { dead.add(model); continue }
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
  if (blockedTimes) {
    throw Object.assign(
      new Error(`ตัวกรองเนื้อหาของ OpenAI บล็อกติดกัน ${blockedTimes} ครั้ง`),
      { attempts, moderation: true })
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

// ── เพดานเวลา ────────────────────────────────────────────────────────────
//
// วัดจริง 27 ส.ค. 2026: gpt-image-2 quality=high 1024 ใช้ 145-153 วินาทีต่อใบ
// (ยิงจริง 4 ใบ ทั้งแบบมีรูปอ้างอิงและไม่มี ได้เลขใกล้กันทุกครั้ง)
// บวกขั้นคิดไอเดียภาพ + ดึงข้อมูล + อัปโหลด แล้วราว 200 วินาที
//
// ⚠️ ต้องประกาศ maxDuration เอง — ไม่มีที่ไหนในโปรเจกต์ตั้งไว้เลย ทุก route
//    ใช้ค่า default ของแพลตฟอร์ม ซึ่งต่ำกว่านี้มากถ้าไม่ได้เปิด Fluid Compute
//    ตอนที่ปุ่ม AI เป็นของเสริมที่แทบไม่มีใครกด เรื่องนี้ไม่เคยทำร้ายใคร
export const runtime = "nodejs"
export const maxDuration = 300

// งบเวลารวมทั้ง request — เหลือ 60 วิให้อัปโหลดกับเขียน DB ก่อนโดนฆ่า
//
// ⚠️ เดิมตั้ง timeout 300 วิ "ต่อโมเดล" แล้ววนโมเดลสำรองอีก 3 ตัว
//    = กรณีแย่สุด 20 นาที ซึ่งไม่มีทางได้คืน response เลย ผู้ใช้เห็นแค่ 504 เปล่า ๆ
//    ทั้งที่โค้ดอุตส่าห์เก็บ attempts ไว้บอกว่าพังเพราะอะไร
const TIME_BUDGET_MS = 270_000

// เวลาขั้นต่ำที่ต้องเหลือถึงจะกล้าเริ่มยิงภาพใหม่อีกครั้ง
//
// ⚠️ ห้ามตั้งต่ำกว่าเวลาสร้างจริง — เริ่มยิงทั้งที่เวลาไม่พอ = โดนตัดกลางคัน
//    หลังโมเดลวาดเสร็จแล้ว คือจ่ายเงินแล้วไม่ได้ของ
//    วัดจริงได้ 145-153 วินาที เผื่อไว้เป็น 170
const MIN_GEN_MS = 170_000

export async function POST(req) {
  const deadline = Date.now() + TIME_BUDGET_MS
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

    // ── กันจ่ายซ้ำ ──
    //
    // ⚠️ ตอนปุ่มนี้เป็นของเสริมสีเทาที่แทบไม่มีใครกด การกดซ้ำไม่เสียหายอะไร
    //    พอเป็นปุ่มหลัก ทุกคลิก = เงินจริง 1 ใบ + รอ 2-3 นาที
    //    ตัวกันที่มีอยู่คือ disabled ฝั่งหน้าเว็บอย่างเดียว ซึ่งหายทันทีที่รีเฟรช
    //    เปิดแท็บที่สอง หรือกดจากคนละเครื่อง
    if (content.media_url && !body.force) {
      return NextResponse.json({
        code: "already_has_image",
        error: "ใบนี้มีรูปอยู่แล้ว",
        hint: "กดยืนยันอีกครั้งถ้าต้องการสร้างใหม่ — จะเสียค่าสร้างภาพเพิ่มอีกหนึ่งใบ",
        media_url: content.media_url,
      }, { status: 409 })
    }

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
    const head = splitHeadline(content.caption)
    const facts = [
      `- Brand name: DivisionX Card (logo wordmark "DC")`,
      `- Number of branches (real, from database): ${branches}`,
      // ⚠️ ห้ามเขียนว่า open 24 hours ตรงนี้อีก — ตู้อยู่ในห้าง เปิด-ปิดตามเวลาห้าง
      //    เคยหลุดออกโปสเตอร์มาแล้ว 2 รอบ (ดู wiki/worklog/2026-08-21-24hour-claim-regression.md)
      `- Business: self-service trading-card vending machines inside Thai shopping malls, ` +
        `open every day during mall hours`,
      sku ? `- Product shown: ${sku.name} (${sku.sku_id}) — an authentic sealed booster pack` : null,
      // ⚠️ ห้ามส่งบรรทัดแรกของแคปชั่นทั้งดุ้น — วัดจากคิวจริง 34 ชิ้นได้เฉลี่ย 71
      //    ตัวอักษร ยาวสุด 108 ยัดลงกรอบเดียวแล้วตัวหนังสือเล็กจนอ่านไม่ออก
      //    และยิ่งข้อความยาว โมเดลยิ่งสะกดไทยเพี้ยน ซึ่งเป็นข้อได้เปรียบเดียว
      //    ที่ทำให้เลิกใช้เทมเพลตได้ ไม่ควรเอาไปทิ้ง
      //    ตัดแล้วเหลือเฉลี่ย 27 (ดู lib/headline.js · scripts/test_headline.mjs)
      head.headline
        ? `- Headline (Thai, copy exactly, largest text on the poster): "${head.headline}"` : null,
      head.sub
        ? `- Supporting line (Thai, copy exactly, about half the headline size): "${head.sub}"` : null,
      // ป้ายความน่าเชื่อถือ — ใส่ทีหลังเพราะต้องรู้ค่ายก่อน (ดู pickBadges)
    ].filter(Boolean)

    // เดาค่ายครั้งเดียว ใช้ทั้งประกาศในบรีฟ · เลือกรูปอ้างอิง · และตัวคิดไอเดียภาพ
    //
    // ⚠️ ต้องประกาศตรงนี้ ก่อนบล็อก facts ด้านล่างที่ใช้มัน
    //    เคยวางไว้ใต้บล็อกนั้นแล้วเว็บพังด้วย "Cannot access before initialization"
    //    (temporal dead zone — const ถูกใช้ก่อนบรรทัดที่ประกาศ)
    //    node --check จับไม่ได้เพราะเป็น error ตอนรัน ไม่ใช่ syntax
    const wantFr = sku?.franchise
      || detectFranchise(caption, content.idea?.title, content.source_reason)

    // ── ป้ายความน่าเชื่อถือ 3 ช่อง ──
    //
    // ⚠️ 25 ส.ค. 2026 — เดิมเป็นข้อความตายตัว "ของแท้ 100% · ไม่มีวันหยุด · N สาขา"
    //    ทุกใบได้สามคำนี้เหมือนกันหมด ไม่ว่าเนื้อหาจะเป็นเรื่องอะไร (เจ้าของทัก)
    //
    // ช่อง 1 ตรึงไว้ที่ "ของแท้ 100%" — จริงเสมอ ขายซองปิดผนึกอย่างเดียว
    // ช่อง 2 เปลี่ยนตามรูปแบบโพสต์ (แก้คำได้ที่ image_style.json ไม่ต้องแตะโค้ด)
    // ช่อง 3 จำนวนสาขา หรือจำนวนตู้ที่มีค่ายนั้นอยู่จริง (นับจาก machine_stock)
    //
    // ⚠️ ทุกคำต้องพิสูจน์ได้ — ป้ายคือคำสัญญา ไม่ใช่คำโปรย
    //    "ไม่มีวันหยุด" ตรวจแล้วจริง (มียอดขายครบ 34/34 วันล่าสุด)
    const badgeCfg = style.trust_badges || {}
    const pool = badgeCfg.by_format?.[content.content_format] || badgeCfg.fallback || []
    const mid = pool.length
      ? pool[Math.abs(Number(content.id) || 0) % pool.length]
      : "ไม่มีวันหยุด"

    // ⚠️ ห้ามใช้ "N สาขา" เป็นค่าตั้งต้น — art_direction.json ข้อ 21 เขียนไว้เองว่า
    //    "Never place a branch count in the artwork" (เอาออกจากเทมเพลตไปแล้ว 26 ส.ค.)
    //    ช่องที่สามจึงตกมาใช้ป้ายข้อความแทน แล้วค่อยแทนที่ด้วยจำนวนตู้ของค่ายนั้น
    //    ซึ่งเป็น "ของที่กดได้จริงตอนนี้" ไม่ใช่การอวดขนาดกิจการ
    let third = pool.length
      ? pool[(Math.abs(Number(content.id) || 0) + 1) % pool.length]
      : "อยู่ในห้างใกล้บ้าน"
    if (wantFr) {
      // นับตู้ที่มีค่ายนี้อยู่จริงตอนนี้
      //
      // ⚠️ ต้องกรองเฉพาะตู้ที่ status = active
      //    machine_stock ยังเก็บแถวของตู้ที่ปิดไปแล้วไว้ (ลบไม่ได้ ยอดขายเก่าอ้าง FK)
      //    ไม่กรอง = นับ wwv02 ที่ปิดแล้วเข้าไปด้วย → โปสเตอร์ขึ้น "มีใน 13 ตู้"
      //    ทั้งที่ตู้ที่เปิดจริงมี 12 (เกิดจริงกับโปสเตอร์ #38 และ #40)
      try {
        const live = new Set((machines || []).map(m => m.machine_id))

        // ⚠️ นับ "สินค้าตัวที่โพสต์พูดถึง" ก่อนเสมอ ไม่ใช่ทั้งค่าย
        //    เจอจริง 27 ส.ค. 2026: โพสต์เรื่องเมก้าแชนเดลาex (อยู่ในซอง PKM Ghost)
        //    ขึ้นป้าย "มีใน 12 ตู้" เพราะนับทุก SKU ของค่าย Pokémon รวมกัน
        //    แต่ PKM Ghost ตัวเดียวอยู่แค่ 7 ตู้ — ลูกค้าไปตู้ที่มีแต่ PKM Ninja ก็ไม่เจอ
        //    ตกไปนับทั้งค่ายเฉพาะตอนโพสต์ไม่ได้เจาะจงสินค้าตัวไหน
        let ids = sku?.sku_id ? [sku.sku_id] : []
        if (!ids.length) {
          const { data: frSkus } = await db.from("skus")
            .select("sku_id").eq("is_active", true).eq("franchise", wantFr)
          ids = (frSkus || []).map(s => s.sku_id)
        }
        if (ids.length) {
          // ⚠️ ต้องแบ่งหน้า — PostgREST คืนแค่ 1000 แถวเงียบ ๆ (ดู skill dvx-db)
          //    ตอนนี้ยังไม่ถึง แต่จำนวนตู้ x SKU โตขึ้นทุกเดือน
          const rows = []
          for (let from = 0; ; from += 1000) {
            const { data, error } = await db.from("machine_stock")
              .select("machine_id,sku_id,remain").in("sku_id", ids).range(from, from + 999)
            if (error) throw error
            rows.push(...(data || []))
            if (!data || data.length < 1000) break
          }
          // ⚠️ ต้องมีของเหลือจริง — ป้ายบอกว่า "มีใน N ตู้" คือคำสัญญาว่ากดได้
          //    ช่องที่เคยมีแต่หมดแล้ว นับเข้าไปคือพาลูกค้าไปเก้อ
          const n = new Set(rows
            .filter(r => live.has(r.machine_id) && (r.remain || 0) > 0)
            .map(r => r.machine_id)).size
          if (n) third = `มีใน ${n} ตู้`
        }
      } catch { /* นับไม่ได้ก็ใช้ป้ายข้อความตามเดิม */ }
    }
    facts.push(`- Trust badges to show (exactly these three, in this order): ` +
      `${badgeCfg.anchor || "ของแท้ 100%"} · ${mid} · ${third}`)

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
    const refs = []
    const packRef = await fetchRef(sku?.image_url || sku?.image_url_box)
    if (packRef) {
      refs.push(packRef)
    } else {
      // ⚠️ 24 ส.ค. 2026 — เดิมหยิบ "3 SKU ขายดีที่สุด" โดยไม่ดูค่าย
      //    ผลคือโพสต์โปเกมอน (#PokemonTCG) ได้ซอง One Piece ไปลอกทั้งสามซอง
      //    เพราะ OP เป็น 22 จาก 47 SKU และครองอันดับขายดี
      //    → ต้องกรองตามค่ายที่แคปชั่นพูดถึงก่อนเสมอ
      //
      // ตรรกะการเลือกอยู่ใน lib/skuPicker.js ตัวเดียว ใช้ร่วมกับ route โปสเตอร์เทมเพลต
      // ห้ามก๊อปมาวางซ้ำที่นี่ — ถ้าแก้แล้วแก้ไม่ครบทั้งสองที่ ภาพจะผิดค่ายอีก
      const picked = await topSkusByFranchise(db, { franchise: wantFr, limit: 3 })
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
    // body.concept = ผู้ใช้เลือกเอง · ไม่เลือก = ระบบจับให้เข้ากับรูปแบบโพสต์+ค่าย
    const concept = body.concept
      ? (conceptsCfg?.concepts || []).find(c => c.key === body.concept) || null
      : pickConcept(conceptsCfg, {
          format: content.content_format, franchise: wantFr, id: content.id })
    const conceptKey = concept?.key || ""
    // แนบคำอธิบายโครงจัดวางไปกับคอนเซปต์ (layouts เป็น dict: key → คำอธิบายไทย)
    if (concept?.layout) {
      concept.layoutText = (conceptsCfg?.layouts || {})[concept.layout] || null
    }
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
        ? await askOpenAI(style, prompt, refs, deadline)
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
        // ⚠️ ห้ามคืน 401 — ในระบบนี้ 401 ถูกจองไว้ให้ auth ของ Supabase
        //    หน้าเว็บเห็น 401 แล้วเด้งเป็น "ต้องเข้าสู่ระบบก่อน" ทั้งหน้า
        //    เจ้าของจะไล่ login ใหม่ซ้ำ ๆ ทั้งที่ปัญหาอยู่ที่ key ของ OpenAI
        //    ตอนปุ่มนี้เป็นของเสริมแทบไม่มีใครเจอ พอเป็นทางหลักจะเจอแน่วันที่ key หมดอายุ
        return NextResponse.json({
          code: "provider_auth",
          error: `key ของ ${provider} ใช้ไม่ได้ — ไม่ใช่เรื่องการเข้าสู่ระบบของเว็บ`,
          hint: "ตรวจว่าคัดลอก key มาครบและยังไม่ถูกเพิกถอน แล้วอัปเดตทั้งใน Vercel และ deploy/.env.local",
        }, { status: 502 })
      }
      // หมดเวลาระหว่างรอโมเดล — บอกให้ชัดว่าไม่ใช่ error ของ OpenAI
      if (/abort|timeout|เหลือเวลา/i.test(msg)) {
        return NextResponse.json({
          code: "timeout",
          error: "สร้างภาพไม่ทันในเวลาที่มี",
          hint: "ปกติใช้ราว 2-3 นาที · ถ้าเจอบ่อยแปลว่า OpenAI ช้าผิดปกติ ลองใหม่อีกครั้ง",
          attempts: e.attempts || [],
        }, { status: 504 })
      }
      // ⚠️ อย่าโยนข้อความดิบของ OpenAI ออกไป — เจ้าของเจอ
      //    "Your request was rejected by the safety system" แล้วเข้าใจว่าคอนเทนต์ตัวเองผิด
      //    ทั้งที่เป็นแคปชั่นแกะซองโปเกมอนธรรมดา และการบล็อกเป็นการสุ่มล้วน ๆ
      if (e.moderation || /safety system|moderation/i.test(msg)) {
        return NextResponse.json({
          code: "moderation",
          error: "ตัวกรองเนื้อหาของ OpenAI บล็อกภาพนี้ — ไม่ใช่เพราะแคปชั่นของคุณผิด",
          hint: "ตัวกรองนี้บล็อกแบบสุ่ม prompt เดิมยิงซ้ำมักผ่าน · ระบบลองซ้ำให้แล้วแต่ยังไม่ผ่าน กดใหม่อีกครั้งได้เลย",
          attempts: e.attempts || [],
        }, { status: 502 })
      }
      return NextResponse.json({
        error: `${provider}: ${msg.slice(0, 300)}`,
        attempts: e.attempts || [],
      }, { status: 502 })
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
