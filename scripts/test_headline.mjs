// ทดสอบตัวตัดพาดหัว กับแคปชั่นจริงทุกชิ้นที่รอตรวจอยู่
//
// รัน: node scripts/test_headline.mjs
// คืน exit 1 ถ้ามีชิ้นไหนพาดหัวยาวเกินเพดาน หรือตัดกลางคำภาษาอังกฤษ
import { readFileSync } from "node:fs"
import { pathToFileURL, fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const load = (p) => import(pathToFileURL(`${ROOT}${p}`).href)
const { createClient } = await load("deploy/node_modules/@supabase/supabase-js/dist/index.cjs")
const { splitHeadline, HEAD_MAX, SUB_MAX, HEAD_HARD } = await load("deploy/lib/headline.js")

const env = Object.fromEntries(
  readFileSync(`${ROOT}deploy/.env.local`, "utf8").split(/\r?\n/)
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: rows } = await db.from("marketing_content")
  .select("id,caption").not("caption", "is", null).order("id")

// คำอังกฤษ/ชื่อชุดที่ห้ามถูกตัดกลาง — ตัดแล้วอ่านเป็นคนละคำ
const KEEP = ["One Piece", "Dragon Ball", "Pokémon", "Pokemon", "DivisionX", "Abyss Eye",
              "Fusion World", "CARD GAME"]

let bad = 0
console.log(`${"id".padEnd(5)}${"พาดหัว".padEnd(34)}ยาว  บรรทัดรอง`)
console.log("─".repeat(96))
for (const r of rows) {
  const { headline, sub } = splitHeadline(r.caption)
  const issues = []
  // เกินเป้าได้ถ้าจำเป็น แต่ห้ามเกินเพดานแข็ง — ยอมยาวดีกว่าตัดกลางคำไทย
  if (headline.length > HEAD_HARD) issues.push(`พาดหัวยาวเกินเพดาน ${headline.length}`)
  if (sub.length > SUB_MAX) issues.push(`บรรทัดรองยาว ${sub.length}`)
  if (!headline) issues.push("พาดหัวว่าง")
  // ตัดกลางชื่อเฉพาะไหม — ชื่อโผล่ในต้นฉบับแต่หายไปครึ่งหนึ่งในผลลัพธ์
  for (const k of KEEP) {
    if (r.caption.includes(k)) {
      const joined = `${headline} ${sub}`
      const half = k.split(" ")[0]
      if (joined.includes(half) && !joined.includes(k)) issues.push(`ตัดกลาง "${k}"`)
    }
  }
  if (issues.length) bad++
  const mark = issues.length ? "❌" : "  "
  console.log(`${mark}${String(r.id).padEnd(3)}${headline.padEnd(34)}${String(headline.length).padStart(3)}  ${sub.slice(0, 40)}`)
  if (issues.length) console.log(`     ↳ ${issues.join(" · ")}`)
}

const lens = rows.map(r => splitHeadline(r.caption).headline.length)
const before = rows.map(r => {
  const c = (r.caption || "").replace(/#\S+/g, "").trim()
  return (c.split("\n").find(x => x.trim()) || "").trim().length
})
const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length)
console.log("\n" + "═".repeat(96))
console.log(`  ก่อนตัด: เฉลี่ย ${avg(before)} ตัวอักษร · ยาวสุด ${Math.max(...before)}`)
console.log(`  หลังตัด: เฉลี่ย ${avg(lens)} ตัวอักษร · ยาวสุด ${Math.max(...lens)}  (เพดาน ${HEAD_MAX})`)
console.log(bad ? `\n❌ มีปัญหา ${bad} ชิ้น` : `\n✅ ผ่านครบ ${rows.length} ชิ้น`)
process.exitCode = bad ? 1 : 0
