// แปะโลโก้จริงลงบนโปสเตอร์หลัง AI วาดเสร็จ — โลโก้ต้องเป็นไฟล์ต้นฉบับ ไม่ใช่ให้โมเดลวาด
//
// ทำไม (15 ก.ย. 2026): เจ้าของบอก "อยากให้คุมสภาพไว้ไม่เปลี่ยนแปลงคือโลโก้บริษัท"
//   เดิม route บอกโมเดลแค่ชื่อแบรนด์ในบรีฟ (`logo wordmark "DC"`) → โมเดลวาดโลโก้เองทุกใบ
//   ทรง ตัวอักษร ขนาดไม่เหมือนกันสักใบ · แก้ด้วย prompt ไม่มีทางคงที่ เพราะโมเดลวาดซ้ำทุกครั้ง
//   จึงสั่งให้โมเดลเว้นมุมไว้ แล้วแปะไฟล์จริงทับหลังวาด (ตั้งค่าที่ image_style.json → logo_stamp)
//
// ⚠️ path ต้องเป็นสตริงตรง ๆ และต้องอยู่ใน next.config.js → outputFileTracingIncludes ด้วย
//    ไฟล์ใน public/ เว็บเสิร์ฟได้ก็จริง แต่ไม่ถูกแพ็กเข้า function บน Vercel ถ้าไม่บอก — fs อ่านไม่เจอ
import sharp from "sharp"
import { readFile } from "fs/promises"
import path from "path"

let _logos = null
function loadLogos() {
  _logos ??= Promise.all([
    readFile(path.join(process.cwd(), "public", "logo-white.png")),
    readFile(path.join(process.cwd(), "public", "logo-black.png")),
  ]).then(([white, black]) => ({ white, black }))
  // อ่านไม่สำเร็จรอบนี้ อย่าจำความล้มเหลวไว้ตลอดอายุ instance
  _logos.catch(() => { _logos = null })
  return _logos
}

function place(corner, W, H, w, h, m) {
  return {
    left: corner.endsWith("right") ? W - m - w : m,
    top: corner.startsWith("top") ? m : H - m - h,
  }
}

const CORNERS = ["bottom-left", "bottom-right", "top-left", "top-right"]

// มุมสำรองเรียงจากใกล้ไปไกล: ขอบเดียวกันอีกฝั่ง → ฝั่งเดียวกันอีกขอบ → มุมทแยง
function fallbacks(corner) {
  const [edge, side] = corner.split("-")
  const otherEdge = edge === "top" ? "bottom" : "top"
  const otherSide = side === "left" ? "right" : "left"
  return [`${edge}-${otherSide}`, `${otherEdge}-${side}`, `${otherEdge}-${otherSide}`]
}

// ความรกของกรอบ = % พิกเซลที่เป็น "ขอบแรง" (Laplacian สี่ทิศ > 60) ในช่องย่อย 2x2 ที่รกที่สุด
// เทียบป้ายที่ดูด้วยตากับโปสเตอร์จริง 19 ใบ × 4 มุม (21 ต.ค. 2026):
//   มีตัวหนังสือ/ป้าย ≥ 11.7 ทุกมุม · โล่ง/ฉากเบลอ/โบเก้ ≤ 4.8 · ลายพื้น/ประกายเล็ก ๆ 8.9–12.5
// ⚠️ ต้องย่อกรอบให้กว้างเท่ากันก่อนวัด — ไม่งั้นภาพ 2048 ได้ค่าต่ำกว่าภาพ 1024 หลายเท่าทั้งที่หน้าตาเหมือนกัน
// ⚠️ นับขอบแรง ไม่ใช่ค่าเฉลี่ย — พื้นกรมท่าลายหนังได้ค่าเฉลี่ยสูงพอ ๆ กับตัวหนังสือ แต่ไม่มีขอบแรงเลย
// ⚠️ เอาช่องย่อยที่รกที่สุด ไม่ใช่ทั้งกรอบ — ป้ายที่โผล่มาครึ่งกรอบ เฉลี่ยทั้งกรอบแล้วดูเหมือนโล่ง
async function busyness(buf, box) {
  const { data: g, info } = await sharp(buf).extract(box).removeAlpha().greyscale()
    .resize({ width: 128 }).raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height
  const hit = [0, 0, 0, 0], all = [0, 0, 0, 0]
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x
      const v = Math.abs(4 * g[p] - g[p - 1] - g[p + 1] - g[p - W] - g[p + W])
      const cell = (y < H / 2 ? 0 : 2) + (x < W / 2 ? 0 : 1)
      all[cell]++
      if (v > 60) hit[cell]++
    }
  }
  return Math.max(...hit.map((n, i) => 100 * n / all[i]))
}

