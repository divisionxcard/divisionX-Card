// Backup ข้อมูลทุกตารางหลักใน Supabase → ไฟล์ JSON (ใช้กู้คืนถ้าจำเป็น)
//
// วิธีรัน:
//   cd deploy
//   node scripts/backup-tables.js
//
// ผลลัพธ์: deploy/backups/<timestamp>/<table>.json

const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

// ── อ่าน .env.local (ไม่ต้องพึ่ง dotenv) ──
const envPath = path.join(__dirname, "..", ".env.local")
if (!fs.existsSync(envPath)) {
  console.error("❌ ไม่พบ .env.local — ต้องมีไฟล์นี้ใน deploy/")
  process.exit(1)
}
fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
})

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPA_URL || !SUPA_KEY) {
  console.error("❌ ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน .env.local")
  process.exit(1)
}
const supabase = createClient(SUPA_URL, SUPA_KEY)

// ── รายการตารางที่จะ backup ──
const TABLES = [
  { name: "sales",              orderBy: "sold_at" },
  { name: "stock_in",           orderBy: "purchased_at" },
  { name: "stock_out",          orderBy: "withdrawn_at" },
  { name: "stock_transfers",    orderBy: "transferred_at" },
  { name: "claims",             orderBy: "claimed_at" },
  { name: "machine_stock",      orderBy: "synced_at" },
  { name: "machine_assignments", orderBy: "created_at" },
  { name: "machines",           orderBy: "machine_id" },
  { name: "skus",               orderBy: "sku_id" },
]

async function fetchAllRows(table, orderBy) {
  const PAGE = 1000
  let all = []
  let from = 0
  while (true) {
    const q = supabase.from(table).select("*").range(from, from + PAGE - 1)
    if (orderBy) q.order(orderBy, { ascending: true, nullsFirst: false })
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const outDir = path.join(__dirname, "..", "backups", ts)
  fs.mkdirSync(outDir, { recursive: true })

  console.log(`\n📦 Backup → ${outDir}\n`)

  const summary = []
  for (const { name, orderBy } of TABLES) {
    try {
      const rows = await fetchAllRows(name, orderBy)
      const file = path.join(outDir, `${name}.json`)
      fs.writeFileSync(file, JSON.stringify(rows, null, 2))
      const size = (fs.statSync(file).size / 1024).toFixed(1)
      console.log(`  ✓ ${name.padEnd(22)} ${String(rows.length).padStart(6)} rows · ${size} KB`)
      summary.push({ table: name, rows: rows.length, file: `${name}.json` })
    } catch (err) {
      console.log(`  ✗ ${name.padEnd(22)} ERROR: ${err.message}`)
      summary.push({ table: name, error: err.message })
    }
  }

  // เขียน summary ไฟล์รวม
  fs.writeFileSync(
    path.join(outDir, "_summary.json"),
    JSON.stringify({ timestamp: ts, tables: summary }, null, 2)
  )
  console.log(`\n✅ เสร็จ — backup อยู่ที่ ${outDir}\n`)
}

main().catch(err => {
  console.error("\n❌ Backup ล้มเหลว:", err.message)
  process.exit(1)
})
