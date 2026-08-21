// ดูว่าคลังความรู้ One Piece ส่งอะไรให้ตัวเขียนคอนเทนต์บ้าง — ใช้ตรวจด้วยตาว่าถูกไหม
//
//   cd deploy
//   node agents/opcg_preview.mjs --sku "OP 16" --topic "สอนมือใหม่จัดเด็ค"
//   node agents/opcg_preview.mjs --id 25          ← ดึงหัวข้อจริงจากคอนเทนต์ในคิว
//   node agents/opcg_preview.mjs --queue 10       ← ดูคอนเทนต์ล่าสุด 10 ชิ้นรวดเดียว
//
// ต้องรันจากโฟลเดอร์ deploy เพราะตัวโหลดอ่านไฟล์จาก process.cwd()
import { readFile } from "fs/promises"
import path from "path"
import { knowledgeBlock } from "../lib/opcgKnowledge.js"

const argv = process.argv.slice(2)
const arg = (name, def = null) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def
}

// เงื่อนไขเดียวกับใน generate/route.js — ถ้าแก้ที่นั่นต้องแก้ที่นี่ด้วย
const ONE_PIECE = /one\s*piece|วันพีซ|วันพีช/i
const isOnePiece = (sku, topic) => sku?.franchise === "OP" || ONE_PIECE.test(topic || "")

async function env() {
  const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8")
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

async function db(query) {
  const e = await env()
  const res = await fetch(`${e.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}` },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

const SELECT = "id,status,platform,source_sku,source_reason," +
  "idea:marketing_ideas!marketing_content_idea_id_fkey(title,angle,related_sku)"

async function loadContent(limit, id) {
  const q = id
    ? `marketing_content?select=${SELECT}&id=eq.${id}`
    : `marketing_content?select=${SELECT}&order=id.desc&limit=${limit}`
  const rows = await db(q)
  const ids = [...new Set(rows.map(r => r.source_sku || r.idea?.related_sku).filter(Boolean))]
  const skus = ids.length
    ? await db(`skus?select=sku_id,name,franchise,set_code&sku_id=in.(${ids.map(encodeURIComponent).join(",")})`)
    : []
  const bySku = Object.fromEntries(skus.map(s => [s.sku_id, s]))
  return rows.map(r => ({
    id: r.id, status: r.status,
    sku: bySku[r.source_sku || r.idea?.related_sku] || null,
    topic: [r.idea?.title, r.idea?.angle, r.source_reason].filter(Boolean).join(" "),
  }))
}

async function show({ id, status, sku, topic }) {
  const on = isOnePiece(sku, topic)
  const block = on ? await knowledgeBlock({ sku: sku?.sku_id, setCode: sku?.set_code, topic }) : ""
  console.log("─".repeat(78))
  console.log(`#${id ?? "-"}${status ? ` [${status}]` : ""} · sku=${sku?.sku_id ?? "ไม่มี"}` +
    `${sku ? ` (${sku.franchise})` : ""}`)
  console.log(`หัวข้อ: ${topic.slice(0, 130)}`)
  if (!on) return console.log("→ ไม่ใช่ One Piece — ไม่แนบข้อมูลอ้างอิง (ถูกต้อง prompt จะได้ไม่บวม)")
  if (!block) return console.log("→ เป็น One Piece แต่ไม่มีข้อมูลตรงกับหัวข้อนี้ — ส่งค่าว่าง")
  console.log(`→ แนบข้อมูล ${block.length} ตัวอักษร:`)
  console.log(block.split("\n").map(l => l ? "   " + l : "").join("\n"))
}

const id = arg("id")
const queue = arg("queue")
if (id || queue) {
  for (const c of await loadContent(Number(queue) || 10, id)) await show(c)
} else {
  const skuId = arg("sku")
  const sku = skuId ? (await db(`skus?select=sku_id,name,franchise,set_code&sku_id=eq.${encodeURIComponent(skuId)}`))[0] : null
  if (skuId && !sku) console.log(`⚠ ไม่พบ SKU "${skuId}" ในระบบ`)
  await show({ sku, topic: arg("topic", "") })
}
