// ── ตัวประกอบคำสั่งสำหรับ LLM (ถ้าจะใช้) ────────────────────────────────
//
// ไฟล์นี้ "ไม่เรียก API เอง" — คืนแค่ {system, user} ให้ผู้เรียกเอาไปยิงกับ
// ผู้ให้บริการไหนก็ได้ (OpenAI / Gemini / Claude / โมเดลในองค์กร) เหตุผล:
//   1. โมดูลนี้ต้องไม่ผูกกับ provider และต้องไม่แตะ API key เลย
//   2. ฝั่งเว็บ (Vite/React) ไม่ควรถือ key อยู่แล้ว — การเรียกจริงต้องทำที่ server
//
// หลักการที่ยกมาจากระบบต้นทาง:
//   • ใส่กฎแบรนด์และกฎความเสี่ยง "ตั้งแต่ system prompt" ไม่ใช่ไปดักตอนได้ผลแล้ว
//     — ข้อความที่ผิดกฎตั้งแต่ต้นคือการเผาโควตาฟรี ๆ
//   • บังคับให้ตอบเป็น JSON เสมอ แล้วผู้เรียกค่อยเอาไปประกอบ
//     — ผลลัพธ์เป็นข้อความอิสระจะแกะไม่ได้เมื่อโมเดลเปลี่ยนอารมณ์
//   • ขั้นคิด "ไอเดียภาพ" ต้องแยกจากขั้นวาด และห้ามคิดข้อความบนภาพเอง
//     — ไม่งั้นจะได้ตัวหนังสือไทยที่ไม่เคยผ่านด่านตรวจคำเกินจริง

import { IMAGE_RULES, VIDEO_BEAT_GUIDE, CONTENT_TYPES, CRAFT } from "./templates.js"
import { SAFER_PHRASES, GRAY_AREA } from "./rules.js"

// ── บล็อกกฎที่ใส่ไว้ในทุก system prompt ────────────────────────────────
export const COMPLIANCE_BLOCK = `
ข้อห้ามเด็ดขาด (ผิดข้อใดข้อหนึ่ง ถือว่างานชิ้นนั้นใช้ไม่ได้):
- ห้ามรับประกันการอนุมัติ วงเงิน ราคาขาย หรือผลตอบแทน ไม่ว่าทางตรงหรือทางอ้อม
- ห้ามใช้คำขั้นสุดที่พิสูจน์ไม่ได้ เช่น ถูกที่สุด ดีที่สุด อันดับหนึ่ง เจ้าเดียว
- ห้ามสื่อว่าเลี่ยงการตรวจสอบเครดิตหรือกฎเกณฑ์ใด ๆ
- ห้ามใช้ความกลัวหรือเส้นตายปลอมกดดันให้ตัดสินใจ
- ห้ามคิดตัวเลขขึ้นเอง ทั้งราคา ขนาดที่ดิน ดอกเบี้ย เปอร์เซ็นต์ ระยะเวลา หรือจำนวนลูกค้า
  ถ้าไม่มีตัวเลขจากข้อมูลที่ให้มา ให้เขียนโดยไม่มีตัวเลข
- ห้ามเปิดเผยข้อมูลที่ระบุตัวบุคคล เลขเอกสารสิทธิ์ หรือรายละเอียดที่ทำให้ระบุแปลงได้
- เขียนภาษาไทยเท่านั้น ห้ามใช้อักษรลาว เขมร หรือพม่าที่หน้าตาคล้ายอักษรไทย
- ถ้าเนื้อหาแตะเรื่องกฎหมาย ต้องมีบรรทัดกำกับว่าเป็นข้อมูลทั่วไป ไม่ใช่คำแนะนำเฉพาะราย

ถ้าจะพูดแนวนี้ ให้ใช้คำทางขวาแทน:
${Object.entries(SAFER_PHRASES).map(([bad, good]) => `- "${bad}" → ${good}`).join("\n")}

พื้นที่สีเทา: ${GRAY_AREA}
`.trim()

const BRAND_BLOCK = `
บริบทธุรกิจ: ที่ปรึกษาอสังหาริมทรัพย์ไทย ให้บริการขายฝาก จำนอง ประเมินทรัพย์
และจับคู่ผู้ซื้อกับผู้ขาย กลุ่มผู้อ่านคือเจ้าของทรัพย์ที่ต้องการสภาพคล่อง
เจ้าของที่อยากขาย และนักลงทุนที่หาทรัพย์ราคาดี

จุดยืนในการสื่อสาร: เราขายความเข้าใจและความโปร่งใส ไม่ได้ขายความเร็วหรือความง่าย
คนอ่านกลุ่มนี้เคยถูกหลอกหรือกลัวว่าจะถูกหลอก การพูดเกินจริงจึงทำลายความเชื่อใจ
เร็วกว่าที่มันจะช่วยให้ได้ลูกค้า
`.trim()

