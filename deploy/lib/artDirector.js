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
// ⚠️ 14 ก.ย. 2026 — แก้เพราะภาพ "จำเจ" (เจ้าของบอกว่ากฎบังคับ AI มากเกินไป)
//    ยิงขั้นนี้กับแคปชั่นจริง 6 ใบก่อนแก้: เนื้อหาไอเดียต่างกันก็จริง แต่ทุกใบได้
//    มือถือซองเรียงพัด · ตู้ในห้าง · สินค้ากิน 60% · เลย์เอาต์ข้อความสูตรเดียวกัน
//    ต้นเหตุคือกฎสไตล์ 30 ข้อต่อท้ายพร้อมคำสั่ง "obey all" + เมนูท่า 7 แบบ +
//    ประโยค "มือถือซองพัด ใช้ได้เลย" — มันจึงหยิบของที่อนุญาตชัดที่สุดทุกครั้ง
//    ตอนนี้ส่งเฉพาะกฎเหล็ก + ลายเซ็นแบรนด์สั้น ๆ + แนวภาพที่หมุนตาม id
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
scrolling reader understand the point in under 1 second — before reading any text — and
a visual style that makes this poster look unlike the ones before it.

MEANING
- The image must carry the MEANING of the caption. A product sitting on a podium is a
  failure unless the caption is genuinely about the product's appearance.
- Invent the compositional device that encodes this idea best. Split screens, before/after,
  POV, scale, sequences, visual metaphors, diagrams, one symbolic object — these are only
  examples, not a menu. Reject your first idea if it would work equally well for any other
  caption. Specific beats generic.
- THE IDEA MUST DELIVER WHAT THE CAPTION PROMISES. If the caption announces a list, a
  ranking, a comparison or a number, the image has to show that thing — not a mood shot
  that happens to share the topic. A caption promising "top 10 cards" with an image of
  someone holding a binder has failed, however pretty the binder is.
- A COMPARISON MUST COMPARE DIFFERENT THINGS. If the caption asks the reader to choose
  between two options ("A or B?", "new vs classic"), the two sides must show DIFFERENT
  real products. Showing the same packs on both sides with different labels is a lie the
  viewer spots instantly — it destroys trust faster than a plain product shot ever could.
  If you only have reference photos of ONE product, do NOT build a split-screen; pick a
  composition that works honestly with what you actually have.

CREATIVE FREEDOM
- Our recent posters all looked alike. Unless THIS caption genuinely needs one of them,
  do NOT fall back on: a hand fanning out packs · a vending machine in a mall concourse ·
  a pack on a podium or pedestal · lightning behind the product · the product filling most
  of the frame · a headline-on-top, info-block, bottom-line template layout.
- Rendering style, palette balance, lighting, camera angle and layout are yours to choose.
  Photography, illustration, 3D, collage, graphic design and typography-led posters are all
  welcome.
- The canvas is always a SQUARE 1:1 image. Compose for a square — never describe a portrait
  or landscape layout.
- You are given a SUGGESTED STYLE for this poster. Use it unless it fights the idea; if it
  does, choose a different distinctive style yourself.

TRUTH — never break
- We sell the same sealed packs as every other shop. NEVER imply our packs are rarer,
  special, or better. Our only real advantage is convenience: self-serve, open every day
  during mall hours, in a mall near you, no queue, pick it yourself off the screen.
  (Never "24 hours" — the machines sit inside malls and close when the mall closes.)
