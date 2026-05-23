/**
 * /api/wiki-insights — ดึง insights จาก wiki/*.md มาเป็น JSON
 *
 * Source: deploy/wiki/skus/*.md และ wiki/discrepancies/*.md
 * Use case: AI Insight Widget ในหน้า Dashboard
 */

import { NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"

// ── Config ──────────────────────────────────────────────────────────
// Wiki อยู่ที่ root ของ repo (ไม่ใช่ใน deploy/)
const WIKI_DIR = path.resolve(process.cwd(), "..", "wiki")

// บอก Next.js ว่าให้ run บน Node.js runtime (เพราะใช้ fs)
export const runtime = "nodejs"
export const dynamic = "force-dynamic"  // อ่านไฟล์สดทุก request

// ── Frontmatter parser (เบาๆ ไม่ใช้ lib เพิ่ม) ────────────────────
function parseFrontmatter(content) {
  // Normalize CRLF → LF (Windows-edited wiki files come with \r\n)
  const text = content.replace(/\r\n/g, "\n")
  if (!text.startsWith("---")) return { meta: {}, body: text }
  const end = text.indexOf("\n---", 4)
  if (end === -1) return { meta: {}, body: text }

  const yaml = text.slice(4, end).trim()
  const body = text.slice(end + 4).trimStart()

  const meta = {}
  for (const line of yaml.split("\n")) {
    const m = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim()

    // Type coercion
    if (val === "" || val === "null") val = null
    else if (val === "true") val = true
    else if (val === "false") val = false
    else if (/^-?\d+(\.\d+)?$/.test(val)) val = parseFloat(val)

    meta[key] = val
  }
  return { meta, body }
}

// ── Helpers ─────────────────────────────────────────────────────────
async function readWikiDir(subdir) {
  try {
    const dir = path.join(WIKI_DIR, subdir)
    const files = await fs.readdir(dir)
    const results = []
    for (const f of files) {
      if (!f.endsWith(".md") || f.startsWith("_")) continue
      const full = path.join(dir, f)
      const content = await fs.readFile(full, "utf-8")
      const { meta, body } = parseFrontmatter(content)
      results.push({ filename: f.replace(".md", ""), meta, body })
    }
    return results
  } catch (e) {
    console.error(`readWikiDir(${subdir}) failed:`, e.message)
    return []
  }
}

// Extract แค่ "ภาพรวม" section จาก body (สำหรับ preview)
function extractOverview(body) {
  if (!body) return ""
  const match = body.match(/##\s*📝?\s*ภาพรวม\s*\n([\s\S]+?)(?=\n##|\n---|$)/i)
  return match ? match[1].trim().slice(0, 300) : ""
}

// ── GET handler ─────────────────────────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get("limit") || "5", 10)

  // โหลด SKU profiles ทั้งหมด
  const skus = await readWikiDir("skus")
  const skusWithSales = skus.filter(s => s.meta.sales_qty_30d > 0)

  // โหลด discrepancies
  const discrepancies = await readWikiDir("discrepancies")
  // Filter: เฉพาะ 7 วันล่าสุด
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const recentDiscrepancies = discrepancies
    .filter(d => d.meta.date && new Date(d.meta.date) >= sevenDaysAgo)
    .sort((a, b) => new Date(b.meta.date) - new Date(a.meta.date))

  // ── Aggregate insights ────────────────────────────────────────────

  // Top losers (worst trend)
  const losers = [...skusWithSales]
    .filter(s => typeof s.meta.trend_pct === "number")
    .sort((a, b) => a.meta.trend_pct - b.meta.trend_pct)
    .slice(0, limit)
    .map(s => ({
      sku_id: s.meta.sku_id,
      slug: s.meta.slug,
      trend_pct: s.meta.trend_pct,
      sales_qty_30d: s.meta.sales_qty_30d,
      overview: extractOverview(s.body),
    }))

  // Top winners
  const winners = [...skusWithSales]
    .filter(s => typeof s.meta.trend_pct === "number" && s.meta.trend_pct > 0)
    .sort((a, b) => b.meta.trend_pct - a.meta.trend_pct)
    .slice(0, limit)
    .map(s => ({
      sku_id: s.meta.sku_id,
      slug: s.meta.slug,
      trend_pct: s.meta.trend_pct,
      sales_qty_30d: s.meta.sales_qty_30d,
      overview: extractOverview(s.body),
    }))

  // Low margin SKUs (net_margin_pct < 20)
  const lowMargin = skusWithSales
    .filter(s => typeof s.meta.net_margin_pct === "number" && s.meta.net_margin_pct < 20)
    .sort((a, b) => a.meta.net_margin_pct - b.meta.net_margin_pct)
    .slice(0, limit)
    .map(s => ({
      sku_id: s.meta.sku_id,
      slug: s.meta.slug,
      net_margin_pct: s.meta.net_margin_pct,
      net_revenue_30d: s.meta.net_revenue_30d,
    }))

  // Summary totals
  const summary = {
    total_skus: skusWithSales.length,
    total_revenue_30d: skusWithSales.reduce((sum, s) => sum + (s.meta.sales_revenue_30d || 0), 0),
    total_ksher_fees_30d: skusWithSales.reduce((sum, s) => sum + (s.meta.ksher_fees_30d || 0), 0),
    total_net_revenue_30d: skusWithSales.reduce((sum, s) => sum + (s.meta.net_revenue_30d || 0), 0),
    last_updated: skusWithSales
      .map(s => s.meta.last_updated)
      .filter(Boolean)
      .sort()
      .pop() || null,
  }

  return NextResponse.json({
    summary,
    losers,
    winners,
    low_margin: lowMargin,
    recent_discrepancies: recentDiscrepancies.slice(0, 5).map(d => ({
      filename: d.filename,
      date: d.meta.date,
      machine: d.meta.machine,
      severity: d.meta.severity || "info",
    })),
  })
}
