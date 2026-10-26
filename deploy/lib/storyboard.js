// ตัวเขียนสตอรี่บอร์ด — ไอเดียจากรีเสิร์ช + ข้อเท็จจริงจากฐานข้อมูล + รูปแบบไวรัล → ร่างห้องตัดต่อ (26 ต.ค. 2026)
//
// เจ้าของ: "ใช้ประโยชน์จากข้อมูลรีเสิร์ชที่มีเยอะ ให้ระบบเรียบเรียงเนื้อหาและออกแบบสตอรี่บอร์ด ให้หลากหลายขึ้นตามคอนเทนต์ที่เป็นไวรัล"
// เลือกเอง: ผลลัพธ์เป็น "งานในห้องตัดต่อ" (เปิดดู/แก้ใน /video/editor ได้ก่อนกดทำ)
//
// ไฟล์นี้เป็นฟังก์ชันล้วน (ทดสอบได้ไม่ต้องมี DB/AI) — route /api/video/storyboard เป็นคนดึงข้อมูลและเรียก Gemini
//   choosePattern  เลือกรูปแบบจาก tasks/video_patterns.json ที่เข้ากับไอเดีย เลี่ยงที่เพิ่งใช้
//   buildAssets    รายการภาพที่ใช้ได้จริง (ซองจริง · รูปตู้สาขา · ภาพฉาก · คลิปบรรยากาศ) — AI เลือกได้จากรายการนี้เท่านั้น
//   buildPrompt    คำสั่งให้ AI เขียนสตอรี่บอร์ดเป็น JSON
//   compile        สตอรี่บอร์ด → ไทม์ไลน์ห้องตัดต่อ (สัญญา agents/video/TIMELINE.md) · ทุกชิ้นผูกกับบรรทัดเสียงพากย์ (line)
//                  → runner ตั้งเวลาตามจังหวะพูดจริง (hf_timeline.anchor) ไม่ต้องเดาความยาวเสียง

// รูปตู้จริงรายสาขาในเทมเพลต (hyperframes/templates/dvx-promo/assets/branches/*.jpg · อยู่นอก deploy/ จึงอ่านจาก Vercel ไม่ได้)
// ⚠ เพิ่มรูปสาขาใหม่ในเทมเพลตแล้วต้องเติม id ที่นี่ด้วย
export const BRANCH_PHOTOS = ["chukes01", "chukes02", "chukes03", "chukes04", "pf01",
  "wwv01", "wwv03", "wwv04", "wwv05", "wwv06", "wwv07"]

export const MAX_VO = 85            // segments.split_script ซอยบรรทัดเกิน 90 → เลขบรรทัดเลื่อน · เผื่อไว้ 5
export const CHARS_PER_SEC = 9.5    // เวลาประมาณในหน้าห้องตัดต่อ (ของจริงตั้งตอนเรนเดอร์)
export const END_CARD = "เช็กหน้าเว็บก่อนไป\nตามลิงก์ด้านล่างได้เลย"   // ข้อความเดียวกับฉากปิดในห้องตัดต่อ (Library.jsx)

