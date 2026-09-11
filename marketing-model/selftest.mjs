// ตรวจตัวเองของโมดูล — รันด้วย: node selftest.mjs
//
// ไม่ใช้ไลบรารีทดสอบใด ๆ โดยตั้งใจ เพื่อให้รันได้ทันทีหลังก๊อปโฟลเดอร์ไปวางที่อื่น
// ควรรันหนึ่งรอบหลังก๊อปเข้าโปรเจกต์ และทุกครั้งที่แก้ templates.js / rules.js
import { readFileSync } from "node:fs"
import {
  runMarketingModel, runMarketingModelWithLLM, getPrompts, getOptions,
  checkDuplicate, canPublish, splitHeadline,
} from "./index.js"

const examples = JSON.parse(readFileSync(new URL("./examples.json", import.meta.url), "utf-8"))
let pass = 0, fail = 0
const ok = (cond, label) => { cond ? pass++ : (fail++, console.log("  ✗ " + label)) }

console.log("── ตรวจตัวอย่างใน examples.json ──")
for (const ex of examples.examples) {
  const out = runMarketingModel(ex.input)
  const e = ex.expected || {}
  console.log(`\n[${ex.id}] ${ex.title}`)
  console.log(`  พาดหัว: ${out.headline}`)
  console.log(`  แคปชั่น ${out.caption.length} ตัว · แท็ก ${out.hashtags.length} · คุณภาพ ${out.meta.captionQuality.score}`)

  ok(!!out.caption.trim(), "ต้องมีแคปชั่น")
  ok(!!out.headline.trim(), "ต้องมีพาดหัว")
  ok(out.headline.length <= 34, `พาดหัวต้องไม่ยาวเกินไป (ได้ ${out.headline.length})`)
  ok(!!out.imagePrompt && !!out.videoScript, "ต้องมีบรีฟภาพและสคริปต์วิดีโอ")
  ok(!!out.automationPayload.postText, "ต้องมี postText")
  ok(Array.isArray(out.warnings), "warnings ต้องเป็น array ของข้อความ")
  // ห้ามมีช่องว่างเทมเพลตหลงเหลือ
  ok(!/\{[a-zA-Z]+\}/.test(out.caption + out.videoScript), "ต้องไม่มี {token} ค้าง")

  if (e.channelResolved) ok(out.meta.resolved.channel === e.channelResolved, `channel ต้องเป็น ${e.channelResolved}`)
  if (e.hashtagCount !== undefined) ok(out.hashtags.length === e.hashtagCount, `แท็กต้องมี ${e.hashtagCount} อัน (ได้ ${out.hashtags.length})`)
  if (e.captionMax) ok(out.caption.length <= e.captionMax, `แคปชั่นต้องไม่เกิน ${e.captionMax} (ได้ ${out.caption.length})`)
  for (const s of e.mustContain || []) ok(out.caption.includes(s), `แคปชั่นต้องมี "${s}"`)
  for (const s of e.mustNotContain || []) ok(!out.caption.includes(s), `แคปชั่นต้องไม่มี "${s}"`)
  // บางช่องแคปชั่นสั้นมาก เนื้อหาอยู่ในคลิป — ข้อความบังคับบางอย่างจึงดูรวมสองส่วน
  for (const s of e.mustContainAnywhere || [])
    ok((out.caption + out.videoScript).includes(s), `คอนเทนต์ชิ้นนี้ต้องมี "${s}" ที่ใดที่หนึ่ง`)
  if (e.blocking) {
    ok(out.meta.blocking === true, "ต้องขึ้นสถานะห้ามโพสต์")
    for (const id of e.warningIds || []) ok(out.meta.findings.some(f => f.id === id), `ต้องจับกฎ ${id} ได้`)
  } else {
    ok(out.meta.blocking === false, "ตัวอย่างปกติต้องไม่ติดสถานะห้ามโพสต์")
  }
  if (e.videoScriptLines) {
    const n = out.videoScript.split("\n").filter(Boolean).length
    ok(n === e.videoScriptLines, `สคริปต์ต้องมี ${e.videoScriptLines} บรรทัด (ได้ ${n})`)
  }
}

console.log("\n── ตรวจพฤติกรรมของโมดูล ──")
const base = examples.examples[0].input
ok(runMarketingModel(base).caption === runMarketingModel(base).caption, "อินพุตเดิมต้องได้ผลเดิม")
ok(runMarketingModel({ ...base, province: "ตาก", contentType: "case-study" }).caption !== runMarketingModel(base).caption,
   "เปลี่ยนอินพุตแล้วข้อความต้องเปลี่ยน")