// ── บล็อกหลักการเขียน — หยิบทีละชิ้น ไม่ยัดทั้งคลัง ────────────────────
//
// ⚠️ ห้ามส่ง framework ทั้งหมดเข้าไปพร้อมกัน (บทเรียนจากระบบต้นทาง):
//    "ให้ framework มาทั้ง 8 แบบพร้อมกัน = ไม่ได้บังคับให้ใช้แบบไหนเลย"
//    โมเดลจะเลือกท่าที่ถนัดซ้ำ ๆ แล้วคอนเทนต์จะกลับไปหน้าตาเหมือนกันหมด
//    นอกจากนี้ยังทำให้โมเดลเล็กจมข้อมูลจนลืมโจทย์ และเปลืองโควตาฟรี ๆ
function craftBlock(contentTypeSpec) {
  const fw = CRAFT.frameworks[contentTypeSpec?.framework]
  const hk = CRAFT.hooks[contentTypeSpec?.hook]
  return [
    "หลักการเขียน:\n" + CRAFT.principles.map(p => `- ${p}`).join("\n"),
    hk ? `วิธีเปิดเรื่องที่ใช้กับงานชิ้นนี้: ${contentTypeSpec.hook} — ${hk}` : null,
    fw ? `โครงเล่าเรื่องที่ใช้กับงานชิ้นนี้: ${contentTypeSpec.framework} — ${fw.join(" → ")}` : null,
    "กติกาการชวนให้ทำต่อ:\n" + CRAFT.ctaRules.map(r => `- ${r}`).join("\n"),
    "สิ่งที่ต้องเลี่ยง:\n" + CRAFT.avoid.map(r => `- ${r}`).join("\n"),
    "ก่อนส่ง ตรวจในใจ (ห้ามพิมพ์คำตอบออกมา):\n" + CRAFT.selfCheck.map(r => `- ${r}`).join("\n"),
  ].filter(Boolean).join("\n\n")
}

// ── ให้เลือก 2 รูปแบบ ไม่ใช่ยัด 1 และไม่ใช่ให้ทั้งหมด ──────────────────
//
// บทเรียนจากระบบต้นทาง: บังคับรูปแบบเดียวแล้วเจอหัวข้อที่ไม่เข้ากัน จะได้คอนเทนต์
// ที่ฝืนจนคนอ่านแล้วงง (เคสจริง: สั่งให้ "เทียบสองอย่าง" กับหัวข้อที่ทำพร้อมกันได้
// เลยได้คู่เทียบปลอม) · ส่วนการให้ทั้งหมดเท่ากับไม่ได้บังคับอะไรเลย
// ทางออกคือส่ง 2 ตัวเลือกพร้อม "ใช้เมื่อ/ห้ามใช้เมื่อ" แล้วให้โมเดลตัดสินเอง
function formatChoiceBlock(primaryKey, altKey) {
  const fmt = k => {
    const s = CONTENT_TYPES[k]
    if (!s) return null
    return [
      `[${s.id}] ${s.label} — ${s.intent}`,
      s.when ? `   ใช้เมื่อ: ${s.when}` : null,
      s.avoid_when ? `   ห้ามใช้เมื่อ: ${s.avoid_when}` : null,
    ].filter(Boolean).join("\n")
  }
  const list = [fmt(primaryKey), fmt(altKey)].filter(Boolean).join("\n\n")
  return `เลือกรูปแบบที่เข้ากับเรื่องนี้จริง ๆ หนึ่งแบบจากสองแบบนี้:

${list}

อ่าน "ห้ามใช้เมื่อ" ให้ครบก่อนเลือก ถ้าแบบแรกไม่เข้ากับเรื่องจริง ๆ ให้ใช้แบบที่สอง
ห้ามฝืนเขียนตามรูปแบบที่ไม่เข้ากับเรื่อง — คอนเทนต์ที่คนอ่านแล้วงงแย่กว่าไม่โพสต์
บอกแบบที่เลือกไว้ในคีย์ "format" ของ JSON ที่ตอบกลับ`
}

