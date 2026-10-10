// ราคาตลาดการ์ด One Piece จาก card2price.com — ดึงเฉพาะใบที่โพสต์เขียนถึง
//
// ทำไม (10 ต.ค. 2026): โพสต์อันดับต้นของเพจ 7 จาก 10 พูดถึงราคา/มูลค่าการ์ด แต่ระบบไม่มีข้อมูลราคาเลย
//   AI จึงถูกห้ามพูดถึงราคามาตลอด · เจ้าของเลือกให้ระบบดึงจาก card2price เอง (เว็บไทย ราคาเป็นบาท)
//   เฉพาะใบที่จะเขียนถึง แทนการให้ทีมกรอก
//
// กติกาที่เจ้าของเลือก (ดู wiki/worklog/2026-10-10-content-review-and-preview-tool.md):
//   ราคาอยู่ในแคปชั่นเท่านั้น ห้ามขึ้นโปสเตอร์ · เขียนเป็นราคาตลาด ณ วันที่ + เครดิตแหล่ง
//   · ราคาที่อัปเดตเกิน FRESH_DAYS วันห้ามใช้ · ห้ามโยงว่าซื้อซองแล้วจะได้เงิน
//
// ⚠️ ดึงเฉพาะหน้า /card/<รหัส> — robots.txt ของเว็บห้าม /api (ห้ามเรียกเด็ดขาด)
// ⚠️ ราคาแต่ละช่องมีวันที่อัปเดตของตัวเอง และเก่าได้เป็นเดือน: OP13-118 ใบปกติ ราคาใบดิบอัปเดต 11 ก.ย.
//    ขณะที่ใบเกรดอัปเดต 5 ต.ค. — ห้ามถือว่าทั้งหน้าสดเท่ากัน ต้องเช็กทีละช่อง
// ⚠️ เลขเวอร์ชัน (_p1 _p2 …) เป็นของตลาดญี่ปุ่น ไม่ตรงกับเลขรูปบนเว็บทางการฉบับเอเชียเสมอไป
//    (OP13-118: card2price มี p1–p5 · คลังเรามี 4) — อย่าจับคู่ราคาเวอร์ชันกับรูปเวอร์ชันโดยดูแค่เลข
//
// ข้อมูลที่หน้าเว็บฝังมา (Next.js RSC payload ใน self.__next_f.push):
//   variantSiblings[] = { code, variant, rarity, ghost_rare, marketPriceRaw, marketPriceGrade,
//                         marketPriceRawUpdatedAt, marketPriceGradeUpdatedAt } (วันที่ขึ้นต้นด้วย "$D")
//   priceSeriesPoints[] = { day, priceRaw, priceGrade } ย้อนหลัง 30 วันของเวอร์ชันที่เปิดดู

export const C2P_BASE = "https://card2price.com"
export const FRESH_DAYS = 14

const UA = "Mozilla/5.0 (compatible; DivisionXCard/1.0; +https://division-x-card.vercel.app)"

// ดึง payload ที่ Next.js ฝังไว้ แล้วคลาย escape ของสตริง JS ให้เป็นข้อความ JSON ปกติ
function rscText(html) {
  const parts = []
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g
  let m
  while ((m = re.exec(html))) parts.push(m[1])
  if (!parts.length) return ""
  try { return JSON.parse(`"${parts.join("")}"`) } catch { return "" }
}

// ตัด array ที่ตามหลังคีย์ออกมาแบบนับวงเล็บ — payload ไม่ใช่ JSON ทั้งก้อน parse ตรง ๆ ไม่ได้
function grabArray(text, key) {
  const i = text.indexOf(`"${key}":[`)
  if (i < 0) return null
  const start = text.indexOf("[", i)
  let depth = 0, inStr = false
  for (let k = start; k < text.length; k++) {
    const ch = text[k]
    if (inStr) {
      if (ch === "\\") k++
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === "[") depth++
    else if (ch === "]" && --depth === 0) {
      try { return JSON.parse(text.slice(start, k + 1)) } catch { return null }
    }
  }
  return null
}

const asDate = (v) => {
  if (!v) return null
  const d = new Date(String(v).replace(/^\$D/, ""))
  return Number.isNaN(d.getTime()) ? null : d
}

const isFresh = (d, now) => !!d && (now - d.getTime()) <= FRESH_DAYS * 86400000

const thb = (n) => (Number.isFinite(n) && n > 0 ? Math.round(n) : null)

