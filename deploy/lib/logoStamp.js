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

/**
 * @param {Buffer} buf  ภาพที่โมเดลวาดเสร็จ
 * @param {object} [cfg] image_style.json → logo_stamp
 * @returns {Promise<{buf: Buffer, mime: string, variant: string, corner: string, lum: number}>}
 */
export async function stampLogo(buf, cfg = {}) {
  const corner = cfg.corner || "bottom-left"
  const { width: W, height: H, format } = await sharp(buf).metadata()
  const w = Math.round(W * (cfg.width_pct ?? 20) / 100)
  const m = Math.round(W * (cfg.margin_pct ?? 3.5) / 100)

  const logos = await loadLogos()
  const white = await sharp(logos.white).resize({ width: w }).png().toBuffer({ resolveWithObject: true })
  const h = white.info.height
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
  return { buf: out, mime: `image/${fmt}`, variant, corner, lum: Math.round(lum) }
}