/** รูปแบบสำรองที่ต่างจากตัวหลัก — เลือกแบบคงที่จากลำดับในคลัง */
function altContentType(primaryKey) {
  const keys = Object.keys(CONTENT_TYPES)
  const i = keys.indexOf(primaryKey)
  return keys[(i + 1) % keys.length]
}

function contextLines(input, resolved) {
  return [
    `วัตถุประสงค์: ${input.objective || resolved.objectiveLabel}`,
    `กลุ่มเป้าหมาย: ${input.audience || resolved.audienceDefault}`,
    input.offer ? `สิ่งที่เสนอให้: ${input.offer}` : null,
    `ประเภททรัพย์: ${input.assetType || resolved.assetLabel}`,
    input.province ? `พื้นที่: ${input.province}` : null,
    `ช่องทาง: ${resolved.channelSpec?.label} (${resolved.channelSpec?.media})`,
    `โทน: ${resolved.toneSpec?.label} — ${resolved.toneSpec?.guide}`,
    `รูปแบบคอนเทนต์: ${resolved.contentTypeSpec?.label} — ${resolved.contentTypeSpec?.intent}`,
    resolved.contentTypeSpec?.note ? `ข้อควรระวังของรูปแบบนี้: ${resolved.contentTypeSpec.note}` : null,
    input.propertyData && Object.keys(input.propertyData).length
      ? `ข้อมูลทรัพย์ที่ใช้ได้ (ห้ามใช้ตัวเลขนอกเหนือจากนี้):\n${JSON.stringify(input.propertyData, null, 2)}`
      : "ไม่มีข้อมูลทรัพย์ — ห้ามใส่ตัวเลขใด ๆ",
    input.campaignContext && Object.keys(input.campaignContext).length
      ? `บริบทแคมเปญ:\n${JSON.stringify(input.campaignContext, null, 2)}` : null,
  ].filter(Boolean).join("\n")
}

/**
 * คำสั่งเขียนแคปชั่น
 * @returns {{system:string, user:string, responseShape:object}}
 */
export function buildCaptionPrompt(input, resolved, opts = {}) {
  const ch = resolved.channelSpec || {}
  // system = ตัวตนของคนเขียน (ไม่เปลี่ยนตามงาน) · user = โจทย์ของงานชิ้นนี้
  // ⚠️ สิ่งที่อยากให้ "ชนะ" ต้องอยู่ท้ายสุด — โมเดลให้น้ำหนักกับสิ่งที่อยู่ท้ายมากกว่า
  const system = [
    "คุณเป็นคนเขียนคอนเทนต์การตลาดให้ธุรกิจอสังหาริมทรัพย์ไทย",
    BRAND_BLOCK,
    craftBlock(resolved.contentTypeSpec),
    COMPLIANCE_BLOCK,
    `ข้อกำหนดของช่องทางนี้:
- บรรทัดแรกต้องเล่าให้จบใจความภายใน ${ch.hookChars || 100} ตัวอักษร เพราะเกินจากนี้คนต้องกดดูเพิ่ม
- ความยาวรวมไม่ควรเกิน ${ch.captionMax || 400} ตัวอักษร
- ${ch.linkPolicy || ""}`,
    `ตอบเป็น JSON เท่านั้น ตามรูปนี้:
{
  "format":   "<คีย์ของรูปแบบที่เลือกใช้>",
  "headline": "<พาดหัวไทยไม่เกิน 30 ตัวอักษร ใช้เป็นข้อความบนภาพได้ ต้องอ่านรู้เรื่องเดี่ยว ๆ>",
  "caption":  "<แคปชั่นเต็ม ขึ้นบรรทัดใหม่ได้ ห้ามใส่แฮชแท็ก ห้ามใส่ลิงก์>",
  "cta":      "<ประโยคเดียว บอกว่าให้ทำอะไรต่อ ขอแค่อย่างเดียว>",
  "hashtags": ["<ไม่มี # นำหน้า>", "..."]
}`,
    "เขียนเป็นภาษาไทยเท่านั้น",
  ].join("\n\n")

  // โพสต์ล่าสุดส่งเข้าไปเป็นรายการ "ห้ามเขียนซ้ำแนวนี้"
  // ⚠️ ต้องเขียนกำกับให้ชัดว่าเอาไว้ "เลี่ยง" ไม่ใช่ "ตัวอย่าง"
  //    ไม่งั้นโมเดลจะเลียนแบบยิ่งกว่าเดิม (บทเรียนจากระบบต้นทาง)
  const recent = (opts.recentCaptions || []).slice(0, 8)
  const recentBlock = recent.length
    ? `\n\nโพสต์ที่เพิ่งลงไปแล้ว — ห้ามเขียนซ้ำแนวนี้ (นี่ไม่ใช่ตัวอย่างให้เลียนแบบ):\n` +
      recent.map((c, i) => `${i + 1}. ${String(typeof c === "string" ? c : c?.caption || "").slice(0, 120)}`).join("\n") +
      `\nชิ้นใหม่ต้องต่างจากข้างบนทั้งสามอย่าง: ประโยคเปิด · โครงสร้าง · มุมที่เล่า`
    : ""

  const user = [
    contextLines(input, resolved),
    recentBlock,
    "\n" + formatChoiceBlock(resolved.contentType, altContentType(resolved.contentType)),
  ].filter(Boolean).join("\n")

  return {
    system, user,
    responseShape: { format: "string", headline: "string", caption: "string", cta: "string", hashtags: "string[]" },
  }
}