/**
 * ความรกของแต่ละมุม ในกรอบขนาดเท่าโลโก้ที่จะแปะ (0–100 · ดูเกณฑ์ที่ busyness)
 * @returns {Promise<Record<string, number>>}
 */
export async function cornerScores(buf, cfg = {}, corners = CORNERS) {
  const { width: W, height: H } = await sharp(buf).metadata()
  const w = Math.round(W * (cfg.width_pct ?? 20) / 100)
  const m = Math.round(W * (cfg.margin_pct ?? 3.5) / 100)
  const h = Math.round(w * (cfg.logo_ratio ?? 436 / 512))
  const out = {}
  for (const c of corners) {
    const box = { ...place(c, W, H, w, h, m), width: w, height: h }
    out[c] = Math.round(await busyness(buf, box) * 10) / 10
  }
  return out
}

/**
 * @param {Buffer} buf  ภาพที่โมเดลวาดเสร็จ
 * @param {object} [cfg] image_style.json → logo_stamp
 * @returns {Promise<{buf: Buffer, mime: string, variant: string, corner: string, lum: number,
 *                    scores: Record<string, number>|null}>} scores = ความรกของแต่ละมุม (เปิด auto_corner)
 */
export async function stampLogo(buf, cfg = {}) {
  let corner = cfg.corner || "bottom-left"
  const { width: W, height: H, format } = await sharp(buf).metadata()
  const w = Math.round(W * (cfg.width_pct ?? 20) / 100)
  const m = Math.round(W * (cfg.margin_pct ?? 3.5) / 100)

  const logos = await loadLogos()
  const white = await sharp(logos.white).resize({ width: w }).png().toBuffer({ resolveWithObject: true })
  const h = white.info.height

  // ⚠️ 21 ต.ค. 2026 — บรีฟสั่งโมเดลเว้นมุมนี้ แต่มันยังวางป้ายแรกของแถวล่างทับมุมได้
  //    (ทดลอง #63 + โปสเตอร์จริง #47 #49: โลโก้ทับป้าย "ของแท้ 100%")
  //    → วัดทุกมุมก่อนแปะ · ย้ายเฉพาะตอนมุมที่ตั้งไว้มีของ "และ" มีมุมอื่นที่โล่งจริง
  //    ห้ามย้ายไปมุมที่รกน้อยกว่า — มุมบนส่วนใหญ่คือพาดหัว ทับพาดหัวแย่กว่าทับป้าย
  //    และโลโก้อยู่ที่เดิมทุกใบ = คนจำแบรนด์ได้ (ต้นเหตุจริงแก้ที่บรีฟ: บรรทัด Trust badges ใน route)
  let scores = null
  if (cfg.auto_corner) {
    const order = [corner, ...fallbacks(corner)]
    scores = await cornerScores(buf, { ...cfg, logo_ratio: h / w }, order)
    // มุมโล่งหลายมุม เอามุมที่ใกล้ที่สุด ไม่ใช่คะแนนต่ำสุด — 0 กับ 0.1 ต่างกันแค่สัญญาณรบกวน
    const clean = order.slice(1).find(c => scores[c] < (cfg.clean_below ?? 6))
    if (scores[corner] > (cfg.busy_above ?? 12) && clean) corner = clean
  }
  const { left, top } = place(corner, W, H, w, h, m)

  // เลือกโลโก้ขาว/ดำจากความสว่างของมุมที่จะแปะ — มุมนั้นโมเดลวาดอะไรไว้ก็ได้ (ธีมเปลี่ยนทุกใบ)
  // โลโก้สีเดียวตายตัวจะจมหายไปกับพื้นที่สีใกล้กัน
  // ⚠️ ต้อง toBuffer ก่อนแล้วค่อย stats — stats() ของ sharp วัดจาก "ภาพต้นทาง" ไม่สนขั้น extract
  //    ในสายเดียวกัน (ทดสอบแล้ว: สองมุมคนละสีได้ค่าเท่ากันเป๊ะ = ค่าเฉลี่ยทั้งภาพ)
  const region = await sharp(buf).extract({ left, top, width: w, height: h }).removeAlpha().toBuffer()
  const { channels } = await sharp(region).stats()
  const [r, g, b] = channels.length >= 3 ? channels : [channels[0], channels[0], channels[0]]
  const lum = 0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean
  const variant = lum >= (cfg.light_threshold ?? 140) ? "black" : "white"
  const logo = variant === "white"
    ? white.data
    : await sharp(logos.black).resize({ width: w }).png().toBuffer()

  const fmt = format === "jpeg" ? "jpeg" : format === "webp" ? "webp" : "png"
  const out = await sharp(buf).composite([{ input: logo, left, top }]).toFormat(fmt).toBuffer()
  return { buf: out, mime: `image/${fmt}`, variant, corner, lum: Math.round(lum), scores }
}