// ── ล้างบรรทัดเสียงพากย์ — ต้องตรงกับ agents/video/segments.sanitize ทุกกติกา ──
// ถ้าตัดไม่เหมือนกัน บรรทัดว่างฝั่ง python ถูกข้าม แล้วเลขบรรทัดที่ผูกไว้เลื่อนทั้งคลิป
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]+/gu
export function sanitizeLine(line) {
  return String(line || "").normalize("NFC")
    .replace(/https?:\/\/\S+|www\.\S+/g, "")
    .replace(/[[(（].*?[\])）]/g, "")
    .replace(/#\S+/g, "")
    .replace(EMOJI, "")
    .replace(/[ \t\u{a0}]+/gu, " ")
    .replace(/^[ \-–—·•\t]+|[ \-–—·•\t]+$/g, "")
}

// บรรทัดยาวเกิน MAX_VO → ซอยที่ช่องว่าง (เป็นหลายบรรทัดของฉากเดียว) · ไม่มีช่องว่าง = ตัดที่เพดาน
export function splitVo(text) {
  const t = sanitizeLine(text)
  if (!t) return []
  if (t.length <= MAX_VO) return [t]
  const out = []
  let cur = ""
  for (const w of t.split(" ")) {
    if (cur && (cur + " " + w).length > MAX_VO) { out.push(cur); cur = w } else cur = cur ? `${cur} ${w}` : w
    while (cur.length > MAX_VO) { out.push(cur.slice(0, MAX_VO)); cur = cur.slice(MAX_VO) }
  }
  if (cur) out.push(cur)
  return out
}

const estSec = (line) => Math.max(1.4, line.replace(/\s/g, "").length / CHARS_PER_SEC + 0.35)

// ── ที่มาของไอเดีย: ล้างร่องรอยที่มาก่อนส่งให้ตัวเขียน (กติกาเดียวกับ generate/route.js scrubSource · แก้คู่กัน) ──
// เจ้าของ 24 ต.ค. 2026: "เอาเนื้อหามาปรับเป็นฉบับของเราเอง โดยไม่ต้องบอกว่าไอเดียมาจากไหน"
export function scrubSource(text, sourceLabel) {
  const ch = String(sourceLabel || "").replace(/^(YouTube|Facebook|TikTok|Instagram)\s*·\s*/i, "").trim()
  let t = String(text || "").split("\n").filter(l => !/^\s*เครดิต\s*[:：]/.test(l)).join("\n")
  if (ch.length >= 2) {
    const e = ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    t = t.replace(new RegExp(`(ดู)?(คลิป)?(จาก|ของ)?\\s*(ช่อง|คลิปของ|คลิปจาก|สไตล์)?\\s*${e}\\s*(แล้ว)?`, "g"), "")
  }
  t = t.replace(/\s*\(?อ้างอิงจาก[^\n)]*\)?/g, "")
  return t.replace(/เรื่องจริงของคลิป/g, "เรื่อง").replace(/(ถอดคำบรรยายคลิป[^·)]*·\s*)/g, "").replace(/[ \t]{2,}/g, " ").trim()
}

// ชื่อร้าน/ช่อง/เพจอื่น — ลบออกจากข้อมูลก่อนส่ง AI และตัดฉากที่ยังมีชื่อพวกนี้ทิ้ง
// (ทดสอบ 26 ต.ค.: หัวข้อไอเดีย "…ด้วยเด็คที่กายหงิดแนะนำ" → บทพูด "เล่นตามกายหงิด" — ชื่ออยู่ในหัวข้อ ตัวล้างที่มาไม่ได้แตะ)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
export function nameRegex(names) {
  const list = [...new Set((names || []).map(n => String(n || "").trim()).filter(n => n.length >= 3))]
    .sort((a, b) => b.length - a.length)
  return list.length ? new RegExp(list.map(esc).join("|"), "gi") : null
}
export const scrubNames = (text, re) => (re ? String(text || "").replace(re, "").replace(/[ \t]{2,}/g, " ").trim() : String(text || ""))

export const offCards = (idea) => {
  const s = String(idea?.summary || "")
  return s.startsWith("📌") && s.includes("ไม่ได้พูดเรื่องการ์ดโดยตรง")
}

// ── "AI คิดเองอิสระ" (26 ต.ค. 2026 · เจ้าของ: "อยากให้หลากหลายและอิสระในการทำมากกว่านี้") ──
// ไม่มีลำดับฉากบังคับ — AI ออกแบบโครงเอง โดยดูรูปแบบในคลังเป็นแรงบันดาลใจ (memory: AI ออกแบบต้องมีอิสระ
// บังคับแค่ความจริง/กฎหมาย/ภาษาไทย · สไตล์เป็นข้อเสนอ)
export const FREE = {
  id: "free", name: "AI คิดเองอิสระ", free: true, length: [15, 35],
  why: "ให้ AI ออกแบบโครงคลิปเองทั้งหมดจากเนื้อเรื่อง โดยดูรูปแบบที่ได้ผลในคลังเป็นแรงบันดาลใจ",
  evidence: [], beats: [], guard: ["trust_facts_only"],
}

