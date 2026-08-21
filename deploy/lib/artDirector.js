// ขั้น "คิดไอเดียภาพ" — อ่านแคปชั่นที่อนุมัติแล้ว แล้วตัดสินว่าภาพต้องสื่ออะไร
// ก่อนส่งต่อให้โมเดลวาด
//
// ทำไมต้องมีขั้นนี้ (19 ส.ค. 2026):
//   เจ้าของบอกว่าภาพที่ได้ "ไม่เข้ากับหัวข้อคอนเทนต์ · ไม่ว้าว · สื่อความหมายไม่ได้"
//   ไล่ดูแล้วพบว่าโมเดลวาดไม่เคยรู้เลยว่าโพสต์นั้นพูดเรื่องอะไร — มันได้แค่
//   "แบรนด์นี้ · ซองรูปนี้ · พาดหัวข้อความนี้" แล้ววางซองบนแท่นให้ทุกครั้ง
//   ไม่ว่าเนื้อหาจะเป็นการเทียบสองซอง สอนมือใหม่ หรือเล่าเบื้องหลัง
//
//   สาเหตุคือมี dead config 3 จุด: style.scenes ไม่มีใครอ่าน · content_format
//   ไม่เคยถูกส่งเข้า prompt · caption ถูกใช้แค่ตัดเอา 2 บรรทัดไปเป็นข้อความบนภาพ
//
//   ทดสอบแล้วได้ผลชัด: แคปชั่นเทียบ "ซองซีรีส์หลัก vs ซองซีรีส์พิเศษ"
//   พอบอกไอเดียให้ โมเดลออกแบบเป็นภาพแบ่งซ้าย-ขวา ซ้ายมือคนจัดเด็คบนเพลย์แมต
//   ขวามือคนใส่การ์ดลงแฟ้ม — อ่านเข้าใจได้ก่อนอ่านตัวหนังสือ
//
// ⚠️ ขั้นนี้ห้ามคิดข้อความบนภาพเอง — ข้อความมาจาก FACTS เท่านั้น
//    ถ้าปล่อยให้มันเสนอคำ โมเดลวาดจะเอาไปเขียนจริง แล้วเราจะได้ข้อความไทย
//    ที่ไม่เคยผ่านด่านตรวจคำเว่อร์ (ดู content_voice.json → overclaim)

const OPENAI_BASE = "https://api.openai.com/v1"

// ไล่ตามลำดับ — รุ่นถูกปลดเป็นระยะ ถ้าตัวแรกหายให้ตกไปตัวถัดไปแทนที่จะล้มทั้งงาน
const MODEL_CHAIN = [
  process.env.ART_DIRECTOR_MODEL,
  "gpt-5.4",
  "gpt-5.1",
  "gpt-4.1",
].filter(Boolean)

const SYSTEM = `You are the art director for DivisionX Card, a Thai trading-card vending machine brand.

You receive an approved Thai social caption. Decide the ONE visual idea that makes a
scrolling reader understand the point in under 1 second — before reading any text.

HARD RULES
- The image must carry the MEANING of the caption. A product sitting on a podium is a
  failure unless the caption is genuinely about the product's appearance.
- Choose a concrete compositional device that encodes the idea: split screen, before/after,
  POV hands, two paths, scale comparison, one lit among many, sequence of steps.
- We sell the same sealed packs as every other shop. NEVER imply our packs are rarer,
  special, or better. Our only real advantage is convenience: self-serve, open every day
  during mall hours, in a mall near you, no queue, pick it yourself off the screen.
  (Never "24 hours" — the machines sit inside malls and close when the mall closes.)
- Our machines are stocked with about 30 DIFFERENT products each. Never picture a machine
  filled with one identical pack repeated in every slot — that looks fake to our customers.
- Do NOT invent any text, wording, slogan, price, percentage, or number. Text is supplied
  separately and is already approved. Describe WHERE text blocks sit, never WHAT they say.
- Reject your own first idea if it would work equally well for any other caption.
  Specific beats generic.

Reply as JSON with exactly these keys:
{
  "big_idea":      "<Thai, one sentence: what the viewer understands in 1 second>",
  "visual_device": "<English, the compositional device>",
  "subject":       "<English, what is physically in frame>",
  "composition":   "<English, layout, framing, where the text blocks sit>",
  "why_it_works":  "<Thai, one sentence>"
}`

