// ทดสอบตัวจับ SKU จากแคปชั่น — วัดกับแคปชั่นจริงทุกชิ้นในฐานข้อมูล
//
// รัน: node scripts/test_sku_detect.mjs
// คืน exit 1 ถ้ามีเคสที่จับได้ขัดกับ SKU ที่คนผูกไว้เอง หรือเคส OP13/15/16 พัง
//
// ⚠️ ทำไมต้องรันจริง ไม่ใช่แค่อ่านโค้ด (บทเรียน 27 ส.ค. 2026):
//    ต้นแบบตัวแรกอ่านแล้วถูกทุกบรรทัด แต่ regex ในไฟล์มีอักขระ backspace ปน
//    (heredoc แปลง  ให้) — มันเลยไม่เคย match แม้แต่ครั้งเดียว โดยไม่มี error
import { readFileSync } from "node:fs"
import { pathToFileURL, fileURLToPath } from "node:url"

// อ้างจากตำแหน่งไฟล์เอง ไม่ hardcode path เครื่องใคร
const ROOT = fileURLToPath(new URL("..", import.meta.url))
const load = (p) => import(pathToFileURL(`${ROOT}/${p}`).href)
const { createClient } = await load("deploy/node_modules/@supabase/supabase-js/dist/index.cjs")
const { detectSku } = await load("deploy/lib/skuDetect.js")

const env = Object.fromEntries(
  readFileSync(`${ROOT}/deploy/.env.local`, "utf8").split(/\r?\n/)
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: skus } = await db.from("skus")
  .select("sku_id,name,set_code,franchise").eq("is_active", true)
const { data: rows } = await db.from("marketing_content")
  .select("id,caption,source_sku").not("caption", "is", null).order("id")

const tally = { sure: 0, ambiguous: 0, none: 0 }
let agree = 0, conflict = 0, filled = 0
const lines = []
for (const r of rows) {
  const d = detectSku(r.caption, skus)
  tally[d.status]++
  const got = d.status === "sure" ? d.matches[0].sku_id
            : d.status === "ambiguous" ? `${d.matches.length} ตัว` : "—"
  const mark = { sure: "✅ มั่นใจ", ambiguous: "⚠️  กำกวม", none: "·  ไม่เจอ" }[d.status]
  const head = (r.caption.split("\n").find(l => l.trim()) || "").slice(0, 34)
  lines.push(`${String(r.id).padEnd(5)}${mark.padEnd(11)}${(r.source_sku || "—").padEnd(15)}${got.padEnd(16)}${head}`)
  if (d.status === "sure") {
    if (!r.source_sku) filled++
    else if (d.matches[0].sku_id === r.source_sku) agree++
    else { conflict++; console.log(`  ❌ #${r.id} ผูกไว้ ${r.source_sku} แต่จับได้ ${d.matches[0].sku_id}`) }
  }
}
console.log(`${"id".padEnd(5)}${"ผล".padEnd(11)}${"ผูกไว้".padEnd(15)}${"จับได้".padEnd(16)}พาดหัว`)
console.log("─".repeat(96))
lines.forEach(l => console.log(l))

const n = rows.length
console.log("\n" + "=".repeat(96))
console.log(`  เดาเองได้เลย     ${String(tally.sure).padStart(3)} / ${n}  (${Math.round(tally.sure / n * 100)}%)`)
console.log(`  ต้องถาม (กำกวม)  ${String(tally.ambiguous).padStart(3)} / ${n}  (${Math.round(tally.ambiguous / n * 100)}%)`)
console.log(`  ไม่เจอรหัสเลย    ${String(tally.none).padStart(3)} / ${n}  (${Math.round(tally.none / n * 100)}%)`)
console.log(`\n  ความถูก: ตรงกับที่คนผูกไว้ ${agree} · ขัดกัน ${conflict} · เติมให้ที่ว่าง ${filled}`)

console.log("\n── เคสที่เคยพลาด: OP13/15/16 ต้องเป็นกำกวม ไม่ใช่มั่นใจ ──")
const d8 = detectSku("🎴 เสาร์-อาทิตย์นี้ มาเปิดซองที่ตู้การ์ด DivisionX!\nOP13/15/16 ครบ · เติมสดทุกวัน", skus)
console.log(`  ผล: ${d8.status} · ${d8.matches.map(m => m.sku_id).join(", ")}`)
console.log(`  ${d8.status === "ambiguous" ? "✅ ถูกแล้ว" : "❌ ยังพลาดอยู่"}`)
process.exit(conflict === 0 && d8.status === "ambiguous" ? 0 : 1)