// ── เลือกรูปแบบ ──
// คะแนน: ตรงประเภทย่อยของไอเดีย +3 · ตรงช่องทาง +1 · เพิ่งใช้ใน 3 ร่างล่าสุด −5 · ไม่ผ่านเงื่อนไข = ตัดทิ้ง
// คะแนนเท่ากัน = สุ่มแบบกำหนดได้ (seed) — กดเขียนใหม่ได้แบบอื่น เพราะ seed เปลี่ยน
export function choosePattern(patterns, { idea, hasSku, recent = [], forced = null, seed = 0 }) {
  const all = (patterns || []).filter(p => p?.id && Array.isArray(p.beats))
  if (forced === "free") return FREE
  if (forced) {
    const f = all.find(p => p.id === forced)
    if (f) return f
  }
  const off = offCards(idea)
  // strict = รูปแบบที่ต้องมีข้อมูลเฉพาะ (เช่น 3 อันดับต้องมีของครบ 3 อย่าง) ใช้ได้เมื่อประเภทย่อยของไอเดียตรงเท่านั้น
  //   ทดสอบ 26 ต.ค.: ไอเดีย "OP-17 มาแรง" ได้ 3 อันดับ แล้ว AI จัดอันดับ OP-16 / PRB-01 ขึ้นเองทั้งที่ไม่มีข้อมูล
  const ok = all.filter(p => (!p.fits?.needs_sku || hasSku) && (!off || p.fits?.off_cards_ok || p.id === "explain-30s")
    && (!p.fits?.strict || (p.fits?.subtypes || []).includes(idea?.subtype)))
  if (!ok.length) return all[0] || null
  const recent3 = recent.slice(0, 3)
  const scored = ok.map(p => {
    let s = 0
    if (idea?.subtype && (p.fits?.subtypes || []).includes(idea.subtype)) s += 3
    if (idea?.source && (p.fits?.sources || []).includes(idea.source)) s += 1
    if (recent3.includes(p.id)) s -= 5
    return { p, s }
  })
  const top = Math.max(...scored.map(x => x.s))
  const pool = scored.filter(x => x.s >= top - 1).map(x => x.p)
  // แบบอิสระอยู่ในวงสุ่มเสมอ (ยกเว้นเพิ่งใช้) — ไม่งั้นได้แต่รูปแบบในคลังวนไปมา
  if (!recent3.includes("free")) pool.push(FREE)
  return pool[Math.abs(Math.trunc(seed)) % pool.length]
}

// ── ภาพที่ใช้ได้ ──
// { key: { kind, src, fit, label, seconds? } } — key คือสิ่งที่ AI ต้องเลือก ห้ามคิดแหล่งภาพเอง
export function buildAssets({ sku = null, siblings = [], branches = [], backgrounds = [], broll = [], haveAt = [] }) {
  const has = new Set(haveAt.map(b => b.id))
  const a = {}
  for (const s of [sku, ...siblings].filter(Boolean)) {
    if (!s.sku_id || !s.image_url || a[`pack:${s.sku_id}`]) continue
    a[`pack:${s.sku_id}`] = { kind: "image", src: `sku:${s.sku_id}`, fit: "contain", label: `รูปซองจริง ${s.name || s.sku_id}` }
  }
  for (const b of branches) {
    if (!BRANCH_PHOTOS.includes(b.id)) continue
    a[`branch:${b.id}`] = { kind: "image", src: `assets/branches/${b.id}.jpg`, fit: "cover",
      label: `รูปตู้จริง สาขา${b.name}${has.has(b.id) ? " (มีชุดที่เกี่ยวข้องตามรอบซิงค์)" : ""}` }
  }
  a.machine = { kind: "image", src: "assets/machine-hero.jpg", fit: "cover", label: "รูปตู้ DivisionX (ไม่ระบุสาขา)" }
  // backgrounds: [url] หรือ [{ url, franchise }] — route คัดให้เหลือเฉพาะค่ายเดียวกับไอเดียแล้ว
  backgrounds.slice(0, 6).forEach((b, i) => {
    const url = typeof b === "string" ? b : b?.url
    if (!url) return
    const fr = typeof b === "object" && b?.franchise ? ` โทน ${b.franchise}` : ""
    a[`bg:${i + 1}`] = { kind: "image", src: url, fit: "cover", label: `ภาพฉากบรรยากาศ${fr} (ไม่มีตัวหนังสือ/สินค้า)` }
  })
  for (const c of broll) {
    if (!c?.url || !c.id) continue
    a[`broll:${c.id}`] = { kind: "video", src: c.url, fit: "cover", seconds: Number(c.seconds) || 8,
      label: `คลิปบรรยากาศ${c.franchise?.length ? ` (${c.franchise.join("/")})` : ""} ${c.seconds || 8} วิ` }
  }
  return a
}

