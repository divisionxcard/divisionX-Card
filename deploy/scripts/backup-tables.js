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

// ── อ่าน .env.local ถ้ามี (local dev) — ถ้าไม่มี ใช้ process.env (GitHub Actions) ──
const envPath = path.join(__dirname, "..", ".env.local")
if (fs.existsSync(envPath)) {
  // ⚠️ ต้องตัด BOM ทิ้งก่อน — ไฟล์ในเครื่องเจ้าของขึ้นต้นด้วย BOM และบรรทัดแรกคือ
  //    NEXT_PUBLIC_SUPABASE_URL · ไม่ตัดแล้ว regex ไม่ match คีย์แรก แล้วสคริปต์จะบอกว่า
  //    "ไม่พบ Supabase URL/Key" ทั้งที่มีอยู่ (16 ก.ย. 2026 ตอนย้ายงานนี้จาก Actions มาเครื่อง)
  // ⚠️ อย่าใช้ regex `^KEY=(.*)$` กับไฟล์ .env — ใน JavaScript `.` ไม่แมตช์ `\r`
  //    (\r เป็น line terminator เหมือน \n) ไฟล์นี้เป็น CRLF ทุกบรรทัดจึงไม่แมตช์เลย
  //    เหลือแมตช์บรรทัดสุดท้ายบรรทัดเดียวที่ไม่มี \r → สคริปต์บอก "ไม่พบ URL/key" ทั้งที่มีครบ
  //    (เจอจริง 16 ก.ย. 2026 ตอนย้ายงานสำรองข้อมูลจาก GitHub Actions มารันในเครื่อง)
  //    ตัดหัวท้ายด้วย trim แล้วแยกที่ "=" ตัวแรกพอ — แบบเดียวกับ envload.py / sync_local.py
  fs.readFileSync(envPath, "utf8").replace(/^﻿/, "").split(/\r?\n/).forEach(line => {
    line = line.trim()
    const i = line.indexOf("=")
    if (i < 1 || line.startsWith("#")) return
    const key = line.slice(0, i).trim()
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
  })
}

// รองรับทั้งชื่อ env ของ Next.js (local) และชื่อที่ scraper ใช้ (GHA)
// ⚠️ ต้องเป็น service key เท่านั้น — RLS เปิดแล้ว (migration 069) anon key อ่านตารางพวกนี้ไม่ได้
//    ถ้าปล่อยให้ตกไปใช้ anon จะได้ไฟล์สำรองที่ "สำเร็จ" แต่ข้างในว่าง ซึ่งแย่กว่าสำรองล้ม
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) {
  console.error("❌ ไม่พบ Supabase URL/service key — ตั้ง NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (local) หรือ SUPABASE_URL + SUPABASE_SERVICE_KEY (CI)")
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
  // BACKUP_DIR ตั้งจากภายนอกได้ — บอทในเครื่องชี้มาที่ <repo>/backups (นอก deploy/)
  // เพราะตัวอัปขึ้น Vercel ส่งทุกอย่างใน deploy/ ขึ้นเว็บ · บน Actions ไม่ตั้ง = ที่เดิม
  const baseDir = process.env.BACKUP_DIR || path.join(__dirname, "..", "backups")
  const outDir = path.join(baseDir, ts)
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