- A poster does not need to show a machine or a mall. But IF a vending machine appears, it
  stands INSIDE a shopping mall (never outdoors, a street, a night sky or a mall's exterior)
  and it is stocked with about 30 DIFFERENT products — never one pack repeated in every slot.
- Any pack you show must be one of our actual products — say WHICH ones. Never invented art.
- Never propose drawing a franchise character or mascot in ANY form — not as a figure, plush,
  toy, costume, statue, "vintage collectible" or symbolic object. Characters may appear only
  where they are already printed on the real pack photos, or on the face of a card from the
  ALLOWED CARDS list when one is supplied — name which of those cards you use.
- If the caption teaches how the game is played and the lesson needs cards, show the card
  the lesson is actually about. Never swap in a different kind of card (an Energy or Trainer
  card standing in for a Pokémon) — a lesson picture that teaches the wrong move is worse
  than no picture.
- THE POST'S CARD GAME IS FIXED. Whatever franchise the caption names is the ONLY one
  allowed in frame. Never show packs from a different card game than the caption discusses —
  a Pokémon caption with One Piece packs is the single most damaging error we can make,
  because it proves nobody checked.
- Do NOT invent any text, wording, slogan, price, percentage, or number. Text is supplied
  separately and is already approved. Describe WHERE text blocks sit, never WHAT they say.

Reply as JSON with exactly these keys:
{
  "big_idea":        "<Thai, one sentence: what the viewer understands in 1 second>",
  "visual_device":   "<English, the compositional device>",
  "style_direction": "<English, the rendering style, palette balance and lighting you chose>",
  "subject":         "<English, what is physically in frame>",
  "shows_machine":   <true if a vending machine is visible anywhere in frame, otherwise false>,
  "composition":     "<English, layout, framing, where the text blocks sit>",
  "why_it_works":    "<Thai, one sentence>"
}`

/**
 * @param {object} o
 * @param {string} o.caption      แคปชั่นที่อนุมัติแล้ว
 * @param {string} [o.format]     รูปแบบโพสต์ (compare/question/ranking/...)
 * @param {string} [o.sku]        ชื่อสินค้าที่โยงถึง
 * @param {string[]} [o.rules]    กฎเหล็กจาก tasks/art_direction.json → hard_rules
 * @param {string[]} [o.signature] ลายเซ็นแบรนด์จาก art_direction.json → brand_signature
 * @param {string} [o.styleHint]  แนวภาพที่เสนอให้ใบนี้ (หมุนตาม id)
 * @param {string[]} [o.allowedCards] การ์ดจริงที่วาดหน้าได้ "ชื่อ — ขั้น · HP" (เฉพาะโพสต์โปเกมอน)
 * @returns {Promise<object|null>} null = ล้มเหลว ให้ผู้เรียกไปต่อโดยไม่มีไอเดียภาพ
 */
export async function planVisual({ caption, format, sku, franchise, rules = [], signature = [], styleHint = null, allowedCards = [] }) {
  const key = process.env.OPENAI_API_KEY
  if (!key || !caption?.trim()) return null

  // กฎเหล็กใส่ให้ตัวคิดไอเดียเห็นตั้งแต่แรก — ไอเดียที่ผิดความจริงจะถูกทิ้งก่อนเสียเงินวาด
  // ⚠️ ส่งเฉพาะกฎเหล็ก ห้ามส่งกฎสไตล์ปนมา — ตัวคิดไอเดียเคารพทุกข้อที่เห็นแบบตามตัวอักษร
  //    แล้วลอกสูตรเลย์เอาต์ออกมาทุกใบ (ดู art_direction.json → _restructure_note)
  const hard = rules.length
    ? `\n\nHARD RULES (truth, legal and accuracy — obey all):\n` +
      rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : ""
  const sig = signature.length
    ? `\n\nBRAND SIGNATURE (keep the poster recognisably ours — a starting point, never a template):\n` +
      signature.map(s => `- ${s}`).join("\n")
    : ""

  const user = [
    format ? `รูปแบบโพสต์: ${format}` : null,
    sku ? `สินค้าที่โยงถึง: ${sku}` : null,
    // บอกค่ายให้ตัวคิดรู้ตั้งแต่แรก ไม่งั้นมันจะเสนอไอเดียกลาง ๆ ที่ไปได้กับทุกค่าย
    // แล้วตัววาดค่อยไปหยิบลายผิดค่ายมาใส่ทีหลัง (เคสจริง: Dragon Ball ได้สมอกับคลื่น)
    franchise ? `ค่ายการ์ด: ${franchise} — องค์ประกอบภาพต้องเข้ากับค่ายนี้ ห้ามหยิบสัญลักษณ์ของค่ายอื่นมาปน` : null,
    styleHint ? `SUGGESTED STYLE for this poster: ${styleHint}` : null,
    // ⚠️ ต้องเห็นรายชื่อตั้งแต่ขั้นนี้ — ไม่งั้นมันเชื่อข้อห้ามวาดตัวละครแล้วเลี่ยงการ์ดไปเลย
    //    ภาพสอนกฎ #43 จึงเอาการ์ดพลังงานมาแทนโปเกมอน (15 ก.ย. 2026)
    allowedCards.length
      // "สะกดตามรายการ" — ทดสอบแล้วมันแปลชื่อเป็นอังกฤษเอง (แมนคี → Mankey) รายการในบรีฟขั้นวาดเป็นชื่อไทย
      //  ชื่อไม่ตรงกันทำให้ artworkPkmCards ดันใบที่ไอเดียเลือกขึ้นหัวรายการไม่ได้
      ? `ALLOWED CARDS — real cards from the set we sell. If the idea needs a card face, use only ` +
        `these and name which, spelled exactly as listed:\n${allowedCards.map(c => `- ${c}`).join("\n")}`
      : null,
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
            { role: "system", content: SYSTEM + hard + sig },
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
      return { ...idea, _model: model, _style_hint: styleHint }
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
    idea.style_direction ? `Visual style: ${idea.style_direction}` : null,
    idea.subject ? `Subject in frame: ${idea.subject}` : null,
    idea.composition ? `Composition: ${idea.composition}` : null,
    "A viewer scrolling past must grasp this idea from the picture alone, " +
    "before reading a single word.",
  ].filter(Boolean).join("\n")
}