ok(!!runMarketingModel({}).caption, "อินพุตว่างต้องไม่พัง")

// อักษรลาวปนในข้อความไทย
ok(runMarketingModel({ ...base, offer: "ฟังสຽງเจ้าของ" }).meta.findings.some(f => f.id === "confusable_script"),
   "ต้องจับอักษรลาวที่ปนมาได้")

// ตัดพาดหัวไทยต้องไม่ตัดกลางคำ
ok(!/[ัิ-ฺ็-๎]$/.test(splitHeadline("ทำเลนี้กำลังเปลี่ยนไปเรื่อย ๆ อย่างที่หลายคนไม่ทันสังเกต").headline),
   "พาดหัวต้องไม่จบด้วยสระบน/ล่าง")

// วัดความซ้ำ
const c1 = runMarketingModel(base).caption
ok(checkDuplicate(c1, [c1]).similar === true, "ต้องจับแคปชั่นที่ซ้ำกันเป๊ะได้")
ok(checkDuplicate(c1, ["ข้อความอื่นที่ไม่เกี่ยวกันเลยสักนิด"]).similar === false, "ข้อความคนละเรื่องต้องไม่นับว่าซ้ำ")
ok(runMarketingModel(base, { recentCaptions: [c1] }).meta.findings.some(f => f.id === "duplicate_caption"),
   "ส่งโพสต์เก่าเข้ามาแล้วต้องเตือนเรื่องซ้ำ")

// ด่านกันโพสต์พลาด
const guardOpts = { publishableChannels: ["facebook"], requireSchedule: true }
ok(canPublish({ postId: "x", channel: "facebook", status: "approved" }, guardOpts).code === "already_posted", "กันโพสต์ซ้ำ")
ok(canPublish({ channel: "tiktok", status: "approved" }, guardOpts).code === "channel_not_ready", "กันโพสต์ผิดช่อง")
ok(canPublish({ channel: "facebook", status: "draft" }, guardOpts).code === "not_approved", "กันของที่ยังไม่อนุมัติ")
ok(canPublish({ channel: "facebook", status: "approved", caption: "สวัสดี {province}" }, guardOpts).code === "template_hole", "กันช่องว่างค้าง")
ok(canPublish({ channel: "facebook", status: "approved", caption: "ครบแล้ว", scheduledAt: "2026-01-01" }, guardOpts).ok === true, "ของที่ครบต้องผ่าน")

// prompt
const p = getPrompts(base)
ok(["caption", "imageBrief", "videoScript"].every(k => p[k]?.system && p[k]?.user), "ต้องประกอบ prompt ได้ครบสามชุด")
ok(/ห้ามรับประกัน/.test(p.caption.system), "prompt ต้องมีกฎห้ามรับประกัน")
ok(/ห้ามใช้เมื่อ/.test(p.caption.user), "prompt ต้องให้เลือกรูปแบบพร้อมเงื่อนไขห้ามใช้")
ok(!/sk-|API_KEY|Bearer/.test(JSON.stringify(p)), "prompt ต้องไม่มีคีย์หรือความลับใด ๆ")

// ตัวเลือกสำหรับ dropdown
const opts = getOptions()
ok(opts.channels.length >= 4 && opts.contentTypes.length >= 4, "ต้องคืนรายการตัวเลือกให้หน้าเว็บได้")

// เส้นทาง LLM
const fakeLLM = async () => JSON.stringify({
  headline: "ทดสอบพาดหัว", caption: "บรรทัดแรก\n\nข้อมูลนี้เป็นความรู้ทั่วไป แต่ละกรณีต่างกัน",
  cta: "ทักมาได้", hashtags: ["ขายฝาก"], script: "หนึ่ง\nสอง", image_prompt: "a photo, no text",
})
const llm = await runMarketingModelWithLLM(base, { generate: fakeLLM })
ok(llm.meta.generatedBy === "llm" && llm.headline === "ทดสอบพาดหัว", "เส้นทาง LLM ต้องแทนที่ข้อความได้")
const broke = await runMarketingModelWithLLM(base, { generate: async () => { throw new Error("quota") } })
ok(broke.meta.generatedBy === "template" && !!broke.caption, "LLM ล้มต้องตกกลับไปใช้เทมเพลตได้")

console.log(`\n${fail === 0 ? "✅" : "❌"} ผ่าน ${pass} · ไม่ผ่าน ${fail}`)
process.exit(fail === 0 ? 0 : 1)