// ── คำสั่งให้ AI ──
export function buildPrompt({ pattern, idea, facts, assets, voice, trustFacts, library = [] }) {
  const off = offCards(idea)
  const guard = pattern.guard || []
  const system = [
    `คุณเป็นผู้กำกับคลิปสั้นแนวตั้ง 9:16 ของ ${voice?.brand || "DivisionX Card"} — ตู้กดการ์ดสะสมในห้าง`,
    `โทนเสียง: ${voice?.tone || "เพื่อนสายการ์ดคุยกัน สนุก เป็นกันเอง"}`,
    "งาน: เขียนสตอรี่บอร์ดเป็น JSON ล้วน ตามรูปแบบที่กำหนด ใช้ข้อมูลที่ให้เท่านั้น",
  ].join("\n")
  const assetLines = Object.entries(assets).map(([k, v]) => `- ${k} : ${v.label}`).join("\n")
  const beatLines = pattern.free
    ? "ออกแบบโครงเองทั้งหมด 3–8 ฉาก — เลือกจังหวะที่เข้ากับเรื่องที่สุด · รูปแบบที่ได้ผลจริงในข้อมูลของเรา (แรงบันดาลใจ ไม่บังคับ ผสมกันได้):\n" +
      library.slice(0, 12).map(p => `- ${p.name}: ${p.why}`).join("\n")
    : pattern.beats.map((b, i) =>
      `${i + 1}. [${b.role}] พูด: ${b.say}${b.screen ? ` · บนจอ: ${b.screen}` : ""} · ภาพ: ${b.visual}`).join("\n") +
      "\n(เป็นแนวทาง — สลับลำดับ รวม เพิ่ม หรือตัดฉากได้ถ้าทำให้คลิปดีขึ้น)"
  const rules = [
    "ภาษาไทยเท่านั้น (ชื่อชุด/การ์ดภาษาอังกฤษได้) · เขียนเป็นคอนเทนต์ของเราเอง ห้ามพูดถึงคลิป ช่อง ผู้สร้าง หรือที่มาของไอเดีย",
    `vo = คำพูดของเสียงพากย์ 1 บรรทัดต่อฉาก ยาวไม่เกิน ${MAX_VO - 10} ตัวอักษร · ห้ามอีโมจิ แฮชแท็ก วงเล็บ ลิงก์`,
    "screen = ข้อความบนจอสั้น ๆ ไม่เกิน 28 ตัวอักษร (คำเด่นของฉาก ไม่ต้องซ้ำทั้งประโยค เพราะมีซับอยู่แล้ว) · ไม่มีก็ใส่ \"\"",
    "visual = ต้องเป็น key จากรายการภาพเท่านั้น (ห้ามคิดเอง) · ฉากติดกันพยายามไม่ใช้ภาพซ้ำ",
    "ข้อเท็จจริง ตัวเลข ราคา ชื่อการ์ด ชื่อสาขา อันดับ ต้องมาจากข้อมูลข้างล่างเท่านั้น — ไม่มีข้อมูลสำหรับฉากไหน ให้ข้ามฉากนั้น · ห้ามจัดอันดับเองถ้าข้อมูลไม่ได้บอกอันดับ",
    "ตัวเลขทุกตัวทั้งใน vo และ screen เขียนเป็นเลขอารบิก (96 งาน · 8 ซอง · 45 นาที · 3 ล้าน) ห้ามสะกดเป็นคำ — เสียงพากย์อ่านเอง",
    "เรื่องที่มาจากร้าน/ช่อง/คนอื่น (เช่น คลิปร้านการ์ดจัดแข่ง · คนรีวิว) ห้ามเล่าเหมือนเป็นของเรา: ห้ามใช้ \"ผม/เรา\" เล่าประสบการณ์ของเขา · ห้ามบอกราคา ค่าสมัคร โปร หรือกิจกรรมของที่อื่นเหมือนเป็นของเรา — เล่าเป็นเรื่องน่าสนใจในวงการ หรือดึงความรู้/กติกาที่ใช้ได้ทั่วไปมาเล่าแทน",
    "ห้ามบอกว่าเป็นชุดใหม่/เพิ่งเข้าตู้/มาแล้ว ถ้าข้อมูลไม่ได้บอก (\"มาแรง\" ≠ \"มาใหม่\")",
    "รูปซอง (pack:…) ใช้เฉพาะฉากที่พูดถึงชุดนั้นจริง — ฉากที่ไม่ได้พูดถึงชุดไหน ใช้ภาพฉาก รูปตู้ หรือรูปสาขา",
    "พูดถึงสาขารวมไว้ฉากเดียว ไม่เกิน 3 สาขา · ชวนมาตู้/บอกของแท้/บอกสาขา รวมแล้วไม่เกิน 2 ฉาก (ไม่รวมฉากปิด)",
    `บทพูดทั้งคลิปรวมไม่เกิน ${Math.round((pattern.length?.[1] || 30) * CHARS_PER_SEC)} ตัวอักษร (≈ ${pattern.length?.[1] || 30} วินาที) — ยาวกว่านี้ระบบตัดฉากท้ายทิ้ง`,
    "screen เขียนภาษาไทย (ชื่อชุด/การ์ดภาษาอังกฤษได้ · ชื่อห้าง/สาขาเขียนไทย)",
    "ห้ามเอ่ยชื่อร้าน เพจ หรือแบรนด์อื่น (ร้านการ์ด/ตู้กดเจ้าอื่น) — ใช้ได้แค่ชื่อค่ายการ์ด ชื่อชุด และชื่องานทางการ",
    "ฉากที่พูดถึงสาขา ใช้รูปตู้ของสาขาที่พูดถึงจริง (รูปที่มีป้าย \"มีชุดที่เกี่ยวข้อง\" เมื่อพูดว่ามีของ)",
    "ห้ามตัวเลขยอดขาย/เปอร์เซ็นต์ · ห้ามบอกว่ามีของแน่นอน · ห้ามสื่อว่าซองในตู้เราพิเศษ/หายากกว่าที่อื่น · ห้ามเขียน \"เช็กหน้าตู้\"",
    "ฉากสุดท้าย role = cta · vo ชวนเช็กของในตู้ที่หน้าเว็บก่อนไป (เช่น \"เช็กของในตู้ที่หน้าเว็บก่อนไปได้เลย\") · screen ปล่อยว่าง (ระบบใส่ฉากปิดให้)",
    guard.includes("trust_facts_only") ? `เรื่องความเชื่อใจ/ของแท้ พูดได้เฉพาะข้อเหล่านี้: ${(trustFacts || []).join(" · ")} — ห้ามพูดว่า "ไม่คัดซอง"` : null,
    off || guard.includes("no_forced_tie") ? "เรื่องนี้ไม่เกี่ยวกับการ์ด — ไม่ต้องโยงเข้าซอง เล่าให้จบในตัว ชวนแวะตู้ได้แค่ประโยคเดียวตอนท้าย · ห้ามเปรียบว่าซองเหมือนเรื่องนี้" : null,
    guard.includes("needs_three_items") ? "ต้องมีของครบ 3 อย่างในข้อมูล ถ้าไม่ครบให้ทำเท่าที่มี แล้วเปลี่ยนคำเปิดให้ตรงจำนวน" : null,
    guard.includes("needs_two_packs") ? "ตัวเลือก A/B ต้องเป็นซองจากรายการภาพ (pack:…) สองชุดที่ต่างกัน" : null,
  ].filter(Boolean).map((r, i) => `${i + 1}. ${r}`).join("\n")

  const user = `รูปแบบคลิป: ${pattern.name}
ทำไมรูปแบบนี้ได้ผล: ${pattern.why}
ความยาวเป้าหมาย: ${pattern.length?.[0] || 18}–${pattern.length?.[1] || 30} วินาที (ราว ${CHARS_PER_SEC} ตัวอักษร/วินาที)
ลำดับฉาก (ไม่เกิน 8 ฉาก · ข้ามฉากที่ไม่มีข้อมูลได้):
${beatLines}

ออกแบบหน้าตาแต่ละฉากได้อิสระ (ใส่หรือไม่ใส่ก็ได้ — ไม่ใส่ระบบเลือกให้):
- style: ตัวหนังสือบนจอ bold (ขาวขอบหนา) · gold (ทอง) · neon (ฟ้าเรืองแสง) · box (กล่องกรมท่าขอบฟ้า)
- pos: top · middle · low (เหนือซับ) — ซับอยู่ล่างจอเสมอ
- size: S · M · L
- anim: pop · slide · fade · float  (ตัวหนังสือโผล่)
- cut: cut · flash · zoom  (ท่าเปลี่ยนเข้าฉากนี้)
- motion: zoomin · zoomout · none  (ภาพนิ่งเคลื่อนช้า ๆ)
- sticker: key ของรูปซอง (pack:…) ให้วางลอยทับบนภาพฉาก (bg:…) — ทำให้ภาพมีชั้น · ใช้เมื่อ visual ไม่ใช่รูปซองเดียวกัน
สลับหน้าตาให้หลากหลาย อย่าให้ทุกฉากเหมือนกัน แต่คุมโทนทั้งคลิปให้เข้ากัน

ข้อมูล (ใช้ได้เท่านี้):
${facts}

รายการภาพที่ใช้ได้ (key : คำอธิบาย):
${assetLines}

กติกา:
${rules}

ตอบเป็น JSON ล้วน รูปแบบนี้เท่านั้น:
{"title": "ชื่อร่างสั้น ๆ", "beats": [{"role": "hook", "vo": "…", "screen": "…", "visual": "<key>", "style": "gold", "pos": "top", "size": "L", "anim": "pop", "cut": "flash", "motion": "zoomin", "sticker": ""}]}`
  return { system, user }
}

