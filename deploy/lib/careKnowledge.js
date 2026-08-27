// ความรู้เรื่องเก็บรักษาการ์ด → บล็อกข้อความสำหรับใส่ใน prompt
//
// ⚠️ ทำไมแยกจาก opcgKnowledge/pkmKnowledge:
//   คลังพวกนั้นดึงจากเว็บทางการของแต่ละค่าย มีเจ้าของข้อมูลชัดเจน
//   เรื่องเก็บรักษาไม่มีแหล่งทางการเดียว จึงเป็นของที่ "คัดเอง" (tasks/card_care.json)
//   และใช้ได้กับทุกค่าย ไม่ผูกกับ franchise
//
// ⚠️ ส่งไปทีละหัวข้อ ไม่ใช่ทั้งไฟล์:
//   ไฟล์มี 6 หัวข้อ ถ้ายัดหมดโมเดลจะเขียนเป็นบทความรวมมิตรที่ไม่มีใครอ่านจบ
//   และคอนเทนต์ทุกชิ้นจะออกมาเหมือนกัน ซึ่งคือปัญหาที่เจ้าของบ่นมาตลอด
import { readFile } from "fs/promises"
import path from "path"

let cache = null

async function load() {
  if (cache) return cache
  const p = path.join(process.cwd(), "tasks", "card_care.json")
  cache = JSON.parse(await readFile(p, "utf-8"))
  return cache
}

/** หัวข้อที่เพิ่งใช้ไป → เลี่ยง ไม่งั้นจะวนเขียนเรื่องความชื้นซ้ำ ๆ */
function pickTopic(topics, avoidKeys = []) {
  const avoid = new Set(avoidKeys.filter(Boolean))
  const pool = topics.filter(t => !avoid.has(t.key))
  const from = pool.length ? pool : topics
  return from[Math.floor(Math.random() * from.length)]
}

/**
 * @param {object} opts
 * @param {string[]} opts.recentTopics คีย์หัวข้อที่เพิ่งเขียนไป
 * @returns {Promise<string>} บล็อกข้อความ หรือ "" ถ้าอ่านไฟล์ไม่ได้
 */
export async function careBlock({ recentTopics = [] } = {}) {
  let data
  try { data = await load() } catch { return "" }
  const topics = data?.topics || []
  if (!topics.length) return ""

  const t = pickTopic(topics, recentTopics)
  const angles = (data.post_angles || []).slice(0, 3)

  return [
    "━━━ ความรู้เรื่องเก็บรักษาการ์ด (ใช้ได้เฉพาะที่เขียนไว้ตรงนี้) ━━━",
    `หัวข้อรอบนี้: ${t.label}`,
    `ทำไมสำคัญ: ${t.why_it_matters}`,
    "ควรทำ:",
    ...(t.do || []).map(x => `- ${x}`),
    "ไม่ควรทำ:",
    ...(t.dont || []).map(x => `- ${x}`),
    "",
    data._thailand_note ? `บริบทไทย: ${data._thailand_note}` : "",
    angles.length ? "มุมที่เล่าได้:\n" + angles.map(a => `- ${a}`).join("\n") : "",
    "",
    "⚠️ ห้ามเพิ่มคำแนะนำที่ไม่ได้เขียนไว้ข้างบน โดยเฉพาะตัวเลขความชื้น/อุณหภูมิ",
    "   และห้ามเอ่ยชื่อยี่ห้อซองหรืออุปกรณ์ — คลังไม่มีข้อมูลนั้น เดาแล้วการ์ดลูกค้าพังจริง",
  ].filter(Boolean).join("\n")
}

export default { careBlock }