/**
 * @param {object} o
 * @param {string} o.caption   แคปชั่นที่อนุมัติแล้ว
 * @param {string} [o.format]  รูปแบบโพสต์ (compare/question/ranking/...)
 * @param {string} [o.sku]     ชื่อสินค้าที่โยงถึง
 * @param {string[]} [o.rules] กฎออกแบบจาก tasks/art_direction.json
 * @returns {Promise<object|null>} null = ล้มเหลว ให้ผู้เรียกไปต่อโดยไม่มีไอเดียภาพ
 */
export async function planVisual({ caption, format, sku, franchise, rules = [] }) {
  const key = process.env.OPENAI_API_KEY
  if (!key || !caption?.trim()) return null

  // กฎแบรนด์ที่ถอดมาจากงานจริง — ใส่เข้าไปให้ตัวคิดไอเดียเห็นตั้งแต่แรก
  // ดีกว่าไปดักตอนวาดเสร็จแล้ว เพราะไอเดียที่ผิดกฎจะถูกทิ้งตั้งแต่ยังไม่เสียเงินวาด
  const brand = rules.length
    ? `\n\nBRAND DESIGN RULES (derived from the brand's real work — obey all):\n` +
      rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : ""

  const user = [
    format ? `รูปแบบโพสต์: ${format}` : null,
    sku ? `สินค้าที่โยงถึง: ${sku}` : null,
    // บอกค่ายให้ตัวคิดรู้ตั้งแต่แรก ไม่งั้นมันจะเสนอไอเดียกลาง ๆ ที่ไปได้กับทุกค่าย
    // แล้วตัววาดค่อยไปหยิบลายผิดค่ายมาใส่ทีหลัง (เคสจริง: Dragon Ball ได้สมอกับคลื่น)
    franchise ? `ค่ายการ์ด: ${franchise} — องค์ประกอบภาพต้องเข้ากับค่ายนี้ ห้ามหยิบสัญลักษณ์ของค่ายอื่นมาปน` : null,
    `\nแคปชั่นที่อนุมัติแล้ว:\n${caption.trim()}`,
  ].filter(Boolean).join("\n")

  let lastErr = ""
  for (const model of MODEL_CHAIN) {
    try {
      const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM + brand },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(120000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) {
        lastErr = `${model}: ${json?.error?.message || res.status}`
        // ชื่อรุ่นผิด/ถูกปลด → ลองตัวถัดไป · error อื่นหยุด ไม่ต้องเผา token ซ้ำ
        if (/model|not found|does not exist/i.test(lastErr)) continue
        break
      }
      const txt = json?.choices?.[0]?.message?.content
      if (!txt) { lastErr = `${model}: ไม่มีเนื้อหากลับมา`; continue }
      const idea = JSON.parse(txt)
      if (!idea?.big_idea) { lastErr = `${model}: ผลลัพธ์ไม่มี big_idea`; continue }
      return { ...idea, _model: model }
    } catch (e) {
      lastErr = `${model}: ${String(e.message || e).slice(0, 120)}`
    }
  }
  // ตั้งใจไม่ throw — ภาพยังสร้างได้โดยไม่มีไอเดียภาพ แค่ได้ภาพที่จืดลง
  // ถ้าโยน error ทั้งงานจะล้มเพราะขั้นเสริมพัง ซึ่งแย่กว่า
  console.warn("[artDirector] วางไอเดียภาพไม่สำเร็จ —", lastErr)
  return null
}

/** แปลงไอเดียเป็นบล็อกข้อความสำหรับต่อท้าย prompt ของตัววาด */
export function ideaToPrompt(idea) {
  if (!idea?.big_idea) return ""
  return [
    `THE ONE IDEA THIS POSTER MUST COMMUNICATE: ${idea.big_idea}`,
    idea.visual_device ? `Visual device: ${idea.visual_device}` : null,
    idea.subject ? `Subject in frame: ${idea.subject}` : null,
    idea.composition ? `Composition: ${idea.composition}` : null,
    "A viewer scrolling past must grasp this idea from the picture alone, " +
    "before reading a single word.",
  ].filter(Boolean).join("\n")
}