// ── อ่านคำตอบ AI ──
export function parseStoryboard(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0])
    if (!Array.isArray(j?.beats) || !j.beats.length) return null
    return j
  } catch { return null }
}

// ตรวจคำต้องห้ามในบท/ข้อความบนจอ — เจอ = ตัดฉากนั้น (ไม่ส่งผ่านไปถึงคลิป)
// "ของแท้ 100%" = ข้อเท็จจริงของร้าน (ป้ายความน่าเชื่อถือใช้อยู่แล้ว) ไม่ใช่ตัวเลขยอดขาย — ยกเว้นไว้
const BANNED = [/เช็[กค]หน้าตู้/, /086[\s-]?386[\s-]?3219/, /(?<!แท้\s*)(?<![\d.,])\d[\d,.]*\s*(%|เปอร์เซ็นต์)/, /(ยอดขาย|ขายได้|ขายไป)\s*\d/, /ไม่คัดซอง/]
export function bannedIn(s) {
  return BANNED.find(re => re.test(String(s || "")))?.source || null
}

// ── สตอรี่บอร์ด → ไทม์ไลน์ห้องตัดต่อ ──
const TRANS = ["flash", "zoom", "cut"]
const ANIMS = ["slide", "pop", "float"]
export function compile(sb, assets, { voice = "Puck", pattern = null, external = false, forbid = null } = {}) {
  const keys = Object.keys(assets)
  // AI เลือกภาพนอกรายการ → ฉากปิดใช้รูปตู้ (สาขาแรกที่มีรูป) · ฉากอื่นใช้รูปซองหลัก
  const fbFor = (role) => role === "cta"
    ? (keys.find(k => k.startsWith("branch:")) || "machine")
    : (keys.find(k => k.startsWith("pack:")) || "machine")
  const beats = []
  const dropped = []
  for (const raw of (sb?.beats || []).slice(0, 8)) {
    const vo = splitVo(raw?.vo)
    if (!vo.length) { dropped.push({ role: raw?.role, why: "ไม่มีบทพูด" }); continue }
    // เรื่องจากร้าน/ช่องอื่น (YouTube · เพจที่ติดตาม): ราคาเป็นบาทคือราคา/ค่าสมัครของเขา — ไม่ใช่ของเรา (ทดสอบ 26 ต.ค.: "8 ซอง 800 บาท")
    const bad = bannedIn(`${raw?.vo} ${raw?.screen || ""}`) ||
      (external && /\d[\d,.]*\s*บาท/.test(`${raw?.vo} ${raw?.screen || ""}`) ? "ราคาของร้าน/ช่องอื่น" : null) ||
      (forbid && new RegExp(forbid.source, "i").test(`${raw?.vo} ${raw?.screen || ""}`) ? "ชื่อร้าน/ช่องอื่น" : null)
    if (bad) { dropped.push({ role: raw?.role, why: `คำต้องห้าม (${bad})` }); continue }
    const visual = assets[raw?.visual] ? raw.visual : fbFor(raw?.role)
    const one = (v, ok) => (ok.includes(v) ? v : null)
    const sticker = typeof raw?.sticker === "string" && raw.sticker.startsWith("pack:") && assets[raw.sticker] && raw.sticker !== visual
      ? raw.sticker : null
    beats.push({ role: String(raw?.role || "beat").slice(0, 20), vo, screen: String(raw?.screen || "").trim().slice(0, 40), visual,
      style: one(raw?.style, ["bold", "gold", "neon", "box"]), pos: one(raw?.pos, ["top", "middle", "low"]),
      size: one(raw?.size, ["S", "M", "L"]), anim: one(raw?.anim, ["pop", "slide", "fade", "float"]),
      cut: one(raw?.cut, ["cut", "flash", "zoom"]), motion: one(raw?.motion, ["zoomin", "zoomout", "none"]), sticker })
  }
  if (!beats.length) return { error: "สตอรี่บอร์ดไม่มีฉากที่ใช้ได้", dropped }
  // งบความยาว — เกินเพดานของรูปแบบ +5 วิ: ตัดฉากท้ายก่อนฉากปิดทิ้งทีละฉาก (ส่วนใหญ่เป็นฉากชวนมาตู้ซ้ำ ๆ · ทดสอบ 26 ต.ค. ได้ 51 วิ)
  const cap = (pattern?.length?.[1] || 30) + 5
  const secOf = (b) => b.vo.reduce((s, l) => s + estSec(l), 0)
  while (beats.length > 3 && beats.reduce((s, b) => s + secOf(b), 0) > cap) {
    const ctaAt = beats.length - 1
    const cut = beats.splice(ctaAt - 1, 1)[0]
    dropped.push({ role: cut.role, why: `ยาวเกิน ${cap} วิ` })
  }
  // ภาพฉาก/คลิปบรรยากาศซ้ำติดกัน → สลับเป็นอันอื่นที่ยังไม่ได้ใช้ (ความหลากหลายของภาพ)
  // ⚠️ ห้ามสลับรูปซอง/รูปสาขา — พูดถึง OP-17 แต่โชว์ OP-13 = ข้อมูลผิด (เจอตอนทดสอบ)
  for (let i = 1; i < beats.length; i++) {
    if (beats[i].visual === beats[i - 1].visual && /^(bg|broll):/.test(beats[i].visual)) {
      const used = new Set(beats.map(b => b.visual))
      const alt = keys.find(k => !used.has(k) && assets[k].kind === assets[beats[i].visual].kind && k.split(":")[0] === beats[i].visual.split(":")[0])
      if (alt) beats[i].visual = alt
    }
  }

  const lines = []
  const clips = []
  const overlays = []
  const style = (b, i) => {
    if (b.style) return b.style
    const pb = pattern?.beats?.find(x => x.role === b.role)
    return ["bold", "gold", "neon", "box"].includes(pb?.style) ? pb.style : (i === 0 ? "gold" : "bold")
  }
  // ตำแหน่ง/ขนาดตัวหนังสือ — ซับอยู่ y ≈ 0.69–0.78 · มีรูปซองลอย = ตัวหนังสือขึ้นบนเสมอ
  const Y = { top: 0.19, middle: 0.44, low: 0.6 }
  const SIZE = { S: 72, M: 90, L: 110 }
  let t = 0
  beats.forEach((b, i) => {
    const first = lines.length
    lines.push(...b.vo)
    const dur = +b.vo.reduce((s, l) => s + estSec(l), 0).toFixed(2)
    const a = assets[b.visual]
    const base = { id: `c${i + 1}`, src: a.src, fit: a.fit, transition: i === 0 ? "cut" : (b.cut || TRANS[i % TRANS.length]), line: first }
    clips.push(a.kind === "video"
      ? { ...base, kind: "video", in: 0, out: +Math.min(a.seconds || 8, dur).toFixed(2), speed: 1, volume: 0, fx: 0.5, fy: 0.5, zoom: 1 }
      : { ...base, kind: "image", dur, motion: b.motion || (i % 2 ? "zoomout" : "zoomin"), fx: 0.5, fy: 0.5, zoom: 1 })
    if (b.sticker) {
      overlays.push({ id: `s${i + 1}`, type: "image", src: assets[b.sticker].src, start: +t.toFixed(2), end: +(t + dur).toFixed(2),
        x: 0.5, y: 0.47, w: 0.42, anim: "pop", line: first, ...(b.vo.length > 1 ? { span: b.vo.length } : {}) })
    }
    const isCta = b.role === "cta" || i === beats.length - 1 && /หน้าเว็บ/.test(b.vo.join(" "))
    if (isCta) {
      overlays.push({ id: `t${i + 1}`, type: "text", text: END_CARD, start: +t.toFixed(2), end: -1, x: 0.5, y: 0.4,
        size: 76, style: "box", color: "#ffffff", anim: "pop", line: first })
    } else if (b.screen) {
      const long = b.screen.length > 16
      const pos = b.sticker ? "top" : (b.pos || "top")
      let size = b.size ? SIZE[b.size] : i === 0 ? (long ? 92 : 112) : (long ? 76 : 92)
      if (long) size = Math.min(size, 92)
      if (b.sticker) size = Math.min(size, 90)
      overlays.push({ id: `t${i + 1}`, type: "text", text: b.screen, start: +t.toFixed(2), end: +(t + dur).toFixed(2),
        x: 0.5, y: Y[pos] + (i === 0 && pos === "top" ? 0.03 : 0), size,
        style: style(b, i), color: "#ffffff", anim: b.anim || (i === 0 ? "pop" : ANIMS[i % ANIMS.length]), line: first,
        ...(b.vo.length > 1 ? { span: b.vo.length } : {}) })
    }
    t += dur
  })
  overlays.push({ id: "logo", type: "logo", start: 0, end: -1, x: 0.88, y: 0.05, w: 0.14, anim: "none" })

  return {
    timeline: {
      version: 1, clips, overlays,
      voice: { script: lines.join("\n"), voice, style: null, tts_model: null },
      captions: { on: true }, music: null, sfx: true,
    },
    beats, dropped, seconds: +t.toFixed(1),
  }
}

export default { BRANCH_PHOTOS, FREE, nameRegex, scrubNames, sanitizeLine, splitVo, scrubSource, offCards, choosePattern, buildAssets, buildPrompt, parseStoryboard, bannedIn, compile }