/**
 * คำสั่งให้ "ผู้ตรวจ" ตรวจงานที่เขียนเสร็จแล้ว
 *
 * ⚠️ ผู้ตรวจต้องได้กฎชุดเดียวกับคนเขียนเสมอ — ไม่ใช่ตรวจตามที่จำมา
 *    และผลตรวจเป็นเพียง "ความเห็น" คนยังเป็นผู้ตัดสิน ไม่ควรให้ระบบเปลี่ยนสถานะเอง
 */
export function buildReviewPrompt(input, resolved, draft) {
  const system = [
    "คุณเป็นผู้ตรวจคอนเทนต์การตลาดของธุรกิจอสังหาริมทรัพย์ไทย",
    "หน้าที่คือหาจุดที่ทำให้โพสต์นี้ใช้ไม่ได้ ไม่ใช่ชมหรือเขียนใหม่ให้",
    COMPLIANCE_BLOCK,
    `เกณฑ์ตัดสิน:
- pass = โพสต์ได้เลย
- fix  = มีจุดที่แก้ได้และควรแก้ก่อนโพสต์ (ต้องบอกให้ชัดว่าแก้ตรงไหน แก้เป็นอะไร)
- drop = ผิดกฎจนแก้ไม่คุ้ม ควรเขียนใหม่ทั้งชิ้น
ห้ามให้ verdict เป็น fix หรือ drop โดยไม่ระบุจุดที่แก้ได้จริง — คำติลอย ๆ ใช้ไม่ได้`,
    `ตอบเป็น JSON เท่านั้น:
{ "verdict": "pass|fix|drop", "notes": "<ไทย ระบุจุดและวิธีแก้>", "risky_phrases": ["<ข้อความที่มีปัญหา>"] }`,
  ].join("\n\n")

  const user = [
    contextLines(input, resolved),
    `\nแคปชั่นที่ต้องตรวจ:\n${String(draft?.caption || "").trim()}`,
    draft?.videoScript ? `\nสคริปต์วิดีโอ:\n${String(draft.videoScript).trim()}` : "",
  ].filter(Boolean).join("\n")

  return { system, user, responseShape: { verdict: "string", notes: "string" } }
}

/**
 * คำสั่งคิด "ไอเดียภาพ" — ขั้นนี้ยังไม่ใช่การวาด
 *
 * ⚠️ ขั้นนี้ห้ามคิดข้อความบนภาพเอง (บทเรียนจากระบบต้นทาง)
 *    ถ้าปล่อยให้มันเสนอคำ โมเดลวาดจะเอาไปเขียนจริง แล้วได้ข้อความไทย
 *    ที่ไม่เคยผ่านด่านตรวจคำเกินจริง และสะกดเพี้ยนแบบแก้ไม่ได้
 */