/** แปลงหน้า HTML ของการ์ดหนึ่งใบเป็นข้อมูลราคา (ฟังก์ชันล้วน — ทดสอบได้โดยไม่ยิงเน็ต) */
export function parseCardPage(html, code, now = Date.now()) {
  const text = rscText(html)
  const sib = grabArray(text, "variantSiblings") || []
  const variants = sib.map(v => {
    const rawAt = asDate(v.marketPriceRawUpdatedAt)
    const gradeAt = asDate(v.marketPriceGradeUpdatedAt)
    return {
      code: v.code,
      variant: v.variant || null,
      name: v.name || null,
      // รูปจากเว็บทางการ asia-th ชื่อไฟล์ตรงกับรหัสเวอร์ชัน (OP13-118_p3 → OP13-118_p3.png)
      // = รูปที่ตรงกับราคาเวอร์ชันนั้นเป๊ะ · เป็นแหล่งรูปที่เจ้าของอนุมัติไว้ (15 ก.ย. 2026)
      image: /^https:\/\/asia-th\.onepiece-cardgame\.com\//.test(v.image_url || "") ? v.image_url : null,
      // ⚠️ ระดับความหายากของ card2price ไม่ตรงกับเว็บทางการเสมอ (ใบปกติ OP13-118 เขาใส่ SP แต่ทางการคือ SEC)
      //    เวลาเขียนให้ใช้ระดับจากคลังการ์ดของเรา (tasks/opcg_cards.json) ตัวนี้เก็บไว้ดูเฉย ๆ
      rarity: v.rarity || null,
      ghost: !!v.ghost_rare,
      // ชุดที่เวอร์ชันนี้อยู่ — การ์ดใบเดียวกันพิมพ์ซ้ำหลายชุด (เช่นใน PRB) แต่ละเวอร์ชันอยู่คนละซอง
      // ผู้เรียกต้องกรองด้วย series_id ของชุดที่โพสต์พูดถึง ไม่งั้นจะเอาราคาของซองอื่นมาอ้าง
      seriesId: v.series_id ? String(v.series_id) : null,
      raw: thb(v.marketPriceRaw),
      rawAt: rawAt?.toISOString().slice(0, 10) || null,
      rawFresh: isFresh(rawAt, now),
      grade: thb(v.marketPriceGrade),
      gradeAt: gradeAt?.toISOString().slice(0, 10) || null,
      gradeFresh: isFresh(gradeAt, now),
    }
  })
  const base = variants.find(v => !v.variant) || null

  // ช่วงราคา 30 วันของเวอร์ชันที่เปิด (ใบปกติ) — ใช้บอกว่าราคาขึ้นลงแค่ไหน
  const pts = grabArray(text, "priceSeriesPoints") || []
  const raws = pts.map(p => thb(p.priceRaw)).filter(Boolean)
  const grades = pts.map(p => thb(p.priceGrade)).filter(Boolean)
  const range30 = pts.length ? {
    from: pts[0]?.day || null,
    to: pts[pts.length - 1]?.day || null,
    rawMin: raws.length ? Math.min(...raws) : null,
    rawMax: raws.length ? Math.max(...raws) : null,
    gradeMin: grades.length ? Math.min(...grades) : null,
    gradeMax: grades.length ? Math.max(...grades) : null,
  } : null

  // ประวัติขายจริงในตลาดญี่ปุ่น (SNKRDUNK) ของ "ใบที่เปิดหน้านี้" — ตัวยืนยันว่าราคาไม่ได้มาจากข้อมูลมั่ว
  // ⚠️ 10 ต.ค. 2026: ราคาเวอร์ชันแพง ๆ บางใบใน card2price ซ้ำกับใบอื่นทุกบาท
  //    (EB04-061_p3 = OP13-118_p3 = ฿257,418 · OP17-118_p2 = OP13-119_p3 = ฿100,158)
  //    ใบที่ราคาซ้ำพวกนั้นไม่มีประวัติขายเลยสักรายการ ส่วนต้นฉบับมี 20 รายการ — ใช้ตรงนี้แยก
  const sales = (grabArray(text, "history") || [])
    .map(h => ({ jpy: Number(h.price) || null, cond: String(h.condition || ""), when: h.date || null }))
    .filter(h => h.jpy)

  const name = (html.match(/<title>([^<(|]+)/) || [])[1]?.trim() || null
  return { code, name, url: `${C2P_BASE}/card/${encodeURIComponent(code)}`, base, variants, range30, sales }
}

// เรทคร่าว ๆ สำหรับเทียบว่าราคาบาทอยู่ "แถว" เดียวกับที่ขายจริงไหม (หน้า card2price โชว์ ¥7,500 ≈ ฿1,590)
// ใช้แค่เป็นด่านกรองตัวเลขผิดหลักหลายเท่า ไม่ได้เอาไปคำนวณราคาลงโพสต์ — ช่วงที่ยอมจึงกว้าง
const JPY_THB = 0.21
const SANE_RATIO = [0.25, 4]

/**
 * ราคาใบดิบของเวอร์ชันนี้มีการซื้อขายจริงรองรับไหม (ฟังก์ชันล้วน)
 * @param {number} rawThb   ราคาใบดิบที่จะเอาไปอ้าง
 * @param {object} ownPage  ผลของ parseCardPage สำหรับหน้าของ "เวอร์ชันนี้เอง"
 */
export function priceBackedBySales(rawThb, ownPage) {
  const s = ownPage?.sales || []
  if (!s.length || !rawThb) return false
  // เทียบกับใบที่ไม่ได้เกรด (A/B/中古) — ใบเกรด PSA แพงกว่าใบดิบตามธรรมชาติ เอามาเทียบจะตีว่าผิด
  const raw = s.filter(x => !/PSA|BGS|CGC|ARS/i.test(x.cond)).map(x => x.jpy).sort((a, b) => a - b)
  if (!raw.length) return true          // มีแต่ใบเกรดซื้อขาย — อย่างน้อยก็มีตลาดจริง
  const med = raw[raw.length >> 1] * JPY_THB
  const r = rawThb / med
  return r >= SANE_RATIO[0] && r <= SANE_RATIO[1]
}

/** ดึงราคาการ์ดหนึ่งใบ — ล้มเหลวคืน null เสมอ ห้ามทำให้งานเขียนล้มเพราะขั้นเสริม */
export async function fetchCardPrice(code, { timeoutMs = 15000, now = Date.now() } = {}) {
  // รับทั้งใบปกติ (OP13-118) และหน้าของเวอร์ชัน (OP13-118_p3) — ตัวตรวจราคาเปิดหน้าเวอร์ชันตรง ๆ
  if (!/^[A-Z]{2,4}\d{2}-\d{3}(_[a-z]\d+)?$/.test(code || "")) return null
  try {
    const res = await fetch(`${C2P_BASE}/card/${encodeURIComponent(code)}`, {
      headers: { "User-Agent": UA, "Accept": "text/html" },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    const info = parseCardPage(await res.text(), code, now)
    return info.variants.length ? info : null
  } catch {
    return null
  }
}

/** ดึงหลายใบทีละใบ เว้นจังหวะ — ไม่ยิงรัวใส่เว็บที่ให้ข้อมูลเราฟรี */
export async function fetchCardPrices(codes, { gapMs = 400, ...opts } = {}) {
  const out = {}
  for (const [i, code] of [...new Set(codes)].entries()) {
    if (i) await new Promise(r => setTimeout(r, gapMs))
    out[code] = await fetchCardPrice(code, opts)
  }
  return out
}

const fmt = (n) => `฿${n.toLocaleString("en-US")}`

/**
 * บรรทัดข้อเท็จจริงเรื่องราคาสำหรับใส่ prompt — มีเฉพาะราคาที่สด และระบุวันที่ทุกตัว
 * คืน "" ถ้าไม่มีราคาที่ใช้ได้เลย (ผู้เรียกจะได้ไม่บอกโมเดลว่ามีราคา)
 */
export function priceFactLine(info) {
  if (!info) return ""
  const bits = []
  const b = info.base
  if (b?.raw && b.rawFresh) bits.push(`ใบปกติ (ใบดิบ) ${fmt(b.raw)} ณ ${b.rawAt}`)
  const r = info.range30
  if (b?.rawFresh && r?.rawMin && r?.rawMax && r.rawMin !== r.rawMax) {
    bits.push(`ช่วง 30 วัน ${fmt(r.rawMin)}–${fmt(r.rawMax)}`)
  }
  // เวอร์ชันพิเศษที่แพงสุดและราคายังสด — นี่คือ "จุดว้าว" แต่ต้องบอกว่าเป็นเวอร์ชันพิเศษเสมอ
  const top = info.variants.filter(v => v.variant && v.raw && v.rawFresh).sort((x, y) => y.raw - x.raw)[0]
  if (top) bits.push(`เวอร์ชันพิเศษที่ราคาสูงสุด (${top.variant}${top.ghost ? " ghost rare" : ""}) ใบดิบ ${fmt(top.raw)} ณ ${top.rawAt}`)
  return bits.length ? `${info.code}: ${bits.join(" · ")}` : ""
}