export function buildImageBriefPrompt(input, resolved, caption) {
  const system = [
    "คุณเป็นอาร์ตไดเรกเตอร์ของธุรกิจอสังหาริมทรัพย์ไทย",
    "หน้าที่คือตัดสินว่าภาพหนึ่งใบต้องสื่ออะไร ให้คนที่เลื่อนผ่านเข้าใจประเด็นภายในหนึ่งวินาที ก่อนอ่านตัวหนังสือ",
    BRAND_BLOCK,
    "กฎของภาพ:\n" + IMAGE_RULES.map((r, i) => `${i + 1}. ${r}`).join("\n"),
    `เพิ่มเติม:
- เลือกวิธีจัดองค์ประกอบที่ "เข้ารหัสความหมาย" ไม่ใช่ภาพสวยลอย ๆ เช่น แบ่งซ้าย-ขวา ก่อน-หลัง มุมมองบุคคลที่หนึ่ง สองทางเลือก ลำดับขั้นตอน
- ถ้าไอเดียที่คิดได้ใช้กับโพสต์ไหนก็ได้ ให้ทิ้งแล้วคิดใหม่ ความเฉพาะเจาะจงชนะความสวย
- ห้ามคิดข้อความที่จะเขียนบนภาพ ให้บอกแค่ว่าเว้นที่ว่างให้ข้อความตรงไหน`,
    `ตอบเป็น JSON เท่านั้น:
{
  "big_idea":      "<ไทย ประโยคเดียว: คนดูเข้าใจอะไรใน 1 วินาที>",
  "visual_device": "<อังกฤษ วิธีจัดองค์ประกอบ>",
  "subject":       "<อังกฤษ สิ่งที่อยู่ในเฟรมจริง ๆ>",
  "composition":   "<อังกฤษ เลย์เอาต์ มุมกล้อง ตำแหน่งที่เว้นไว้ให้ข้อความ>",
  "image_prompt":  "<อังกฤษ คำสั่งเต็มสำหรับโมเดลสร้างภาพ ไม่มีข้อความใด ๆ ในภาพ>",
  "why_it_works":  "<ไทย ประโยคเดียว>"
}`,
  ].join("\n\n")

  const user = [
    contextLines(input, resolved),
    `แนวทางภาพของรูปแบบนี้: ${resolved.visualDevice}`,
    `\nแคปชั่นที่อนุมัติแล้ว:\n${String(caption || "").trim()}`,
  ].join("\n")

  return { system, user, responseShape: { big_idea: "string", image_prompt: "string" } }
}

/** คำสั่งเขียนสคริปต์วิดีโอสั้น */
export function buildVideoScriptPrompt(input, resolved) {
  const beats = resolved.contentTypeSpec?.videoBeats || ["hook", "detail", "cta"]
  const beatLines = beats.map((b, i) => {
    const g = VIDEO_BEAT_GUIDE[b] || {}
    return `${i + 1}. ${b} (~${g.seconds || 4} วินาที) — ${g.purpose || ""}`
  }).join("\n")

  const system = [
    "คุณเป็นคนเขียนสคริปต์วิดีโอสั้นภาษาไทยสำหรับธุรกิจอสังหาริมทรัพย์",
    BRAND_BLOCK,
    COMPLIANCE_BLOCK,
    `กติกาการเขียน:
- หนึ่งบรรทัด = หนึ่งฉาก การขึ้นบรรทัดใหม่คือการสั่งเปลี่ยนภาพ
- ทุกบรรทัดจะถูกอ่านออกเสียง ห้ามใส่อิโมจิ แฮชแท็ก วงเล็บกำกับฉาก หรือ URL
- สองวินาทีแรกตัดสินว่าคนดูต่อหรือเลื่อนผ่าน ทุ่มน้ำหนักที่บรรทัดแรก
- คนส่วนใหญ่ดูแบบปิดเสียง ข้อความต้องอ่านรู้เรื่องแม้ไม่มีเสียง
- ตัวเลขที่อ่านออกเสียงให้เขียนเป็นคำไทย เช่น "สิบห้าเปอร์เซ็นต์" ไม่ใช่ "15%"`,
    `โครงที่ต้องเขียนตามลำดับ:\n${beatLines}`,
    `ตอบเป็น JSON เท่านั้น:
{
  "script": "<บรรทัดต่อบรรทัด คั่นด้วย \\n หนึ่งบรรทัดคือหนึ่งฉาก>",
  "hook": "<บรรทัดแรกซ้ำอีกครั้ง ใช้เป็นข้อความบนจอช่วงเปิด>",
  "shot_notes": ["<ไทย ภาพที่ควรใช้ของแต่ละฉาก เรียงตามบรรทัด>"]
}`,
  ].join("\n\n")

  return { system, user: contextLines(input, resolved), responseShape: { script: "string" } }
}

/** ประกอบคำสั่งทั้งชุดในครั้งเดียว (สะดวกเวลาเรียกจาก server route เดียว) */
export function buildAllPrompts(input, resolved, caption) {
  return {
    caption: buildCaptionPrompt(input, resolved),
    imageBrief: buildImageBriefPrompt(input, resolved, caption),
    videoScript: buildVideoScriptPrompt(input, resolved),
  }
}

export default {
  COMPLIANCE_BLOCK, buildCaptionPrompt, buildImageBriefPrompt,
  buildVideoScriptPrompt, buildReviewPrompt, buildAllPrompts,
}
